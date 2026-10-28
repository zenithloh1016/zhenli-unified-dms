import './style.css';
import {createAnnualReturnHistory} from './history.js';
import {Capacitor} from '@capacitor/core';
import {Filesystem,Directory} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {cloneBlank,importAnnualReturnText,normalizeDocument,emptyCount,populatedCount,setCompanyDetail,syncCompanyDetails,deleteParticularField,showMemberField,removeAnnualReturnRecord,displayParticularLabel,updateParticularLabel,removeParticularSection,removeParticularHeading,moveParticularField,moveParticularSection,insertParticularHeading,restoreRsshAuditorHeading,removeRsshRegisteredCharge2} from './core.js';
import {importCombinedRegisterSnapshot} from './register-import.js';
import {buildPdf,savePdf,exposeDownload,renderPages} from './pdf.js';
import {MAX_MSIC_CODES,MSIC_FIELD,SSM_MSIC_LOOKUP,SSM_MSIC_ROC_PDF,extractMSICCodes,formatMSICCodes,matchesMSIC} from './msic.js';
import {saveAnnualReturnDraft,readAnnualReturnDraft,listAnnualReturnDrafts,removeAnnualReturnDraft,draftIdOfKey} from './drafts.js';
import {BO_CRITERIA_DESCRIPTIONS,selectedBoCriteria} from './bo-criteria.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let doc=cloneBlank(),generated=null,busy=false;
const DEFAULT_PARTICULARS=JSON.stringify(cloneBlank().particulars);
const history=createAnnualReturnHistory(doc);
const sectionOpenState=new Map();
function historyControls(){
 const {canUndo,canRedo}=history.state;
 const undo=$('undo-ar'),redo=$('redo-ar');
 if(undo)undo.disabled=!canUndo;
 if(redo)redo.disabled=!canRedo;
}
function applyHistoryChange(direction){
 const next=direction==='undo'?history.undo():history.redo();
 if(!next)return status('No '+direction+' changes available.');
 doc=next;generated=null;$('download-box').hidden=true;
 signingInputs();renderSections();historyControls();saveDraftNow({quiet:true});
 status(direction==='undo'?'Undid last change.':'Redid change.');
}

let arFullscreen=false;
function setFullscreenUi(open){
 arFullscreen=!!open;
 // DMS owns the containing viewport, while the standalone app uses an immersive CSS layout.
 document.documentElement.classList.toggle('ar-immersive',arFullscreen&&window.parent===window);
 const btn=$('toggle-fullscreen');
 if(btn){btn.textContent=arFullscreen?'Exit full screen ✕':'⛶ Full screen';btn.setAttribute('aria-pressed',String(arFullscreen));}
}
async function toggleAnnualReturnFullscreen(){
 if(window.parent!==window){
  window.parent.postMessage({type:'ZHENLI_AR_FULLSCREEN_TOGGLE'},window.location.origin);
  return;
 }
 const next=!arFullscreen;
 if(next&&typeof document.documentElement.requestFullscreen==='function'){
  try{await document.documentElement.requestFullscreen();}catch{/* Android WebView/Brave may require CSS fallback */}
 }else if(!next&&document.fullscreenElement&&typeof document.exitFullscreen==='function'){
  try{await document.exitFullscreen();}catch{/* fallback */}
 }
 setFullscreenUi(next);
}
$('toggle-fullscreen').addEventListener('click',()=>{void toggleAnnualReturnFullscreen();});
document.addEventListener('fullscreenchange',()=>{if(window.parent===window)setFullscreenUi(Boolean(document.fullscreenElement));});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&arFullscreen&&window.parent===window&&!document.fullscreenElement)setFullscreenUi(false);
});

let draftScope=window.parent===window?'standalone':'dms:pending',newDraftId='new-'+Date.now().toString(36),draftTimer=null;
let selectedDmsCompanyId=null,dmsCompanies=[];
let pendingRegisterImport='';
function currentDraftId(){return selectedDmsCompanyId||newDraftId;}
function hasDraftData(){return JSON.stringify(doc.particulars)!==DEFAULT_PARTICULARS||
 Boolean(doc.company?.name||doc.company?.no||doc.signatureDirector?.name||doc.signatureDirector?.nric);}
function draftStatus(message,error=false){const el=$('draft-status');if(el){el.textContent=message;el.style.color=error?'#b23b44':'#327284';}}
function draftOptions(preferred=''){
 const select=$('draft-picker');if(!select)return;
 const previous=preferred||select.value;let rows=[];
 try{rows=listAnnualReturnDrafts(localStorage,draftScope);}catch(err){draftStatus('Device storage unavailable: '+err.message,true);return;}
 select.innerHTML=rows.length?rows.map(x=>'<option value="'+esc(x.key)+'">'+esc(x.name)+(x.registrationNo?' · '+esc(x.registrationNo):'')+' · '+esc(new Date(x.updatedAt).toLocaleString())+'</option>').join(''):'<option value="">No saved drafts</option>';
 const chosen=rows.find(x=>x.key===previous)||rows.find(x=>x.companyId===currentDraftId())||rows[0];
 select.value=chosen?.key||'';$('resume-draft').disabled=!rows.length;$('delete-draft').disabled=!rows.length;
}
function saveDraftNow({quiet=false}={}){
 if(!hasDraftData()&&!history.state.canUndo&&!history.state.canRedo)return true;
 if(window.parent!==window&&draftScope==='dms:pending'){draftStatus('Waiting for DMS session before saving.',true);return false;}
 try{
  const result=saveAnnualReturnDraft(localStorage,draftScope,currentDraftId(),doc);
  draftOptions(result.key);
  draftStatus((quiet?'Autosaved':'Saved draft')+' on this device · '+new Date(result.updatedAt).toLocaleTimeString());
  return true;
 }catch(err){draftStatus('Draft NOT saved: '+err.message+'. Keep this page open.',true);return false;}
}
function queueDraftSave(){
 // Snapshot values and structural edits before persisting the same device draft.
 history.capture(doc);historyControls();
 saveDraftNow({quiet:true});
}
function flushDraft(){if(draftTimer){clearTimeout(draftTimer);draftTimer=null;}return saveDraftNow({quiet:true});}
function resumeLocalDraft(key){
 if(!key)return false;
 try{
  const id=draftIdOfKey(key,draftScope),draft=readAnnualReturnDraft(localStorage,draftScope,id);
  if(!draft)throw Error('Draft no longer exists.');
  doc=draft.data;
  const match=dmsCompanies.find(c=>c.id===id);selectedDmsCompanyId=match?.id||null;
  if(!match)newDraftId=id;
  if(match&&window.parent!==window)
    window.parent.postMessage({type:'ZHENLI_AR_SELECT_COMPANY_REQUEST',id},window.location.origin);
  generated=null;$('download-box').hidden=true;
  resetView();draftOptions(key);
  const restored=restoreRsshSavedDraftOnce();
  const chargeRemoved=removeRsshChargeTwoOnce();
  draftStatus('Resumed '+draft.name+' · '+new Date(draft.updatedAt).toLocaleString()+'. '+restored+chargeRemoved);
  return true;
 }catch(err){draftStatus('Could not resume draft: '+err.message,true);return false;}
}

