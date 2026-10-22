import {buildStatutoryAnnualSections} from './statutory-register-annual-layout.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=v=>!String(v??'').trim();
export function renderStatutoryAnnualDocument(book,{showBlanks=false}={}){
 const sections=buildStatutoryAnnualSections(book,{showBlanks});
 const safe=sections.map(section=>'<section id="sr-annual-'+section.sheetIndex+'" class="sr-ar-section" data-sheet="'+section.sheetIndex+'">'+
   '<div class="sr-ar-section-header"><h3>'+esc(section.title)+'</h3>'+
   '<span>REGISTER '+String(section.sheetIndex+1).padStart(2,'0')+'</span></div>'+
   section.blocks.map(block=>{
    if(block.type==='record')return '<div class="sr-ar-record-heading"><strong>'+esc(block.title)+'</strong>'+
     (block.status?'<span class="sr-ar-status">'+esc(block.status)+'</span>':'')+'</div>';
    if(block.type==='note')return '<p class="sr-ar-note">'+esc(block.text)+'</p>';
    return '<label class="sr-ar-row'+(empty(block.value)?' sr-ar-blank':'')+'">'+
     '<span class="sr-ar-label">'+esc(block.label)+'</span>'+
     '<span class="sr-ar-value"><textarea class="rb-cell sr-ar-input" data-s="'+block.sheetIndex+
     '" data-r="'+block.row+'" data-c="'+block.col+'" maxlength="15000" rows="'+(String(block.value).length>160?'3':'2')+
     '" aria-label="'+esc(section.title+' · '+block.label)+'">'+esc(block.value)+'</textarea></span></label>';
   }).join('')+'</section>').join('');
 return '<article class="sr-ar-paper" aria-label="Statutory Registers annual-return-style preview">'+
  '<header class="sr-ar-document-header"><div class="sr-ar-topline"></div>'+
   '<p class="sr-ar-kicker">ZHENLI · STATUTORY REGISTERS · COMPANY PARTICULARS</p>'+
   '<h2>'+esc(book.companyName||'Company')+'</h2>'+
   '<p class="sr-ar-subtitle">STATUTORY REGISTER PARTICULARS REVIEW</p>'+
   '<div class="sr-ar-meta"><span>Company Registration No.</span><strong>'+
   esc(book.registrationNo||'Not provided')+'</strong></div></header>'+
  '<div class="sr-ar-document-body">'+safe+'</div>'+
  '<footer class="sr-ar-document-footer">ZHENLI · STATUTORY REGISTERS <span>Editable review copy · Verify against original statutory filings</span></footer></article>';
}
