/**
 * User-requested Annual Return convenience defaults. These are company-specific
 * DRAFT assumptions; existing verified particulars always take precedence.
 *
 * Companies Act 2016 s 74 abolished par value: RM1/share is NOT a statutory
 * value. The generated review PDF must clearly disclose calculated amounts.
 */
import {extractMSICCodes,MAX_MSIC_CODES} from './msic.js';

const txt=v=>String(v??'').trim();
const exists=v=>txt(v)&&!/^(?:-|–|—|n\/?a|nil|none|not provided|not applicable)$/i.test(txt(v));
const numberOfShares=v=>{
 const raw=txt(v).replace(/,/g,'');
 if(!/^\d+$/.test(raw))return null;
 const n=Number(raw);
 return Number.isSafeInteger(n)&&n>0?n:null;
};
const msicCode=v=>{
 const raw=txt(v).toLowerCase();
 return /^\d{5}[abeiu]?$/.test(raw)?raw:'';
};

/** Only pull codes from explicitly labelled MSIC fields, not unrelated IDs. */
export function msicCodesFromProfileFields(fields){
 const result=[];
 for(const field of fields||[]){
  if(!/\bmsic\b|\bmalaysian standard industrial classification\b/i.test(txt(field.label)))continue;
  const value=txt(field.value);
  // Supports "MSIC Code 1" = "64923", "64923 - description",
  // "64923, 64929" and "Nature / MSIC Code" combined text.
  const matches=value.match(/(?:^|[^\da-z])(\d{5}[abeiu]?)(?=$|[^\da-z])/gi)||[];
  for(const raw of matches){
   const code=msicCode(raw.replace(/^[^\d]+/,''));
   if(code&&!result.includes(code))result.push(code);
   if(result.length===MAX_MSIC_CODES)return result;
  }
 }
 return result;
}

/**
 * Run after registered particulars, then again after Master Listing. Repeated
 * application is idempotent, even when a cloud draft is reopened.
 */
export function applyAnnualReturnDefaults(document,{msicCodes=[]}={}){
 if(!document||!Array.isArray(document.particulars))
  return {document,filled:0,addresses:0,capital:0,msic:0};
 const get=key=>document.particulars.find(p=>p.type==='field'&&p.en===key);
 let filled=0,addresses=0,capital=0,msic=0;
 for(const [destination,origin] of [
  ['Address Where Register of Members Is Kept','Registered Office'],
  ['Address Where Financial Records Are Kept','Principal Place of Business']
 ]){
  const target=get(destination),source=get(origin);
  if(target&&!exists(target.value)&&exists(source?.value)){
   target.value=txt(source.value);filled++;addresses++;
  }
 }
 // A verified sole-class share count may be read from the explicitly
 // recorded all-class total. Never split a mixed-class total by assumption.
 const knownClass=txt(get('Classes of Shares Issued')?.value).toLowerCase().replace(/\s+shares?$/,'');
 const allCount=numberOfShares(get('Total Number of Issued Shares (all classes)')?.value);
 if(allCount&&['ordinary','preference'].includes(knownClass)){
  const primary=get(knownClass==='ordinary'?'Number of Ordinary Shares':'Number of Preference Shares');
  const other=get(knownClass==='ordinary'?'Number of Preference Shares':'Number of Ordinary Shares');
  if(primary&&!exists(primary.value)&&!exists(other?.value)){
   primary.value=allCount.toLocaleString('en-US');filled++;capital++;
  }
 }
 const currency=get('Currency');
 const currencyText=txt(currency?.value);
 // RM1/share only where currency is MYR or unspecified; no assumptions for
 // foreign-currency capital. Do not fabricate an otherwise missing share count.
 const isMYR=!currencyText||/^(?:rm|myr|ringgit|malaysian ringgit)$/i.test(currencyText);
 if(isMYR)for(const [unitsKey,paidKey] of [
  ['Number of Ordinary Shares','Ordinary Share Capital (recorded amount paid)'],
  ['Number of Preference Shares','Preference Share Capital (recorded amount paid)']
 ]){
  const units=numberOfShares(get(unitsKey)?.value),target=get(paidKey);
  if(!units||!target)continue;
  // Prior RM1-derived entries may be refreshed when actual unit counts change,
  // but manually entered or registered amounts always remain untouched.
  const derived=target.autoAssumedRate===1;
  if(exists(target.value)&&!derived)continue;
  const computed=units.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  if(derived&&txt(target.value)===computed)continue;
  target.value=computed;
  target.autoAssumedRate=1;
  filled++;capital++;
 }
 const item=get('Nature of Business / MSIC Code');
 if(item){
  let existing=txt(item.value);
  // Legacy register books use "MSIC: 64923, 64929", which was not
  // recognised by the MSIC chip controls. Convert this narrowly delimited
  // suffix into canonical lines, preserving any preceding business nature.
  const list=/^\d{5}[abeiu]?(?:\s*[,;]\s*\d{5}[abeiu]?){0,2}$/i;
  const compact=existing.match(/(?:^|\s*\|\s*|\n)MSIC(?:\s+codes?)?\s*[:\-]\s*(\d{5}[abeiu]?(?:\s*[,;]\s*\d{5}[abeiu]?){0,2})\s*$/i);
  if(compact){
   const codes=compact[1].match(/\d{5}[abeiu]?/gi)||[];
   existing=existing.slice(0,compact.index).trim().replace(/[|,;]+$/,'').trim();
   existing+=(existing?'\n':'')+codes.map(code=>code.toLowerCase()+' — ').join('\n');
  }else if(list.test(existing)){
   existing=(existing.match(/\d{5}[abeiu]?/gi)||[])
    .map(code=>code.toLowerCase()+' — ').join('\n');
  }
  const current=extractMSICCodes(existing).map(x=>x.code);
  const present=new Set(current);
  const accepted=[];
  for(const proposed of msicCodes||[]){
   const raw=typeof proposed==='string'?proposed:proposed?.code;
   const code=msicCode(raw);
   if(!code||present.has(code))continue;
   if(present.size>=MAX_MSIC_CODES)break;
   const description=typeof proposed==='object'?txt(proposed?.en):'';
   accepted.push(code+' — '+description);
   present.add(code);
  }
  if(accepted.length){
   existing+=(existing?'\n':'')+accepted.join('\n');
   msic+=accepted.length;
  }
  if(existing!==txt(item.value)){
   item.value=existing;filled++;
  }
 }
 return {document,filled,addresses,capital,msic};
}
