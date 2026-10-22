/**
 * Editable, independent statutory-register document projection.
 * All edit coordinates map to privately stored statutory data; Excel's
 * sheet layout is never displayed and is never required for PDF export.
 */
import {describeStatutorySheet,registerLabel,isManagerRegister,isMemberPersonalOrSharesLabel} from './statutory-register-review.js';

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
   row:record.row,status:record.status==='former'?'Former / Ceased':
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
  result.push({type:'record',title:'Entry '+(i+1),row:i,status:''});
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
  result.blocks.push(...fields(details.fields));
 }else if(details.kind==='member'){
  // A folio can contain decades of allotments, acquisitions and transfers.
  // Only display the member's personal/contact details and the recorded
  // CURRENT total held, even though ledger rows stay safely in private storage.
  for(const record of details.records||[]){
   const personal=(record.fields||[]).filter(f=>isMemberPersonalOrSharesLabel(f.label));
   const held=personal.find(f=>/shares held|shareholding/i.test(f.label));
   if(!held){
    // When the folio has no explicit Total Shares Held, the latest Balance
    // of Shares is the best available recorded balance. No arithmetic on
    // incomplete historic transfers is attempted.
    const movements=details.ledger?.records||[];
    const last=[...movements].reverse().flatMap(x=>[...(x.fields||[])].reverse())
     .find(f=>/^(?:balance of shares|share balance)$/i.test(f.label)&&String(f.value??'').trim()!=='');
    if(last)personal.push({...last,label:'Current Number of Shares Held'});
   }else{
    held.label='Current Number of Shares Held';
   }
   result.blocks.push({type:'record',title:record.title||'Member',row:record.row,status:''});
   const rows=personal.filter(f=>showBlanks||hasText(f.value)).map(f=>mappedField(f,sheetIndex));
   result.blocks.push(...rows);
   if(!rows.some(b=>b.label==='Current Number of Shares Held'))
    result.blocks.push({type:'note',text:'Current shares held not recorded; verify the latest statutory records.'});
  }
 }else if(details.kind==='table'||details.kind==='text'){
  result.blocks.push(...recordsToBlocks(details.records,sheetIndex,showBlanks));
 }else{
  result.blocks.push(...genericEntries(sheet.rows||[],sheetIndex,{showBlanks}));
 }
 if(!result.blocks.length)result.blocks.push({type:'note',text:'No entries recorded. Choose Add Entry to begin.'});
 return result;
}
