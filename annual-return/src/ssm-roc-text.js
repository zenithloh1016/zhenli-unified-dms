/**
 * Parse the official SSM MSIC 2008 ROC PDF's text produced by
 * `pdftotext -layout -nopgbrk`. Do not generate fictional suffix variants.
 * Every returned code and description is taken directly from a PDF row.
 */
export function parseSSMROCText(input){
 const map=new Map();
 for(const line of String(input||'').replace(/\u00a0/g,' ').split(/\r?\n/)){
  const match=line.match(/^\s*(\d{1,4})\s+(\d{5}[abeiu]?)\s{2,}(.*?)\s{2,}(\S.*?)\s*$/i);
  if(!match)continue;
  const sequence=Number(match[1]),code=match[2].toLowerCase();
  const bm=match[3].trim().replace(/\s+/g,' ');
  const en=match[4].trim().replace(/\s+/g,' ');
  if(sequence<1||sequence>3000||!bm||!en||map.has(code))continue;
  map.set(code,{code,en,bm,sequence});
 }
 return [...map.values()].sort((a,b)=>a.sequence-b.sequence);
}
