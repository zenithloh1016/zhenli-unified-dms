/**
 * ZHENLI Statutory Registers: editable worksheets persisted per company in
 * private Supabase Storage. No new SQL table or repository-stored client data.
 */
import {previewStatutoryZip,makeRegisterBook,mergeRegisterBooks,validateRegisterBook,normValue} from './statutory-register-data.js';
import {buildStatutoryRegistersPdf} from './statutory-register-pdf.js';
import {renderStatutoryRegisterDocument} from './statutory-register-annual-ui.js';
import {buildGroupedRegister} from './statutory-register-annual-layout.js';
import {registerLabel,registerKind,describeStatutorySheet,isManagerRegister,normalizeRegisterName,ensureChargeRegister,ensureReferenceParticulars,visibleRegisterIndices,registerGroupIndices} from './statutory-register-review.js';
import {formatStatutoryNumberByKind,normalizeStatutoryNumberByKind} from './statutory-number-format.js';
import {referenceKind,referenceFieldIndex} from './statutory-register-reference.js';
import {formatMemberFolioNumber} from './statutory-member-folio-format.js';
import {browserDownload,saveOrShareFile} from './file-transfer.js';
import {Capacitor} from '@capacitor/core';
import {savePdfToAndroidFiles} from './native-pdf-save.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const act=(label,action,id='',style='secondary')=>'<button type="button" class="btn '+style+'" data-action="'+action+'" data-id="'+esc(id)+'">'+esc(label)+'</button>';
const missing=e=>/not found|object not found|404|no such key/i.test(String(e?.message||e?.statusCode||e?.error||''));
const ROW_PAGE=35,LIST_PAGE=25;
const numeric=v=>Math.max(0,Number(v)||0);

