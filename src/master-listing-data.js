/* Pure Master Listing tab data model. Preserves every imported worksheet column.
   Values are stored as strings, so company registration numbers and leading zeros
   are not changed during importing or editing. */
const LIMIT_ROWS=5000,LIMIT_COLUMNS=200,LIMIT_VALUE=15000;
export const listingLimits={rows:LIMIT_ROWS,columns:LIMIT_COLUMNS};
const normal=s=>String(s??'').normalize('NFKC').trim().replace(/\s+/g,' ');
const key=s=>normal(s).toLowerCase().replace(/[^a-z0-9]/g,'');
const nameHeader=/^(?:company(?:name|names)?|nameofcompan(?:y|ies)|companysname|clientsname|clientname|namasyarikat|namapelanggan|syarikat)$/;
const regHeader=/(?:reg(?:istration)?|company|ssm|roc).*?(?:no|number)$|registrationnumber/;
const invalidName=/^(?:company|name|total|grand total|no|bil|remarks|summary|registration|number|client|sheet\d+)$/i;
// Old uploads could contain Excel serials rather than formatted date strings.
// Infer dates ONLY in clearly date-specific columns. Never convert company
// numbers, incorporation IDs, share quantities, fees, capital or tax data.
export function isListingFyeColumn(label){
 const words=normal(label).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 return /\b(?:fye|f y e|financial (?:year|yr) (?:end|ending|ended)|(?:accounts|accounting|financial) year end|fy end|year end(?:ed|ing)?)\b/.test(words);
}
export function isListingDateColumn(label){
 const words=normal(label).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 if(!words)return false;
 // "Date of Registration" is a genuine statutory date, but Registration No.
 // is an identifier. Do not reject all "registration" fields indiscriminately.
 const registrationDate=/\b(?:date (?:of )?registration|registration date|date (?:of )?registered|registered date)\b/.test(words);
 if(registrationDate)return true;
 if(/(?:registration|reg no|company no|amount|fees?|capital|share|tax|tin|number|balance|percentage|paid|year only)/.test(words))return false;
 return isListingFyeColumn(label)||/\b(?:date|fye|fy end|financial year end|year end|anniversary|deadline|due|expiry|expiration|expires|renewal date|renewal due|lodgement|lodgment|incorporation|incorporated|financial year ending)\b/.test(words);
}
// Worksheet numbering is not a company information field. Suppress only clear
// sequential row-list labels, never registration numbers or No. of Directors.
export function isListingOrdinalColumn(model,columnIndex){
 if(!model?.columns?.[columnIndex])return false;
 if(columnIndex===model.nameColumn||columnIndex===model.registrationColumn)return false;
 const header=normal(model.columns[columnIndex].label).toLowerCase().replace(/\s+/g,' ');
 return /^(?:#|no\.?|no\.? list|no\.? of list|list no\.?|serial no\.?|s\/n|bil\.?|bilangan|row no\.?|row number|index)$/.test(header);
}
export function listingOrdinalValue(model,row,rowIndex){
 const sourceColumn=model?.columns?.findIndex((_,i)=>isListingOrdinalColumn(model,i))??-1;
 const source=sourceColumn>=0?String(row?.values?.[sourceColumn]??'').trim():'';
 return source&&source.toUpperCase()!=='N/A'?source:String(rowIndex+1);
}
const fmtDate=(d,m,y)=>String(d).padStart(2,'0')+'/'+String(m).padStart(2,'0')+'/'+String(y).padStart(4,'0');
function validDate(d,m,y){
 if(!Number.isInteger(d)||!Number.isInteger(m)||!Number.isInteger(y)||y<1900||y>2199||m<1||m>12||d<1)return false;
 return d<=new Date(Date.UTC(y,m,0)).getUTCDate();
}
const monthNames={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
export function normalizeListingDateText(value,{dateColumn=false,date1904=false}={}){
 const raw=String(value??'').trim();
 if(!raw)return null;
 if(dateColumn){
  const serial=excelSerialToDateString(raw,{date1904});
  if(serial!==null)return serial;
 }
 let m;
 // Standard Excel date forms, including alternate source punctuation.
 if((m=/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ]00:00(?::00)?(?:\.0+)?Z?)?$/.exec(raw))){
  const y=+m[1],month=+m[2],day=+m[3];
  return validDate(day,month,y)?fmtDate(day,month,y):null;
 }
 if((m=/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw))){
  let day=+m[1],month=+m[2],year=+m[3];
  // Unambiguous U.S. m/d/yyyy Excel built-in date: second component > 12.
  if(month>12&&day<=12){[day,month]=[month,day];}
  return validDate(day,month,year)?fmtDate(day,month,year):null;
 }
 if((m=/^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/.exec(raw))&&dateColumn){
  let day=+m[1],month=+m[2],year=+m[3]+(+m[3]>=70?1900:2000);
  if(month>12&&day<=12){[day,month]=[month,day];}
  return validDate(day,month,year)?fmtDate(day,month,year):null;
 }
 if((m=/^(\d{1,2})[\s/-]+([a-zA-Z]{3,9})[\s,/-]+(\d{4})$/.exec(raw))){
  const day=+m[1],month=monthNames[m[2].slice(0,3).toLowerCase()],year=+m[3];
  return validDate(day,month,year)?fmtDate(day,month,year):null;
 }
 if((m=/^([a-zA-Z]{3,9})[\s/-]+(\d{1,2}),?[\s/-]+(\d{4})$/.exec(raw))){
  const day=+m[2],month=monthNames[m[1].slice(0,3).toLowerCase()],year=+m[3];
  return validDate(day,month,year)?fmtDate(day,month,year):null;
 }
 return null;
}
/**
 * Older company Master Listings sometimes contain the literal "b" under
 * Constitution, which is not a meaningful Constitution status. Treat ONLY
 * this placeholder (and blanks) as N/A; never reinterpret genuine text such
 * as Adopted, Not Adopted, Yes, No or historical M&A descriptions.
 */
