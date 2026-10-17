import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const esc = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TASK_PAGE = `${import.meta.env.BASE_URL || './'}task-hub/index.html`;
const SIGNING_URL = String(import.meta.env.VITE_EDGEONE_SIGNING_URL || '').trim();
let payload = null;
let bridgeInstalled = false;
let lastUserId = null;
let syncBusy = false;
let queuedState = null;

export function renderIntegratedView(section, companies=[]) {
  const signingLink = getSigningUrl();
  if (section === 'tasks') return `<section class="module-header"><div><p class="eyebrow">TASK MANAGEMENT</p><h1>Secretarial Task Hub V3</h1><p class="muted">Original Kanban, deadlines, recurrence, checklist, calendar and task workflow.</p></div><span class="module-chip">Private cloud sync</span></section>
    <div class="module-notice">Your Task Hub data syncs with your Supabase account after installing the included SQL setup. To restore tasks from your original EdgeOne website, use its <strong>Export backup</strong>, then import that JSON file inside Task Hub here. Do not import a confidential backup into GitHub.</div>
    <iframe id="zh-task-frame" title="ZHENLI Secretarial Task Hub" loading="eager" src="${esc(TASK_PAGE)}" class="task-hub-frame"></iframe>`;
  if (section === 'signing') return `<section class="module-header"><div><p class="eyebrow">SIGNING WORKFLOW</p><h1>Sequential Signing</h1><p class="muted">Continue using your existing Tencent EdgeOne signing engine and private storage.</p></div><span class="module-chip">Existing EdgeOne service</span></section>
    <section class="integration-card"><h2>Keep your established signing process</h2><p>Create a request, upload PDFs, position signature boxes, activate sequential signers, send links, and download signed PDFs with audit records in your original signing deployment.</p>
    <div class="integration-steps"><span>① Draft & upload</span><span>② Place signature boxes</span><span>③ Sign in order</span><span>④ Download signed PDFs</span></div>
    ${signingLink ? `<button type="button" class="btn primary" data-action="zh-launch-signing">Open existing Signing Website ↗</button><p class="muted">${esc(signingLink.origin)}</p>` : `<div class="module-notice">Signing website address not configured. In GitHub → Settings → Secrets and variables → Actions → Variables, add <code>VITE_EDGEONE_SIGNING_URL</code> with your existing <strong>HTTPS EdgeOne signing site address</strong>, then run the web and APK workflow again.</div>`}
    <p class="muted">The signing administrator account, active signing requests, storage and sender emails remain on Tencent EdgeOne. Signed PDFs can be downloaded there and then uploaded into the relevant DMS company folder. Automatic transfer and single sign-on are not yet enabled.</p></section>`;
  const count = companies.length;
  return `<section class="module-header"><div><p class="eyebrow">ZHENLI WORKSPACE</p><h1>Company Secretarial Dashboard</h1><p class="muted">Quick access to your client records, statutory task tracking and sequential signing.</p></div></section>
    <div class="module-grid">
      <button type="button" data-action="zh-module" data-id="portfolio" class="module-tile"><span>📁</span><strong>Document Management</strong><b>${count} companies</b><small>11 standard folders per company</small></button>
      <button type="button" data-action="zh-module" data-id="tasks" class="module-tile"><span>📋</span><strong>Secretarial Task Hub</strong><small>Kanban, AR/AFS deadlines and recurring tasks</small></button>
      <button type="button" data-action="zh-module" data-id="signing" class="module-tile"><span>✍️</span><strong>Sequential Signing</strong><small>Original Tencent EdgeOne workflow</small></button>
    </div>
    <div class="module-notice">The DMS document database is synchronized through Supabase. Task Hub also synchronizes after the additional SQL migration is installed. Sequential Signing continues on the existing EdgeOne service.</div>`;
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

function mergeCompanies(current, dms) {
  const entries = Array.isArray(current) ? [...current] : [];
  const names = new Set(entries.map(c=>String(c.name||'').trim().toUpperCase()));
  let added=0;
  for(const co of dms){
    const name=String(co.name || '').trim().toUpperCase();
    if(!name || names.has(name))continue;
    names.add(name);
    entries.push({id:co.id,name,reg:co.registration_no||'',arDate:'',arDueDate:'',afsDueDate:'',afsDueStatus:'not provided',financialYearEnded:'',fye:'',notes:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    added++;
  }
  return {entries,added};
}

/** Parent/child postMessage security: same origin AND exact iframe window; Supabase policies control stored data. */
export function installHubBridge(db, getUser, getCompanies, displayError) {
  if(bridgeInstalled)return;
  bridgeInstalled=true;
  const defaultPayload=()=>({version:1,tasks:[],companies:[],activity:[],settings:{theme:'light',compact:false}});
  let requestedFor=null;
  async function saveChanges(){
    if(syncBusy)return;
    syncBusy=true;
    try {
      while(queuedState){
        const value=queuedState; queuedState=null;
        const user=getUser();
        if(!user || user.id!==lastUserId) return;
        const {error}=await db.from('task_hub_state').upsert({user_id:user.id,payload:value,updated_at:new Date().toISOString()},{onConflict:'user_id'});
        if(error) throw error;
      }
    }catch(error){displayError(new Error(`Task Hub cloud save failed: ${error.message}. Export a task backup before leaving.`));}
    finally{syncBusy=false; if(queuedState)void saveChanges();}
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
        const loaded=data?.payload && Array.isArray(data.payload.tasks) && Array.isArray(data.payload.companies) ? data.payload : defaultPayload();
        const merged=mergeCompanies(loaded.companies,getCompanies());
        payload={...loaded,companies:merged.entries};
        if(merged.added || !data){
          const {error:saveError}=await db.from('task_hub_state').upsert({user_id:user.id,payload,updated_at:new Date().toISOString()},{onConflict:'user_id'});
          if(saveError)throw saveError;
        }
        child.contentWindow?.postMessage({type:'ZHENLI_HUB_INIT',payload},window.location.origin);
      }catch(err){child.contentWindow?.postMessage({type:'ZHENLI_HUB_INIT',error:err.message},window.location.origin);}
      return;
    }
    if(event.data?.type==='ZHENLI_HUB_SAVE'){
      const p=event.data.payload;
      if(!p || !Array.isArray(p.tasks) || !Array.isArray(p.companies) || p.tasks.length>30000 || p.companies.length>10000) return;
      if(JSON.stringify(p).length>3_000_000) {displayError(new Error('Task Hub payload is too large for cloud sync.'));return;}
      payload=p;lastUserId=user.id;queuedState=p;void saveChanges();
    }
  });
}
