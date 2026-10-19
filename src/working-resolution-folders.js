/** Extra standard root folder for unfinalised resolutions.
 * Idempotent per company; never modify or move existing folders/documents.
 * "Board & Members' Resolution" remains separate from "Working Resolution".
 */
export const WORKING_RESOLUTION_FOLDER_NAME='Working Resolution';
export const WORKING_RESOLUTION_FOLDER_SORT_ORDER=14;
export const STANDARD_FOLDER_COUNT=14;

export function isExistingWorkingResolutionFolder(folder){
  if(!folder||folder.parent_id!==null)return false;
  const name=String(folder.name||'').trim().toLowerCase().replace(/\s+/g,' ');
  return name==='working resolution';
}

export function missingWorkingResolutionFolders(companies,existing){
  const done=new Set((existing||[]).filter(isExistingWorkingResolutionFolder).map(f=>f.company_id));
  const seen=new Set();
  return (companies||[]).filter(c=>{
    if(!c?.id||done.has(c.id)||seen.has(c.id))return false;
    seen.add(c.id);return true;
  });
}
