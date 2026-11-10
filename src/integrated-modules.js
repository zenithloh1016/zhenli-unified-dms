import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import readExcelFile from 'read-excel-file/browser';
import {saveOrShareFile} from './file-transfer.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TASK_PAGE = `${import.meta.env.BASE_URL || './'}task-hub/index.html`;
const SIGNING_URL = String(import.meta.env.VITE_EDGEONE_SIGNING_URL || '').trim();
let payload = null;
let bridgeInstalled = false;
let lastUserId = null;
let syncBusy = false;
let queuedState = null;
let hubWritePromise = null;
const deletedCompanyByAccount = new Map();
const hubName = value => String(value||'').normalize('NFKC').trim().toUpperCase();
function scrubDeletedHubCompanies(value,userId){
  if(!value||!Array.isArray(value.companies)||!Array.isArray(value.tasks))return value;
  const removed=deletedCompanyByAccount.get(userId);
  if(!removed)return value;
  return {...value,
    companies:value.companies.filter(x=>!removed.ids.has(x.id)&&!removed.names.has(hubName(x.name))),
    tasks:value.tasks.filter(x=>!removed.ids.has(x.company)&&!removed.names.has(hubName(x.company)))
  };
}
export async function waitForHubWrites(){
  if(hubWritePromise)await hubWritePromise;
}
export function forgetDeletedHubCompany(company,userId){
  if(!userId||!company?.id||!company?.name)return;
  let removed=deletedCompanyByAccount.get(userId);
  if(!removed){removed={ids:new Set(),names:new Set()};deletedCompanyByAccount.set(userId,removed);}
  removed.ids.add(company.id);removed.names.add(hubName(company.name));
  if(lastUserId===userId){
    payload=scrubDeletedHubCompanies(payload,userId);
    queuedState=scrubDeletedHubCompanies(queuedState,userId);
  }
}

export function renderIntegratedView(section, companies=[]) {
  const signingLink = getSigningUrl();
  if (section === 'tasks') return `<section class="module-header"><div><p class="eyebrow">TASK MANAGEMENT</p><h1>Secretarial Task Hub V3</h1><p class="muted">Original Kanban, deadlines, recurrence, checklist, calendar and task workflow.</p></div><span class="module-chip">Private cloud sync</span></section>
    <div class="module-notice">Your Task Hub uses the signed-in DMS Supabase account and existing private task records. Task creation, statutory deadlines, Kanban and company lists stay synchronized. Export a backup before importing other workspace data.</div>
    <iframe id="zh-task-frame" title="ZHENLI Secretarial Task Hub" loading="eager" src="${esc(TASK_PAGE)}" class="task-hub-frame" allow="web-share"></iframe>`;
  if (section === 'signing') return `<section class="module-header"><div><p class="eyebrow">SIGNING WORKFLOW</p><h1>Sequential Signing</h1><p class="muted">Continue using your existing Tencent EdgeOne signing engine and private storage.</p></div><span class="module-chip">Existing EdgeOne service</span></section>
    <section class="integration-card"><h2>Keep your established signing process</h2><p>Create a request, upload PDFs, position signature boxes, activate sequential signers, send links, and download signed PDFs with audit records in your original signing deployment.</p>
    <div class="integration-steps"><span>① Draft & upload</span><span>② Place signature boxes</span><span>③ Sign in order</span><span>④ Download signed PDFs</span></div>
    ${signingLink ? `<button type="button" class="btn primary" data-action="zh-launch-signing">Open existing Signing Website ↗</button><p class="muted">${esc(signingLink.origin)}</p>` : `<div class="module-notice">Signing website address not configured. In GitHub → Settings → Secrets and variables → Actions → Variables, add <code>VITE_EDGEONE_SIGNING_URL</code> with your existing <strong>HTTPS EdgeOne signing site address</strong>, then run the web and APK workflow again.</div>`}
    <p class="muted">The signing administrator account, active signing requests, storage and sender emails remain on Tencent EdgeOne. Signed PDFs can be downloaded there and then uploaded into the relevant DMS company folder. Automatic transfer and single sign-on are not yet enabled.</p></section>`;
  const count = companies.length;
  return `<section class="module-header"><div><p class="eyebrow">ZHENLI WORKSPACE</p><h1>Company Secretarial Dashboard</h1><p class="muted">Quick access to your client records, statutory task tracking and sequential signing.</p></div></section>
    <div class="module-grid">
      <button type="button" data-action="zh-module" data-id="portfolio" class="module-tile"><span>📁</span><strong>Document Management</strong><b>${count} companies</b><small>12 standard folders per company</small></button>
      <button type="button" data-action="zh-module" data-id="tasks" class="module-tile"><span>📋</span><strong>Secretarial Task Hub</strong><small>Kanban, AR/AFS deadlines and recurring tasks</small></button>
      <button type="button" data-action="zh-module" data-id="signing" class="module-tile"><span>✍️</span><strong>Sequential Signing</strong><small>Original Tencent EdgeOne workflow</small></button>
    </div>
    <div class="module-notice">DMS documents and Task Hub records both use private Supabase storage. The separate Tencent EdgeOne sequential-signing provider remains available until you choose to retire it.</div>`;
}

