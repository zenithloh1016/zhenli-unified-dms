import './style.css';
import {Capacitor} from '@capacitor/core';
import {Filesystem,Directory} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {cloneBlank,importAnnualReturnText,normalizeDocument,emptyCount,populatedCount} from './core.js';
import {buildPdf,savePdf,exposeDownload,renderPages} from './pdf.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let doc=cloneBlank(),generated=null,busy=false;
$('footer-year').textContent=new Date().getFullYear();
const profileFields=[['name','Company name / 公司名称'],['no','Registration number / 注册编号'],
 ['arYear','Annual Return year / 申报年份'],['arDate','Anniversary / AR date / 周年申报日期'],
 ['lodgementDueDate','Statutory lodgement deadline / 法定截止日期'],
 ['masterListingDueDate','Internal Master Listing due date / 内部截止日期']];
function status(message,error=false){
 const el=$('message');el.textContent=message;el.style.color=error?'#b23b44':'#28768c';
}
function fieldStatus(){
 const total=doc.particulars.filter(x=>x.type==='field').length,done=populatedCount(doc);
 $('count').textContent=done+' / '+total+' filled';
 $('field-status').textContent=emptyCount(doc)+' blank items remain. Empty values appear as NOT PROVIDED / 未提供资料 in PDF.';
}
function profileInputs(){
 $('company-fields').innerHTML=profileFields.map(([key,label])=>'<label class="field-label">'+esc(label)+
  '<input data-company="'+esc(key)+'" type="text" value="'+esc(doc.company[key])+'" autocomplete="off" placeholder="Enter or import information"></label>').join('');
 const signs=[['name','Confirming director / 签署董事姓名'],['nric','NRIC / Passport / 身份证或护照号码'],['date','Actual signing date (optional) / 签署日期']];
 $('signature-fields').innerHTML=signs.map(([key,label])=>'<label class="field-label">'+esc(label)+
  '<input data-sign="'+esc(key)+'" type="text" value="'+esc(doc.signatureDirector[key]||'')+'" placeholder="'+
  (key==='date'?'Leave blank until signed':'Enter signatory details')+'" autocomplete="off"></label>').join('');
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
    '<small>'+esc(item.cn||'')+'</small></div><textarea data-item="'+index+
    '" rows="'+(String(item.value||'').length>220?5:2)+'" spellcheck="false" placeholder="Enter confirmed information…">'+
    esc(item.value)+'</textarea></div>';
  }).join('');
  return '<details class="ar-section" '+(i===0||q||onlyBlank?'open':'')+'><summary class="section-header"><span>'+
   esc(group.title)+'<small>'+esc(group.cn)+'</small></span><span class="pill">'+
   rows.filter(x=>x.item.type==='field').length+' fields</span></summary><div class="section-fields">'+body+'</div></details>';
 }).join('')||'<p class="status">No matching fields. Clear search or disable blank-only filter.</p>';
 fieldStatus();
}
function resetView(){profileInputs();$('search').value='';$('incomplete').checked=false;renderSections();}
function setBusy(flag){busy=flag;$('generate-pdf').disabled=flag;$('export-json').disabled=flag;}
async function importFile(file){
 if(!file)return;
 try{
  if(file.size>3_000_000)throw Error('Selected file exceeds 3 MB. Choose a company-specific .gs/.json file.');
  const incoming=importAnnualReturnText(await file.text(),file.name);
  if(!confirm('Load '+file.name+'? Unsaved edits in the current form will be replaced.'))return;
  doc=incoming;resetView();$('download-box').hidden=true;generated=null;
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
 if(!confirm('Generate a CLIENT REVIEW PDF? Verify missing details, director particulars and statutory dates before sending.'))return;
 setBusy(true);
 try{
  const {blob,filename,pages}=await buildPdf(doc,status);
  generated={blob,filename};exposeDownload(blob,filename);
  const note=await savePdf(blob,filename);
  status('Generated '+pages+' pages: '+filename+'. '+note);
 }catch(error){status('PDF generation failed: '+error.message+'. Try Brave or reduce very long field values.',true);}
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
$('company-fields').addEventListener('input',e=>{const k=e.target.dataset.company;if(k)doc.company[k]=e.target.value;});
$('signature-fields').addEventListener('input',e=>{const k=e.target.dataset.sign;if(k)doc.signatureDirector[k]=e.target.value;});
$('particulars').addEventListener('input',e=>{
 const index=e.target.dataset.item;
 if(index!==undefined&&doc.particulars[+index]){
  doc.particulars[+index].value=e.target.value;
  e.target.closest('.field-entry')?.classList.toggle('blank',!e.target.value.trim());
  fieldStatus();
 }
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
 try{status(await savePdf(generated.blob,generated.filename,{share:true}));}
 catch(error){status('Save/share failed: '+error.message,true);}
});
$('print').addEventListener('click',()=>{
 if(!doc.company.name.trim())return status('Enter company name first.',true);
 renderPages(doc);window.print();setTimeout(()=>{$('pdf-stage').textContent='';},5000);
});
window.addEventListener('afterprint',()=>{$('pdf-stage').textContent='';});
resetView();status('Ready. Import an existing Annual Return .gs or JSON to prefill details, or start manually.');
