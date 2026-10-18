import template from './template.json' with {type:'json'};
export const SCHEMA_VERSION=6;
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
 const first=doc.particulars.findIndex(x=>x.type==='section');
 const end=doc.particulars.findIndex((x,i)=>i>first&&x.type==='section');
 const from=first>=0?first+1:0,to=end>=0?end:doc.particulars.length;
 for(let i=from;i<to;i++){
  const item=doc.particulars[i];if(item.type!=='field')continue;
  const key=COMPANY_DETAILS[item.en];
  if(!key)continue;
  const fieldVal=String(item.value||'').trim(),profileVal=String(doc.company[key]||'').trim();
  if(fieldVal&&(preferFields||!profileVal))doc.company[key]=item.value;
  else if(!fieldVal&&profileVal)item.value=String(doc.company[key]);
 }
 return doc;
}
export function deleteParticularField(doc,index){
 if(!doc||!Array.isArray(doc.particulars))throw Error('Annual Return particulars are unavailable.');
 if(!Number.isInteger(index)||index<0||index>=doc.particulars.length)throw Error('Field does not exist.');
 const item=doc.particulars[index];
 if(item.type!=='field')throw Error('Only individual fields can be deleted.');
 if(['Company Name','Company Registration No.'].includes(item.en))
  throw Error(item.en+' is required for PDF generation and cannot be deleted.');
 doc.particulars.splice(index,1);
 return item;
}
const REPEATABLE_RECORDS={
 director:/^DIRECTOR (\d+)$/i,
 member:/^MEMBER (\d+)$/i,
 bo:/^BENEFICIAL OWNER (\d+)$/i
};
const RECORD_LABELS={director:'Director',member:'Member',bo:'Beneficial Owner'};
const RECORD_SECTION={
 director:/^SECTION D - DIRECTORS, COMPANY SECRETARY AND AUDITOR$/i,
 member:/^SECTION E - PARTICULARS OF MEMBERS$/i,
 bo:/^PARTICULARS OF CURRENT BENEFICIAL OWNERS$/i
};
/** Remove one numbered record and only its own fields, retaining other sections.
 * A minimum of one editable placeholder remains for each record type.
 */
export function removeNumberedRecord(doc,index,kind){
 if(!doc||!Array.isArray(doc.particulars))throw Error('Annual Return particulars are unavailable.');
 if(!Object.hasOwn(REPEATABLE_RECORDS,kind))throw Error('Unknown numbered record type.');
 const items=doc.particulars,head=items[index],match=head?.type==='heading'&&REPEATABLE_RECORDS[kind].exec(head.en||'');
 if(!match)throw Error('Selected entry is not a '+RECORD_LABELS[kind]+' record.');
 let section=-1;
 for(let i=index-1;i>=0;i--)if(items[i].type==='section'){section=i;break;}
 if(section<0||!RECORD_SECTION[kind].test(items[section].en||''))
  throw Error('Record is not in the expected statutory section.');
 let sectionEnd=items.findIndex((x,i)=>i>section&&x.type==='section');
 if(sectionEnd<0)sectionEnd=items.length;
 const records=[];
 for(let i=section+1;i<sectionEnd;i++)if(items[i].type==='heading'&&REPEATABLE_RECORDS[kind].test(items[i].en||''))records.push(i);
 if(records.length<=1)throw Error('Keep at least one '+RECORD_LABELS[kind]+' record as a placeholder.');
 let end=index+1;
 while(end<sectionEnd&&items[end].type==='field')end++;
 const removed=items.splice(index,end-index);
 // Renumber only the records of this type; never touch secretary or auditor.
 sectionEnd=items.findIndex((x,i)=>i>section&&x.type==='section');
 if(sectionEnd<0)sectionEnd=items.length;
 let number=0;
 for(let i=section+1;i<sectionEnd;i++){
  const h=items[i];if(h.type!=='heading'||!REPEATABLE_RECORDS[kind].test(h.en||''))continue;
  number++;
  h.en=RECORD_LABELS[kind].toUpperCase()+' '+number;
  h.cn=String(h.cn||'').replace(/\s*\d+\s*$/,'')+' '+number;
 }
 return {type:kind,removedHeading:removed[0].en,removedFields:removed.length-1,remaining:number};
}

export function setCompanyDetail(doc,index,value){
 const first=doc.particulars.findIndex(x=>x.type==='section');
 const end=doc.particulars.findIndex((x,i)=>i>first&&x.type==='section');
 if(first<0||index<=first||(end>=0&&index>=end))return;
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
        value:x.type==='field'?safe(x.value,15000):''
      };
    })
  };
  // Historic .gs source may omit this controlled field; append it without deleting any data.
  if((!Number(raw.schemaVersion)||Number(raw.schemaVersion)<3)&&!doc.particulars.some(x=>x.type==='field'&&x.en==='Type of Shares Issued')){
    const i=doc.particulars.findIndex(x=>x.type==='section'&&/SHARE CAPITAL/i.test(x.en));
    if(i>=0)doc.particulars.splice(i+1,0,{type:'field',en:'Type of Shares Issued',cn:'股份发行方式（现金／非现金）',value:''});
  }
  ensureMemberPersonalFields(doc.particulars);
  if(!doc.particulars.length)throw Error('No valid Annual Return particulars found.');
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
