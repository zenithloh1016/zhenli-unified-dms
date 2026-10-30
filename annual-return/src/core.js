import template from './template.json' with {type:'json'};
export const SCHEMA_VERSION=7;
export const cloneBlank=()=>structuredClone(template);
const safe=(s,n=20000)=>String(s??'').slice(0,n);

/** Company identity is entered ONCE, in the first Company Details section.
 * Retain the historical company object for PDF filenames and .gs/JSON compatibility.
 */
export const COMPANY_DETAILS={
 'Company Name':'name',
 'Company Registration No.':'no',
 'Annual Return Year':'arYear',
 'Anniversary Date':'arDate'
};
export function syncCompanyDetails(doc,{preferFields=true}={}){
 if(!doc?.company||!Array.isArray(doc.particulars))return doc;
 for(let i=0;i<doc.particulars.length;i++){
  const item=doc.particulars[i];if(item.type!=='field')continue;
  const key=COMPANY_DETAILS[item.en];
  if(!key)continue;
  const fieldVal=String(item.value||'').trim(),profileVal=String(doc.company[key]||'').trim();
  if(fieldVal&&(preferFields||!profileVal))doc.company[key]=item.value;
  else if(!fieldVal&&profileVal)item.value=String(doc.company[key]);
 }
 return doc;
}
/** Keep the schema's canonical 'en' labels intact: MSIC, company identity,
 * member, charge and beneficial-owner logic depend on them. User edits live in
 * displayEn/displayCn and remain editable in drafts and exported PDFs.
 */
export function displayParticularLabel(item,language='en'){
 const property=language==='cn'?'displayCn':'displayEn';
 const fallback=language==='cn'?'cn':'en';
 return typeof item?.[property]==='string'?item[property]:String(item?.[fallback]??'');
}
export function updateParticularLabel(doc,index,en,cn=''){
 const items=doc?.particulars;
 if(!Array.isArray(items)||!Number.isInteger(index)||index<0||index>=items.length)
  throw Error('Item does not exist.');
 const item=items[index];
 if(!['field','section','heading'].includes(item.type))throw Error('This item cannot be renamed.');
 const label=String(en||'').trim(),chinese=String(cn||'').trim();
 if(!label)throw Error('Enter an English label.');
 item.displayEn=safe(label,350);
 item.displayCn=safe(chinese,350);
 return item;
}
/** Reorder one field, either before/after a field or directly below a section.
 * Does not alter its canonical field key, value, or labels; move is persisted
 * because particulars array order is saved in the existing per-company draft.
 */
export function moveParticularField(doc,fromIndex,targetIndex,{after=false}={}){
 const items=doc?.particulars;
 if(!Array.isArray(items))throw Error('Annual Return particulars are unavailable.');
 if(!Number.isInteger(fromIndex)||items[fromIndex]?.type!=='field')
  throw Error('Drag an individual field.');
 if(!Number.isInteger(targetIndex)||!['field','section','heading'].includes(items[targetIndex]?.type))
  throw Error('Drop onto a field, heading, or section.');
 if(fromIndex===targetIndex)return {moved:false,from:fromIndex,to:fromIndex};
 const target=items[targetIndex];
 // A drop on a section/heading always places the field immediately below its heading.
 const desired=target.type==='field'?(targetIndex+(after?1:0)):targetIndex+1;
 const destination=desired>fromIndex?desired-1:desired;
 if(destination===fromIndex)return {moved:false,from:fromIndex,to:fromIndex};
 const [field]=items.splice(fromIndex,1);
 items.splice(destination,0,field);
 return {moved:true,from:fromIndex,to:destination};
}
/** Add a bilingual heading to the chosen section without changing existing fields.
 * A new heading is placed at the section's end, before its next section.
 */
