import html2canvas from 'html2canvas';
import {jsPDF} from 'jspdf';
import {Capacitor} from '@capacitor/core';
import {Filesystem,Directory} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {outputFilename} from './core.js';

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
  link.href=currentLink;link.download=name;box.hidden=false;
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
export async function savePdf(blob,name,{share=false}={}){
  if(Capacitor.isNativePlatform()){
    const {uri}=await Filesystem.writeFile({path:'annual-return/'+Date.now()+'-'+name,
      directory:Directory.Cache,recursive:true,data:await b64(blob)});
    await Share.share({title:name,url:uri,dialogTitle:'Save / Share Annual Return PDF'});
    return 'Android share panel opened. Choose Files or Drive and save the document.';
  }
  if(share&&typeof navigator.share==='function'){
    const file=new File([blob],name,{type:'application/pdf'});
    if(!navigator.canShare||navigator.canShare({files:[file]})){
      try{
        await navigator.share({title:name,files:[file]});
        return 'File-sharing panel opened. Choose Files or Drive to save the PDF.';
      }catch(e){
        if(e.name==='AbortError')return 'Save cancelled. Use Direct PDF download to try again.';
      }
    }
  }
  const link=document.getElementById('download-link');
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
  const meta=[
    ['Company Name / 公司名称',doc.company.name],
    ['Company No. / 公司编号',doc.company.no],
    ['Annual Return Year / 周年申报年份',doc.company.arYear],
    ['Annual Return Date / 周年申报日期',doc.company.arDate],
    ['Lodgement Due Date / 申报截止日期',doc.company.lodgementDueDate],
  ];
  if(doc.company.masterListingDueDate)meta.push(['Internal Due Date / 内部截止日期',doc.company.masterListingDueDate]);
  const details=block('pdf-meta',meta.map(([name,val])=>'<div>'+escapeHtml(name)+'</div><div>'+escapeHtml(blank(val))+'</div>').join(''));
  push(details);
  for(const item of doc.particulars){
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
    '<h2>DIRECTOR’S CONFIRMATION / 董事确认</h2>'+
    '<p>I have reviewed the particulars presented in this Annual Return review document. To the best of my knowledge, the information stated is accurate, subject to verification of any missing or flagged particulars.</p>'+
    '<p>本人已审阅本周年申报资料审核文件。就本人所知，所列资料属实，但未提供或注明须核实的资料仍须确认。</p>'+
    '<p class="pdf-note">This is a review document and not an SSM Annual Return lodgement. / 本文件仅供审核，并非向马来西亚公司委员会正式提交的周年申报。</p>');
  push(confirmation);
  const acknowledgement=block('pdf-confirm pdf-acknowledgement',
    '<h2>SIGNING ACKNOWLEDGEMENT / 签署确认</h2>'+
    '<p>By signing below, the director acknowledges having reviewed and confirmed the particulars in this document and authorises the preparation of the Annual Return for the company, subject to statutory verification.</p>'+
    '<p>董事于下方签署，即确认已审阅本文件所列资料，并同意在完成法定核实后，为公司准备周年申报。</p>'+
    '<p><b>Acknowledgement status / 审阅确认状态:</b> '+
      (sign.acknowledged===true?'Recorded as acknowledged (signature still required) / 已记录确认（仍需签署）':
       'Pending director acknowledgement / 待董事确认')+'</p>'+
    '<div class="pdf-signature">Director’s actual signature / 董事本人签名</div>'+
    '<p><b>Name / 姓名:</b> '+escapeHtml(blank(sign.name))+'</p>'+
    '<p><b>NRIC / Passport No. / 身份证或护照号码:</b> '+escapeHtml(blank(sign.nric))+'</p>'+
    '<p><b>Date of actual signing / 实际签署日期:</b> '+escapeHtml(sign.date||'__________________')+'</p>'+
    '<p class="pdf-note">Selecting an acknowledgement checkbox in the editor does not create or apply a handwritten or digital signature. / 在编辑页面勾选确认，不代表已完成手写或数码签署。</p>');
  push(acknowledgement);
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
