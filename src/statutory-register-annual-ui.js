import {buildGroupedRegister} from './statutory-register-annual-layout.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=v=>!String(v??'').trim();
export function renderStatutoryRegisterDocument(book,sheetIndex,{showBlanks=false}={}){
 const section=buildGroupedRegister(book,sheetIndex,{showBlanks});
 const parts=section.blocks.map(block=>{
  if(block.type==='group')return '<div class="sr-member-group">'+esc(block.title)+'</div>';
  if(block.type==='metric')return '<div class="sr-ar-row sr-derived-row">'+
    '<span class="sr-ar-label"><span>'+esc(block.label)+'</span></span>'+
    '<span class="sr-ar-value"><strong>'+esc(block.value)+'</strong></span></div>';
  if(block.type==='record'){
   const changesAllowed=/^Register of /i.test(section.title)&&
    !/^Register of (?:(?:Share )?Transfers|(?:Share )?Allotments)\b/i.test(section.title);
   const target=block.status==='Former'?'current':'former';
   return '<div class="sr-ar-record-heading"><strong>'+esc(block.title)+'</strong>'+
    (block.status?'<span class="sr-ar-status">'+esc(block.status)+'</span>':'')+
    (changesAllowed?'<button type="button" class="sr-toggle-status" data-action="sr-set-status" data-id="'+
     block.sheetIndex+':'+block.row+':'+target+'">'+(target==='former'?'Mark Former':'Mark Current')+'</button>':'')+
    '<button type="button" class="sr-delete-entry" data-action="sr-delete-entry" data-id="'+
     block.sheetIndex+':'+block.row+'" aria-label="Delete entry '+esc(block.title)+'">Delete Entry</button></div>';
  }
  if(block.type==='note')return '<p class="sr-ar-note">'+esc(block.text)+'</p>';
  return '<div class="sr-ar-row'+(empty(block.value)?' sr-ar-blank':'')+'">'+
   '<span class="sr-ar-label"><span>'+esc(block.label)+'</span>'+
    '<span class="sr-field-actions"><button type="button" class="sr-edit-field" data-action="sr-edit-field" data-id="'+
     block.sheetIndex+':'+block.row+':'+block.col+'" title="Edit field label">Edit Field</button>'+
    '<button type="button" class="sr-remove-field" data-action="sr-remove-field" data-id="'+
     block.sheetIndex+':'+block.row+':'+block.col+'" aria-label="Remove field '+esc(block.label)+'">Remove Field</button></span></span>'+
   '<span class="sr-ar-value"><textarea class="rb-cell sr-ar-input" data-s="'+block.sheetIndex+
    '" data-r="'+block.row+'" data-c="'+block.col+'"'+
    (block.numericKind?' data-numeric-kind="'+esc(block.numericKind)+'"':'')+
    (block.composite?' data-merge-address="true"':'')+
    ' maxlength="15000" rows="'+(String(block.value).length>100||block.composite?'4':'2')+
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