export function getSigningUrl() {
  try {
    const u=new globalThis.URL(SIGNING_URL);
    if(u.protocol !== 'https:' || u.username || u.password) return null;
    if(u.search || u.hash) return null; // no session tokens or private signing URLs in build configuration
    return u;
  } catch {return null;}
}
export async function launchSigning() {
  const u=getSigningUrl();
  if(!u) throw new Error('Configure VITE_EDGEONE_SIGNING_URL as the HTTPS URL of your existing admin signing website.');
  if(Capacitor.isNativePlatform()) await Browser.open({url:u.href});
  else window.open(u.href,'_blank','noopener,noreferrer');
}

const hubRegKey=value=>{
  const s=String(value??'').normalize('NFKC').toUpperCase();
  const twelve=s.match(/\d{12}/);
  if(twelve)return twelve[0];
  const compact=s.replace(/[^A-Z0-9]/g,'');
  return compact.length>=6&&compact!=='NA'?compact:'';
};
function mergeCompanies(current,dms){
  // Older Task Hub entries have their OWN UUIDs, unrelated to Documents IDs.
  // Match a unique registration number first, then Documents ID or unique
  // current name. Never create a second Task Hub entry for a renamed company.
  const source=Array.isArray(current)?current:[];
  const docs=Array.isArray(dms)?dms:[];
  const docsById=new Map(docs.map(co=>[String(co.id),co]));
  const groupBy=(arr,keyfn)=>{
    const map=new Map();
    for(const x of arr){
      const key=keyfn(x);
      if(!key)continue;
      if(!map.has(key))map.set(key,[]);
      map.get(key).push(x);
    }
    return map;
  };
  const docsByReg=groupBy(docs,x=>hubRegKey(x.registration_no));
  const docsByName=groupBy(docs,x=>hubName(x.name));
  const lookup=entry=>{
    const byId=docsById.get(String(entry.id));
    if(byId)return byId;
    const reg=hubRegKey(entry.reg);
    if(reg&&docsByReg.get(reg)?.length===1)return docsByReg.get(reg)[0];
    const name=hubName(entry.name);
    return docsByName.get(name)?.length===1?docsByName.get(name)[0]:null;
  };
  const richer=entry=>['arDate','arDueDate','afsDueDate','financialYearEnded','fye','notes']
    .reduce((sum,k)=>sum+(String(entry?.[k]??'').trim()?1:0),0);
  const entries=[],entryByDocumentId=new Map(),renames=new Map();
  let added=0,renamed=0,deduped=0;
  for(const original of source){
    const match=lookup(original);
    const updated=match?{...original,name:match.name,
      reg:match.registration_no||original.reg}:original;
    if(match&&String(original.name)!==String(match.name)){
      const oldKey=hubName(original.name);
      if(oldKey)renames.set(oldKey,match.name);
      renamed++;
    }
    if(match&&entryByDocumentId.has(String(match.id))){
      // Retain the historical record holding deadlines, notes and original ID.
      // Fill only empty fields from the duplicate, never discard actual data.
      const index=entryByDocumentId.get(String(match.id));
      const previous=entries[index],incoming=updated;
      const winning=richer(incoming)>richer(previous)?incoming:previous;
      const extra=winning===incoming?previous:incoming;
      const combined={...winning};
      for(const k of ['arDate','arDueDate','afsDueDate','afsDueStatus',
        'financialYearEnded','fye','notes']){
        if(!String(combined[k]??'').trim()&&String(extra[k]??'').trim())
          combined[k]=extra[k];
      }
      entries[index]=combined;
      deduped++;
    }else{
      if(match)entryByDocumentId.set(String(match.id),entries.length);
      entries.push(updated);
    }
  }
  for(const co of docs){
    if(entryByDocumentId.has(String(co.id)))continue;
    // Leave legacy unmatched companies alone; add only genuinely absent ones.
    const name=String(co.name||'').trim();
    if(!name)continue;
    entryByDocumentId.set(String(co.id),entries.length);
    entries.push({id:co.id,name,reg:co.registration_no||'',arDate:'',arDueDate:'',
      afsDueDate:'',afsDueStatus:'not provided',financialYearEnded:'',fye:'',
      notes:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    added++;
  }
  return {entries,added,renamed,deduped,renames};
}
function mergeHubPayload(current,dms){
  const merged=mergeCompanies(current.companies,dms);
  const tasks=(current.tasks||[]).map(task=>{
    const nextName=merged.renames.get(hubName(task.company));
    return nextName&&task.company!==nextName
      ?{...task,company:nextName}:task;
  });
  const changed=JSON.stringify(merged.entries)!==JSON.stringify(current.companies)||
    tasks.some((task,i)=>task!==current.tasks[i]);
  return {payload:{...current,companies:merged.entries,tasks},changed};
}

/** Parent/child postMessage security: same origin AND exact iframe window; Supabase policies control stored data. */
export function installHubBridge(db, getUser, getCompanies, displayError) {
  if(bridgeInstalled)return;
  bridgeInstalled=true;
  const defaultPayload=()=>({version:1,tasks:[],companies:[],activity:[],settings:{theme:'light',compact:false}});
  let requestedFor=null, syncPromise=null;
  function saveChanges(){
    if(syncPromise)return syncPromise;
    syncBusy=true;
    syncPromise=(async()=>{
      while(queuedState){
        const value=queuedState;queuedState=null;
        const user=getUser();
        if(!user || user.id!==lastUserId)throw Error('Task Hub session changed. Sign in again.');
        const {error}=await db.from('task_hub_state').upsert({user_id:user.id,payload:value,updated_at:new Date().toISOString()},{onConflict:'user_id'});
        if(error)throw error;
      }
    })().finally(()=>{
      syncBusy=false;syncPromise=null;
      if(queuedState)void saveChanges().catch(displayError);
    });
    hubWritePromise=syncPromise;
    return syncPromise;
  }
  function respond(child,type,requestId,result){
    if(typeof requestId!=='string'||requestId.length>100)return;
    if(document.getElementById('zh-task-frame')?.contentWindow===child)
      child.postMessage({type,requestId,...result},window.location.origin);
  }
  window.addEventListener('message',async(event)=>{
    if(event.origin!==window.location.origin)return;
    const child=document.getElementById('zh-task-frame');
    if(!child || event.source!==child.contentWindow)return;
    const user=getUser();
    if(!user)return;
    if(event.data?.type==='ZHENLI_HUB_READY') {
      lastUserId=user.id;
      if(requestedFor===child.contentWindow)return;
      requestedFor=child.contentWindow;
      try {
        const {data,error}=await db.from('task_hub_state').select('payload').eq('user_id',user.id).maybeSingle();
        if(error)throw error;
        const loaded=scrubDeletedHubCompanies(data?.payload && Array.isArray(data.payload.tasks) && Array.isArray(data.payload.companies) ? data.payload : defaultPayload(),user.id);
        const merged=mergeHubPayload(loaded,getCompanies());
        payload=merged.payload;
        if(merged.changed || !data){
          const {error:saveError}=await db.from('task_hub_state').upsert({user_id:user.id,payload,updated_at:new Date().toISOString()},{onConflict:'user_id'});
          if(saveError)throw saveError;
        }
        child.contentWindow?.postMessage({type:'ZHENLI_HUB_INIT',payload},window.location.origin);
      }catch(err){child.contentWindow?.postMessage({type:'ZHENLI_HUB_INIT',error:err.message},window.location.origin);}
      return;
    }
    const type=event.data?.type,requestId=event.data?.requestId,childWindow=child.contentWindow;
    if(type==='ZHENLI_HUB_SAVE' || type==='ZHENLI_HUB_SAVE_CONFIRM'){
      const p=event.data.payload;
      if(!p || !Array.isArray(p.tasks) || !Array.isArray(p.companies) || p.tasks.length>30000 || p.companies.length>10000
        || JSON.stringify(p).length>3_000_000){
        if(type==='ZHENLI_HUB_SAVE_CONFIRM')respond(childWindow,'ZHENLI_HUB_SAVE_RESULT',requestId,{ok:false,error:'Invalid or oversized Task Hub data'});
        else displayError(new Error('Task Hub payload is too large for cloud sync.'));
        return;
      }
      const filtered=scrubDeletedHubCompanies(p,user.id);
      const synced=mergeHubPayload(filtered,getCompanies()).payload;
      payload=synced;lastUserId=user.id;queuedState=synced;
      try {
        await saveChanges();
        if(type==='ZHENLI_HUB_SAVE_CONFIRM')respond(childWindow,'ZHENLI_HUB_SAVE_RESULT',requestId,{ok:true});
      } catch(err) {
        displayError(new Error('Task Hub cloud save failed: '+err.message));
        if(type==='ZHENLI_HUB_SAVE_CONFIRM')respond(childWindow,'ZHENLI_HUB_SAVE_RESULT',requestId,{ok:false,error:err.message});
      }
      return;
    }
    if(type==='ZHENLI_HUB_EXPORT_FILE'){
      try{
        const {filename,mime,contents}=event.data;
        if(typeof filename!=='string'||filename.length>180||!filename.trim()||!filename.match(/\.(json|csv)$/i)||filename.includes('/')||filename.includes('\\')
          ||typeof contents!=='string'||contents.length>15_000_000)throw Error('Invalid backup file.');
        const result=await saveOrShareFile(new Blob([contents],{type:mime||'application/json'}),filename,{preferShare:true});
        respond(childWindow,'ZHENLI_HUB_EXPORT_RESULT',requestId,{ok:result.method!=='cancelled',method:result.method,filename:result.filename,
          error:result.method==='cancelled'?'Save/share cancelled. You can try again.':''});
      }catch(err){respond(childWindow,'ZHENLI_HUB_EXPORT_RESULT',requestId,{ok:false,error:err.message});}
      return;
    }
    if(type==='ZHENLI_HUB_PARSE_XLSX'){
      try{
        const file=event.data.file;
        if(!(file instanceof Blob)||file.size<1||file.size>8*1024*1024)throw Error('Choose an Excel workbook smaller than 8 MB.');
        const names=(await readExcelFile(file,{getSheets:true})).map(s=>s.name).filter(Boolean);
        const sheet=names.find(n=>/master\s*listing/i.test(n))||names[0];
        if(!sheet)throw Error('No Excel worksheet found.');
        const rows=await readExcelFile(file,{sheet});
        if(!Array.isArray(rows)||rows.length>5000)throw Error('Workbook has too many rows.');
        respond(childWindow,'ZHENLI_HUB_XLSX_RESULT',requestId,{ok:true,rows,sheet});
      }catch(err){respond(childWindow,'ZHENLI_HUB_XLSX_RESULT',requestId,{ok:false,error:err.message});}
    }
  });
}
