// SSM uses MSIC 2008 Ver. 1 (DOSM). Selecting no more than three codes.
export const MAX_MSIC_CODES=3;
export const MSIC_FIELD=/^Nature of Business\s*\/\s*MSIC Code$/i;
export const SSM_MSIC_LOOKUP='https://www.ssm.com.my/Pages/BizCodEX.aspx';
export const SSM_MSIC_ROC_PDF='https://www.ssm.com.my/Pages/Publication/SSM%20MSIC%20Code/ROC/SSM%20MSIC%202008%20CODE%20-%20ROC.pdf';
export function extractMSICCodes(value){
 const lines=String(value||'').split(/\r?\n/);
 const rows=[];
 for(const line of lines){
  const match=line.trim().match(/^(\d{5}[abeiu]?)\s*(?:[—–:\-|]\s*|\s{2,})(.*)$/i);
  if(match&&!rows.some(v=>v.code===match[1].toLowerCase()))
    rows.push({code:match[1].toLowerCase(),en:(match[2]||'').trim()});
 }
 return rows;
}
export function formatMSICCodes(rows){
 if(rows.length>MAX_MSIC_CODES)throw Error('Maximum three MSIC codes per company.');
 if(new Set(rows.map(x=>x.code)).size!==rows.length)throw Error('Duplicate MSIC codes cannot be selected.');
 return rows.map(x=>x.code+' — '+x.en).join('\n');
}
export function matchesMSIC(list,q,max=16){
 const term=String(q||'').trim().toLowerCase();
 if(term.length<2)return [];
 return list.filter(x=>x.code.toLowerCase().includes(term)||
  String(x.en).toLowerCase().includes(term)||String(x.bm||'').toLowerCase().includes(term)).slice(0,max);
}

/** SSM ROC variants are distinct official business codes, not universal suffixes. */
export function mergeMSICCatalogues(dosmCodes,rocCodes){
 const codes=new Map();
 for(const row of dosmCodes||[]){
  const code=String(row.code||'').toLowerCase();
  if(/^\d{5}$/.test(code)&&row.en)codes.set(code,{...row,code});
 }
 const rocByCode=new Map();
 for(const row of rocCodes||[]){
  const code=String(row.code||'').toLowerCase();
  if(!/^\d{5}[abeiu]?$/.test(code)||!row.en)continue;
  if(!rocByCode.has(code)){rocByCode.set(code,{...row,code});continue;}
  // SSM lists some distinct business activities under the same ROC code.
  // Preserve every description without treating identical codes as different codes.
  const entry=rocByCode.get(code);
  for(const field of ['en','bm']){
   const label=String(row[field]||'').trim();
   if(label&&!String(entry[field]||'').split(' / ').includes(label))
    entry[field]=(entry[field]?entry[field]+' / ':'')+label;
  }
 }
 for(const [code,row] of rocByCode)codes.set(code,row);
 return [...codes.values()].sort((a,b)=>a.code.localeCompare(b.code));
}
