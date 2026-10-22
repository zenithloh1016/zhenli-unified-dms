/**
 * Master Listing tab for ZHENLI DMS.
 * Imports Excel using the existing local reader; stores all fields in private
 * Supabase Storage under the user's own prefix. No new database table or
 * service-role credentials are required. Documents folders change only when the user requests synchronization on add or through Sync.
 */
import {buildMasterListing,detectListingColumns,validateMasterListing,companyData,findCompanyMatch,changeListingCell,listingRowsForSearch,listingCSV,displayedListingValue,countLegacyDateSerials,repairLegacyDateSerials,isListingOrdinalColumn,listingOrdinalValue,isListingDateColumn,isListingFyeColumn} from './master-listing-data.js';
import {previewRegisterParticularsZip,preserveRegisterParticulars} from './master-listing-register-particulars.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeText=value=>String(value??'').slice(0,15000);
const act=(title,action,id='',style='secondary')=>'<button type="button" class="btn '+style+'" data-action="'+action+'" data-id="'+esc(id)+'">'+esc(title)+'</button>';
const fileSize=bytes=>bytes<1048576?(bytes/1024).toFixed(1)+' KB':(bytes/1048576).toFixed(1)+' MB';
const PER_PAGE=20,MAX_JSON_BYTES=20*1024*1024;
const encode=model=>new Blob([JSON.stringify(model)],{type:'application/json'});
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const nowStamp=()=>new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14);
const isMissing=error=>/object not found|not found|404|no such key/i.test(String(error?.message||error?.statusCode||error?.error||''));