export function createRegisterBookTab({db,bucket='dms-private',getUser,getCompanies}){
 const storage=db?.storage?.from(bucket);
 const state={
  userId:'',loaded:false,loading:false,saving:false,error:'',message:'',
  search:'',page:0,available:new Set(),selectedId:null,book:null,
  originalUpdatedAt:null,dirty:false,sheetIndex:0,rowPage:0,
  reviewMode:'review',reviewQuery:'',reviewStatus:'all',reviewPage:0,reviewExpanded:'',showBlankFields:false,
  importPreview:null,importFilename:'',importing:false,originalDocs:[],
  historyOpen:false,historyItems:[],historyPreview:null,historyPreviewName:'',
  historyLoading:false,historyLoaded:false
 };
 let renderHook=null;
 const afterRender=fn=>{renderHook=fn;};
 const notify=()=>renderHook?.();
 const path=(uid,cid)=>uid+'/statutory-registers/'+cid+'.json';
 const status=(message,error='')=>{state.message=message;state.error=error;notify();};
 function reset(){
  Object.assign(state,{userId:'',loaded:false,loading:false,saving:false,error:'',message:'',
   search:'',page:0,available:new Set(),selectedId:null,book:null,originalUpdatedAt:null,
   dirty:false,sheetIndex:0,rowPage:0,reviewMode:'review',reviewQuery:'',reviewStatus:'all',reviewPage:0,reviewExpanded:'',showBlankFields:false,
    importPreview:null,importFilename:'',importing:false,originalDocs:[],
    historyOpen:false,historyItems:[],historyPreview:null,historyPreviewName:'',
    historyLoading:false,historyLoaded:false});
 }
 function canLeave(){
  return !state.dirty||window.confirm('Your Statutory Registers have unsaved edits. Leave without saving?');
 }
 async function load(force=false){
  const user=getUser?.();
  if(!user?.id){reset();notify();return;}
  if(state.loading||state.saving)return;
  if(!force&&state.loaded&&state.userId===user.id&&
   (getCompanies?.()||[]).every(company=>!company?.id||state.available.has(company.id)))return;
  if(state.userId!==user.id)reset();
  state.userId=user.id;state.loading=true;state.error='';notify();
  try{
   const files=new Set();
   for(let offset=0;offset<10000;offset+=1000){
    const {data,error}=await storage.list(user.id+'/statutory-registers',{limit:1000,offset});
    if(error)throw Error('Cannot list saved registers: '+error.message);
    for(const entry of data||[]){
     if(entry.id&&/^[a-zA-Z0-9_-]+\.json$/.test(entry.name))files.add(entry.name.slice(0,-5));
    }
    if((data||[]).length<1000)break;
   }
   if(getUser?.()?.id!==user.id)return;
   state.available=files;state.loaded=true;
   const companies=(getCompanies?.()||[]).filter(company=>company?.id);
   const absent=companies.filter(company=>!files.has(company.id));
   if(absent.length){
    state.message='Creating standard blank statutory registers for '+absent.length+' companies…';
    notify();
    const result=await createMissingRegisterTemplates(user.id,absent,files);
    if(getUser?.()?.id===user.id&&state.userId===user.id){
     state.message=result.created+' missing company register set(s) created using the existing DMS layout. '+
      'No director, member, charge or other statutory particulars have been assumed.';
     if(result.failed.length)
      state.error='Unable to create '+result.failed.length+' register set(s): '+result.failed.slice(0,2).join(' | ')+
       '. Select Refresh to retry without overwriting saved records.';
    }
   }
  }catch(error){state.error=String(error?.message||error);}
  finally{state.loading=false;notify();}
 }
 /** Only insert absent templates: never replace imported worksheets or edited history. */
 async function createMissingRegisterTemplates(uid,companies,available){
  const pending=(companies||[]).filter(company=>company?.id&&!available.has(company.id));
  const outcome={created:0,existing:0,failed:[]};
  let cursor=0,processed=0;
  async function worker(){
   while(cursor<pending.length){
    const company=pending[cursor++];
    if(getUser?.()?.id!==uid||state.userId!==uid)return;
    try{
     // Recheck Storage: another device may have saved this company after list().
     const existing=await remoteBook(uid,company.id);
     if(existing){
      outcome.existing++;
     }else{
      const book=makeRegisterBook(company);
      ensureChargeRegister(book);
      validateRegisterBook(book);
      if(getUser?.()?.id!==uid||state.userId!==uid)return;
      const body=new Blob([JSON.stringify(book)],{type:'application/json'});
      const {error}=await storage.upload(path(uid,company.id),body,{
       upsert:false,contentType:'application/json',cacheControl:'0'
      });
      if(error){
       // A concurrent create is not an error, but a real storage failure is.
       const concurrent=await remoteBook(uid,company.id);
       if(!concurrent)throw Error(error.message||'Unable to create standard register.');
       outcome.existing++;
      }else outcome.created++;
     }
     if(getUser?.()?.id===uid&&state.userId===uid)available.add(company.id);
    }catch(error){
     outcome.failed.push(company.name+': '+String(error?.message||error));
    }finally{
     processed++;
     if(processed%5===0||processed===pending.length){
      if(getUser?.()?.id===uid&&state.userId===uid){
       state.message='Standardizing statutory register templates: '+processed+' / '+pending.length+' checked…';
       notify();
      }
     }
    }
   }
  }
  await Promise.all(Array.from({length:Math.min(3,pending.length)},()=>worker()));
  return outcome;
 }
 async function remoteBook(uid,cid){
  const response=await storage.download(path(uid,cid));
  if(response.error){
   if(missing(response.error))return null;
   throw Error('Cannot read saved register: '+response.error.message);
  }
  let value;
  try{value=JSON.parse(await response.data.text());}
  catch{throw Error('Saved statutory register JSON is damaged. Nothing has been changed.');}
  validateRegisterBook(value);
  if(value.companyId!==cid)throw Error('Stored register belongs to a different company.');
  return value;
 }

 async function legacyOriginals(cid){
  const {data:folders,error}=await db.from('folders').select('id').eq('company_id',cid)
   .is('parent_id',null).ilike('name','Register Book').limit(5);
  if(error)throw Error('Could not locate original Register Book files: '+error.message);
  const docs=[];
  for(const folder of folders||[]){
   const {data,error:e}=await db.from('documents').select('id,name,storage_path,size_bytes')
    .eq('folder_id',folder.id).order('name').limit(500);
   if(e)throw Error('Cannot list original Register Book files: '+e.message);
   docs.push(...(data||[]));
  }
  return docs;
 }
 async function downloadOriginal(id){
  const doc=state.originalDocs.find(d=>d.id===id);
  if(!doc)throw Error('Original archived document not found.');
  const {data,error}=await storage.createSignedUrl(doc.storage_path,120,{download:doc.name});
  if(error)throw Error('Cannot access original Register Book: '+error.message);
  const res=await fetch(data.signedUrl,{cache:'no-store'});
  if(!res.ok)throw Error('Original Register Book download failed (HTTP '+res.status+').');
  const blob=await res.blob();
  if(Capacitor.isNativePlatform())await saveOrShareFile(blob,doc.name,{preferShare:true});
  else browserDownload(blob,doc.name);
 }

 async function openCompany(id){
  const company=(getCompanies?.()||[]).find(c=>c.id===id);
  if(!company)throw Error('Company is not in your DMS portfolio.');
  if(state.selectedId===id)return;
  if(!canLeave())return;
  const uid=getUser?.()?.id;if(!uid)throw Error('Sign in first.');
  state.loading=true;state.error='';state.message='Loading '+company.name+' registers…';notify();
  try{
   const [saved,originalDocs]=await Promise.all([remoteBook(uid,id),legacyOriginals(id)]);
   const book=saved||makeRegisterBook(company);
   const chargesAdded=ensureChargeRegister(book);
   const referenceAdded=ensureReferenceParticulars(book);
   const changed=chargesAdded||referenceAdded;
   if(getUser?.()?.id!==uid)return;
   state.selectedId=id;state.book=book;state.originalUpdatedAt=book.updatedAt;state.originalDocs=originalDocs;
   state.historyOpen=false;state.historyItems=[];state.historyPreview=null;
   state.historyPreviewName='';state.historyLoaded=false;state.historyLoading=false;
   state.dirty=!!changed;
   state.sheetIndex=visibleRegisterIndices(book)[0]??0;
   state.showBlankFields=true; // Always display the reference particulars, including blanks.
   state.message=changed?'Missing MAJUKAYA ENTITI reference fields were added as blank editable particulars. Review and Save Changes to preserve them with a private version backup.':
    book.sourceFile==='Manual entry'?'Register templates follow the MAJUKAYA ENTITI reference. Enter actual particulars before relying on them.':'Statutory registers loaded in MAJUKAYA ENTITI reference sequence.';
  }catch(error){state.error=String(error?.message||error);}
  finally{state.loading=false;notify();}
 }
 function closeCompany(){
  if(!canLeave())return;
  state.selectedId=null;state.book=null;state.originalDocs=[];state.dirty=false;state.message='';
  state.historyOpen=false;state.historyItems=[];state.historyPreview=null;
  state.historyPreviewName='';state.historyLoaded=false;notify();
 }
 function renderEditor(){
  const book=state.book;
  const company=(getCompanies?.()||[]).find(c=>c.id===state.selectedId);
  if(!book||!company)return '';
  const sheet=book.sheets[state.sheetIndex];
  const name=sheet?registerLabel(sheet.name):'No register selected';
  return '<div class="rb-editor">'+
   '<div class="rb-editor-top">'+act('← All Companies','sr-close')+
   '<div><h2>'+esc(company.name)+'</h2><p class="muted">'+esc(company.registration_no||'No registration number')+
   ' · '+esc(book.sourceFile||'Manually created records')+'</p></div></div>'+
   '<div class="rb-editor-actions">'+act('Save Changes','sr-save','','primary')+
    act('Previous Versions','sr-history')+
    (state.dirty?act('Discard Unsaved Edits','sr-discard'):'')+
    (sheet&&!isManagerRegister(sheet.name)?act('Export This Register PDF','sr-pdf','','secondary'):'')+
    act('Export Combined Registers PDF','sr-pdf-combined','','secondary')+
    act('Add Register','sr-add-sheet')+
    '<span class="rb-dirty" id="sr-dirty">'+(state.dirty?'Unsaved changes':'All changes saved')+'</span></div>'+
   '<div class="sr-registers-label">Register sequencing and particulars based on MAJUKAYA ENTITI SDN. BHD. · Verify blank fields against company records:</div>'+
   '<div class="rb-sheet-tabs">'+visibleRegisterIndices(book).map(i=>'<button type="button" class="rb-sheet-tab '+
     (i===state.sheetIndex?'active':'')+'" data-action="sr-sheet" data-id="'+i+'">'+esc(registerLabel(book.sheets[i].name))+'</button>').join('')+'</div>'+
   (sheet&&!isManagerRegister(sheet.name)?'<div class="sr-register-controls">'+
     '<strong>'+esc(name)+'</strong>'+
     (registerKind(sheet.name)==='profile'?'':act(registerKind(sheet.name)==='member'?'Add Member Folio':'Add Entry','sr-add-row')+act('Add Field','sr-add-col'))+
     act(registerKind(sheet.name)==='profile'?'Edit Address Below':'Rename Register',registerKind(sheet.name)==='profile'?'sr-focus-address':'sr-rename-sheet')+
     act(state.showBlankFields?'Hide Blank Fields':'Show Blank Fields','sr-show-blank-fields')+
     (registerGroupIndices(book,state.sheetIndex).some(i=>
      Object.keys(book.removedEntries||{}).some(k=>k.startsWith(i+':')&&book.removedEntries[k])||
      Object.keys(book.removedFields||{}).some(k=>k.startsWith(i+':')&&book.removedFields[k])
     )?act('Restore Removed Items','sr-restore-removed'):'')+
     '</div><p class="muted sr-register-hint">One register is displayed at a time. Edit the particulars directly and choose Save Changes. The PDF contains this register only, using the same format shown here.</p>'+
     renderStatutoryRegisterDocument(book,state.sheetIndex,{showBlanks:state.showBlankFields}):
     '<div class="rb-help">Select Add Register to begin.</div>')+
   (state.originalDocs.length?'<details class="rb-originals"><summary>Preserved original Register Book files ('+state.originalDocs.length+')</summary><p class="muted">Original files remain securely archived, even though their former Documents folders are hidden.</p>'+state.originalDocs.map(d=>'<div class="rb-original-row"><span>'+esc(d.name)+'</span>'+act('Download Original','sr-original',d.id)+'</div>').join('')+'</details>':'')+
   '<p class="rb-footnote muted">Working statutory register particulars. Verify information against SSM filings and the original documents before relying on these records. Changes are saved privately.</p></div>';
 }

 function dateLabel(value){
  if(!value)return 'Date unavailable';
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime()))return 'Date unavailable';
  return parsed.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',
   hour:'2-digit',minute:'2-digit'});
 }
 function renderHistory(){
  const book=state.book;
  const names=book?.sheets?.map(s=>registerLabel(s.name)).filter(Boolean)||[];
  const backup=state.historyPreview;
  const backupNames=backup?.sheets?.map(s=>registerLabel(s.name)).filter(Boolean)||[];
  return '<div class="rb-editor rb-history">'+
   '<div class="rb-editor-top">'+act('← Back to Registers','sr-history-close')+
   '<div><h2>Previous Versions</h2><p class="muted">'+esc(book?.companyName||'Company')+
   ' · '+esc(book?.registrationNo||'')+'</p></div></div>'+
   '<p class="rb-help">Choose a snapshot from before your edits. Preview it before restoring. '+
   'The current saved version will be backed up again when you restore, allowing you to reverse the operation.</p>'+
   '<div class="rb-history-current"><strong>Current saved version</strong><span>'+
    esc(dateLabel(state.originalUpdatedAt))+' · '+names.length+' register sections</span></div>'+
   (state.historyLoading?'<p class="muted" role="status">Loading private version history…</p>':'')+
   (state.historyLoaded&&!state.historyItems.length?
    '<div class="rb-help">No earlier saved versions were found for this company. '+
    'If you have not saved the recent changes, use Discard Unsaved Edits instead.</div>':'')+
   '<div class="rb-history-list">'+state.historyItems.map(entry=>
    '<div class="rb-history-row"><div><strong>'+esc(dateLabel(entry.created_at||entry.updated_at))+
    '</strong><span class="muted">Earlier saved snapshot · '+esc(entry.name.replace(/\.json$/,''))+'</span></div>'+
    act(state.historyPreviewName===entry.name?'Selected':'Preview Version','sr-history-preview',entry.name,
     state.historyPreviewName===entry.name?'primary':'secondary')+'</div>').join('')+'</div>'+
   (backup?'<section class="rb-history-preview"><h3>Version preview</h3>'+
    '<p><strong>Saved data date:</strong> '+esc(dateLabel(backup.updatedAt))+'</p>'+
    '<p><strong>Imported source:</strong> '+esc(backup.sourceFile||'Manually created')+'</p>'+
    '<p><strong>Registers:</strong> '+backupNames.length+
    ' · <strong>Worksheet entries:</strong> '+backup.sheets.reduce((n,s)=>n+s.rows.length,0)+'</p>'+
    '<div class="rb-history-tags">'+backupNames.slice(0,32).map(n=>'<span>'+esc(n)+'</span>').join('')+'</div>'+
    '<p class="muted">Restoration replaces all saved statutory registers for this company with the selected snapshot. It does not affect other companies or DMS tabs.</p>'+
    act('Restore This Version','sr-history-restore','','primary')+'</section>':'')+
   '<p class="rb-footnote muted">History is private to your signed-in DMS account. '+
   'Only versions previously saved with backup support can be restored here.</p></div>';
 }

 function renderPreview(){
  const p=state.importPreview;
  if(!p)return '';
  return '<div class="rb-import-preview"><h3>Review ZIP import</h3><p class="muted">'+esc(state.importFilename)+
    ' · '+p.matched+' matched · '+p.unmatched+' skipped. Existing worksheets will be preserved; changed imported versions are appended without overwriting edits.</p>'+
    '<div class="rb-preview-rows">'+p.rows.map(r=>'<div class="rb-preview-row"><strong>'+esc(r.path)+'</strong><span>'+
     (r.company?'✓ '+esc(r.company.name)+' · '+r.sheets.length+' worksheets · '+esc(r.status):'⚠ '+esc(r.error))+
     '</span></div>').join('')+'</div>'+
    '<div class="rb-editor-actions">'+act('Import '+p.matched+' matched registers','sr-import','','primary')+
     act('Cancel','sr-cancel-import')+'</div></div>';
 }
 function renderDirectory(){
  const companies=(getCompanies?.()||[]).filter(c=>c?.id);
  const q=state.search.trim().toLowerCase();
  const filtered=companies.filter(c=>(c.name+' '+(c.registration_no||'')).toLowerCase().includes(q));
  const pages=Math.max(1,Math.ceil(filtered.length/LIST_PAGE));
  state.page=Math.min(state.page,pages-1);
  const list=filtered.slice(state.page*LIST_PAGE,(state.page+1)*LIST_PAGE);
  return '<div class="rb-metrics"><div><strong>'+companies.length+'</strong><span>Companies</span></div>'+
   '<div><strong>'+state.available.size+'</strong><span>Editable registers saved</span></div>'+
   '<div><strong>'+filtered.length+'</strong><span>Matching companies</span></div></div>'+
   '<div class="rb-help">Import ZIP files containing Excel Register Books (.xlsx), text-based PDFs or Word (.docx). Excel worksheets and extracted text become editable. Scanned PDFs need manual transcription; older .xls files must be converted to .xlsx. The original ZIP is not published or stored.</div>'+
   '<label class="rb-search-label" for="rb-search">Find company by name or registration number</label>'+
   '<input type="search" id="rb-search" value="'+esc(state.search)+'" placeholder="Search companies"/>'+
   '<div class="rb-table-scroll"><table class="rb-table"><thead><tr><th>No.</th><th>Company</th><th>Registration No.</th><th>Record</th><th>Action</th></tr></thead><tbody>'+
   (list.map((co,i)=>'<tr><td>'+(state.page*LIST_PAGE+i+1)+'</td><td class="rb-company">'+esc(co.name)+'</td>'+
     '<td>'+esc(co.registration_no||'N/A')+'</td><td>'+(state.available.has(co.id)?'Saved editable register':'Not imported')+
     '</td><td>'+act('Open / Edit','sr-open',co.id)+'</td></tr>').join('')||
     '<tr><td colspan="5" class="rb-empty">No matching companies.</td></tr>')+
   '</tbody></table></div><div class="rb-pager"><span>Page '+(state.page+1)+' / '+pages+'</span>'+
   '<button class="btn secondary" data-action="rb-prev" '+(state.page===0?'disabled':'')+'>Previous</button>'+
   '<button class="btn secondary" data-action="rb-next" '+(state.page===pages-1?'disabled':'')+'>Next</button></div>';
 }
 function render(){
  return '<section class="rb-workspace"><div class="content-header"><div><p class="eyebrow">COMPANY STATUTORY RECORDS</p>'+
    '<h1>Statutory Registers</h1><p class="muted">View, edit, privately save and export your companies’ statutory registers as PDF.</p></div>'+
    '<div class="header-buttons">'+act('↑ Import Register Book ZIP','sr-pick','','primary')+
    act('Refresh','rb-refresh')+'</div></div>'+
    (state.error?'<div class="rb-error" role="alert">'+esc(state.error)+'</div>':'')+
    (state.message?'<p class="rb-help" role="status">'+esc(state.message)+'</p>':'')+
    (state.loading||state.saving?'<p class="muted" role="status">Processing statutory register records…</p>':'')+
    (state.importPreview?renderPreview():state.selectedId?(state.historyOpen?renderHistory():renderEditor()):renderDirectory())+
    '<input id="sr-zip-input" type="file" accept=".zip,application/zip" hidden />'+
   '</section>';
 }
 function updateCell(target){
  const r=Number(target.dataset.r),c=Number(target.dataset.c);
  const s=target.dataset.s===undefined?state.sheetIndex:Number(target.dataset.s);
  const sheet=state.book?.sheets?.[s];
  if(!sheet||!Number.isInteger(r)||!Number.isInteger(c)||r<0||c<0||r>=sheet.rows.length||c>=250)return false;
  const kind=target.dataset.numericKind||'';
  const input=normValue(target.value);
  // Merely tabbing out of a prettified numeric field must not alter saved
  // source data or mark the register as dirty.
  const current=String(sheet.rows[r][c]||'');
  const isMemberFolio=registerKind(sheet.name)==='member'&&c>0&&
   /^folio\s*(?:no\.?|number):?$/i.test(String(sheet.rows[r]?.[c-1]||'').trim());
  // Do not mark an unchanged historic "1" dirty if displayed as "001".
  if(isMemberFolio&&formatMemberFolioNumber(current)===formatMemberFolioNumber(input))
   return true;
  if(kind&&formatStatutoryNumberByKind(kind,current)===input)return true;
  const value=isMemberFolio?formatMemberFolioNumber(input):
   kind?normValue(normalizeStatutoryNumberByKind(kind,input)):input;
  if(target.dataset.mergeAddress==='true'){
   const additional=[];
   for(let i=r+1;i<sheet.rows.length;i++){
    const row=sheet.rows[i]||[];
    if(String(row[c-1]||'').trim()||!String(row[c]||'').trim())break;
    additional.push(i);
   }
   if(!additional.length&&(sheet.rows[r][c]||'')===value)return true;
   sheet.rows[r][c]=value;
   for(const i of additional)sheet.rows[i][c]='';
  }else{
   if((sheet.rows[r][c]||'')===value)return true;
   sheet.rows[r][c]=value;
  }
  state.dirty=true;
  const marker=document.getElementById('sr-dirty');if(marker)marker.textContent='Unsaved changes';
  return true;
 }
 function command(action,id=''){
  if(action==='rb-prev'||action==='rb-next'){state.page=Math.max(0,state.page+(action==='rb-next'?1:-1));notify();return true;}
  if(action==='sr-sheet'){
   const n=Number(id);
   if(Number.isInteger(n)&&n>=0&&n<(state.book?.sheets?.length||0)&&!isManagerRegister(state.book.sheets[n].name)){
    state.sheetIndex=n;notify(); // Keep the user's field visibility choice across tabs.
   }return true;
  }
  if(action==='sr-set-status'){
   const match=/^(\d+):(\d+):(current|former)$/.exec(String(id));
   if(!match)return true;
   const si=Number(match[1]),ri=Number(match[2]),choice=match[3];
   if(!registerGroupIndices(state.book,state.sheetIndex).includes(si))return true;
   const sheet=state.book?.sheets?.[si];
   if(!sheet||ri<0||ri>=sheet.rows.length)return true;
   const projection=buildGroupedRegister(state.book,state.sheetIndex,{showBlanks:true});
   const entry=projection.blocks.find(b=>b.type==='record'&&b.sheetIndex===si&&b.row===ri);
   if(!entry)return true;
   if(!window.confirm('Mark "'+entry.title+'" as '+(choice==='former'?'Former':'Current')+
    ' in this statutory register?\n\nThis changes its display classification only. Check the actual cessation or discharge date against SSM records, then Save Changes.'))return true;
   if(!state.book.recordStatuses)state.book.recordStatuses={};
   state.book.recordStatuses[si+':'+ri]=choice;
   state.dirty=true;notify();return true;
  }
  if(action==='sr-set-consideration-rate'){
   const match=/^(\d+):(\d+)$/.exec(String(id));
   if(!match)return true;
   const si=Number(match[1]),ri=Number(match[2]);
   if(registerKind(state.book?.sheets?.[si]?.name)!=='member')return true;
   const section=buildGroupedRegister(state.book,state.sheetIndex,{showBlanks:true});
   const member=section.blocks.find(b=>b.type==='record'&&
    b.sheetIndex===si&&b.row===ri&&b.status==='Current');
   if(!member)return true;
   const key=si+':'+ri;
   const previous=state.book.memberShareRates?.[key]??'';
   const answer=window.prompt(
    'Enter the documented consideration paid per share (RM) for '+member.title+
    '.\n\nCurrent shares held × RM/share determines the displayed consideration. '+
    'Clear the rate to use recorded acquisition ledger amounts when available. '+
    'Do not assume RM1/share without supporting documents.',String(previous));
   if(answer===null)return true;
   const raw=String(answer).trim();
   let rate='';
   if(raw){
    const candidate=raw.replace(/^(?:RM|MYR)\s*/i,'').replace(/,/g,'');
    if(!/^\d+(?:\.\d{1,6})?$/.test(candidate)||!Number.isFinite(Number(candidate))||
      Number(candidate)>1e12)
     throw Error('Enter a valid non-negative RM rate per share (maximum six decimal places).');
    rate=candidate;
   }
   if(rate===String(previous))return true;
   if(!state.book.memberShareRates)state.book.memberShareRates={};
   if(rate)state.book.memberShareRates[key]=rate;
   else delete state.book.memberShareRates[key];
   state.dirty=true;notify();return true;
  }
  if(action==='sr-edit-field'){
   const match=/^(\d+):(\d+):(\d+)$/.exec(String(id));
   if(!match)return true;
   const [si,ri,ci]=match.slice(1).map(Number);
   const sheet=state.book?.sheets?.[si];
   if(!sheet||isManagerRegister(sheet.name)||ri>=sheet.rows.length||ci>=250)return true;
   const key=si+':'+ri+':'+ci;
   const projected=buildGroupedRegister(state.book,state.sheetIndex,{showBlanks:true});
   const shown=projected.blocks.find(block=>block.type==='field'&&
    block.sheetIndex===si&&block.row===ri&&block.col===ci);
   const current=state.book.fieldLabels?.[key]||shown?.label||'';
   const label=window.prompt('Edit the statutory field label:',current);
   if(label===null)return true;
   if(!label.trim())throw Error('Field label must not be blank.');
   if(!state.book.fieldLabels)state.book.fieldLabels={};
   state.book.fieldLabels[key]=normValue(label.trim()).slice(0,120);
   state.dirty=true;notify();return true;
  }
  if(action==='sr-focus-address'){
   document.querySelector('.sr-register-paper textarea[data-merge-address="true"]')?.focus();
   return true;
  }
  if(action==='sr-remove-field'){
   const match=/^(\d+):(\d+):(\d+)$/.exec(String(id));
   if(!match)return true;
   const [si,ri,ci]=match.slice(1).map(Number);
   const sheet=state.book?.sheets?.[si];
   if(!sheet||isManagerRegister(sheet.name)||ri<0||ri>=sheet.rows.length||ci<0||ci>=250)return true;
   if(!registerGroupIndices(state.book,state.sheetIndex).includes(si))return true;
   const projected=buildGroupedRegister(state.book,state.sheetIndex,{showBlanks:true});
   const field=projected.blocks.find(b=>b.type==='field'&&b.sheetIndex===si&&b.row===ri&&b.col===ci);
   if(!field)return true;
   if(!window.confirm('Remove "'+field.label+'" from this statutory register and its PDF export?\n\nThis change takes effect when you select Save Changes. The original imported values remain recoverable.'))return true;
   if(!state.book.removedFields)state.book.removedFields={};
   state.book.removedFields[id]=true;
   state.dirty=true;notify();return true;
  }
  if(action==='sr-delete-entry'){
   const match=/^(\d+):(\d+)$/.exec(String(id));
   if(!match)return true;
   const [si,ri]=match.slice(1).map(Number);
   const sheet=state.book?.sheets?.[si];
   if(!sheet||isManagerRegister(sheet.name)||ri<0||ri>=sheet.rows.length)return true;
   if(!registerGroupIndices(state.book,state.sheetIndex).includes(si))return true;
   const projected=buildGroupedRegister(state.book,state.sheetIndex,{showBlanks:true});
   const entry=projected.blocks.find(b=>b.type==='record'&&b.sheetIndex===si&&b.row===ri);
   if(!entry)return true;
   if(!window.confirm('Delete the entry "'+entry.title+'" from this register and its PDF export?\n\nSave Changes to apply. The original record remains in the secure archive.'))return true;
   if(!state.book.removedEntries)state.book.removedEntries={};
   state.book.removedEntries[id]=true;
   state.dirty=true;notify();return true;
  }
  if(action==='sr-restore-removed'){
   const group=registerGroupIndices(state.book,state.sheetIndex);
   if(!group.length)return true;
   if(!window.confirm('Restore all previously removed entries and fields in this register? Save Changes to apply.'))return true;
   let count=0;
   for(const prop of ['removedEntries','removedFields']){
    const mapping=state.book[prop]||{};
    for(const key of Object.keys(mapping)){
     if(group.some(i=>key.startsWith(i+':'))){delete mapping[key];count++;}
    }
   }
   if(count){state.dirty=true;notify();}
   return true;
  }

  if(action==='sr-show-blank-fields'){state.showBlankFields=!state.showBlankFields;notify();return true;}
  if(action==='sr-history-close'){
   state.historyOpen=false;state.historyPreview=null;state.historyPreviewName='';notify();return true;
  }
  if(action==='sr-close'){closeCompany();return true;}
  if(action==='sr-cancel-import'){state.importPreview=null;state.importFilename='';notify();return true;}
  if(action==='sr-original'){void downloadOriginal(id).catch(error=>status('',error?.message||String(error)));return true;}
  if(action==='sr-add-row'){
   const sheet=state.book?.sheets?.[state.sheetIndex];
   if(!sheet)return true;
   if(registerKind(sheet.name)==='member'){
    if(state.book.sheets.length>=100)throw Error('Maximum of 100 statutory registers.');
    let n=1;
    while(state.book.sheets.some(s=>new RegExp('^Register of Members 0*'+n+'(?:\\s|$)','i').test(s.name)))n++;
    const folioName='Register of Members '+String(n).padStart(3,'0');
    const firstIndex=state.book.sheets.findIndex(s=>registerLabel(s.name)==='Register of Members');
    state.book.sheets.push({name:folioName,rows:[
     ['Folio No.:',formatMemberFolioNumber(String(n))],['Name:','New member'],['Date of Birth:',''],['ID Type:',''],
     ['Nationality/Origin:',''],['Identification No.:',''],['Race:',''],
     ['Occupation:',''],['Email Address:',''],['Address:',''],
     ['Date Entered as A Member:',''],['Date Ceased to be A Member:',''],
     ['Total Shares Held:',''],
     ['SHARES ACQUIRED','','','','','','','SHARES TRANSFERRED'],
     ['Date','No. of Share Certificate','Allotment or Transfer No.','Folio',
      'Class of Shares','No. of Shares','Consideration','Date','Transfer No.',
      'Folio','Class of Shares','No. of Shares','Consideration','Balance of Shares']
    ]});
    state.sheetIndex=firstIndex>=0?firstIndex:state.book.sheets.length-1;state.showBlankFields=true;
    state.dirty=true;notify();return true;
   }
   if(sheet.rows.length>=12000)throw Error('Maximum 12,000 entries in a register.');
   const kind=registerKind(sheet.name);
   if(kind==='profile'){
    const label=window.prompt('Name of the new company particular (for example, Business Address):');
    if(!label?.trim())return true;
    sheet.rows.push([label.trim().replace(/:$/,'')+':','']);
   }else if(kind==='text'){
    const value=window.prompt('New statutory record text:');
    if(value===null)return true;
    sheet.rows.push([normValue(value||'New entry')]);
   }else if(kind==='table'){
    const description=describeStatutorySheet(sheet);
    // Allotments starts with Date; prompt for the allottee's name and insert
    // it in the correct named field instead of corrupting the date column.
    const rk=referenceKind(sheet.name);
    const prompts={
     directors:['Director Name','Name of director:'],
     allotments:["Allottee's Name","Name of allottee:"],
     transfers:['Transfer No.','Transfer reference number:'],
     charges:['Registered No.','Registered charge number:'],
     secretaries:['Full Name','Name of secretary:'],
     beneficialOwners:['Full Name','Name of beneficial owner:']
    };
    const [target,prompt]=prompts[rk]||['','Name or reference for the new register entry:'];
    const value=window.prompt(prompt);
    if(!value?.trim())return true;
    const width=Math.max(1,...sheet.rows.map(r=>r.length));
    const record=Array.from({length:Math.min(250,width)},()=> '');
    const header=description.headerRow>=0?sheet.rows[description.headerRow]:[];
    const wanted=referenceFieldIndex(rk,target);
    const index=wanted>=0?header.findIndex(label=>referenceFieldIndex(rk,label)===wanted):-1;
    record[index>=0&&index<record.length?index:0]=normValue(value);
    sheet.rows.push(record);
    if(description.headerRow===-1)state.showBlankFields=true;
   }else{
    const value=window.prompt('New register entry or description:');
    if(!value?.trim())return true;
    sheet.rows.push([normValue(value)]);
   }
   state.showBlankFields=true;state.dirty=true;notify();return true;
  }
  if(action==='sr-add-col'){
   const sheet=state.book?.sheets?.[state.sheetIndex];if(!sheet)return true;
   const label=window.prompt('Field label (for example, Date of Appointment):');
   if(!label?.trim())return true;
   const kind=registerKind(sheet.name);
   if(kind==='profile'||kind==='member'){
    if(sheet.rows.length>=12000)throw Error('Maximum 12,000 rows.');
    // New particulars are labelled pairs, not Excel columns.
    const last=kind==='member'?sheet.rows.findIndex(row=>row.some(v=>/^shares acquired$/i.test(v))):-1;
    const at=last>=0?last:sheet.rows.length;
    sheet.rows.splice(at,0,[label.trim().replace(/:$/,'')+':','']);
   }else{
    const description=describeStatutorySheet(sheet);
    if(kind==='table'&&description.headerRow>=0){
     const header=sheet.rows[description.headerRow];
     const width=Math.max(0,...sheet.rows.map(row=>row.length));
     if(width>=250)throw Error('Maximum 250 fields.');
     header[width]=normValue(label);
     for(const row of sheet.rows)if(row.length<width+1)row[width]='';
    }else{
     if(sheet.rows.length>=12000)throw Error('Maximum 12,000 entries.');
     sheet.rows.push([label.trim().replace(/:$/,'')+':','']);
    }
   }
   state.showBlankFields=true;state.dirty=true;notify();return true;
  }
  if(action==='sr-add-sheet'){
   if(state.book.sheets.length>=100)throw Error('Maximum 100 statutory registers.');
   const name=window.prompt('New statutory register name (for example, Register of Charges):');
   if(!name?.trim())return true;
   const clean=normalizeRegisterName(name.trim());
   if(state.book.sheets.some(s=>registerLabel(s.name).toLowerCase()===clean.toLowerCase()))throw Error('A register with this name already exists.');
   state.book.sheets.push({name:clean,rows:[['Name','Identification / Reference','Date','Particulars']]});
   state.sheetIndex=state.book.sheets.length-1;state.showBlankFields=true;state.dirty=true;notify();return true;
  }
  if(action==='sr-rename-sheet'){
   const sheet=state.book.sheets[state.sheetIndex];
   const name=window.prompt('Register name:',sheet.name);
   if(name?.trim()){sheet.name=normalizeRegisterName(name.trim());state.dirty=true;notify();}
   return true;
  }
  return false;
 }
 async function writeBook(book,{expectedUpdatedAt=null,overwrite=false}={}){
  const user=getUser?.();if(!user?.id)throw Error('Please sign in.');
  validateRegisterBook(book);
  const key=path(user.id,book.companyId);
  const current=await remoteBook(user.id,book.companyId);
  if(!overwrite && current && current.updatedAt!==expectedUpdatedAt)
   throw Error('This register was updated on another device. Refresh before saving to avoid overwriting their changes.');
  if(current){
   const backup=user.id+'/statutory-registers/history/'+book.companyId+'-'+Date.now()+'-'+crypto.randomUUID()+'.json';
   const result=await storage.upload(backup,new Blob([JSON.stringify(current)],{type:'application/json'}),
    {upsert:false,contentType:'application/json'});
   if(result.error)throw Error('Could not create private backup: '+result.error.message);
  }
  const updated={...book,updatedAt:new Date().toISOString()};
  const body=new Blob([JSON.stringify(updated)],{type:'application/json'});
  if(body.size>24*1024*1024)throw Error('Register exceeds 24 MB. Split its worksheets.');
  const result=await storage.upload(key,body,{upsert:true,contentType:'application/json',cacheControl:'0'});
  if(result.error)throw Error('Unable to save statutory register: '+result.error.message);
  state.available.add(updated.companyId);return updated;
 }
 async function save(){
  if(!state.book||!state.selectedId)throw Error('Choose a company.');
  state.saving=true;status('Saving your register and backup…');
  try{
   const updated=await writeBook(state.book,{expectedUpdatedAt:state.originalUpdatedAt});
   state.book=updated;state.originalUpdatedAt=updated.updatedAt;state.dirty=false;
   status('Saved successfully. All statutory register worksheets are synchronized privately.');
  }catch(error){state.error=String(error?.message||error);notify();throw error;}
  finally{state.saving=false;notify();}
 }

 async function discardUnsaved(){
  if(!state.selectedId||!state.dirty)return;
  if(!window.confirm('Discard your unsaved statutory register edits and reload the last saved version?'))return;
  const company=(getCompanies?.()||[]).find(c=>c.id===state.selectedId);
  const uid=getUser?.()?.id;if(!uid||!company)throw Error('Sign in and open a company.');
  state.loading=true;state.error='';notify();
  try{
   const saved=await remoteBook(uid,company.id);
   if(getUser?.()?.id!==uid||state.selectedId!==company.id)return;
   const original=saved||makeRegisterBook(company);
   ensureChargeRegister(original);
   state.book=original;state.originalUpdatedAt=original.updatedAt;state.dirty=false;
   state.sheetIndex=Math.max(0,original.sheets.findIndex(s=>!isManagerRegister(s.name)));
   state.message='Unsaved edits discarded. The last saved version is loaded.';
  }finally{state.loading=false;notify();}
 }
 async function openHistory(){
  if(!state.selectedId||!state.book)throw Error('Open a company first.');
  if(state.dirty){
   if(!window.confirm('You have unsaved changes. Discard them and review the previously saved versions?'))return;
   const uid=getUser?.()?.id;if(!uid)throw Error('Sign in first.');
   const saved=await remoteBook(uid,state.selectedId);
   if(!saved)throw Error('No previously saved Statutory Registers found for this company.');
   state.book=saved;state.originalUpdatedAt=saved.updatedAt;state.dirty=false;
  }
  state.historyOpen=true;state.historyPreview=null;state.historyPreviewName='';
  state.historyItems=[];state.historyLoaded=false;state.error='';
  state.historyLoading=true;notify();
  const uid=getUser?.()?.id;
  const companyId=state.selectedId;
  try{
   if(!uid)throw Error('Sign in to view private versions.');
   const prefix=uid+'/statutory-registers/history';
   const matched=[];
   // Search storage by company prefix to avoid pulling other company histories.
   for(let offset=0;offset<300;offset+=100){
    const {data,error}=await storage.list(prefix,{
     limit:100,offset,search:companyId+'-',
     sortBy:{column:'created_at',order:'desc'}
    });
    if(error)throw Error('Could not list previous versions: '+error.message);
    const items=data||[];
    for(const f of items)
     if(typeof f.name==='string'&&f.name.startsWith(companyId+'-')&&
        f.name.endsWith('.json')&&!f.name.includes('/'))matched.push(f);
    if(items.length<100)break;
   }
   if(getUser?.()?.id!==uid||state.selectedId!==companyId)return;
   state.historyItems=matched.sort((a,b)=>
    Date.parse(b.created_at||b.updated_at||0)-Date.parse(a.created_at||a.updated_at||0));
   state.historyLoaded=true;
   state.message=matched.length?matched.length+' earlier version(s) found. Preview before restoring.':
    'No previous saved versions are available for this company.';
  }finally{state.historyLoading=false;notify();}
 }
 async function previewHistory(name){
  if(!state.historyOpen||!state.selectedId)return;
  const found=state.historyItems.find(f=>f.name===name);
  if(!found)throw Error('Please choose a version from the private history list.');
  const uid=getUser?.()?.id,companyId=state.selectedId;
  if(!uid)throw Error('Sign in first.');
  state.historyLoading=true;state.error='';notify();
  try{
   const key=uid+'/statutory-registers/history/'+found.name;
   const {data,error}=await storage.download(key);
   if(error)throw Error('Could not open earlier version: '+error.message);
   let version;
   try{version=JSON.parse(await data.text());}
   catch{throw Error('Earlier saved version is damaged and cannot be restored.');}
   validateRegisterBook(version);
   if(version.companyId!==companyId)throw Error('This version belongs to another company.');
   if(getUser?.()?.id!==uid||state.selectedId!==companyId)return;
   state.historyPreview=version;state.historyPreviewName=name;
  }finally{state.historyLoading=false;notify();}
 }
 async function restoreHistory(){
  const version=state.historyPreview;
  if(!state.historyOpen||!version||!state.historyPreviewName)
   throw Error('Preview an earlier version before restoring it.');
  if(!state.historyItems.some(f=>f.name===state.historyPreviewName))
   throw Error('The selected version is no longer available.');
  if(!state.selectedId||version.companyId!==state.selectedId)
   throw Error('Version and company do not match.');
  const company=(getCompanies?.()||[]).find(c=>c.id===state.selectedId);
  const uid=getUser?.()?.id;
  if(!uid||!company)throw Error('Please sign in and open a company.');
  if(!window.confirm('Restore the previous saved Statutory Registers for '+company.name+
   '?\n\nThis replaces the CURRENT saved register information for this company only.'+
   '\nA new private backup of the current version will be created first.'))return;
  state.saving=true;state.error='';notify();
  try{
   // Normal optimistic-concurrency save. It refuses changes from other devices
   // and backs up the CURRENT value before overwriting the company file.
   const restored=structuredClone(version);
   restored.companyId=company.id;
   restored.companyName=company.name;
   restored.registrationNo=company.registration_no||restored.registrationNo||'';
   const updated=await writeBook(restored,{expectedUpdatedAt:state.originalUpdatedAt});
   if(getUser?.()?.id!==uid)return;
   state.book=updated;state.originalUpdatedAt=updated.updatedAt;state.dirty=false;
   ensureChargeRegister(state.book);
   state.sheetIndex=Math.max(0,state.book.sheets.findIndex(s=>!isManagerRegister(s.name)));
   state.historyOpen=false;state.historyItems=[];state.historyPreview=null;
   state.historyPreviewName='';state.historyLoaded=false;
   state.message='Previous saved Statutory Registers restored for '+company.name+
    '. A backup of the replaced version is preserved.';
  }finally{state.saving=false;notify();}
 }

 async function readZip(file){
  if(state.dirty&&!canLeave())return;
  state.loading=true;state.importFilename=file?.name||'';state.importPreview=null;state.error='';
  try{
   state.importPreview=await previewStatutoryZip(file,getCompanies(),{onProgress:m=>{state.message=m;notify();}});
   state.message='Review all ZIP matches before import. No current data has been replaced.';
  }catch(error){state.error=String(error?.message||error);throw error;}
  finally{state.loading=false;notify();}
 }
 async function importZip(){
  const p=state.importPreview;
  if(!p||!p.matched)throw Error('No suitable company Register Books matched the ZIP.');
  if(!window.confirm('Embed '+p.matched+' company register files as editable data? Existing edited worksheets will remain intact. Changed versions will be added separately and previous saved registers backed up.'))return;
  state.saving=true;state.error='';
  const failed=[];let saved=0,added=0,skipped=0;
  try{
   for(const row of p.rows.filter(r=>r.company)){
    try{
     const uid=getUser?.()?.id;if(!uid)throw Error('Sign in first.');
     const existing=await remoteBook(uid,row.company.id);
     const incoming=makeRegisterBook(row.company,row);
     const merged=mergeRegisterBooks(existing,incoming);
     ensureChargeRegister(merged.book);
     skipped+=merged.skipped;
     if(merged.added){
      const updated=await writeBook(merged.book,{expectedUpdatedAt:existing?.updatedAt||null});
      added+=merged.added;saved++;
      if(state.selectedId===row.company.id){
       state.book=updated;state.originalUpdatedAt=updated.updatedAt;state.dirty=false;
      }
     }
    }catch(e){failed.push(row.path+': '+(e?.message||e));}
    state.message='Embedded '+saved+' company registers so far; '+failed.length+' errors';notify();
   }
   if(!failed.length){state.importPreview=null;state.importFilename='';}
   state.message='Embedded '+added+' editable sections across '+saved+' companies; '+skipped+
    ' identical worksheets skipped; '+p.unmatched+' unmatched files skipped.'+
    (failed.length?' Errors: '+failed.slice(0,3).join(' | '):'');
  }finally{state.saving=false;notify();}
 }
 async function pdf({combined=false}={}){
  if(!state.book)throw Error('Select a company.');
  state.saving=true;state.error='';status('Generating statutory register PDF…');
  try{
   const blob=await buildStatutoryRegistersPdf(state.book,{sheetIndex:state.sheetIndex,combined,showBlanks:state.showBlankFields,onProgress:message=>{state.message=message;notify();}});
   const safe=String(state.book.companyName||'Company').replace(/[\\/:*?"<>|]/g,'_').slice(0,110);
   const type=registerLabel(state.book.sheets[state.sheetIndex]?.name||'Register of Other Records').replace(/[\\/:*?"<>|]/g,'_');
   const filename=combined?'Statutory Registers_Combined_'+safe+'.pdf':'Statutory Register_'+type+'_'+safe+'.pdf';
   if(Capacitor.isNativePlatform()){
    await savePdfToAndroidFiles(blob,filename);
    status('PDF saved to your chosen Android folder.');
   }else{
    browserDownload(blob,filename);
    status('PDF download started. Check browser Downloads.');
   }
  }finally{state.saving=false;notify();}
 }
 function search(value){state.search=String(value||'');state.page=0;notify();}
 function searchReview(value){state.reviewQuery=String(value||'');state.reviewPage=0;state.reviewExpanded='';notify();}
 return {state,afterRender,reset,canLeave,load,render,search,openCompany,closeCompany,updateCell,command,
  readZip,importZip,save,pdf,downloadOriginal,searchReview,
  openHistory,previewHistory,restoreHistory,discardUnsaved};
}