export function isListingConstitutionColumn(label){
 const words=normal(label).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 return /^(?:(?:company|corporate|adopted) )?constitution(?: (?:status|adopted|adoption))?$/.test(words);
}
/**
 * Invalid single-character values imported from older Constitution columns
 * may visually resemble "b", "p" or the Unicode thorn "þ". These do not
 * establish a real Constitution status. Preserve Y/N/A abbreviations and
 * any meaningful descriptive records.
 */
export function isUnknownConstitutionValue(value){
 const compact=String(value??'').normalize('NFKC')
  .replace(/[\u200B-\u200D\u2060\uFEFF]/g,'')
  .replace(/[\u0300-\u036F]/g,'').trim();
 if(!compact)return true;
 if(/^(?:n\s*\/?\s*a|nil|none|not\s+(?:applicable|available)|-|–|—)$/i.test(compact))
  return true;
 return Array.from(compact).length===1&&/\p{L}/u.test(compact)&&
  !/^[ANY]$/i.test(compact);
}
/** A confirmed adoption/presence of a company constitution displays as Yes. */
export function isAffirmativeConstitutionValue(value){
 const compact=normal(value).toLowerCase().replace(/[_.-]+/g,' ').replace(/\s+/g,' ').trim();
 return /^(?:yes|y|true|adopted|adopted constitution|constitution adopted|has constitution|has a constitution|constitution available|constitution in place|constitution in force|present|available)$/.test(compact);
}
export function formattedListingCell(model,columnIndex,value){
 const raw=String(value??'');
 if(!raw.trim())return 'N/A';
 if(isListingConstitutionColumn(model?.columns?.[columnIndex]?.label)){
  if(isAffirmativeConstitutionValue(raw))return 'Yes';
  if(isUnknownConstitutionValue(raw))return 'N/A';
 }
 const dateColumn=isListingDateColumn(model?.columns?.[columnIndex]?.label);
 return normalizeListingDateText(raw,{dateColumn,date1904:!!model?.date1904})??raw;
}

/**
 * One-time, data-preserving cleanup of the Constitution column in stored
 * Master Listings. An unchanged model is returned for idempotent reloading;
 * callers can back up the source before committing the corrected copy.
 * Only the Constitution column is eligible; genuine Yes/No/adoption text and
 * other workbook columns are left untouched.
 */
