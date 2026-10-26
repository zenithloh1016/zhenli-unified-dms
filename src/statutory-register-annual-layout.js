import {isCurrentMember,currentMemberKey,positiveShares,hasPendingMemberShares} from './statutory-current-members.js';
import {sortReferenceFields,referenceDisplayLabel,referenceKind,excludeRegisterField,sortCompanyDetails} from './statutory-register-reference.js';
import {formatStatutoryNumber,numericKind,parseStatutoryNumber} from './statutory-number-format.js';
/**
 * Editable, independent statutory-register document projection.
 * All edit coordinates map to privately stored statutory data; Excel's
 * sheet layout is never displayed and is never required for PDF export.
 */
import {describeStatutorySheet,registerLabel,isManagerRegister,isMemberPersonalOrSharesLabel,registerGroupIndices,visibleRegisterIndices,getRegisterFieldOverrides,isChronologicalRegister,latestRegisterRecords,registerRecordStatus} from './statutory-register-review.js';

export const STATUTORY_DOCUMENT_COLORS={
 ink:'#243b4d',navy:'#193f64',blue:'#245f80',light:'#eaf3f8',
 label:'#f5f9fc',line:'#dbe6ee',muted:'#58748b',white:'#ffffff'
};
const hasText=v=>String(v??'').trim().length>0;
function mappedField(item,sheetIndex){
 return {type:'field',sheetIndex,row:item.row,col:item.col,
  label:String(item.label||'Particulars').trim(),value:String(item.value??'')};
}
function recordsToBlocks(records,sheetIndex,showBlanks,{separateHistory=true,kind='',title=''}={}){
 const result=[];
 const renderRecord=record=>{
  const si=Number.isInteger(record.sourceSheetIndex)?record.sourceSheetIndex:sheetIndex;
  const rawStatus=record.status==='former'?'Former':record.status==='current'?'Current':'';
  result.push({type:'record',title:record.title||'Record '+(result.length+1),
   row:record.row,sheetIndex:si,status:separateHistory?rawStatus:''});
  const visible=sortReferenceFields(title,(record.fields||[]).filter(f=>
   !excludeRegisterField(title,f.label)&&
   (showBlanks||hasText(f.value)||
    (kind==='charges'&&/^date of (?:discharge|satisfaction|release)$/i.test(f.label)))));
  if(visible.length)result.push(...visible.map(f=>({
   ...mappedField(f,si),
   label:referenceDisplayLabel(referenceKind(title),f.label,f,record.fields||[])
  })));
  else result.push({type:'note',text:'No particulars recorded.'});
 };
 if(!separateHistory){
  for(const record of records||[])renderRecord(record);
  return result;
 }
 for(const group of ['Current','Former']){
  const items=(records||[]).filter(record=>
   group==='Former'?record.status==='former':record.status!=='former');
  result.push({type:'group',title:group});
  if(items.length){for(const record of items)renderRecord(record);}
  else result.push({type:'note',text:'No '+group.toLowerCase()+' entries recorded.'});
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
  for(const source of description.records||[]){
   const id=currentMemberKey(source,{sheetIndex});
   if(!id)continue;
   // Manual status is a display override only: the original cessation and
   // shareholding data remain unchanged and independently verifiable.
   const manual=book?.recordStatuses?.[sheetIndex+':'+source.row];
   const rec={...source,status:registerRecordStatus(book,sheetIndex,source),
    manualStatus:manual==='current'||manual==='former'?manual:null};
   if(latest.has(id))latest.delete(id);
   latest.set(id,{record:rec,sheetIndex});
  }
 }
 return [...latest.values()].filter(item=>
  item.record.manualStatus==='current'||isCurrentMember(item.record));
}
/** Former records are derived from EACH imported member folio, not merely
 * from the most recent shareholder snapshot. This retains earlier cessation
 * periods while avoiding duplicate former records on ZIP re-import. */
