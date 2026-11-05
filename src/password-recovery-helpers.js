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

export function isRecoveryLink(url){
 const parsed=new URL(String(url));
 return new URLSearchParams(parsed.hash.slice(1)).get('type')==='recovery';
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
