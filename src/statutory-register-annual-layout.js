/**
 * Shared Annual Return-inspired statutory review document projection.
 * The website and PDF renderer consume EXACTLY the same section/block model.
 * Original imported rows remain the sole authoritative editable data.
 */
import {describeStatutorySheet,registerLabel} from './statutory-register-review.js';

export const STATUTORY_DOCUMENT_COLORS={
 ink:'#243b4d',navy:'#193f64',blue:'#245f80',light:'#eaf3f8',
 label:'#f5f9fc',line:'#dbe6ee',muted:'#58748b',white:'#ffffff'
};
const nonblank=v=>String(v??'').trim().length>0;
function field(f,sheetIndex){
 return {type:'field',sheetIndex,row:f.row,col:f.col,
  label:String(f.label??'Particulars').trim(),value:String(f.value??'')};
}
function fieldsOf(record,sheetIndex,showBlanks){
 return (record.fields||[]).filter(f=>showBlanks||nonblank(f.value)).map(f=>field(f,sheetIndex));
}
function recordBlocks(records,sheetIndex,showBlanks,{prefix='Entry'}={}){
 const blocks=[];
 for(let i=0;i<(records||[]).length;i++){
  const record=records[i];
  blocks.push({type:'record',title:record.title||prefix+' '+(i+1),
   status:record.status==='current'?'Current / Active':
    record.status==='former'?'Former / Ceased':''});
  const list=fieldsOf(record,sheetIndex,showBlanks);
  if(list.length)blocks.push(...list);
  else blocks.push({type:'note',text:'No particulars recorded.'});
 }
 return blocks;
}
function remainingCells(sheet,sheetIndex,showBlanks){
 const blocks=[];
 for(let r=0;r<(sheet.rows||[]).length;r++){
  const row=sheet.rows[r]||[];
  for(let c=0;c<row.length;c++){
   const value=String(row[c]??'');
   if(!showBlanks&&!nonblank(value))continue;
   blocks.push({type:'field',sheetIndex,row:r,col:c,label:'Row '+(r+1)+' · Column '+(c+1),value});
  }
 }
 return blocks;
}
/**
 * A self-contained, printable, two-column particulars document.
 * No pagination/filtering/expanded-card state influences the PDF; the preview
 * shows the complete register in the same reading order and visual language.
 */
export function buildStatutoryAnnualSections(book,{showBlanks=false}={}){
 const result=[];
 for(let i=0;i<(book?.sheets||[]).length;i++){
  const sheet=book.sheets[i],description=describeStatutorySheet(sheet);
  const section={sheetIndex:i,title:registerLabel(sheet.name),
   sourceName:sheet.name,blocks:[]};
  const addFields=fs=>section.blocks.push(...(fs||[])
   .filter(f=>showBlanks||nonblank(f.value)).map(f=>field(f,i)));
  if(description.kind==='profile'){
   addFields(description.fields);
  }else if(description.kind==='member'){
   section.blocks.push(...recordBlocks(description.records,i,showBlanks,{prefix:'Member'}));
   if(description.ledger?.records?.length){
    section.blocks.push({type:'record',title:'Share acquisition and transfer history',status:''});
    section.blocks.push(...recordBlocks(description.ledger.records,i,showBlanks,{prefix:'Share movement'}));
   }
  }else if(description.kind==='table'||description.kind==='text'){
   section.blocks.push(...recordBlocks(description.records,i,showBlanks));
  }else{
   // Non-standard register: never quietly omit source cells.
   section.blocks.push(...remainingCells(sheet,i,showBlanks));
  }
  if(!section.blocks.length)section.blocks.push({type:'note',text:'No particulars recorded.'});
  result.push(section);
 }
 return result;
}
