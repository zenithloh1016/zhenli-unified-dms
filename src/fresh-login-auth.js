/**
 * Require manual credentials every time a UNICOSEC page or app WebView starts.
 * Supabase retains access and refresh tokens in memory only during this page
 * lifetime. Token refresh still works for long editing/signing sessions.
 */
export function freshLoginAuthOptions(){
  return {persistSession:false,autoRefreshToken:true,detectSessionInUrl:false};
}

/**
 * Stop the old localStorage session from being reused after this migration.
 * Delete only this Supabase project's legacy authentication token; never clear
 * Annual Return offline drafts, Task Hub data, or unrelated browser storage.
 */
export function clearLegacyAuthSession(projectUrl, storage){
  try{
    const host=new URL(String(projectUrl||'')).hostname;
    const match=/^([a-z0-9-]+)\.supabase\.co$/i.exec(host);
    if(!match)return false;
    const store=storage===undefined?globalThis.localStorage:storage;
    if(!store?.removeItem)return false;
    store.removeItem(`sb-${match[1]}-auth-token`);
    return true;
  }catch{
    // Private browsing and locked-down WebViews may restrict localStorage.
    // Authentication still stays ephemeral due to persistSession:false.
    return false;
  }
}
