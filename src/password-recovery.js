import {createClient} from '@supabase/supabase-js';
import {completeRecovery,establishRecoverySession,isRecoveryLink,recoveryLinkKind} from './password-recovery-helpers.js';

const form=document.getElementById('recovery-form');
const message=document.getElementById('message');
const rawUrl=String(import.meta.env.VITE_SUPABASE_URL||'').trim().replace(/^['"]|['"]$/g,'');
let parsed=null;
try{parsed=new URL(rawUrl);}catch{}
const endpoint=parsed?.protocol==='https:' && parsed.hostname.endsWith('.supabase.co')?parsed.origin:'';
const key=import.meta.env.VITE_SUPABASE_ANON_KEY;
const linkUrl=window.location.href;
const cameFromRecoveryLink=isRecoveryLink(linkUrl);
const linkKind=recoveryLinkKind(linkUrl);
const href=new URL(linkUrl);
const hashParameters=new URLSearchParams(href.hash.slice(1));
const queryParameters=href.searchParams;
const emailLinkError=queryParameters.get('error_description')||hashParameters.get('error_description')||
  queryParameters.get('error')||hashParameters.get('error');
const db=endpoint&&key?createClient(endpoint,key,{
 auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}
}):null;

let ready=false;
function show(text){message.textContent=String(text);}
async function unlock(){
 if(ready||!db)return;
 const {data,error}=await db.auth.getUser();
 if(error||!data?.user?.id)throw Error('The recovery session could not be verified. Request a new reset email.');
 ready=true;
 form.hidden=false;
 // The one-time token is no longer needed in the address bar.
 try{window.history.replaceState(null,'',window.location.pathname);}catch{}
 show('Identity verified. Set a new password of at least 12 characters.');
}
async function verifyCallback(){
 if(!db||ready)return;
 try{
  await establishRecoverySession(db.auth,linkUrl);
  await unlock();
 }catch(error){
  if(!ready)show('Unable to verify the password reset link: '+String(error.message||error)+
   '. If the link has expired, was already used, or was opened on a different device during a PKCE flow, request a fresh link from UNICOSEC.');
 }
}
if(!db)show('UNICOSEC authentication is not configured. Contact the administrator.');
else if(emailLinkError)show('Recovery link was rejected: '+emailLinkError+'. Request a fresh link from the UNICOSEC sign-in page.');
else if(!cameFromRecoveryLink)show('No password recovery token found. Use “Forgot password?” on the UNICOSEC sign-in page, then open the newest email link in your browser.');
else{
 // Supabase processes implicit hash tokens asynchronously on initialisation.
 // Listen before the first getSession() call so no valid recovery event is lost.
 if(linkKind==='implicit'){
  db.auth.onAuthStateChange((event,session)=>{
   if((event==='PASSWORD_RECOVERY'||event==='SIGNED_IN')&&session?.user&&!ready){
    void unlock().catch(error=>show('Unable to verify recovery session: '+error.message));
   }
  });
 }
 void verifyCallback();
}
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!ready||!db)return;
 const fields=new FormData(form);
 const password=String(fields.get('newPassword')||'');
 const confirmation=String(fields.get('confirmPassword')||'');
 const button=form.querySelector('button');
 button.disabled=true;
 try{
  const result=await completeRecovery(db.auth,password,confirmation);
  form.reset();form.hidden=true;ready=false;show(result);
 }catch(error){show('Could not reset password: '+String(error.message||error));}
 finally{button.disabled=false;}
});
