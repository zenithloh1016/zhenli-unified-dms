/**
 * Reissue a pending email-change confirmation through Supabase Auth.
 * No privileged tokens, user IDs, or confirmation links are handled by the DMS.
 */
export async function resendEmailChangeConfirmation(auth,email) {
 const next=String(email||'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next))throw Error('Enter the new email address you requested.');
 if(!auth||typeof auth.resend!=='function')throw Error('Email verification is unavailable.');
 const {error}=await auth.resend({type:'email_change',email:next});
 if(error)throw error;
 return 'If an email change is pending for this address, a new confirmation email has been requested. Check your NEW and PREVIOUS email inboxes (including spam), and complete any required confirmations before signing in with the new email.';
}
