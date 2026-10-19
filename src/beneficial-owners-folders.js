/** Idempotent root-folder additions; no rename, document move or deletion. */
export const BO_FOLDER_NAME='Beneficial Owners';
export const BO_FOLDER_SORT_ORDER=12;
export const STANDARD_FOLDER_COUNT=12;
export function isExistingBeneficialOwnersFolder(folder){
  if(!folder || folder.parent_id!==null)return false;
  const name=String(folder.name||'').toLowerCase().replace(/\s+/g,' ').trim();
  return /beneficial\s+owners?\b|beneficial\s+ownership\b|\bebos\b/.test(name);
}
export function missingBeneficialOwnerFolders(companies,existing){
  const done=new Set(existing.filter(isExistingBeneficialOwnersFolder).map(f=>f.company_id));
  const visited=new Set();
  return companies.filter(c=>{
    if(!c?.id||visited.has(c.id)||done.has(c.id))return false;
    visited.add(c.id);return true;
  });
}
