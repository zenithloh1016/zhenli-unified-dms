// Same original ZHENLI Task Hub interface as the DMS, hosted independently.
// This page is hosted on GitHub Pages and loads all private task state from
// Supabase using the SAME authenticated account as the DMS.
import {createClient} from '@supabase/supabase-js';
import {installHubBridge} from './integrated-modules.js';

const root=document.getElementById('zh-task-cloud');
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rawUrl=String(import.meta.env.VITE_SUPABASE_URL||'').trim().replace(/^['"]|['"]$/g,'');
let parsed=null;
try{parsed=new URL(rawUrl);}catch{ /* Show safe configuration message */ }
const endpoint=parsed?.protocol==='https:'&&parsed.hostname.endsWith('.supabase.co')?
  parsed.origin:'';
const publishableKey=String(import.meta.env.VITE_SUPABASE_ANON_KEY||'');
const db=endpoint&&publishableKey?createClient(endpoint,publishableKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
}):null;
const shellUrl=new URL('../task-hub/index.html',window.location.href).href + '?v=20261027-nine-status-v1';
const dmsUrl=new URL('../index.html',window.location.href).href;
let currentUser=null;
let companies=[];
let lastError='',connecting=true;
let authMode='login';
let lastMountedUser=null;
let busyAuth=false;
function info(message){
  const status=document.getElementById('zh-status');
  if(status){status.textContent=String(message||'');status.hidden=false;}
  else{lastError=String(message||'');render();}
}
function authPage(){
  return '<main class="zh-login"><form id="zh-cloud-login" autocomplete="on">'+
    '<h1>UNICOSEC Task Hub</h1><p>Private Supabase workspace. Use the same login as UNICOSEC - Company Secretarial Management System. All tasks and companies use your private Supabase workspace.</p>'+
    (lastError?'<p class="zh-error" role="alert">'+escapeHtml(lastError)+'</p>':'')+
    '<label>Email<input name="email" type="email" required autocomplete="username"></label>'+
    '<label>Password<input name="password" type="password" required autocomplete="current-password"></label>'+
    '<button class="zh-btn primary" type="submit"'+(busyAuth?' disabled':'')+'>Sign in to Task Hub</button>'+
    '<p><a href="'+escapeHtml(dmsUrl)+'">Back to DMS</a></p>'+
    '</form></main>';
}
function cloudPage(){
  return '<main class="zh-cloud"><header class="zh-toolbar"><div><h1>UNICOSEC | Task Hub</h1>'+
    '<small>Same Task Hub · Private Supabase cloud storage</small></div>'+
    '<div class="zh-actions"><span style="font-size:12px;color:#607a90">'+escapeHtml(currentUser?.email||'')+'</span>'+
    '<a class="zh-btn" href="'+escapeHtml(dmsUrl)+'">Open DMS</a>'+
    '<button type="button" class="zh-btn" id="zh-signout">Sign out</button></div></header>'+
    '<iframe id="zh-task-frame" title="UNICOSEC Secretarial Task Hub" src="'+
      escapeHtml(shellUrl)+'" loading="eager" referrerpolicy="same-origin"></iframe>'+
    '<div id="zh-status" role="status" hidden></div></main>';
}
function render(){
  if(connecting){root.innerHTML='<div class="zh-login"><p>Connecting to Supabase…</p></div>';return;}
  root.innerHTML=currentUser?cloudPage():authPage();
}
async function refreshUser(user){
  const id=user?.id||null;
  if(id===lastMountedUser && id!==null)return;
  currentUser=user||null;
  lastMountedUser=id;
  companies=[];
  connecting=!!currentUser;
  render();
  if(currentUser){
    try{
      const {data,error}=await db.from('companies').select('id,name,registration_no').order('name').limit(5000);
      if(error)throw error;
      if(currentUser?.id!==id)return;
      companies=data||[];
      lastError='';connecting=false;render();
    }catch(err){
      if(currentUser?.id!==id)return;
      companies=[];
      // Task Hub can still load its own data, even if companies listing fails.
      lastError='Company-list sync unavailable: '+String(err?.message||err).slice(0,220);
      connecting=false;render();
      info(lastError);
    }
  }
}
if(db){
  // The existing audited DMS bridge is reused to persist the unchanged
  // Task Hub's tasks, checklist, recurrence, activity and company metadata.
  installHubBridge(db,()=>currentUser,()=>companies,err=>
    info('Task Hub Supabase save failed: '+String(err?.message||err).slice(0,300)));
  db.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT')void refreshUser(null);
    if(event==='SIGNED_IN' && session?.user?.id!==lastMountedUser)
      void refreshUser(session.user);
  });
  void db.auth.getUser().then(({data,error})=>{
    if(error&&!/session missing/i.test(error.message||''))lastError=error.message;
    if(!data?.user){connecting=false;render();}
    else void refreshUser(data.user);
  }).catch(err=>{lastError=String(err?.message||err);connecting=false;render();});
}else{
  lastError='Supabase cloud configuration is unavailable. Ask the DMS administrator to check the deployment environment.';
  connecting=false;render();
}
root.addEventListener('submit',async event=>{
  if(event.target?.id!=='zh-cloud-login')return;
  event.preventDefault();if(!db||busyAuth)return;
  const form=event.target,fields=new FormData(form);
  const email=String(fields.get('email')||'').trim();
  const password=String(fields.get('password')||'');
  if(!email||!password)return;
  busyAuth=true;lastError='';
  form.querySelector('button[type="submit"]')?.setAttribute('disabled','');
  const {error}=await db.auth.signInWithPassword({email,password});
  busyAuth=false;password&&form.querySelector('[name="password"]')&&(form.querySelector('[name="password"]').value='');
  if(error){lastError=error.message;render();} // login success triggers auth change
});
root.addEventListener('click',event=>{
  if(event.target?.id==='zh-signout'&&db){
    void db.auth.signOut().then(({error})=>{if(error)info(error.message);});
  }
});
