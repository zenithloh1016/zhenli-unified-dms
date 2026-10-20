import {parseRegisterBookText} from './register-book.js';

const MAX_FILE=30*1024*1024;
async function extractPdf(data){
 const pdfjs=await import('pdfjs-dist/build/pdf.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).href;
 const task=pdfjs.getDocument({data:new Uint8Array(data),isEvalSupported:false,stopAtErrors:true});
 const pdf=await task.promise;
 if(pdf.numPages>100){await pdf.destroy();throw Error('Register Book has over 100 pages. Please import a smaller file.');}
 const pages=[];
 try{
  for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i);
   const raw=await page.getTextContent();
   const items=raw.items.filter(x=>x?.str?.trim()).map(x=>({text:x.str,x:Number(x.transform?.[4]||0),y:Number(x.transform?.[5]||0)}));
   items.sort((a,b)=>Math.abs(b.y-a.y)>2?b.y-a.y:a.x-b.x);
   const lines=[];
   for(const item of items){
    const prev=lines.at(-1);
    if(prev&&Math.abs(item.y-prev.y)<=2.5)prev.items.push(item);
    else lines.push({y:item.y,items:[item]});
   }
   pages.push(lines.map(l=>l.items.sort((a,b)=>a.x-b.x).map(x=>x.text).join(' ')).join('\n'));
   page.cleanup();
  }
 }finally{await pdf.destroy();}
 const text=pages.join('\n');
 if(text.replace(/\s/g,'').length<35)throw Error('No selectable text was found in this PDF. A scanned/image-only Register Book requires OCR or a text-based PDF.');
 if(text.length>2_000_000)throw Error('PDF contains too much text to process.');
 return {text,pages:pages.length};
}
const sameCompany=(a,b)=>String(a||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===String(b||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export async function loadRegisterBook(file,{companyName=''}={}){
 if(!file||file.size>MAX_FILE)throw Error('Select a Register Book PDF, TXT or ZIP file no larger than 30 MB.');
 const name=file.name.toLowerCase();
 if(name.endsWith('.pdf')){
  const read=await extractPdf(await file.arrayBuffer());
  return {register:parseRegisterBookText(read.text),source:file.name,pages:read.pages};
 }
 if(name.endsWith('.txt')){
  const text=await file.text();
  return {register:parseRegisterBookText(text),source:file.name,pages:null};
 }
 if(name.endsWith('.zip')){
  const {unzipSync}=await import('fflate');
  const entries=unzipSync(new Uint8Array(await file.arrayBuffer()));
  const candidates=Object.entries(entries).filter(([path,bytes])=>/\.pdf$/i.test(path)&&!path.startsWith('__MACOSX/')&&bytes.length<MAX_FILE);
  if(!candidates.length)throw Error('The ZIP contains no supported PDFs. Export the Register Book as PDF first.');
  if(candidates.length>35)throw Error('The ZIP contains too many PDFs. Select one Register Book PDF.');
  const choices=[];
  for(const [path,bytes] of candidates){
   try{
    const read=await extractPdf(bytes);
    const register=parseRegisterBookText(read.text);
    if(register.company.name||register.directors.length||register.members.length)
     choices.push({register,source:path,pages:read.pages});
   }catch{/* Ignore non-register PDFs contained in archives. */}
  }
  if(!choices.length)throw Error('No text-based Register Book PDF could be identified in the ZIP.');
  if(companyName){
   const matched=choices.filter(x=>sameCompany(x.register.company.name,companyName));
   if(matched.length===1)return matched[0];
   if(matched.length>1)throw Error('Multiple matching Register Books were found. Please select one PDF.');
  }
  if(choices.length===1)return choices[0];
  throw Error('ZIP contains multiple companies or Register Books. Extract the ZIP and select the correct company PDF.');
 }
 throw Error('Unsupported format. Select PDF, text PDF within ZIP, or TXT.');
}