export function insertParticularHeading(doc,sectionIndex,en,cn=''){
 const items=doc?.particulars;
 if(!Array.isArray(items)||!Number.isInteger(sectionIndex)||items[sectionIndex]?.type!=='section')
  throw Error('Select a valid section before adding a heading.');
 if(items.length>=1200)throw Error('The Annual Return item limit is reached.');
 const label=String(en??'').trim();
 if(!label)throw Error('Enter an English heading name.');
 let position=sectionIndex+1;
 while(position<items.length&&items[position].type!=='section')position++;
 const item={type:'heading',en:safe(label,350),cn:safe(String(cn??'').trim(),350),value:''};
 items.splice(position,0,item);
 return {index:position,heading:item};
}

/** Opt-in migration for a company-specific lost heading on the device's draft.
 * Recreate the AUDITOR heading and its template field names, with blank values.
 * Never overwrite an existing heading or modify any unrelated company.
 */
export function restoreRsshAuditorHeading(doc){
 const companyName=String(doc?.company?.name??'').trim().replace(/\s+/g,' ').toUpperCase();
 if(companyName!=='RSSH SERVICES SDN BHD')return {restored:false,reason:'different-company'};
 const items=doc?.particulars;
 if(!Array.isArray(items))return {restored:false,reason:'no-particulars'};
 if(items.some(x=>x.type==='heading'&&String(x.en||'').trim().toUpperCase()==='AUDITOR'))
  return {restored:false,reason:'already-present'};
 const companySection=items.findIndex(x=>x.type==='section'&&/DIRECTORS, COMPANY SECRETARY/i.test(x.en||''));
 if(companySection<0)return {restored:false,reason:'section-missing'};
 const source=cloneBlank().particulars;
 const auditorIndex=source.findIndex(x=>x.type==='heading'&&x.en==='AUDITOR');
 if(auditorIndex<0)throw Error('Auditor template is missing.');
 let end=auditorIndex+1;
 while(end<source.length&&source[end].type==='field')end++;
 const replacement=source.slice(auditorIndex,end).map(x=>({...x,value:''}));
 if(items.length+replacement.length>1200)throw Error('Too many items to restore Auditor.');
 let position=companySection+1;
 while(position<items.length&&items[position].type!=='section')position++;
 items.splice(position,0,...replacement);
 return {restored:true,headingIndex:position,addedFields:replacement.length-1};
}
/** Remove a charge block without deleting shared summary fields that follow it.
 * Works for all companies, including charge 1 and subsequent charge headings.
 */
export function removeRegisteredChargeRecord(doc,headingIndex){
 const items=doc?.particulars;
 if(!Array.isArray(items)||!Number.isInteger(headingIndex)||
    items[headingIndex]?.type!=='heading'||!/^\s*REGISTERED\s+CHARGE\s*\d+\s*$/i.test(items[headingIndex].en||''))
  throw Error('Choose a Registered Charge heading to remove.');
 let section=-1,sectionEnd=items.length;
 for(let i=headingIndex;i>=0;i--){
  if(items[i].type==='section'){section=i;break;}
 }
 if(section<0||!/REGISTERED CHARGES/i.test(items[section].en||''))
  throw Error('Registered Charge heading must be inside the Registered Charges section.');
 for(let i=headingIndex+1;i<items.length;i++){
  if(items[i].type==='section'){sectionEnd=i;break;}
 }
 const headingsBefore=items.slice(section+1,sectionEnd)
  .filter(item=>item.type==='heading'&&/^\s*REGISTERED\s+CHARGE\s*\d+\s*$/i.test(item.en||'')).length;
 const totals=/^(?:Number of Registered Charges|Current Outstanding Indebtedness)$/i;
 let end=headingIndex+1;
 while(end<sectionEnd&&items[end].type==='field'&&!totals.test(String(items[end].en||'').trim()))end++;
 const removed=items.splice(headingIndex,end-headingIndex);
 const remaining=headingsBefore-1;
 const newSectionEnd=sectionEnd-removed.length;
 const countField=items.slice(section+1,newSectionEnd)
  .find(item=>item.type==='field'&&item.en==='Number of Registered Charges');
 const updatedCount=Boolean(countField&&String(countField.value??'').trim()===String(headingsBefore));
 if(updatedCount)countField.value=String(remaining);
 return {name:displayParticularLabel(removed[0]),fields:removed.length-1,
  removedFields:removed.length-1,remaining,updatedCount};
}
/** Company-scoped correction for RSSH's existing Annual Return draft.
 * Never changes a different company's form or any underlying statutory register.
 */
