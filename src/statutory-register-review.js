import {parseMemberFolios} from './statutory-current-members.js';
import {REFERENCE_FIELDS,referenceKind,referencePriority,referenceFieldIndex,referenceTemplateSheets,createCompanyDetailsSheet,companyDetailIndex,isLegacyBoCombinedDateField,extractBoBecomingDate} from './statutory-register-reference.js';
/**
 * Review-only projections over the original imported worksheet cells.
 * No statutory particulars are deleted or written back in a different order.
 * Every editable field retains its exact original Excel row/column coordinates.
 */
const tidy=value=>String(value??'').trim().replace(/\s+/g,' ');
const cleanLabel=value=>tidy(value).replace(/:$/,'').slice(0,180);
const absent=value=>!tidy(value)||/^(?:-|–|—|n\/a|na|nil|none)$/i.test(tidy(value));
const isDateOrPerson=s=>/\b(?:name|full name|director|no\.?|date|chargee|allottee|shares|transfer|folio)\b/i.test(s);

/** Keep the familiar statutory register titles, not shortened Excel tabs. */
export function isManagerRegister(name){
 return /^register (?:of|or) managers?(?:\b|$)/i.test(tidy(name));
}
export function registerLabel(name){
 const original=tidy(name);
 if(/^(?:master|company details)$/i.test(original))return 'Company Details';
 const source=original.replace(/\s+\(Imported\s+[^)]*\)(?:\s+\d+)?$/i,'');
 const imported=original.slice(source.length);
 const bare=source.replace(/^register (?:of|or)\s+/i,'').trim();
 const member=/^members?(?:\s+0*(\d+))?$/i.exec(bare);
 if(member)return 'Register of Members'; // All member folios share one view/tab.
 const replacements={
  bo:'Beneficial Owners',
  'beneficial owner':'Beneficial Owners',
  'beneficial owners':'Beneficial Owners',
  manager:'Managers',managers:'Managers',
  director:'Directors',directors:'Directors',
  secretary:'Secretaries',secretaries:'Secretaries',
  charge:'Charges',charges:'Charges',
  'charge satisfaction':'Satisfaction of Charges',
  transfer:'Transfers',transfers:'Transfers',
  allotment:'Allotments',allotments:'Allotments',
  'share transfer':'Transfers','share transfers':'Transfers',
  'share allotment':'Allotments','share allotments':'Allotments'
 };
 const standardized=replacements[bare.toLowerCase()]||
  (/^register\b/i.test(bare)?'Other Records — '+bare:bare);
 // A newer imported edition is another version of the SAME statutory register.
 // Expose just one canonical tab; preserve underlying source sheets privately.
 return 'Register of '+(standardized||'Other Records')+
  (/^(?:share )?(?:transfer|transfers|allotment|allotments)$/i.test(bare)?imported:'');
}
export function normalizeRegisterName(name){
 const input=tidy(name);
 if(!input)throw Error('Enter a register name.');
 const value=registerLabel(input);
 if(isManagerRegister(value))throw Error('Register of Managers is excluded from Statutory Registers.');
 return value.slice(0,120);
}
export function isMemberPersonalOrSharesLabel(label){
 const v=tidy(label).replace(/:$/,'').toLowerCase();
 // Personal/contact information and the CURRENT total held only;
 // no acquired/transferred/ledger, certificate, consideration or balance history.
 return /^(?:name|full name|member'?s? name|shareholder'?s? name|individual\/corporate|id type|identification (?:no\.?|number)|nric(?:\/passport)?(?: no\.?)?|passport(?: no\.?)?|company registration (?:no\.?|number)|registration (?:no\.?|number)|date of birth|folio(?: no\.?)?|date entered as a member|date became member|nationality(?:\/origin)?|race|occupation|email(?: address)?|address(?: · continued)?|contact(?: no\.?| number)?|phone(?: number)?|mobile(?: number)?|postal address|residential address|current (?:no\.? of |number of )?shares held|total (?:no\.? of |number of )?shares held|(?:no\.? of |number of )?shares held|shares held|shareholding(?: held)?|total shareholding)$/i.test(v);
}
export function registerKind(name){
 const s=tidy(name).toLowerCase();
 if(/^(?:master|company details)$/.test(s))return 'profile';
 if(/^register of members(?:\s|$)/.test(s))return 'member';
 if(/pdf page|word register text/.test(s))return 'text';
 return 'table';
}
function field(row,col,label,value){
 return {row,col,label:cleanLabel(label)||'Column '+(col+1),value:String(value??'')};
}
function rowCells(row){
 return (row||[]).map((v,col)=>({col,value:tidy(v)})).filter(x=>x.value);
}
function isLabel(v){
 const s=tidy(v);
 return s.length>1&&s.length<85&&/:$/.test(s);
}
function profileFields(rows,limit=100){
 const fields=[];
 let carry='';
 for(let ri=0;ri<Math.min(rows.length,limit);ri++){
  const row=rows[ri]||[];
  const entries=rowCells(row);
  if(!entries.length)continue;
  let found=false;
  for(const item of entries){
   if(!isLabel(item.value))continue;
   const col=item.col+1;
   if(col>=row.length)continue;
   fields.push(field(ri,col,item.value,row[col]));
   carry=cleanLabel(item.value);
   found=true;
  }
  // Registered office often continues over several lines in the same cell column.
  if(!found&&carry&&row[1]&&!row[0] && fields.length){
   fields.push(field(ri,1,carry+' · continued',row[1]));
  }
 }
 return fields;
}
function headerCandidate(row){
 const entries=rowCells(row);
 if(entries.length<3)return -1;
 // A person/shareholder data row may contain more filled columns than its
 // header, but must never be interpreted as a new header. Check the first
 // heading using these actual Malaysian statutory workbook labels.
 const first=tidy(row?.[0]||'');
 if(!/^(?:director name|full name|name|allotment date|allottee(?: name)?|name of allottee|transferor(?: name)?|name of transferor|transferee(?: name)?|date|registered no\.?|registration no\.?|allotment no\.?|transfer no\.?|chargee(?: name)?|folio(?: no\.?)?|no\.?(?: of)?(?: shares)?)$/i.test(first))return -1;
 const short=entries.filter(x=>x.value.length<=95);
 if(short.length<Math.max(3,Math.ceil(entries.length*0.68)))return -1;
 const texts=entries.map(x=>x.value);
 const hints=texts.filter(isDateOrPerson).length;
 if(hints<2)return -1;
 if(/^company name|^company no|^last update/i.test(texts[0]||''))return -1;
 return entries.length*2+hints;
}
function findHeader(rows,{start=0}={}){
 let best={row:-1,score:-1};
 for(let i=start;i<Math.min(rows.length,38);i++){
  const score=headerCandidate(rows[i]||[]);
  if(score>best.score)best={row:i,score};
 }
 return best.score>=0?best.row:-1;
}
function isPlaceholder(row){
 const entries=rowCells(row);
 return !entries.length||entries.every(x=>absent(x.value)||/^0(?:\.0+)?$/.test(x.value));
}
function statusFor(fields){
 const end=fields.find(f=>/^(?:date of cessation|cessation date|date ceased|date of discharge|date of satisfaction|date of release|date ceased to be(?: a member)?|date of resignation|date of termination)$/i.test(f.label));
 if(end)return absent(end.value)?'current':'former';
 const status=fields.find(f=>/^(?:status|charge status|appointment status|active\/inactive)$/i.test(f.label));
 if(status){
  if(/(?:discharg|satisfi|releas|cease|resign|terminat|former|inactive|cancel)/i.test(status.value))return 'former';
  if(/(?:current|active|existing|ongoing|appointed|outstanding)/i.test(status.value))return 'current';
 }
 return 'unknown';
}
function titleFor(fields,index){
 const preferred=fields.find(f=>/^(?:director name|full name|name|allottee|allottee'?s? name|name of allottee|chargee(?: name)?|name of chargee|transferor|transferor name|name of transferor|registered no\.?)$/i.test(f.label));
 const named=preferred||fields.find(f=>/\b(?:name|registered no|allotment no|transfer no)\b/i.test(f.label));
 const first=named||fields.find(f=>!absent(f.value));
 return first&&!absent(first.value)?tidy(first.value).slice(0,160):'Entry '+(index+1);
}
function parseTable(rows,from=0){
 const headerRow=findHeader(rows,{start:from});
 if(headerRow<0)return {headerRow:-1,records:[],introFields:[]};
 const header=rows[headerRow]||[];
 const headers=Array.from({length:header.length},(_,col)=>cleanLabel(header[col]));
 const records=[];
 for(let ri=headerRow+1;ri<rows.length;ri++){
  const raw=rows[ri]||[];
  if(isPlaceholder(raw))continue;
  // Avoid treating repeated print headings, totals or explanatory notes as data.
  const first=tidy(raw[0]);
  if(/^(?:register of |total(?:\s|:)|notes?:|date\b.*class of shares)/i.test(first))continue;
  if(headerCandidate(raw)>=0&&tidy(raw[0])===tidy(header[0]))continue;
  const width=Math.max(raw.length,headers.length);
  const fields=[];
  for(let col=0;col<width;col++){
   if(!headers[col]&&absent(raw[col]))continue;
   fields.push(field(ri,col,headers[col]||'Column '+(col+1),raw[col]||''));
  }
  if(!fields.some(f=>!absent(f.value)))continue;
  const index=records.length;
  records.push({row:ri,title:titleFor(fields,index),fields,status:statusFor(fields)});
 }
 return {headerRow,records,introFields:[]};
}
function memberDetails(rows){
 const allFolios=parseMemberFolios(rows);
 if(allFolios.length){
  const movement=rows.findIndex((row,i)=>i>5&&rowCells(row).some(c=>/^shares acquired$/i.test(c.value)));
  const ledger=movement<0?{headerRow:-1,records:[]}:parseTable(rows,movement+1);
  return {kind:'member',fields:allFolios[0].fields,records:allFolios,ledger};
 }

 // Members use a folio-style form followed by an acquired/transferred shares
 // ledger. Do not misread the folio's left/right key-value columns as a table.
 const ledgerStart=rows.findIndex((r,i)=>i>5&&rowCells(r).some(c=>/^shares acquired$/i.test(c.value)));
 const stop=ledgerStart<0?Math.min(rows.length,45):ledgerStart;
 const fields=[];
 for(let ri=0;ri<stop;ri++){
  const row=rows[ri]||[];
  for(let col=0;col<row.length-1;col++){
   if(!isLabel(row[col]))continue;
   // Skip repeats of company identity; displayed at the top of the workspace.
   if(/^(?:company name|company no|last update):$/i.test(tidy(row[col])))continue;
   fields.push(field(ri,col+1,row[col],row[col+1]));
   col++;
  }
  // Long member addresses may occupy several subsequent rows.
  if(!row[0]&&row[1]&&fields.some(f=>/^address$/i.test(f.label))){
   fields.push(field(ri,1,'Address · continued',row[1]));
  }
 }
 const key=fields.find(f=>/^name$/i.test(f.label));
 const record=fields.length?{
  row:key?.row||0,title:key?.value||'Member particulars',
  fields,status:statusFor(fields)
 }:null;
 const ledger=ledgerStart<0?{headerRow:-1,records:[]}:
  parseTable(rows,ledgerStart+1);
 // Newer hand-entered registers can be a table of members rather than one
 // traditional folio per sheet. Preserve their personal details and held shares.
 const tableRecords=record?[]:parseTable(rows).records;
 return {kind:'member',fields,records:record?[record]:tableRecords,ledger};
}
export function describeStatutorySheet(sheet){
 const rows=sheet?.rows||[],name=sheet?.name||'Register';
 const kind=registerKind(name);
 if(kind==='profile')return {kind,label:registerLabel(name),fields:profileFields(rows),records:[],headerRow:-1};
 if(kind==='member')return {label:registerLabel(name),...memberDetails(rows)};
 if(kind==='text'){
  const records=[];
  for(let i=0;i<rows.length;i++){
   if(isPlaceholder(rows[i]))continue;
   const f=field(i,0,'Document text',rows[i]?.[0]||'');
   records.push({row:i,title:'Line '+(i+1),fields:[f],status:'unknown'});
  }
  return {kind,label:registerLabel(name),fields:[],records,headerRow:-1};
 }
 const parsed=parseTable(rows);
 if(parsed.headerRow<0){
  return {kind:'unstructured',label:registerLabel(name),fields:profileFields(rows),records:[],headerRow:-1};
 }
 return {kind:'table',label:registerLabel(name),fields:[],...parsed};
}
export function summaryForReview(book){
 const sheets=(book?.sheets||[]).map(s=>({name:s.name,label:registerLabel(s.name),...describeStatutorySheet(s)}));
 const named=needle=>sheets.filter(s=>needle.test(s.name))
  .reduce((n,s)=>n+s.records.length,0);
 return {
  sheets,
  directors:named(/register of directors/i),
  members:named(/register of members/i),
  beneficialOwners:named(/register of (?:bo|beneficial owners)/i),
  charges:named(/register of charges/i)
 };
}
export function filterReviewRecords(records,{query='',status='all'}={}){
 const q=tidy(query).toLowerCase();
 return (records||[]).filter(r=>(status==='all'||r.status===status)
  &&(!q||[r.title,...r.fields.map(f=>f.value),...r.fields.map(f=>f.label)]
   .some(v=>String(v).toLowerCase().includes(q))));
}


/** Ensure a Register of Charges exists without inventing a charge. */
export function ensureChargeRegister(book){
 if(!book?.sheets||!Array.isArray(book.sheets))return false;
 let changed=false;
 let charges=book.sheets.filter(sheet=>/^register (?:of|or) charges?(?:\b|$)/i.test(sheet.name));
 if(!charges.length){
  if(book.sheets.length>=100)throw Error('Cannot create Register of Charges: 100-register limit reached.');
  const sheet={name:'Register of Charges',rows:[
   ['Registered No.','Date of Registration','Name of Chargee',
    'Nature of Charge','Amount of Indebtedness','Date of Discharge']
  ]};
  book.sheets.push(sheet);charges=[sheet];changed=true;
 }
 for(const sheet of charges){
  const rows=sheet.rows||[];
  // Import templates frequently already contain "Date of Discharge". Retain
  // it and every existing value. Extend a missing column only if the register
  // is tabular, without creating imaginary charges or changing prior columns.
  let header=-1;
  for(let i=0;i<Math.min(rows.length,45);i++){
   const row=rows[i]||[];
   const labels=row.map(v=>String(v||'').trim().toLowerCase());
   if(labels.some(v=>/^(registered no\.?|name of chargee|chargee|nature of charge)$/.test(v))&&
      labels.filter(x=>x).length>=2){header=i;break;}
  }
  if(header<0){
   // Blank and non-standard charge records retain their existing layout.
   // A discharge label is only shown when there is a corresponding charge.
   continue;
  }
  const existing=(rows[header]||[]).some(v=>/^date of (?:discharge|satisfaction|release)$/i.test(String(v||'').trim()));
  if(existing)continue;
  const at=Math.max(rows[header].length,...rows.map(row=>row.length));
  if(at>=250)continue;
  rows[header][at]='Date of Discharge';
  for(let i=header+1;i<rows.length;i++){
   if(rows[i].length<=at)rows[i][at]='';
  }
  changed=true;
 }
 return changed;
}

/** Existing Member folio files are grouped behind one Register of Members tab. */
export function isChronologicalRegister(name){
 const label=registerLabel(name);
 return label!=='Company Details'&&/^Register of /i.test(label)&&
  !/^Register of (?:Managers|(?:Share )?Transfers|(?:Share )?Allotments)(?:\b|$)/i.test(label);
}
export function visibleRegisterIndices(book){
 const indices=[],seen=new Set();
 for(let i=0;i<(book?.sheets||[]).length;i++){
  const sheet=book.sheets[i];
  if(isManagerRegister(sheet.name))continue;
  const label=registerLabel(sheet.name);
  // Group successive imports of the same historical register into one tab.
  if(isChronologicalRegister(sheet.name)){
   if(seen.has(label))continue;
   seen.add(label);
  }
  indices.push(i);
 }
 return indices.sort((a,b)=>referencePriority(book.sheets[a].name)-referencePriority(book.sheets[b].name));
}
export function registerGroupIndices(book,index){
 const sheet=book?.sheets?.[index];
 if(!sheet)return [];
 if(isChronologicalRegister(sheet.name))
  return (book.sheets||[]).map((s,i)=>registerLabel(s.name)===registerLabel(sheet.name)?i:-1).filter(i=>i>=0);
 return [index];
}
/**
 * Append unrecorded reference headings to supported table registers. Never
 * overwrite data or reorder the original stored rows. Folio-style member
 * registers are left untouched because their acquisition/transfer ledgers
 * depend on the original source row coordinates.
 */
/**
 * Extract the becoming date from a legacy combined BO column. All imported
 * original cells remain untouched; only the distinct effective-date cell is
 * filled, and existing dates are never overwritten.
 */
export function migrateBoEffectiveDates(sheet,headerIndex){
 if(!Array.isArray(sheet?.rows)||headerIndex<0)return false;
 const headings=sheet.rows[headerIndex]||[];
 const sources=headings.flatMap((label,col)=>isLegacyBoCombinedDateField(label)?[col]:[]);
 const expected=REFERENCE_FIELDS.beneficialOwners.indexOf('Effective Date Becoming BO');
 const dest=headings.findIndex(label=>referenceFieldIndex('beneficialOwners',label)===expected);
 if(!sources.length||dest<0)return false;
 let changed=false;
 for(let ri=headerIndex+1;ri<sheet.rows.length;ri++){
  const row=sheet.rows[ri];
  if(!Array.isArray(row))continue;
  const existing=String(row[dest]??'').trim();
  if(existing&&!/^(?:-|–|—|n\/a|na|nil|none)$/i.test(existing))continue;
  const dates=[...new Set(sources.map(col=>extractBoBecomingDate(row[col])).filter(Boolean))];
  if(dates.length!==1)continue;
  while(row.length<=dest)row.push('');
  row[dest]=dates[0];changed=true;
 }
 return changed;
}
export function ensureReferenceParticulars(book){
 if(!Array.isArray(book?.sheets))return false;
 let changed=false;
 // Add a profile without changing existing sheet positions, which preserves
 // saved status overrides, field references and historical worksheets.
 let profile=book.sheets.find(s=>referenceKind(s.name)==='profile');
 if(!profile&&book.sheets.length<100){
  profile=createCompanyDetailsSheet(book);
  book.sheets.push(profile);
  changed=true;
 }
 if(profile&&Array.isArray(profile.rows)){
  const standard=createCompanyDetailsSheet(book);
  for(const row of standard.rows){
   const index=companyDetailIndex(row[0]);
   const exists=profile.rows.some(existing=>(existing||[]).some(v=>companyDetailIndex(v)===index));
   if(exists||profile.rows.length>=12000)continue;
   profile.rows.push(row);changed=true;
  }
 }
 // Complete the canonical set for imported books which lack one or more
 // statutory register worksheets. Never invent a person or transaction.
 for(const standard of referenceTemplateSheets()){
  const kind=referenceKind(standard.name);
  if(book.sheets.some(sheet=>referenceKind(sheet.name)===kind))continue;
  if(book.sheets.length>=100)break;
  book.sheets.push(standard);
  changed=true;
 }
 for(const sheet of book.sheets){
  const kind=referenceKind(sheet.name);
  if(!REFERENCE_FIELDS[kind]||!Array.isArray(sheet.rows))continue;
  let header=-1;
  if(kind==='members'){
   if(sheet.rows.some(row=>(row||[]).some(v=>/^Name:\s*$/i.test(String(v||'')))))continue;
   if(/^name$/i.test(String(sheet.rows[0]?.[0]||'').trim()))header=0;
  }else{
   const info=describeStatutorySheet(sheet);
   if(info.kind==='table'&&info.headerRow>=0)header=info.headerRow;
  }
  if(header<0)continue;
  const headings=sheet.rows[header];
  if(!Array.isArray(headings))continue;
  for(const [fieldIndex,name] of REFERENCE_FIELDS[kind].entries()){
   // Both parties have independent Identification No. columns in transfers.
   if(kind==='transfers'&&fieldIndex===10){
    const count=headings.filter(x=>referenceFieldIndex(kind,x)===7||
      referenceFieldIndex(kind,x)===10).length;
    if(count>=2)continue;
    if(headings.length>=250)break;
    headings.push(name);changed=true;continue;
   }
   const match=referenceFieldIndex(kind,name);
   if(headings.some(value=>referenceFieldIndex(kind,value)===match))continue;
   if(headings.length>=250)break;
   headings.push(name);changed=true;
  }
  if(kind==='beneficialOwners'&&migrateBoEffectiveDates(sheet,header))changed=true;
 }
 return changed;
}
/** An explicit saved display classification never destroys original cessation data. */
export function registerRecordStatus(book,si,record){
 const saved=book?.recordStatuses?.[si+':'+record.row];
 if(saved==='former'||saved==='current')return saved;
 if(record.status==='former')return 'former';
 // Absence of a cessation value is the provisional active presentation when
 // a register has no separate status column. It is not independent SSM proof.
 return 'current';
}
const nonEmpty=x=>String(x??'').trim()&&!/^(?:-|n\/a|nil|none)$/i.test(String(x).trim());
/** Deduplicate imported revisions of the same appointment while retaining
 * distinct appointments of a reappointed director or secretary. */
export function latestRegisterRecords(book,indices){
 const history=new Map();
 for(const sheetIndex of indices){
  const sheet=book?.sheets?.[sheetIndex];
  if(!sheet)continue;
  const desc=describeStatutorySheet(sheet);
  for(const record of desc.records||[]){
   const fields=record.fields||[];
   const id=fields.find(f=>/\b(?:nric|passport|identity|identification(?: no\.?| number)?|registration (?:no|number))\b/i.test(f.label)&&nonEmpty(f.value));
   const person=fields.find(f=>/^(?:director name|full name|name|chargee|name of chargee|registered no\.?)$/i.test(f.label)&&nonEmpty(f.value));
   const identity=String(id?.value||person?.value||record.title||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
   const event=fields.find(f=>/^(?:date of appointment|date of becoming (?:bo|a beneficial owner)|date of registration|date of creation)$/i.test(f.label)&&nonEmpty(f.value));
   const key=(identity||'ROW'+sheetIndex+':'+record.row)+'|'+String(event?.value||'').trim();
   const item={...record,sourceSheetIndex:sheetIndex,
    status:registerRecordStatus(book,sheetIndex,record)};
   if(history.has(key))history.delete(key);
   history.set(key,item);
  }
 }
 return [...history.values()];
}

/** One label/field can be renamed without modifying imported worksheet headers. */
export function getRegisterFieldOverrides(book){
 const obj=book?.fieldLabels;
 return obj && typeof obj==='object'&&!Array.isArray(obj)?obj:{};
}