/** RSSH Annual Return drafts are on the user's device, never in Supabase.
 * Repair the first opened copy once. Do not resurrect an intentionally deleted
 * Auditor heading on every subsequent form reload.
 */
function restoreRsshSavedDraftOnce(){
 if(doc.company.name.trim().replace(/\s+/g,' ').toUpperCase()!=='RSSH SERVICES SDN BHD')return '';
 if(window.parent!==window&&(!selectedDmsCompanyId||draftScope==='dms:pending'))return '';
 const key='unicosec:ar:rssh-auditor-restored:v1:'+encodeURIComponent(draftScope)+':'+encodeURIComponent(currentDraftId());
 try{if(localStorage.getItem(key)==='1')return '';}catch{return '';}
 let result;
 try{result=restoreRsshAuditorHeading(doc);}
 catch(error){draftStatus('Auditor restoration could not run: '+error.message,true);return '';}
 if(result.restored){
  renderSections();history.capture(doc);historyControls();
  if(!saveDraftNow({quiet:true}))return 'Auditor heading restored in this session, but draft saving failed. ';
 }
 // Mark already-complete drafts as checked too, preserving future user removals.
 try{localStorage.setItem(key,'1');}
 catch(error){draftStatus('Auditor heading restored but the one-time marker could not be stored: '+error.message,true);}
 return result.restored?'Restored Auditor heading with '+result.addedFields+' blank template fields. Verify actual auditor particulars. ':'';
}
function restoreRsshAuditorNow(){
 try{
  const result=restoreRsshAuditorHeading(doc);
  if(!result.restored)return status('Auditor was not restored: '+result.reason+'.',true);
  renderSections();queueDraftSave();
  status('RSSH SERVICES SDN BHD: Auditor heading and '+result.addedFields+' blank fields restored. Enter or verify the actual auditor information.');
 }catch(error){status('Cannot restore RSSH Auditor: '+error.message,true);}
}

/** One-time RSSH correction against a previously saved local draft.
 * A separate device/account draft must be opened on that device to be edited.
 * Avoid repeating a destructive change if the user later adds charge 2 again.
 */
function removeRsshChargeTwoOnce(){
 if(String(doc.company?.name||'').trim().replace(/\s+/g,' ').toUpperCase()!=='RSSH SERVICES SDN BHD')return '';
 if(window.parent!==window&&(!selectedDmsCompanyId||draftScope==='dms:pending'))return '';
 const key='unicosec:ar:rssh-charge-2-removed:v2:'+encodeURIComponent(draftScope)+':'+encodeURIComponent(currentDraftId());
 try{if(localStorage.getItem(key)==='1')return '';}catch{return '';}
 let result;
 try{result=removeRsshRegisteredCharge2(doc);}
 catch(error){draftStatus('RSSH charge correction failed: '+error.message,true);return '';}
 if(result.removed){
  generated=null;$('download-box').hidden=true;
  renderSections();history.capture(doc);historyControls();
  if(!saveDraftNow({quiet:true}))return 'Registered Charge 2 was removed from the open form but could not be saved. ';
 }
 if(result.removed||result.reason==='already-absent'){
  try{localStorage.setItem(key,'1');}
  catch(error){draftStatus('RSSH charge correction marker could not be saved: '+error.message,true);}
 }
 return result.removed?'Removed Registered Charge 2 and '+result.removedFields+
  ' related field(s) from RSSH. '+(result.updatedCount?'Charge count adjusted to '+result.remaining+'. ':
  'Verify Number of Registered Charges against the statutory records. '):'';
}
function removeRsshChargeTwoNow(){
 if(String(doc.company?.name||'').trim().replace(/\s+/g,' ').toUpperCase()!=='RSSH SERVICES SDN BHD')
  return status('Select RSSH SERVICES SDN BHD first.',true);
 confirmRemoval('Remove Registered Charge 2 and all of its associated fields from the RSSH Annual Return? This does not delete the statutory register, and Undo can restore the Annual Return entry.',()=>{
  const result=removeRsshRegisteredCharge2(doc);
  if(!result.removed)return status('Registered Charge 2 was not found: '+result.reason+'.',true);
  generated=null;$('download-box').hidden=true;
  renderSections();queueDraftSave();
  // Mark this device/company as corrected, so later intentional additions survive.
  try{localStorage.setItem('unicosec:ar:rssh-charge-2-removed:v2:'+encodeURIComponent(draftScope)+':'+encodeURIComponent(currentDraftId()),'1');}catch{}
  status('RSSH SERVICES: Removed Registered Charge 2 and '+result.removedFields+' fields. '+
   (result.updatedCount?'Adjusted the displayed charge count to '+result.remaining+'. ':'Verify the displayed charge count. ')+
   'Undo is available this session.');
 });
}

