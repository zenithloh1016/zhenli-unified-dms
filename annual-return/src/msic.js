// SSM uses MSIC 2008 Ver. 1 (DOSM). Selecting no more than three codes.
export const MAX_MSIC_CODES=3;
export const MSIC_FIELD=/^Nature of Business\s*\/\s*MSIC Code$/i;
export const SSM_MSIC_LOOKUP='https://www.ssm.com.my/Pages/BizCodEX.aspx';
export const SSM_MSIC_ROC_PDF='https://www.ssm.com.my/Pages/Publication/SSM%20MSIC%20Code/ROC/SSM%20MSIC%202008%20CODE%20-%20ROC.pdf';
export function extractMSICCodes(value){
 const lines=String(value||'').split(/\r?\n/);
 const rows=[];
 for(const line of lines){
  const match=line.trim().match(/^(\d{5}[eiu]?)\s*(?:[—–:\-|]\s*|\s{2,})(.*)$/i);
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