export function repairListingConstitutionPlaceholders(model){
 validateMasterListing(model);
 const cols=model.columns.flatMap((c,i)=>
  isListingConstitutionColumn(c.label)?[i]:[]);
 if(!cols.length)return {model,count:0};
 let rows=null,count=0;
 for(let ri=0;ri<model.rows.length;ri++){
  const old=model.rows[ri];
  for(const ci of cols){
   const current=old.values[ci];
   const formatted=formattedListingCell(model,ci,current);
   if(formatted===current)continue;
   if(!rows)rows=model.rows.slice();
   if(rows[ri]===old)rows[ri]={...old,values:old.values.slice()};
   rows[ri].values[ci]=formatted;count++;
  }
 }
 const revised=rows?{...model,rows}:model;
 if(rows)validateMasterListing(revised);
 return {model:revised,count};
}

export function excelSerialToDateString(value,{date1904=false}={}){
 const raw=String(value??'').trim();
 if(!/^\d{5}(?:\.0+)?$/.test(raw))return null;
 const serial=Number(raw);
 // Constrain to plausible modern statutory dates: 1954–2119 (1900 system).
 if(!Number.isSafeInteger(serial)||serial<20000||serial>80000)return null;
 const epoch=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30);
 const date=new Date(epoch+serial*86400000);
 if(!Number.isFinite(date.getTime()))return null;
 return String(date.getUTCDate()).padStart(2,'0')+'/'+String(date.getUTCMonth()+1).padStart(2,'0')+'/'+date.getUTCFullYear();
}
export function displayedListingValue(model,columnIndex,value){
 return formattedListingCell(model,columnIndex,value);
}
export function countLegacyDateSerials(model){
 if(!model?.columns||!model?.rows)return 0;
 const cols=model.columns.map((c,i)=>isListingDateColumn(c.label)?i:-1).filter(i=>i>=0);
 let count=0;
 for(const row of model.rows)for(const i of cols)
  if(excelSerialToDateString(row.values[i],{date1904:!!model?.date1904}))count++;
 return count;
}
export function repairLegacyDateSerials(model){
 validateMasterListing(model);
 const copy={...model,rows:model.rows.map(r=>({...r,values:r.values.slice()}))};
 let count=0;
 const columns=model.columns.map((c,i)=>isListingDateColumn(c.label)?i:-1).filter(i=>i>=0);
 for(const row of copy.rows)for(const i of columns){
  const old=row.values[i];
  const formatted=excelSerialToDateString(old,{date1904:!!copy.date1904});
  if(formatted!==null){row.values[i]=formatted;count++;}
 }
 return {model:copy,count};
}

