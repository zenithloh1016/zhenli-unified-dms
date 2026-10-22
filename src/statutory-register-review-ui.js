import {describeStatutorySheet,summaryForReview,filterReviewRecords} from './statutory-register-review.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(text,action,id='')=>'<button type="button" class="btn secondary" data-action="'+action+'" data-id="'+esc(id)+'">'+esc(text)+'</button>';
const empty=v=>!String(v??'').trim();

function fieldHtml(f,{showBlanks=false}={}){
 if(!showBlanks&&empty(f.value)&&!/^(?:name|full name|director name)$/i.test(f.label))return '';
 const value=String(f.value??'');
 return '<label class="sr-field"><span class="sr-field-label">'+esc(f.label)+'</span>'+
  '<textarea class="rb-cell sr-field-input" data-r="'+f.row+'" data-c="'+f.col+
  '" rows="'+(value.length>85?3:2)+'" maxlength="15000" aria-label="'+esc(f.label)+'">'+esc(value)+'</textarea></label>';
}
function fieldsHtml(fields,showBlanks,showAll=false){
 const shown=showAll?fields:fields.filter(f=>showBlanks||!empty(f.value));
 return '<div class="sr-fields">'+(shown.map(f=>fieldHtml(f,{showBlanks:showBlanks||showAll})).join('')||
  '<p class="muted">No details recorded in this section. Switch to Worksheet View to add data.</p>')+'</div>';
}
function recordCard(record,type,state,alwaysOpen=false){
 const key=type+':'+record.row;
 const expanded=alwaysOpen||state.reviewExpanded===key;
 const preview=record.fields.filter(f=>!empty(f.value)&&f.value!==record.title).slice(0,3);
 const badge=record.status==='unknown'?'':'<span class="sr-record-status '+record.status+'">'+
  (record.status==='current'?'Current / Active':'Former / Ceased')+'</span>';
 return '<article class="sr-record">'+
  '<div class="sr-record-top"><div class="sr-record-primary"><h4>'+esc(record.title)+'</h4>'+
   '<div class="sr-record-preview">'+preview.map(f=>'<span><b>'+esc(f.label)+':</b> '+esc(f.value)+'</span>').join('')+'</div></div>'+
   '<div class="sr-record-tools">'+badge+(alwaysOpen?'':btn(expanded?'Hide details':'Review / Edit details','sr-toggle-record',key))+'</div></div>'+
  (expanded?fieldsHtml(record.fields,state.showBlankFields):'')+'</article>';
}
function searchBar(state,{allCount,matchCount,hasStatus}={}){
 return '<div class="sr-review-toolbar"><label class="sr-review-search"><span>Search this register</span>'+
  '<input id="sr-review-search" type="search" placeholder="Name, identification number, share details, dates" value="'+esc(state.reviewQuery)+'" /></label>'+
  (hasStatus?'<div class="sr-filter-group" aria-label="Register status filter">'+
   [['all','All'],['current','Current'],['former','Former']].map(([id,label])=>
    '<button type="button" class="sr-filter'+(state.reviewStatus===id?' selected':'')+
    '" data-action="sr-review-filter" data-id="'+id+'">'+label+'</button>').join('')+'</div>':'')+
  '<span class="sr-count">'+matchCount+' of '+allCount+' entries</span></div>';
}
function pager(state,total){
 const pages=Math.max(1,Math.ceil(total/12));
 state.reviewPage=Math.min(state.reviewPage,pages-1);
 if(pages<=1)return '';
 return '<div class="rb-pager"><span>Page '+(state.reviewPage+1)+' of '+pages+'</span>'+
  '<button type="button" class="btn secondary" data-action="sr-review-prev" '+(state.reviewPage===0?'disabled':'')+'>Previous</button>'+
  '<button type="button" class="btn secondary" data-action="sr-review-next" '+(state.reviewPage===pages-1?'disabled':'')+'>Next</button></div>';
}
function recordsHtml(records,state,type,{oneExpanded=false}={}){
 const matched=filterReviewRecords(records,{query:state.reviewQuery,status:state.reviewStatus});
 const pageNav=pager(state,matched.length);
 const visible=matched.slice(state.reviewPage*12,(state.reviewPage+1)*12);
 return searchBar(state,{allCount:records.length,matchCount:matched.length,
  hasStatus:records.some(r=>r.status!=='unknown')})+
  '<div class="sr-record-list">'+
   (visible.map(r=>recordCard(r,type,state,oneExpanded&&visible.length===1)).join('')||
    '<div class="sr-empty">No matching entries. Try another filter, or inspect the original worksheet.</div>')+
  '</div>'+pageNav;
}
export function renderReadableRegister(book,sheetIndex,state){
 const sheet=book?.sheets?.[sheetIndex];
 if(!sheet)return '<div class="rb-help">Select a register worksheet to begin.</div>';
 const details=describeStatutorySheet(sheet),summary=summaryForReview(book);
 const metrics=[['Directors',summary.directors],['Members',summary.members],['Beneficial Owners',summary.beneficialOwners],['Charges',summary.charges]];
 const top='<div class="sr-summary">'+metrics.map(([label,count])=>
  '<div class="sr-summary-item"><strong>'+count+'</strong><span>'+label+'</span></div>').join('')+'</div>'+
  '<div class="sr-review-heading"><div><p class="eyebrow">EASY REVIEW</p><h3>'+esc(details.label)+
  '</h3><p class="muted">Information grouped into readable records. Editing updates the underlying statutory register cells.</p></div>'+
  '<div>'+btn(state.showBlankFields?'Hide blank fields':'Show blank fields','sr-show-blank-fields')+'</div></div>';
 if(details.kind==='profile')
  return top+'<div class="sr-panel-title">Company particulars</div>'+
   fieldsHtml(details.fields,true,true);
 if(details.kind==='member'){
  const header='<div class="sr-panel-title">Member particulars</div>'+
   (details.records.length?details.records.map(r=>recordCard(r,'member',state,true)).join(''):
    '<p class="sr-empty">No member particulars entered.</p>');
  const movement=details.ledger?.records||[];
  return top+header+'<div class="sr-panel-title">Shares acquired / transferred</div>'+
   recordsHtml(movement,state,'ledger');
 }
 if(details.kind==='table'||details.kind==='text')
  return top+recordsHtml(details.records,state,'main',{oneExpanded:true});
 return top+'<div class="sr-panel-title">Additional particulars</div>'+
  (details.fields?.length?fieldsHtml(details.fields,true,true):'')+
  '<div class="sr-empty">This worksheet has a non-standard layout. Open <b>Worksheet View</b> to inspect every source cell and edit the entries safely.</div>';
}
