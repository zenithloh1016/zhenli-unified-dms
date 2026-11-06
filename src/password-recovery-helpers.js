// Recovery links are handled by a separate, credential-free page. The DMS
// itself still requires manual email + password on every new login.
export const RECOVERY_REDIRECT='https://zenithloh1016.github.io/zhenli-unified-dms/password-recovery/';

export async function requestRecoveryEmail(auth,email){
 const address=String(email||'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw Error('Enter a valid email address.');
 const {error}=await auth.resetPasswordForEmail(address,{redirectTo:RECOVERY_REDIRECT});
 if(error)throw error;
 // No account enumeration: Supabase may respond identically for unknown users.
 return 'If this email belongs to an account, a password reset link will be sent. If your login email change is still pending, use your PREVIOUS confirmed email. Check your inbox and spam folder.';
}

/** Supabase may deliver recovery credentials as a URL fragment (implicit),
 * token_hash (email template) or a one-time PKCE code (query string).
 * Detection is deliberately limited to a callback URL, not arbitrary sign-in.
 */
export function recoveryLinkKind(url){
 const parsed=new URL(String(url));
 const hash=new URLSearchParams(parsed.hash.slice(1)),query=parsed.searchParams;
 if(hash.get('type')==='recovery')return 'implicit';
 if(query.get('type')==='recovery'&&query.has('token_hash'))return 'token_hash';
 if(query.has('code')&&query.get('code'))return 'pkce';
 if(hash.has('error')||query.has('error')||hash.has('error_description')||query.has('error_description'))return 'error';
 return null;
}

export function isRecoveryLink(url){return recoveryLinkKind(url)!==null;}

/** Move an unexpectedly root-directed recovery callback to the actual reset UI.
 * This is a same-origin navigation: query strings and URL fragments never go to
 * Supabase, another host, logging, or application analytics here.
 */
export function recoveryRedirectFromAppRoot(url){
 const parsed=new URL(String(url));
 if(/\\/password-recovery(?:\\/|\\/index\\.html)?$/i.test(parsed.pathname))return '';
 if(!recoveryLinkKind(parsed.href))return '';
 const target=new URL('./password-recovery/',parsed.href);
 return target.href;
}

/** Establish a temporary session only when the user has arrived with a valid
 * password recovery callback. A code may require a same-device PKCE verifier;
 * token_hash and implicit flows are handled independently.
 */
export async function establishRecoverySession(auth,url){
 const parsed=new URL(String(url)),kind=recoveryLinkKind(url);
 let response;
 if(kind==='token_hash'){
  const token_hash=parsed.searchParams.get('token_hash');
  if(!token_hash)throw Error('Missing recovery token.');
  response=await auth.verifyOtp({type:'recovery',token_hash});
 }else if(kind==='pkce'){
  const code=parsed.searchParams.get('code');
  if(!code)throw Error('Missing recovery code.');
  response=await auth.exchangeCodeForSession(code);
 }else if(kind==='implicit'){
  response=await auth.getSession();
 }else{
  throw Error('A valid password recovery link is required.');
 }
 if(response.error)throw response.error;
 const session=response.data?.session;
 if(!session?.user?.id)throw Error('Recovery link is expired or invalid. Request a new one.');
 return session;
}

export async function completeRecovery(auth,password,confirmation){
 const next=String(password||'');
 if(next.length<12)throw Error('Your new password must be at least 12 characters.');
 if(next!==String(confirmation||''))throw Error('The passwords do not match.');
 const {data:userData,error:userError}=await auth.getUser();
 if(userError||!userData?.user?.id)throw Error('Your reset link is missing or expired. Request a new one from UNICOSEC.');
 const {error}=await auth.updateUser({password:next});
 if(error)throw error;
 const {error:signOutError}=await auth.signOut();
 if(signOutError)throw signOutError;
 return 'Password updated. Return to UNICOSEC and sign in using your confirmed email address and new password.';
}
