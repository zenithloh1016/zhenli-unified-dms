/**
 * DMS Combined Registers -> bilingual Annual Return particulars mapper.
 * Operates on private same-origin summary ONLY, not on flattened PDF pages.
 * Import into a COPY, preserve existing draft values by default and never
 * invent dates, unpaid capital, issued share totals or SSM-verified balances.
 */
import {cloneBlank,setCompanyDetail} from './core.js';
const txt=v=>String(v??'').trim();
const exists=v=>txt(v)&&!/^(?:-|n\/a|na|nil|none|not provided)$/i.test(txt(v));
const norm=v=>txt(v).toLowerCase().replace(/[\W_]+/g,' ');
const isFormer=s=>/former|ceased|discharged|released|inactive|satisfied|terminated/i.test(txt(s));
const cleanValue=s=>txt(s).slice(0,1400);
function safeDate(value){
 const v=txt(value);
 if(/^\d{5}(?:\.\d+)?$/.test(v)&&+v>20000&&+v<80000){
  const d=new Date(Date.UTC(1899,11,30)+Math.floor(+v)*86400000);
  if(!Number.isNaN(d.getTime()))return String(d.getUTCDate()).padStart(2,'0')+'/'+
   String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();
 }
 return v;
}
function select(fields,...patterns){
 for(const pattern of patterns){
  const item=fields.find(f=>pattern.test(txt(f.label)));
  if(item&&exists(item.value))return cleanValue(item.value);
 }
 return '';
}
function getRecords(section){
 const records=[];let current=null,category='';
 for(const b of section.blocks||[]){
  if(b.type==='group'){category=b.title;current=null;continue;}
  if(b.type==='record'){
   current={title:txt(b.title),status:txt(b.status),category,fields:[]};
   records.push(current);
  }else if(b.type==='field'&&current){
   current.fields.push({label:txt(b.label),value:cleanValue(b.value)});
  }
 }
 return records.filter(r=>!isFormer(r.status)&&!isFormer(r.category)&&r.fields.length);
}
function profileFields(section){
 return (section.blocks||[]).filter(x=>x.type==='field')
  .map(x=>({label:txt(x.label),value:cleanValue(x.value)}));
}
const directors={
 'Full Name':[/^director name$/i,/^full name$/i,/^name$/i],
 'NRIC / Passport No.':[/^(?:ic|nric)(?: no\.?)?(?: \/ passport(?: no\.?)?)?$/i,/passport (?:no|number)/i,/identification (?:no|number)/i],
 'Date of Birth':[/^date of birth$/i],
 Gender:[/^gender$/i], 'Nationality / Race':[/nationality/i,/^race$/i],
 'Residential Address':[/^residential address$/i,/^address$/i],
 'Service / Business Address':[/^service address$/i,/^business address$/i]
};
const members={
 'Member Folio':[/^folio(?: no)?$/i],
 'Member Type':[/^member type$/i,/individual\/corporate/i],
 'Individual Full Name':[/^shareholder name$/i,/^name$/i,/^full name$/i],
 'Individual NRIC / Passport No.':[/^identification no\.?$/i,/^nric(?: \/ passport)?(?: no\.?)?$/i,/passport no/i],
 'Individual Identification Type':[/^id type$/i,/^identification type$/i],
 'Individual Date of Birth':[/^date of birth$/i],
 'Individual Nationality / Citizenship':[/^nationality(?:\/origin)?$/i],
 'Individual Residential / Correspondence Address':[/^address$/i,/^residential address$/i],
 'Corporate Name':[/^corporate name$/i,/^company name$/i],
 'Company Registration No. (per Members Register)':[/^company registration (?:no|number)$/i,/^registration (?:no|number)$/i],
 'Registered / Correspondence Address':[/^registered address$/i],
 'Number of Shares Held':[/^current number of shares held$/i,/^total shares held$/i,/^shares held$/i],
 'Class of Shares':[/^class of shares$/i],
 // A "Percentage of Recorded Current Holdings" is not necessarily the
 // percentage of a specific share class; never map it to that AR field.
 'Percentage of Own Share Class':[/^percentage of own share class$/i]
};
const bos={
 'Full Name':[/^full name$/i,/^name$/i],
 'NRIC No.':[/^nric (?:no|number)$/i,/^identification (?:no|number)$/i],
 'Date of Birth':[/^date of birth$/i],
 'Nationality / Race':[/nationality/i],
 'Position / Occupation':[/^occupation$/i,/^position$/i,/business occupation/i],
 'Residential Address':[/^residential address$/i,/^address$/i],
 'Recorded Ownership / Voting Rights Percentage':[/^recorded ownership \/ voting rights percentage$/i,/^ownership percentage$/i],
 'Type of Beneficial Ownership':[/^type of beneficial ownership$/i],
 'Criteria of Beneficial Ownership':[/^criteria of (?:beneficial ownership|bo)$/i]
};
const charges={
 'Registered No.':[/^registered no\.?$/i,/^charge registration (?:no|number)$/i],
 'Date of Registration':[/^date of registration$/i],
 'Chargee':[/^name of chargee$/i,/^chargee$/i],
 'Nature of Charge':[/^nature of charge$/i],
 'Current Outstanding Indebtedness':[/^current outstanding indebtedness$/i]
};
const secretaries={
 'Secretary Name':[/^(?:secretary )?name$/i,/^full name$/i],
 'Secretary NRIC':[/^nric(?: no\.?)?$/i,/^identification (?:no|number)$/i],
 'Professional Membership':[/^professional membership$/i,/membership(?: no| number)?/i],
 'Practising Certificate Number':[/^practising certificate(?: number| no)?$/i],
 'Nationality / Race':[/^nationality(?: \/ race)?$/i],
 'Secretary Residential Address':[/^residential address$/i]
};
function addMissingBlocks(items,template,sectionRe,headingRe,count,limit=1200){
 const indexes=[];
 for(let i=0;i<items.length;i++)if(items[i].type==='heading'&&headingRe.test(items[i].en))indexes.push(i);
 if(!indexes.length||count<=indexes.length)return 0;
 const first=indexes[0];let stop=first+1;
 while(stop<items.length&&items[stop].type==='field')stop++;
 const sample=items.slice(first,stop);
 let created=0;
 for(let n=indexes.length+1;n<=Math.min(count,100);n++){
  if(items.length+sample.length>limit)break;
  const clone=sample.map(x=>({...x,value:''}));
  const header=clone[0];header.en=header.en.replace(/\d+$/,String(n));
  header.cn=txt(header.cn).replace(/\d+\s*$/,String(n));
  let end=items.findIndex((x,i)=>i>indexes.at(-1)&&x.type==='section');
  if(end<0)end=items.length;
  // Insert at the end of the relevant source section, before next section.
  items.splice(end,0,...clone);
  indexes.push(end);
  created++;
 }
 return created;
}
function blocksOf(items,headingRe){
 const result=[];
 for(let i=0;i<items.length;i++){
  if(items[i].type!=='heading'||!headingRe.test(items[i].en))continue;
  let j=i+1;
  while(j<items.length&&items[j].type==='field')j++;
  result.push(items.slice(i+1,j));
 }
 return result;
}
export function importCombinedRegisterSnapshot(document,snapshot,{overwrite=false}={}){
 if(snapshot?.version!==1||!Array.isArray(snapshot.sections)||
    snapshot.sections.length>100||!snapshot.companyId||!snapshot.companyName)
  throw Error('Invalid combined statutory register data.');
 const original=structuredClone(document||cloneBlank());
 const doc=original;
 const incomingName=norm(snapshot.companyName),existingName=norm(doc.company?.name);
 const incomingNo=norm(snapshot.registrationNo),existingNo=norm(doc.company?.no);
 if((existingNo&&incomingNo&&existingNo!==incomingNo)||
    (existingName&&incomingName&&existingName!==incomingName))
  throw Error('Selected register company does not match the Annual Return form.');
 const changes={filled:0,kept:0,unmapped:[],records:{directors:0,members:0,charges:0,bos:0}};
 const write=(fields,key,value)=>{
  if(!exists(value))return;
  const cell=fields.find(x=>x.en===key&&x.type==='field');if(!cell)return;
  if(!overwrite&&exists(cell.value)){changes.kept++;return;}
  cell.value=cleanValue(value);changes.filled++;
 };
 write(doc.particulars,'Company Name',snapshot.companyName);
 write(doc.particulars,'Company Registration No.',snapshot.registrationNo||'');
 const sections=snapshot.sections;
 const findSection=re=>sections.find(s=>re.test(s.title||''));
 const profile=profileFields(findSection(/^company details$/i)||{blocks:[]});
 const profileMap={
  'Former Name':[/^former name$/i],
  'Date of Incorporation':[/^date of (?:registration|incorporation)$/i],
  'Registered Office':[/^registered address$/i,/^registered office$/i],
  'Address Where Register of Members Is Kept':[/^address where register of members is kept$/i],
  'Principal Place of Business':[/^business address$/i,/^principal place of business$/i],
  'Address Where Financial Records Are Kept':[/^address where financial records are kept$/i],
  'Nature of Business / MSIC Code':[/^(?:nature of business|msic code)$/i]
 };
 for(const [key,patterns] of Object.entries(profileMap)){
  let value=select(profile,...patterns);
  if(/Date of Incorporation/i.test(key))value=safeDate(value);
  write(doc.particulars,key,value);
 }
 function transfer(sectionRegex,headingRe,fieldMap,kind){
  const section=findSection(sectionRegex);if(!section)return;
  const entries=getRecords(section);
  if(!entries.length)return;
  addMissingBlocks(doc.particulars,cloneBlank().particulars,sectionRegex,headingRe,entries.length);
  const targets=blocksOf(doc.particulars,headingRe);
  for(let i=0;i<Math.min(entries.length,targets.length);i++){
   const source=entries[i].fields;
   for(const [target,patterns] of Object.entries(fieldMap)){
    let value=select(source,...patterns);
    if(/^Date /.test(target))value=safeDate(value);
    if(target==='Member Type'&&!value&&kind==='members'){
     value=select(source,/^corporate name$/i,/^company registration (?:no|number)$/i)?'Body Corporate':'Individual';
    }
    if(kind==='members'&&
      ['Individual Full Name','Individual NRIC / Passport No.','Individual Identification Type',
       'Individual Date of Birth','Individual Nationality / Citizenship',
       'Individual Residential / Correspondence Address'].includes(target)&&
      select(source,/^corporate name$/i,/^company registration (?:no|number)$/i))continue;
    write(targets[i],target,value);
   }
  }
  changes.records[kind]=Math.min(entries.length,targets.length);
 }
 transfer(/^register of directors$/i,/^DIRECTOR \d+$/i,directors,'directors');
 transfer(/^register of members$/i,/^MEMBER \d+$/i,members,'members');
 transfer(/^register of beneficial owners$/i,/^BENEFICIAL OWNER \d+$/i,bos,'bos');
 transfer(/^register of charges$/i,/^REGISTERED CHARGE \d+$/i,charges,'charges');
 const activeCharges=getRecords(findSection(/^register of charges$/i)||{blocks:[]});
 if(activeCharges.length)write(doc.particulars,'Number of Registered Charges',String(activeCharges.length));
 const sec=getRecords(findSection(/^register of secretaries$/i)||{blocks:[]})[0];
 if(sec)for(const [target,patterns] of Object.entries(secretaries))
  write(doc.particulars,target,select(sec.fields,...patterns));
 // No guesswork about total issued shares, capital amounts, AR year, BO
 // ownership criteria, outstanding debt, issued class, or MSIC codes.
 doc.company.name=txt(doc.particulars.find(p=>p.en==='Company Name')?.value)||snapshot.companyName;
 doc.company.no=txt(doc.particulars.find(p=>p.en==='Company Registration No.')?.value)||snapshot.registrationNo;
 return {document:doc,summary:changes};
}
