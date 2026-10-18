import './style.css';
import {Capacitor} from '@capacitor/core';
import {Filesystem,Directory} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {cloneBlank,importAnnualReturnText,normalizeDocument,emptyCount,populatedCount,setCompanyDetail,syncCompanyDetails} from './core.js';
import {buildPdf,savePdf,exposeDownload,renderPages} from './pdf.js';
import {MAX_MSIC_CODES,MSIC_FIELD,SSM_MSIC_LOOKUP,SSM_MSIC_ROC_PDF,extractMSICCodes,formatMSICCodes,matchesMSIC} from './msic.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let doc=cloneBlank(),generated=null,busy=false;

let selectedDmsCompanyId=null,dmsCompanies=[];
function isValidCompanyRecord(value){
 return value&&typeof value==='object'&&
 typeof value.id==='string'&&value.id.length>0&&value.id.length<130&&
 typeof value.name==='string'&&value.name.trim().length>=2&&value.name.length<=300&&
 typeof value.registrationNo==='string'&&value.registrationNo.length<=120;
}
function hasUnsavedAnnualReturnData(){
 return doc.particulars.some(x=>x.type==='field'&&String(x.value||'').trim()!=='')||
   Boolean(doc.signatureDirector?.name||doc.signatureDirector?.nric);
}
function applyDmsCompany(company){
 if(!isValidCompanyRecord(company))return {ok:false,reason:'Invalid company record from DMS.'};
 const name=company.name.trim(),registrationNo=company.registrationNo.trim();
 if(selectedDmsCompanyId===company.id&&doc.company.name===name&&doc.company.no===registrationNo)
   return {ok:true};
 const changedCompany=Boolean(doc.company.name&&doc.company.name!==name)||
   Boolean(selectedDmsCompanyId&&selectedDmsCompanyId!==company.id);
 if((changedCompany||hasUnsavedAnnualReturnData())&&!confirm(
   'Switch to '+name+' from DMS Documents? This starts a new Annual Return form and discards unsaved particulars. Export editable JSON first if you need the current draft.'
 ))return {ok:false,reason:'Selection cancelled to preserve the current draft.'};
 // A new company must never inherit another company's directors, shareholdings,
 // charges or beneficial owner particulars. Start with a fresh clean template.
 doc=cloneBlank();
 doc.company.name=name;doc.company.no=registrationNo;
 for(let i=0;i<doc.particulars.length;i++){
   if(doc.particulars[i].type!=='field')continue;
   if(doc.particulars[i].en==='Company Name'){doc.particulars[i].value=name;setCompanyDetail(doc,i,name);}
   else if(doc.particulars[i].en==='Company Registration No.'){doc.particulars[i].value=registrationNo;setCompanyDetail(doc,i,registrationNo);}
 }
 selectedDmsCompanyId=company.id;
 generated=null;$('download-box').hidden=true;
 resetView();
 status('Company loaded from DMS Documents: '+name+(registrationNo?' ('+registrationNo+')':' — registration number missing; please enter it before PDF generation')+'. Complete and verify all remaining statutory particulars.');
 return {ok:true};
}
if(window.parent!==window){
 window.addEventListener('message',event=>{
  if(event.source!==window.parent||event.origin!==window.location.origin)return;
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
 renderSections();
 status((remove?'Removed ':'Selected ')+code+'. '+selected.length+' of 3 MSIC codes.');
}

const OPTIONS=[
 {test:/^(?:Classes of Shares Issued|Class of Shares)$/i,values:['Ordinary','Preference','Ordinary & Preference']},
 {test:/^(?:Type of Shares(?: Issued)?|Consideration for Shares|Shares Issued for Cash or Otherwise)$/i,values:['Cash','Otherwise than cash','Cash & Otherwise than cash']},
 {test:/^Type of Beneficial Ownership$/i,values:['Direct','Indirect','Direct & Indirect']}
];
const CRITERIA={
 A:'Holds directly or indirectly not less than 20% of the company shares',
 B:'Holds directly or indirectly not less than 20% of the voting shares',
 C:'Has ultimate effective control (formal or informal) over the company, directors or management',
 D:'Can directly or indirectly appoint or remove directors who hold a majority of directors’ meeting voting rights'
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
 renderSections();status('Added '+rule.label+' '+nextNumber+'. All its fields are blank.');
}

function companyOptions(search){
 const q=String(search||'').trim().toLowerCase();
 const rows=(q?dmsCompanies.filter(c=>(c.name+' '+c.registrationNo).toLowerCase().includes(q)):dmsCompanies).slice(0,15);
 return rows.length?rows.map(c=>'<button type="button" class="ar-name-option" data-dms-company-id="'+esc(c.id)+'">'+
  '<strong>'+esc(c.name)+'</strong><small>'+esc(c.registrationNo||'Registration number not recorded')+'</small></button>').join(''):
  '<span class="msic-help">No matching Documents company. Adjust your search or type the company name manually.</span>';
}
function companyNameControl(item,index){
 const value=String(item.value||'');
 if(!dmsCompanies.length||window.parent===window)return '<textarea data-item="'+index+'" rows="2" spellcheck="false" placeholder="Enter company name…">'+esc(value)+'</textarea>';
 return '<div class="ar-name-selector"><label class="field-label">Search existing DMS Documents companies'+
  '<input type="search" data-item="'+index+'" data-company-lookup="'+index+'" value="'+esc(value)+'" autocomplete="off" placeholder="Search company name or registration number"></label>'+
  '<div class="ar-name-options" data-company-results="'+index+'">'+companyOptions(value)+'</div>'+
  '<p class="msic-help">Choose an existing company to fill its registered name and number. Switching companies starts a fresh review, so export JSON first.</p></div>';
}
function removeReviewField(index){
 const item=doc.particulars[index];if(!item||item.type!=='field')return;
 if(['Company Name','Company Registration No.'].includes(item.en)){
  status(item.en+' is required for PDF generation and cannot be deleted.',true);return;
 }
 if(!confirm('Delete "'+item.en+'" and its value from this Annual Return form and generated PDF?'))return;
 doc.particulars.splice(index,1);renderSections();status('Removed field: '+item.en+'. Export JSON to preserve this customisation.');
}

function controlsFor(item,index){
 const value=String(item.value||''),common=' data-item="'+index+'"';
 if(item.en==='Company Name')return companyNameControl(item,index);
 if(MSIC_FIELD.test(item.en))return msicControl(item,index);
 if(/^Criteria of Beneficial Ownership$/i.test(item.en)){
  const selected=[...value.matchAll(/(?:criteria\s*)?([ABCD])(?=\b|[,;/\s])/gi)].map(m=>m[1].toUpperCase()); 
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
  const rows=group.items.filter(({item})=>{
   const matches=!q||[item.en,item.cn,item.value,group.title].some(x=>String(x||'').toLowerCase().includes(q));
   return matches&&(!onlyBlank||item.type==='field'&&!String(item.value||'').trim());
  });
  if(!rows.length&&(q||onlyBlank))return '';
  const body=rows.map(({index,item})=>{
   if(item.type==='heading')return '<div class="heading-entry">'+esc(item.en)+' <small>'+esc(item.cn)+'</small></div>';
   return '<div class="field-entry '+(item.value?'':'blank')+'"><div class="title">'+esc(item.en||'Untitled')+
    '<small>'+esc(item.cn||'')+'</small>'+(!['Company Name','Company Registration No.'].includes(item.en)?'<button type="button" class="ar-delete-field" data-delete-field="'+index+'">Delete field</button>':'')+'</div>'+controlsFor(item,index)+'</div>';
  }).join('');
  return '<details class="ar-section" '+(i===0||q||onlyBlank?'open':'')+'><summary class="section-header"><span>'+
   esc(group.title)+'<small>'+esc(group.cn)+'</small></span><span class="pill">'+
   rows.filter(x=>x.item.type==='field').length+' fields</span></summary><div class="section-fields">'+body+
   (ADDONS.some(x=>x.section.test(group.title))?'<div class="addon-bar">'+ADDONS.filter(x=>x.section.test(group.title)).map(x=>'<button class="button mini" type="button" data-add-record="'+x.id+'">+ Add '+x.label+'</button>').join('')+'</div>':'')+'</div></details>';
 }).join('')||'<p class="status">No matching fields. Clear search or disable blank-only filter.</p>';
 fieldStatus();
}
function resetView(){signingInputs();$('search').value='';$('incomplete').checked=false;renderSections();}
function setBusy(flag){busy=flag;$('generate-pdf').disabled=flag;$('export-json').disabled=flag;}
async function importFile(file){
 if(!file)return;
 try{
  if(file.size>3_000_000)throw Error('Selected file exceeds 3 MB. Choose a company-specific .gs/.json file.');
  const incoming=importAnnualReturnText(await file.text(),file.name);
  if(!confirm('Load '+file.name+'? Unsaved edits in the current form will be replaced.'))return;
  doc=incoming;selectedDmsCompanyId=null;resetView();$('download-box').hidden=true;generated=null;
  status('Imported '+file.name+' locally. Review '+populatedCount(doc)+' populated fields before generating the PDF.');
 }catch(error){status('Import failed: '+error.message,true);}
}
async function saveJson(){
 const filename=(doc.company.name||'ZHENLI_Annual_Return').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,80)+'_Review_Draft.json';
 const payload=JSON.stringify(normalizeDocument(doc),null,2);
 const blob=new Blob([payload],{type:'application/json'});
 if(Capacitor.isNativePlatform()){
  const data=await new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(String(reader.result).split(',')[1]);
   reader.onerror=()=>reject(Error('Could not prepare JSON export.'));
   reader.readAsDataURL(blob);
  });
  const {uri}=await Filesystem.writeFile({directory:Directory.Cache,path:'annual-return/'+Date.now()+'-'+filename,data,recursive:true});
  await Share.share({title:filename,url:uri,dialogTitle:'Save Annual Return JSON'});
  status('Select Files or Drive to save your editable JSON draft.');return;
 }
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),120000);status('Download requested: '+filename+'. Check Brave Downloads.');
}
async function generate(){
 if(busy)return;
 if(!String(doc.company.name).trim()||!String(doc.company.no).trim())
  return status('Enter company name and registration number first.',true);
 if(!confirm('Generate a CLIENT REVIEW PDF? Verify company details and missing statutory particulars before sending.'))return;
 setBusy(true);
 try{
  syncCompanyDetails(doc);
  const {blob,filename,pages}=await buildPdf(doc,status);
  generated={blob,filename};exposeDownload(blob,filename);
  status('PDF generated ('+pages+' pages, '+Math.ceil(blob.size/1024)+' KB). Opening Android Save As…');
  try{
    const note=await savePdf(blob,filename);
    status('Generated '+pages+' pages: '+filename+'. '+note);
  }catch(saveError){
    status('PDF successfully generated, but not saved: '+saveError.message+'. Tap Save PDF to Files to try again. No PDF data was lost.',true);
  }
 }catch(error){status('PDF generation failed: '+error.message+'. Try a smaller draft or check available device memory.',true);}
 finally{setBusy(false);}
}
$('import-file').addEventListener('change',e=>{const file=e.target.files?.[0];e.target.value='';void importFile(file);});
$('blank').addEventListener('click',()=>{
 if(!confirm('Start a blank form? Unsaved edits will be discarded.'))return;
 doc=cloneBlank();resetView();generated=null;$('download-box').hidden=true;status('Blank bilingual form ready.');
});
$('export-json').addEventListener('click',()=>saveJson().catch(e=>status('JSON export failed: '+e.message,true)));
$('search').addEventListener('input',renderSections);
$('incomplete').addEventListener('change',renderSections);
$('signature-fields').addEventListener('input',e=>{const k=e.target.dataset.sign;if(k)doc.signatureDirector[k]=e.target.value;});
$('particulars').addEventListener('input',e=>{
 if(e.target.dataset.companyLookup!==undefined){
  const results=e.target.closest('.ar-name-selector')?.querySelector('[data-company-results]');
  if(results)results.innerHTML=companyOptions(e.target.value);
  selectedDmsCompanyId=null;
 }
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
 const company=e.target.closest('[data-dms-company-id]');
 if(company){
  if(window.parent!==window)window.parent.postMessage({type:'ZHENLI_AR_SELECT_COMPANY_REQUEST',id:company.dataset.dmsCompanyId},window.location.origin);
  return;
 }
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
 const add=e.target.closest('[data-add-record]');if(add)addRecord(add.dataset.addRecord);
});
$('add-field').addEventListener('click',()=>{
 const en=prompt('English field label:');if(!en?.trim())return;
 const cn=prompt('Chinese field label (optional):')||'';
 doc.particulars.push({type:'field',en:en.trim().slice(0,350),cn:cn.trim().slice(0,350),value:''});
 renderSections();status('New field added to the last section.');
});
$('add-section').addEventListener('click',()=>{
 const en=prompt('Section heading in English:');if(!en?.trim())return;
 const cn=prompt('Chinese section heading (optional):')||'';
 doc.particulars.push({type:'section',en:en.trim().slice(0,350),cn:cn.trim().slice(0,350),value:''});
 renderSections();status('New section added. Click + Add field to add data.');
});
$('clear-values').addEventListener('click',()=>{
 if(!confirm('Clear every field, company and signer value? This cannot be undone without an exported JSON file.'))return;
 doc.particulars.forEach(x=>{if(x.type==='field')x.value='';});
 for(const k of Object.keys(doc.company))doc.company[k]='';
 for(const k of Object.keys(doc.signatureDirector))doc.signatureDirector[k]='';
 resetView();status('All values cleared; bilingual labels preserved.');
});
$('generate-pdf').addEventListener('click',generate);
$('share-pdf').addEventListener('click',async()=>{
 if(!generated)return status('Generate a PDF first.',true);
 try{status(await savePdf(generated.blob,generated.filename));}
 catch(error){status('PDF saved in memory but not written to your folder: '+error.message+'. Try again.',true);}
});
$('print').addEventListener('click',()=>{
 if(!doc.company.name.trim())return status('Enter company name first.',true);
 renderPages(doc);window.print();setTimeout(()=>{$('pdf-stage').textContent='';},5000);
});
window.addEventListener('afterprint',()=>{$('pdf-stage').textContent='';});
resetView();
status('V1.5 loaded — TIN and Review Notes removed; Director Confirmation only. DMS integrated Annual Return.');
void loadMSIC();
if(window.parent!==window)window.parent.postMessage({type:'ZHENLI_AR_READY'},window.location.origin);
