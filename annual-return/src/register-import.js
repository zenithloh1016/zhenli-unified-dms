/**
 * DMS Combined Registers -> bilingual Annual Return particulars mapper.
 * Operates on private same-origin summary ONLY, not on flattened PDF pages.
 * Import into a COPY, preserve existing draft values by default and never
 * invent dates, unpaid capital, issued share totals or SSM-verified balances.
 */
import {cloneBlank,setCompanyDetail} from './core.js';
import {applyAnnualReturnDefaults,msicCodesFromProfileFields} from './derived-defaults.js';
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
  const item=fields.find(f=>pattern.test(txt(f.label))&&exists(f.value));
  if(item)return cleanValue(item.value);
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
 'Member Folio':[/^folio(?: no\.?| number)?$/i],
 'Member Type':[/^member type$/i,/individual\/corporate/i],
 'Individual Full Name':[/^shareholder name$/i,/^name$/i,/^full name$/i],
 'Individual NRIC / Passport No.':[/^identification no\.?$/i,/^nric(?: \/ passport)?(?: no\.?)?$/i,/passport no/i],
 'Individual Identification Type':[/^id type$/i,/^identification type$/i],
 'Individual Date of Birth':[/^date of birth$/i],
 'Individual Nationality / Citizenship':[/^nationality(?:\s*\/\s*(?:origin|citizenship))?$/i,/^citizenship$/i],
 'Individual Gender':[/^gender$/i],
 'Individual Residential / Correspondence Address':[/^address$/i,/^residential address$/i,/^correspondence address$/i],
 'Corporate Name':[/^corporate name$/i,/^company name$/i],
 'Company Registration No. (per Members Register)':[/^company registration (?:no\.?|number)$/i,/^registration (?:no\.?|number)$/i],
 'Country of Incorporation':[/^country of incorporation$/i,/^country incorporated$/i],
 'Registered / Correspondence Address':[/^registered address$/i,/^registered office$/i,/^correspondence address$/i],
 'Number of Shares Held':[/^current number of shares held$/i,/^total shares held$/i,/^shares held$/i,/^shareholding$/i],
 'Class of Shares':[/^class of shares$/i,/^share class$/i,/^class$/i],
 // A "Percentage of Recorded Current Holdings" is not necessarily the
 // percentage of a specific share class; never map it to that AR field.
 'Percentage of Own Share Class':[/^percentage of own share class$/i],
 'Voting / Other Share Rights':[/^voting \/ other share rights$/i,/^share voting rights$/i,/^voting rights$/i]
};
const bos={
 'Full Name':[/^full name$/i,/^name$/i],
 // Target the current bilingual Annual Return BO field, not its retired
 // "NRIC No." label. Registers may contain NRIC, passport or a generic ID.
 'NRIC / Passport No.':[
  /^(?:nric|ic)(?: (?:no\.?|number))?(?:\s*\/\s*(?:passport|pp)(?: (?:no\.?|number))?)?$/i,
  /^(?:passport|pp)(?: (?:no\.?|number))?$/i,
  /^identification (?:no\.?|number)(?:\s*\/\s*passport (?:no\.?|number))?$/i,
  /^identity card (?:no\.?|number)$/i
 ],
 'Date of Birth':[/^date of birth$/i],
 'Nationality / Race':[/nationality/i],
 'Position / Occupation':[/^occupation$/i,/^position$/i,/business occupation/i],
 'Residential Address':[/^residential address$/i,/^address$/i],
 'Recorded Ownership / Voting Rights Percentage':[/^recorded ownership \/ voting rights percentage$/i,/^ownership percentage$/i,/^ownership \/ voting rights(?: \(%\))?$/i,/^ownership \/ voting rights \(%\)$/i,/^ownership \/ voting rights percentage$/i,/^voting rights percentage$/i],
 'Type of Beneficial Ownership':[/^type of beneficial ownership$/i,/^type of ownership$/i,/^nature of ownership$/i],
 'Criteria of Beneficial Ownership':[/^criteria of (?:beneficial ownership|bo)$/i,/^criteria$/i,/^beneficial owner criteria$/i]
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
 'Secretary NRIC':[/^nric(?: no\.?)?$/i,/^identification (?:no\.?|number)$/i,/^nric \/ passport no\.?$/i],
 'Date of Birth':[/^date of birth$/i,/^dob$/i],
 'Gender':[/^gender$/i],
 'Professional Membership':[/^professional membership$/i,/^membership(?: no\.?| number)?$/i],
 'Practising Certificate Number':[/^ssm practi[cs]ing certificate (?:no\.?|number)$/i,
  /^practi[cs]ing certificate (?:no\.?|number)$/i],
 'Nationality / Race':[/^nationality(?: \/ race)?$/i,/^nationality$/i],
 'Secretary Residential Address':[/^residential address$/i,/^address$/i],
 'Service / Business Address':[/^service address$/i,/^service \/ business address$/i,
  /^business address$/i]
};
// A per-class percentage is safe only if ALL current shareholders have a
// verified single share class and a positive integer holding. A percentage
// of all recorded holdings is NOT necessarily a percentage of a share class.
function memberClassPercentages(entries){
 const rows=entries.map(({fields})=>{
  const classification=select(fields,/^class of shares$/i,/^share class$/i,/^class$/i)
   .toLowerCase().replace(/\s+shares?$/i,'').trim();
  const className=/^ordinary$/i.test(classification)?'Ordinary':
   /^preference$/i.test(classification)?'Preference':'';
  const raw=select(fields,/^current number of shares held$/i,/^total shares held$/i,/^shares held$/i)
   .replace(/,/g,'').trim();
  const held=/^\d+$/.test(raw)?Number(raw):NaN;
  return {className,held};
 });
 if(!rows.length||rows.some(row=>!row.className||!Number.isSafeInteger(row.held)||row.held<=0))
  return null;
 const totals=new Map();
 for(const row of rows)totals.set(row.className,(totals.get(row.className)||0)+row.held);
 if([...totals.values()].some(n=>!Number.isSafeInteger(n)||n<=0))return null;
 return rows.map(row=>(row.held/totals.get(row.className)*100).toFixed(2)+'%');
}
/**
 * A current Register of Members already contains the recorded share quantities,
 * even when new "Company Details > share capital" fields have never been filled.
 * Calculate count-based share capital from that existing evidence, never its
 * monetary amount. Unrecorded, zero or invalid holdings prohibit a derived
 * "issued share" total; verified profile particulars always take precedence.
 */