export function createMasterListingTab({db,bucket='dms-private',getUser,getCompanies,openCompany,refreshCompanies,notify}){
 const state={userId:'',loaded:false,loading:false,saving:false,
  model:null,error:'',status:'',search:'',page:0,columnStart:0,fullScreen:false,editIndex:null,addOpen:false,addDraft:null,addCreateFolders:true,
  source:'',sheets:[],sheetIndex:0,headingRow:1,startRow:2,nameColumn:0,regColumn:-1,date1904:false,legacyDateCount:0,preview:null,registerPreview:null,
  selectedFile:null};
 const storage=db?.storage?.from(bucket);
 const path=()=>getUser()?.id+'/master-listing/current.json';
 const fail=error=>{state.error=String(error?.message||error);state.status='';notify?.('Master Listing: '+state.error);renderUI();};
 const renderUI=()=>{onRender?.();};
 let onRender=null;
 const afterRender=cb=>{onRender=cb;};

 const reset=()=>{Object.assign(state,{userId:'',loaded:false,loading:false,saving:false,model:null,error:'',status:'',search:'',page:0,columnStart:0,fullScreen:false,editIndex:null,addOpen:false,addDraft:null,addCreateFolders:true,source:'',sheets:[],sheetIndex:0,headingRow:1,startRow:2,nameColumn:0,regColumn:-1,date1904:false,legacyDateCount:0,preview:null,registerPreview:null,selectedFile:null});};
 async function load(force=false){
  const user=getUser?.();
  if(!user?.id){reset();return;}
  if(!force&&state.loaded&&state.userId===user.id)return;
  if(state.loading)return;
  if(state.userId!==user.id)reset();
  state.userId=user.id;state.loading=true;state.error='';state.status='Loading your saved Master Listing…';onRender?.();
  try{
   const {data,error}=await storage.download(path());
   if(error){
    if(!isMissing(error))throw Error('Cannot read private Master Listing: '+error.message);
    state.model=null;
   }else{
    let json;try{json=JSON.parse(await data.text());}
    catch{throw Error('Saved Master Listing JSON is damaged. The stored file has not been changed.');}
    state.model=validateMasterListing(json);
   }
   state.loaded=true;state.legacyDateCount=countLegacyDateSerials(state.model);
   state.status=state.model?'Saved Master Listing loaded.':'No Master Listing has been imported yet.';
  }catch(error){state.error=error.message||String(error);}
  finally{state.loading=false;onRender?.();}
 }
 function selectedRows(){
  const model=state.model;
  return model?listingRowsForSearch(model,state.search):[];
 }
 function companyRows(){
  const rows=selectedRows();const pageSize=state.fullScreen?40:PER_PAGE;const pages=Math.max(1,Math.ceil(rows.length/pageSize));
  state.page=clamp(state.page,0,pages-1);
  return {rows:rows.slice(state.page*pageSize,(state.page+1)*pageSize),total:rows.length,pages};
 }
 function importPreview(){
  const source=state.sheets[state.sheetIndex];if(!source?.rows)return null;
  try{
   return buildMasterListing(source.rows,{headerRow:state.headingRow,startRow:state.startRow,
    nameColumn:state.nameColumn,registrationColumn:state.regColumn,
    filename:state.selectedFile?.name||'Master Listing.xlsx',worksheet:source.name,date1904:state.date1904});
  }catch(error){return {error:error.message||String(error)};}
 }
 async function readFile(file,readWorkbook){
  if(!file||!/\.xlsx$/i.test(file.name))throw Error('Select a Master Listing .xlsx Excel workbook.');
  if(file.size<=0||file.size>20*1024*1024)throw Error('Excel workbook must be nonempty and at most 20 MB.');
  state.loading=true;state.error='';state.status='Reading Excel workbook locally…';state.sheets=[];state.preview=null;state.selectedFile=file;onRender?.();
  try{
   const parsed=await readWorkbook(file);
   // Compatibility reading can return JS Dates without original Excel formats.
   // Avoid silently changing statutory due-date display values on import.
   if(parsed.reader==='Compatibility Excel reader')
    throw Error('This Excel file could not be read with its original date display formats. Open in Microsoft Excel, Save As an unprotected .xlsx copy and import that copy. Existing Master Listing data is unchanged.');
   const src=parsed?.sheets||[];
   if(!src.length)throw Error('Excel workbook has no worksheets.');
   state.source=parsed.reader||'Excel';state.date1904=!!parsed.book?.date1904;
   state.sheets=src.map(x=>({name:x.sheet,rows:x.data||null,read:parsed.book?.readSheet||null}));
   state.sheetIndex=parsed.selected||0;
   await switchSheet(state.sheetIndex);
   state.status='Select columns and review the import preview. Nothing has been overwritten.';
  }catch(error){state.error=error.message||String(error);state.sheets=[];}
  finally{state.loading=false;onRender?.();}
 }
 async function switchSheet(index){
  const entry=state.sheets[index];
  if(!entry)throw Error('Worksheet not found.');
  if(!entry.rows)entry.rows=await entry.read(entry.name);
  if(!entry.rows?.length)throw Error('This worksheet contains no rows.');
  state.sheetIndex=index;
  const detected=detectListingColumns(entry.rows);
  state.headingRow=detected.headerRow;state.startRow=detected.startRow;
  state.nameColumn=detected.nameColumn;state.regColumn=detected.registrationColumn;
  state.preview=importPreview();onRender?.();
 }
 async function saveModel(model,{backup=false}={}){
  validateMasterListing(model);
  const file=encode({...model,updatedAt:new Date().toISOString()});
  if(file.size>MAX_JSON_BYTES)throw Error('Master Listing exceeds 20 MB after extraction; split the listing.');
  const user=getUser?.();if(!user?.id||user.id!==state.userId)throw Error('Your DMS login changed. Sign in and try again.');
  if(backup&&state.model){
   const backupBlob=encode(state.model);
   const backupPath=user.id+'/master-listing/history/'+nowStamp()+'-'+crypto.randomUUID()+'.json';
   const backed=await storage.upload(backupPath,backupBlob,{upsert:false,contentType:'application/json'});
   if(backed.error)throw Error('Could not preserve the old listing before import: '+backed.error.message);
  }
  const result=await storage.upload(path(),file,{upsert:true,contentType:'application/json',cacheControl:'0'});
  if(result.error)throw Error('Private cloud save failed: '+result.error.message+'. Your previous listing was not intentionally deleted.');
  state.model={...model,updatedAt:new Date().toISOString()};
  state.loaded=true;state.userId=user.id;
  state.legacyDateCount=countLegacyDateSerials(state.model);
 }
 async function importSelected(){
  const preview=importPreview();
  if(!preview||preview.error)throw Error(preview?.error||'Select and preview a worksheet first.');
  if(!window.confirm('Import '+preview.rows.length+' companies and '+preview.columns.length+' columns into the Master Listing tab? '+(state.model?'This replaces the prior tab data, which will be backed up privately.':'This creates a new private listing.')+' Existing Documents folders and company details will not be changed.'))return;
  state.saving=true;state.error='';state.status='Saving all company fields privately…';onRender?.();
  try{
   await saveModel(preserveRegisterParticulars(state.model,preview),{backup:true});
   state.sheets=[];state.preview=null;state.selectedFile=null;
   state.page=0;state.search='';
   state.status='Imported '+preview.rows.length+' companies with '+preview.columns.length+' editable columns into private DMS storage.';
  }finally{state.saving=false;onRender?.();}
 }
 async function readRegisterBooks(file){
  if(!state.model)throw Error('Import your Master Listing before loading Register Books.');
  if(state.loading||state.saving)return;
  state.loading=true;state.registerPreview=null;state.error='';
  state.status='Reading selected Register Books locally…';onRender?.();
  try{
   state.registerPreview=await previewRegisterParticularsZip(file,state.model,{
    onProgress:message=>{state.status=message;onRender?.();}
   });
   state.status='Review the two-column update before saving. '+state.registerPreview.matchedRows+' Master Listing company rows matched.';
  }finally{state.loading=false;onRender?.();}
 }
 async function applyRegisterPreview(){
  const proposal=state.registerPreview;
  if(!proposal||!proposal.matchedRows)throw Error('No companies were matched; your Master Listing has not been changed.');
  if(!window.confirm('Update Directors & Members and Beneficial Owners for '+proposal.matchedRows+' rows? A private Master Listing backup will be created. All other fields remain unchanged.'))return;
  state.saving=true;state.error='';state.status='Backing up and saving updated Register Book particulars…';onRender?.();
  try{
   await saveModel(proposal.model,{backup:true});
   state.registerPreview=null;
   state.status='Saved Directors & Members and Beneficial Owners for '+proposal.matchedRows+' company rows. No other Master Listing fields were changed.';
  }finally{state.saving=false;onRender?.();}
 }
 async function saveEdit(form){
  const model=state.model,index=state.editIndex;
  if(!model||index===null||!model.rows[index])throw Error('Select a company first.');
  const updated={...model,rows:model.rows.slice()};
  updated.rows[index]={...model.rows[index],values:model.rows[index].values.slice()};
  for(let col=0;col<updated.columns.length;col++){
   const field=form.elements.namedItem('ml-col-'+col);
   if(field)changeListingCell(updated,index,col,field.value);
  }
  if(updated.rows[index].values.every((v,j)=>v===model.rows[index].values[j])){
   state.editIndex=null;onRender?.();return;
  }
  state.saving=true;state.error='';state.status='Saving company changes to private DMS…';onRender?.();
  try{
   await saveModel(updated);
   state.editIndex=null;state.status='Company information saved to DMS.';
  }finally{state.saving=false;onRender?.();}
 }
 
function manualListingTemplate(){
 return {version:1,filename:'Manual entries',worksheet:'Master Listing',headerRow:1,startRow:2,
  nameColumn:1,registrationColumn:2,date1904:false,
  columns:[{id:'c0',label:'No.'},{id:'c1',label:'Company Name'},{id:'c2',label:'Registration No.'},
   {id:'c3',label:'Date of Registration'},{id:'c4',label:'Financial Year End'}],
  rows:[],importedAt:new Date().toISOString(),skipped:{blank:0,duplicate:0}};
}
const companyKey=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
const registrationKey=value=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
async function saveAddedCompany(form){
 const original=state.model||manualListingTemplate();
 validateMasterListing(original);
 if(original.rows.length>=5000)throw Error('Master Listing has reached the limit of 5,000 companies.');
 const values=original.columns.map((_,i)=>String(form.elements.namedItem('ml-new-'+i)?.value??'').trim());
 const createFolders=!!form.elements.namedItem('ml-create-documents')?.checked;
 state.addDraft=values;state.addCreateFolders=createFolders;
 const rawName=values[original.nameColumn]||'';
 const name=rawName.replace(/\s+/g,' ').trim();
 if(name.length<3||name.length>250||name.toUpperCase()==='N/A')throw Error('A valid company name (3–250 characters) is required.');
 if(/[\r\n]/.test(rawName))throw Error('Company name must be entered on one line.');
 const registration=original.registrationColumn>=0?values[original.registrationColumn]:'';
 if(registration.length>100)throw Error('Registration number must be at most 100 characters.');
 const nameKey=companyKey(name),regKey=registrationKey(registration);
 if(original.rows.some(row=>{
  const info=companyData(original,row);
  return companyKey(info.name)===nameKey||(regKey&&registrationKey(info.registration)===regKey);
 }))throw Error('Company name or registration number already exists in Master Listing.');
 const ordinalCol=original.columns.findIndex((_,i)=>isListingOrdinalColumn(original,i));
 if(ordinalCol>=0){
  const last=Math.max(original.rows.length,...original.rows.map(row=>{
   const n=Number(String(row.values[ordinalCol]||'').trim());
   return Number.isSafeInteger(n)&&n>0?n:0;
  }));
  values[ordinalCol]=String(last+1);
 }
 const rowIndex=original.rows.length;
 const row={id:'manual-'+crypto.randomUUID(),values:original.columns.map(()=>'')};
 const updated={...original,rows:[...original.rows,row]};
 for(let i=0;i<values.length;i++)if(values[i])changeListingCell(updated,rowIndex,i,values[i]);
 const details=companyData(updated,row);
 if(!details.name)throw Error('Company name is required.');
 state.saving=true;state.error='';state.status='Saving the added company and backing up the listing…';onRender?.();
 try{
  await saveModel(updated,{backup:true});
  state.addOpen=false;state.addDraft=null;state.search='';
  state.page=Math.floor(rowIndex/(state.fullScreen?40:PER_PAGE));
  state.status=details.name+' added to Master Listing without changing existing rows.';
  if(createFolders){
   const match=(getCompanies?.()||[]).find(c=>
    companyKey(c.name)===nameKey||(regKey&&registrationKey(c.registration_no)===regKey));
   if(match)state.status+=' Documents company already exists; no duplicate created.';
   else{
    try{
     const {error}=await db.rpc('create_company_with_folders',{p_name:details.name,p_registration_no:details.registration});
     if(error)throw error;
     state.status+=' Standard Documents folders created.';
     try{await refreshCompanies?.();}catch(error){
      state.error='Folders created, but Documents list refresh failed: '+String(error?.message||error);
     }
    }catch(error){
     state.error='Master Listing saved, but Documents company creation failed: '+String(error?.message||error)+'. Use “Sync missing company folders” to retry.';
    }
   }
  }
 }finally{state.saving=false;onRender?.();}
}
async function saveRepairedDates(){
  if(!state.model)throw Error('Import a Master Listing first.');
  const {model,count}=repairLegacyDateSerials(state.model);
  if(!count){state.legacyDateCount=0;onRender?.();return;}
  const examples=[];
  for(let col=0;col<model.columns.length&&examples.length<3;col++){
   for(let row=0;row<model.rows.length&&examples.length<3;row++){
    const before=state.model.rows[row].values[col];
    const after=model.rows[row].values[col];
    if(before!==after){examples.push(model.columns[col].label+': '+before+' → '+after);break;}
   }
  }
  const confirmed=window.confirm('Convert '+count+' saved Excel date serial(s) in identified date columns to DD/MM/YYYY?\n\n'+
   examples.join('\n')+
   '\n\nThe current listing will be backed up before saving. Registration numbers, fees and shares will not change. The conversion assumes the 1900 Excel system if the original workbook date system was not saved. For exact source formatting, re-import the original .xlsx instead.');
  if(!confirmed)return;
  state.saving=true;state.status='Backing up and saving corrected date values…';state.error='';onRender?.();
  try{
   await saveModel(model,{backup:true});
   state.status=count+' date serial(s) corrected and saved to DMS. Previous listing retained as a private backup.';
  }finally{state.saving=false;onRender?.();}
 }
 async function syncDocuments(){
  const model=state.model;if(!model)throw Error('Import Master Listing first.');
  const existing=getCompanies?.()||[];
  const missing=model.rows.filter(row=>!findCompanyMatch(model,row,existing))
    .map(row=>companyData(model,row)).filter(c=>c?.name);
  if(!missing.length){state.status='Every imported company is already matched to a Documents company.';onRender?.();return;}
  if(!window.confirm('Create missing Documents company records and default folders for '+missing.length+' companies? Existing company folders and documents will not be replaced.'))return;
  state.saving=true;state.error='';state.status='Creating missing Documents company folders…';onRender?.();
  const problems=[];let created=0;
  try{
   for(let i=0;i<missing.length;i+=6){
    const group=missing.slice(i,i+6);
    const results=await Promise.all(group.map(async c=>{
     const {error}=await db.rpc('create_company_with_folders',{p_name:c.name,p_registration_no:c.registration});
     return error?c.name+': '+error.message:null;
    }));
    for(const err of results)err?problems.push(err):created++;
    state.status='Processed '+Math.min(i+6,missing.length)+' of '+missing.length+' company folders…';onRender?.();
   }
   await refreshCompanies?.();
   state.status='Documents sync: '+created+' companies processed; '+problems.length+' failed.';
   if(problems.length)state.error=problems.slice(0,3).join(' | ');
  }finally{state.saving=false;onRender?.();}
 }
 function render(){
  const model=state.model;
  const {rows,total,pages}=companyRows();
  const selected=state.sheets[state.sheetIndex],data=selected?.rows||[];
  const preview=state.sheets.length?importPreview():null;
  const width=Math.min(Math.max(...data.slice(0,40).map(x=>x?.length||0),1),200);
  const selectable=Array.from({length:width},(_,j)=>'<option value="'+j+'">'+(j+1)+' — '+esc(String(data[state.headingRow-1]?.[j]||'Column '+(j+1)).slice(0,60))+'</option>');
  const selector=(id,value,none=false)=>'<select id="'+id+'">'+(none?'<option value="-1"'+(value<0?' selected':'')+'>Not available</option>':'')+
    selectable.map((x,j)=>x.replace('<option value="'+j+'">','<option value="'+j+'"'+(j===value?' selected':'')+'>')).join('')+'</select>';
  // Display the imported company-name column ONCE, in the second position
  // after No. Never repeat it among the scrolling worksheet columns.
  const visible=model?.columns.map((col,index)=>({...col,index}))
   .filter(col=>!isListingOrdinalColumn(model,col.index)&&col.index!==model.nameColumn&&col.index!==model.registrationColumn)||[];
  const first=state.fullScreen?0:state.columnStart,end=model?(state.fullScreen?visible.length:Math.min(visible.length,first+6)):0;
  const cols=visible.slice(first,end);
  const previewCols=preview&&!preview.error?preview.columns.map((col,index)=>({...col,index}))
   .filter(col=>!isListingOrdinalColumn(preview,col.index)&&col.index!==preview.nameColumn).slice(0,9):[];
  const dateCss=label=>isListingFyeColumn(label)?'ml-fye-col':isListingDateColumn(label)?'ml-date-col':'';
  const disabled=state.saving||state.loading;
  return '<section class="ml-workspace'+(state.fullScreen?' ml-workspace-fullscreen':'')+'" aria-label="Master Listing workspace">'+
   '<div class="content-header"><div><p class="eyebrow">STATUTORY COMPANY INFORMATION</p><h1>Master Listing</h1>'+
   '<p class="muted">Import an Excel workbook, keep all company-information columns, and edit each company inside this private DMS tab.</p></div>'+
   '<div class="header-buttons">'+(model?act(state.fullScreen?'Exit full screen ✕':'Full screen ⛶','ml-fullscreen','','secondary'):'')+
   (model?act('Export CSV','ml-export','','secondary'):'')+(model?act('Import Register Books','ml-register-upload','','secondary'):'')+act('+ Add Company','ml-add','','primary')+act('Import Excel','ml-upload','','secondary')+'</div></div>'+
   '<input id="ml-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>'+
   '<input id="ml-register-file" type="file" accept=".zip,application/zip" hidden>'+
   (state.error?'<div class="alert" role="alert">'+esc(state.error)+'</div>':'')+
   (state.status?'<div class="info-strip" role="status">'+esc(state.status)+'</div>':'')+
   (state.registerPreview?'<section class="ml-import-panel"><h3>Review Register Book update</h3><p>'+state.registerPreview.parsedBooks+' Register Books parsed · '+state.registerPreview.matchedRows+' company rows matched · '+state.registerPreview.missingCompanies.length+' listing rows without a matching Register Book.</p><p class="muted">Only Directors & Members and Beneficial Owners will be added or updated. Other cells and existing document folders remain unchanged. A private backup is saved first. '+(state.registerPreview.errors.length?'Some files could not be read ('+state.registerPreview.errors.length+'); these companies will not be updated.':'')+'</p><div class="ml-actions">'+act('Confirm Register Book update','ml-register-apply','','primary')+act('Cancel','ml-register-cancel','','secondary')+'</div></section>':'')+
   (model&&state.legacyDateCount?'<div class="ml-date-repair" role="status"><strong>'+state.legacyDateCount+' saved date serial(s) detected.</strong> They are shown as DD/MM/YYYY in date columns. '+act('Save corrected dates','ml-repair-dates','','primary')+'<p>Save a corrected copy with backup, or re-import the original Excel workbook to retain its precise date styles.</p></div>':'')+
   (state.sheets.length?'<section class="ml-import-panel"><h3>Review workbook before importing</h3>'+
    '<div class="ml-import-controls"><label>Worksheet<select id="ml-sheet">'+state.sheets.map((x,i)=>'<option value="'+i+'"'+(i===state.sheetIndex?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label>'+
    '<label>Header row<input id="ml-header-row" type="number" min="1" max="'+data.length+'" value="'+state.headingRow+'"></label>'+
    '<label>First company row<input id="ml-start-row" type="number" min="2" max="'+data.length+'" value="'+state.startRow+'"></label>'+
    '<label>Company name column'+selector('ml-name-col',state.nameColumn)+'</label>'+
    '<label>Registration no. column'+selector('ml-reg-col',state.regColumn,true)+'</label></div>'+
    '<p class="muted">FYE, Date of Registration and other recognized dates display as DD/MM/YYYY. No. appears before the single Company Name column; blank cells show N/A.</p><p class="muted">Preview: '+(preview?.error?'<strong>'+esc(preview.error)+'</strong>':
     '<strong>'+preview.rows.length+' company rows × '+preview.columns.length+' columns</strong> ('+preview.skipped.blank+' blank, '+preview.skipped.duplicate+' duplicates skipped)')+'</p>'+
    '<div class="ml-table-scroll"><table class="ml-table"><tbody>'+
    (preview&&!preview.error?
     '<tr><th class="ml-no-col">No.</th><th>Company Name</th>'+previewCols.map(c=>'<th class="'+dateCss(c.label)+'">'+esc(c.label)+'</th>').join('')+'</tr>'+
     preview.rows.slice(0,7).map((r,i)=>'<tr><td class="ml-no-col">'+esc(listingOrdinalValue(preview,r,i))+'</td><td>'+esc(displayedListingValue(preview,preview.nameColumn,r.values[preview.nameColumn]))+'</td>'+previewCols.map(c=>'<td class="'+dateCss(c.label)+'">'+esc(displayedListingValue(preview,c.index,r.values[c.index]).slice(0,90))+'</td>').join('')+'</tr>').join('')
     :data.slice(0,7).map(r=>'<tr>'+Array.from({length:Math.min(10,width)},(_,j)=>'<td>'+esc(safeText(r?.[j]).trim()||'N/A')+'</td>').join('')+'</tr>').join(''))+
    '</tbody></table></div>'+
    '<div class="ml-actions">'+act('Cancel import','ml-cancel','','secondary')+
    (!preview?.error?act('Import '+preview.rows.length+' companies','ml-confirm','','primary'):'')+'</div></section>':'')+
   (model?'<div class="ml-dashboard"><strong>'+model.rows.length+' companies</strong><span>'+model.columns.length+' editable fields</span>'+
    '<span>Source: '+esc(model.filename)+' / '+esc(model.worksheet)+'</span></div>'+
    '<div class="ml-toolbar"><label>Search company or any field <input id="ml-search" type="search" value="'+esc(state.search)+'" placeholder="Search company name, number or details"></label>'+
    act('Search','ml-search-do','','secondary')+act('Clear','ml-search-clear','','secondary')+
    act('Sync missing company folders','ml-sync','','secondary')+'</div>'+
    (state.fullScreen?'<p class="ml-fullscreen-help">Full-screen table · all '+visible.length+' information columns · scroll right or down to browse.</p>':
    '<div class="ml-columns-nav">'+act('← Columns','ml-prev-cols','','secondary')+
    '<span>Columns '+(first+1)+'–'+end+' of '+visible.length+'</span>'+
    act('Columns →','ml-next-cols','','secondary')+'</div>')+
    '<div class="ml-table-scroll"><table class="ml-table"><thead><tr><th class="ml-no-col">No.</th><th>Company Name</th><th>Registration No.</th>'+
    cols.map(c=>'<th class="'+dateCss(c.label)+'" title="'+esc(c.label)+'">'+esc(c.label)+'</th>').join('')+'<th>Actions</th></tr></thead><tbody>'+
    rows.map(({row,index})=>{
     const c=companyData(model,row),match=findCompanyMatch(model,row,getCompanies?.()||[]);
     return '<tr><td class="ml-no-col">'+esc(listingOrdinalValue(model,row,index))+'</td><td><strong>'+esc(displayedListingValue(model,model.nameColumn,row.values[model.nameColumn]))+'</strong></td><td>'+esc(c.registration||'N/A')+'</td>'+
      cols.map(col=>{const display=displayedListingValue(model,col.index,row.values[col.index]);return '<td class="'+dateCss(col.label)+'" title="'+esc(display)+'">'+esc(display)+'</td>';}).join('')+
      '<td><div class="ml-row-actions">'+act('Edit','ml-edit',index,'primary')+
      (match?act('Documents','ml-documents',match.id,'secondary'):'<small>Not in Documents</small>')+'</div></td></tr>';
    }).join('')+'</tbody></table>'+(rows.length?'':'<div class="empty-line">No companies match your search.</div>')+'</div>'+
    '<div class="ml-pages">'+act('← Previous','ml-prev-page','','secondary')+
    '<span>Page '+(state.page+1)+' / '+pages+' · '+total+' matching companies</span>'+
    act('Next →','ml-next-page','','secondary')+'</div>'+
    '<p class="fineprint">Changes are saved to private DMS cloud storage using your signed-in account. Editing Master Listing fields does not automatically alter the Companies register or existing statutory documents.</p>'
   :(!state.loading&&!state.sheets.length?'<div class="empty-state"><div>📊</div><h3>No Master Listing imported yet</h3>'+
    '<p>Use Import Excel to load your company data, including deadlines, directors, filing details, fees and other worksheet columns.</p>'+
    act('Import Master Listing Excel','ml-upload','','primary')+act('+ Add Company','ml-add','','secondary')+'</div>':''))+
   '</section>'+(state.addOpen?renderAddCompany(): '')+(state.editIndex!==null&&model?.rows[state.editIndex]?renderEditor(): '');
 }
 
function renderAddCompany(){
 const model=state.model||manualListingTemplate();
 const fields=model.columns.map((col,i)=>{
  if(isListingOrdinalColumn(model,i))return '';
  const isName=i===model.nameColumn,isReg=i===model.registrationColumn;
  const hint=isName?'Required':isReg?'Optional':'Optional';
  const draft=state.addDraft?.[i]??'';
  return '<label><span>'+esc(col.label)+' <small>('+hint+')</small></span>'+
   '<textarea name="ml-new-'+i+'" rows="2" maxlength="'+(isName?250:isReg?100:15000)+'"'+(isName?' required':'')+
   ' placeholder="'+(isName?'Company name':isReg?'Registration number':isListingDateColumn(col.label)?'DD/MM/YYYY':'N/A')+'">'+esc(draft)+'</textarea></label>';
 }).join('');
 return '<div class="modal-backdrop"><section class="modal ml-editor-modal" role="dialog" aria-modal="true" aria-label="Add Company to Master Listing">'+
  '<div class="modal-heading"><h3>Add Company to Master Listing</h3>'+act('✕','ml-close-add')+'</div>'+
  '<p class="muted">Enter one company without reimporting the Excel file. Existing rows are preserved; No. is assigned automatically.</p>'+
  '<form id="ml-add-form"><div class="ml-edit-fields">'+fields+'</div>'+
  '<label class="ml-add-sync"><input type="checkbox" name="ml-create-documents"'+(state.addCreateFolders?' checked':'')+
  '> Create matching company under Documents with standard folders (if missing)</label>'+
  '<p class="muted">Statutory dates are displayed as DD/MM/YYYY. Your previous listing is privately backed up before saving.</p>'+
  '<div class="ml-actions">'+act('Cancel','ml-close-add')+
  '<button class="btn primary" type="submit"'+(state.saving?' disabled':'')+'>Save New Company</button></div></form></section></div>';
}
function renderEditor(){
  const model=state.model,index=state.editIndex,row=model.rows[index],company=companyData(model,row);
  return '<div class="modal-backdrop"><section class="modal ml-editor-modal" role="dialog" aria-modal="true" aria-label="Edit Master Listing company">'+
   '<div class="modal-heading"><h3>Edit '+esc(company.name)+'</h3>'+act('✕','ml-close-edit')+'</div>'+
   '<p class="muted">Edit any imported column. Save updates your private Master Listing without changing uploaded statutory documents.</p>'+
   '<form id="ml-edit-form"><div class="ml-edit-fields">'+model.columns.map((col,i)=>{
    const value=displayedListingValue(model,i,row.values[i]);return '<label><span>'+esc(col.label)+' <small>('+String(i+1)+')</small></span>'+
     '<textarea name="ml-col-'+i+'" rows="'+clamp(Math.ceil(value.length/100),2,6)+'" maxlength="15000">'+esc(value)+'</textarea></label>';
   }).join('')+'</div><div class="ml-actions">'+act('Cancel','ml-close-edit')+
   '<button class="btn primary" type="submit"'+(state.saving?' disabled':'')+'>Save company information</button></div></form></section></div>';
 }
 function onClick(action,id,readWorkbook){
  if(!action?.startsWith('ml-'))return false;
  const asyncRun=fn=>{if(state.loading||state.saving)return;Promise.resolve().then(fn).catch(fail);};
  if(action==='ml-add'){state.addOpen=true;state.editIndex=null;state.addDraft=null;state.addCreateFolders=true;state.error='';onRender?.();return true;}
  if(action==='ml-close-add'){state.addOpen=false;state.addDraft=null;state.error='';onRender?.();return true;}
  if(action==='ml-upload'){document.getElementById('ml-file')?.click();return true;}
  if(action==='ml-register-upload'){document.getElementById('ml-register-file')?.click();return true;}
  if(action==='ml-register-cancel'){state.registerPreview=null;state.error='';onRender?.();return true;}
  if(action==='ml-register-apply'){asyncRun(applyRegisterPreview);return true;}
  if(action==='ml-cancel'){state.sheets=[];state.preview=null;state.selectedFile=null;state.error='';onRender?.();return true;}
  if(action==='ml-confirm'){asyncRun(importSelected);return true;}
  if(action==='ml-edit'){state.editIndex=Number(id);onRender?.();return true;}
  if(action==='ml-close-edit'){state.editIndex=null;onRender?.();return true;}
  if(action==='ml-fullscreen'){
   state.fullScreen=!state.fullScreen;state.page=0;
   onRender?.();return true;
  }
  if(action==='ml-repair-dates'){asyncRun(saveRepairedDates);return true;}
  if(action==='ml-export'){
   if(!state.model)return true;
   const csv=listingCSV(state.model),blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='ZHENLI_Master_Listing.csv';link.hidden=true;
   document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   return true;
  }
  if(action==='ml-prev-page'){state.page=Math.max(0,state.page-1);onRender?.();return true;}
  if(action==='ml-next-page'){state.page++;onRender?.();return true;}
  if(action==='ml-prev-cols'){state.columnStart=Math.max(0,state.columnStart-6);onRender?.();return true;}
  if(action==='ml-next-cols'){const m=state.model;const remaining=m?.columns.filter((_,i)=>!isListingOrdinalColumn(m,i)&&i!==m.nameColumn&&i!==m.registrationColumn).length||0;state.columnStart=clamp(state.columnStart+6,0,Math.max(0,remaining-1));onRender?.();return true;}
  if(action==='ml-search-do'){state.search=document.getElementById('ml-search')?.value||'';state.page=0;onRender?.();return true;}
  if(action==='ml-search-clear'){state.search='';state.page=0;onRender?.();return true;}
  if(action==='ml-sync'){asyncRun(syncDocuments);return true;}
  if(action==='ml-documents'){openCompany?.(id);return true;}
  return false;
 }
 function onChange(target,readWorkbook){
  if(target?.id==='ml-register-file'){
   const file=target.files?.[0];target.value='';
   if(file)Promise.resolve().then(()=>readRegisterBooks(file)).catch(fail);
   return true;
  }
  if(target?.id==='ml-file'){
   const file=target.files?.[0];target.value='';
   if(file)readFile(file,readWorkbook).catch(fail);return true;
  }
  if(!target?.id?.startsWith('ml-'))return false;
  if(target.id==='ml-sheet'){
   state.loading=true;state.status='Reading the selected worksheet…';onRender?.();
   Promise.resolve().then(()=>switchSheet(Number(target.value))).catch(fail).finally(()=>{state.loading=false;onRender?.();});
   return true;
  }
  if(target.id==='ml-header-row'){state.headingRow=Number(target.value)||1;state.startRow=Math.max(state.startRow,state.headingRow+1);}
  else if(target.id==='ml-start-row')state.startRow=Number(target.value)||2;
  else if(target.id==='ml-name-col')state.nameColumn=Number(target.value);
  else if(target.id==='ml-reg-col')state.regColumn=Number(target.value);
  else return false;
  state.preview=importPreview();onRender?.();return true;
 }
 function onSubmit(form){
  if(form?.id==='ml-add-form'){Promise.resolve().then(()=>saveAddedCompany(form)).catch(fail);return true;}
  if(form?.id!=='ml-edit-form')return false;
  Promise.resolve().then(()=>saveEdit(form)).catch(fail);
  return true;
 }
 const exitFullscreen=()=>{if(!state.fullScreen)return false;state.fullScreen=false;state.page=0;onRender?.();return true;};
 return {render,load,reset,onClick,onChange,onSubmit,afterRender,exitFullscreen,get model(){return state.model;},get state(){return state;}};
}