export function removeRsshRegisteredCharge2(doc){
 const name=String(doc?.company?.name??'').trim().replace(/\s+/g,' ').toUpperCase();
 if(name!=='RSSH SERVICES SDN BHD')return {removed:false,reason:'different-company'};
 const items=doc?.particulars;
 if(!Array.isArray(items))return {removed:false,reason:'no-particulars'};
 const section=items.findIndex(x=>x.type==='section'&&/REGISTERED CHARGES/i.test(x.en||''));
 if(section<0)return {removed:false,reason:'section-missing'};
 let sectionEnd=section+1;
 while(sectionEnd<items.length&&items[sectionEnd].type!=='section')sectionEnd++;
 const matches=[];
 for(let i=section+1;i<sectionEnd;i++){
  if(items[i].type==='heading'&&/^\s*REGISTERED\s+CHARGE\s*0*2\s*$/i.test(String(items[i].en||'')))matches.push(i);
 }
 if(matches.length===0)return {removed:false,reason:'already-absent'};
 if(matches.length!==1)throw Error('Multiple Registered Charge 2 headings exist; remove them individually.');
 const result=removeRegisteredChargeRecord(doc,matches[0]);
 return {removed:true,removedFields:result.fields,remaining:result.remaining,updatedCount:result.updatedCount};
}
/** Move a complete section as one contiguous block, keeping all its headings,
 * fields, values, and bilingual labels together. Destination is another section,
 * before or after. The exported PDF reads this same order from particulars.
 */
export function moveParticularSection(doc,fromIndex,targetIndex,{after=false}={}){
 const items=doc?.particulars;
 if(!Array.isArray(items))throw Error('Annual Return particulars are unavailable.');
 if(!Number.isInteger(fromIndex)||items[fromIndex]?.type!=='section')
  throw Error('Select a section to move.');
 if(!Number.isInteger(targetIndex)||items[targetIndex]?.type!=='section')
  throw Error('Drop onto another section.');
 if(fromIndex===targetIndex)return {moved:false,from:fromIndex,to:fromIndex};
 let fromEnd=fromIndex+1,targetEnd=targetIndex+1;
 while(fromEnd<items.length&&items[fromEnd].type!=='section')fromEnd++;
 while(targetEnd<items.length&&items[targetEnd].type!=='section')targetEnd++;
 const count=fromEnd-fromIndex;
 const insertion=after?targetEnd:targetIndex;
 if(insertion===fromIndex||insertion===fromEnd)
  return {moved:false,from:fromIndex,to:fromIndex};
 const block=items.splice(fromIndex,count);
 const destination=insertion>fromIndex?insertion-count:insertion;
 items.splice(destination,0,...block);
 return {moved:true,from:fromIndex,to:destination,count};
}
export function removeParticularSection(doc,index){
 const items=doc?.particulars;
 if(!Array.isArray(items)||!Number.isInteger(index)||items[index]?.type!=='section')
  throw Error('Section does not exist.');
 let end=index+1;
 while(end<items.length&&items[end].type!=='section')end++;
 const removed=items.splice(index,end-index);
 return {name:displayParticularLabel(removed[0]),fields:removed.filter(x=>x.type==='field').length,items:removed.length};
}
export function removeParticularHeading(doc,index){
 const items=doc?.particulars;
 if(!Array.isArray(items)||!Number.isInteger(index)||items[index]?.type!=='heading')
  throw Error('Heading does not exist.');
 // Registered Charges are records, not director/member entries. Preserve totals.
 if(/^\s*REGISTERED\s+CHARGE\s*\d+\s*$/i.test(items[index].en||''))
  return removeRegisteredChargeRecord(doc,index);
 let end=index+1;
 while(end<items.length&&!['heading','section'].includes(items[end].type))end++;
 const removed=items.splice(index,end-index);
 return {name:displayParticularLabel(removed[0]),fields:removed.length-1};
}
export function deleteParticularField(doc,index){
 if(!doc||!Array.isArray(doc.particulars))throw Error('Annual Return particulars are unavailable.');
 if(!Number.isInteger(index)||index<0||index>=doc.particulars.length)throw Error('Field does not exist.');
 const item=doc.particulars[index];
 if(item.type!=='field')throw Error('Only individual fields can be deleted.');
 doc.particulars.splice(index,1);
 return item;
}
/** Remove one full Directors, Members or BO record, retaining all unrelated headings.
 * Directors and members must retain at least one; BO list may be empty.
 * Renumber remaining entries so + Add creates sequential labels.
 */