function recordedShareQuantities(sections,profile){
 const source=sections.find(x=>/^register of members$/i.test(txt(x.title)));
 const entries=source?getRecords(source):[];
 const result={values:{},fromHoldings:[],notice:'',classFallback:''};
 if(!entries.length)return result;
 const rows=entries.map(entry=>{
  const shares=select(entry.fields,/^current number of shares held$/i,
   /^total shares held$/i,/^shares held$/i,/^shareholding$/i);
  const quantity=shares.replace(/,/g,'').trim();
  const count=/^\d+$/.test(quantity)?Number(quantity):NaN;
  const rawClass=select(entry.fields,/^class of shares$/i,
   /^share class$/i,/^class$/i);
  const group=rawClass.toLowerCase().replace(/\s+shares?$/,'').trim();
  const classification=group==='ordinary'?'Ordinary':
   group==='preference'?'Preference':'';
  return {count,classification,rawClass};
 });
 if(rows.some(row=>!Number.isSafeInteger(row.count)||row.count<=0)){
  result.notice='Some current members have missing or invalid recorded holdings. Issued-share totals were not inferred.';
  return result;
 }
 const total=rows.reduce((n,row)=>n+row.count,0);
 if(!Number.isSafeInteger(total)||total<=0)return result;
 const statedTotal=select(profile,
  /^total number of issued shares(?: \(all classes\))?$/i,
  /^total issued shares(?: \(all classes\))?$/i,
  /^number of issued shares(?: \(all classes\))?$/i,
  /^total shares issued$/i);
 if(statedTotal){
  const recorded=Number(statedTotal.replace(/,/g,''));
  if(!Number.isSafeInteger(recorded)||recorded!==total){
   result.notice='Current members’ holdings differ from the explicit issued-share total. Counts were not inferred; review the Statutory Registers.';
   return result;
  }
 }
 // Only infer the sole share class from an explicit company record or
 // a complete, agreeing allotment register, never from the company's legal type.
 let uniform='';
 const declared=select(profile,/^classes of shares issued$/i,/^share classes issued$/i);
 if(/^(?:ordinary|ordinary shares)$/i.test(declared))uniform='Ordinary';
 else if(/^(?:preference|preference shares)$/i.test(declared))uniform='Preference';
 else if(!rows.some(row=>row.classification)){
  const allocations=sections.find(x=>/^register of (?:share )?allotments?$/i.test(txt(x.title)));
  const allots=allocations?getRecords(allocations):[];
  if(allots.length){
   const classes=allots.map(x=>{
    const cls=select(x.fields,/^class$/i,/^class of shares$/i,/^share class$/i)
     .toLowerCase().replace(/\s+shares?$/,'').trim();
    const units=select(x.fields,/^number of shares$/i,/^no\.? of shares$/i,
     /^shares$/i).replace(/,/g,'');
    return {cls,units:/^\d+$/.test(units)?Number(units):NaN};
   });
   if(classes.every(x=>['ordinary','preference'].includes(x.cls)&&
    Number.isSafeInteger(x.units)&&x.units>0)&&
    classes.every(x=>x.cls===classes[0].cls)&&
    classes.reduce((n,x)=>n+x.units,0)===total)
    uniform=classes[0].cls==='ordinary'?'Ordinary':'Preference';
  }
 }
 const distinct=new Set(rows.map(row=>row.classification).filter(Boolean));
 if(uniform&&rows.some(row=>row.classification&&row.classification!==uniform)){
  result.notice='Member share classes conflict with the company/allotment class. Review class particulars.';
  return result;
 }
 if(uniform&&distinct.size===0)result.classFallback=uniform;
 const resolved=rows.map(row=>row.classification||uniform);
 // Conflicting or partially specified member classes cannot prove a class sum.
 if(resolved.every(Boolean)){
  const totals={Ordinary:0,Preference:0};
  for(let i=0;i<rows.length;i++)totals[resolved[i]]+=rows[i].count;
  if(totals.Ordinary)result.values['Number of Ordinary Shares']=totals.Ordinary.toLocaleString('en-US');
  if(totals.Preference)result.values['Number of Preference Shares']=totals.Preference.toLocaleString('en-US');
  result.values['Classes of Shares Issued']=totals.Ordinary&&totals.Preference?
   'Ordinary & Preference':totals.Ordinary?'Ordinary':'Preference';
 }
 result.values['Total Number of Issued Shares (all classes)']=total.toLocaleString('en-US');
 result.fromHoldings=Object.keys(result.values);
 result.notice='Share quantities above are derived from all recorded current members’ holdings; confirm issued-share totals with the latest SSM return before filing. No paid-up capital was assumed.';
 return result;
}
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
export function importCombinedRegisterSnapshot(document,snapshot,{overwrite=false,secretaryOnly=false,shareholdingOnly=false}={}){
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
  if(!overwrite&&exists(cell.value)&&cell.autoAssumedRate!==1){changes.kept++;return;}
  cell.value=cleanValue(value);
  // A confirmed source value supersedes an earlier RM1/share estimate.
  delete cell.autoAssumedRate;
  changes.filled++;
 };
 if(!secretaryOnly&&!shareholdingOnly){
  write(doc.particulars,'Company Name',snapshot.companyName);
  write(doc.particulars,'Company Registration No.',snapshot.registrationNo||'');
 }
 const sections=snapshot.sections;
 const findSection=re=>sections.find(s=>re.test(s.title||''));
 // Repeated labels belong to the secretary heading, not the first director.
 const populateSecretary=()=>{
  const sec=getRecords(findSection(/^register of secretaries$/i)||{blocks:[]})[0];
  if(!sec)return;
  const secretaryFields=blocksOf(doc.particulars,/^COMPANY SECRETARY$/i)[0]||[];
  for(const [target,patterns] of Object.entries(secretaries)){
   const value=select(sec.fields,...patterns);
   write(secretaryFields,target,/^Date /.test(target)?safeDate(value):value);
  }
 };
 if(secretaryOnly&&!shareholdingOnly){
  populateSecretary();
  return {document:doc,summary:changes};
 }
 const profile=profileFields(findSection(/^company details$/i)||{blocks:[]});
 const profileMap={
  'Former Name':[/^former (?:company )?name$/i,/^previous (?:company )?name$/i,/^old (?:company )?name$/i],
  'Annual Return Year':[/^annual return year$/i],
  'Anniversary Date':[/^anniversary date$/i,/^annual return anniversary date$/i],
  'Date of Incorporation':[/^date of (?:registration|incorporation)$/i],
  'Registered Office':[/^registered address$/i,/^registered office$/i,/^registered office address$/i],
  'Address Where Register of Members Is Kept':[/^address where register of members is kept$/i],
  'Principal Place of Business':[/^business address$/i,/^principal place of business$/i,/^principal business address$/i],
  'Address Where Financial Records Are Kept':[/^address where financial records are kept$/i],
  'Nature of Business / MSIC Code':[/^(?:nature of business|msic code|nature of business \/ msic code|principal business activities)$/i]
 };
 if(!shareholdingOnly){
  for(const [key,patterns] of Object.entries(profileMap)){
   let value=select(profile,...patterns);
   if(key==='Former Name')value=String(value||'').replace(/^F\.?K\.?A\.?\s*/i,'');
   if(/Date of Incorporation|Anniversary Date/i.test(key))value=safeDate(value);
   write(doc.particulars,key,value);
  }
 }
 // Share capital must come from EXPRESS capital particulars, not from a
 // sum of members' holdings or transfer/allotment consideration.
 const capitalMap={
  'Type of Shares Issued':[/^type of shares issued$/i],
  'Currency':[/^currency$/i,/^share capital currency$/i,/^currency of share capital$/i],
  'Classes of Shares Issued':[/^classes of shares issued$/i,/^share classes issued$/i],
  'Number of Ordinary Shares':[/^(?:number of |issued )?ordinary shares(?: issued)?$/i],
  'Number of Preference Shares':[/^(?:number of |issued )?preference shares(?: issued)?$/i],
  'Total Number of Issued Shares (all classes)':[
   /^total number of issued shares(?: \(all classes\))?$/i,
   /^total issued shares(?: \(all classes\))?$/i,
   /^number of issued shares(?: \(all classes\))?$/i,
   /^total shares issued$/i
  ],
  'Ordinary Share Capital (recorded amount paid)':[
   /^ordinary share capital(?: \(recorded amount paid\))?$/i,
   /^paid[- ]?up ordinary share capital$/i
  ],
  'Preference Share Capital (recorded amount paid)':[
   /^preference share capital(?: \(recorded amount paid\))?$/i,
   /^paid[- ]?up preference share capital$/i
  ],
  'Aggregate Amount Paid on Allotments (verify share capital)':[
   /^aggregate amount paid on allotments(?: \(verify share capital\))?$/i,
   /^total amount paid on allotments$/i
  ],
  'Shares Issued for Cash (ordinary)':[/^shares issued for cash \(ordinary\)$/i],
  'Shares Issued Otherwise Than in Cash':[/^shares issued otherwise than in cash$/i],
  'Amount Considered Paid on Non-Cash Allotment':[/^amount considered paid on non-cash allotment$/i],
  'Amount of Shares Partly Unpaid':[/^amount of shares partly unpaid$/i],
  'Total Calls Called Up / Received':[/^total calls called up \/ received$/i]
 };
 for(const [key,patterns] of Object.entries(capitalMap))
  write(doc.particulars,key,select(profile,...patterns));
 const calculated=recordedShareQuantities(sections,profile);
 changes.capitalFromCurrentHoldings=[];
 changes.capitalNotice=calculated.notice;
 for(const [key,value] of Object.entries(calculated.values)){
  // Never replace a documented capital amount with holdings-derived counts.
  const current=doc.particulars.find(x=>x.type==='field'&&x.en===key);
  if(current&&!exists(current.value)){
   write(doc.particulars,key,value);
   changes.capitalFromCurrentHoldings.push(key);
  }
 }
 // An explicitly stated paid-up amount can only map to the sole known class.
 // Acquisition or share-transfer consideration is NOT paid-up share capital.
 const onlyClass=select(profile,/^classes of shares issued$/i,
  /^share classes issued$/i)||calculated.classFallback;
 if(/^(?:ordinary|ordinary shares)$/i.test(onlyClass))
  write(doc.particulars,'Ordinary Share Capital (recorded amount paid)',
   select(profile,/^paid[ -]?up (?:share )?capital$/i,
    /^issued and paid[ -]?up share capital$/i));
 else if(/^(?:preference|preference shares)$/i.test(onlyClass))
  write(doc.particulars,'Preference Share Capital (recorded amount paid)',
   select(profile,/^paid[ -]?up (?:share )?capital$/i,
    /^issued and paid[ -]?up share capital$/i));
 function transfer(sectionRegex,headingRe,fieldMap,kind){
  const section=findSection(sectionRegex);if(!section)return;
  const entries=getRecords(section);
  if(!entries.length)return;
  const classPercentages=kind==='members'?
   memberClassPercentages(entries.map(entry=>calculated.classFallback?
    {...entry,fields:[...entry.fields,{label:'Class of Shares',
     value:calculated.classFallback}]}:entry)):null;
  addMissingBlocks(doc.particulars,cloneBlank().particulars,sectionRegex,headingRe,entries.length);
  const targets=blocksOf(doc.particulars,headingRe);
  for(let i=0;i<Math.min(entries.length,targets.length);i++){
   const source=entries[i].fields;
   for(const [target,patterns] of Object.entries(fieldMap)){
    let value=select(source,...patterns);
    if(kind==='members'&&target==='Class of Shares'&&!value)
     value=calculated.classFallback;
    if(kind==='members'&&target==='Percentage of Own Share Class'&&!value&&classPercentages)
     value=classPercentages[i];
    if(/^Date /.test(target))value=safeDate(value);
    const memberType=kind==='members'?select(source,/^member type$/i,/^individual\s*\/\s*corporate$/i):'';
    const memberName=kind==='members'?select(source,/^shareholder name$/i,/^name$/i,/^full name$/i):'';
    const corporate=kind==='members'&&(
     /^(?:body corporate|company|corporate)$/i.test(memberType)||
     Boolean(select(source,/^corporate name$/i,/^company registration (?:no\.?|number)$/i))||
     /\b(?:sdn\.?\s*bhd\.?|berhad|bhd\.?|limited|ltd\.?|llp)\s*$/i.test(memberName));
    if(kind==='members'&&target==='Member Type'&&!value)
     value=corporate?'Body Corporate':'Individual';
    if(kind==='members'&&target==='Corporate Name'&&!value&&corporate)
     value=memberName;
    if(kind==='members'&&target==='Registered / Correspondence Address'&&!value&&corporate)
     value=select(source,/^address$/i,/^residential address$/i);
    if(kind==='members'&&corporate&&
      ['Individual Full Name','Individual NRIC / Passport No.','Individual Identification Type',
       'Individual Date of Birth','Individual Nationality / Citizenship','Individual Gender',
       'Individual Residential / Correspondence Address'].includes(target))continue;
    if(kind==='members'&&!corporate&&
      ['Corporate Name','Company Registration No. (per Members Register)',
       'Country of Incorporation','Registered / Correspondence Address'].includes(target))continue;
    write(targets[i],target,value);
   }
  }
  changes.records[kind]=Math.min(entries.length,targets.length);
 }
 if(!shareholdingOnly)
  transfer(/^register of directors$/i,/^DIRECTOR \d+$/i,directors,'directors');
 transfer(/^register of members$/i,/^MEMBER \d+$/i,members,'members');
 if(!shareholdingOnly){
  transfer(/^register of beneficial owners$/i,/^BENEFICIAL OWNER \d+$/i,bos,'bos');
  transfer(/^register of charges$/i,/^REGISTERED CHARGE \d+$/i,charges,'charges');
 }
 // Charge headings and details are transferred individually above. The retired
 // Number of Registered Charges field must not be recreated from an import.
 populateSecretary();
 // Address defaults, labelled MSIC codes, and the user's RM1/share
 // review-only convention apply after explicit registered values have won.
 const defaults=applyAnnualReturnDefaults(doc,{
  msicCodes:msicCodesFromProfileFields(profile)
 });
 changes.filled+=defaults.filled;
 changes.defaults={addresses:defaults.addresses,capital:defaults.capital,msic:defaults.msic};
 if(defaults.capital)changes.capitalNotice=
  [changes.capitalNotice,'RM1/share was used only as a working assumption for blank paid-up capital fields. Verify actual issue prices and paid-up amounts against SSM before filing.']
  .filter(Boolean).join(' ');
 doc.company.name=txt(doc.particulars.find(p=>p.en==='Company Name')?.value)||snapshot.companyName;
 doc.company.no=txt(doc.particulars.find(p=>p.en==='Company Registration No.')?.value)||snapshot.registrationNo;
 return {document:doc,summary:changes};
}
