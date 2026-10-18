import './style.css';
import {cloneBlank,normalizeDocument,emptyCount,populatedCount,setCompanyDetail,syncCompanyDetails,deleteParticularField,showMemberField} from './core.js';
import {createDraftStore} from './draft-storage.js';
import {buildPdf,savePdf,exposeDownload,renderPages} from './pdf.js';
import {MAX_MSIC_CODES,MSIC_FIELD,SSM_MSIC_LOOKUP,SSM_MSIC_ROC_PDF,extractMSICCodes,formatMSICCodes,matchesMSIC} from './msic.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let doc=cloneBlank(),generated=null,busy=false;
let selectedDmsCompanyId=null,dmsCompanies=[];

/* On-device drafts are scoped to the authenticated DMS user. */
let draftStore=null,draftScope=null,activeDraftId=crypto.randomUUID();
let draftDirty=false,saveTimer=null,draftsVisible=false,draftError='';
try{draftStore=createDraftStore(window.localStorage);}
catch(err){draftError='On-device storage unavailable: '+err.message;}
function hasDraftContent(){
 return doc.particulars.some(x=>x.type==='field'&&String(x.value||'').trim())||
 Boolean(String(doc.signatureDirector?.name||'').trim()||String(doc.signatureDirector?.nric||'').trim());
}
function draftStatus(message,bad=false){
 const box=$('draft-save-status');
 if(box){box.textContent=message;box.classList.toggle('draft-error',bad);}
}
function getDrafts(){
 if(!draftStore||!draftScope)return [];
 try{return draftStore.list(draftScope);}
 catch(err){draftError=err.message;draftStatus(err.message,true);return [];}
}
function drawDrafts(){
 const entries=getDrafts();
 $('show-drafts').textContent='Saved Drafts ('+entries.length+')';
 $('draft-list-panel').hidden=!draftsVisible;
 if(!draftsVisible)return;
 $('draft-list').innerHTML=entries.map(x=>{
  const date=Number.isFinite(Date.parse(x.updatedAt))?new Date(x.updatedAt).toLocaleString():'Date unknown';
  return '<div class="ar-draft-row"><div><b>'+esc(x.companyName||'Unnamed Annual Return')+'</b><small>'+
   esc((x.registrationNo||'No registration number')+(x.year?' · AR '+x.year:'')+' · Saved '+date)+
   '</small></div><div class="ar-draft-actions"><button type="button" class="button mini" data-resume-draft="'+esc(x.id)+'">Resume</button>'+
   '<button type="button" class="button mini danger" data-delete-draft="'+esc(x.id)+'">Delete</button></div></div>';
 }).join('')||'<p class="status">No saved drafts yet. Fill in the form or choose Save Draft.</p>';
}
function saveCurrentDraft({manual=false}={}){
 if(saveTimer!==null){clearTimeout(saveTimer);saveTimer=null;}
 if(!draftDirty&&!manual)return true;
 if(!hasDraftContent()&&!manual){draftDirty=false;return true;}
 if(!draftStore||!draftScope){
  draftError=draftError||'Draft storage is not ready';
  draftStatus('Draft not saved — '+draftError,true);return false;
 }
 try{
  syncCompanyDetails(doc);
  const result=draftStore.save(draftScope,activeDraftId,normalizeDocument(doc),selectedDmsCompanyId||'');
  draftDirty=false;draftError='';
  draftStatus('Saved on this device · '+new Date(result.updatedAt).toLocaleTimeString()+(doc.company.name?' · '+doc.company.name:''));
  drawDrafts();return true;
 }catch(err){draftError=err.message;draftStatus('Draft not saved — '+err.message,true);return false;}
}
function changedDraft(){
 draftDirty=true;
 draftStatus('Saving changes on this device…');
 if(saveTimer!==null)clearTimeout(saveTimer);
 saveTimer=setTimeout(()=>saveCurrentDraft(),350);
}
function resumeDraft(id,{fromCompany=false}={}){
 if(!draftStore||!draftScope)return false;
 try{
  const snapshot=draftStore.load(draftScope,id);
  if(!snapshot)throw Error('This draft is no longer available.');
  if(!fromCompany&&!saveCurrentDraft())return false;
  const record=getDrafts().find(x=>x.id===id);
  doc=normalizeDocument(snapshot);
  selectedDmsCompanyId=record?.companyId||null;
  activeDraftId=id;draftDirty=false;
  generated=null;$('download-box').hidden=true;
  resetView();
  if(selectedDmsCompanyId&&window.parent!==window)
   window.parent.postMessage({type:'ZHENLI_AR_RESUME_COMPANY',id:selectedDmsCompanyId},window.location.origin);
  draftStatus('Resumed draft: '+(doc.company.name||'Unnamed company')+' · '+(record?.updatedAt?new Date(record.updatedAt).toLocaleString():''));
  drawDrafts();return true;
 }catch(err){draftStatus('Cannot resume draft: '+err.message,true);return false;}
}
function scopeDrafts(scope){
 if(typeof scope!=='string'||!/^(?:standalone|dms:[a-zA-Z0-9_-]{1,130})$/.test(scope))return;
 if(draftScope===scope)return;
 draftScope=scope;selectedDmsCompanyId=null;activeDraftId=crypto.randomUUID();
 doc=cloneBlank();draftDirty=false;
 const latest=getDrafts()[0];
 if(latest)resumeDraft(latest.id,{fromCompany:true});
 else{resetView();drawDrafts();draftStatus('Edits save automatically on this device. Tap Save Draft at any time.');}
}
window.__zhenliFlushDraft=()=>saveCurrentDraft();
window.addEventListener('pagehide',()=>saveCurrentDraft());
function isValidCompanyRecord(value){
 return value&&typeof value==='object'&&
 typeof value.id==='string'&&value.id.length>0&&value.id.length<130&&
 typeof value.name==='string'&&value.name.trim().length>=2&&value.name.length<=300&&
 typeof value.registrationNo==='string'&&value.registrationNo.length<=120;
}
function applyDmsCompany(company){
 if(!isValidCompanyRecord(company))return {ok:false,reason:'Invalid DMS company.'};
 if(!draftScope)return {ok:false,reason:'Draft workspace is still loading.'};
 const name=company.name.trim(),reg=company.registrationNo.trim();
 if(selectedDmsCompanyId===company.id&&doc.company.name===name&&doc.company.no===reg)return {ok:true};
 if(!saveCurrentDraft())return {ok:false,reason:'Unfinished draft could not be saved. Check device storage first.'};
 const previous=getDrafts().find(x=>x.companyId===company.id);
 if(previous){
  if(!resumeDraft(previous.id,{fromCompany:true}))return {ok:false,reason:'Saved company draft could not be read.'};
  doc.company.name=name;doc.company.no=reg;
  for(let i=0;i<doc.particulars.length;i++){
   const field=doc.particulars[i];
   if(field.en==='Company Name'||field.en==='Company Registration No.'){
    field.value=field.en==='Company Name'?name:reg;setCompanyDetail(doc,i,field.value);
   }
  }
  selectedDmsCompanyId=company.id;resetView();changedDraft();
  status('Resumed saved Annual Return for '+name+'.');
  return {ok:true,resumed:true};
 }
 doc=cloneBlank();activeDraftId=crypto.randomUUID();doc.company.name=name;doc.company.no=reg;
 for(let i=0;i<doc.particulars.length;i++){
  const field=doc.particulars[i];
  if(field.type==='field'&&(field.en==='Company Name'||field.en==='Company Registration No.')){
   field.value=field.en==='Company Name'?name:reg;setCompanyDetail(doc,i,field.value);
  }
 }
 selectedDmsCompanyId=company.id;draftDirty=false;
 generated=null;$('download-box').hidden=true;resetView();drawDrafts();
 draftStatus('Company selected. Edits save automatically.');
 status('Company loaded from DMS: '+name+'. Complete the remaining particulars.');
 return {ok:true,resumed:false};
}
if(window.parent!==window){
 window.addEventListener('message',event=>{
  if(event.source!==window.parent||event.origin!==window.location.origin)return;
  if(event.data?.type==='ZHENLI_DMS_AR_WORKSPACE'){scopeDrafts('dms:'+String(event.data.userId||''));return;}
  if(event.data?.type==='ZHENLI_DMS_AR_COMPANY_LIST'){
   const records=Array.isArray(event.data.companies)?event.data.companies:[];
   dmsCompanies=records.slice(0,5000).filter(isValidCompanyRecord).sort((a,b)=>a.name.localeCompare(b.name));
   renderSections();return;
  }
  if(event.data?.type!=='ZHENLI_DMS_AR_SELECT_COMPANY')return;
  let result={ok:false,reason:'Company selection could not be processed.'};
  try{result=applyDmsCompany(event.data.company);}catch(err){result={ok:false,reason:String(err.message||err).slice(0,180)};}
  window.parent.postMessage({type:'ZHENLI_AR_SELECTION_RESULT',id:event.data.company?.id,...result},window.location.origin);
 });
}
$('footer-year').textContent=new Date().getFullYear();
function status(message,error=false){
 const el=$('message');el.textContent=message;el.style.color=error?'#b23b44':'#28768c';
}
function fieldStatus(){
 const total=doc.particulars.filter(x=>x.type==='field').length,done=populatedCount(doc);
 $('count').textContent=done+' / '+total+' filled';
 $('field-status').textContent=emptyCount(doc)+' blank items remain. Empty values appear as NOT PROVIDED / 未提供资料 in PDF.';
}
function signingInputs(){
 const signs=[['name','Confirming director / 签署董事姓名'],['nric','NRIC / Passport / 身份证或护照号码'],['designation','Capacity / 职务']];
 $('signature-fields').innerHTML=signs.map(([key,label])=>'<label class="field-label">'+esc(label)+
  '<input data-sign="'+esc(key)+'" type="text" value="'+esc(doc.signatureDirector[key]||'')+'" placeholder="'+
  (key==='date'?'Leave blank until signed':'Enter signatory details')+'" autocomplete="off"></label>').join('');
}


