/** Idempotent root folder addition for each DMS company.
 * Existing Constitution/Memorandum/Articles root folders are reused, never moved.
 * No existing documents, storage paths or other folders are modified.
 */
export const CONSTITUTION_FOLDER_NAME='Constitution';
export const CONSTITUTION_FOLDER_SORT_ORDER=13;
export const STANDARD_FOLDER_COUNT=13;

export function isExistingConstitutionFolder(folder){
  if(!folder||folder.parent_id!==null)return false;
  const name=String(folder.name||'').toLowerCase().replace(/\s+/g,' ').trim();
  return /\bconstitution\b|\bmemorandum\b|\barticles of association\b/.test(name);
}
export function missingConstitutionFolders(companies,existing){
  const done=new Set((existing||[]).filter(isExistingConstitutionFolder).map(f=>f.company_id));
  const visited=new Set();
  return (companies||[]).filter(c=>{
    if(!c?.id||visited.has(c.id)||done.has(c.id))return false;
    visited.add(c.id);
    return true;
  });
}