function clean(value){
 if(value===null||value===undefined)return '';
 const text=String(value);
 if(text.length>LIMIT_VALUE)throw Error('A Master Listing cell exceeds '+LIMIT_VALUE+' characters.');
 return text.replace(/\u0000/g,'');
}
export function detectListingColumns(rows){
 let detected={headerRow:1,startRow:2,nameColumn:0,registrationColumn:-1,score:-1};
 for(let i=0;i<Math.min(30,rows?.length||0);i++){
  const cells=rows[i]||[];
  for(let c=0;c<Math.min(cells.length,LIMIT_COLUMNS);c++){
   const label=key(cells[c]);
   if(!nameHeader.test(label)&&!/companyname|nameofcompany|namasyarikat|companysname/.test(label))continue;
   const score=nameHeader.test(label)?6:4;
   if(score>detected.score){
    const reg=cells.findIndex((x,j)=>j!==c&&regHeader.test(key(x)));
    detected={headerRow:i+1,startRow:i+2,nameColumn:c,registrationColumn:reg,score};
   }
  }
 }
 return {headerRow:detected.headerRow,startRow:detected.startRow,
  nameColumn:detected.nameColumn,registrationColumn:detected.registrationColumn};
}
export function buildMasterListing(rows,opts={}){
 if(!Array.isArray(rows)||!rows.length)throw Error('This worksheet has no readable rows.');
 const options={...detectListingColumns(rows),...opts};
 const headerIndex=Number(options.headerRow)-1,startIndex=Number(options.startRow)-1;
 if(!Number.isInteger(headerIndex)||headerIndex<0||headerIndex>=rows.length)throw Error('Invalid header row.');
 if(!Number.isInteger(startIndex)||startIndex<=headerIndex||startIndex>=rows.length)throw Error('First company row must be below the header and within the worksheet.');
 const nameColumn=Number(options.nameColumn),regColumn=Number(options.registrationColumn);
 const width=Math.max(1,...rows.slice(headerIndex,Math.min(rows.length,startIndex+40)).map(r=>r?.length||0));
 if(width>LIMIT_COLUMNS)throw Error('The worksheet has more than '+LIMIT_COLUMNS+' columns. Split it into a smaller listing.');
 if(nameColumn<0||nameColumn>=width||!Number.isInteger(nameColumn))throw Error('Select the company-name column.');
 if(regColumn>=width||regColumn<-1||!Number.isInteger(regColumn))throw Error('Registration number column is invalid.');
 const columns=Array.from({length:width},(_,i)=>({
  id:'c'+i,label:normal(rows[headerIndex]?.[i])||'Column '+(i+1)
 }));
 const seen=new Set(),importRows=[],skipped={blank:0,duplicate:0};
 for(let i=startIndex;i<rows.length;i++){
  const values=columns.map((column,j)=>{
   const raw=clean(rows[i]?.[j]);
   return formattedListingCell({columns,date1904:!!options.date1904},j,raw);
  });
  const name=normal(values[nameColumn]).split(/\r?\n/)[0];
  if(!name||name==='N/A'||name.length<3||/^[\d\W]+$/.test(name)||invalidName.test(name)){skipped.blank++;continue;}
  const normalized=key(name),registration=regColumn>=0?normal(values[regColumn]):'';
  const unique=(registration.toUpperCase()==='N/A'?'':registration.replace(/[^A-Z0-9]/gi,'').toLowerCase())||normalized;
  if(seen.has(unique)){skipped.duplicate++;continue;}
  seen.add(unique);
  importRows.push({id:'r'+importRows.length,values});
  if(importRows.length>LIMIT_ROWS)throw Error('The listing contains more than '+LIMIT_ROWS+' companies. Split the workbook.');
 }
 if(!importRows.length)throw Error('No valid company rows were found. Check the heading row and company name column.');
 return {version:1,filename:String(options.filename||'Master Listing.xlsx').slice(0,250),
  worksheet:String(options.worksheet||'Master Listing').slice(0,120),
  headerRow:headerIndex+1,startRow:startIndex+1,nameColumn,registrationColumn:regColumn,date1904:!!options.date1904,
  columns,rows:importRows,importedAt:new Date().toISOString(),skipped};
}
export function validateMasterListing(value){
 if(!value||value.version!==1||!Array.isArray(value.columns)||!Array.isArray(value.rows))
  throw Error('Stored Master Listing has an unsupported format.');
 if(!value.columns.length||value.columns.length>LIMIT_COLUMNS||value.rows.length>LIMIT_ROWS)
  throw Error('Stored Master Listing exceeds supported limits.');
 if(!Number.isInteger(value.nameColumn)||value.nameColumn<0||value.nameColumn>=value.columns.length)
  throw Error('Stored Master Listing has an invalid company name column.');
 if(!Number.isInteger(value.registrationColumn)||value.registrationColumn>=value.columns.length||value.registrationColumn<-1)
  throw Error('Stored Master Listing has an invalid registration number column.');
 for(const c of value.columns)if(typeof c.label!=='string'||c.label.length>300)throw Error('Invalid listing header.');
 for(const row of value.rows){
  if(!Array.isArray(row.values)||row.values.length!==value.columns.length)throw Error('Invalid listing row.');
  for(const v of row.values)if(typeof v!=='string'||v.length>LIMIT_VALUE)throw Error('Invalid listing cell.');
 }
 return value;
}
export function companyData(model,row){
 if(!model||!row)return null;
 const reg=model.registrationColumn>=0?normal(row.values[model.registrationColumn]):'';
 return {name:normal(row.values[model.nameColumn]).split(/\r?\n/)[0],
  registration:reg.toUpperCase()==='N/A'?'':reg};
}
export function findCompanyMatch(model,row,companies){
 const info=companyData(model,row);if(!info)return null;
 const registration=info.registration.match(/\d{12}/)?.[0]||'';
 const regMatches=registration?(companies||[]).filter(c=>String(c.registration_no||'').includes(registration)):[];
 if(regMatches.length===1)return regMatches[0];
 if(regMatches.length>1)return null;
 const nameMatches=(companies||[]).filter(c=>key(c.name)===key(info.name));
 return nameMatches.length===1?nameMatches[0]:null;
}
export function changeListingCell(model,rowIndex,columnIndex,nextValue){
 validateMasterListing(model);
 if(!Number.isInteger(rowIndex)||rowIndex<0||rowIndex>=model.rows.length)throw Error('Invalid company row.');
 if(!Number.isInteger(columnIndex)||columnIndex<0||columnIndex>=model.columns.length)throw Error('Invalid listing column.');
 const typed=clean(nextValue);
 if(columnIndex===model.nameColumn&&(!normal(typed)||normal(typed).length<3))throw Error('Company name is required.');
 const value=formattedListingCell(model,columnIndex,typed);
 model.rows[rowIndex].values[columnIndex]=value;
 return model;
}
export function listingRowsForSearch(model,search){
 if(!model)return[];
 const q=normal(search).toLowerCase();
 const rows=model.rows.map((r,index)=>({row:r,index}));
 if(!q)return rows;
 return rows.filter(({row})=>row.values.some((v,i)=>displayedListingValue(model,i,v).toLowerCase().includes(q)));
}
export function listingCSV(model){
 validateMasterListing(model);
 const csvCell=value=>{
  // Avoid formula injection when CSV is opened by spreadsheet applications.
  let s=String(value??'');
  if(/^[\s]*[=+\-@]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
 };
 return [model.columns.map(x=>csvCell(x.label)).join(','),
  ...model.rows.map(row=>row.values.map((v,i)=>csvCell(displayedListingValue(model,i,v))).join(','))].join('\r\n');
}


/** Append missing Documents companies without touching the existing Master Listing rows or column order. */
export function mergeDocumentCompanies(model,companies){
 validateMasterListing(model);
 if(!Array.isArray(companies))throw Error('Documents companies must be an array.');
 const regKey=value=>{const v=normal(value).toUpperCase();return v==='N/A'?'':v.replace(/[^A-Z0-9]/g,'');};
 const names=new Set(),registrations=new Set();
 for(const row of model.rows){
  const c=companyData(model,row);
  const n=key(c.name),r=regKey(c.registration);
  if(n)names.add(n);if(r)registrations.add(r);
 }
 const serialCol=model.columns.findIndex((_,i)=>isListingOrdinalColumn(model,i));
 let serial=model.rows.length;
 if(serialCol>=0)for(const row of model.rows){
  const n=Number(String(row.values[serialCol]||'').trim());
  if(Number.isSafeInteger(n)&&n>serial)serial=n;
 }
 const rows=model.rows.slice();
 let added=0,existing=0,invalid=0;
 for(const company of companies){
  const name=normal(company?.name);
  const raw=normal(company?.registration_no??company?.registration??'');
  const registration=raw.toUpperCase()==='N/A'?'':raw;
  const n=key(name),r=regKey(registration);
  if(name.length<3||name.length>250||/[\r\n]/.test(name)||invalidName.test(name)||!n){invalid++;continue;}
  if(names.has(n)||(r&&registrations.has(r))){existing++;continue;}
  if(rows.length>=LIMIT_ROWS)throw Error('Master Listing exceeds 5,000 companies. No automatic changes were saved.');
  const values=model.columns.map(()=>'N/A');
  values[model.nameColumn]=name;
  if(model.registrationColumn>=0)values[model.registrationColumn]=registration||'N/A';
  if(serialCol>=0)values[serialCol]=String(++serial);
  rows.push({id:'doc-'+crypto.randomUUID(),values});
  names.add(n);if(r)registrations.add(r);added++;
 }
 const updated=added?sortMasterListingCompanies({...model,rows}).model:model;
 validateMasterListing(updated);
 return {model:updated,added,existing,invalid};
}


/** Remove exactly one Master Listing row, preserving every non-number field. */
export function removeMasterListingRow(model,rowId){
 validateMasterListing(model);
 const at=model.rows.findIndex(row=>row.id===rowId);
 if(at<0)return {model,removed:0};
 const ordinal=model.columns.findIndex((_,i)=>isListingOrdinalColumn(model,i));
 const rows=model.rows.filter((_,i)=>i!==at).map((row,i)=>{
  if(ordinal<0||row.values[ordinal]===String(i+1))return row;
  const values=row.values.slice();values[ordinal]=String(i+1);
  return {...row,values};
 });
 const result={...model,rows};
 validateMasterListing(result);
 return {model:result,removed:1};
}

/** Remove only the unique matching company after its Documents record is deleted. */
export function removeDeletedDocumentCompany(model,deleted,remaining=[]){
 validateMasterListing(model);
 if(!deleted?.name||!Array.isArray(remaining))throw Error('Deleted company identity is unavailable.');
 const regKey=v=>{
  const s=normal(v).toUpperCase();
  if(!s||s==='N/A')return '';
  return s.match(/\d{12}/)?.[0]||s.replace(/[^A-Z0-9]/g,'');
 };
 const name=key(deleted.name),reg=regKey(deleted.registration_no??deleted.registration);
 const matches=(n,r)=>{
  // When both sides have registration numbers, use the registration number
  // as the authoritative identifier. Never delete a same-name row with a
  // conflicting registration number. If one side lacks it, match by name.
  const b=regKey(r);
  if(reg&&b)return reg===b;
  return !!name&&name===key(n);
 };
 if(remaining.some(c=>matches(c.name,c.registration_no??c.registration)))
  return {model,removed:0,reason:'A matching company still exists in Documents'};
 const candidates=model.rows.filter(row=>{
  const c=companyData(model,row);
  return matches(c.name,c.registration);
 });
 if(!candidates.length)return {model,removed:0,reason:'No matching Master Listing entry'};
 if(candidates.length>1)throw Error('Multiple Master Listing entries match; no row was removed.');
 return {...removeMasterListingRow(model,candidates[0].id),reason:'Removed the matching company'};
}


/** Sort companies by name while keeping every imported field with its company. */
export function sortMasterListingCompanies(model){
 validateMasterListing(model);
 const items=model.rows.map((row,index)=>({row,index}));
 items.sort((a,b)=>{
  const nameA=normal(a.row.values[model.nameColumn]);
  const nameB=normal(b.row.values[model.nameColumn]);
  return nameA.localeCompare(nameB,'en',{sensitivity:'base',numeric:true})||a.index-b.index;
 });
 const ordinal=model.columns.findIndex((_,i)=>isListingOrdinalColumn(model,i));
 let changed=false;
 const rows=items.map(({row,index},i)=>{
  const serial=String(i+1);
  if(index===i&&(ordinal<0||row.values[ordinal]===serial))return row;
  changed=true;
  if(ordinal<0||row.values[ordinal]===serial)return row;
  const values=row.values.slice();
  values[ordinal]=serial;
  return {...row,values};
 });
 const result=changed?{...model,rows}:model;
 validateMasterListing(result);
 return {model:result,changed};
}


/**
 * Repair orphaned companies that were originally added via Documents.
 * Existing Excel-imported companies are NOT removed merely because a Documents
 * folder is absent. The named legacy test company "mmm" was explicitly
 * requested for removal if it is no longer in Documents.
 */
export function reconcileDeletedDocumentRows(model,companies,{requestedNames=['mmm']}={}){
 validateMasterListing(model);
 if(!Array.isArray(companies))throw Error('A complete Documents company list is required.');
 // An incomplete PostgREST page is unsafe for destructive reconciliation.
 if(companies.length>=1000)throw Error('Too many Documents companies to verify safely. No Master Listing changes made.');
 const normalized=v=>String(v??'').normalize('NFKC').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
 const register=v=>{
  const s=normalized(v);
  return s==='NA'?'':s.match(/\d{12}/)?.[0]||s;
 };
 const docRows=companies.map(c=>({name:normalized(c.name),registration:register(c.registration_no??c.registration)}));
 const explicitlyDeleted=new Set(requestedNames.map(name=>normalized(name)));
 const orphaned=[];
 const kept=[];
 for(const row of model.rows){
  const info=companyData(model,row);
  const name=normalized(info.name),registration=register(info.registration);
  const fromDocuments=String(row.id||'').startsWith('doc-');
  if(!fromDocuments&&!explicitlyDeleted.has(name)){kept.push(row);continue;}
  const stillExists=docRows.some(c=>{
   if(registration&&c.registration)return registration===c.registration;
   return !!name&&name===c.name;
  });
  if(stillExists){kept.push(row);continue;}
  orphaned.push({id:row.id,name:info.name});
 }
 if(!orphaned.length)return {model,removed:0,names:[]};
 const ordinal=model.columns.findIndex((_,i)=>isListingOrdinalColumn(model,i));
 const rows=kept.map((row,i)=>{
  if(ordinal<0||row.values[ordinal]===String(i+1))return row;
  const values=row.values.slice();values[ordinal]=String(i+1);
  return {...row,values};
 });
 const updated={...model,rows};
 validateMasterListing(updated);
 return {model:updated,removed:orphaned.length,names:orphaned.map(c=>c.name)};
}