export function formerMemberRecords(book,indices){
 const history=new Map();
 for(const sheetIndex of indices){
  const description=describeStatutorySheet(book.sheets[sheetIndex]);
  for(const source of description.records||[]){
   const id=currentMemberKey(source,{sheetIndex});
   if(!id)continue;
   const manual=book?.recordStatuses?.[sheetIndex+':'+source.row];
   if(manual==='current')continue;
   const record={...source,status:registerRecordStatus(book,sheetIndex,source),
    manualStatus:manual==='former'?'former':null};
   if(record.status!=='former'&&
      (positiveShares(record.shareField?.value)||hasPendingMemberShares(record)||!record.shareField))continue;
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
  status:former?'Former':'Current'});
 blocks.push({...mappedField(name,sheetIndex),label:'Shareholder Name'});
 const personal=sortReferenceFields('Register of Members',record.fields.filter(f=>isPersonalField(f)&&f!==shares));
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
 // Acquisition consideration is not the same as transfer consideration.
 // Totals are derived (read-only), never linked to a single editable Excel
 // cell: a member can have many share movements with different amounts.
 const ledger=record.ledgerTotals;
 if(ledger){
  // Acquisition consideration is relevant to the current holder view only.
  // Do not show former members' historical acquisitions; their transferred
  // shares and transfer consideration are the figures required in that view.
  if(!former&&ledger.acquisitionValueCount>0){
   blocks.push({type:'metric',
    label:'Total Share Consideration (Acquisitions)',
    value:formatStatutoryNumber('Share Consideration',
     ledger.acquisitionConsideration)});
   if(ledger.acquisitionValueCount<ledger.acquisitionCount)
    blocks.push({type:'note',text:'Some acquisitions have no consideration recorded; the displayed acquisition amount is a partial total.'});
  }
  if(former){
   if(ledger.transferCount>0){
    blocks.push({type:'metric',label:'Total Number of Shares Transferred',
     value:formatStatutoryNumber('Number of Shares Transferred',
      ledger.transferredShares)});
    if(ledger.transferValueCount>0){
     blocks.push({type:'metric',label:'Total Share Consideration (Transfers)',
      value:formatStatutoryNumber('Share Consideration',
       ledger.transferConsideration)});
     if(ledger.transferValueCount<ledger.transferCount)
      blocks.push({type:'note',text:'Some share transfers have no recorded consideration; the displayed transfer amount is a partial total.'});
    }else{
     blocks.push({type:'note',text:'Transfer consideration is not recorded in the source ledger. Verify the relevant share transfer instruments.'});
    }
   }else{
    blocks.push({type:'note',text:'No share transfer transaction was recorded for this former member in the imported ledger. Verify the transfer history.'});
   }
  }
 }
 return blocks;
}
function memberDisplayBlocks(book,indices,options={}){
 const current=currentMemberRecords(book,indices);
 const former=formerMemberRecords(book,indices);
 const pending=current.filter(item=>!positiveShares(item.record.shareField?.value));
 const total=current.reduce((sum,item)=>sum+(parseStatutoryNumber(item.record.shareField?.value)||0),0);
 const blocks=[{type:'group',title:'Current'}];
 if(current.length){
  for(const item of current)blocks.push(...memberPersonBlocks(item,{...options,total}));
  if(pending.length)blocks.push({type:'note',text:pending.length+
   ' current member folio(s) have missing or zero shareholdings. Verify membership and actual shares held; these entries are provisional, not verified shareholdings.'});
  if(total>0)blocks.push({type:'note',text:'Shareholding percentages are calculated against the total positive current holdings recorded in this register, not independently verified issued share capital.'});
 }else blocks.push({type:'note',text:'No current shareholders with verified positive shares are recorded. Review recent SSM returns and share transfers.'});
 blocks.push({type:'group',title:'Former'});
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
 if(isChronologicalRegister(sheet.name)&&registerLabel(sheet.name)!=='Register of Members')
  return buildGroupedRegister(book,sheetIndex,{showBlanks});
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
  result.blocks=sortCompanyDetails(result.blocks);
  if(!first)result.blocks.push({type:'note',text:'Registered Address is not recorded. Complete the registered address once verified.'});
 }else if(details.kind==='member'){
  result.blocks.push(...memberDisplayBlocks(book,[sheetIndex],{showBlanks}));
 }else if(details.kind==='table'||details.kind==='text'){
  result.blocks.push(...recordsToBlocks(details.records,sheetIndex,showBlanks,{
   separateHistory:!historyExcluded(result.title),
   kind:/^register of charges$/i.test(result.title)?'charges':'',title:result.title}));
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
 // Transactions are neither Current nor Former, but need the same
 // document-style section layout as all other statutory registers.
 if(historyExcluded(result.title)){
  result.blocks.unshift({type:'group',title:'Transactions'});
  if(!result.blocks.some(b=>b.type==='record'))
   result.blocks.push({type:'note',text:'No '+(/allotment/i.test(result.title)?'allotment':'share transfer')+
    ' transactions recorded. Choose Add Entry to begin.'});
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
 const indices=registerGroupIndices(book,sheetIndex);
 if(!indices.length)throw Error('Register not available.');
 const title=registerLabel(book.sheets[indices[0]].name);
 if(title==='Register of Members')
  return finishDisplay(book,{sheetIndex:indices[0],title,
   sourceName:book.sheets[indices[0]].name,blocks:memberDisplayBlocks(book,indices,options)});
 if(isChronologicalRegister(book.sheets[sheetIndex].name)){
  const kind=/^register of charges$/i.test(title)?'charges':'';
  const rows=latestRegisterRecords(book,indices);
  if(rows.length)return finishDisplay(book,{
   sheetIndex:indices[0],title,sourceName:book.sheets[indices[0]].name,
   blocks:recordsToBlocks(rows,indices[0],options.showBlanks||false,{kind,title})});
  const hasMeaningful=indices.some(i=>{
   const d=describeStatutorySheet(book.sheets[i]);
   return d.kind==='unstructured'&&(book.sheets[i].rows||[]).some(row=>
    (row||[]).some(v=>String(v??'').trim()&&
     !/^(?:n\/a|nil|none|-|not applicable)$/i.test(String(v).trim())));
  });
  if(kind==='charges'&&!hasMeaningful)return finishDisplay(book,{
   sheetIndex:indices[0],title,blocks:[{type:'note',text:'N/A — No charge record'}]});
  if(hasMeaningful){
   const blocks=[{type:'group',title:'Current'}];
   for(const i of indices)blocks.push(...genericEntries(book.sheets[i].rows||[],i,options));
   blocks.push({type:'group',title:'Former'});
   blocks.push({type:'note',text:'No former entries recorded.'});
   return finishDisplay(book,{sheetIndex:indices[0],title,blocks});
  }
  return finishDisplay(book,{sheetIndex:indices[0],title,
   blocks:recordsToBlocks([],indices[0],false)});
 }
 return buildIndependentRegister(book,sheetIndex,options);
}
/** One complete PDF: Company Details plus every distinct statutory register, excluding Managers. */
export function buildCombinedRegisters(book,options={}){
 return visibleRegisterIndices(book).map(i=>buildGroupedRegister(book,i,options));
}
