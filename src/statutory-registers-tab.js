/**
 * Statutory Registers workspace: editable per-company records in private
 * Supabase Storage; no new public tables, no destructive folder migration.
 */
import {blankRegister,validateRegister,createSection,appendImportedSections,previewStatutoryZip,DEFAULT_REGISTERS} from './statutory-registers-data.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=()=>new Date().toISOString();
const missing=e=>/not found|404|object not found/i.test(String(e?.message||e?.error||''));
const displayCount=n=>Number(n||0).toLocaleString('en-MY');
const PAGE_ROWS=45;
const uiButton=(label,act,id='',kind='secondary')=>'<button type="button" class="btn '+kind+'" data-action="'+act+'" data-id="'+esc(id)+'">'+esc(label)+'</button>';
const slug=v=>String(v||'').replace(/[^A-Za-z0-9._-]+/g,'_').slice(0,90)||'Company';

export function createStatutoryRegistersTab({db,bucket='dms-private',getUser,getCompanies,saveOrShareFile}){
 const state={userId:'',loaded:false,loading:false,saving:false,dirty:false,
  companyId:null,model:null,sectionIndex:0,rowPage:0,search:'',page:0,stored:new Set(),
  preview:null,status:'',error:'',legacy:[]};
 const storage=db.storage.from(bucket);
 let renderHook=null;
 const notify=()=>renderHook?.();
 const afterRender=fn=>{renderHook=fn;};
 const folder=()=>getUser()?.id+'/statutory-registers/companies';
 const path=id=>folder()+'/'+id+'.json';
 const userCheck=expected=>{
  if(!getUser?.()?.id||getUser().id!==expected)throw Error('Your DMS login changed. Sign in again.');
 };
 function reset(){
  Object.assign(state,{userId:'',loaded:false,loading:false,saving:false,dirty:false,
   companyId:null,model:null,sectionIndex:0,rowPage:0,search:'',page:0,stored:new Set(),preview:null,status:'',error:'',legacy:[]});
 }
 function hasUnsaved(){return state.dirty;}
 function allowLeave(){
  return !hasUnsaved()||window.confirm('You have unsaved Statutory Registers edits. Discard these changes?');
 }
 function markDirty(){
  state.dirty=true;
  const node=document.getElementById('sr-dirty');
  if(node)node.textContent='Unsaved changes — click Save Registers';
 }
 function activeSection(){return state.model?.sections?.[state.sectionIndex]||null;}
 async function load(force=false){
  const user=getUser?.();
  if(!user?.id){reset();notify();return;}
  if(state.loading||state.saving)return;
  if(!force&&state.loaded&&state.userId===user.id)return;
  state.userId=user.id;state.loaded=false;state.loading=true;state.error='';notify();
  try{
   const ids=new Set();
   for(let offset=0;;offset+=1000){
    const {data,error}=await storage.list(folder(),{limit:1000,offset,sortBy:{column:'name',order:'asc'}});
    if(error)throw Error('Cannot list private registers: '+error.message);
    for(const item of data||[])if(/^[\w-]+\.json$/.test(item.name))ids.add(item.name.slice(0,-5));
    if((data||[]).length<1000)break;
    if(offset>9000)throw Error('Too many statutory registers to display.');
   }
   userCheck(user.id);
   state.stored=ids;state.loaded=true;
  }catch(e){state.error=e.message||String(e);}
  finally{state.loading=false;notify();}
 }
 async function readSaved(company){
  const {data,error}=await storage.download(path(company.id));
  if(error){if(missing(error))return blankRegister(company);throw Error('Cannot download register: '+error.message);}
  let parsed;
  try{parsed=JSON.parse(await data.text());}catch{throw Error('Saved statutory register JSON is damaged. Existing data has not been changed.');}
  validateRegister(parsed);
  if(parsed.companyId!==company.id)throw Error('Stored register company ID mismatch. Nothing was changed.');
  return {...parsed,companyName:company.name,registrationNo:company.registration_no||parsed.registrationNo||''};
 }
 async function readLegacy(companyId){
  const {data:folders,error}=await db.from('folders').select('id').eq('company_id',companyId)
   .is('parent_id',null).ilike('name','Register Book').limit(5);
  if(error)throw Error('Legacy documents lookup failed: '+error.message);
  const docs=[];
  for(const f of folders||[]){
   const {data, error:e}=await db.from('documents').select('id,name,size_bytes,storage_path,mime_type')
    .eq('folder_id',f.id).order('name').limit(500);
   if(e)throw Error('Cannot load legacy Register Books: '+e.message);
   docs.push(...(data||[]));
  }
  return docs;
 }
 async function openCompany(id){
  if(!allowLeave())return;
  const company=(getCompanies?.()||[]).find(c=>c.id===id);
  if(!company)throw Error('Company is not available in DMS.');
  const uid=getUser()?.id;
  if(!uid)throw Error('Sign in to access the private statutory registers.');
  state.companyId=id;state.loading=true;state.error='';state.status='';
  state.sectionIndex=0;state.rowPage=0;state.preview=null;notify();
  try{
   const [model,legacy]=await Promise.all([readSaved(company),readLegacy(id)]);
   userCheck(uid);
   state.model=model;state.legacy=legacy;state.dirty=false;
  }catch(e){state.error=e.message||String(e);state.model=null;}
  finally{state.loading=false;notify();}
 }
 function back(){
  if(!allowLeave())return;
  state.companyId=null;state.model=null;state.preview=null;state.error='';state.status='';
  state.dirty=false;state.legacy=[];notify();
 }
 async function saveModel(model,{backup=true}={}){
  validateRegister(model);
  const uid=getUser()?.id;if(!uid)throw Error('Sign in before saving statutory records.');
  userCheck(uid);
  const data=JSON.stringify({...model,updatedAt:stamp()});
  if(new Blob([data]).size>12*1024*1024)throw Error('The company register exceeds the 12 MB cloud save limit.');
  // Preserve each previous version before replacing the current editable copy.
  if(backup){
   const {data:old,error}=await storage.download(path(model.companyId));
   if(error&&!missing(error))throw Error('Could not check old register before saving: '+error.message);
   if(old){
    const previous=await old.text();
    let existing;
    try{existing=JSON.parse(previous);}catch{throw Error('Existing stored record is unreadable; no changes were saved.');}
    if(model.updatedAt && existing.updatedAt && model.updatedAt!==existing.updatedAt)
     throw Error('Register was edited on another device. Reload before saving to avoid overwriting.');
    const history=uid+'/statutory-registers/history/'+model.companyId+'/'+Date.now()+'-'+crypto.randomUUID()+'.json';
    const prior=await storage.upload(history,new Blob([previous],{type:'application/json'}),{contentType:'application/json',upsert:false});
    if(prior.error)throw Error('Private version backup failed; current register was not overwritten: '+prior.error.message);
   }
  }
  const updated={...model,updatedAt:stamp()};
  const {error}=await storage.upload(path(model.companyId),new Blob([JSON.stringify(updated)],{type:'application/json'}),
   {contentType:'application/json',upsert:true,cacheControl:'0'});
  if(error)throw Error('Saving the statutory register failed: '+error.message);
  state.stored.add(model.companyId);
  return updated;
 }
 async function save(){
  if(!state.model||!state.dirty)return;
  state.saving=true;state.error='';state.status='Saving statutory registers privately…';notify();
  try{
   state.model=await saveModel(state.model);
   state.dirty=false;state.status='Registers saved. A private backup of the previous version was preserved.';
  }catch(e){state.error=e.message||String(e);throw e;}
  finally{state.saving=false;notify();}
 }
 function setSection(index){
  if(!state.model)return;
  if(!Number.isInteger(index)||index<0||index>=state.model.sections.length)return;
  state.sectionIndex=index;state.rowPage=0;notify();
 }
 function addSection(title,kind){
  if(!state.model)return;
  if(state.model.sections.length>=120)throw Error('Maximum 120 sections per company.');
  state.model.sections.push(createSection(title,kind));
  state.sectionIndex=state.model.sections.length-1;state.rowPage=0;markDirty();notify();
 }
 function removeSection(){
  const section=activeSection();
  if(!section||!window.confirm('Remove section "'+section.title+'" from the editable copy? The last saved version will be backed up when you save.'))return;
  state.model.sections.splice(state.sectionIndex,1);
  state.sectionIndex=Math.max(0,Math.min(state.sectionIndex,state.model.sections.length-1));
  state.rowPage=0;markDirty();notify();
 }
 function addRow(){
  const s=activeSection();
  if(!s||s.kind!=='table'||s.rows.length>=12000)return;
  s.rows.push(s.columns.map(()=>''));
  state.rowPage=Math.floor((s.rows.length-1)/PAGE_ROWS);markDirty();notify();
 }
 function deleteRow(rowIndex){
  const s=activeSection();
  if(!s||s.kind!=='table'||!s.rows[rowIndex]||!window.confirm('Remove row '+(rowIndex+1)+' from the editable register?'))return;
  s.rows.splice(rowIndex,1);
  state.rowPage=Math.min(state.rowPage,Math.max(0,Math.ceil(s.rows.length/PAGE_ROWS)-1));
  markDirty();notify();
 }
 function addColumn(){
  const s=activeSection();
  if(!s||s.kind!=='table'||s.columns.length>=120)return;
  s.columns.push('New column');for(const row of s.rows)row.push('');
  markDirty();notify();
 }
 function deleteColumn(){
  const s=activeSection();
  if(!s||s.kind!=='table'||s.columns.length<=1)return;
  if(!window.confirm('Remove the rightmost column and its values?'))return;
  s.columns.pop();for(const row of s.rows)row.pop();markDirty();notify();
 }
 function setPage(delta){
  const s=activeSection();if(!s||s.kind!=='table')return;
  const pages=Math.max(1,Math.ceil(s.rows.length/PAGE_ROWS));
  state.rowPage=Math.max(0,Math.min(pages-1,state.rowPage+delta));notify();
 }
 function input(target){
  const section=activeSection();
  if(!state.model||!section)return false;
  if(target.id==='sr-title'){
   section.title=target.value.slice(0,200);markDirty();return true;
  }
  if(target.id==='sr-text'&&section.kind==='text'){
   section.content=target.value.slice(0,400000);markDirty();return true;
  }
  if(target.dataset.srCol!==undefined&&section.kind==='table'){
   const c=Number(target.dataset.srCol);
   if(Number.isInteger(c)&&c>=0&&c<section.columns.length)
    section.columns[c]=target.value.slice(0,200);
   markDirty();return true;
  }
  if(target.dataset.srCell!==undefined&&section.kind==='table'){
   const [r,c]=target.dataset.srCell.split(':').map(Number);
   if(Number.isInteger(r)&&Number.isInteger(c)&&section.rows[r]&&c>=0&&c<section.columns.length)
    section.rows[r][c]=target.value.slice(0,15000);
   markDirty();return true;
  }
  return false;
 }
 async function importFile(file){
  if(state.dirty)throw Error('Save your current register edits before importing new ZIP files.');
  state.preview=null;state.error='';state.status='Reading ZIP locally…';state.loading=true;notify();
  try{
   state.preview=await previewStatutoryZip(file,getCompanies?.()||[],{
    onProgress:message=>{state.status=message;notify();}
   });
   state.status='Import preview is ready. Confirm to embed the converted records.';
  }catch(e){state.error=e.message||String(e);throw e;}
  finally{state.loading=false;notify();}
 }
 function cancelImport(){state.preview=null;state.status='Import cancelled. Nothing was changed.';notify();}
 async function commitImport(){
  const preview=state.preview;
  if(!preview?.groups.length)throw Error('No convertible statutory register files were matched.');
  if(state.dirty)throw Error('Save current company changes before bulk import.');
  if(!window.confirm('Embed '+preview.converted+' converted files for '+preview.groups.length+
   ' companies? Existing edited sections will be preserved, and prior saved versions backed up. Failed/unmatched files will be skipped.'))return;
  state.saving=true;state.error='';state.status='Saving converted statutory registers…';notify();
  let saved=0,sections=0,skipped=0;const failures=[];
  try{
   for(const group of preview.groups){
    try{
     const previous=await readSaved(group.company);
     const combined=appendImportedSections(previous,group.sections);
     if(combined.added){
      await saveModel(combined.model);
      sections+=combined.added;saved++;
      if(state.companyId===group.company.id){
       state.model=await readSaved(group.company);state.sectionIndex=0;state.rowPage=0;state.dirty=false;
      }
     }
     skipped+=combined.skipped;
    }catch(e){failures.push(group.company.name+': '+(e.message||String(e)));}
    state.status='Embedded registers for '+saved+' companies so far…';notify();
   }
   state.preview=null;
   await load(true);
   state.status='Saved '+sections+' editable sections across '+saved+' companies. '+skipped+
    ' identical sections skipped.'+(failures.length?' '+failures.length+' failed: '+failures.slice(0,3).join(' | '):'');
   if(failures.length)state.error='Some companies were not saved: '+failures.join(' | ').slice(0,1200);
  }finally{state.saving=false;notify();}
 }
 async function exportPdf(){
  if(!state.model)throw Error('Open a company register first.');
  const {jsPDF}=await import('jspdf');
  const m=state.model;
  const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
  const width=297,margin=14,usable=width-margin*2,pageHeight=210;
  let y=18;
  const pageFooter=()=>{pdf.setFontSize(8);pdf.setTextColor(110);pdf.text('ZHENLI DMS | Statutory Registers | '+m.companyName,margin,201);pdf.text(String(pdf.internal.getNumberOfPages()),279,201,{align:'right'});pdf.setTextColor(20);};
  const nextPage=()=>{pageFooter();pdf.addPage();y=18;};
  const line=(value,{size=9,bold=false,space=1.5,indent=0}={})=>{
   const s=String(value??'');
   pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);
   const chunks=pdf.splitTextToSize(s||' ',usable-indent);
   for(const chunk of chunks){
    if(y+size*.48>192)nextPage();
    pdf.text(chunk,margin+indent,y);y+=size*.47+space;
   }
  };
  line('STATUTORY REGISTERS',{size:17,bold:true,space:3});
  line(m.companyName,{size:13,bold:true});
  line('Company Registration No.: '+(m.registrationNo||'N/A'),{size:10});
  line('Record last saved: '+(m.updatedAt||'Unsaved draft'),{size:9,space:4});
  m.sections.forEach((s,i)=>{
   if(y>174)nextPage();
   line((i+1)+'. '+s.title,{size:12,bold:true,space:3});
   if(s.kind==='text'){
    for(const paragraph of s.content.split('\n'))line(paragraph,{size:9});
   }else{
    line('Columns: '+s.columns.join(' | '),{size:8,space:2});
    s.rows.forEach((row,r)=>{
     if(y>183)nextPage();
     line('Entry '+(r+1),{size:9,bold:true});
     row.forEach((cell,c)=>{
      if(!String(cell).trim())return;
      line((s.columns[c]||'Column '+(c+1))+': '+cell,{size:9,indent:5,space:1});
     });
    });
   }
   y+=4;
  });
  pageFooter();
  const filename='Statutory_Registers_'+slug(m.companyName)+'.pdf';
  const blob=new Blob([pdf.output('arraybuffer')],{type:'application/pdf'});
  await saveOrShareFile(blob,filename,{preferShare:true});
  state.status='PDF generated: '+filename;notify();
 }
 async function openLegacy(id){
  const doc=state.legacy.find(d=>d.id===id);
  if(!doc)throw Error('Legacy file not found.');
  const {data,error}=await storage.createSignedUrl(doc.storage_path,120,{download:doc.name});
  if(error)throw Error('Cannot access archived Register Book: '+error.message);
  const response=await fetch(data.signedUrl,{cache:'no-store'});
  if(!response.ok)throw Error('Archived file download failed (HTTP '+response.status+').');
  await saveOrShareFile(await response.blob(),doc.name,{preferShare:true});
 }
 function renderPreview(){
  const p=state.preview;if(!p)return '';
  const good=p.groups.flatMap(g=>g.sections.map(s=>({name:g.company.name,section:s})));
  const problems=[...p.unmatched,...p.errors];
  return '<section class="sr-preview"><h2>ZIP import preview — not saved yet</h2>'+
   '<p><strong>'+p.groups.length+' matched companies</strong> · '+p.converted+' converted files · '+
   p.errors.length+' conversion errors · '+p.unmatched.length+' unmatched · '+p.ignored+' skipped unsupported archive entries</p>'+
   '<div class="sr-preview-scroll">'+good.slice(0,80).map(g=>'<p>✓ '+esc(g.name)+' — '+esc(g.section.title)+' ('+
     (g.section.kind==='table'?'Editable Excel rows: '+g.section.rows.length:'Editable text')+')</p>').join('')+
   problems.slice(0,80).map(g=>'<p>⚠ '+esc(g.path)+': '+esc(g.reason)+'</p>').join('')+'</div>'+
   '<div class="sr-controls">'+uiButton('Cancel Import','sr-cancel-import')+
    (p.groups.length?uiButton('Confirm & Embed Registers','sr-commit-import','','primary'):'')+'</div></section>';
 }
 function renderEditor(){
  const m=state.model;
  if(!m)return '<p class="muted">Loading company record…</p>';
  const s=activeSection();
  let content='';
  if(s){
   if(s.kind==='text'){
    content='<label class="sr-field-label" for="sr-text">Editable extracted register text</label>'+
     '<textarea id="sr-text" class="sr-text-editor" rows="20" spellcheck="false">'+esc(s.content)+'</textarea>';
   }else{
    const pages=Math.max(1,Math.ceil(s.rows.length/PAGE_ROWS));
    state.rowPage=Math.min(state.rowPage,pages-1);
    const start=state.rowPage*PAGE_ROWS;
    const visible=s.rows.slice(start,start+PAGE_ROWS);
    content='<div class="sr-controls">'+uiButton('+ Add Row','sr-add-row')+uiButton('+ Add Column','sr-add-col')+
     uiButton('Remove Last Column','sr-delete-col')+'</div>'+
     '<div class="sr-edit-table-scroll"><table class="sr-edit-table"><thead><tr><th>No.</th>'+
     s.columns.map((name,c)=>'<th><input aria-label="Column '+(c+1)+' heading" data-sr-col="'+c+'" value="'+esc(name)+'" /></th>').join('')+
     '<th>Action</th></tr></thead><tbody>'+
     visible.map((row,i)=>{
      const rowIndex=i+start;
      return '<tr><th>'+String(rowIndex+1)+'</th>'+
       row.map((cell,c)=>'<td><textarea rows="2" spellcheck="false" aria-label="Row '+(rowIndex+1)+
        ' column '+(c+1)+'" data-sr-cell="'+rowIndex+':'+c+'">'+esc(cell)+'</textarea></td>').join('')+
       '<td>'+uiButton('Delete','sr-delete-row',String(rowIndex))+'</td></tr>';
     }).join('')+
     '</tbody></table></div><div class="sr-pager">'+
      '<span>'+displayCount(s.rows.length)+' rows · Page '+(state.rowPage+1)+' / '+pages+'</span>'+
      uiButton('Previous','sr-row-prev')+uiButton('Next','sr-row-next')+'</div>';
   }
   content='<div class="sr-section-heading"><label>Section name<input id="sr-title" value="'+esc(s.title)+'" maxlength="200"/></label>'+
    uiButton('Remove Section','sr-delete-section')+'</div>'+content;
  }else content='<div class="sr-empty">No embedded register information yet. Import a ZIP or add a statutory register section below.</div>';
  return '<div class="sr-editor"><div class="sr-nav">'+uiButton('← All Companies','sr-back')+
    '<div><h2>'+esc(m.companyName)+'</h2><p class="muted">'+esc(m.registrationNo||'No registration number')+'</p></div></div>'+
   '<div class="sr-controls">'+uiButton('Import Register Book ZIP','sr-import')+
    uiButton('Save Registers','sr-save','','primary')+uiButton('Export PDF','sr-export','','secondary')+
    '<span id="sr-dirty" class="sr-dirty">'+(state.dirty?'Unsaved changes — click Save Registers':'Saved records / no unsaved changes')+'</span></div>'+
   '<div class="sr-edit-layout"><aside class="sr-section-nav"><h3>Register sections ('+m.sections.length+')</h3>'+
    m.sections.map((item,i)=>'<button type="button" data-action="sr-section" data-id="'+i+
     '" class="'+(i===state.sectionIndex?'selected':'')+'">'+esc(item.title)+'</button>').join('')+
    '<div class="sr-add-form"><label>New section title<select id="sr-new-name">'+DEFAULT_REGISTERS.map(x=>'<option>'+esc(x)+'</option>').join('')+'</select></label>'+
    '<label>Format<select id="sr-new-kind"><option value="table">Editable Table</option><option value="text">Editable Text</option></select></label>'+
    uiButton('+ Add Section','sr-add-section','','primary')+'</div></aside>'+
    '<div class="sr-section-detail">'+content+'</div></div>'+
   (state.legacy.length?'<details class="sr-legacy"><summary>Archived original Register Book files ('+state.legacy.length+')</summary>'+
    '<p class="muted">Original files are preserved in private cloud storage, but their former Documents folder is hidden.</p>'+
    state.legacy.map(doc=>'<div class="sr-legacy-line"><span>'+esc(doc.name)+'</span>'+
     uiButton('Download Original','sr-legacy',doc.id)+'</div>').join('')+'</details>':'')+
   '<p class="muted sr-footnote">Imported PDF/DOCX text and Excel cells are editable here. Scanned PDFs are not OCR-converted. Review extracted names, dates and share entries against original records before statutory use. Save before switching tabs.</p></div>';
 }
 function render(){
  const companies=(getCompanies?.()||[]).filter(x=>x?.id);
  const q=state.search.trim().toLowerCase();
  const matched=companies.filter(x=>(x.name+' '+(x.registration_no||'')).toLowerCase().includes(q));
  const pages=Math.max(1,Math.ceil(matched.length/25));
  state.page=Math.min(state.page,pages-1);
  return '<section class="sr-workspace"><div class="content-header"><div><p class="eyebrow">PRIVATE COMPANY STATUTORY RECORDS</p>'+
   '<h1>Statutory Registers</h1><p class="muted">Embedded, editable Register Books. Import a ZIP, update the original worksheets or text and export the company register to PDF.</p></div>'+
   '<div class="header-buttons">'+uiButton('↑ Import Register Book ZIP','sr-import','','primary')+
    uiButton('Refresh Registers','sr-refresh')+'</div></div>'+
   (state.status?'<div class="sr-status" role="status">'+esc(state.status)+'</div>':'')+
   (state.error?'<div class="sr-error" role="alert">'+esc(state.error)+'</div>':'')+
   (state.loading?'<p class="muted">Reading private statutory registers…</p>':'')+
   renderPreview()+
   (state.companyId?renderEditor():
   '<div class="sr-metrics"><div><strong>'+companies.length+'</strong><span>Companies</span></div>'+
    '<div><strong>'+state.stored.size+'</strong><span>Companies with embedded registers</span></div>'+
    '<div><strong>'+Math.max(0,companies.length-state.stored.size)+'</strong><span>Awaiting import</span></div></div>'+
    '<label class="sr-field-label">Search by company name or registration number<input type="search" id="sr-search" autocomplete="off" placeholder="Search companies" value="'+esc(state.search)+'"/></label>'+
    '<div class="sr-edit-table-scroll"><table class="sr-directory"><thead><tr><th>No.</th><th>Company</th><th>Registration No.</th><th>Status</th><th>Action</th></tr></thead><tbody>'+
    matched.slice(state.page*25,(state.page+1)*25).map((co,i)=>'<tr><td>'+(state.page*25+i+1)+'</td><td>'+esc(co.name)+'</td>'+
     '<td>'+esc(co.registration_no||'N/A')+'</td><td>'+(state.stored.has(co.id)?'Editable register saved':'Not imported')+'</td>'+
     '<td>'+uiButton('Open & Edit','sr-open',co.id)+'</td></tr>').join('')+
    '</tbody></table></div><div class="sr-pager"><span>Page '+(state.page+1)+' / '+pages+'</span>'+
    uiButton('Previous','sr-dir-prev')+uiButton('Next','sr-dir-next')+'</div>'+
    '<p class="muted sr-footnote">Register Books are stored privately by company. The original Documents folders will no longer be shown; original files remain available from each company’s archived-file panel.</p>')+
   '</section>';
 }
 function search(q){state.search=String(q);state.page=0;notify();}
 function directoryPage(delta){
  const pages=Math.max(1,Math.ceil((getCompanies?.()||[]).filter(c=>(c.name+' '+(c.registration_no||'')).toLowerCase().includes(state.search.toLowerCase())).length/25));
  state.page=Math.max(0,Math.min(pages-1,state.page+delta));notify();
 }
 return {state,afterRender,reset,load,render,openCompany,back,save,importFile,cancelImport,commitImport,exportPdf,
  addSection,removeSection,setSection,addRow,deleteRow,addColumn,deleteColumn,setPage,input,
  search,directoryPage,openLegacy,allowLeave};
}
