import html2canvas from 'html2canvas';
import {jsPDF} from 'jspdf';
import {Capacitor} from '@capacitor/core';
import {Filesystem,Directory} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {outputFilename,showMemberField} from './core.js';
import {savePdfToAndroidFiles} from './native-pdf-save.js';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const blank=value=>String(value??'').trim()||'NOT PROVIDED / 未提供资料';
let currentLink='';
export function releaseDownload(){
  if(currentLink){URL.revokeObjectURL(currentLink);currentLink='';}
}
export function exposeDownload(blob,name){
  releaseDownload();
  currentLink=URL.createObjectURL(blob);
  const link=document.getElementById('download-link');
  const box=document.getElementById('download-box');
  document.getElementById('download-name').textContent=name;
  link.href=currentLink;link.download=name;
  // Native Android WebViews cannot reliably download blob: links.
  link.hidden=Capacitor.isNativePlatform()||window.parent!==window;
  box.hidden=false;
  return currentLink;
}
async function b64(blob){
  return await new Promise((res,rej)=>{
    const reader=new FileReader();
    reader.onerror=()=>rej(Error('Could not prepare PDF for Android sharing.'));
    reader.onload=()=>res(String(reader.result||'').split(',')[1]||'');
    reader.readAsDataURL(blob);
  });
}
function requestDmsSave(blob,filename){
 return new Promise((resolve,reject)=>{
  const id='ar_pdf_'+Date.now()+'_'+Math.random().toString(36).slice(2,9);
  const time=setTimeout(()=>{window.removeEventListener('message',onReply);reject(Error('DMS Save As timed out. Tap Save PDF to Files and try again.'));},300000);
  function onReply(event){
   if(event.source!==window.parent||event.origin!==window.location.origin||
      event.data?.type!=='ZHENLI_DMS_AR_PDF_SAVED'||event.data?.id!==id)return;
   clearTimeout(time);window.removeEventListener('message',onReply);
   if(event.data.ok)resolve(event.data.note||'Saved PDF.');
   else reject(Error(event.data.error||'DMS could not save PDF.'));
  }
  window.addEventListener('message',onReply);
  window.parent.postMessage({type:'ZHENLI_DMS_AR_SAVE_PDF',id,filename,blob},window.location.origin);
 });
}
export async function savePdf(blob,name,{share=false}={}){
 if(window.parent!==window){
  // Same-origin DMS iframe: only its parent has the native Capacitor bridge.
  // Never open a blob: URL inside the Android WebView as a "download".
  return await requestDmsSave(blob,name);
 }
 if(Capacitor.isNativePlatform()){
  if(share){
   const {uri}=await Filesystem.writeFile({path:'annual-return/'+Date.now()+'-'+name,
      directory:Directory.Cache,recursive:true,data:await b64(blob)});
   await Share.share({title:name,url:uri,dialogTitle:'Share Annual Return PDF'});
   return 'Share panel opened. Sharing is separate from saving the PDF.';
  }
  const saved=await savePdfToAndroidFiles(blob,name);
  return 'PDF saved successfully to your selected Android folder as '+saved.filename+'. Open Files → Downloads or your chosen location.';
 }
 if(share&&typeof navigator.share==='function'){
  const file=new File([blob],name,{type:'application/pdf'});
  if(!navigator.canShare||navigator.canShare({files:[file]})){
   try{
    await navigator.share({title:name,files:[file]});
    return 'File-sharing panel opened. Choose Files or Drive to keep the PDF.';
   }catch(e){
    if(e.name==='AbortError')return 'Share cancelled. Use Direct PDF download.';
   }
  }
 }
 const link=document.getElementById('download-link');
 if(!link||!link.href)throw Error('Generate the PDF first to enable its download.');
 link.click();
 return 'Download requested. Open Brave Downloads or Files → Downloads. The direct PDF link remains available below.';
}
function divideValue(value,max=360){
  const str=blank(value);
  if(str.length<=max)return [str];
  const pieces=[];let remaining=str;
  while(remaining.length){
    if(remaining.length<=max){pieces.push(remaining);break;}
    let cut=remaining.lastIndexOf('\n',max);
    if(cut<max/3)cut=remaining.lastIndexOf(' ',max);
    if(cut<max/3)cut=max;
    pieces.push(remaining.slice(0,cut).trim());
    remaining=remaining.slice(cut).trim();
  }
  return pieces.length?pieces:[str];
}
function block(cls,html){
  const div=document.createElement('div');div.className=cls;div.innerHTML=html;return div;
}
export function renderPages(doc){
  const stage=document.getElementById('pdf-stage');stage.textContent='';
  const pages=[];
  function makePage(continuation=false){
    const page=document.createElement('article');page.className='pdf-sheet';
    page.innerHTML='<div class="pdf-topline"></div><div class="pdf-flow"></div><div class="pdf-bottom"><span>ZHENLI · ANNUAL RETURN PARTICULARS · REVIEW ONLY / 仅供审核</span><span class="page-number"></span></div>';
    stage.append(page);pages.push(page);
    const flow=page.querySelector('.pdf-flow');
    if(continuation)flow.append(block('pdf-kicker',escapeHtml(doc.company.name||'COMPANY')+' — '+escapeHtml(doc.company.arYear||'')+' / CONTINUED 续页'));
    return flow;
  }
  let flow=makePage();
  let inTable=false;
  function push(node){
    flow.append(node);
    if(flow.scrollHeight>938 && flow.childElementCount>1){
      node.remove();flow=makePage(true);flow.append(node);inTable=false;
    }
  }
  function header(){
    const el=block('pdf-tablehead','<div>PARTICULARS / 项目</div><div>CURRENT INFORMATION / 现有资料</div>');
    push(el);inTable=true;
  }
  function section(title,cn,type){
    inTable=false;
    push(block(type==='section'?'pdf-section':'pdf-heading',escapeHtml(title)+' / '+escapeHtml(cn)));
  }
  push(block('pdf-title','<h1>'+escapeHtml(doc.company.name||'COMPANY NAME TO CONFIRM')+
    ' — ANNUAL RETURN '+escapeHtml(doc.company.arYear||'')+'</h1><div class="pdf-kicker">ANNUAL RETURN PARTICULARS REVIEW / 周年申报资料审核</div>'));
  // Company Details is the first particulars section below; avoid a duplicate profile table.
  for(const [itemIndex,item] of doc.particulars.entries()){
    if(!showMemberField(doc.particulars,itemIndex))continue;
    if(item.type==='section'||item.type==='heading'){
      section(item.en,item.cn,item.type);continue;
    }
    if(item.type!=='field')continue;
    if(!inTable)header();
    const parts=divideValue(item.value);
    for(const [index,value] of parts.entries()){
      const label=(item.en||'Unnamed item')+(parts.length>1?' ('+(index+1)+'/'+parts.length+')':'');
      const node=block('pdf-row','<div class="pdf-left">'+escapeHtml(label)+' / '+escapeHtml(item.cn||'')+'</div>'+
        '<div class="'+(value==='NOT PROVIDED / 未提供资料'?'pdf-empty':'')+'">'+escapeHtml(value)+'</div>');
      const prior=flow;
      push(node);
      if(prior!==flow){
        // Provide table headers whenever a continued field spills onto the next page.
        const h=block('pdf-tablehead','<div>PARTICULARS / 项目</div><div>CURRENT INFORMATION / 现有资料</div>');
        flow.insertBefore(h,node);
        inTable=true;
      }
    }
  }
  inTable=false;
  const sign=doc.signatureDirector||{};
  const confirmation=block('pdf-confirm',
    '<h2>DIRECTOR CONFIRMATION / 董事确认</h2>'+
    '<p>I hereby confirm that the particulars in this document are true and correct to the best of my knowledge, subject to verification of any noted or missing information.</p>'+
    '<p>本人谨此确认，据本人所知，本文件所载资料属真实及正确；待核实或未提供资料须另行确认。</p>'+
    '<div class="pdf-signature">Signature of Director / 董事签名</div>'+
    '<p><b>Capacity / 职务:</b> '+escapeHtml(sign.designation||'Director')+'</p>'+
    '<p><b>Name / 姓名:</b> '+escapeHtml(blank(sign.name))+'</p>'+
    '<p><b>NRIC / Passport No. / 身份证或护照号码:</b> '+escapeHtml(blank(sign.nric))+'</p>'+
    '<p class="pdf-note">For review and confirmation only. This document does not replace the prescribed Annual Return lodged with SSM. / 本文件仅供审核及确认，不能代替向马来西亚公司委员会提交的法定周年申报。</p>');
  push(confirmation);
  pages.forEach((p,i)=>p.querySelector('.page-number').textContent='PAGE '+(i+1)+' / '+pages.length);
  return pages;
}
export async function buildPdf(doc,onProgress=()=>{}){
  const pages=renderPages(doc);
  if(!pages.length)throw Error('No pages to export.');
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  const scale=Capacitor.isNativePlatform()?1.15:1.5;
  try{
    for(let i=0;i<pages.length;i++){
      onProgress('Rendering PDF page '+(i+1)+' of '+pages.length+'…');
      await new Promise(r=>setTimeout(r,0));
      const canvas=await html2canvas(pages[i],{scale,backgroundColor:'#ffffff',logging:false,
        useCORS:false,windowWidth:794,scrollX:0,scrollY:0});
      if(i)pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg',0.87),'JPEG',0,0,210,297,undefined,'FAST');
      canvas.width=1;canvas.height=1;
    }
    onProgress('Preparing downloadable PDF…');
    return {blob:pdf.output('blob'),filename:outputFilename(doc),pages:pages.length};
  }finally{
    document.getElementById('pdf-stage').textContent='';
  }
}
