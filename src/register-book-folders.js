/** Standard root folder for each company. Never rename or move old files. */
export const REGISTER_BOOK_FOLDER_NAME='Register Book';
export const REGISTER_BOOK_FOLDER_SORT_ORDER=16;
export const STANDARD_FOLDER_COUNT=16;
export function isExistingRegisterBookFolder(folder){
 return !!folder && folder.parent_id===null &&
  String(folder.name||'').trim().toLowerCase().replace(/\s+/g,' ')==='register book';
}
export function missingRegisterBookFolders(companies,folders){
 const found=new Set((folders||[]).filter(isExistingRegisterBookFolder).map(f=>f.company_id));
 const seen=new Set();
 return (companies||[]).filter(c=>{
  if(!c?.id||seen.has(c.id)||found.has(c.id))return false;
  seen.add(c.id);return true;
 });
}
