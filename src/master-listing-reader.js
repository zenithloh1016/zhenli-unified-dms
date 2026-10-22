/* Local-only XLSX reader for Documents → Import Master Listing.
 * Uses fflate (bundled with the app); never sends the workbook to a server.
 * Unlike the old importer, a problem in an unrelated worksheet cannot block
 * the real Master Listing. Read-only; returns cells for user confirmation.
 */
import {unzipSync,strFromU8} from 'fflate';
import SSF from 'ssf';

const MAX_FILE=20*1024*1024,MAX_XML=32*1024*1024,MAX_TOTAL=48*1024*1024;
const MAX_SHEETS=100,MAX_ROWS=12000,MAX_CELLS=250000;
const decoder=new TextDecoder('utf-8');
const els=(node,tag)=>Array.from(node.getElementsByTagNameNS('*',tag));
const first=(node,tag)=>els(node,tag)[0]||null;
const attr=(node,key)=>node?.getAttribute(key)||'';
const textNodes=(node)=>els(node,'t').map(x=>x.textContent||'').join('');
const normalized=name=>String(name||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
const columnNo=ref=>{
  const col=/^[A-Za-z]+/.exec(String(ref||''))?.[0];
  return col?col.toUpperCase().split('').reduce((n,x)=>n*26+x.charCodeAt(0)-64,0)-1:-1;
};
function xml(bytes,label){
  if(!bytes)throw Error('Missing Excel component: '+label);
  if(bytes.length>MAX_XML)throw Error('Excel component exceeds the 32 MB safety limit: '+label);
  const doc=new DOMParser().parseFromString(strFromU8(bytes),'application/xml');
  if(els(doc,'parsererror').length)throw Error('Excel XML could not be read: '+label);
  return doc;
}
function validateZip(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=i=>view.getUint16(i,true),u32=i=>view.getUint32(i,true);
  let end=-1;
  for(let i=bytes.byteLength-22;i>=Math.max(0,bytes.byteLength-65558);i--){
    if(u32(i)===0x06054b50){end=i;break;}
  }
  if(end<0)throw Error('This is not a valid .xlsx Excel workbook.');
  const count=u16(end+10),total=u32(end+12),start=u32(end+16);
  if(count>1500||start+total>bytes.length||count<1)throw Error('Excel workbook has an unsupported or damaged ZIP directory.');
  let pos=start,uncompressed=0;
  for(let i=0;i<count;i++){
    if(pos+46>bytes.length||u32(pos)!==0x02014b50)throw Error('Excel ZIP directory is damaged.');
    const flags=u16(pos+8),size=u32(pos+24),len=u16(pos+28),extra=u16(pos+30),comment=u16(pos+32);
    if(flags&1)throw Error('This Excel workbook appears password-protected. Save an unprotected .xlsx copy for import.');
    if(size===0xffffffff)throw Error('Large ZIP64 Excel files are not supported.');
    const name=decoder.decode(bytes.subarray(pos+46,pos+46+len));
    if(name==='xl/workbook.xml'||name==='xl/_rels/workbook.xml.rels'||name==='xl/sharedStrings.xml'||name==='xl/styles.xml'||/^xl\/worksheets\/[^/]+\.xml$/.test(name)){
      if(size>MAX_XML)throw Error('Excel worksheet is too large to import safely.');
      uncompressed+=size;
    }
    pos+=46+len+extra+comment;
    if(pos>bytes.length)throw Error('Excel ZIP directory is truncated.');
  }
  if(uncompressed>MAX_TOTAL)throw Error('Excel workbook exceeds the safe expanded size for mobile import.');
}
function safeSheetTarget(target){
  if(!target||target.includes('\\')||target.includes('\0'))throw Error('Excel worksheet location is invalid.');
  const t=new URL(target,'https://excel.invalid/xl/').pathname.replace(/^\//,'');
  if(!/^xl\/worksheets\/[^/]+\.xml$/.test(t))throw Error('Excel worksheet path is unsupported.');
  return t;
}
/**
 * Excel stores most dates as serial numbers: the cell's s= style points to a
 * number format in xl/styles.xml. Retain the source number format (including
 * DD/MM/YYYY vs DD.MM.YYYY, 2- vs 4-digit years, and 1904 workbooks) when
 * importing. Do NOT parse preformatted dates through new Date() or locale
 * formatting, which would silently change the displayed text.
 */
function dateStyles(bytes,workbook){
 const workbookPr=first(workbook,'workbookPr');
 const date1904=/^(1|true)$/i.test(attr(workbookPr,'date1904'));
 if(!bytes)return {formats:[],date1904};
 const doc=xml(bytes,'styles.xml');
 const formats=new Map();
 const numFmts=first(doc,'numFmts');
 for(const item of numFmts?els(numFmts,'numFmt'):[]){
  const id=Number(attr(item,'numFmtId'));
  if(Number.isInteger(id)&&id>=0)formats.set(id,attr(item,'formatCode'));
 }
 const xfs=first(doc,'cellXfs');
 const builtins=SSF.get_table();
 const entries=xfs?els(xfs,'xf'):[];
 return {date1904,formats:entries.map(xf=>{
  const id=Number(attr(xf,'numFmtId')||0);
  const format=formats.get(id)??builtins[id]??null;
  if(!format)return null;
  // SSF interprets a leading unquoted "." as a numeric decimal pattern,
  // skipping the following date tokens in formats like dd.mm.yyyy.
  // Quote date-separator dots so the same visual separators survive.
  const dottedDate=/(?:d{1,4}|m{1,5}|y{2,4})\.(?:d{1,4}|m{1,5}|y{2,4})/i.test(format);
  const normalized=dottedDate
   ?format.replace(/(d{1,4}|m{1,5}|y{2,4})\.(?=[dmy])/gi,'$1"."')
   :format;
  if(!SSF.is_date(normalized))return null;
  return normalized;
 })};
}
function excelISOToSerial(iso,date1904){
 // OOXML t=d values use a calendar date rather than a serial. No timezone
 // conversion is applied, matching Excel's timezone-free cell date model.
 const m=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?/.exec(iso);
 if(!m)return null;
 const y=+m[1],mo=+m[2],d=+m[3],h=+(m[4]||0),min=+(m[5]||0),sec=+(m[6]||0);
 const millis=Date.UTC(y,mo-1,d,h,min,sec,+((m[7]||'').padEnd(3,'0').slice(0,3)));
 if(!Number.isFinite(millis))return null;
 // Serial 1 is 1900-01-01; Excel intentionally contains a fake 1900-02-29.
 const epoch=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,31);
 const serial=(millis-epoch)/86400000;
 return !date1904 && serial>=60?serial+1:serial;
}
export function excelCellDisplay({type='',raw='',styleIndex=0,formatInfo=null}={}){
 if(type==='e')return '';
 if(type==='b')return raw==='1'?'TRUE':'FALSE';
 if(type==='s'||type==='inlineStr'||type==='str')return raw;
 const format=formatInfo?.formats?.[Number(styleIndex)]||null;
 if(!format)return raw;
 const value=type==='d'?excelISOToSerial(raw,!!formatInfo?.date1904):Number(raw);
 if(value===null||!Number.isFinite(value)||raw==='')return raw;
 try{
  return SSF.format(format,value,{date1904:!!formatInfo?.date1904});
 }catch{
  return raw;
 }
}

export async function openMasterListingWorkbook(file){
  if(!file||typeof file.arrayBuffer!=='function')throw Error('Select an Excel file from Android Files or Downloads.');
  if(file.size<50)throw Error('Selected Excel file is empty or could not be accessed by the file picker.');
  if(file.size>MAX_FILE)throw Error('Excel workbook exceeds 20 MB. Save a smaller .xlsx copy and try again.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  validateZip(bytes);
  // Filter out images, embeddings, external links and other unnecessary files.
  const zip=unzipSync(bytes,{filter:f=>f.name==='xl/workbook.xml'||f.name==='xl/_rels/workbook.xml.rels'||
    f.name==='xl/sharedStrings.xml'||f.name==='xl/styles.xml'||/^xl\/worksheets\/[^/]+\.xml$/.test(f.name)});
  const workbook=xml(zip['xl/workbook.xml'],'workbook.xml');
  const rels=xml(zip['xl/_rels/workbook.xml.rels'],'workbook relationships');
  const formatInfo=dateStyles(zip['xl/styles.xml'],workbook);
  const relations=new Map(els(rels,'Relationship').map(n=>[attr(n,'Id'),attr(n,'Target')]));
  let sheets=els(workbook,'sheet').map(n=>{
    const id=attr(n,'r:id')||n.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    return {name:attr(n,'name'),path:safeSheetTarget(relations.get(id))};
  });
  if(!sheets.length)throw Error('No worksheets found in the selected Excel workbook.');
  if(sheets.length>MAX_SHEETS)throw Error('Excel file has too many worksheets; select a smaller workbook.');
  const strings=zip['xl/sharedStrings.xml']
    ?els(xml(zip['xl/sharedStrings.xml'],'sharedStrings.xml'),'si').map(textNodes):[];
  const sheetNames=sheets.map(s=>s.name);
  function readSheet(name,{sparse=false}={}){
    const sheet=sheets.find(s=>s.name===name);
    if(!sheet)throw Error('Worksheet not found: '+name);
    // Statutory Register templates contain 15m+ style-only blank cells across a
    // typical 79-workbook archive. Discard only <c .../> placeholders and now
    // empty rows before DOM parsing, while retaining the original row references.
    // Master Listing's regular reader is unchanged by default.
    const source=zip[sheet.path];
    if(!source)throw Error('Missing Excel worksheet data: '+name);
    const content=sparse?strFromU8(source)
      .replace(/<c\b[^>]*\/>/g,'')
      .replace(/<row\b[^>]*>\s*<\/row>/g,''):null;
    const doc=xml(sparse?new TextEncoder().encode(content):source,name);
    const data=first(doc,'sheetData');
    if(!data)throw Error('No readable cells in worksheet '+name+'.');
    const rows=[],cells=els(data,'row');
    if(cells.length>MAX_ROWS)throw Error('Worksheet has too many rows for mobile import.');
    let cellCount=0;
    for(const [index,r] of cells.entries()){
      const number=Number(attr(r,'r'))||index+1;
      if(number>MAX_ROWS||number<1)throw Error('Worksheet row number is unsupported.');
      const row=[],columns=els(r,'c');
      cellCount+=columns.length;
      if(cellCount>MAX_CELLS)throw Error('Worksheet has too many populated cells for mobile import.');
      for(const c of columns){
        const col=columnNo(attr(c,'r'));
        if(col<0||col>249)continue;
        const type=attr(c,'t'),raw=first(c,'v')?.textContent??'';
        const value=type==='s'?(strings[Number(raw)]??'')
          :type==='inlineStr'?textNodes(c):raw;
        row[col]=excelCellDisplay({type,raw:value,styleIndex:attr(c,'s')||0,formatInfo});
      }
      rows[number-1]=row;
    }
    return Array.from({length:rows.length},(_,i)=>rows[i]||[]);
  }
  const preferred=sheetNames.find(x=>normalized(x)==='masterlisting')||
    sheetNames.find(x=>/master\s*listing/i.test(x))||sheetNames[0];
  return {sheetNames,preferred,readSheet,date1904:formatInfo.date1904};
}
