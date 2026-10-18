import schema from './schema.json';
import html2canvas from 'html2canvas';
import {jsPDF} from 'jspdf';
import {Capacitor} from '@capacitor/core';
import {Filesystem,Directory} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import './style.css';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy=x=>JSON.parse(JSON.stringify(x));
let items=copy(schema.fields);
let profile={name:'',no:'',arYear:String(new Date().getFullYear()),arDate:'',lodgementDueDate:'',directorName:'',directorId:'',confirmationDate:''};
let busy=false;
const inputs=['name','no','arYear','arDate','lodgementDueDate','directorName','directorId','confirmationDate'];
const escapeName=s=>String(s||'Annual_Return').replace(/[^\w .()-]/g,'_').slice(0,80);
function notify(msg){$('#status').textContent=msg;}
function editor(){
  const base=inputs.map(key=>`<label class="field"><span>${({name:'Company name / 公司名称',no:'Company registration no. / 公司编号',arYear:'Annual return year / 周年申报年份',arDate:'Annual return date / 周年申报日期',lodgementDueDate:'Lodgement due date / 申报截止日期',directorName:'Confirming director name / 董事姓名',directorId:'Director ID (optional) / 证件号码',confirmationDate:'Confirmation date / 确认日期'})[key]}</span><input data-profile="${key}" value="${esc(profile[key])}" placeholder="${key.includes('Date')?'DD/MM/YYYY':''}"/></label>`).join('');
  let html='<div class="grid">'+base+'</div>';
  let opened=false;
  items.forEach((v,i)=>{
    if(v.type==='section'){
      if(opened)html+='</div></details>';
      html+=`<details class="section" ${i===0?'open':''}><summary>${esc(v.en)} / ${esc(v.cn)} <span class="pill">Edit fields</span></summary><div>`;
      opened=true;
    }else if(v.type==='heading')html+=`<div class="note">${esc(v.en)} / ${esc(v.cn)}</div>`;
    else if(v.type==='field')html+=`<label class="field"><span>${esc(v.en)} <small>${esc(v.cn)}</small></span><textarea data-field="${i}" rows="2" placeholder="Enter current particulars">${esc(v.value||'')}</textarea></label>`;
  });
  if(opened)html+='</div></details>';
  $('#formFields').innerHTML=html;
}
function collect(){
  document.querySelectorAll('[data-profile]').forEach(el=>profile[el.dataset.profile]=el.value);
  document.querySelectorAll('[data-field]').forEach(el=>items[Number(el.dataset.field)].value=el.value);
}
function cell(label,value){return `<tr><td>${esc(label)}</td><td>${esc(value||'NOT PROVIDED IN FORM / 表单未提供资料')}</td></tr>`;}
function table(rows){return `<table><thead><tr><th>PARTICULARS / 项目</th><th>CURRENT INFORMATION / 现有资料</th></tr></thead><tbody>${rows.map(r=>cell(r.label,r.value)).join('')}</tbody></table>`;}
function page(content,index,total){return `<article class="report-page"><h1>${esc(profile.name||'COMPANY NAME')}</h1><h2>ANNUAL RETURN ${esc(profile.arYear)} PARTICULARS / 周年申报资料</h2>${content}<div class="foot"><span>For review and confirmation only — NOT an SSM lodgement / 仅供审核确认</span><span>${index} / ${total}</span></div></article>`;}
function makePages(){
  const pages=[];
  const details=[['Company Name / 公司名称',profile.name],['Company No. / 公司编号',profile.no],['Annual Return Year / 周年申报年份',profile.arYear],['Annual Return Date / 周年申报日期',profile.arDate],['Lodgement Due Date / 申报截止日期',profile.lodgementDueDate]];
  pages.push(`<h3>COMPANY PROFILE / 公司概况</h3>${table(details.map(([label,value])=>({label,value})))}`);
  let section='',heading='',rows=[];
  const flush=()=>{if(!rows.length)return;
    // Conservative pagination keeps the PDF legible and makes each document page independently renderable.
    const maxRows=6;
    for(let i=0;i<rows.length;i+=maxRows){
      const part=rows.slice(i,i+maxRows);
      pages.push(`<h3>${esc(section)}</h3>${heading?`<div class="subhead">${esc(heading)}</div>`:''}${table(part)}`);
    }
    rows=[];
  };
  for(const item of items){
    if(item.type==='section'){flush();section=item.en+' / '+item.cn;heading='';}
    else if(item.type==='heading'){flush();heading=item.en+' / '+item.cn;}
    else if(item.type==='field'){
      const v=String(item.value||'').trim();
      const chunks=v.length>900?v.match(/[\s\S]{1,900}/g):[v];
      chunks.forEach((chunk,i)=>rows.push({label:item.en+' / '+item.cn+(i?' (continued)':''),value:chunk}));
      if(rows.length>=6)flush();
    }
  }
  flush();
  pages.push(`<h3>DIRECTOR'S CONFIRMATION & ACKNOWLEDGEMENT / 董事确认及声明</h3><p class="statement">I hereby confirm that all the particulars contained in this document are true and correct to the best of my knowledge.</p><p class="statement">本人谨此确认，据本人所知，本文件所载的所有资料均属真实及正确。</p><div class="signature">Signature of Director / 董事签名<br>Name / 姓名: ${esc(profile.directorName)}<br>NRIC / Passport / 证件号码: ${esc(profile.directorId)}<br>Date / 日期: ${esc(profile.confirmationDate)}</div><p class="tiny">This document does not replace the prescribed Annual Return lodged with SSM. / 本文件不能代替向马来西亚公司委员会提交的法定周年申报。</p>`);
  return pages.map((contents,i)=>page(contents,i+1,pages.length));
}
function preview(){collect();const pages=makePages();$('#pageCount').textContent=`${pages.length} pages • ${items.filter(i=>i.type==='field').length} particulars`;
  $('#preview').innerHTML=pages.slice(0,2).join('')+`<div class="preview-placeholder">Preview shows the first 2 pages. Download PDF to generate all ${pages.length} pages.</div>`;
}
function parseGs(text){
  const m=/\bconst\s+AR_SINGLE_COMPANY\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:\n|$)/.exec(text);
  if(!m)throw Error('The file does not contain AR_SINGLE_COMPANY. Select a generated Annual Return .gs or compatible JSON.');
  return JSON.parse(m[1]);
}
async function loadFile(file){if(!file)return;
  if(file.size>3*1024*1024)throw Error('Choose a script or JSON file smaller than 3 MB.');
  const text=await file.text();const parsed=/\.gs$/i.test(file.name)?parseGs(text):JSON.parse(text);
  const source=parsed.AR_SINGLE_COMPANY||parsed;
  if(!source||typeof source.company!=='object'||!Array.isArray(source.particulars))throw Error('This file is not an Annual Return data file.');
  if(source.particulars.length>700)throw Error('Too many particulars in the selected file.');
  const fields=source.particulars.filter(x=>x&&['field','section','heading'].includes(x.type));
  if(!fields.length)throw Error('No particulars found.');
  const base=copy(schema.fields);
  // Match exact schema labels and occurrence indexes to avoid importing private source headings verbatim.
  let cursor=0;
  for(const row of fields){if(row.type!=='field')continue;
    const selected=base.findIndex((candidate,i)=>i>=cursor&&candidate.type==='field'&&candidate.en===row.en);
    if(selected>=0){base[selected].value=String(row.value??'').slice(0,10000);cursor=selected+1;}
  }
  items=base;
  Object.keys(profile).forEach(k=>{if(['name','no','arYear','arDate','lodgementDueDate'].includes(k))profile[k]=String(source.company[k]||'');});
  editor();preview();notify(`Loaded ${file.name}. Review and edit all particulars before generating the PDF. Data stays on this device.`);
}
async function savePdf(blob,name){
  if(Capacitor.isNativePlatform()){
    const b64=await new Promise((ok,fail)=>{const f=new FileReader();f.onerror=fail;f.onload=()=>ok(String(f.result).split(',')[1]);f.readAsDataURL(blob)});
    const {uri}=await Filesystem.writeFile({path:'annual-return/'+Date.now()+'-'+name,data:b64,directory:Directory.Cache,recursive:true});
    await Share.share({title:'Annual Return PDF',url:uri,dialogTitle:'Save to Files / Drive'});
  }else{
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),120000);
  }
}
async function generate(){if(busy)return;collect();if(!profile.name.trim()||!profile.no.trim())return notify('Enter the company name and registration number before creating PDF.');
  busy=true;$('#generate').disabled=true;const original=$('#renderTarget');
  try{
    const pages=makePages();const pdf=new jsPDF({unit:'mm',format:'a4',compress:true});
    for(let i=0;i<pages.length;i++){
      notify(`Rendering PDF page ${i+1} of ${pages.length}…`);
      original.innerHTML=pages[i];
      await document.fonts.ready;
      const element=original.firstElementChild;
      const canvas=await html2canvas(element,{scale:1.5,backgroundColor:'#fff',useCORS:false,logging:false,windowWidth:1100});
      if(i)pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg',0.86),'JPEG',0,0,210,297,undefined,'FAST');
      original.innerHTML='';
    }
    const name=escapeName(profile.name)+'_Annual_Return_'+escapeName(profile.arYear)+'_Review.pdf';
    await savePdf(pdf.output('blob'),name);notify(`PDF ready: ${name} (${pages.length} pages). For review only; not submitted to SSM.`);
  }catch(err){notify('PDF generation error: '+(err.message||String(err)));console.error(err)}finally{original.innerHTML='';busy=false;$('#generate').disabled=false;}
}
function saveDraft(){collect();const blob=new Blob([JSON.stringify({company:profile,particulars:items,format:'ZHENLI_AR_REVIEW_DRAFT_V1'},null,2)],{type:'application/json'});
  const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=escapeName(profile.name||'Annual_Return')+'_AR_draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),120000);
  notify('JSON draft download started. Store it securely; it may contain personal details.');
}
$('#app').innerHTML=`<header class="header"><h1>ZHENLI · Annual Return PDF Generator</h1><p>Malaysia Sdn. Bhd. | Bilingual annual return particulars review / 周年申报资料审核</p></header><main class="layout"><section class="panel"><h2>Company particulars</h2><p class="note">Based on your revised 9 October 2026 Google Apps Script. Import an existing Annual Return .gs or JSON, or fill in a blank template. Information remains on-device; the app does not upload files to GitHub, Google or SSM.</p><div class="actions"><button class="btn" id="import">Import .gs / .json</button><input id="dataFile" type="file" accept=".gs,.json,text/plain,application/json" hidden/><button class="btn" id="clear">Start blank</button><button class="btn" id="saveDraft">Export editable JSON</button></div><div id="formFields"></div></section><aside class="panel aside"><h2>PDF preview</h2><div class="actions"><button class="btn" id="refresh">Refresh preview</button><button class="btn primary" id="generate">Generate PDF</button></div><p id="pageCount" class="tiny"></p><p id="status" class="status" role="status"></p><div class="preview-scroll" id="preview"></div><p class="tiny">For secretarial review/confirmation only. Validate director, shareholder and beneficial ownership details against the company registers and applicable SSM requirements before any statutory submission.</p></aside></main><div id="renderTarget" aria-hidden="true"></div>`;
editor();preview();
$('#import').onclick=()=>$('#dataFile').click();
$('#dataFile').onchange=async e=>{try{await loadFile(e.target.files[0])}catch(err){notify('Import failed: '+err.message)}finally{e.target.value=''}};
$('#clear').onclick=()=>{if(!confirm('Start a blank review? Unsaved edits will be lost.'))return;items=copy(schema.fields);Object.keys(profile).forEach(k=>profile[k]='');profile.arYear=String(new Date().getFullYear());editor();preview();notify('Blank Annual Return review created.');};
$('#saveDraft').onclick=saveDraft;
$('#refresh').onclick=preview;
$('#generate').onclick=generate;