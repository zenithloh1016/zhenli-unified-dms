/**
 * ZHENLI Office editor: targeted changes to OOXML .docx and .xlsx files.
 * Retains unedited ZIP parts (images, formatting, workbook formula metadata,
 * relationships) rather than rebuilding a document with a lossy converter.
 * Editing runs in the authenticated browser/device; no third-party editor server.
 */
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';

const MAX_FILE=24*1024*1024;
const MAX_ITEMS=40000;
const SS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG='http://schemas.openxmlformats.org/package/2006/relationships';
const XLSX_TYPES=/\.xlsx$/i,DOCX_TYPES=/\.docx$/i;
const nodes=(root,tag)=>Array.from(root.getElementsByTagNameNS('*',tag));
const first=(root,tag)=>nodes(root,tag)[0]||null;
const attr=(el,name)=>el?.getAttribute(name)||'';
const t=(el)=>el?.textContent||'';
function parsePart(bytes,name){
 if(!bytes)throw Error('Office document component is missing: '+name);
 if(bytes.length>25*1024*1024)throw Error('Office XML component is too large: '+name);
 const xml=new DOMParser().parseFromString(strFromU8(bytes),'application/xml');
 if(nodes(xml,'parsererror').length)throw Error('The Office document XML is damaged: '+name);
 return xml;
}
function pathForSheet(target){
 const dest=String(target||'').replace(/\\/g,'/').replace(/^\/+/,'');
 const full=dest.startsWith('xl/')?dest:'xl/'+dest;
 const stack=[];
 for(const part of full.split('/')){
  if(part==='..')stack.pop();
  else if(part!=='.'&&part)stack.push(part);
 }
 const out=stack.join('/');
 if(!out.startsWith('xl/')||!out.endsWith('.xml'))throw Error('Invalid worksheet reference.');
 return out;
}
const cellAddress=(row,col)=>{
 let n=col+1,s='';
 while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}
 return s+row;
};
export function excelColumnIndex(address){
 const m=/^([A-Z]+)[1-9]\d*$/i.exec(String(address||''));if(!m)return -1;
 return m[1].toUpperCase().split('').reduce((a,ch)=>a*26+ch.charCodeAt(0)-64,0)-1;
}
function readValue(cell,shared){
 const type=attr(cell,'t');
 if(type==='inlineStr')return nodes(cell,'t').map(t).join('');
 const raw=t(first(cell,'v'));
 if(type==='s')return shared[Number(raw)]??raw;
 if(type==='b')return raw==='1'?'TRUE':'FALSE';
 if(type==='e')return raw;
 const formula=first(cell,'f');
 if(formula)return '='+t(formula);
 return raw;
}
function loadWorkbook(zip){
 const workbook=parsePart(zip['xl/workbook.xml'],'workbook.xml');
 const rel=parsePart(zip['xl/_rels/workbook.xml.rels'],'workbook.xml.rels');
 const relationships=new Map(nodes(rel,'Relationship').map(x=>[attr(x,'Id'),attr(x,'Target')]));
 let shared=[];
 if(zip['xl/sharedStrings.xml']){
  const xml=parsePart(zip['xl/sharedStrings.xml'],'sharedStrings.xml');
  shared=nodes(xml,'si').map(el=>nodes(el,'t').map(t).join(''));
 }
 const sheets=nodes(workbook,'sheet').map((s,i)=>{
  const relationshipId=s.getAttributeNS(R,'id')||attr(s,'r:id');
  const target=relationships.get(relationshipId);
  if(!target)throw Error('Worksheet relationship is missing for '+attr(s,'name'));
  const path=pathForSheet(target);
  const doc=parsePart(zip[path],path);
  const cells=new Map();
  let maxRow=1,maxCol=1;
  for(const cell of nodes(doc,'c')){
   const ref=attr(cell,'r').toUpperCase();
   const match=/^([A-Z]+)(\d+)$/.exec(ref);if(!match)continue;
   const row=Number(match[2]),col=excelColumnIndex(ref);
   if(row<1||row>1000000||col<0||col>=16384)continue;
   cells.set(ref,readValue(cell,shared));
   maxRow=Math.max(maxRow,row);maxCol=Math.max(maxCol,col+1);
  }
  return {name:attr(s,'name')||'Sheet '+(i+1),path,xml:doc,cells,maxRow,maxCol,edits:new Map()};
 });
 if(!sheets.length)throw Error('This Excel file has no readable worksheets.');
 return sheets;
}
function loadWord(zip){
 const document=parsePart(zip['word/document.xml'],'word/document.xml');
 const paragraphs=[];
 for(const p of nodes(document,'p')){
  // Keep fields (TOC, calculations, etc.) intact and read-only.
  const editable=nodes(p,'t').length>0&&!nodes(p,'fldChar').length&&!nodes(p,'instrText').length;
  const original=nodes(p,'t').map(t).join('');
  if(!original.trim())continue;
  if(paragraphs.length>=MAX_ITEMS)throw Error('Word document contains too many paragraphs for the basic editor.');
  paragraphs.push({element:p,text:original,original,editable});
 }
 return {xml:document,paragraphs};
}
export async function openOfficeDocument(blob,filename){
 const name=String(filename||'');
 if(!XLSX_TYPES.test(name)&&!DOCX_TYPES.test(name))
  throw Error('Editing supports .xlsx and .docx files. Download legacy .xls or .doc files and convert them in Microsoft Office or LibreOffice first.');
 if(!blob?.size||blob.size>MAX_FILE)throw Error('Please select a nonempty Office document smaller than 24 MB for the in-app editor.');
 let zip;try{zip=unzipSync(new Uint8Array(await blob.arrayBuffer()));}
 catch{throw Error('The Office document is not a valid DOCX/XLSX ZIP package.');}
 const type=XLSX_TYPES.test(name)?'xlsx':'docx';
 if(type==='xlsx'&&!zip['xl/workbook.xml'])throw Error('Workbook data not found. Password-protected or unsupported Excel format.');
 if(type==='docx'&&!zip['word/document.xml'])throw Error('Word document data not found. Password-protected or unsupported Word format.');
 return {filename:name,type,zip,dirty:false,editedCount:0,
  ...(type==='xlsx'?{sheets:loadWorkbook(zip),activeSheet:0,startRow:1}:{word:loadWord(zip)})};
}
export function officeCellValue(model,row,col){
 const sheet=model?.sheets?.[model.activeSheet];
 const ref=cellAddress(row,col);
 return sheet?.edits.has(ref)?sheet.edits.get(ref):sheet?.cells.get(ref)||'';
}
export function officeEditCell(model,row,col,value){
 if(model?.type!=='xlsx')throw Error('The document is not an Excel workbook.');
 if(!Number.isSafeInteger(row)||row<1||row>1000000||!Number.isSafeInteger(col)||col<0||col>=16384)
  throw Error('Invalid Excel cell address.');
 const sheet=model.sheets[model.activeSheet],ref=cellAddress(row,col);
 const original=sheet.cells.get(ref)||'';
 const val=String(value??'').slice(0,10000);
 if(val===original)sheet.edits.delete(ref);
 else sheet.edits.set(ref,val);
 sheet.maxRow=Math.max(sheet.maxRow,row);sheet.maxCol=Math.max(sheet.maxCol,col+1);
 model.editedCount=model.sheets.reduce((n,s)=>n+s.edits.size,0);
 model.dirty=model.editedCount>0;
 return {ref,changed:sheet.edits.has(ref)};
}
export function officeEditParagraph(model,index,value){
 const p=model?.word?.paragraphs?.[index];if(!p?.editable)throw Error('This paragraph is read-only.');
 p.text=String(value??'').replace(/\r?\n/g,' ').slice(0,10000);
 model.editedCount=model.word.paragraphs.filter(x=>x.text!==x.original).length;
 model.dirty=model.editedCount>0;
 return model.editedCount;
}
function directChild(el,tag){
 return Array.from(el?.childNodes||[]).find(n=>n.nodeType===1&&n.localName===tag)||null;
}
function makeCellValue(xml,cell,value){
 for(const child of Array.from(cell.childNodes)){
  if(child.nodeType===1&&['f','v','is'].includes(child.localName))cell.removeChild(child);
 }
 // Use inline strings to avoid modifying sharedStrings, preserving all other entries.
 const numeric=/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value)&&value.length<16&&!/^0\d/.test(value);
 if(value.startsWith('=')&&value.length>1){
  cell.removeAttribute('t');
  const formula=xml.createElementNS(SS,'f');formula.textContent=value.slice(1);cell.appendChild(formula);
  const cached=xml.createElementNS(SS,'v');cached.textContent='';cell.appendChild(cached);
 }else if(numeric){
  cell.removeAttribute('t');
  const el=xml.createElementNS(SS,'v');el.textContent=value;cell.appendChild(el);
 }else{
  cell.setAttribute('t','inlineStr');
  const inline=xml.createElementNS(SS,'is'),text=xml.createElementNS(SS,'t');
  if(/^\s|\s$/.test(value))text.setAttribute('xml:space','preserve');
  text.textContent=value;inline.appendChild(text);cell.appendChild(inline);
 }
}
function applySheet(sheet){
 const xml=sheet.xml;
 const sheetData=first(xml,'sheetData');
 if(!sheetData)throw Error('Worksheet data is missing in '+sheet.name);
 const sorted=[...sheet.edits].sort(([a],[b])=>{
  const ra=Number(a.match(/\d+$/)[0]),rb=Number(b.match(/\d+$/)[0]);
  return ra-rb||excelColumnIndex(a)-excelColumnIndex(b);
 });
 for(const [ref,value] of sorted){
  const rowNumber=Number(ref.match(/\d+$/)[0]),col=excelColumnIndex(ref);
  const rows=Array.from(sheetData.childNodes).filter(x=>x.nodeType===1&&x.localName==='row');
  let row=rows.find(x=>Number(attr(x,'r'))===rowNumber);
  if(!row){
   row=xml.createElementNS(SS,'row');row.setAttribute('r',String(rowNumber));
   const next=rows.find(x=>Number(attr(x,'r'))>rowNumber);
   sheetData.insertBefore(row,next||null);
  }
  const entries=Array.from(row.childNodes).filter(x=>x.nodeType===1&&x.localName==='c');
  let cell=entries.find(x=>attr(x,'r').toUpperCase()===ref);
  if(!cell){
   cell=xml.createElementNS(SS,'c');cell.setAttribute('r',ref);
   const next=entries.find(x=>excelColumnIndex(attr(x,'r'))>col);
   row.insertBefore(cell,next||null);
  }
  makeCellValue(xml,cell,value);
 }
}
function applyWord(model){
 for(const p of model.word.paragraphs){
  if(p.text===p.original)continue;
  const texts=nodes(p.element,'t');
  if(!texts.length)continue;
  // Preserve paragraph formatting, tables, images and all surrounding document parts.
  // A changed paragraph loses run-level styling within that paragraph only.
  texts[0].textContent=p.text;
  texts[0].setAttribute('xml:space','preserve');
  for(let i=1;i<texts.length;i++)texts[i].textContent='';
 }
}
export function exportOfficeDocument(model,{allowUnchanged=false}={}){
 if(!model)throw Error('No Office document open.');
 if(!model.dirty&&!allowUnchanged)throw Error('There are no edits to save.');
 // Important: render EVERY revision from the original OOXML bytes.
 // Reusing mutated model.zip would fail when a cell is edited and then
 // reverted to its original value in a subsequent autosave.
 const output=Object.fromEntries(Object.entries(model.zip).map(([p,bytes])=>[p,bytes.slice()]));
 if(model.type==='xlsx'){
  if(model.dirty){
   const sheets=loadWorkbook(output);
   for(let i=0;i<model.sheets.length;i++){
    const originalSheet=model.sheets[i];
    const staged=sheets[i];
    if(!staged||!originalSheet.edits.size)continue;
    staged.edits=new Map(originalSheet.edits);
    applySheet(staged);
    output[staged.path]=strToU8(new XMLSerializer().serializeToString(staged.xml));
   }
  }
 }else if(model.type==='docx'){
  if(model.dirty){
   const word=loadWord(output);
   if(word.paragraphs.length!==model.word.paragraphs.length)throw Error('Word paragraph structure unexpectedly changed.');
   for(let i=0;i<word.paragraphs.length;i++)word.paragraphs[i].text=model.word.paragraphs[i].text;
   applyWord({word});
   output['word/document.xml']=strToU8(new XMLSerializer().serializeToString(word.xml));
  }
 }else throw Error('Unsupported Office document type.');
 const bytes=zipSync(output,{level:4});
 if(bytes.byteLength>50*1024*1024)throw Error('Edited Office document exceeds the DMS 50 MB upload limit.');
 return new Blob([bytes],{type:model.type==='xlsx'?
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
export function makePreviousVersionName(name,now=new Date()){
 const stamp=now.toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15);
 return String(name).replace(/(\.[^.]+)$/,' (previous '+stamp+')$1');
}
