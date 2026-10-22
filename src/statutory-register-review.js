/**
 * Review-only projections over the original imported worksheet cells.
 * No statutory particulars are deleted or written back in a different order.
 * Every editable field retains its exact original Excel row/column coordinates.
 */
const tidy=value=>String(value??'').trim().replace(/\s+/g,' ');
const cleanLabel=value=>tidy(value).replace(/:$/,'').slice(0,180);
const absent=value=>!tidy(value)||/^(?:-|–|—|n\/a|na|nil|none)$/i.test(tidy(value));
const isDateOrPerson=s=>/\b(?:name|full name|director|no\.?|date|chargee|allottee|shares|transfer|folio)\b/i.test(s);

export function registerLabel(name){
 const value=tidy(name).replace(/\s+\(Imported\s+[^)]*\)\s*$/i,'');
 if(/^master$/i.test(value))return 'Company Details';
 const m=/^register of members(?:\s+0*(\d+))?/i.exec(value);
 if(m)return 'Members'+(m[1]?' · '+Number(m[1]):'');
 return value.replace(/^register (?:of|or)\s+/i,'').replace(/\bBO\b/i,'Beneficial Owners');
}
export function registerKind(name){
 const s=tidy(name).toLowerCase();
 if(/^master$/.test(s))return 'profile';
 if(/^register of members(?:\s|$)/.test(s))return 'member';
 if(/pdf page|word register text/.test(s))return 'text';
 return 'table';
}
function field(row,col,label,value){
 return {row,col,label:cleanLabel(label)||'Column '+(col+1),value:String(value??'')};
}
function rowCells(row){
 return (row||[]).map((v,col)=>({col,value:tidy(v)})).filter(x=>x.value);
}
function isLabel(v){
 const s=tidy(v);
 return s.length>1&&s.length<85&&/:$/.test(s);
}
function profileFields(rows,limit=100){
 const fields=[];
 let carry='';
 for(let ri=0;ri<Math.min(rows.length,limit);ri++){
  const row=rows[ri]||[];
  const entries=rowCells(row);
  if(!entries.length)continue;
  let found=false;
  for(const item of entries){
   if(!isLabel(item.value))continue;
   const col=item.col+1;
   if(col>=row.length)continue;
   fields.push(field(ri,col,item.value,row[col]));
   carry=cleanLabel(item.value);
   found=true;
  }
  // Registered office often continues over several lines in the same cell column.
  if(!found&&carry&&row[1]&&!row[0] && fields.length){
   fields.push(field(ri,1,carry+' · continued',row[1]));
  }
 }
 return fields;
}
function headerCandidate(row){
 const entries=rowCells(row);
 if(entries.length<3)return -1;
 // A person/shareholder data row may contain more filled columns than its
 // header, but must never be interpreted as a new header. Check the first
 // heading using these actual Malaysian statutory workbook labels.
 const first=tidy(row?.[0]||'');
 if(!/^(?:director name|full name|name|date|registered no\.?|registration no\.?|allotment no\.?|transfer no\.?|chargee(?: name)?|folio(?: no\.?)?|no\.?(?: of)?(?: shares)?)$/i.test(first))return -1;
 const short=entries.filter(x=>x.value.length<=95);
 if(short.length<Math.max(3,Math.ceil(entries.length*0.68)))return -1;
 const texts=entries.map(x=>x.value);
 const hints=texts.filter(isDateOrPerson).length;
 if(hints<2)return -1;
 if(/^company name|^company no|^last update/i.test(texts[0]||''))return -1;
 return entries.length*2+hints;
}
function findHeader(rows,{start=0}={}){
 let best={row:-1,score:-1};
 for(let i=start;i<Math.min(rows.length,38);i++){
  const score=headerCandidate(rows[i]||[]);
  if(score>best.score)best={row:i,score};
 }
 return best.score>=0?best.row:-1;
}
function isPlaceholder(row){
 const entries=rowCells(row);
 return !entries.length||entries.every(x=>absent(x.value)||/^0(?:\.0+)?$/.test(x.value));
}
function statusFor(fields){
 const cessation=fields.find(f=>/\b(?:date of cessation|cessation date|date ceased|date of discharge|date ceased to be|date of resignation)\b/i.test(f.label));
 if(!cessation)return 'unknown';
 return absent(cessation.value)?'current':'former';
}
function titleFor(fields,index){
 const preferred=fields.find(f=>/^(?:director name|full name|name|allottee'?s? name|chargee(?: name)?|name of chargee|transferor name|registered no\.?)$/i.test(f.label));
 const named=preferred||fields.find(f=>/\b(?:name|registered no|allotment no|transfer no)\b/i.test(f.label));
 const first=named||fields.find(f=>!absent(f.value));
 return first&&!absent(first.value)?tidy(first.value).slice(0,160):'Entry '+(index+1);
}
function parseTable(rows,from=0){
 const headerRow=findHeader(rows,{start:from});
 if(headerRow<0)return {headerRow:-1,records:[],introFields:[]};
 const header=rows[headerRow]||[];
 const headers=Array.from({length:header.length},(_,col)=>cleanLabel(header[col]));
 const records=[];
 for(let ri=headerRow+1;ri<rows.length;ri++){
  const raw=rows[ri]||[];
  if(isPlaceholder(raw))continue;
  // Avoid treating repeated print headings, totals or explanatory notes as data.
  const first=tidy(raw[0]);
  if(/^(?:register of |total(?:\s|:)|notes?:|date\b.*class of shares)/i.test(first))continue;
  if(headerCandidate(raw)>=0&&tidy(raw[0])===tidy(header[0]))continue;
  const width=Math.max(raw.length,headers.length);
  const fields=[];
  for(let col=0;col<width;col++){
   if(!headers[col]&&absent(raw[col]))continue;
   fields.push(field(ri,col,headers[col]||'Column '+(col+1),raw[col]||''));
  }
  if(!fields.some(f=>!absent(f.value)))continue;
  const index=records.length;
  records.push({row:ri,title:titleFor(fields,index),fields,status:statusFor(fields)});
 }
 return {headerRow,records,introFields:[]};
}
function memberDetails(rows){
 // Members use a folio-style form followed by an acquired/transferred shares
 // ledger. Do not misread the folio's left/right key-value columns as a table.
 const ledgerStart=rows.findIndex((r,i)=>i>5&&rowCells(r).some(c=>/^shares acquired$/i.test(c.value)));
 const stop=ledgerStart<0?Math.min(rows.length,45):ledgerStart;
 const fields=[];
 for(let ri=0;ri<stop;ri++){
  const row=rows[ri]||[];
  for(let col=0;col<row.length-1;col++){
   if(!isLabel(row[col]))continue;
   // Skip repeats of company identity; displayed at the top of the workspace.
   if(/^(?:company name|company no|last update):$/i.test(tidy(row[col])))continue;
   fields.push(field(ri,col+1,row[col],row[col+1]));
   col++;
  }
  // Long member addresses may occupy several subsequent rows.
  if(!row[0]&&row[1]&&fields.some(f=>/^address$/i.test(f.label))){
   fields.push(field(ri,1,'Address · continued',row[1]));
  }
 }
 const key=fields.find(f=>/^name$/i.test(f.label));
 const record=fields.length?{
  row:key?.row||0,title:key?.value||'Member particulars',
  fields,status:statusFor(fields)
 }:null;
 const ledger=ledgerStart<0?{headerRow:-1,records:[]}:
  parseTable(rows,ledgerStart+1);
 return {kind:'member',fields,records:record?[record]:[],ledger};
}
export function describeStatutorySheet(sheet){
 const rows=sheet?.rows||[],name=sheet?.name||'Register';
 const kind=registerKind(name);
 if(kind==='profile')return {kind,label:registerLabel(name),fields:profileFields(rows),records:[],headerRow:-1};
 if(kind==='member')return {label:registerLabel(name),...memberDetails(rows)};
 if(kind==='text'){
  const records=[];
  for(let i=0;i<rows.length;i++){
   if(isPlaceholder(rows[i]))continue;
   const f=field(i,0,'Document text',rows[i]?.[0]||'');
   records.push({row:i,title:'Line '+(i+1),fields:[f],status:'unknown'});
  }
  return {kind,label:registerLabel(name),fields:[],records,headerRow:-1};
 }
 const parsed=parseTable(rows);
 if(parsed.headerRow<0){
  return {kind:'unstructured',label:registerLabel(name),fields:profileFields(rows),records:[],headerRow:-1};
 }
 return {kind:'table',label:registerLabel(name),fields:[],...parsed};
}
export function summaryForReview(book){
 const sheets=(book?.sheets||[]).map(s=>({name:s.name,label:registerLabel(s.name),...describeStatutorySheet(s)}));
 const named=needle=>sheets.filter(s=>needle.test(s.name))
  .reduce((n,s)=>n+s.records.length,0);
 return {
  sheets,
  directors:named(/register of directors/i),
  members:named(/register of members/i),
  beneficialOwners:named(/register of (?:bo|beneficial owners)/i),
  charges:named(/register of charges/i)
 };
}
export function filterReviewRecords(records,{query='',status='all'}={}){
 const q=tidy(query).toLowerCase();
 return (records||[]).filter(r=>(status==='all'||r.status===status)
  &&(!q||[r.title,...r.fields.map(f=>f.value),...r.fields.map(f=>f.label)]
   .some(v=>String(v).toLowerCase().includes(q))));
}