export const REMOVABLE_RECORDS={
 director:{pattern:/^DIRECTOR (\d+)$/i,min:0},
 member:{pattern:/^MEMBER (\d+)$/i,min:0},
 bo:{pattern:/^BENEFICIAL OWNER (\d+)$/i,min:0}
};
export function removeAnnualReturnRecord(doc,headingIndex){
 const items=doc?.particulars;
 if(!Array.isArray(items)||!Number.isInteger(headingIndex))throw Error('Invalid record.');
 const header=items[headingIndex];
 if(header?.type!=='heading')throw Error('Select a Director, Member or Beneficial Owner heading.');
 const config=Object.entries(REMOVABLE_RECORDS).find(([,def])=>def.pattern.test(header.en||''));
 if(!config)throw Error('This record cannot be removed here.');
 const [kind,def]=config;
 let sectionStart=-1,sectionEnd=items.length;
 for(let i=headingIndex;i>=0;i--)if(items[i].type==='section'){sectionStart=i;break;}
 if(sectionStart<0)throw Error('Record section is missing.');
 for(let i=headingIndex+1;i<items.length;i++)if(items[i].type==='section'){sectionEnd=i;break;}
 const headings=[];
 for(let i=sectionStart+1;i<sectionEnd;i++)if(items[i].type==='heading'&&def.pattern.test(items[i].en||''))headings.push(i);
 if(headings.length<=def.min)throw Error('No '+kind+' records remain.');
 const nextHeading=items.findIndex((item,i)=>i>headingIndex&&i<sectionEnd&&item.type==='heading');
 const end=nextHeading<0?sectionEnd:nextHeading;
 if(end<=headingIndex)throw Error('Record boundaries are invalid.');
 const removed=items.splice(headingIndex,end-headingIndex);
 let number=0;
 for(let i=sectionStart+1;i<items.length;i++){
  if(items[i].type==='section')break;
  if(items[i].type==='heading'&&def.pattern.test(items[i].en||'')){
   number++;
   items[i].en=kind==='bo'?'BENEFICIAL OWNER '+number:(kind==='member'?'MEMBER ':'DIRECTOR ')+number;
   items[i].cn=String(items[i].cn||'').replace(/\d+\s*$/,String(number));
  }
 }
 return {kind,removedHeading:removed[0].en,removedFields:removed.length-1,remaining:number};
}

export function setCompanyDetail(doc,index,value){
 if(!Number.isInteger(index)||doc.particulars[index]?.type!=='field')return;
 const key=COMPANY_DETAILS[doc.particulars[index]?.en];
 if(key)doc.company[key]=String(value||'');
}

