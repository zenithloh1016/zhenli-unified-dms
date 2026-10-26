/**
 * Field labels and section sequence taken from the original MAJUKAYA ENTITI
 * SDN. BHD. Register Book. These are schema definitions ONLY; company-specific
 * names, shares, addresses, dates and transactions must never be copied.
 */
export const COMPANY_DETAILS_FIELDS=[
 'Company Name','Company No.','Last update','Date of Incorporation',
 'Date of Cosec Appointment','Registered Address'
];
export function createCompanyDetailsSheet(company){
 return {name:'Company Details',rows:COMPANY_DETAILS_FIELDS.map((label,i)=>[
  label+':',i===0?String(company?.companyName||company?.name||''):
  i===1?String(company?.registrationNo||company?.registration_no||''):''
 ])};
}
export const REFERENCE_FIELDS={
 directors:['Name','Date of Birth','Identification No.','Passport Expiry','Gender','Nationality / Race','Business Occupation','Residential Address','Service Address','Appointment Date','Cessation Date'],
 members:['Folio No.','Name','Date of Birth','ID Type','Nationality/Origin','Identification No.','Race','Occupation','Email Address','Address','Date Entered as A Member','Date Ceased to be A Member','Total Shares Held'],
 allotments:['Allotment Date','Allotment No.','Allottee',"Allottee's Address",'Number of Shares','Amount Paid on Share','Certificate No.','Class','Folio No.'],
 transfers:['Transfer No.','Transfer Date','Shares','Consideration','No. of Old Certificate','Class of Shares','Transferor','IC No. / PP No. / Company No.','Folio of Transferor','Transferee','Transferee IC No. / PP No. / Company No.','Transferee Address','Folio of Transferee','No. of New Certificate'],
 charges:['Registered No.','Date of Registration','Name of Chargee','Nature of Charge','Amount of Indebtedness','Date of Discharge'],
 // Secretaries follow the Directors' personal/appointment order. A legacy
 // Registration No. is kept separately (not presumed to be NRIC, PC or MIA no.).
 secretaries:['Name','Date of Birth','Identification No.','Passport Expiry','Gender',
  'Nationality / Race','Business Occupation','Residential Address','Service Address',
  'Appointment Date','Cessation Date','SSM Practicing Certificate No.','Membership No.',
  'Registration No.'],
 beneficialOwners:['Full Name','Identification No.','Date of Birth','Nationality / Race','Business Occupation','Residential Address','Ownership / Voting Rights (%)','Type of Ownership','Criteria','Effective Date Becoming BO','Cessation Date']
};
export const MEMBER_LEDGER_FIELDS={
 acquired:['Date','No. of Share Certificate','Allotment or Transfer No.','Folio','Class of Shares','No. of Shares','Consideration'],
 transferred:['Date','Transfer No.','Folio','Class of Shares','No. of Shares','Consideration','Balance of Shares']
};
const KINDS=['directors','members','allotments','transfers','charges','secretaries','beneficialOwners'];
export function referenceKind(name){
 const s=String(name??'').toLowerCase().trim().replace(/\s+\(imported.*$/,'');
 if(s==='master'||s==='company details')return 'profile';
 if(/^register (?:of|or) managers?\b/.test(s))return 'managers';
 if(/^register (?:of|or) directors?\b/.test(s))return 'directors';
 if(/^register (?:of|or) members?\b/.test(s))return 'members';
 if(/^register (?:of|or) (?:share )?allotments?\b/.test(s))return 'allotments';
 if(/^register (?:of|or) (?:share )?transfers?\b/.test(s))return 'transfers';
 if(/^register (?:of|or) charges?\b/.test(s))return 'charges';
 if(/^register (?:of|or) secretar(?:y|ies)\b/.test(s))return 'secretaries';
 if(/^register (?:of|or) (?:bo|beneficial owners?)\b/.test(s))return 'beneficialOwners';
 return '';
}
export function referencePriority(name){
 const k=referenceKind(name);
 return k==='profile'?0:KINDS.indexOf(k)<0?99:1+KINDS.indexOf(k);
}
const norm=x=>String(x??'').toLowerCase().replace(/[^a-z0-9%]+/g,' ').replace(/\s+/g,' ').trim();
const synonyms={
 directors:{
  'Name':['Director Name','Full Name'],
  'Identification No.':['IC No. / Passport No.','NRIC No.','Identification No.'],
  'Appointment Date':['Date of Appointment'],'Cessation Date':['Date of Cessation']
 },
 members:{
  'Name':['Full Name','Member Name'],'Identification No.':['NRIC No.','Identification / Registration No.'],
  'Total Shares Held':['Shares Held','Current Number of Shares Held'],
  'Date Entered as A Member':['Date Became Member'],'Date Ceased to be A Member':['Date Ceased']
 },
 allotments:{
  'Allotment Date':['Date'],'Allottee':["Allottee's Name",'Name of Allottee'],
  "Allottee's Address":['Allottee Address','Allotee s Address'],
  'Number of Shares':['No. of Shares Allotted','No. of Share Alloted','No. of Shares','Shares'],
  'Class':['Class of Shares','Share Class']
 },
 transfers:{
  'Transfer Date':['Date'],'Shares':['No. of Shares Transferred','No. of Share Transferred','No. of Shares','Number of Shares'],
  'Transferor':['Transferor Name','Transferror Name','Name of Transferor'],
  'Transferee':['Transferee Name','Name of Transferee'],
  'Transferee IC No. / PP No. / Company No.':['Transferee Identification No.'],
  'Folio of Transferor':['Folio of Transferror'],
  'Class of Shares':['Share Class','Class']
 },
 charges:{
  'Name of Chargee':['Chargee'],'Date of Registration':['Registration Date'],
  'Nature of Charge':['Description'],'Date of Discharge':['Date of Satisfaction','Date of Release']
 },
 secretaries:{
  'Name':['Full Name','Secretary Name'],
  // NRIC or passport is an identification number. The legacy Registration No.
  // remains a distinct statutory cell and is never silently reinterpreted.
  'Identification No.':['NRIC No.','NRIC Number','IC No. / Passport No.',
    'IC No.','Passport No.','Identification Number'],
  'Appointment Date':['Date of Appointment'],
  'Cessation Date':['Date of Cessation','Date Ceased'],
  'SSM Practicing Certificate No.':['SSM Practising Certificate No.',
    'SSM Practising Certificate Number','SSM Practicing Certificate Number',
    'Practising Certificate No.','Practicing Certificate No.','PC No.'],
  'Membership No.':['Membership Number','MIA Membership No.','MIA No.']
 },
 beneficialOwners:{
  'Full Name':['Name'],
  'Identification No.':['NRIC No. / Passport No.','NRIC No.','Passport No.'],
  'Type of Ownership':['Type of Beneficial Ownership','Nature of Ownership'],
  'Criteria':['Criteria of BO','Beneficial Owner Criteria'],
  'Effective Date Becoming BO':['Effective Date','Date Becoming BO','Date of Becoming BO','Date a Person Becomes / Ceases to Become BO','Date a Person Becomes / Ceases to be BO','Date a Person Becomes BO','Date a Person Becomes a BO'],
  'Cessation Date':['Date of Cessation','Date Ceased','Date a Person Ceases to be BO']
 }
};
export function referenceFieldIndex(kind,label){
 const q=norm(label),fields=REFERENCE_FIELDS[kind]||[];
 for(let i=0;i<fields.length;i++){
  if(q===norm(fields[i])||(synonyms[kind]?.[fields[i]]||[]).some(x=>q===norm(x)))return i;
 }
 return -1;
}
/**
 * Screen/PDF labels follow the screenshot template while all cell coordinates
 * continue to target the original saved worksheet. Preserve unknown extra
 * columns after the standard particulars, never delete them.
 */
export function sortReferenceFields(name,fields){
 const kind=referenceKind(name);
 const all=fields||[];
 if(!REFERENCE_FIELDS[kind])return all;
 const dual=kind==='transfers'?all.filter(f=>referenceFieldIndex(kind,f.label)===7)
  .sort((a,b)=>(a.col??0)-(b.col??0)):[];
 function position(f){
  if(kind==='transfers'&&dual.length>=2&&f===dual[1])return 10;
  const i=referenceFieldIndex(kind,f.label);
  return i<0?1000:i;
 }
 return [...all].sort((a,b)=>position(a)-position(b));
}
export function referenceDisplayLabel(kind,label,field,allFields=[]){
 const index=referenceFieldIndex(kind,label);
 if(index<0)return label;
 if(kind==='transfers'&&index===7){
  const dual=allFields.filter(f=>referenceFieldIndex(kind,f.label)===7)
   .sort((a,b)=>(a.col??0)-(b.col??0));
  if(dual.length>=2&&dual[1]===field)return REFERENCE_FIELDS.transfers[10];
 }
 return REFERENCE_FIELDS[kind][index];
}
/**
 * Removed screen/PDF particulars remain in original imported data and version
 * backups. These filters apply only to the rendered statutory view.
 */
export function excludeRegisterField(name,label){
 const kind=referenceKind(name);
 const x=norm(label);
 if(kind==='directors')return /^remarks?(?:\s|$)/.test(x);
 if(kind==='beneficialOwners')return (
  // Only the Section 56 notice/date-received field remains excluded.
  // Becoming-BO effective dates and separate cessation dates must display.
  /^date (?:of )?(?:notices?|notice sent|bo information received|receipt of bo information|section 56 notices?)\b/.test(x)||
  /\b(?:notices? pursuant to|date of notice|date of bo information received|date bo information received|section 56 notices?)\b/.test(x)
 );
 return false;
}
export function companyDetailIndex(label){
 const x=norm(label);
 const aliases=[
  ['company name'],
  ['company no','company number','company registration no','company registration number','registration no'],
  ['last update','last updated','date of last update'],
  ['date of incorporation','incorporation date','date of registration','registration date'],
  ['date of cosec appointment','date of co sec appointment','date of company secretary appointment','date of secretary appointment'],
  ['registered address','registered office','registered office address']
 ];
 return aliases.findIndex(xs=>xs.includes(x));
}
export function sortCompanyDetails(fields){
 return [...(fields||[])].sort((a,b)=>{
  const x=companyDetailIndex(a.label),y=companyDetailIndex(b.label);
  return (x<0?100:x)-(y<0?100:y);
 });
}
export function referenceTemplateSheets(){
 return [
  {name:'Register of Directors',rows:[[...REFERENCE_FIELDS.directors]]},
  {name:'Register of Members',rows:[[...REFERENCE_FIELDS.members]]},
  {name:'Register of Beneficial Owners',rows:[[...REFERENCE_FIELDS.beneficialOwners]]},
  {name:'Register of Secretaries',rows:[[...REFERENCE_FIELDS.secretaries]]},
  {name:'Register of Charges',rows:[[...REFERENCE_FIELDS.charges]]},
  {name:'Register of Allotments',rows:[[...REFERENCE_FIELDS.allotments]]},
  {name:'Register of Transfers',rows:[[...REFERENCE_FIELDS.transfers]]}
 ];
}