let msicCatalogue=[],msicState='Loading DOSM MSIC 2008 codes…';
function msicControl(item,index){
 const selected=extractMSICCodes(item.value);
 const imported=String(item.value||'').trim()&&!selected.length?String(item.value):'';
 const full=selected.length>=MAX_MSIC_CODES;
 const chips=selected.map(c=>'<span class="msic-chip"><span><b>'+esc(c.code)+'</b> · '+esc(c.en)+'</span>'+
  '<button type="button" data-msic-remove="'+index+'" data-msic-code="'+esc(c.code)+'" aria-label="Remove '+esc(c.code)+'">×</button></span>').join('');
 const text=selected.length+' / '+MAX_MSIC_CODES+' codes chosen · '+(msicCatalogue.length?msicCatalogue.length+' MSIC descriptions available':esc(msicState));
 return '<div class="msic-selector" data-msic-index="'+index+'">'+
  '<p class="msic-help">'+text+'</p>'+
  '<div class="msic-selected">'+(chips||'<span class="msic-empty">No codes selected</span>')+'</div>'+
  (imported?'<p class="msic-help"><b>Imported previous value (verify):</b> '+esc(imported)+'</p>':'')+
  '<label class="field-label">Search MSIC code or business activity / 搜索行业代码'+
  '<input data-msic-search="'+index+'" class="msic-search" type="search" autocomplete="off" placeholder="e.g. 62010, construction, wholesale" '+(full||!msicCatalogue.length?'disabled':'')+'></label>'+
  '<div class="msic-options" role="listbox"></div>'+
  '<div class="msic-links"><a href="'+SSM_MSIC_LOOKUP+'" target="_blank" rel="noopener noreferrer">SSM BizCodEX official search ↗</a> · '+
  '<a href="'+SSM_MSIC_ROC_PDF+'" target="_blank" rel="noopener noreferrer">SSM ROC code list ↗</a></div>'+
  '<button type="button" class="button mini" data-msic-manual="'+index+'" '+(full?'disabled':'')+'>+ Add verified SSM code manually</button>'+
  '<p class="msic-help">Select up to 3 codes. Searchable descriptions come from DOSM MSIC 2008 Ver. 1, used by SSM BizCodEX. Verify SSM ROC suffix codes from the SSM reference.</p></div>';
}
async function loadMSIC(){
 try{
  const endpoint=import.meta.env.BASE_URL+'msic-2008.json';
  const response=await fetch(endpoint,{cache:'no-store'});
  if(!response.ok)throw Error('Catalogue HTTP '+response.status);
  const data=await response.json();
  if(!Array.isArray(data.codes)||data.codes.length<800)throw Error('Incomplete government MSIC catalogue.');
  msicCatalogue=data.codes;
  msicState='Official DOSM MSIC 2008 catalogue loaded';
 }catch(err){
  msicState='Official MSIC catalogue could not load ('+err.message+'). Use the SSM links or verified manual entry.';
 }
 renderSections();
}
function refreshMSICResults(input){
 const index=Number(input.dataset.msicSearch),block=input.closest('.msic-selector');
 if(!block)return;
 const options=block.querySelector('.msic-options');
 const selected=new Set(extractMSICCodes(doc.particulars[index]?.value).map(x=>x.code));
 const found=matchesMSIC(msicCatalogue,input.value).filter(x=>!selected.has(x.code));
 options.innerHTML=found.map(x=>'<button type="button" class="msic-match" data-msic-add="'+index+'" data-msic-code="'+esc(x.code)+'">'+
  '<b>'+esc(x.code)+'</b><span>'+esc(x.en)+(x.bm?' · '+esc(x.bm):'')+'</span></button>').join('')+
  (input.value.trim().length>=2&&!found.length?'<p class="msic-help">No matching codes found. Try a broader search or check SSM BizCodEX.</p>':'');
}
function changeMSIC(index,code,remove=false,manualDesc=''){
 const item=doc.particulars[index];if(!item||!MSIC_FIELD.test(item.en))return;
 let selected=extractMSICCodes(item.value);
 if(remove){selected=selected.filter(x=>x.code!==code);}
 else{
  const entry=msicCatalogue.find(x=>x.code===code);
  if(selected.length>=MAX_MSIC_CODES)return status('You may select a maximum of three MSIC codes.',true);
  if(selected.some(x=>x.code===code))return;
  if(!entry&&!manualDesc)return status('Verify the code using official SSM reference first.',true);
  selected.push({code,en:entry?.en||manualDesc});
 }
 item.value=formatMSICCodes(selected);
 renderSections();changedDraft();
 status((remove?'Removed ':'Selected ')+code+'. '+selected.length+' of 3 MSIC codes.');
}