function readJsonObjectAfter(script,marker){
  const start=script.indexOf(marker);
  if(start<0) return null;
  const assign=script.indexOf('=',start+marker.length);
  if(assign<0)throw Error('Invalid Apps Script assignment: '+marker);
  const begin=script.indexOf('{',assign);
  if(begin<0)throw Error('Missing JSON data after '+marker);
  let depth=0,quoted=false,escaped=false;
  for(let i=begin;i<script.length;i++){
    const ch=script[i];
    if(quoted){
      if(escaped)escaped=false;
      else if(ch==='\\')escaped=true;
      else if(ch==='"')quoted=false;
    }else if(ch==='"')quoted=true;
    else if(ch==='{')depth++;
    else if(ch==='}'&&!--depth){
      try{return JSON.parse(script.slice(begin,i+1));}
      catch{throw Error(marker+' is not a JSON-compatible Apps Script object. Use a previously generated .gs or JSON file.');}
    }
  }
  throw Error('Unfinished Apps Script data object: '+marker);
}
const EXCLUDED_FIELDS=/^(?:Company Constitution|Tax Identification Number(?: \(TIN\))?|TIN|Statutory Lodgement Deadline(?: \(30 calendar days\))?|Master Listing Internal Due Date|Register Last Updated|Master Listing Internal Due vs Statutory 30 Days|Corporate Shareholder Control Classification|Preference Share Rights|Recorded Amount of Indebtedness \(not outstanding balance\)|Discharge Date|Date of Appointment|Date of Secretary Appointment|Date Entered as Member|Date Became\s*\/\s*Ceased as BO|Date of (?:Becoming|Ceasing) (?:a )?(?:Beneficial Owner|BO)|Notice\s*\/\s*BO Confirmation Dates|Date of Notice(?: Issued| of (?:BO|Beneficial Owner|Beneficial Ownership))?|Notice Date|(?:BO|Beneficial Ownership) Notice Date|Date of (?:BO|Beneficial Ownership) Notice)$/i;
function cleanParticulars(items){
 let excludedSection=false;
 return items.filter(x=>{
  if(!x||!['field','section','heading'].includes(x.type))return false;
  if(x.type==='section'){
    excludedSection=/^COMPANY REVIEW AND VERIFICATION NOTES$/i.test(String(x.en||'').trim());
    return !excludedSection;
  }
  return !excludedSection&&!EXCLUDED_FIELDS.test(String(x.en||'').trim());
 });
}
export const MEMBER_PERSONAL_FIELDS=[
 ['Member Type','股东类别'],
 ['Individual Full Name','个人股东姓名'],
 ['Individual NRIC / Passport No.','个人股东身份证或护照号码'],
 ['Individual Identification Type','个人身份证明类别'],
 ['Individual Date of Birth','个人出生日期'],
 ['Individual Nationality / Citizenship','个人国籍／公民身份'],
 ['Individual Gender','个人性别'],
 ['Individual Residential / Correspondence Address','个人住址／通讯地址']
];
export const MEMBER_CORPORATE_FIELDS=new Set([
 'Corporate Name','Company Registration No. (per Members Register)','Country of Incorporation','Registered / Correspondence Address'
]);
export const MEMBER_INDIVIDUAL_FIELDS=new Set(MEMBER_PERSONAL_FIELDS.slice(1).map(x=>x[0]));
export function memberTypeAt(items,index){
 if(!Array.isArray(items)||index<0)return '';
 let h=-1;
 for(let i=index;i>=0;i--){
  if(items[i].type==='section')break;
  if(items[i].type==='heading'&&/^MEMBER \d+$/i.test(items[i].en||'')){h=i;break;}
 }
 if(h<0)return '';
 for(let i=h+1;i<items.length&&items[i].type==='field';i++){
  if(items[i].en==='Member Type')return String(items[i].value||'');
 }
 return '';
}
export function showMemberField(items,index){
 const item=items[index];if(!item||item.type!=='field')return true;
 const type=memberTypeAt(items,index);
 if(!type)return true;
 if(type==='Individual'&&MEMBER_CORPORATE_FIELDS.has(item.en))
   return Boolean(String(item.value||'').trim()); // Don't silently discard existing values.
 if(type==='Body Corporate'&&MEMBER_INDIVIDUAL_FIELDS.has(item.en))
   return Boolean(String(item.value||'').trim());
 return true;
}
function ensureMemberPersonalFields(items){
 // Extend older .gs / JSON member blocks rather than replacing existing member data.
 for(let i=items.length-1;i>=0;i--){
  if(items[i].type!=='heading'||!/^MEMBER \d+$/i.test(items[i].en||''))continue;
  let stop=i+1;
  while(stop<items.length&&items[stop].type==='field')stop++;
  const existing=new Set(items.slice(i+1,stop).map(x=>x.en));
  const missing=MEMBER_PERSONAL_FIELDS.filter(([en])=>!existing.has(en));
  if(!missing.length)continue;
  const folio=items.findIndex((x,k)=>k>i&&k<stop&&x.en==='Member Folio');
  const at=folio<0?i+1:folio+1;
  const entries=missing.map(([en,cn])=>({type:'field',en,cn,value:''}));
  items.splice(at,0,...entries);
 }
}