function isValidCompanyRecord(value){
 return value&&typeof value==='object'&&
 typeof value.id==='string'&&value.id.length>0&&value.id.length<130&&
 typeof value.name==='string'&&value.name.trim().length>=2&&value.name.length<=300&&
 typeof value.registrationNo==='string'&&value.registrationNo.length<=120;
}
function hasUnsavedAnnualReturnData(){
 return doc.particulars.some(x=>x.type==='field'&&!['Company Name','Company Registration No.'].includes(x.en)&&String(x.value||'').trim()!=='')||
   Boolean(doc.signatureDirector?.name||doc.signatureDirector?.nric);
}
function applyDmsCompany(company){
 if(!isValidCompanyRecord(company))return {ok:false,reason:'Invalid company record from DMS.'};
 const name=company.name.trim(),registrationNo=company.registrationNo.trim();
 if(selectedDmsCompanyId===company.id&&doc.company.name===name&&doc.company.no===registrationNo){
  const fixed=removeRsshChargeTwoOnce();
  if(fixed)status(fixed);
  return {ok:true};
 }
 const changedCompany=Boolean(selectedDmsCompanyId&&selectedDmsCompanyId!==company.id);
 if((changedCompany||hasUnsavedAnnualReturnData())&&!confirm(
   'Switch to '+name+' from DMS Documents? This starts a new Annual Return form and discards unsaved particulars. Your unfinished form will be saved locally before switching.'
 ))return {ok:false,reason:'Selection cancelled to preserve the current draft.'};
 if(!flushDraft())return {ok:false,reason:'Unable to save current draft; switch cancelled.'};
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
 let previous=null;
 try{previous=readAnnualReturnDraft(localStorage,draftScope,company.id);}
 catch(err){draftStatus('Saved draft could not be loaded: '+err.message,true);}
 if(previous&&previous.data.company.name===name&&previous.data.company.no===registrationNo)doc=previous.data;
 resetView();draftOptions();
 const restored=restoreRsshSavedDraftOnce();
 const chargeRemoved=removeRsshChargeTwoOnce();
 status('Company loaded from DMS Documents: '+name+(registrationNo?' ('+registrationNo+')':' — registration number missing; please enter it before PDF generation')+'. '+restored+chargeRemoved+'Complete and verify all remaining statutory particulars.');
 return {ok:true};
}
if(window.parent!==window){
 window.addEventListener('message',event=>{
  if(event.source!==window.parent||event.origin!==window.location.origin)return;
  if(event.data?.type==='ZHENLI_DMS_AR_FULLSCREEN_STATE'){setFullscreenUi(Boolean(event.data.open));return;}
  if(event.data?.type==='ZHENLI_DMS_AR_COMPANY_LIST'){
   const records=Array.isArray(event.data.companies)?event.data.companies:[];
   dmsCompanies=records.slice(0,5000).filter(isValidCompanyRecord).sort((a,b)=>a.name.localeCompare(b.name));
   if(typeof event.data.userId==='string'&&/^[a-z0-9-]{16,90}$/i.test(event.data.userId)){
    draftScope='dms:'+event.data.userId;
    // Locally saved DMS drafts for deleted company UUIDs must not reappear.
    // Standalone/manual drafts and other users' workspaces remain untouched.
    if(records.length<5000){
     const liveIds=new Set(dmsCompanies.map(c=>c.id));
     try{
      const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for(const draft of listAnnualReturnDrafts(localStorage,draftScope)){
       if(uuid.test(draft.companyId)&&!liveIds.has(draft.companyId))
        removeAnnualReturnDraft(localStorage,draft.key,draftScope);
      }
     }catch(error){console.warn('Annual Return deleted-company draft cleanup:',error);}
    }
    draftOptions();
   }
   renderSections();return;
  }
  if(event.data?.type==='ZHENLI_DMS_AR_IMPORT_COMBINED_RESPONSE'){
   if(!pendingRegisterImport||event.data.id!==pendingRegisterImport)return;
   pendingRegisterImport='';
   const button=$('import-combined-register');if(button)button.disabled=false;
   if(!event.data.ok){
    status('Combined register import failed: '+String(event.data.error||'Unable to read saved registers.').slice(0,240),true);
    return;
   }
   try{
    const payload=event.data.payload;
    if(payload?.companyId!==selectedDmsCompanyId)throw Error('Company changed. Import cancelled.');
    if(!flushDraft())throw Error('Current draft could not be backed up.');
    const result=importCombinedRegisterSnapshot(doc,payload);
    doc=result.document;
    generated=null;$('download-box').hidden=true;
    resetView({preserveHistory:true});queueDraftSave();
    const count=result.summary;
    const breakdown=Object.entries(count.records).filter(([,n])=>n>0)
     .map(([key,n])=>n+' '+key).join(', ');
    status('Combined registers imported: '+count.filled+' fields populated'+
     (breakdown?' ('+breakdown+')':'')+'. '+count.kept+
     ' existing values retained. Review all particulars and verify against SSM before generating the PDF.');
   }catch(error){status('Combined register import could not be applied: '+error.message,true);}
   return;
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
 renderSections();queueDraftSave();
 status((remove?'Removed ':'Selected ')+code+'. '+selected.length+' of 3 MSIC codes.');
}

const OPTIONS=[
 {test:/^Member Type$/i,values:['Individual','Body Corporate']},
 {test:/^(?:Classes of Shares Issued|Class of Shares)$/i,values:['Ordinary','Preference','Ordinary & Preference']},
 {test:/^(?:Type of Shares(?: Issued)?|Consideration for Shares|Shares Issued for Cash or Otherwise)$/i,values:['Cash','Otherwise than cash','Cash & Otherwise than cash']},
 {test:/^Type of Beneficial Ownership$/i,values:['Direct','Indirect','Direct & Indirect']}
];
const CRITERIA=BO_CRITERIA_DESCRIPTIONS;
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
 if(!headings.length){
  // Recreate the first record after the user intentionally removed every one.
  const source=cloneBlank().particulars,src=source.findIndex(x=>x.type==='heading'&&rule.heading.test(x.en||''));
  if(src<0)return status(rule.label+' template is missing.',true);
  let stop=src+1;while(stop<source.length&&source[stop].type==='field')stop++;
  const entry=source.slice(src,stop).map(x=>({...x,value:''}));
  if(doc.particulars.length+entry.length>1200)return status('Too many fields.',true);
  let insertAt=until;
  if(kind==='director'){
   const office=doc.particulars.findIndex((item,i)=>i>section&&i<until&&item.type==='heading'&&/^(COMPANY SECRETARY|AUDITOR)$/i.test(item.en||''));
   if(office>=0)insertAt=office;
  }
  doc.particulars.splice(insertAt,0,...entry);renderSections();queueDraftSave();
  status('Added '+rule.label+' 1 with blank fields.');return;
 }
 const start=headings[0],last=headings[headings.length-1];
 let end=until;
 for(let i=last+1;i<until;i++)if(doc.particulars[i].type==='heading'){end=i;break;}
 let templateEnd=headings[1]||end;
 if(kind==='charge'){
  const summary=doc.particulars.findIndex((x,i)=>i>start&&i<templateEnd&&x.type==='field'&&/^Number of Registered Charges$/i.test(x.en));
  if(summary>=0)templateEnd=summary;
 }
 const next=doc.particulars.slice(start,templateEnd).map(x=>({...x,value:''}));
 if(next[0]){delete next[0].displayEn;delete next[0].displayCn;}
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
 renderSections();queueDraftSave();status('Added '+rule.label+' '+nextNumber+'. All its fields are blank.');
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
  '<p class="msic-help">All '+dmsCompanies.length+' DMS companies are available in the dropdown. Selecting a new company fills its registration number and starts a blank review for that company; the current review is saved automatically on this device.</p></div>';
}
// Use an in-app dialog instead of window.prompt(), which may be suppressed in
// Electron desktop windows and Android WebViews (including the DMS iframe).
let pendingCustomFieldTarget=null;
function customFieldDialog(){
 let dialog=$('ar-custom-field-dialog');
 if(dialog)return dialog;
 dialog=document.createElement('dialog');
 dialog.id='ar-custom-field-dialog';
 dialog.setAttribute('aria-labelledby','ar-custom-field-title');
 dialog.className='ar-custom-field-dialog';
 dialog.innerHTML=
  '<form id="ar-custom-field-form">'+
  '<h2 id="ar-custom-field-title">Add Annual Return field</h2>'+
  '<p id="ar-custom-field-location" class="status"></p>'+
  '<label id="ar-heading-section-label" for="ar-heading-section" hidden>Place heading under section</label>'+
  '<select id="ar-heading-section" class="choice-select" hidden></select>'+
  '<label for="ar-custom-field-en">Field name (English) <span aria-hidden="true">*</span></label>'+
  '<input id="ar-custom-field-en" type="text" maxlength="350" required autocomplete="off" placeholder="Enter the English field name">'+
  '<label for="ar-custom-field-cn">Field name (Chinese, optional)</label>'+
  '<input id="ar-custom-field-cn" type="text" maxlength="350" autocomplete="off" placeholder="输入中文字段名称（选填）">'+
  '<p id="ar-custom-field-error" class="status" role="alert" hidden></p>'+
  '<div class="ar-custom-field-actions">'+
  '<button type="button" class="button outline" id="ar-custom-field-cancel">Cancel</button>'+
  '<button type="submit" class="button primary">Add field</button>'+
  '</div></form>';
 // Keep the dialog styling with the dialog itself so the fix is bundled into
 // the installed Windows, Android and browser versions together.
 const style=document.createElement('style');
 style.textContent=[
  '.ar-custom-field-dialog{box-sizing:border-box;width:min(92vw,490px);max-height:90vh;overflow:auto;'+
  'margin:auto;padding:22px;border:1px solid #bdcedb;border-radius:16px;background:#fff;color:#15364c;'+
  'box-shadow:0 20px 60px #092a4255;}',
  '.ar-custom-field-dialog::backdrop{background:rgba(7,26,43,.65);}',
  '.ar-custom-field-dialog form{display:grid;gap:10px;}',
  '.ar-custom-field-dialog [hidden]{display:none!important;}',
  '.ar-custom-field-dialog h2{margin:0 0 4px;font-size:21px;}',
  '.ar-custom-field-dialog label{font-weight:700;font-size:14px;}',
  '.ar-custom-field-dialog input{box-sizing:border-box;width:100%;min-height:44px;padding:10px 12px;'+
  'border:1px solid #afc5d5;border-radius:8px;font:inherit;color:#15364c;background:#fff;}',
  '.ar-custom-field-dialog input:focus-visible{outline:3px solid #8bc8ef;outline-offset:1px;}',
  '.ar-custom-field-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:10px;}',
  '@media(max-width:480px){.ar-custom-field-dialog{padding:16px;}.ar-custom-field-actions .button{flex:1;}}'
 ].join('');
 document.head.appendChild(style);
 document.body.appendChild(dialog);
 dialog.querySelector('#ar-custom-field-cancel').addEventListener('click',()=>dialog.close());
 dialog.querySelector('#ar-custom-field-form').addEventListener('submit',event=>{
  event.preventDefault();
  saveCustomField(dialog);
 });
 dialog.addEventListener('close',()=>{pendingCustomFieldTarget=null;});
 return dialog;
}
function addCustomField({sectionIndex=null,headingIndex=null}={}){
 if(doc.particulars.length>=1200)return status('The Annual Return field limit is reached.',true);
 if(headingIndex!==null&&doc.particulars[headingIndex]?.type!=='heading')
  return status('The selected member record no longer exists.',true);
 if(sectionIndex!==null&&doc.particulars[sectionIndex]?.type!=='section')
  return status('Section no longer exists.',true);
 openLabelEditor({mode:'add-field',sectionIndex,headingIndex});
}
function openLabelEditor(target){
 pendingCustomFieldTarget=target;
 const dialog=customFieldDialog();
 const entry=target.index!==undefined?doc.particulars[target.index]:null;
 const mode=target.mode;
 const context=target.headingIndex!==null&&target.headingIndex!==undefined?
  displayParticularLabel(doc.particulars[target.headingIndex]):
  target.sectionIndex!==null&&target.sectionIndex!==undefined?
  displayParticularLabel(doc.particulars[target.sectionIndex]):'the end of the form';
 const title=mode==='edit-label'?'Edit '+entry.type+' labels':mode==='add-section'?'Add Annual Return section':mode==='add-heading'?'Add Annual Return heading':'Add Annual Return field';
 dialog.querySelector('#ar-custom-field-title').textContent=title;
 const fieldType=mode==='add-section'||entry?.type==='section'?'Section':mode==='add-heading'||entry?.type==='heading'?'Heading':'Field';
 dialog.querySelector('label[for="ar-custom-field-en"]').textContent=fieldType+' name (English) *';
 dialog.querySelector('label[for="ar-custom-field-cn"]').textContent=fieldType+' name (Chinese, optional)';
 dialog.querySelector('#ar-custom-field-location').textContent=mode==='edit-label'?
  'Update the displayed English and Chinese labels; existing values are retained.':
  mode==='add-section'?'The new section will appear at the end of the form.':
  mode==='add-heading'?'New heading will be added under '+context+'. Add its fields using the heading’s Add Field button.':
  'New field will be added to '+context+'.';
 dialog.querySelector('#ar-custom-field-en').value=entry?displayParticularLabel(entry):'';
 dialog.querySelector('#ar-custom-field-cn').value=entry?displayParticularLabel(entry,'cn'):'';
 dialog.querySelector('button[type="submit"]').textContent=mode==='edit-label'?'Save labels':mode==='add-section'?'Add section':mode==='add-heading'?'Add heading':'Add field';
 const pick=dialog.querySelector('#ar-heading-section');
 const showPicker=mode==='add-heading'&&target.sectionIndex==null;
 dialog.querySelector('#ar-heading-section-label').hidden=!showPicker;pick.hidden=!showPicker;
 if(showPicker){
  const sections=doc.particulars.map((item,index)=>({item,index})).filter(x=>x.item.type==='section');
  pick.innerHTML='<option value="">— Choose section —</option>'+sections.map(({item,index})=>
   '<option value="'+index+'">'+esc(displayParticularLabel(item))+'</option>').join('');
  const preferred=sections.find(x=>/DIRECTORS, COMPANY SECRETARY/i.test(x.item.en||''))||sections[0];
  pick.value=String(preferred?.index??'');
 }
 dialog.querySelector('#ar-custom-field-error').hidden=true;
 if(!dialog.open){
  if(typeof dialog.showModal==='function')dialog.showModal();
  else if(typeof dialog.show==='function')dialog.show();
  else dialog.setAttribute('open','');
 }
 dialog.querySelector('#ar-custom-field-en').focus();
}
function editReviewItem(index){
 if(!doc.particulars[index])return status('Item no longer exists.',true);
 openLabelEditor({mode:'edit-label',index});
}
function addReviewSection(){
 if(doc.particulars.length>=1200)return status('The Annual Return item limit is reached.',true);
 openLabelEditor({mode:'add-section'});
}
function addReviewHeading(sectionIndex=null){
 if(doc.particulars.length>=1200)return status('The Annual Return item limit is reached.',true);
 if(sectionIndex!==null&&doc.particulars[sectionIndex]?.type!=='section')return status('Section no longer exists.',true);
 if(!doc.particulars.some(item=>item.type==='section'))return status('Add a section first, then add a heading inside it.',true);
 openLabelEditor({mode:'add-heading',sectionIndex});
}
/** Browser confirm() is unreliable inside Electron and some Android WebViews.
 * Show an application-owned modal with an explicit destructive action instead.
 */
function confirmRemoval(message,action){
 let modal=$('ar-removal-confirm');
 if(!modal){
  modal=document.createElement('dialog');
  modal.id='ar-removal-confirm';
  modal.className='ar-custom-field-dialog ar-remove-dialog';
  modal.innerHTML='<div class="ar-remove-content">'+
   '<h2>Confirm removal</h2><p id="ar-removal-message"></p>'+
   '<div class="ar-custom-field-actions">'+
   '<button type="button" class="button outline" id="ar-removal-cancel">Cancel</button>'+
   '<button type="button" class="button primary ar-confirm-remove" id="ar-removal-accept">Remove</button>'+
   '</div></div>';
  document.body.appendChild(modal);
 }
 modal.querySelector('#ar-removal-message').textContent=message;
 const cancel=modal.querySelector('#ar-removal-cancel');
 const accept=modal.querySelector('#ar-removal-accept');
 cancel.onclick=()=>modal.close();
 accept.onclick=()=>{
  modal.close();
  try{action();}catch(error){status('Removal failed: '+(error.message||error),true);}
 };
 if(!modal.open)modal.showModal();
}
function removeReviewSection(index){
 const item=doc.particulars[index];if(item?.type!=='section')return status('Section no longer exists.',true);
 let end=index+1;while(end<doc.particulars.length&&doc.particulars[end].type!=='section')end++;
 const count=doc.particulars.slice(index+1,end).filter(x=>x.type==='field').length;
 const target=item;
 confirmRemoval('Remove section "'+displayParticularLabel(item)+'" and all '+count+
  ' associated fields and values? You can use Undo to restore them during this session.',()=>{
   const current=doc.particulars.indexOf(target);
   if(current<0)throw Error('Section changed. Retry.');
   const result=removeParticularSection(doc,current);
   renderSections();queueDraftSave();status('Removed section: '+result.name+'. Use Undo to restore.');
  });
}
function removeReviewHeading(index){
 const entry=doc.particulars[index];if(entry?.type!=='heading')return status('Heading no longer exists.',true);
 if(ADDONS.some(x=>x.id!=='charge'&&x.heading.test(entry.en||''))){removeWholeRecord(index);return;}
 confirmRemoval('Remove "'+displayParticularLabel(entry)+'" and all its associated fields and values? Undo will restore them.',()=>{
  const current=doc.particulars.indexOf(entry);
  if(current<0)throw Error('Heading changed. Retry.');
  const result=removeParticularHeading(doc,current);
  generated=null;$('download-box').hidden=true;
  renderSections();queueDraftSave();status('Removed heading: '+result.name+'. '+(result.updatedCount?'Registered Charge count adjusted. ':'')+'Use Undo to restore.');
 });
}
function saveCustomField(dialog){
 const error=dialog.querySelector('#ar-custom-field-error');
 const english=dialog.querySelector('#ar-custom-field-en');
 const en=english.value.trim().slice(0,350);
 if(!en){error.textContent='Enter an English field name.';error.hidden=false;english.focus();return;}
 if(doc.particulars.length>=1200){error.textContent='The Annual Return field limit is reached.';error.hidden=false;return;}
 const cn=dialog.querySelector('#ar-custom-field-cn').value.trim().slice(0,350);
 const target=pendingCustomFieldTarget||{};
 if(target.mode==='edit-label'){
  try{
   const result=updateParticularLabel(doc,target.index,en,cn);
   dialog.close();renderSections();queueDraftSave();
   status('Updated '+result.type+' labels. The new labels will appear in the PDF.');
  }catch(err){error.textContent=err.message;error.hidden=false;}
  return;
 }
 if(target.mode==='add-section'){
  doc.particulars.push({type:'section',en,cn,value:''});
  dialog.close();renderSections({openSection:doc.particulars.length-1});queueDraftSave();
  status('Added section "'+en+'". Use Add field to this section to insert particulars.');
  return;
 }
 if(target.mode==='add-heading'){
  const selection=target.sectionIndex==null?dialog.querySelector('#ar-heading-section').value:String(target.sectionIndex);
  const sectionIndex=selection===''?null:Number(selection);
  if(sectionIndex===null||doc.particulars[sectionIndex]?.type!=='section'){
   error.textContent='Select the section for this heading.';error.hidden=false;return;
  }
  try{
   insertParticularHeading(doc,sectionIndex,en,cn);
   dialog.close();renderSections({openSection:sectionIndex});queueDraftSave();
   status('Added heading "'+en+'". Use its + Add field button to add particulars.');
  }catch(err){error.textContent=err.message;error.hidden=false;}
  return;
 }
 const {sectionIndex=null,headingIndex=null}=target;
 let pos=doc.particulars.length;
 if(headingIndex!==null){
  if(doc.particulars[headingIndex]?.type!=='heading'){
   error.textContent='The selected member record no longer exists. Reopen Add field.';error.hidden=false;return;
  }
  pos=headingIndex+1;
  while(pos<doc.particulars.length&&doc.particulars[pos].type==='field')pos++;
 }else if(sectionIndex!==null){
  if(doc.particulars[sectionIndex]?.type!=='section'){
   error.textContent='Section no longer exists. Reopen Add field.';error.hidden=false;return;
  }
  // Section fields belong before any Director/Member/BO subheadings, not under the last record.
  pos=sectionIndex+1;
  while(pos<doc.particulars.length&&doc.particulars[pos].type==='field')pos++;
 }
 doc.particulars.splice(pos,0,{type:'field',en,cn,value:''});
 dialog.close();
 renderSections({openSection:sectionIndex!==null?sectionIndex:null});queueDraftSave();
 status('Added "'+en+'" to '+(headingIndex!==null?'the selected member record':sectionIndex!==null?'the selected section':'the end of the form')+'. It will appear in the PDF.');
}
function removeReviewField(index){
 const item=doc.particulars[index];
 if(item?.type!=='field')return status('Field no longer exists.',true);
 confirmRemoval('Remove field "'+displayParticularLabel(item)+'" and its value from the Annual Return and PDF? Undo can restore it.',()=>{
  const current=doc.particulars.indexOf(item);
  if(current<0)throw Error('Field changed. Retry.');
  const result=deleteParticularField(doc,current);
  renderSections();queueDraftSave();status('Removed field: '+displayParticularLabel(result)+'. Use Undo to restore.');
 });
}
function removeWholeRecord(index){
 const heading=doc.particulars[index];
 if(heading?.type!=='heading')return status('Heading no longer exists.',true);
 confirmRemoval('Remove heading "'+displayParticularLabel(heading)+'" and its record fields and values? You can Undo this removal.',()=>{
  const current=doc.particulars.indexOf(heading);
  if(current<0)throw Error('Heading changed. Retry.');
  const result=removeAnnualReturnRecord(doc,current);
  renderSections();queueDraftSave();
  status('Removed '+result.removedHeading+'. '+result.remaining+' record(s) remain. Use Undo to restore.');
 });
}
function controlsFor(item,index){
 const value=String(item.value||''),common=' data-item="'+index+'"';
 if(item.en==='Company Name')return companyNameControl(item,index);
 if(MSIC_FIELD.test(item.en))return msicControl(item,index);
 if(/^Criteria of Beneficial Ownership$/i.test(item.en)){
  const selected=selectedBoCriteria(value).map(item=>item.code); 
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
function renderSections({openSection=null}={}){
 const onlyBlank=$('incomplete').checked;
 // The key is based on canonical section title, so label edits do not collapse it.
 const sections=groups();
 const sectionIndices=sections.filter(g=>g.index>=0).map(g=>g.index);
 $('particulars').innerHTML=sections.map((group,i)=>{
  const section=doc.particulars[group.index];
  const title=section?displayParticularLabel(section):group.title;
  const chinese=section?displayParticularLabel(section,'cn'):group.cn;
  const rows=group.items.filter(({item})=>
   !onlyBlank||item.type!=='field'||!String(item.value||'').trim()
  ); // Keep all officer headings visible, including when only-blank filter is on.
  const body=rows.map(({index,item})=>{
   if(item.type==='heading'){
     const matched=ADDONS.find(x=>x.id!=='charge'&&x.heading.test(item.en||''));
     return '<div class="heading-entry" data-heading-index="'+index+'"><strong>'+esc(displayParticularLabel(item))+'</strong> <small>'+esc(displayParticularLabel(item,'cn'))+'</small>'+
       '<button type="button" class="button mini" data-edit-heading="'+index+'">Edit heading</button>'+
       '<button type="button" class="button mini ar-add-member-field" data-add-to-record="'+index+'">+ Add field to '+esc(item.en||'record')+'</button>'+
       (matched?'<button type="button" class="button mini ar-remove-record" data-remove-record="'+index+'">Remove heading &amp; fields</button>':
       '<button type="button" class="button mini ar-remove-record" data-delete-heading="'+index+'">Remove heading &amp; fields</button>')+'</div>';
   }
   return '<div class="field-entry '+(item.value?'':'blank')+'" data-field-index="'+index+'"><div class="title">'+
    '<button type="button" class="ar-drag-handle" data-drag-field="'+index+'" title="Drag field to reorder" aria-label="Drag '+esc(displayParticularLabel(item))+' to reorder">⠿</button>'+esc(displayParticularLabel(item)||'Untitled')+
    '<small>'+esc(displayParticularLabel(item,'cn'))+'</small>'+
    '<div class="ar-label-actions"><button type="button" class="button mini" data-shift-field="'+index+'" data-shift="up" aria-label="Move field up">↑</button>'+ 
    '<button type="button" class="button mini" data-shift-field="'+index+'" data-shift="down" aria-label="Move field down">↓</button>'+ 
    '<button type="button" class="button mini" data-edit-field="'+index+'">Edit field</button>'+
    '<button type="button" class="ar-delete-field" data-delete-field="'+index+'">Remove field</button></div></div>'+
    controlsFor(item,index)+'</div>';
  }).join('')||(onlyBlank?'<p class="status">No blank fields in this section. Turn off the filter to edit filled fields.</p>':
    '<p class="status">No fields in this section. Use Add field to this section.</p>');
  const key=group.title+':'+sections.slice(0,i).filter(x=>x.title===group.title).length;
  const startsExpanded=i===0||/DIRECTORS, COMPANY SECRETARY|PARTICULARS OF MEMBERS|CURRENT BENEFICIAL OWNERS/i.test(group.title);
  const shouldOpen=openSection===group.index||onlyBlank||
   (sectionOpenState.has(key)?sectionOpenState.get(key):startsExpanded);
  const position=sectionIndices.indexOf(group.index);
  const reorder=position<0?'':'<span class="ar-section-order-tools">'+
   '<button type="button" class="ar-section-drag-handle" data-drag-section="'+group.index+'" aria-label="Drag section '+esc(title)+'" title="Drag section to reorder">⠿</button>'+
   '<button type="button" class="button mini ar-section-shift" data-shift-section="'+group.index+'" data-section-direction="up" title="Move section up" aria-label="Move '+esc(title)+' up" '+(position===0?'disabled':'')+'>↑</button>'+
   '<button type="button" class="button mini ar-section-shift" data-shift-section="'+group.index+'" data-section-direction="down" title="Move section down" aria-label="Move '+esc(title)+' down" '+(position===sectionIndices.length-1?'disabled':'')+'>↓</button>'+
   '</span>';
  return '<details class="ar-section" data-section-index="'+group.index+'" data-section-name="'+esc(key)+'" '+(shouldOpen?'open':'')+'><summary class="section-header"><span class="ar-section-title">'+
   esc(title)+'<small>'+esc(chinese)+'</small></span>'+reorder+'<span class="pill">'+
   rows.filter(x=>x.item.type==='field').length+' fields</span></summary><div class="section-fields">'+
   (group.index>=0?'<div class="addon-bar ar-section-actions">'+
    '<button type="button" class="button mini" data-edit-section="'+group.index+'">Edit section</button>'+
    '<button type="button" class="button mini ar-remove-record" data-delete-section="'+group.index+'">Remove section &amp; fields</button></div>':'')+
   body+(group.index>=0?'<div class="addon-bar">'+ADDONS.filter(x=>x.section.test(group.title)).map(x=>
   '<button class="button mini" type="button" data-add-record="'+x.id+'">+ Add '+x.label+'</button>').join('')+
   '<button class="button mini" type="button" data-add-heading-to-section="'+group.index+'">+ Add heading</button>'+
   '<button class="button mini" type="button" data-add-to-section="'+group.index+'">+ Add field to this section</button>'+
   (/DIRECTORS, COMPANY SECRETARY/i.test(group.title)&&doc.company.name.trim().replace(/\s+/g,' ').toUpperCase()==='RSSH SERVICES SDN BHD'&&!doc.particulars.some(x=>x.type==='heading'&&x.en==='AUDITOR')?
   '<button class="button mini" type="button" data-restore-rssh-auditor>↺ Restore Auditor heading (RSSH)</button>':'')+
   (/REGISTERED CHARGES/i.test(group.title)&&doc.company.name.trim().replace(/\s+/g,' ').toUpperCase()==='RSSH SERVICES SDN BHD'&&doc.particulars.some(x=>x.type==='heading'&&/^REGISTERED CHARGE 2$/i.test(x.en||''))?
   '<button class="button mini ar-remove-record" type="button" data-remove-rssh-charge-2>Remove Registered Charge 2 (RSSH)</button>':'')+
   '</div>':'')+'</div></details>';
 }).join('')||'<p class="status">No sections remain. Choose Add new section to start again.</p>';
 fieldStatus();historyControls();
}
/** Move entire review sections without splitting their headings or fields. */
function commitSectionMove(from,target,after){
 try{
  const moved=moveParticularSection(doc,from,target,{after});
  if(!moved.moved)return;
  generated=null;$('download-box').hidden=true;
  renderSections();queueDraftSave();
  status('Section reordered with all headings and fields. Saved order is used in the PDF; Undo can restore it.');
 }catch(err){status('Cannot move section: '+err.message,true);}
}
function moveSectionByButton(index,direction){
 const positions=doc.particulars.map((x,i)=>x.type==='section'?i:-1).filter(i=>i>=0);
 const current=positions.indexOf(index),next=current+(direction==='up'?-1:1);
 if(current<0||next<0||next>=positions.length)return;
 commitSectionMove(index,positions[next],direction==='down');
}
let activeSectionDrag=null;
function clearSectionDrop(){
 $('particulars').querySelectorAll('.ar-section-drop-before,.ar-section-drop-after').forEach(el=>
  el.classList.remove('ar-section-drop-before','ar-section-drop-after'));
}
$('particulars').addEventListener('pointerdown',event=>{
 const handle=event.target.closest('[data-drag-section]');
 if(!handle||event.button>0)return;
 const from=Number(handle.dataset.dragSection);
 if(doc.particulars[from]?.type!=='section')return;
 activeSectionDrag={pointerId:event.pointerId,from,startX:event.clientX,startY:event.clientY,started:false,target:null,after:false};
 try{handle.setPointerCapture(event.pointerId);}catch{}
});
$('particulars').addEventListener('pointermove',event=>{
 const drag=activeSectionDrag;
 if(!drag||drag.pointerId!==event.pointerId)return;
 if(!drag.started){
  if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<8)return;
  drag.started=true;
 }
 if(event.cancelable)event.preventDefault();
 clearSectionDrop();
 const hovered=document.elementFromPoint(event.clientX,event.clientY);
 const section=hovered?.closest('details.ar-section[data-section-index]');
 drag.target=null;
 if(section){
  const target=Number(section.dataset.sectionIndex);
  if(target!==drag.from&&doc.particulars[target]?.type==='section'){
   const summary=section.querySelector('summary.section-header')||section;
   const bounds=summary.getBoundingClientRect();
   const after=event.clientY>bounds.top+bounds.height/2;
   section.classList.add(after?'ar-section-drop-after':'ar-section-drop-before');
   drag.target=target;drag.after=after;
  }
 }
 if(event.clientY<64)window.scrollBy(0,-20);
 else if(event.clientY>(document.documentElement.clientHeight||window.innerHeight)-64)window.scrollBy(0,20);
});
function finishSectionDrag(event){
 const drag=activeSectionDrag;
 if(!drag||drag.pointerId!==event.pointerId)return;
 activeSectionDrag=null;
 clearSectionDrop();
 if(event.type==='pointercancel'||!drag.started||drag.target===null)return;
 commitSectionMove(drag.from,drag.target,drag.after);
}
$('particulars').addEventListener('pointerup',finishSectionDrag);
$('particulars').addEventListener('pointercancel',finishSectionDrag);

/** Fields can be reordered using a drag handle (mouse/touch) or ↑/↓ buttons.
 * Original labels, identifiers and field values move together.
 */
function moveFieldByButton(from,direction){
 if(doc.particulars[from]?.type!=='field')return;
 const target=direction==='up'?from-1:from+1;
 if(doc.particulars[target]?.type!=='field')return status('Drag the field handle to move into another section or record.');
 try{
  const result=moveParticularField(doc,from,target,{after:direction==='down'});
  if(result.moved){renderSections();queueDraftSave();status('Field moved. PDF sequence updated.');}
 }catch(err){status('Cannot move field: '+err.message,true);}
}
let activeFieldDrag=null;
function clearFieldDrop(){
 $('particulars').querySelectorAll('.ar-drop-before,.ar-drop-after,.ar-drop-section').forEach(el=>
  el.classList.remove('ar-drop-before','ar-drop-after','ar-drop-section'));
}
$('particulars').addEventListener('pointerdown',event=>{
 const handle=event.target.closest('[data-drag-field]');
 if(!handle||event.button>0)return;
 const from=Number(handle.dataset.dragField);
 if(doc.particulars[from]?.type!=='field')return;
 activeFieldDrag={pointerId:event.pointerId,from,startX:event.clientX,startY:event.clientY,started:false,target:null,after:false};
 try{handle.setPointerCapture(event.pointerId);}catch{}
});
$('particulars').addEventListener('pointermove',event=>{
 const drag=activeFieldDrag;
 if(!drag||drag.pointerId!==event.pointerId)return;
 if(!drag.started){
  if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<8)return;
  drag.started=true;
 }
 if(event.cancelable)event.preventDefault();
 clearFieldDrop();
 const hovered=document.elementFromPoint(event.clientX,event.clientY);
 const field=hovered?.closest('.field-entry[data-field-index]');
 const section=hovered?.closest('details.ar-section[data-section-index]');
 const heading=hovered?.closest('.heading-entry[data-heading-index]');
 let target=null,after=false;
 if(field){
  target=Number(field.dataset.fieldIndex);
  after=event.clientY>field.getBoundingClientRect().top+field.getBoundingClientRect().height/2;
  field.classList.add(after?'ar-drop-after':'ar-drop-before');
 }else if(heading){
  target=Number(heading.dataset.headingIndex);
  heading.classList.add('ar-drop-section');
 }else if(section){
  target=Number(section.dataset.sectionIndex);
  section.classList.add('ar-drop-section');
 }
 drag.target=target;drag.after=after;
 if(event.clientY<60)window.scrollBy(0,-18);
 else if(event.clientY>window.innerHeight-60)window.scrollBy(0,18);
});
function finishFieldDrag(event){
 const drag=activeFieldDrag;
 if(!drag||drag.pointerId!==event.pointerId)return;
 activeFieldDrag=null;
 clearFieldDrop();
 if(event.type==='pointercancel'||!drag.started||drag.target===null||drag.target===drag.from)return;
 try{
  const result=moveParticularField(doc,drag.from,drag.target,{after:drag.after});
  if(result.moved){renderSections();queueDraftSave();status('Field reordered successfully. This sequence will be used in the PDF.');}
 }catch(err){status('Cannot move field: '+err.message,true);}
}
$('particulars').addEventListener('pointerup',finishFieldDrag);
$('particulars').addEventListener('pointercancel',finishFieldDrag);
function resetView({preserveHistory=false}={}){
 if(!preserveHistory)history.reset(doc);
 sectionOpenState.clear();signingInputs();$('incomplete').checked=false;renderSections();historyControls();
}
function setBusy(flag){busy=flag;$('generate-pdf').disabled=flag;$('save-draft').disabled=flag;}
async function generate(){
 if(busy)return;
 const rsshCorrection=removeRsshChargeTwoOnce();
 if(rsshCorrection)status(rsshCorrection);
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
$('import-combined-register').addEventListener('click',()=>{
 if(window.parent===window)return status('Open Annual Return inside UNICOSEC to import its private statutory records.',true);
 if(pendingRegisterImport)return;
 if(!selectedDmsCompanyId)return status('Select the company in Company Details before importing combined registers.',true);
 if(!confirm('Import matching fields from this company’s saved Combined Statutory Registers?\n\nExisting non-blank Annual Return values will be kept. Current directors, members, beneficial owners and registered charges will be imported where supported. Verify everything before generating.'))return;
 pendingRegisterImport='ar_register_'+Date.now().toString(36);
 $('import-combined-register').disabled=true;
 status('Loading saved combined statutory registers for this company…');
 window.parent.postMessage({
  type:'ZHENLI_DMS_AR_IMPORT_COMBINED_REQUEST',
  id:pendingRegisterImport,companyId:selectedDmsCompanyId
 },window.location.origin);
});
$('save-draft').addEventListener('click',()=>{if(!hasDraftData())return draftStatus('Enter some particulars before saving.',true);saveDraftNow();});
$('resume-draft').addEventListener('click',()=>{if(flushDraft())resumeLocalDraft($('draft-picker').value);});
$('delete-draft').addEventListener('click',()=>{
 const key=$('draft-picker').value;if(!key)return;
 if(!confirm('Permanently delete this locally saved Annual Return draft? The currently open form remains unchanged.'))return;
 try{removeAnnualReturnDraft(localStorage,key,draftScope);draftOptions();draftStatus('Selected local draft deleted.');}
 catch(err){draftStatus('Delete failed: '+err.message,true);}
});
$('blank').addEventListener('click',()=>{
 if(!confirm('Start a blank Annual Return? The current unfinished form will be saved on this device.'))return;
 if(!flushDraft())return;
 selectedDmsCompanyId=null;newDraftId='new-'+Date.now().toString(36);
 doc=cloneBlank();resetView();generated=null;$('download-box').hidden=true;
 draftOptions();draftStatus('New blank form. Changes will autosave on this device.');
});
$('incomplete').addEventListener('change',()=>renderSections());
$('particulars').addEventListener('toggle',event=>{
 const target=event.target;
 if(!target?.matches?.('details.ar-section')||!target.isConnected)return;
 sectionOpenState.set(target.dataset.sectionName,target.open);
},true);
$('undo-ar').addEventListener('click',()=>applyHistoryChange('undo'));
$('redo-ar').addEventListener('click',()=>applyHistoryChange('redo'));
document.addEventListener('keydown',event=>{
 if(!(event.ctrlKey||event.metaKey)||event.altKey)return;
 // Preserve native textarea Ctrl+Z. Toolbar actions undo field values as well.
 if(event.target?.closest?.('input,textarea,[contenteditable="true"]'))return;
 const key=event.key.toLowerCase();
 if(key==='z'&&!event.shiftKey){event.preventDefault();applyHistoryChange('undo');}
 else if(key==='y'||(key==='z'&&event.shiftKey)){event.preventDefault();applyHistoryChange('redo');}
});
$('signature-fields').addEventListener('input',e=>{const k=e.target.dataset.sign;if(k){doc.signatureDirector[k]=e.target.value;queueDraftSave();}});
$('particulars').addEventListener('input',e=>{
 if(e.target.dataset.msicSearch!==undefined){refreshMSICResults(e.target);return;}
 const index=e.target.dataset.item;
 if(index!==undefined&&doc.particulars[+index]){
  doc.particulars[+index].value=e.target.value;
  setCompanyDetail(doc,Number(index),e.target.value);
  e.target.closest('.field-entry')?.classList.toggle('blank',!e.target.value.trim());
  fieldStatus();queueDraftSave();
 }
});
$('particulars').addEventListener('change',e=>{
 const el=e.target;
 if(el.dataset.companySelect!==undefined){
  const id=el.value;
  if(id&&window.parent!==window)window.parent.postMessage({type:'ZHENLI_AR_SELECT_COMPANY_REQUEST',id},window.location.origin);
  return;
 }
 if(el.dataset.item!==undefined&&doc.particulars[Number(el.dataset.item)]?.en==='Member Type'){queueDraftSave();renderSections();return;}
 if(el.dataset.criteria!==undefined){
  const i=Number(el.dataset.criteria);
  const values=[...$('particulars').querySelectorAll('input[data-criteria="'+i+'"]:checked')].map(x=>x.value);
  doc.particulars[i].value=values.map(x=>'Criteria '+x).join(', ');
  el.closest('.field-entry')?.classList.toggle('blank',!values.length);
  fieldStatus();queueDraftSave();
 }
});
$('particulars').addEventListener('click',e=>{
 const grip=e.target.closest('[data-drag-section]');
 if(grip){e.preventDefault();e.stopPropagation();return;}
 const sh=e.target.closest('[data-shift-section]');
 if(sh){e.preventDefault();e.stopPropagation();moveSectionByButton(Number(sh.dataset.shiftSection),sh.dataset.sectionDirection);return;}
 const shift=e.target.closest('[data-shift-field]');if(shift){moveFieldByButton(Number(shift.dataset.shiftField),shift.dataset.shift);return;}
 const editSection=e.target.closest('[data-edit-section]');if(editSection){editReviewItem(Number(editSection.dataset.editSection));return;}
 const delSection=e.target.closest('[data-delete-section]');if(delSection){removeReviewSection(Number(delSection.dataset.deleteSection));return;}
 const editField=e.target.closest('[data-edit-field]');if(editField){editReviewItem(Number(editField.dataset.editField));return;}
 const editHeading=e.target.closest('[data-edit-heading]');if(editHeading){editReviewItem(Number(editHeading.dataset.editHeading));return;}
 const delHeading=e.target.closest('[data-delete-heading]');if(delHeading){removeReviewHeading(Number(delHeading.dataset.deleteHeading));return;}
 const removeRecord=e.target.closest('[data-remove-record]');
 if(removeRecord){removeWholeRecord(Number(removeRecord.dataset.removeRecord));return;}
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
 const removeRsshCharge=e.target.closest('[data-remove-rssh-charge-2]');if(removeRsshCharge){removeRsshChargeTwoNow();return;}
 const restoreAuditor=e.target.closest('[data-restore-rssh-auditor]');if(restoreAuditor){restoreRsshAuditorNow();return;}
 const addHeading=e.target.closest('[data-add-heading-to-section]');if(addHeading){addReviewHeading(Number(addHeading.dataset.addHeadingToSection));return;}
 const recordField=e.target.closest('[data-add-to-record]');if(recordField){addCustomField({headingIndex:Number(recordField.dataset.addToRecord)});return;}
 const sectionField=e.target.closest('[data-add-to-section]');if(sectionField){addCustomField({sectionIndex:Number(sectionField.dataset.addToSection)});return;}
 const add=e.target.closest('[data-add-record]');if(add)addRecord(add.dataset.addRecord);
});
$('add-field').addEventListener('click',()=>addCustomField());
$('add-section').addEventListener('click',addReviewSection);
$('add-heading').addEventListener('click',()=>addReviewHeading());
$('clear-values').addEventListener('click',()=>{
 if(!confirm('Clear every field and signatory value? Your last saved draft remains until new information is entered.'))return;
 if(!flushDraft())return;
 doc.particulars.forEach(x=>{if(x.type==='field')x.value='';});
 for(const k of Object.keys(doc.company))doc.company[k]='';
 for(const k of Object.keys(doc.signatureDirector))doc.signatureDirector[k]='';
 resetView({preserveHistory:true});queueDraftSave();status('All values cleared; bilingual labels preserved.');
});
$('generate-pdf').addEventListener('click',generate);
$('share-pdf').addEventListener('click',async()=>{
 if(!generated)return status('Generate a PDF first.',true);
 try{status(await savePdf(generated.blob,generated.filename));}
 catch(error){status('PDF has not been saved: '+error.message+'. Tap Save PDF to Files to retry.',true);}
});
$('print').addEventListener('click',()=>{
 const rsshCorrection=removeRsshChargeTwoOnce();
 if(rsshCorrection)status(rsshCorrection);
 if(!doc.company.name.trim())return status('Enter company name first.',true);
 renderPages(doc);window.print();setTimeout(()=>{$('pdf-stage').textContent='';},5000);
});
window.addEventListener('afterprint',()=>{$('pdf-stage').textContent='';});
resetView();draftOptions();
status('Annual Return PDF generator loaded — review fields, save drafts and generate PDFs.');
void loadMSIC();
if(window.parent!==window)window.parent.postMessage({type:'ZHENLI_AR_READY'},window.location.origin);
window.addEventListener('pagehide',()=>{flushDraft();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushDraft();});