const OPTIONS=[
 {test:/^Member Type$/i,values:['Individual','Body Corporate']},
 {test:/^(?:Classes of Shares Issued|Class of Shares)$/i,values:['Ordinary','Preference','Ordinary & Preference']},
 {test:/^(?:Type of Shares(?: Issued)?|Consideration for Shares|Shares Issued for Cash or Otherwise)$/i,values:['Cash','Otherwise than cash','Cash & Otherwise than cash']},
 {test:/^Type of Beneficial Ownership$/i,values:['Direct','Indirect','Direct & Indirect']}
];
const CRITERIA={
 A:'Holds directly or indirectly not less than 20% of the company shares',
 B:'Holds directly or indirectly not less than 20% of the voting shares',
 C:'Has ultimate effective control (formal or informal) over the company, directors or management',
 D:'Can directly or indirectly appoint or remove directors who hold a majority of directors’ meeting voting rights',
 E:'Is a member of the company and, under an agreement with another member, controls alone a majority of the voting rights in the company'
};
const ADDONS=[
 {id:'charge',section:/REGISTERED CHARGES/i,heading:/^REGISTERED CHARGE \d+$/i,label:'Registered Charge'},
 {id:'director',section:/DIRECTORS, COMPANY SECRETARY/i,heading:/^DIRECTOR \d+$/i,label:'Director'},
 {id:'member',section:/PARTICULARS OF MEMBERS/i,heading:/^MEMBER \d+$/i,label:'Member'},
 {id:'bo',section:/CURRENT BENEFICIAL OWNERS/i,heading:/^BENEFICIAL OWNER \d+$/i,label:'Beneficial Owner'}
];
function addRecord(kind){
 const rule=ADDONS.find(x=>x.id===kind);if(!rule)return;
 let section=-1,until=doc.particulars.length;
 for(let i=0;i<doc.particulars.length;i++){
  const p=doc.particulars[i];
  if(p.type==='section'&&rule.section.test(p.en||'')){section=i;continue;}
  if(section>=0&&i>section&&p.type==='section'){until=i;break;}
 }
 if(section<0){status('Could not find the '+rule.label+' section in this imported script.',true);return;}
 const headings=[];
 for(let i=section+1;i<until;i++)if(doc.particulars[i].type==='heading'&&rule.heading.test(doc.particulars[i].en||''))headings.push(i);
 if(!headings.length){status('No '+rule.label+' template found. Import a current Annual Return script.',true);return;}
 const start=headings[0],last=headings[headings.length-1];
 let end=until;
 for(let i=last+1;i<until;i++)if(doc.particulars[i].type==='heading'){end=i;break;}
 let templateEnd=headings[1]||end;
 if(kind==='charge'){
  const summary=doc.particulars.findIndex((x,i)=>i>start&&i<templateEnd&&x.type==='field'&&/^Number of Registered Charges$/i.test(x.en));
  if(summary>=0)templateEnd=summary;
 }
 const next=doc.particulars.slice(start,templateEnd).map(x=>({...x,value:''}));
 // New entry is cloned from the first record's field structure, not the last (which may differ).
 const nextNumber=headings.reduce((n,i)=>Math.max(n,Number((doc.particulars[i].en||'').match(/\d+$/)?.[0]||0)),0)+1;
 next[0].en=rule.label.toUpperCase()+' '+nextNumber;
 next[0].cn=(next[0].cn||'').replace(/\d+$/,String(nextNumber));
 // Insert directly after the last entry in its own list, before charge totals
 // or secretary/auditor particulars. Do not displace unrelated records.
 let insertAt=end;
 if(kind==='charge'){
  const totalIndex=doc.particulars.findIndex((x,i)=>i>last&&i<until&&x.type==='field'&&x.en==='Number of Registered Charges');
  if(totalIndex>=0)insertAt=totalIndex;
 }
 if(doc.particulars.length+next.length>1200)return status('Too many review items; remove unnecessary entries first.',true);
 doc.particulars.splice(insertAt,0,...next);
 renderSections();changedDraft();status('Added '+rule.label+' '+nextNumber+'. All its fields are blank.');
}
function companyNameControl(item,index){
 const value=String(item.value||'');
 if(!dmsCompanies.length||window.parent===window)
  return '<textarea data-item="'+index+'" rows="2" spellcheck="false" placeholder="Enter company name…">'+esc(value)+'</textarea>';
 // The dropdown contains the complete DMS company list; no separate name or registration search.
 // This is populated only from private data sent by the authenticated DMS parent.
 const options=dmsCompanies.map(c=>'<option value="'+esc(c.id)+'" '+(selectedDmsCompanyId===c.id?'selected':'')+'>'+
  esc(c.name)+(c.registrationNo?' · '+esc(c.registrationNo):'')+'</option>').join('');
 return '<div class="ar-name-selector">'+
  '<label class="field-label">All Documents companies ('+dmsCompanies.length+')'+
  '<select class="choice-select ar-company-full-list" data-company-select="'+index+'">'+
  '<option value="">— Select a company from the complete list —</option>'+options+'</select></label>'+
  '<p class="msic-help">All '+dmsCompanies.length+' DMS companies are available in the dropdown. Previously saved drafts resume when you select their company.</p></div>';
}
function addCustomField({sectionIndex=null,headingIndex=null}={}){
 if(doc.particulars.length>=1200)return status('The Annual Return field limit is reached.',true);
 const en=(prompt('New field label in English:')||'').trim();if(!en)return;
 const cn=(prompt('New field label in Chinese (optional):')||'').trim();
 const field={type:'field',en:en.slice(0,350),cn:cn.slice(0,350),value:''};
 let pos=doc.particulars.length;
 if(headingIndex!==null){
  if(doc.particulars[headingIndex]?.type!=='heading')return status('The selected member record no longer exists.',true);
  pos=headingIndex+1;
  while(pos<doc.particulars.length&&doc.particulars[pos].type==='field')pos++;
 }else if(sectionIndex!==null){
  if(doc.particulars[sectionIndex]?.type!=='section')return status('Section no longer exists.',true);
  pos=sectionIndex+1;
  while(pos<doc.particulars.length&&doc.particulars[pos].type!=='section')pos++;
 }
 doc.particulars.splice(pos,0,field);
 renderSections();changedDraft();
 status('Added "'+field.en+'" to '+(headingIndex!==null?'the selected member record':'the selected section')+'. It will appear in the PDF.');
}
function removeReviewField(index){
 const item=doc.particulars[index];if(!item||item.type!=='field')return;
 if(['Company Name','Company Registration No.'].includes(item.en)){
  status(item.en+' is required for PDF generation and cannot be deleted.',true);return;
 }
 if(!confirm('Delete "'+item.en+'" and its value from this Annual Return form and generated PDF?'))return;
 try {deleteParticularField(doc,index);}catch(err){status(err.message,true);return;}
 renderSections();changedDraft();status('Removed field: '+item.en+'. Change saved in your draft.');
}

