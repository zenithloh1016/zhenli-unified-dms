/**
 * Statutory numeric display only: never round or rewrite original workbook data
 * on import or PDF export. Recognise numbers by statutory FIELD LABEL, not by
 * arbitrary cell contents (NRIC, registration IDs and dates are not amounts).
 */
const trimmed=v=>String(v??'').trim();
export function numericKind(label){
 const s=trimmed(label).toLowerCase();
 if(/(?:percentage|percent|shareholding\s*%|ownership\s*%|voting rights\s*%|\(%\)|shareholding ratio)/.test(s))return 'percent';
 if(/(?:consideration|amount paid on share|amount paid|paid.up (?:capital|amount)|share capital|nominal value|total paid)/.test(s))
  return 'currency';
 if(/(?:\bshares?\b|\bshareholding\b)/.test(s)&&
    /(?:no\.?|number|total|balance|held|allotted|issued|transferred|acquired|quantity|units|shareholding)/.test(s))
  return 'shares';
 return '';
}
export function parseStatutoryNumber(value){
 const s=trimmed(value);
 if(!s||/^(?:-|n\/a|nil|none)$/i.test(s))return null;
 const clean=s.replace(/^(?:RM|MYR)\s*/i,'').replace(/,/g,'').replace(/%$/,'').trim();
 if(!/^[+-]?\d+(?:\.\d+)?$/.test(clean))return null;
 const parsed=Number(clean);
 return Number.isFinite(parsed)?parsed:null;
}
const grouped=(number,decimals)=>{
 const n=Math.abs(number);
 const sign=number<0?'-':'';
 const fixed=n.toFixed(decimals);
 const [whole,frac]=fixed.split('.');
 const digits=whole.replace(/\B(?=(\d{3})+(?!\d))/g,',');
 return sign+digits+(frac!==undefined?'.'+frac:'');
};
export function formatStatutoryNumber(label,value){
 const kind=numericKind(label),n=parseStatutoryNumber(value);
 if(!kind||n===null)return String(value??'');
 if(kind==='shares'){
  const raw=trimmed(value).replace(/,/g,'').replace(/^\+/,'');
  const dec=(raw.split('.')[1]||'').length;
  return dec?grouped(n,Math.min(dec,6)):grouped(n,0);
 }
 if(kind==='currency'){
  const dec=(trimmed(value).replace(/,/g,'').replace(/^(?:RM|MYR)\s*/i,'').split('.')[1]||'').length;
  return 'RM'+grouped(n,Math.min(dec,2));
 }
 // Numeric values such as 50 and "50%" already mean 50 percent. A fractional
 // spreadsheet value (0.5) may be a ratio; this is only safely interpreted
 // as 50% when a field explicitly describes a ratio.
 const ratio=/\bratio\b/.test(String(label).toLowerCase());
 return grouped(ratio && Math.abs(n)<=1 && !trimmed(value).includes('%')?n*100:n,2)+'%';
}
export function normalizeStatutoryNumber(label,value){
 // Store a plain numeric string only after the user has intentionally edited
 // a formatted field; imported sources are never rewritten on display.
 const kind=numericKind(label),n=parseStatutoryNumber(value);
 if(!kind||n===null)return String(value??'');
 return trimmed(value).replace(/^(?:RM|MYR)\s*/i,'').replace(/,/g,'')
  .replace(/%$/,'').trim();
}
export function numberFromField(field){
 return parseStatutoryNumber(field?.value);
}
