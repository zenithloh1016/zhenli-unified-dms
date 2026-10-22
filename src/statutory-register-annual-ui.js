import {buildRegisterSections} from './statutory-register-annual-layout.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=v=>!String(v??'').trim();
export function renderStatutoryRegisterDocument(book,sheetIndex,{showBlanks=false}={}){
 const section=buildRegisterSections(book,{sheetIndex,showBlanks})[0];
 const parts=section.blocks.map(block=>{
  if(block.type==='record')return '<div class="sr-ar-record-heading"><strong>'+esc(block.title)+'</strong>'+
   (block.status?'<span class="sr-ar-status">'+esc(block.status)+'</span>':'')+'</div>';
  if(block.type==='note')return '<p class="sr-ar-note">'+esc(block.text)+'</p>';
  return '<div class="sr-ar-row'+(empty(block.value)?' sr-ar-blank':'')+'">'+
   '<span class="sr-ar-label"><span>'+esc(block.label)+'</span>'+
   '<button type="button" class="sr-edit-field" data-action="sr-edit-field" data-id="'+
    esc(block.sheetIndex+':'+block.row+':'+block.col)+'" title="Edit field label and value">Edit Field</button></span>'+
   '<span class="sr-ar-value"><textarea class="rb-cell sr-ar-input" data-s="'+block.sheetIndex+
    '" data-r="'+block.row+'" data-c="'+block.col+'"'+
    (block.continuationRows?.length?' data-address-rows="'+esc(block.continuationRows.map(x=>x.row+':'+x.col).join(','))+'"':'')+
    ' maxlength="15000" rows="'+(String(block.value).length>160?'3':'2')+
    '" aria-label="'+esc(section.title+' · '+block.label)+'">'+esc(block.value)+'</textarea></span></div>';
 }).join('');
 return '<article class="sr-ar-paper sr-register-paper" aria-label="'+esc(section.title)+' statutory register">'+
  '<header class="sr-ar-document-header"><div class="sr-ar-topline"></div>'+
   '<p class="sr-ar-kicker">ZHENLI · COMPANY STATUTORY REGISTERS</p>'+
   '<h2>'+esc(book.companyName||'Company')+'</h2>'+
   '<p class="sr-ar-subtitle">'+esc(section.title).toUpperCase()+'</p>'+
   '<div class="sr-ar-meta"><span>Company Registration No.</span><strong>'+
    esc(book.registrationNo||'Not provided')+'</strong></div></header>'+
  '<div class="sr-ar-document-body">'+
   '<section class="sr-ar-section" data-sheet="'+sheetIndex+'">'+
    '<div class="sr-ar-section-header"><h3>'+esc(section.title)+'</h3><span>STATUTORY REGISTER</span></div>'+
    parts+'</section></div>'+
  '<footer class="sr-ar-document-footer">ZHENLI · STATUTORY REGISTERS'+
   '<span>Working statutory record · Verify against SSM documents</span></footer></article>';
}