/** Upgrade pre-v7 company-secretary blocks to the same nine ordered particulars
 * shown in the bilingual Annual Return review. Scope duplicate labels such as
 * Date of Birth, Gender, and Nationality / Race to COMPANY SECRETARY only.
 * A current v7 draft remains editable: intentionally deleted fields stay gone.
 */
export function ensureSecretaryParticularFields(items){
 const models=[
  ['Secretary Name','公司秘书姓名','Full Name','姓名'],
  ['Secretary NRIC','公司秘书身份证号码','NRIC','身份证号码'],
  ['Date of Birth','出生日期'],
  ['Gender','性别'],
  ['Professional Membership','专业会员资格'],
  ['Practising Certificate Number','执业证书编号'],
  ['Nationality / Race','国籍 / 种族'],
  ['Secretary Residential Address','公司秘书住址','Residential Address','住址'],
  ['Service / Business Address','通讯或营业地址']
 ];
 for(let i=0;i<items.length;i++){
  if(items[i].type!=='heading'||!/^COMPANY SECRETARY(?:\\s+\\d+)?$/i.test(items[i].en||''))continue;
  let end=i+1;
  while(end<items.length&&items[end].type==='field')end++;
  for(let k=0;k<models.length;k++){
   const [en,cn,displayEn,displayCn]=models[k];
   const existing=items.findIndex((x,j)=>j>i&&j<end&&x.type==='field'&&x.en===en);
   if(existing>=0){
    if(displayEn&&typeof items[existing].displayEn!=='string')items[existing].displayEn=displayEn;
    if(displayCn&&typeof items[existing].displayCn!=='string')items[existing].displayCn=displayCn;
    continue;
   }
   const later=new Set(models.slice(k+1).map(x=>x[0]));
   const next=items.findIndex((x,j)=>j>i&&j<end&&x.type==='field'&&later.has(x.en));
   const position=next>=0?next:end;
   items.splice(position,0,{type:'field',en,cn,value:'',...(displayEn?{displayEn,displayCn}:{})});
   end++;
  }
 }
}

