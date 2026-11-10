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
 return name.length>=3&&name.length<=250&&!/^(?:-|—|–|N\/?A|NIL|NONE|NOT APPLICABLE|UNKNOWN|NOT PROVIDED)$/i.test(name)
  ?name:'';
};

/** Text explicitly says Former Name in one source cell (e.g. scanned PDF). */
export function formerNameFromInlineCell(value){
 const text=String(value??'').trim();
 const labelled=/^(?:(?:former|previous|old|prior)\s+(?:company\s+|registered\s+)?names?|(?:company\s+)?formerly\s+known\s+as)\s*(?:\(\s*if any\s*\))?\s*[:=–-]\s*(.+)$/i.exec(text);
 if(labelled)return validName(labelled[1]);
 const abbreviated=/^F\.?K\.?A\.?\s*[:=–-]?\s+(.+)$/i.exec(text);
 return abbreviated?validName(abbreviated[1]):'';
}

/** Read explicit former names from imported/saved Company Details or metadata. */
export function recordedFormerCompanyName(book){
 if(!book)return '';
 // Editable Company Details wins over an older imported Master worksheet.
 const profiles=(book.sheets||[]).filter(s=>referenceKind(s.name)==='profile');
 profiles.sort((a,b)=>{
  const rank=name=>/^company details$/i.test(String(name||'').trim())?0:
   /^master$/i.test(String(name||'').trim())?1:2;
  return rank(a.name)-rank(b.name);
 });
 const isOtherField=value=>companyDetailIndex(value)>=0;
 const extractRows=rows=>{
  for(let ri=0;ri<rows.length;ri++){
   const row=rows[ri]||[];
   if(!Array.isArray(row))continue;
   for(let col=0;col<row.length;col++){
    const text=String(row[col]||'').trim();
    if(companyDetailIndex(text)===1){
     // Real workbook templates often use B or C for a former name, even
     // when the label is in A. Reject intervening statutory field labels.
     for(let pos=col+1;pos<Math.min(row.length,col+9);pos++){
      const next=String(row[pos]||'').trim();
      if(!next)continue;
      if(isOtherField(next))break;
      const value=validName(next);
      if(value)return value;
     }
     // Some merged-cell spreadsheets place the value on the next row.
     const nextRow=rows[ri+1]||[];
     if(Array.isArray(nextRow)&&
        !nextRow.slice(0,col+1).some(v=>String(v||'').trim())){
      for(let pos=col+1;pos<Math.min(nextRow.length,col+9);pos++){
       const candidate=String(nextRow[pos]||'').trim();
       if(!candidate)continue;
       if(isOtherField(candidate))break;
       const value=validName(candidate);
       if(value)return value;
      }
     }
    }
    const inline=formerNameFromInlineCell(text);
    if(inline)return inline;
   }
  }
  return '';
 };
 for(const sheet of profiles){
  const hit=extractRows(sheet.rows||[]);
  if(hit)return hit;
 }
 // Excel conversion may place the cover-page particulars on a sheet not
 // literally called Master. Only accept it if the sheet contains an explicit
 // company identity label and a former-name label. Do not read director or
 // member personal-name fields as legal company history.
 for(const sheet of book.sheets||[]){
  if(profiles.includes(sheet))continue;
  const title=String(sheet.name||'').trim();
  if(referenceKind(title)&&referenceKind(title)!=='profile')continue;
  const cells=(sheet.rows||[]).slice(0,120).flatMap(row=>Array.isArray(row)?row:[]);
  const hasIdentity=cells.some(cell=>companyDetailIndex(cell)===0||companyDetailIndex(cell)===2);
  const namedCompanyCover=/^(?:(?:company'?s?\s+)?particulars|company\s+(?:information|profile|overview)|corporate\s+information|cover(?:\s+(?:sheet|page))?|master\s+(?:sheet|register))$/i.test(title);
  if(!hasIdentity&&!namedCompanyCover)continue;
  const hit=extractRows((sheet.rows||[]).slice(0,120));
  if(hit)return hit;
 }
 const history=Array.isArray(book.formerNames)?book.formerNames:
  Array.isArray(book.former_names)?book.former_names:
  Array.isArray(book.previousNames)?book.previousNames:[];
 for(let index=history.length-1;index>=0;index--){
  const name=validName(history[index]);
  if(name)return name;
 }
 return validName(book.formerCompanyName||book.previousCompanyName);
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
   let hasFormerNameField=false;
   const rows=(sheet.rows||[]).map(row=>{
    if(!Array.isArray(row))return row;
    const copy=row.slice();
    for(let col=0;col<copy.length-1;col++){
     const position=companyDetailIndex(copy[col]);
     if(position===1)hasFormerNameField=true;
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
   // Preserve the source workbook; expose recorded inline former names as
   // one editable row in the projected Company Details view.
   if(formerValue&&!hasFormerNameField&&rows.length<12000){
    rows.push(['Former Company Name:',formerValue]);
    changed=true;
   }
   return changed?{...sheet,rows}:sheet;
  })
 };
}
