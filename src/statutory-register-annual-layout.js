import {isCurrentMember,currentMemberKey,positiveShares} from './statutory-current-members.js';
import {formatStatutoryNumber,numericKind,parseStatutoryNumber} from './statutory-number-format.js';
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
function recordsToBlocks(records,sheetIndex,showBlanks,{separateHistory=true,kind=''}={}){
 const result=[];
 const renderRecord=record=>{
  result.push({type:'record',title:record.title||'Record '+(result.length+1),
   row:record.row,sheetIndex,status:record.status==='former'?
    (kind==='charges'?'Discharged / Former':'Former / Ceased'):
    record.status==='current'?'Current / Active':'Status Not Recorded'});
  const visible=(record.fields||[]).filter(f=>showBlanks||hasText(f.value));
  if(visible.length)result.push(...visible.map(f=>mappedField(f,sheetIndex)));
  else result.push({type:'note',text:'No particulars recorded.'});
 };
 if(!separateHistory){
  for(const record of records||[])renderRecord(record);
  return result;
 }
 const groups=[
  {status:'current',title:'Current / Active'},
  {status:'former',title:kind==='charges'?'Discharged / Former (History)':'Former / Ceased (History)'},
  {status:'unknown',title:'Status Not Recorded — Verify'}
 ];
 for(const group of groups){
  const items=(records||[]).filter(record=>record.status===group.status||
   (group.status==='unknown'&&!['current','former'].includes(record.status)));
  result.push({type:'group',title:group.title});
  if(items.length){for(const record of items)renderRecord(record);}
  else result.push({type:'note',text:'No '+(group.status==='current'?'current':
   group.status==='former'?'former':'unverified')+' entries recorded.'});
 }
 return result;
}
function historyExcluded(name){
 return /^register of (?:share )?(?:transfer|transfers|allotment|allotments)(?:$|\b)/i.test(name);
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
/** Former records are derived from EACH imported member folio, not merely
 * from the most recent shareholder snapshot. This retains earlier cessation
 * periods while avoiding duplicate former records on ZIP re-import. */
export function formerMemberRecords(book,indices){
 const history=new Map();
 for(const sheetIndex of indices){
  const description=describeStatutorySheet(book.sheets[sheetIndex]);
  for(const record of description.records||[]){
   const id=currentMemberKey(record);
   if(!id)continue;
   if(record.status!=='former'&&
      (positiveShares(record.shareField?.value)||!record.shareField))continue;
   const cessation=String(record.ceasedField?.value??'').trim();
   const amount=String(record.shareField?.value??'').trim().replace(/,/g,'');
   const key=id+'|'+cessation+'|'+amount;
   if(history.has(key))history.delete(key);
   history.set(key,{record,sheetIndex});
  }
 }
 return [...history.values()];
}
const isPersonalField=f=>isMemberPersonalOrSharesLabel(f.label)&&
 !/^(?:name|full name|shareholder'?s? name|member'?s? name)$/i.test(f.label)&&
 !/\b(?:shares held|shareholding)\b/i.test(f.label);
function memberPersonBlocks(item,{showBlanks=false,former=false,total=0}={}){
 const {record,sheetIndex}=item,blocks=[];
 const name=record.fields.find(f=>/^(?:name|full name|shareholder'?s? name|member'?s? name)$/i.test(f.label))||
  record.fields.find(f=>/\bname\b/i.test(f.label));
 if(!name)return blocks;
 const shares=record.shareField||record.fields.find(f=>
  /^(?:current number of shares held|total shares held|shares held|shareholding)$/i.test(f.label));
 blocks.push({type:'record',sheetIndex,row:record.row,title:record.title,
  status:former?(record.status==='former'?'Former / Ceased':'No Current Shares'):'Current'});
 blocks.push({...mappedField(name,sheetIndex),label:'Shareholder Name'});
 const personal=record.fields.filter(f=>isPersonalField(f)&&f!==shares);
 const addr=personal.find(f=>/^address$/i.test(f.label));
 const continuation=addr?personal.filter(f=>/^address · continued$/i.test(f.label)&&f.row>addr.row):[];
 for(const f of personal){
  if(continuation.includes(f))continue;
  if(!showBlanks&&!hasText(f.value)&&f!==addr)continue;
  if(f===addr&&continuation.length){
   blocks.push({...mappedField(f,sheetIndex),label:'Address',
    value:[f,...continuation].map(x=>String(x.value||'').trim()).filter(Boolean).join('\n'),
    composite:true,continuation:continuation.map(x=>({row:x.row,col:x.col}))});
  }else blocks.push(mappedField(f,sheetIndex));
 }
 if(former){
  if(record.ceasedField&&hasText(record.ceasedField.value)&&
     !/^(?:-|n\/a|nil|none)$/i.test(record.ceasedField.value))
   blocks.push({...mappedField(record.ceasedField,sheetIndex),label:'Date Ceased to be a Member'});
  if(shares&&hasText(shares.value))
   blocks.push({...mappedField(shares,sheetIndex),label:'Last Recorded Number of Shares Held'});
 }else if(shares){
  blocks.push({...mappedField(shares,sheetIndex),label:'Current Number of Shares Held'});
  const amount=parseStatutoryNumber(shares.value);
  if(total>0&&amount!==null&&Number.isFinite(amount)){
   // Derived only from verified positive CURRENT register totals, not from
   // assumed issued share capital. Read-only; it has no Excel cell to edit.
   blocks.push({type:'metric',label:'Percentage of Recorded Current Holdings',
    value:formatStatutoryNumber('Percentage',(amount/total*100).toFixed(8))});
  }
 }
 if(record.considerationField){
  const amount=record.considerationField;
  blocks.push({...mappedField(amount,sheetIndex),
   label:'Latest Recorded Share Consideration ('+(amount.nature||'Transaction')+')'});
 }
 return blocks;
}
function memberDisplayBlocks(book,indices,options={}){
 const current=currentMemberRecords(book,indices);
 const former=formerMemberRecords(book,indices);
 const total=current.reduce((sum,item)=>sum+(parseStatutoryNumber(item.record.shareField?.value)||0),0);
 const blocks=[{type:'group',title:'Current Members'}];
 if(current.length){
  for(const item of current)blocks.push(...memberPersonBlocks(item,{...options,total}));
  blocks.push({type:'note',text:'Shareholding percentages are calculated against the total positive current holdings recorded in this register, not independently verified issued share capital.'});
 }else blocks.push({type:'note',text:'No current shareholders with verified positive shares are recorded. Review recent SSM returns and share transfers.'});
 blocks.push({type:'group',title:'Former Members (History)'});
 if(former.length){
  for(const item of former)blocks.push(...memberPersonBlocks(item,{...options,former:true}));
 }else blocks.push({type:'note',text:'No former shareholder records are available in the imported register.'});
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
  result.blocks.push(...memberDisplayBlocks(book,[sheetIndex],{showBlanks}));
 }else if(details.kind==='table'||details.kind==='text'){
  result.blocks.push(...recordsToBlocks(details.records,sheetIndex,showBlanks,{
   separateHistory:!historyExcluded(result.title),
   kind:/^register of charges$/i.test(result.title)?'charges':''}));
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
  if(block.type==='group'){skipEntry=false;return true;}
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
  block.numericKind=numericKind(block.label);
  block.value=formatStatutoryNumber(block.label,block.value);
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
   sourceName:book.sheets[members[0]].name,blocks:memberDisplayBlocks(book,members,options)});
 }
 return buildIndependentRegister(book,sheetIndex,options);
}
/** One complete PDF: Company Details plus every distinct statutory register, excluding Managers. */
export function buildCombinedRegisters(book,options={}){
 return visibleRegisterIndices(book).map(i=>buildGroupedRegister(book,i,options));
}
