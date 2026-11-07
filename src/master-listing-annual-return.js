/**
 * Exact-company, relevant Annual Return particulars from the PRIVATE Master
 * Listing. Only fields with an AR equivalent leave the parent DMS frame.
 * No deadline, billing, tax, bank, fee or other unrelated portfolio columns
 * are copied into a statutory return.
 */
import {validateMasterListing,companyData} from './master-listing-data.js';

const str=value=>String(value??'').trim();
const useful=value=>str(value)&&!/^(?:-|–|—|n\/?a|none|nil|not applicable|not provided|unknown)$/i.test(str(value));
const label=value=>str(value).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const companyKey=value=>str(value).normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const regKey=value=>str(value).match(/\d{12}/)?.[0]||'';

/** Reject duplicate, mismatched or unrelated company rows. */
export function matchedAnnualReturnListingRow(listing,company){
 const model=validateMasterListing(listing);
 const name=companyKey(company?.name);
 const reg=regKey(company?.registrationNo??company?.registration_no);
 if(!name)return null;
 const matches=model.rows.filter(row=>{
  const info=companyData(model,row);
  if(companyKey(info?.name)!==name)return false;
  const rowReg=regKey(info?.registration);
  return !(reg&&rowReg&&reg!==rowReg);
 });
 return matches.length===1?matches[0]:null;
}

const aliases={
 'Former Name':[/^(?:former|previous|old) (?:company )?name(?:s)?$/],
 'Annual Return Year':[/^annual return year$/],
 'Anniversary Date':[/^(?:anniversary date|annual return anniversary date|date of anniversary)$/],
 'Date of Incorporation':[/^(?:date of incorporation|incorporation date|date of registration|registration date|date incorporated)$/],
 'Registered Office':[/^(?:registered office(?: address)?|registered address|address of registered office)$/],
 'Address Where Register of Members Is Kept':[/^(?:address where register of members is kept|place where register of members is kept|register of members address|members register address)$/],
 'Principal Place of Business':[/^(?:business address|principal place of business|principal business address|business office address)$/],
 'Address Where Financial Records Are Kept':[/^(?:address where financial records are kept|financial records address|location of accounting records|address of accounting records)$/],
 'Type of Shares Issued':[/^(?:type of shares issued|shares issued for cash or otherwise|nature of consideration for shares)$/],
 'Currency':[/^(?:share capital currency|currency of share capital|currency)$/],
 'Classes of Shares Issued':[/^(?:classes of shares issued|share classes issued|class of shares issued|share class)$/],
 'Number of Ordinary Shares':[/^(?:number of ordinary shares|ordinary shares issued|total ordinary shares|issued ordinary shares)$/],
 'Number of Preference Shares':[/^(?:number of preference shares|preference shares issued|total preference shares|issued preference shares)$/],
 'Total Number of Issued Shares (all classes)':[/^(?:total number of issued shares(?: all classes)?|total issued shares|number of issued shares|issued share count)$/],
 'Ordinary Share Capital (recorded amount paid)':[/^(?:ordinary share capital|paid up ordinary share capital|ordinary issued and paid up share capital)$/],
 'Preference Share Capital (recorded amount paid)':[/^(?:preference share capital|paid up preference share capital|preference issued and paid up share capital)$/],
 'Aggregate Amount Paid on Allotments (verify share capital)':[/^(?:aggregate amount paid on allotments|total amount paid on allotments)$/],
 'Shares Issued for Cash (ordinary)':[/^(?:shares issued for cash ordinary|ordinary shares issued for cash)$/],
 'Shares Issued Otherwise Than in Cash':[/^(?:shares issued otherwise than in cash|shares issued for non cash consideration)$/],
 'Amount Considered Paid on Non-Cash Allotment':[/^(?:amount considered paid on non cash allotment|non cash allotment amount)$/],
 'Amount of Shares Partly Unpaid':[/^(?:amount of shares partly unpaid|unpaid share capital|amount unpaid on shares)$/],
 'Total Calls Called Up / Received':[/^(?:total calls called up received|calls received|total calls received)$/]
};
const natureAliases=[
 /^(?:nature of business|business nature|principal activities|principal business activities|business activities|nature of principal activities|business description)$/,
 /^(?:nature of business msic code|nature of business msic|business nature and msic)$/
];
const msicAlias=/^(?:msic(?: code)?(?: [1-3])?|msic [1-3] code|business msic(?: code)?(?: [1-3])?|malaysian standard industrial classification(?: code)?(?: [1-3])?)$/;

function splitNames(source){
 if(!useful(source))return [];
 const distinct=new Set();
 const values=str(source).split(/\s*;\s*|\r?\n+|\s*\|\s*/g)
  .map(x=>x.replace(/^(?:directors?|members?|beneficial owners?|bos?)\s*:\s*/i,'').trim())
  .filter(useful).slice(0,100);
 return values.filter(x=>{
  const key=companyKey(x);
  if(!key||x.length>180||distinct.has(key))return false;
  distinct.add(key);return true;
 });
}
export function annualReturnParticularsFromMasterListing(listing,company){
 const model=validateMasterListing(listing);
 const row=matchedAnnualReturnListingRow(model,company);
 if(!row)return null;
 const cells=model.columns.map((column,i)=>({
  label:label(column.label),value:str(row.values[i])
 })).filter(cell=>useful(cell.value));
 const select=(...patterns)=>cells.find(c=>patterns.some(re=>re.test(c.label)))?.value||'';
 const info=companyData(model,row);
 const fields={
  'Company Name':info.name,
  'Company Registration No.':info.registration
 };
 for(const [target,patterns] of Object.entries(aliases)){
  const value=select(...patterns);
  if(value)fields[target]=value;
 }
 const nature=select(...natureAliases);
 const msicValues=cells.filter(c=>msicAlias.test(c.label))
  .flatMap(c=>c.value.split(/[,;\n]+/).map(x=>x.trim()))
  .filter(useful).filter((x,i,a)=>a.indexOf(x)===i).slice(0,3);
 if(nature){
  fields['Nature of Business / MSIC Code']=msicValues.length&&!msicValues.every(c=>nature.includes(c))
   ?nature+' | MSIC: '+msicValues.join(', '):nature;
 }else if(msicValues.length){
  fields['Nature of Business / MSIC Code']='MSIC: '+msicValues.join(', ');
 }
 // A generic paid-up total does not prove the amount of each share class.
 const soleClass=label(fields['Classes of Shares Issued']);
 if(soleClass==='ordinary'||soleClass==='ordinary shares'){
  const paid=select(/^(?:paid up capital|paid up share capital|total paid up capital|issued and paid up share capital)$/);
  if(paid&&!fields['Ordinary Share Capital (recorded amount paid)'])
   fields['Ordinary Share Capital (recorded amount paid)']=paid;
 }
 if(soleClass==='preference'||soleClass==='preference shares'){
  const paid=select(/^(?:paid up capital|paid up share capital|total paid up capital|issued and paid up share capital)$/);
  if(paid&&!fields['Preference Share Capital (recorded amount paid)'])
   fields['Preference Share Capital (recorded amount paid)']=paid;
 }
 const people={
  directors:splitNames(select(/^(?:current directors|directors current|current director names|directors names)$/)),
  members:splitNames(select(/^(?:current members|members current|current shareholder names|current shareholders)$/)),
  bos:splitNames(select(/^(?:current beneficial owners|beneficial owners current|current bo names)$/))
 };
 return {fields,people};
}
