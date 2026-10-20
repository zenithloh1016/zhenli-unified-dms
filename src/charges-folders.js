/** Standard top-level Charges folder for every DMS company.
 * Only an exact "Charges" root folder satisfies this category.
 * Existing documents, other statutory folders, and nested folders stay untouched.
 */
export const CHARGES_FOLDER_NAME='Charges';
export const CHARGES_FOLDER_SORT_ORDER=15;
export const STANDARD_FOLDER_COUNT=15;

export function isExistingChargesFolder(folder){
  if(!folder||folder.parent_id!==null)return false;
  return String(folder.name||'').trim().toLowerCase().replace(/\s+/g,' ')==='charges';
}

export function missingChargesFolders(companies,existing){
  const present=new Set((existing||[]).filter(isExistingChargesFolder).map(f=>f.company_id));
  const visited=new Set();
  return (companies||[]).filter(company=>{
    if(!company?.id||visited.has(company.id)||present.has(company.id))return false;
    visited.add(company.id);
    return true;
  });
}