function controlsFor(item,index){
 const value=String(item.value||''),common=' data-item="'+index+'"';
 if(item.en==='Company Name')return companyNameControl(item,index);
 if(MSIC_FIELD.test(item.en))return msicControl(item,index);
 if(/^Criteria of Beneficial Ownership$/i.test(item.en)){
  const selected=[...value.matchAll(/(?:criteria\s*)?([ABCDE])(?=\b|[,;/\s])/gi)].map(m=>m[1].toUpperCase()); 
  return '<div class="criteria-options">'+Object.entries(CRITERIA).map(([key,desc])=>'<label class="criteria-option"><input type="checkbox" data-criteria="'+index+'" value="'+key+'" '+(selected.includes(key)?'checked':'')+'><span><b>Criteria '+key+'</b> — '+esc(desc)+'</span></label>').join('')+'</div>';
 }
 const option=OPTIONS.find(o=>o.test.test(item.en));
 if(option){
  // Keep imported legacy values visible rather than discarding data.
  const values=option.values.includes(value)||!value?option.values:[value,...option.values];
  return '<select'+common+' class="choice-select"><option value="">— Select —</option>'+values.map(v=>'<option value="'+esc(v)+'" '+(v===value?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select>';
 }
 return '<textarea'+common+' rows="'+(value.length>220?5:2)+'" spellcheck="false" placeholder="Enter confirmed information…">'+esc(value)+'</textarea>';
}

function groups(){
 const all=[];let group=null;
 doc.particulars.forEach((item,index)=>{
  if(item.type==='section'){group={index,title:item.en,cn:item.cn,items:[]};all.push(group);}
  else {if(!group){group={index:-1,title:'COMPANY PARTICULARS',cn:'公司资料',items:[]};all.push(group);}group.items.push({index,item});}
 });
 return all;
}
function renderSections(){
 const q=$('search').value.trim().toLowerCase(),onlyBlank=$('incomplete').checked;
 $('particulars').innerHTML=groups().map((group,i)=>{
  const rows=group.items.filter(({item,index})=>{
   if(!showMemberField(doc.particulars,index))return false;
   const matches=!q||[item.en,item.cn,item.value,group.title].some(x=>String(x||'').toLowerCase().includes(q));
   return matches&&(!onlyBlank||item.type==='field'&&!String(item.value||'').trim());
  });
  if(!rows.length&&(q||onlyBlank))return '';
  const body=rows.map(({index,item})=>{
   if(item.type==='heading')return '<div class="heading-entry">'+esc(item.en)+' <small>'+esc(item.cn)+'</small>'+(/^MEMBER \d+$/i.test(item.en)?'<button type="button" class="button mini ar-add-member-field" data-add-to-member="'+index+'">+ Add member field</button>':'')+'</div>';
   return '<div class="field-entry '+(item.value?'':'blank')+'"><div class="title">'+esc(item.en||'Untitled')+
    '<small>'+esc(item.cn||'')+'</small>'+(!['Company Name','Company Registration No.'].includes(item.en)?'<button type="button" class="ar-delete-field" data-delete-field="'+index+'">Delete field</button>':'')+'</div>'+controlsFor(item,index)+'</div>';
  }).join('');
  return '<details class="ar-section" '+(i===0||q||onlyBlank?'open':'')+'><summary class="section-header"><span>'+
   esc(group.title)+'<small>'+esc(group.cn)+'</small></span><span class="pill">'+
   rows.filter(x=>x.item.type==='field').length+' fields</span></summary><div class="section-fields">'+body+
   (group.index>=0?'<div class="addon-bar">'+ADDONS.filter(x=>x.section.test(group.title)).map(x=>'<button class="button mini" type="button" data-add-record="'+x.id+'">+ Add '+x.label+'</button>').join('')+'<button class="button mini" type="button" data-add-to-section="'+group.index+'">+ Add field to this section</button></div>':'')+'</div></details>';
 }).join('')||'<p class="status">No matching fields. Clear search or disable blank-only filter.</p>';
 fieldStatus();
}
function resetView(){signingInputs();$('search').value='';$('incomplete').checked=false;renderSections();}
function setBusy(flag){busy=flag;$('generate-pdf').disabled=flag;$('save-draft').disabled=flag;}
async function generate(){
 if(busy)return;
 if(!String(doc.company.name).trim()||!String(doc.company.no).trim())
  return status('Enter company name and registration number first.',true);
 if(!confirm('Generate a CLIENT REVIEW PDF? Verify company details and statutory particulars before sending.'))return;
 setBusy(true);
 try{
  syncCompanyDetails(doc);
  const {blob,filename,pages}=await buildPdf(doc,status);
  generated={blob,filename};exposeDownload(blob,filename);
  status('PDF generated ('+pages+' pages). Opening Android Save As picker…');
  try{
    const note=await savePdf(blob,filename);
    status('Generated '+pages+' pages: '+filename+'. '+note);
  }catch(error){
    status('PDF generated but not saved: '+error.message+'. Tap Save PDF to Files to try again without regenerating.',true);
  }
 }catch(error){status('PDF generation failed: '+error.message+'. Try again after closing other apps to free memory.',true);}
 finally{setBusy(false);}
}
$('blank').addEventListener('click',()=>{
 if(!saveCurrentDraft())return status('Your unfinished draft could not be saved; check device storage first.',true);
 if(!confirm('Start a new blank Annual Return? Your previous draft remains in Saved Drafts.'))return;
 doc=cloneBlank();selectedDmsCompanyId=null;activeDraftId=crypto.randomUUID();draftDirty=false;
 resetView();generated=null;$('download-box').hidden=true;drawDrafts();
 draftStatus('New blank form. Edits save automatically.');status('Blank bilingual form ready.');
});
$('save-draft').addEventListener('click',()=>{
 if(saveCurrentDraft({manual:true}))status('Annual Return draft saved on this device. Use Saved Drafts to resume it.');
 else status('Draft not saved. Check the storage notice.',true);
});
$('show-drafts').addEventListener('click',()=>{draftsVisible=!draftsVisible;drawDrafts();});
$('close-drafts').addEventListener('click',()=>{draftsVisible=false;drawDrafts();});
$('draft-list').addEventListener('click',e=>{
 const resume=e.target.closest('[data-resume-draft]');
 if(resume){if(resumeDraft(resume.dataset.resumeDraft)){draftsVisible=false;drawDrafts();status('Saved draft restored.');}return;}
 const del=e.target.closest('[data-delete-draft]');if(!del)return;
 const id=del.dataset.deleteDraft;
 if(!confirm('Delete this saved draft from this device? This cannot be undone.'))return;
 try{
  if(!draftStore?.remove(draftScope,id))throw Error('Draft no longer exists.');
  if(activeDraftId===id)activeDraftId=crypto.randomUUID();
  drawDrafts();draftStatus('Draft deleted from this device.');
 }catch(err){draftStatus('Delete failed: '+err.message,true);}
});
$('search').addEventListener('input',renderSections);
$('incomplete').addEventListener('change',renderSections);
$('signature-fields').addEventListener('input',e=>{const k=e.target.dataset.sign;if(k){doc.signatureDirector[k]=e.target.value;changedDraft();}});
$('particulars').addEventListener('input',e=>{
 if(e.target.dataset.msicSearch!==undefined){refreshMSICResults(e.target);return;}
 const index=e.target.dataset.item;
 if(index!==undefined&&doc.particulars[+index]){
  doc.particulars[+index].value=e.target.value;
  setCompanyDetail(doc,Number(index),e.target.value);
  e.target.closest('.field-entry')?.classList.toggle('blank',!e.target.value.trim());
  fieldStatus();
 }
});
$('particulars').addEventListener('change',e=>{
 const el=e.target;
 if(el.dataset.companySelect!==undefined){
  const id=el.value;
  if(id&&window.parent!==window)window.parent.postMessage({type:'ZHENLI_AR_SELECT_COMPANY_REQUEST',id},window.location.origin);
  return;
 }
 if(el.dataset.item!==undefined&&doc.particulars[Number(el.dataset.item)]?.en==='Member Type'){renderSections();changedDraft();return;}
 if(el.dataset.criteria!==undefined){
  const i=Number(el.dataset.criteria);
  const values=[...$('particulars').querySelectorAll('input[data-criteria="'+i+'"]:checked')].map(x=>x.value);
  doc.particulars[i].value=values.map(x=>'Criteria '+x).join(', ');
  el.closest('.field-entry')?.classList.toggle('blank',!values.length);
  fieldStatus();
 }
});
$('particulars').addEventListener('click',e=>{
 const del=e.target.closest('[data-delete-field]');
 if(del){removeReviewField(Number(del.dataset.deleteField));return;}
 const select=e.target.closest('[data-msic-add]');
 if(select){changeMSIC(Number(select.dataset.msicAdd),select.dataset.msicCode);return;}
 const remove=e.target.closest('[data-msic-remove]');
 if(remove){changeMSIC(Number(remove.dataset.msicRemove),remove.dataset.msicCode,true);return;}
 const manual=e.target.closest('[data-msic-manual]');
 if(manual){
  const code=(prompt('Enter a code verified against the official SSM ROC/MSIC list (5 digits; ROC suffix e/i/u allowed):')||'').trim().toLowerCase();
  if(!code)return;
  if(!/^\d{5}(?:[eiu])?$/.test(code)){status('Invalid code format. Use five digits, optionally followed by an SSM ROC e/i/u suffix.',true);return;}
  const known=msicCatalogue.find(x=>x.code===code);
  const desc=known?.en||(prompt('Description exactly as shown in the official SSM reference:')||'').trim();
  if(!desc)return;
  changeMSIC(Number(manual.dataset.msicManual),code,false,desc.slice(0,250));return;
 }
 const memberField=e.target.closest('[data-add-to-member]');if(memberField){addCustomField({headingIndex:Number(memberField.dataset.addToMember)});return;}
 const sectionField=e.target.closest('[data-add-to-section]');if(sectionField){addCustomField({sectionIndex:Number(sectionField.dataset.addToSection)});return;}
 const add=e.target.closest('[data-add-record]');if(add)addRecord(add.dataset.addRecord);
});
$('add-field').addEventListener('click',()=>addCustomField());
$('add-section').addEventListener('click',()=>{
 const en=prompt('Section heading in English:');if(!en?.trim())return;
 const cn=prompt('Chinese section heading (optional):')||'';
 doc.particulars.push({type:'section',en:en.trim().slice(0,350),cn:cn.trim().slice(0,350),value:''});
 renderSections();changedDraft();status('New section added. Click + Add field to add data.');
});
$('clear-values').addEventListener('click',()=>{
 if(!confirm('Clear all entered values? Your current draft will save the cleared fields.'))return;
 doc.particulars.forEach(x=>{if(x.type==='field')x.value='';});
 for(const k of Object.keys(doc.company))doc.company[k]='';
 for(const k of Object.keys(doc.signatureDirector))doc.signatureDirector[k]='';
 resetView();changedDraft();status('All values cleared; bilingual labels preserved.');
});
$('generate-pdf').addEventListener('click',generate);
$('share-pdf').addEventListener('click',async()=>{
 if(!generated)return status('Generate a PDF first.',true);
 try{status(await savePdf(generated.blob,generated.filename));}
 catch(error){status('PDF has not been saved: '+error.message+'. Tap Save PDF to Files to retry.',true);}
});
$('print').addEventListener('click',()=>{
 if(!doc.company.name.trim())return status('Enter company name first.',true);
 renderPages(doc);window.print();setTimeout(()=>{$('pdf-stage').textContent='';},5000);
});
window.addEventListener('afterprint',()=>{$('pdf-stage').textContent='';});
resetView();
if(window.parent===window)scopeDrafts('standalone');
status('V1.8 loaded — Save Draft, Saved Drafts and automatic saving of unfinished work are enabled.');
void loadMSIC();
if(window.parent!==window)window.parent.postMessage({type:'ZHENLI_AR_READY'},window.location.origin);
