/**
 * Dedicated Register Book directory. Existing company folders and uploaded files
 * remain the single source of truth; no duplicate database or ZIP archive storage.
 */
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PAGE_SIZE=25;

export function createRegisterBookTab({db,getUser,getCompanies}){
 const state={userId:'',loaded:false,loading:false,error:'',search:'',page:0,folders:new Map(),counts:new Map()};
 let renderHook=null;
 const afterRender=fn=>{renderHook=fn;};
 const notify=()=>renderHook?.();
 function reset(){
  state.userId='';state.loaded=false;state.loading=false;state.error='';
  state.search='';state.page=0;state.folders=new Map();state.counts=new Map();
 }
 async function load(force=false){
  const user=getUser?.();
  if(!user?.id){reset();notify();return;}
  if(state.loading)return;
  if(!force && state.loaded && state.userId===user.id)return;
  state.userId=user.id;state.loaded=false;state.loading=true;state.error='';
  notify();
  try{
   const companies=getCompanies?.()||[];
   const folders=new Map(),counts=new Map();
   for(let i=0;i<companies.length;i+=80){
    const batch=companies.slice(i,i+80);
    if(!batch.length)continue;
    const {data,error}=await db.from('folders').select('id,company_id,name')
     .in('company_id',batch.map(c=>c.id))
     .is('parent_id',null).ilike('name','Register Book').limit(1000);
    if(error)throw Error('Cannot read Register Book folders: '+error.message);
    for(const folder of data||[]) if(!folders.has(folder.company_id))folders.set(folder.company_id,folder.id);
   }
   const folderIds=[...folders.values()];
   for(let i=0;i<folderIds.length;i+=70){
    const batch=folderIds.slice(i,i+70);
    // PostgREST caps each response; paginate so counts do not silently stop at 1000.
    for(let offset=0;;offset+=1000){
     const {data,error}=await db.from('documents').select('folder_id')
      .in('folder_id',batch).range(offset,offset+999);
     if(error)throw Error('Cannot read Register Book documents: '+error.message);
     for(const doc of data||[])counts.set(doc.folder_id,(counts.get(doc.folder_id)||0)+1);
     if((data||[]).length<1000)break;
     if(offset>=19000)throw Error('Register Book directory exceeds the current display limit. Narrow your portfolio before reloading.');
    }
   }
   if(getUser?.()?.id!==user.id)return;
   state.folders=folders;state.counts=counts;state.loaded=true;
  }catch(error){
   if(getUser?.()?.id===user.id)state.error=error?.message||String(error);
  }finally{
   if(getUser?.()?.id===user.id){state.loading=false;notify();}
  }
 }
 function render(){
  const companies=(getCompanies?.()||[]).filter(c=>c?.id);
  const query=state.search.trim().toLowerCase();
  const matched=companies.filter(c=>(c.name+' '+(c.registration_no||'')).toLowerCase().includes(query));
  const pages=Math.max(1,Math.ceil(matched.length/PAGE_SIZE));
  state.page=Math.min(state.page,pages-1);
  const list=matched.slice(state.page*PAGE_SIZE,(state.page+1)*PAGE_SIZE);
  const withDocuments=companies.filter(c=>(state.counts.get(state.folders.get(c.id))||0)>0).length;
  const totalFiles=[...state.counts.values()].reduce((n,c)=>n+c,0);
  return `<section class="rb-workspace">
   <div class="content-header"><div><p class="eyebrow">STATUTORY REGISTER LIBRARY</p><h1>Register Book</h1>
    <p class="muted">Import a ZIP containing Register Books for multiple companies. Review company matches, then save each file into the existing private company Register Book folder.</p></div>
    <div class="header-buttons">
     <button type="button" class="btn primary" data-action="register-zip">↑ Import Register Book ZIP</button>
     <button type="button" class="btn secondary" data-action="rb-refresh">Refresh directory</button>
    </div></div>
   <div class="rb-metrics">
    <div><strong>${companies.length}</strong><span>Companies</span></div>
    <div><strong>${state.loaded?withDocuments:'—'}</strong><span>Companies with Register Books</span></div>
    <div><strong>${state.loaded?totalFiles:'—'}</strong><span>Stored Register Book files</span></div>
   </div>
   <div class="rb-help">Supported ZIP contents: PDF, Word (.docx), Excel (.xlsx/.xls). Filenames or enclosing folders should identify the company. An import preview flags ambiguous/unmatched documents; duplicate files are skipped. The original ZIP is not saved.</div>
   ${state.error?`<div class="rb-error" role="alert">${esc(state.error)}</div>`:''}
   ${state.loading?'<p class="muted" role="status">Loading saved Register Books…</p>':''}
   <label class="rb-search-label" for="rb-search">Find a company by name or registration number</label>
   <input id="rb-search" type="search" placeholder="Search company register books" value="${esc(state.search)}" autocomplete="off"/>
   <div class="rb-results-heading"><strong>Company register directory</strong><span>${matched.length} of ${companies.length} companies</span></div>
   <div class="rb-table-scroll"><table class="rb-table"><thead><tr><th>No.</th><th>Company</th><th>Registration No.</th><th>Register Books</th><th>Action</th></tr></thead>
   <tbody>${list.map((co,i)=>{
    const folderId=state.folders.get(co.id);
    const count=state.counts.get(folderId)||0;
    const status=!state.loaded?'Checking…':!folderId?'Folder not yet created':count?count+' file'+(count===1?'':'s'):'No files yet';
    return `<tr><td>${state.page*PAGE_SIZE+i+1}</td><td class="rb-company">${esc(co.name)}</td>
      <td>${esc(co.registration_no||'N/A')}</td><td>${esc(status)}</td>
      <td><button type="button" class="btn secondary" data-action="rb-open" data-id="${esc(co.id)}">Open Register Book</button></td></tr>`;
   }).join('')||'<tr><td colspan="5" class="rb-empty">No matching companies. Import companies into Documents first, or change your search.</td></tr>'}</tbody></table></div>
   <div class="rb-pager"><span>Page ${state.page+1} of ${pages}</span>
    <button type="button" class="btn secondary" data-action="rb-prev" ${state.page===0?'disabled':''}>Previous</button>
    <button type="button" class="btn secondary" data-action="rb-next" ${state.page>=pages-1?'disabled':''}>Next</button></div>
   <p class="muted rb-footnote">Register Book documents use the same Supabase authentication, storage permissions and document viewer as your existing DMS Documents tab. Your Master Listing data is not overwritten by this ZIP import.</p>
  </section>`;
 }
 function search(query){state.search=String(query||'');state.page=0;notify();}
 function changePage(delta){state.page=Math.max(0,state.page+delta);notify();}
 return {state,afterRender,reset,load,render,search,changePage};
}
