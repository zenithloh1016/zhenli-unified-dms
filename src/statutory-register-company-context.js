/**
 * Keep all verified former-name sources visible, even for companies created
 * before Documents acquired the former_names database column. Preserve
 * imported worksheets and their source coordinates; only project identity
 * fields and name display without F.K.A. for live previews/exports.
 */
import {formatFormerCompanyName,companyDetailIndex,referenceKind} from './statutory-register-reference.js';

const cleanName=value=>String(value??'').trim()
 .replace(/^F\.?K\.?A\.?\s*/i,'').trim();
const validName=value=>{
 const name=cleanName(value);
 return name.length>=3&&!/^(?:-|—|–|N\/?A|NIL|NONE|NOT APPLICABLE|UNKNOWN|NOT PROVIDED)$/i.test(name)
  ?name:'';
};

/** Read pre-existing former names from an imported/saved Company Details row. */
export function recordedFormerCompanyName(book){
 if(!book)return '';
 for(const sheet of book.sheets||[]){
  if(referenceKind(sheet.name)!=='profile')continue;
  for(const row of sheet.rows||[]){
   if(!Array.isArray(row))continue;
   for(let col=0;col<row.length-1;col++){
    if(companyDetailIndex(row[col])!==1)continue;
    const value=validName(row[col+1]);
    if(value)return value;
   }
  }
 }
 const history=Array.isArray(book.formerNames)?book.formerNames:
  Array.isArray(book.former_names)?book.former_names:[];
 for(let index=history.length-1;index>=0;index--){
  const name=validName(history[index]);
  if(name)return name;
 }
 return validName(book.formerCompanyName);
}

export function currentCompanyRegisterView(book,company){
 if(!book)return null;
 if(!company?.id||String(company.id)!==String(book.companyId))return book;
 const currentName=String(company.name||book.companyName||'').trim();
 const currentNumber=String(company.registration_no||book.registrationNo||'').trim();
 const liveHistory=Array.isArray(company.former_names)?company.former_names:
  Array.isArray(company.formerNames)?company.formerNames:[];
 const historical=Array.isArray(book.formerNames)?book.formerNames:[];
 const savedName=recordedFormerCompanyName(book);
 const verified=validName(formatFormerCompanyName({formerNames:liveHistory}));
 // When Documents lacks name history (common in older companies), restore the
 // name from saved Company Details or the original statutory register metadata.
 // Never infer a former legal name from a stale workbook heading or file title.
 const formerValue=(company.formerNameSource==='master-listing'?savedName||verified:verified||savedName)||
  validName(formatFormerCompanyName({formerNames:historical}));
 const formerNames=liveHistory.some(name=>validName(name))?liveHistory:
  formerValue?[formerValue]:historical;
 return {
  ...book,companyName:currentName,registrationNo:currentNumber,formerNames,
  sheets:(book.sheets||[]).map(sheet=>{
   if(referenceKind(sheet.name)!=='profile')return sheet;
   let changed=false;
   const rows=(sheet.rows||[]).map(row=>{
    if(!Array.isArray(row))return row;
    const copy=row.slice();
    for(let col=0;col<copy.length-1;col++){
     const position=companyDetailIndex(copy[col]);
     const existing=String(copy[col+1]??'').trim();
     const replacement=position===0?currentName:
      position===1?(formerValue||validName(existing)):
      position===2?currentNumber:null;
     if(replacement!==null&&existing!==replacement){
      copy[col+1]=replacement;changed=true;
     }
    }
    return changed?copy:row;
   });
   return changed?{...sheet,rows}:sheet;
  })
 };
}
