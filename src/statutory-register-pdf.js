/**
 * Statutory Registers PDF: individual A4 portrait statutory record.
 * On-screen editor and PDF use one consistent independent register model.
 * Nothing is uploaded externally; works offline in the Android DMS.
 */
import {validateRegisterBook} from './statutory-register-data.js';
import {buildGroupedRegister,buildCombinedRegisters,STATUTORY_DOCUMENT_COLORS as C} from './statutory-register-annual-layout.js';
const enc=new TextEncoder(),B=v=>enc.encode(v);
function makePdf(images){
 const objects=[null,null],pages=[];
 function add(parts){objects.push(parts);return objects.length;}
 for(const image of images){
  const imageId=add([B('<< /Type /XObject /Subtype /Image /Width '+image.w+
    ' /Height '+image.h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+
    image.bytes.length+' >>\nstream\n'),image.bytes,B('\nendstream')]);
  const command=B('q 595.28 0 0 841.89 0 0 cm /Im0 Do Q\n');
  const contentId=add([B('<< /Length '+command.length+' >>\nstream\n'),command,B('endstream')]);
  pages.push(add([B('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 '+
   imageId+' 0 R >> >> /Contents '+contentId+' 0 R >>')]));
 }
 objects[0]=[B('<< /Type /Catalog /Pages 2 0 R >>')];
 objects[1]=[B('<< /Type /Pages /Kids ['+pages.map(id=>id+' 0 R').join(' ')+'] /Count '+pages.length+' >>')];
 const pieces=[B('%PDF-1.4\n')],offsets=[0];let pos=pieces[0].length;
 for(let i=0;i<objects.length;i++){
  offsets.push(pos);
  const chunks=[B((i+1)+' 0 obj\n'),...objects[i],B('\nendobj\n')];
  pieces.push(...chunks);for(const part of chunks)pos+=part.length;
 }
 const xref=pos;
 pieces.push(B('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'));
 for(let i=1;i<offsets.length;i++)pieces.push(B(String(offsets[i]).padStart(10,'0')+' 00000 n \n'));
 pieces.push(B('trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF'));
 return new Blob(pieces,{type:'application/pdf'});
}
function wrap(ctx,value,maxWidth){
 const lines=[];
 for(const para of String(value??'').split(/\r?\n/)){
  if(!para){lines.push('');continue;}
  let line='';
  for(const word of para.split(/(\s+)/)){
   if(ctx.measureText(line+word).width<=maxWidth){line+=word;continue;}
   if(line){lines.push(line.trimEnd());line='';}
   if(ctx.measureText(word).width<=maxWidth){line=word.trimStart();continue;}
   let chars='';
   for(const ch of word){
    if(chars&&ctx.measureText(chars+ch).width>maxWidth){lines.push(chars);chars='';}
    chars+=ch;
   }
   line=chars;
  }
  lines.push(line.trimEnd());
 }
 return lines.length?lines:[''];
}
function jpeg(canvas){
 return new Promise((res,rej)=>canvas.toBlob(blob=>blob?res(blob):rej(Error('PDF canvas could not be encoded.')),'image/jpeg',0.88));
}
export async function buildStatutoryRegistersPdf(book,{sheetIndex=0,combined=false,onProgress=()=>{},showBlanks=false}={}){
 validateRegisterBook(book);
 const sections=combined?buildCombinedRegisters(book,{showBlanks}):[buildGroupedRegister(book,sheetIndex,{showBlanks})];
 if(!sections.length)throw Error('No statutory registers are available for export.');
 let activeTitle=sections[0].title;
 const W=794,H=1123,S=1.4,LM=44,RM=W-44,BOTTOM=H-72;
 const ctxCanvas=document.createElement('canvas');
 ctxCanvas.width=Math.round(W*S);ctxCanvas.height=Math.round(H*S);
 const ctx=ctxCanvas.getContext('2d');
 if(!ctx)throw Error('Canvas rendering is not supported in this device.');
 ctx.scale(S,S);
 const images=[];
 let y=0,number=0,section='',pageHasSection=false;
 function setFont(weight=400,size=13){
  ctx.font=weight+' '+size+'px Arial, "Microsoft YaHei", "Noto Sans", sans-serif';
 }
 function text(value,x,yy,color=C.ink){
  ctx.fillStyle=color;ctx.fillText(String(value??''),x,yy);
 }
 function background(color,x,yy,w,h){
  ctx.fillStyle=color;ctx.fillRect(x,yy,w,h);
 }
 function stroke(x,yy,w,h){
  ctx.strokeStyle=C.line;ctx.lineWidth=1;ctx.strokeRect(x+.5,yy+.5,w,h);
 }
 async function finishPage(){
  if(!number)return;
  ctx.textAlign='left';setFont(500,10);
  ctx.strokeStyle=C.line;ctx.beginPath();ctx.moveTo(LM,H-56);ctx.lineTo(RM,H-56);ctx.stroke();
  text('ZHENLI · STATUTORY REGISTERS',LM,H-35,C.muted);
  ctx.textAlign='right';text('Page '+number,RM,H-35,C.muted);ctx.textAlign='left';
  const blob=await jpeg(ctxCanvas);
  images.push({w:ctxCanvas.width,h:ctxCanvas.height,bytes:new Uint8Array(await blob.arrayBuffer())});
  if(images.length>200)throw Error('PDF exceeds 200 pages. Export the statutory records in smaller parts.');
  onProgress('Rendered '+activeTitle+' PDF page '+number);
 }
 async function newPage(){
  if(number)await finishPage();
  number++;pageHasSection=false;
  background(C.white,0,0,W,H);
  background(C.navy,0,0,W,6);
  setFont(750,10);
  text('ZHENLI · STATUTORY REGISTERS · COMPANY PARTICULARS',LM,40,C.blue);
  setFont(750,21);
  const names=wrap(ctx,book.companyName||'Company Name',RM-LM);
  for(let i=0;i<Math.min(2,names.length);i++)text(names[i],LM,73+i*24,C.navy);
  let gap=Math.min(2,names.length)-1;
  setFont(700,12);text(activeTitle.toUpperCase(),LM,105+gap*24,C.muted);
  background(C.light,LM,120+gap*24,RM-LM,38);
  setFont(700,11);text('Company Registration No.',LM+12,144+gap*24,C.navy);
  setFont(600,12);ctx.textAlign='right';
  text(book.registrationNo||'Not provided',RM-12,144+gap*24,C.ink);ctx.textAlign='left';
  y=178+gap*24;
 }
 async function ensure(height){
  if(y+height>BOTTOM)await newPage();
 }
 async function drawSection(title){
  section=title;const height=40;
  await ensure(height+18);
  background(C.navy,LM,y,RM-LM,height);
  setFont(700,15);text(title,LM+14,y+26,C.white);
  y+=height+10;pageHasSection=true;
 }
 async function drawRecord(title,status){
  setFont(700,12);
  const titleLines=wrap(ctx,title,RM-LM-180);
  const height=Math.max(36,titleLines.length*17+12);
  await ensure(height+6);
  background(C.light,LM,y,RM-LM,height);
  ctx.fillStyle=C.navy;
  for(let i=0;i<titleLines.length;i++)ctx.fillText(titleLines[i],LM+10,y+22+i*17);
  if(status){
   setFont(600,10);ctx.textAlign='right';
   text(status,RM-12,y+22,C.muted);ctx.textAlign='left';
  }
  y+=height+5;
 }
 async function drawNote(value){
  setFont(400,12);const lines=wrap(ctx,value,RM-LM-24);
  const h=Math.max(35,lines.length*18+16);
  await ensure(h);
  background(C.label,LM,y,RM-LM,h);stroke(LM,y,RM-LM,h);
  for(let i=0;i<lines.length;i++)text(lines[i],LM+12,y+22+i*18,C.muted);
  y+=h;
 }
 async function drawField(label,value){
  const labelW=260,outerW=RM-LM,valueW=outerW-labelW;
  setFont(700,12);const labels=wrap(ctx,label,labelW-25);
  setFont(400,13);const values=wrap(ctx,String(value??'')||' ',valueW-26);
  const total=Math.max(labels.length,values.length);
  let offset=0;
  while(offset<total){
   const availableHeight=BOTTOM-y-5;
   if(availableHeight<40){await newPage();await drawSection(section+' (continued)');continue;}
   const maxLines=Math.max(1,Math.floor((availableHeight-20)/18));
   const count=Math.min(total-offset,maxLines);
   const height=Math.max(43,count*18+17);
   if(y+height>BOTTOM){await newPage();await drawSection(section+' (continued)');continue;}
   background(C.label,LM,y,labelW,height);
   background(C.white,LM+labelW,y,valueW,height);
   stroke(LM,y,labelW,height);stroke(LM+labelW,y,valueW,height);
   setFont(700,12);
   for(let j=0;j<count;j++){
    const entry=labels[offset+j];
    if(entry!==undefined)text(entry,LM+12,y+21+j*18,C.ink);
   }
   setFont(400,13);
   for(let j=0;j<count;j++){
    const entry=values[offset+j];
    if(entry!==undefined)text(entry,LM+labelW+12,y+21+j*18,C.ink);
   }
   y+=height;offset+=count;
  }
 }
 try{
  await newPage();
  for(let index=0;index<sections.length;index++){
   const part=sections[index];
   activeTitle=part.title;
   if(index>0){await newPage();}
   await drawSection(part.title);
   for(const block of part.blocks){
    if(block.type==='field')await drawField(block.label,block.value);
    else if(block.type==='record')await drawRecord(block.title,block.status);
    else if(block.type==='note')await drawNote(block.text);
   }
   y+=18;
  }
  await finishPage();
  const pdf=makePdf(images);
  if(pdf.size>60*1024*1024)throw Error('The generated PDF exceeds the 60 MB Android save limit.');
  return pdf;
 }finally{
  ctxCanvas.width=1;ctxCanvas.height=1;
 }
}
