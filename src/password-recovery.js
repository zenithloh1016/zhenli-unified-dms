import {createClient} from '@supabase/supabase-js';
import {completeRecovery,isRecoveryLink} from './password-recovery-helpers.js';

const form=document.getElementById('recovery-form');
const message=document.getElementById('message');
const rawUrl=String(import.meta.env.VITE_SUPABASE_URL||'').trim().replace(/^['"]|['"]$/g,'');
let parsed=null;
try{parsed=new URL(rawUrl);}catch{}
const endpoint=parsed?.protocol==='https:' && parsed.hostname.endsWith('.supabase.co')?parsed.origin:'';
const key=import.meta.env.VITE_SUPABASE_ANON_KEY;
const cameFromRecoveryLink=isRecoveryLink(window.location.href);
const parameters=new URLSearchParams(window.location.hash.slice(1));
const emailLinkError=parameters.get('error_description')||parameters.get('error');
const db=endpoint&&key?createClient(endpoint,key,{
 auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}
}):null;

let ready=false;
function show(text){message.textContent=String(text);}
async function unlock(){
 if(ready||!db)return;
 const {data,error}=await db.auth.getUser();
 if(error||!data?.user?.id)return;
 ready=true;
 form.hidden=false;
 show('Identity verified. Set a new password of at least 12 characters.');
}
if(!db)show('UNICOSEC authentication is not configured. Contact the administrator.');
else if(emailLinkError)show('Recovery link was rejected: '+emailLinkError+'. Request a fresh link from the main login screen.');
else if(!cameFromRecoveryLink)show('No recovery link found. Use “Forgot password” on the UNICOSEC sign-in page.');
else{
 db.auth.onAuthStateChange((event,session)=>{
   if((event==='PASSWORD_RECOVERY'||event==='SIGNED_IN')&&session?.user)void unlock();
 });
 void db.auth.getSession().then(({data,error})=>{
   if(!error && data?.session?.user)void unlock();
   else if(!ready)show('The reset link is invalid, expired, or already used. Request a new link from UNICOSEC.');
 }).catch(()=>show('Unable to verify recovery link. Please request a new one.'));
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
