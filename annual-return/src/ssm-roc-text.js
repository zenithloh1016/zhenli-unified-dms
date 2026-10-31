/**
 * Parse the 1,446 published SSM MSIC 2008 ROC PDF rows after
 * `pdftotext -layout -nopgbrk`. The official PDF contains some
 * duplicate business codes with different descriptions (e.g. 01466e).
 * Retain all published rows; the UI catalogue combines duplicate labels.
 */
export function parseSSMROCText(input){
 const rows=[];
 for(const line of String(input||'').replace(/\u00a0/g,' ').split(/\r?\n/)){
  const match=line.match(/^\s*(\d{1,4})\s+(\d{5}[abeiu]?)\s+(.+?)\s*$/i);
  if(!match)continue;
  const sequence=Number(match[1]),code=match[2].toLowerCase(),detail=match[3].trim();
  if(sequence<1||sequence>3000)continue;
  let bm='',en='';
  // When a long Malay name touches the English column, pdftotext collapses
  // the separating spaces. English export/import markers remain unambiguous.
  const english=[...detail.matchAll(/\b(?:Export and Import|Export|Import)\b/g)];
  if(english.length){
   const start=english[english.length-1].index;
   bm=detail.slice(0,start).trim();
   en=detail.slice(start).trim();
  }
  if(!bm||!en){
   const pieces=detail.split(/\s{2,}/).map(s=>s.trim()).filter(Boolean);
   if(pieces.length>=2){bm=pieces[0];en=pieces.slice(1).join(' ');}
  }
  if(!bm||!en)continue;
  rows.push({code,en:en.replace(/\s+/g,' '),bm:bm.replace(/\s+/g,' '),sequence});
 }
 return rows.sort((a,b)=>a.sequence-b.sequence);
}
