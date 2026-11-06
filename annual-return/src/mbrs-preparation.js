/**
 * UNICOSEC MBRS 2.0 Annual Return preparation handover.
 * This module intentionally does NOT claim to generate a valid SSM XBRL filing:
 * SSMxT 2022 mapping/business-rule validation and mPortal acceptance are separate.
 * All preparation is done from the currently open Annual Return draft in memory.
 */
import {Capacitor} from '@capacitor/core';
import {Filesystem,Directory,Encoding} from '@capacitor/filesystem';

const SSM_GUIDE='https://www.ssm.com.my/Pages/Services/Other-Services/MBRS.aspx';
const clean=value=>String(value??'').trim();

export function extractMbrsWorkspace(document,{filingType='AR1',unchangedConfirmed=false}={}){
 if(!['AR1','AR4'].includes(filingType))throw Error('Choose AR1 or AR4.');
 const rows=[];
 let section='',record='';
 for(const item of Array.isArray(document?.particulars)?document.particulars:[]){
  if(item?.type==='section'){section=clean(item.en);record='';continue;}
  if(item?.type==='heading'){record=clean(item.en);continue;}
  if(item?.type!=='field')continue;
  rows.push({
   section:section||'Uncategorised',
   record:record||'',
   field:clean(item.en)||'Unnamed field',
   displayLabel:clean(item.displayEn||item.en)||'Unnamed field',
   value:clean(item.value)
  });
 }
 const details=rows.filter(row=>row.section==='COMPANY DETAILS');
 const detail=name=>details.find(row=>row.field===name)?.value||'';
 const company={
  name:detail('Company Name')||clean(document?.company?.name),
  registrationNo:detail('Company Registration No.')||clean(document?.company?.no),
  annualReturnYear:detail('Annual Return Year')||clean(document?.company?.arYear),
  anniversaryDate:detail('Anniversary Date')||clean(document?.company?.arDate)
 };
 const checks=[];
 const fail=(message)=>checks.push({level:'missing',message});
 const review=(message)=>checks.push({level:'review',message});
 if(!company.name)fail('Company name is missing.');
 if(!company.registrationNo)fail('Company registration number is missing.');
 if(!/^\d{4}$/.test(company.annualReturnYear))fail('A four-digit Annual Return year is required.');
 if(!company.anniversaryDate)fail('Anniversary date is missing.');
 else if(!/^(\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4})$/.test(company.anniversaryDate))
  review('Check anniversary date format against SSM and mTool.');
 if(filingType==='AR4'){
  if(!unchangedConfirmed)fail('Confirm that this return qualifies as unchanged particulars before preparing AR4.');
  review('Verify AR4 eligibility against the last lodged return and SSM requirements; UNICOSEC cannot infer unchanged status.');
 }
 const present=rows.filter(row=>row.value);
 if(!present.some(row=>/^DIRECTOR\s+\d+$/i.test(row.record)))
  review('No populated director particulars found in the current draft.');
 if(filingType==='AR1'&&!present.some(row=>/^MEMBER\s+\d+$/i.test(row.record)))
  review('No populated member particulars found; verify the Register of Members.');
 if(!present.some(row=>row.record==='AUDITOR'))
  review('Auditor particulars are blank or unavailable; confirm the appointment and exemption position.');
 if(!present.some(row=>/^BENEFICIAL OWNER\s+\d+$/i.test(row.record)))
  review('Review beneficial ownership and the Annexure requirements using the current SSM mTool.');
 review('Cross-check current/former officers, issued capital, charges, beneficial owners and SSM pre-populated data.');
 review('SSM mTool must validate and generate the official XBRL ZIP; this handover is NOT an XBRL or mPortal upload.');
 return {
  format:'UNICOSEC-MBRS-PREPARATION-ONLY',
  version:1,
  filingType,
  source:'Current UNICOSEC Annual Return draft',
  preparedAt:new Date().toISOString(),
  company,
  fields:rows,
  checks,
  populatedFields:present.length,
  totalFields:rows.length
 };
}

