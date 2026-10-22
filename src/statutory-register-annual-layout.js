import {isCurrentMember,currentMemberKey} from './statutory-current-members.js';
/**
 * Editable, independent statutory-register document projection.
 * All edit coordinates map to privately stored statutory data; Excel's
 * sheet layout is never displayed and is never required for PDF export.
 */
import {describeStatutorySheet,registerLabel,isManagerRegister,isMemberPersonalOrSharesLabel,registerGroupIndices,visibleRegisterIndices,getRegisterFieldOverrides} from './statutory-register-review.js';

export const STATUTORY_DOCUMENT_COLORS={
 ink:'#243b4d',navy:'#193f64',blue:'#245f80',light:'#eaf3f8',
 label:'#f5f9fc',line:'#dbe6ee',muted:'#58748b',white:'#ffffff'
};
const hasText=v=>String(v??'').trim().length>0;
function mappedField(item,sheetIndex){
 return {type:'field',sheetIndex,row:item.row,col:item.col,
  label:String(item.label||'Particulars').trim(),value:String(item.value??'')};
}
function recordsToBlocks(records,sheetIndex,showBlanks){
 const result=[];
 for(let i=0;i<(records||[]).length;i++){
  const record=records[i];
  result.push({type:'record',title:record.title||'Record '+(i+1),
   row:record.row,sheetIndex,status:record.status==='former'?'Former / Ceased':
    record.status==='current'?'Current / Active':''});
  const visible=(record.fields||[]).filter(f=>showBlanks||hasText(f.value));
  if(visible.length)result.push(...visible.map(f=>mappedField(f,sheetIndex)));
  else result.push({type:'note',text:'No particulars recorded.'});
 }
 return result;
}
function genericEntries(rows,sheetIndex,{showBlanks=false}={}){
 // For non-standard registers, convert rows to labelled, editable particulars.
 // No row/column grid headers appear. Every populated cell remains accessible.
 const result=[];
 for(let i=0;i<rows.length;i++){
  const cells=(rows[i]||[]).map((value,col)=>({col,value:String(value??'')}))
   .filter(x=>showBlanks||hasText(x.value));
  if(!cells.length)continue;
  result.push({type:'record',title:'Entry '+(i+1),row:i,sheetIndex,status:''});
  const first=cells[0];
  if(cells.length===1){
   result.push(mappedField({row:i,col:first.col,label:'Details',value:first.value},sheetIndex));
  }else{
   // The first column is a natural field label only if it is short and
   // descriptive. Otherwise all cells are separate editable particulars.
   const labelCandidate=first.value.replace(/:$/,'').trim();
   const labelled=labelCandidate.length>1&&labelCandidate.length<90;
   for(let j=0;j<cells.length;j++){
    const cell=cells[j];
    const label=labelled&&j===1?labelCandidate:'Particular '+(j+1);
    result.push(mappedField({row:i,col:cell.col,label,value:cell.value},sheetIndex));
   }
  }
 }
 return result;
}
/**
 * Current Members projection. Later imported worksheets take precedence over
 * earlier snapshots; a newer cessation or zero holding suppresses an older
 * 'current' folio for the same identity. Never alter the stored history.
 */
export function currentMemberRecords(book,indices){
 const latest=new Map();
 for(const sheetIndex of indices){
  const description=describeStatutorySheet(book.sheets[sheetIndex]);
  for(const rec of description.records||[]){
   const id=currentMemberKey(rec);
   if(!id)continue;
   // Relatively newer folios / imported revisions supersede older entries.
   if(latest.has(id))latest.delete(id);
   latest.set(id,{record:rec,sheetIndex});
  }
 }
 return [...latest.values()].filter(item=>isCurrentMember(item.record));
}
function currentMemberBlocks(book,indices,{showBlanks=false}={}){
 const active=currentMemberRecords(book,indices);
 const blocks=[];
 for(const {record,sheetIndex} of active){
  const name=record.fields.find(f=>/^(?:name|full name|shareholder'?s? name|member'?s? name)$/i.test(f.label))||
   record.fields.find(f=>/\bname\b/i.test(f.label));
  const shares=record.shareField||record.fields.find(f=>
   /^(?:current number of shares held|total shares held|shares held|shareholding)$/i.test(f.label));
  if(!name||!shares)continue;
  blocks.push({type:'record',sheetIndex,row:record.row,title:record.title,status:''});
  blocks.push({...mappedField(name,sheetIndex),label:'Shareholder Name'});
  // Retain existing member identity and contact particulars for CURRENT
  // shareholders only. Movement history, ceased dates, certificate details,
  // allotments and transfers remain hidden in the editable review and PDF.
  const personal=(record.fields||[]).filter(f=>
   isMemberPersonalOrSharesLabel(f.label)&&f!==name&&f!==shares&&
   !/^(?:name|full name|shareholder'?s? name|member'?s? name)$/i.test(f.label)&&
   !/\b(?:shares held|shareholding)\b/i.test(f.label));
  const addr=personal.find(f=>/^address$/i.test(f.label));
  const continuation=addr?personal.filter(f=>/^address · continued$/i.test(f.label)&&
   f.row>addr.row):[];
  for(const f of personal){
   if(continuation.includes(f))continue;
   if(!showBlanks&&!hasText(f.value)&&f!==addr)continue;
   if(f===addr&&continuation.length){
    blocks.push({...mappedField(f,sheetIndex),label:'Address',
     value:[f,...continuation].map(x=>String(x.value||'').trim()).filter(Boolean).join('\n'),
     composite:true,continuation:continuation.map(x=>({row:x.row,col:x.col}))});
   }else blocks.push(mappedField(f,sheetIndex));
  }
  blocks.push({...mappedField(shares,sheetIndex),label:'Current Number of Shares Held'});
 }
 if(!blocks.length)blocks.push({type:'note',
  text:'No current shareholders with confirmed positive shareholdings are recorded. Verify the latest register or SSM particulars.'});
 return blocks;
}

