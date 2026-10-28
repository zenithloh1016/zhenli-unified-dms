import html2canvas from 'html2canvas';
import {jsPDF} from 'jspdf';
import {Capacitor} from '@capacitor/core';
import {Filesystem,Directory} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {outputFilename,showMemberField,displayParticularLabel} from './core.js';
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
  link.hidden=Capacitor.isNativePlatform(); // Keep browser/desktop fallback visible inside UNICOSEC iframe.
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
  // The parent owns Android's native picker and the desktop browser download.
  // Keep the direct-download link visible for a manual fallback on website/Windows.
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
// Keep long text inside bounded table rows instead of allowing a tall
// textarea value to spill below the footer or disappear at a page boundary.
function divideValue(value,max=230){
 const raw=blank(value),pieces=[];
 let remaining=raw;
 while(remaining.length>max){
  let cut=remaining.lastIndexOf('\n',max);
  if(cut<max/3)cut=remaining.lastIndexOf(' ',max);
  if(cut<max/3)cut=max;
  pieces.push(remaining.slice(0,cut).trim());
  remaining=remaining.slice(cut).trim();
 }
 if(remaining)pieces.push(remaining);
 return pieces.length?pieces:[raw];
}
const pageEsc=escapeHtml;
function tableRow(kind,english,chinese,value='',continuation=''){
 const row=document.createElement('tr');
 row.className='pdf-'+kind+'-row';
 if(kind==='section'||kind==='heading'){
  row.innerHTML='<th colspan="2" scope="colgroup"><span class="pdf-row-name">'+pageEsc(english||'Untitled')+'</span>'+
   (chinese?'<span class="pdf-row-translation">'+pageEsc(chinese)+'</span>':'')+'</th>';
 }else if(kind==='note'){
  row.innerHTML='<td colspan="2">'+value+'</td>';
 }else{
  const isBlank=value==='NOT PROVIDED / 未提供资料';
  row.innerHTML='<th scope="row"><span class="pdf-row-name">'+pageEsc(english||'Unnamed field')+'</span>'+
   (chinese?'<span class="pdf-row-translation">'+pageEsc(chinese)+'</span>':'')+
   (continuation?'<span class="pdf-row-continuation">'+pageEsc(continuation)+'</span>':'')+
   '</th><td class="pdf-cell-value'+(isBlank?' pdf-empty':'')+'">'+pageEsc(value)+'</td>';
 }
 return row;
}
export function renderPages(doc){
 const stage=document.getElementById('pdf-stage');
 if(!stage)throw Error('Annual Return PDF preview surface is missing.');
 stage.textContent='';
 const pages=[];
 let page=null,tableBody=null;
 const company=doc.company||{};
 const HEADER_EN='PARTICULARS / ITEM';
 const HEADER_CN='项目';
 const VALUE_EN='CURRENT INFORMATION / DETAILS';
 const VALUE_CN='现有资料';
 // Pixel dimensions correspond to an A4 sheet at 96 CSS pixels per inch.
 // Keep a gap above the footer; the bottommost table border is never clipped.
 const TABLE_BOTTOM=1033;
 function createPage(continuation=false){
  page=document.createElement('article');
  page.className='pdf-sheet';
  const companyName=pageEsc(company.name||'COMPANY NAME TO CONFIRM');
  const year=pageEsc(company.arYear||'YEAR TO CONFIRM');
  const reg=pageEsc(company.no||'REGISTRATION NO. TO CONFIRM');
  page.innerHTML=
   '<header class="pdf-page-head">'+
    '<div class="pdf-brandline"><span class="pdf-brand-mark">U</span><span class="pdf-brand-name">UNICOSEC</span>'+
     '<span class="pdf-brand-note">ANNUAL RETURN REVIEW / 周年申报资料审核</span></div>'+
    '<div class="pdf-company-line"><strong>'+companyName+'</strong></div>'+
    '<div class="pdf-document-subline"><span>Registration No. / 注册号码: '+reg+'</span>'+
     '<span>Annual Return Year / 年份: '+year+'</span>'+
     (continuation?'<span class="pdf-continued">CONTINUED / 续页</span>':'')+'</div>'+
   '</header>'+
   '<div class="pdf-flow"><table class="pdf-particulars-table">'+
    '<colgroup><col class="pdf-label-column"/><col class="pdf-value-column"/></colgroup>'+
    '<thead><tr><th scope="col"><span>'+HEADER_EN+'</span><small>'+HEADER_CN+'</small></th>'+
    '<th scope="col"><span>'+VALUE_EN+'</span><small>'+VALUE_CN+'</small></th></tr></thead>'+
    '<tbody></tbody></table></div>'+
   '<footer class="pdf-bottom"><span>UNICOSEC · CLIENT REVIEW ONLY / 仅供客户审核</span>'+
    '<span class="page-number"></span></footer>';
  stage.appendChild(page);
  pages.push(page);
  tableBody=page.querySelector('tbody');
  return page;
 }
 function fitsRow(row,headroom=0){
  // Measure real HTML table geometry, not estimated character counts.
  const pageBox=page.getBoundingClientRect(),rowBox=row.getBoundingClientRect();
  return rowBox.bottom-pageBox.top+headroom<=TABLE_BOTTOM;
 }
 function appendRow(row,reserveNext=0){
  tableBody.appendChild(row);
  if(fitsRow(row,reserveNext))return;
  row.remove();
  // Always repeat the table's full column header at a page break.
  createPage(true);
  tableBody.appendChild(row);
  if(!fitsRow(row))throw Error('One Annual Return table row is too large for an A4 page. Shorten the value and retry.');
 }
 createPage(false);
 // Retain the precise field order the user arranged in UNICOSEC, including
 // custom bilingual headings and individually added or removed fields.
 for(const [index,item] of (doc.particulars||[]).entries()){
  if(!showMemberField(doc.particulars,index))continue;
  if(item.type==='section'||item.type==='heading'){
   appendRow(tableRow(item.type,displayParticularLabel(item),displayParticularLabel(item,'cn')),
    item.type==='section'?72:50);
   continue;
  }
  if(item.type!=='field')continue;
  const parts=divideValue(item.value);
  parts.forEach((part,i)=>{
   const continued=parts.length>1?'Part '+(i+1)+' of '+parts.length:'';
   appendRow(tableRow('field',displayParticularLabel(item),displayParticularLabel(item,'cn'),part,continued));
  });
 }
 // Director confirmation uses the same table, borders, fonts and spacing as
 // every other section. This also keeps it within the same pagination rules.
 appendRow(tableRow('section','DIRECTOR CONFIRMATION','董事确认'),75);
 appendRow(tableRow('note','','',
  '<p class="pdf-declaration-en">I hereby confirm that the particulars stated above are true and correct to the best of my knowledge, subject to verification of any missing or noted information.</p>'+
  '<p class="pdf-declaration-cn">本人谨此确认，据本人所知，上述资料属真实及正确；未提供或待核实之资料仍须另行确认。</p>'));
 const signer=doc.signatureDirector||{};
 appendRow(tableRow('field','Name of Director','董事姓名',blank(signer.name)));
 appendRow(tableRow('field','NRIC / Passport No.','身份证／护照号码',blank(signer.nric)));
 appendRow(tableRow('field','Capacity','职务',blank(signer.designation||'Director')));
 appendRow(tableRow('note','','',
  '<div class="pdf-signature-line"><span>Signature of Director / 董事签名:</span><span class="pdf-signature-space"></span></div>'));
 appendRow(tableRow('note','','',
  '<p class="pdf-legal-note">This document is for client review and confirmation only. It does not replace the prescribed Annual Return lodged with SSM. / 本文件仅供客户审核与确认，不能代替向马来西亚公司委员会提交的法定周年申报。</p>'));
 pages.forEach((p,i)=>{
  const number=p.querySelector('.page-number');
  if(number)number.textContent='PAGE '+(i+1)+' / '+pages.length;
 });
 return pages;
}
export async function buildPdf(doc,onProgress=()=>{}){
  const pages=renderPages(doc);
  if(!pages.length)throw Error('No pages to export.');
  const stage=document.getElementById('pdf-stage');
  const originalStyle=stage.getAttribute('style');
  // Place real page bounds inside the viewport for html2canvas. Keep the
  // original stage invisible while html2canvas makes its own visible clone.
  stage.style.left='0px';
  stage.style.top='0px';
  stage.style.opacity='0';
  stage.style.zIndex='-1';
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  const scale=Capacitor.isNativePlatform()?1.15:1.35;
  try{
    for(let i=0;i<pages.length;i++){
      onProgress('Rendering PDF page '+(i+1)+' of '+pages.length+'…');
      await new Promise(r=>setTimeout(r,0));
      const canvas=await html2canvas(pages[i],{
        scale,backgroundColor:'#ffffff',logging:false,
        useCORS:false,windowWidth:794,scrollX:0,scrollY:0,
        onclone:cloned=>{
          const cloneStage=cloned.getElementById('pdf-stage');
          if(cloneStage){cloneStage.style.opacity='1';cloneStage.style.zIndex='auto';}
        }
      });
      if(canvas.width<10||canvas.height<10)throw Error('PDF page could not be rendered. Try again or use Print.');
      if(i)pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg',0.87),'JPEG',0,0,210,297,undefined,'FAST');
      canvas.width=1;canvas.height=1;
    }
    onProgress('Preparing downloadable PDF…');
    return {blob:pdf.output('blob'),filename:outputFilename(doc),pages:pages.length};
  }finally{
    if(originalStyle===null)stage.removeAttribute('style');
    else stage.setAttribute('style',originalStyle);
    stage.textContent='';
  }
}