export function mbrsWorksheetCsv(workspace){
 const guard=value=>{
  let text=String(value??'');
  // Prevent spreadsheet formula execution when downloaded CSV is opened in Excel.
  if(/^\s*[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
 };
 const lines=[['Filing Type','Section','Record','Field','Value']];
 for(const row of workspace.fields){
  lines.push([workspace.filingType,row.section,row.record,row.field,row.value]);
 }
 return '\uFEFF'+lines.map(cells=>cells.map(guard).join(',')).join('\r\n')+'\r\n';
}

export function mbrsPreparationSummary(workspace){
 const missing=workspace.checks.filter(x=>x.level==='missing');
 const review=workspace.checks.filter(x=>x.level==='review');
 return [
  'UNICOSEC / MBRS 2.0 PREPARATION CHECK',
  'Filing type: '+workspace.filingType,
  'Company: '+workspace.company.name,
  'Registration no.: '+workspace.company.registrationNo,
  'Annual Return year: '+workspace.company.annualReturnYear,
  'Anniversary date: '+workspace.company.anniversaryDate,
  'Populated particulars: '+workspace.populatedFields+' / '+workspace.totalFields,
  'Missing requirements: '+missing.length,
  ...missing.map(x=>'MISSING: '+x.message),
  ...review.map(x=>'REVIEW: '+x.message),
  '',
  'Not an SSM filing. Final XBRL must be generated and validated using a taxonomy-compliant tool, then lodged via authorised SSM mPortal.'
 ].join('\n');
}

async function saveText(filename,content,mime){
 // The native Annual Return APK may not support ordinary browser downloads.
 if(Capacitor.isNativePlatform()&&Capacitor.isPluginAvailable('Filesystem')){
  await Filesystem.writeFile({path:filename,data:content,directory:Directory.Documents,encoding:Encoding.UTF8,recursive:true});
  return 'Saved to device Documents: '+filename;
 }
 const blob=new Blob([content],{type:mime});
 const url=URL.createObjectURL(blob);
 try{
  const link=document.createElement('a');
  link.href=url;link.download=filename;
  document.body.append(link);link.click();link.remove();
 }finally{setTimeout(()=>URL.revokeObjectURL(url),2000);}
 return 'Download requested: '+filename;
}

export function mountMbrsPreparation(getDocument){
 const root=document.getElementById('mbrs-preparation');
 if(!root)return;
 const type=root.querySelector('#mbrs-type');
 const confirmation=root.querySelector('#mbrs-ar4-confirmation');
 const verify=root.querySelector('#mbrs-check');
 const csv=root.querySelector('#mbrs-csv');
 const json=root.querySelector('#mbrs-json');
 const copy=root.querySelector('#mbrs-copy');
 const status=root.querySelector('#mbrs-status');
 const checklist=root.querySelector('#mbrs-checklist');
 const ar4Label=root.querySelector('#mbrs-ar4-confirm-row');
 const snapshot=()=>extractMbrsWorkspace(getDocument(),{
  filingType:type.value,unchangedConfirmed:confirmation.checked
 });
 const show=text,error=false)=>{status.textContent=text;status.setAttribute('data-error',String(error));};
 const refresh=()=>{
  ar4Label.hidden=type.value!=='AR4';
  const w=snapshot();
  const missing=w.checks.filter(x=>x.level==='missing');
  checklist.textContent=mbrsPreparationSummary(w);
  checklist.hidden=false;
  show(missing.length?missing.length+' issue(s) need attention before MBRS preparation.':
    'Preparation review completed. '+w.populatedFields+' populated particulars. Official mTool validation remains required.',!!missing.length);
 };
 type.addEventListener('change',refresh);
 confirmation.addEventListener('change',refresh);
 verify.addEventListener('click',refresh);
 const safeName=()=>clean(snapshot().company.registrationNo).replace(/[^A-Za-z0-9_-]/g,'').slice(0,30)||'ANNUAL-RETURN';
 csv.addEventListener('click',async()=>{
  try{
   const w=snapshot();
   show(await saveText('UNICOSEC_MBRS_'+safeName()+'_'+w.filingType+'_WORKSHEET.csv',
    mbrsWorksheetCsv(w),'text/csv;charset=utf-8'));
  }catch(error){show('CSV save failed: '+error.message,true);}
 });
 json.addEventListener('click',async()=>{
  try{
   const w=snapshot();
   show(await saveText('UNICOSEC_MBRS_'+safeName()+'_'+w.filingType+'_WORKING.json',
    JSON.stringify(w,null,2),'application/json;charset=utf-8'));
  }catch(error){show('JSON save failed: '+error.message,true);}
 });
 copy.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(mbrsPreparationSummary(snapshot()));show('Preparation summary copied.');}
  catch(error){show('Clipboard not available on this device: '+error.message,true);}
 });
 const guide=root.querySelector('#mbrs-ssm-guide');
 if(guide)guide.href=SSM_GUIDE;
 root.dataset.mbrsMounted='true';
}
