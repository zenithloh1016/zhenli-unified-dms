/**
 * ZHENLI Statutory Registers: editable worksheets persisted per company in
 * private Supabase Storage. No new SQL table or repository-stored client data.
 */
import {previewStatutoryZip,makeRegisterBook,mergeRegisterBooks,validateRegisterBook,normValue} from './statutory-register-data.js';
import {buildStatutoryRegistersPdf} from './statutory-register-pdf.js';
import {renderReadableRegister} from './statutory-register-review-ui.js';
import {registerLabel} from './statutory-register-review.js';
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
  importPreview:null,importFilename:'',importing:false,originalDocs:[]
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
    importPreview:null,importFilename:'',importing:false,originalDocs:[]});
 }
 function canLeave(){
  return !state.dirty||window.confirm('Your Statutory Registers have unsaved edits. Leave without saving?');
 }
 async function load(force=false){
  const user=getUser?.();
  if(!user?.id){reset();notify();return;}
  if(state.loading||state.saving)return;
  if(!force&&state.loaded&&state.userId===user.id)return;
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
  }catch(error){state.error=String(error?.message||error);}
  finally{state.loading=false;notify();}
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
   if(getUser?.()?.id!==uid)return;
   state.selectedId=id;state.book=book;state.originalUpdatedAt=book.updatedAt;state.originalDocs=originalDocs;
   state.dirty=false;state.sheetIndex=0;state.rowPage=0;
   state.reviewMode='review';state.reviewQuery='';state.reviewStatus='all';state.reviewPage=0;state.reviewExpanded='';state.showBlankFields=false;
   state.message=book.sourceFile==='Manual entry'?'No imported register yet. Editable statutory register templates are ready.':'Statutory registers loaded. Edit any cell, then select Save Changes.';
  }catch(error){state.error=String(error?.message||error);}
  finally{state.loading=false;notify();}
 }
 function closeCompany(){
  if(!canLeave())return;
  state.selectedId=null;state.book=null;state.originalDocs=[];state.dirty=false;state.message='';notify();
 }
 function pageRows(){
  const sheet=state.book?.sheets[state.sheetIndex];
  const rows=sheet?.rows||[];
  const pages=Math.max(1,Math.ceil(rows.length/ROW_PAGE));
  state.rowPage=Math.min(state.rowPage,pages-1);
  return {rows:rows.slice(state.rowPage*ROW_PAGE,(state.rowPage+1)*ROW_PAGE),pages};
 }
 function renderEditor(){
  const book=state.book;
  const company=(getCompanies?.()||[]).find(c=>c.id===state.selectedId);
  if(!book||!company)return '';
  const sheet=book.sheets[state.sheetIndex];
  const view=pageRows();
  const width=Math.max(1,...(sheet?.rows||[]).map(r=>r.length));
  return '<div class="rb-editor">'+
   '<div class="rb-editor-top">'+act('← All Companies','sr-close')+
   '<div><h2>'+esc(company.name)+'</h2><p class="muted">'+esc(company.registration_no||'No registration number')+
   ' · '+esc(book.sourceFile||'Manual entry')+'</p></div></div>'+
   '<div class="rb-editor-actions">'+act('Save Changes','sr-save','','primary')+
    act('Export Register Book PDF','sr-pdf','','secondary')+
    act('Add Worksheet','sr-add-sheet')+
    '<span class="rb-dirty" id="sr-dirty">'+(state.dirty?'Unsaved changes':'All changes saved')+'</span></div>'+
   '<div class="rb-sheet-tabs">'+book.sheets.map((s,i)=>'<button type="button" class="rb-sheet-tab '+(i===state.sheetIndex?'active':'')+
     '" data-action="sr-sheet" data-id="'+i+'">'+esc(registerLabel(s.name))+'</button>').join('')+'</div>'+
   '<div class="sr-mode-switch"><span class="sr-mode-intro">Display:</span>'+act('Easy Review','sr-mode-review','',state.reviewMode==='review'?'primary':'secondary')+
    act('Original Worksheet','sr-mode-worksheet','',state.reviewMode==='worksheet'?'primary':'secondary')+'</div>'+
   (state.reviewMode==='review'?renderReadableRegister(book,state.sheetIndex,state):
   (sheet?'<div class="rb-sheet-tools">'+
      act('+ Add Row','sr-add-row')+act('+ Add Column','sr-add-col')+act('Rename Worksheet','sr-rename-sheet')+
      '<span class="muted">'+sheet.rows.length+' rows · '+width+' columns</span></div>'+
     '<p class="muted rb-edit-help">Edit the cells below directly. Dates, names, shares, register numbers and historical entries remain editable. Changes are not saved until you choose Save Changes.</p>'+
     '<div class="rb-grid-scroll"><table class="rb-grid"><thead><tr><th>Row</th>'+
      Array.from({length:width},(_,i)=>'<th>'+String(i+1)+'</th>').join('')+'<th>Action</th></tr></thead><tbody>'+
      view.rows.map((row,i)=>{
       const actual=state.rowPage*ROW_PAGE+i;
       return '<tr><th>'+String(actual+1)+'</th>'+
        Array.from({length:width},(_,j)=>'<td><textarea class="rb-cell" data-r="'+actual+'" data-c="'+j+
          '" aria-label="Row '+(actual+1)+', column '+(j+1)+'" rows="2" maxlength="15000">'+esc(row[j]||'')+'</textarea></td>').join('')+
        '<td>'+act('Remove','sr-delete-row',String(actual))+'</td></tr>';
      }).join('')+'</tbody></table></div>'+
     '<div class="rb-pager"><span>Rows page '+(state.rowPage+1)+' / '+view.pages+'</span>'+
       '<button type="button" class="btn secondary" data-action="sr-prev" '+(state.rowPage===0?'disabled':'')+'>Previous</button>'+
       '<button type="button" class="btn secondary" data-action="sr-next" '+(state.rowPage>=view.pages-1?'disabled':'')+'>Next</button></div>'
    :'<div class="rb-help">No worksheets yet. Select Add Worksheet to begin.</div>'))+
   (state.originalDocs.length?'<details class="rb-originals"><summary>Preserved original Register Book files ('+state.originalDocs.length+')</summary><p class="muted">Original files remain private although their former Documents folder is hidden.</p>'+state.originalDocs.map(d=>'<div class="rb-original-row"><span>'+esc(d.name)+'</span>'+act('Download Original','sr-original',d.id)+'</div>').join('')+'</details>':'')+
   '<p class="rb-footnote muted">These are editable working statutory register records. Verify all imported particulars against the original and relevant SSM filings before relying on them. Saved data is private to your DMS account.</p></div>';
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
    (state.importPreview?renderPreview():state.selectedId?renderEditor():renderDirectory())+
    '<input id="sr-zip-input" type="file" accept=".zip,application/zip" hidden />'+
   '</section>';
 }
 function updateCell(target){
  const r=Number(target.dataset.r),c=Number(target.dataset.c);
  const sheet=state.book?.sheets?.[state.sheetIndex];
  if(!sheet||!Number.isInteger(r)||!Number.isInteger(c)||r<0||c<0||r>=sheet.rows.length||c>=250)return false;
  const value=normValue(target.value);
  if((sheet.rows[r][c]||'')===value)return true;
  sheet.rows[r][c]=value;state.dirty=true;
  const marker=document.getElementById('sr-dirty');if(marker)marker.textContent='Unsaved changes';
  return true;
 }
 function command(action,id=''){
  if(action==='rb-prev'||action==='rb-next'){state.page=Math.max(0,state.page+(action==='rb-next'?1:-1));notify();return true;}
  if(action==='sr-prev'||action==='sr-next'){state.rowPage=Math.max(0,state.rowPage+(action==='sr-next'?1:-1));notify();return true;}
  if(action==='sr-sheet'){
   const n=Number(id);if(Number.isInteger(n)&&n>=0&&n<(state.book?.sheets?.length||0)){
    state.sheetIndex=n;state.rowPage=0;state.reviewPage=0;state.reviewQuery='';state.reviewStatus='all';state.reviewExpanded='';notify();
   }return true;
  }
  if(action==='sr-mode-review'||action==='sr-mode-worksheet'){
   state.reviewMode=action==='sr-mode-review'?'review':'worksheet';notify();return true;
  }
  if(action==='sr-review-filter'){
   if(['all','current','former'].includes(id)){state.reviewStatus=id;state.reviewPage=0;state.reviewExpanded='';notify();}
   return true;
  }
  if(action==='sr-toggle-record'){state.reviewExpanded=state.reviewExpanded===id?'':id;notify();return true;}
  if(action==='sr-show-blank-fields'){state.showBlankFields=!state.showBlankFields;notify();return true;}
  if(action==='sr-review-prev'||action==='sr-review-next'){
   state.reviewPage=Math.max(0,state.reviewPage+(action==='sr-review-next'?1:-1));state.reviewExpanded='';notify();return true;
  }
  if(action==='sr-close'){closeCompany();return true;}
  if(action==='sr-cancel-import'){state.importPreview=null;state.importFilename='';notify();return true;}
  if(action==='sr-original'){void downloadOriginal(id).catch(error=>status('',error?.message||String(error)));return true;}
  if(action==='sr-add-row'){
   const sheet=state.book.sheets[state.sheetIndex],width=Math.max(1,...sheet.rows.map(r=>r.length));
   if(sheet.rows.length>=12000)throw Error('Maximum 12,000 rows in a worksheet.');
   sheet.rows.push(Array(Math.min(width,250)).fill(''));state.rowPage=Math.floor((sheet.rows.length-1)/ROW_PAGE);
   state.reviewMode='worksheet';state.dirty=true;notify();return true;
  }
  if(action==='sr-add-col'){
   const sheet=state.book.sheets[state.sheetIndex],width=Math.max(0,...sheet.rows.map(r=>r.length));
   if(width>=250)throw Error('Maximum 250 columns in a worksheet.');
   if(!sheet.rows.length)sheet.rows.push([]);
   for(const row of sheet.rows)row[width]='';
   state.reviewMode='worksheet';state.dirty=true;notify();return true;
  }
  if(action==='sr-delete-row'){
   if(!window.confirm('Remove this statutory register row? Save Changes to apply the removal.'))return true;
   const sheet=state.book.sheets[state.sheetIndex],n=Number(id);
   if(Number.isInteger(n)&&n>=0&&n<sheet.rows.length){sheet.rows.splice(n,1);state.dirty=true;notify();}
   return true;
  }
  if(action==='sr-add-sheet'){
   if(state.book.sheets.length>=100)throw Error('Maximum 100 worksheets.');
   const name=window.prompt('New register worksheet name (e.g. Register of Members):');
   if(!name?.trim())return true;
   state.book.sheets.push({name:name.trim().slice(0,120),rows:[['Name','Particulars','Date','Remarks']]});
   state.sheetIndex=state.book.sheets.length-1;state.rowPage=0;state.dirty=true;notify();return true;
  }
  if(action==='sr-rename-sheet'){
   const sheet=state.book.sheets[state.sheetIndex],name=window.prompt('Worksheet name:',sheet.name);
   if(name?.trim()){sheet.name=name.trim().slice(0,120);state.dirty=true;notify();}
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
 async function pdf(){
  if(!state.book)throw Error('Select a company.');
  state.saving=true;state.error='';status('Generating statutory register PDF…');
  try{
   const blob=await buildStatutoryRegistersPdf(state.book,{onProgress:message=>{state.message=message;notify();}});
   const safe=String(state.book.companyName||'Company').replace(/[\\/:*?"<>|]/g,'_').slice(0,110);
   const filename='Statutory Registers_'+safe+'.pdf';
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
  readZip,importZip,save,pdf,downloadOriginal,searchReview};
}
