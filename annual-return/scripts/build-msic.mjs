/* Official government MSIC 2008 Ver.1 data lookup.
 * DOSM dataset is the 5-digit classification SSM BizCodEX uses, NOT an SSM API.
 * Attribution: DOSM via data.gov.my, CC BY 4.0.
 */
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {dirname} from 'node:path';
const URL_DATA='https://storage.dosm.gov.my/dictionaries/msic.csv';
const OUT=new URL('../public/msic-2008.json',import.meta.url);
function parseCSV(raw){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<raw.length;i++){
  const ch=raw[i];
  if(quoted){if(ch==='"'&&raw[i+1]==='"'){cell+='"';i++}else if(ch==='"')quoted=false;else cell+=ch;}
  else if(ch==='"')quoted=true;
  else if(ch===','){row.push(cell);cell='';}
  else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
  else cell+=ch;
 }
 if(cell||row.length){row.push(cell);rows.push(row);}
 return rows;
}
async function download(){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),25000);
 try{
  const r=await fetch(URL_DATA,{signal:controller.signal});
  if(!r.ok)throw Error('Government dataset responded HTTP '+r.status);
  const size=Number(r.headers.get('content-length')||0);
  if(size>8e6)throw Error('Government CSV exceeds 8 MB.');
  const text=await r.text();if(text.length>8e6)throw Error('Government CSV exceeds 8 MB.');
  return text;
 }finally{clearTimeout(timeout);}
}
const raw=await download();
const rows=parseCSV(raw.replace(/^\uFEFF/,''));
const headers=rows.shift().map(x=>x.toLowerCase().trim().replace(/^"|"$/g,''));
const at=name=>headers.indexOf(name);
for(const need of ['digits','item','desc_en'])if(at(need)<0)throw Error('Unexpected DOSM MSIC CSV column: '+need+'; actual '+headers.join(','));
const map=new Map();
for(const row of rows){
 const digits=Number(row[at('digits')]);
 const code=String(row[at('item')]||'').trim();
 const desc=String(row[at('desc_en')]||'').trim();
 const bm=at('desc_bm')<0?'':String(row[at('desc_bm')]||'').trim();
 if(digits===5&&/^\d{5}$/.test(code)&&desc&&!map.has(code))map.set(code,{code,en:desc.slice(0,250),bm:bm.slice(0,250)});
}
if(map.size<800)throw Error('Official DOSM MSIC 2008 dataset unexpectedly contains only '+map.size+' five-digit codes; refusing incomplete lookup.');
const payload={version:'MSIC 2008 Ver. 1',authority:'Department of Statistics Malaysia (DOSM), classification used by SSM BizCodEX',
source:URL_DATA,ssm:'https://www.ssm.com.my/Pages/BizCodEX.aspx',retrievedAt:new Date().toISOString(),
license:'CC BY 4.0',codes:[...map.values()].sort((a,b)=>a.code.localeCompare(b.code))};
await mkdir(dirname(OUT.pathname),{recursive:true});
await writeFile(OUT,JSON.stringify(payload),'utf8');
const readback=JSON.parse(await readFile(OUT,'utf8'));
if(readback.codes.length!==map.size)throw Error('MSIC catalogue output verification failed.');
console.log('Generated '+map.size+' official MSIC 2008 codes from '+URL_DATA);
