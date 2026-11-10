/**
 * Current Documents company identity is authoritative for live statutory
 * register headings, Company Details and PDF exports. The original imported
 * workbook and its backups are not modified merely by rendering.
 */
import {formatFormerCompanyName,companyDetailIndex,referenceKind} from './statutory-register-reference.js';

export function currentCompanyRegisterView(book,company){
 if(!book)return null;
 if(!company||!company.id||String(company.id)!==String(book.companyId))return book;
 const formerNames=Array.isArray(company.former_names)?company.former_names:
  Array.isArray(book.formerNames)?book.formerNames:[];
 const currentName=String(company.name||book.companyName||'').trim();
 const currentNumber=String(company.registration_no||book.registrationNo||'').trim();
 const formerValue=formatFormerCompanyName({formerNames});
 return {
  ...book,companyName:currentName,registrationNo:currentNumber,
  formerNames,
  sheets:(book.sheets||[]).map(sheet=>{
   if(referenceKind(sheet.name)!=='profile')return sheet;
   let changed=false;
   const rows=(sheet.rows||[]).map(row=>{
    const position=companyDetailIndex(row?.[0]);
    const replacement=position===0?currentName:
     position===1&&formerValue?formerValue:
     position===2?currentNumber:null;
    if(replacement===null||String(row?.[1]||'')===replacement)return row;
    changed=true;
    const updated=row.slice();updated[1]=replacement;return updated;
   });
   return changed?{...sheet,rows}:sheet;
  })
 };
}