export function buildIndependentRegister(book,sheetIndex,{showBlanks=false}={}){
 if(!Number.isInteger(sheetIndex)||sheetIndex<0||sheetIndex>=(book?.sheets?.length||0))
  throw Error('Select a valid statutory register.');
 const sheet=book.sheets[sheetIndex];
 if(isManagerRegister(sheet.name))throw Error('Register of Managers is not shown in Statutory Registers.');
 const details=describeStatutorySheet(sheet);
 const result={sheetIndex,title:registerLabel(sheet.name),sourceName:sheet.name,blocks:[]};
 const fields=items=>(items||[]).filter(f=>showBlanks||hasText(f.value))
  .map(f=>mappedField(f,sheetIndex));
 if(details.kind==='profile'){
  // Restore every original Company Details field in its imported order.
  // Only the Registered Office continuation *rows* are collapsed into the
  // first Registered Address entry; unrelated fields remain editable.
  const profile=details.fields||[];
  const first=profile.find(f=>/^registered (?:office|address)$/i.test(f.label));
  const continuation=first?profile.filter(f=>f.row>first.row&&
   /^registered (?:office|address) · continued$/i.test(f.label)):[];
  for(const item of profile){
   if(first&&item===first){
    const lines=[first,...continuation].map(f=>String(f.value||'').trim()).filter(Boolean);
    result.blocks.push({...mappedField(first,sheetIndex),
     label:'Registered Address',value:lines.join('\n'),
     continuation:continuation.map(f=>({row:f.row,col:f.col})),composite:true});
   }else if(!continuation.includes(item)){
    if(showBlanks||hasText(item.value))result.blocks.push(mappedField(item,sheetIndex));
   }
  }
  if(!first)result.blocks.push({type:'note',text:'Registered Address is not recorded. Use Add Field to create it.'});
 }else if(details.kind==='member'){
  result.blocks.push(...currentMemberBlocks(book,[sheetIndex],{showBlanks}));
 }else if(details.kind==='table'||details.kind==='text'){
  result.blocks.push(...recordsToBlocks(details.records,sheetIndex,showBlanks));
 }else{
  result.blocks.push(...genericEntries(sheet.rows||[],sheetIndex,{showBlanks}));
 }
 // A charge register without a charge record must state N/A, not a fake entry.
 if(/^register of charges$/i.test(result.title)){
  const rows=sheet.rows||[];
  const onlyHeadings=rows.length===0||rows.every((row,i)=>
   !row.some(v=>String(v??'').trim()&&i>0&&
    !/^(?:n\/a|nil|none|not applicable|-)$/i.test(String(v).trim())));
  if(onlyHeadings||!result.blocks.some(b=>b.type==='record'&&b.title&&!/^(?:no entries|entry 1)$/i.test(b.title)))
   if(onlyHeadings)result.blocks=[{type:'note',text:'N/A — No charge record'}];
 }
 if(!result.blocks.length)result.blocks.push({type:'note',text:'No entries recorded. Choose Add Entry to begin.'});
 return finishDisplay(book,result);
}


function finishDisplay(book,result){
// Apply per-register removals to the rendered statutory document and PDF
 // WITHOUT erasing historical imported data or changing original coordinates.
 // The original worksheet remains privately recoverable; Save Changes writes
 // a private backup before persisting the new view state.
 const removedEntries=book?.removedEntries||{};
 const removedFields=book?.removedFields||{};
 let skipEntry=false;
 result.blocks=result.blocks.filter(block=>{
  if(block.type==='record'){
   skipEntry=removedEntries[block.sheetIndex+':'+block.row]===true;
   return !skipEntry;
  }
  if(skipEntry)return false;
  if(block.type==='field')
   return removedFields[block.sheetIndex+':'+block.row+':'+block.col]!==true;
  return true;
 });
 // Label overrides affect both editable web fields and generated PDFs.
 const overrides=getRegisterFieldOverrides(book);
 for(const block of result.blocks){
  if(block.type!=='field')continue;
  const key=block.sheetIndex+':'+block.row+':'+block.col;
  if(typeof overrides[key]==='string'&&overrides[key].trim())
   block.label=overrides[key].slice(0,120);
 }
 return result;
}

/** The first Member tab presents all numbered source folios under one register. */
export function buildGroupedRegister(book,sheetIndex,options={}){
 const members=registerGroupIndices(book,sheetIndex);
 if(!members.length)throw Error('Register not available.');
 if(registerLabel(book.sheets[sheetIndex].name)==='Register of Members'){
  return finishDisplay(book,{sheetIndex:members[0],title:'Register of Members',
   sourceName:book.sheets[members[0]].name,blocks:currentMemberBlocks(book,members,options)});
 }
 return buildIndependentRegister(book,sheetIndex,options);
}
/** One complete PDF: Company Details plus every distinct statutory register, excluding Managers. */
export function buildCombinedRegisters(book,options={}){
 return visibleRegisterIndices(book).map(i=>buildGroupedRegister(book,i,options));
}