export function normalizeDocument(raw){
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.particulars))throw Error('Expected an Annual Return object with a particulars array.');
  if(raw.particulars.length>1200)throw Error('The imported script has too many fields.');
  const company=raw.company||{};
  const director=raw.signatureDirector||raw.signatory||{};
  const doc={
    schemaVersion:SCHEMA_VERSION,
    company:{name:safe(company.name,300),no:safe(company.no,120),
      arYear:safe(company.arYear,12),arDate:safe(company.arDate,40)},
    signatureDirector:{name:safe(director.name,200),nric:safe(director.nric||director.id||'',100),
      designation:safe(director.designation||'Director',80)},
    particulars:cleanParticulars(raw.particulars).map(x=>{
      // Keep historical shareholder values, but retire the preference-only wording.
      const oldNonCash=/^Shares Issued Otherwise Than in Cash\s*\(marked preference allotment\)$/i.test(String(x.en||'').trim());
      const oldPaid=/^Amount Considered Paid on Non-Cash Preference Allotment$/i.test(String(x.en||'').trim());
      return {
        type:x.type,
        en:oldNonCash?'Shares Issued Otherwise Than in Cash':oldPaid?'Amount Considered Paid on Non-Cash Allotment':safe(x.en,350),
        cn:oldNonCash?'以非现金方式发行的股份':oldPaid?'非现金配发视为已缴金额':safe(x.cn,350),
        ...(typeof x.displayEn==='string'?{displayEn:safe(x.displayEn,350)}:{}),
        ...(typeof x.displayCn==='string'?{displayCn:safe(x.displayCn,350)}:{}),
        value:x.type==='field'?safe(x.value,15000):''
      };
    })
  };
  // Historic .gs source may omit this controlled field; append it without deleting any data.
  if((!Number(raw.schemaVersion)||Number(raw.schemaVersion)<3)&&!doc.particulars.some(x=>x.type==='field'&&x.en==='Type of Shares Issued')){
    const i=doc.particulars.findIndex(x=>x.type==='section'&&/SHARE CAPITAL/i.test(x.en));
    if(i>=0)doc.particulars.splice(i+1,0,{type:'field',en:'Type of Shares Issued',cn:'股份发行方式（现金／非现金）',value:''});
  }
  // Only legacy data needs member-field migration. Do not recreate fields
  // deliberately removed from a current saved Annual Return draft.
  if((Number(raw.schemaVersion)||0)<7)ensureSecretaryParticularFields(doc.particulars);
  if((Number(raw.schemaVersion)||0)<6)ensureMemberPersonalFields(doc.particulars);
  if(!doc.particulars.length&&Number(raw.schemaVersion||0)<SCHEMA_VERSION)
    throw Error('No valid Annual Return particulars found.');
  // Old Google Apps Script files called this first group "COMPANY INFORMATION".
  // Show the new Company Details title without changing any supplied values.
  const firstSection=doc.particulars.find(x=>x.type==='section');
  if(firstSection&&/^(?:COMPANY INFORMATION|COMPANY PARTICULARS|COMPANY DETAILS)$/i.test(firstSection.en.trim())){
    firstSection.en='COMPANY DETAILS';
    firstSection.cn='公司资料';
  }
  return syncCompanyDetails(doc);
}
export function importAnnualReturnText(content,filename=''){
  if(typeof content!=='string'||content.length>3_000_000)throw Error('Select a .gs/.json file smaller than 3 MB.');
  const name=filename.toLowerCase();
  if(name.endsWith('.gs')||/const\s+AR_SINGLE_COMPANY\s*=/.test(content)){
    const raw=readJsonObjectAfter(content,'AR_SINGLE_COMPANY');
    if(!raw)throw Error('Apps Script does not contain AR_SINGLE_COMPANY.');
    const sig=readJsonObjectAfter(content,'AR_SIGNATURE_DIRECTOR');
    if(sig)raw.signatureDirector=sig;
    return normalizeDocument(raw);
  }
  try{
    const raw=JSON.parse(content);
    return normalizeDocument(raw.AR_SINGLE_COMPANY||raw);
  }catch(error){
    if(error.message?.startsWith('Expected'))throw error;
    throw Error('Invalid JSON backup or Annual Return script. '+error.message);
  }
}
export const outputFilename=doc=>{
  const name=safe(doc.company.name||'COMPANY',75).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/\s+/g,' ').trim();
  const year=safe(doc.company.arYear||new Date().getFullYear(),8).replace(/[^0-9]/g,'')||'YEAR';
  return name+' - Annual Return '+year+' Review.pdf';
};
export const populatedCount=doc=>doc.particulars.filter(x=>x.type==='field'&&String(x.value||'').trim()).length;
export const emptyCount=doc=>doc.particulars.filter(x=>x.type==='field'&&!String(x.value||'').trim()).length;
