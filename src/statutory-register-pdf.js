/**
 * A4 landscape PDF renderer. Text is drawn with device fonts onto page JPEGs
 * then embedded into a standards-compliant PDF. No server or remote library.
 */
import {validateRegisterBook} from './statutory-register-data.js';
const enc=new TextEncoder(),B=v=>enc.encode(v);
function makePdf(images){
 const objects=[null,null],pages=[];
 const add=parts=>(objects.push(parts),objects.length);
 for(const im of images){
  const imageId=add([B('<< /Type /XObject /Subtype /Image /Width '+im.w+' /Height '+im.h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+im.bytes.length+' >>\nstream\n'),im.bytes,B('\nendstream')]);
  const cmds=B('q 842 0 0 595 0 0 cm /Image0 Do Q\n');
  const contentId=add([B('<< /Length '+cmds.length+' >>\nstream\n'),cmds,B('endstream')]);
  const pageId=add([B('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Image0 '+imageId+' 0 R >> >> /Contents '+contentId+' 0 R >>')]);
  pages.push(pageId);
 }
 objects[0]=[B('<< /Type /Catalog /Pages 2 0 R >>')];
 objects[1]=[B('<< /Type /Pages /Kids ['+pages.map(i=>i+' 0 R').join(' ')+'] /Count '+pages.length+' >>')];
 const parts=[B('%PDF-1.4\n')],offsets=[0];let offset=parts[0].length;
 for(let i=0;i<objects.length;i++){
  offsets.push(offset);
  const chunks=[B((i+1)+' 0 obj\n'),...objects[i],B('\nendobj\n')];
  parts.push(...chunks);
  for(const c of chunks)offset+=c.length;
 }
 parts.push(B('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'));
 for(let i=1;i<offsets.length;i++)parts.push(B(String(offsets[i]).padStart(10,'0')+' 00000 n \n'));
 parts.push(B('trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+offset+'\n%%EOF'));
 return new Blob(parts,{type:'application/pdf'});
}
const jpeg=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Unable to render PDF page')),'image/jpeg',0.88));
function linesFor(ctx,value,width){
 const lines=[];
 for(const p of String(value||'').split(/\r?\n/)){
  if(!p){lines.push('');continue;}
  let line='';
  for(const word of p.split(/(\s+)/)){
   if(ctx.measureText(line+word).width<=width){line+=word;continue;}
   if(line){lines.push(line.trimEnd());line='';}
   if(ctx.measureText(word).width<=width){line=word.trimStart();continue;}
   let piece='';
   for(const c of word){
    if(ctx.measureText(piece+c).width>width&&piece){lines.push(piece);piece='';}
    piece+=c;
   }
   line=piece;
  }
  lines.push(line.trimEnd());
 }
 return lines.length?lines:[''];
}
export async function buildStatutoryRegistersPdf(register,{onProgress=()=>{}}={}){
 validateRegisterBook(register);
 if(!register.sheets.length)throw Error('No worksheets to export.');
 const w=1122,h=794,s=1.45,left=36,right=w-36,bottom=h-45;
 const canvas=document.createElement('canvas');canvas.width=Math.round(w*s);canvas.height=Math.round(h*s);
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas is unavailable.');
 ctx.scale(s,s);
 const images=[];
 let pageNumber=0,y=0,section='',panel='';
 async function finish(){
  if(!pageNumber)return;
  ctx.fillStyle='#4f6378';ctx.font='12px Arial, sans-serif';ctx.textAlign='right';
  ctx.fillText('Page '+pageNumber,right,h-18);ctx.textAlign='left';
  const blob=await jpeg(canvas);
  images.push({w:canvas.width,h:canvas.height,bytes:new Uint8Array(await blob.arrayBuffer())});
  onProgress('Rendered page '+pageNumber);
  if(images.length>160)throw Error('PDF exceeds 160 pages. Split this company register.');
 }
 async function page(){
  if(pageNumber)await finish();
  pageNumber++;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#193f64';ctx.fillRect(0,0,w,6);
  ctx.font='bold 21px Arial, sans-serif';
  ctx.fillText(String(register.companyName||'Company').slice(0,92),left,44);
  ctx.fillStyle='#536b80';ctx.font='12px Arial, sans-serif';
  ctx.fillText('STATUTORY REGISTERS  |  '+String(register.registrationNo||''),left,65);
  ctx.font='bold 15px Arial, sans-serif';ctx.fillStyle='#23486b';
  ctx.fillText(section+(panel?' • '+panel:''),left,94);
  ctx.strokeStyle='#d6e2ed';ctx.beginPath();ctx.moveTo(left,104);ctx.lineTo(right,104);ctx.stroke();
  y=118;
 }
 for(const sheet of register.sheets){
  section=sheet.name;
  const cols=Math.max(1,...sheet.rows.map(r=>r.length));
  for(let start=0;start<cols;start+=7){
   const end=Math.min(start+7,cols),width=(right-left)/(end-start);
   panel=cols>7?'Columns '+(start+1)+'–'+end:'';
   await page();
   const rows=sheet.rows.filter(row=>row.some(v=>String(v).trim()));
   if(!rows.length)rows.push(['No entries']);
   for(let ri=0;ri<rows.length;ri++){
    ctx.font=(ri===0?'bold ':'')+'12px Arial, sans-serif';
    const wrapped=Array.from({length:end-start},(_,i)=>linesFor(ctx,rows[ri][start+i]||'',width-15));
    const count=Math.max(...wrapped.map(x=>x.length));
    let at=0;
    while(at<count){
     if(y+30>bottom){await page();continue;}
     const available=Math.max(1,Math.min(count-at,Math.floor((bottom-y-12)/16)));
     const height=available*16+12;
     ctx.fillStyle=ri===0?'#e7eef6':ri%2===0?'#fafcfe':'#fff';
     ctx.fillRect(left,y,right-left,height);
     ctx.strokeStyle='#dbe5ee';ctx.strokeRect(left,y,right-left,height);
     for(let j=0;j<end-start;j++){
      const x=left+j*width;
      ctx.strokeRect(x,y,width,height);
      ctx.fillStyle=ri===0?'#274968':'#1d3348';
      ctx.font=(ri===0?'bold ':'')+'12px Arial, sans-serif';
      for(let k=0;k<available;k++){
       const txt=wrapped[j][at+k];
       if(txt)ctx.fillText(txt,x+7,y+18+k*16);
      }
     }
     at+=available;y+=height;
    }
   }
  }
 }
 await finish();canvas.width=1;canvas.height=1;
 const result=makePdf(images);
 if(result.size>60*1024*1024)throw Error('Generated PDF exceeds 60 MB.');
 return result;
}
