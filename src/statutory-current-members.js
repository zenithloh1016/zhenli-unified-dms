/**
 * Read complete multi-folio Malaysian Register of Members worksheets.
 * A single worksheet often holds 2–15 historical folios and their ledgers.
 * Never infer current holdings by adding incomplete transfer transactions.
 */
const txt=v=>String(v??'').trim();
const label=v=>txt(v).replace(/:$/,'');
const blank=v=>!txt(v)||/^(?:-|–|—|n\/a|na|nil|none)$/i.test(txt(v));
const asField=(row,col,name,value)=>({row,col,label:label(name),value:String(value??'')});
const isName=v=>/^(?:name|full name|shareholder'?s? name|member'?s? name):$/i.test(txt(v));
const isCeased=v=>/^(?:date ceased to be a member|date ceased to be member|date of cessation|cessation date|date ceased|date of resignation)$/i.test(label(v));
const isTotal=v=>/^(?:total (?:no\.? of |number of )?shares held|current (?:no\.? of |number of )?shares held|(?:no\.? of |number of )?shares held|shares held|shareholding|total shareholding)$/i.test(label(v));
const isIdentity=v=>/^(?:identification (?:no\.?|number)|nric(?:\/passport)?(?: no\.?)?|passport(?: no\.?)?|registration (?:no\.?|number)|company registration (?:no\.?|number))$/i.test(label(v));
export function positiveShares(value){
 const raw=txt(value).replace(/[,\s]/g,'');
 if(!/^\+?\d+(?:\.\d+)?$/.test(raw))return false;
 return Number(raw)>0&&Number.isFinite(Number(raw));
}
function ledgerBalance(rows,start,end){
 let col=-1,last=null;
 for(let i=start;i<end;i++){
  const row=rows[i]||[];
  const heading=row.findIndex(v=>/^(?:balance of shares|share balance)$/i.test(txt(v)));
  if(heading>=0){col=heading;continue;}
  if(col<0)continue;
  if(!blank(row[col]))last=asField(i,col,'Current Number of Shares Held',row[col]);
 }
 return last;
}
/**
 * A register-of-members ledger contains TWO distinct transaction groups:
 *   SHARES ACQUIRED: Date, ... No. of Shares, Consideration
 *   SHARES TRANSFERRED: Date, ... No. of Shares, Consideration, Balance
 * Never take the last "Consideration" cell across both groups: a former
 * shareholder's disposal must not be shown as an acquisition and vice versa.
 *
 * Derive totals from matching non-placeholder ledger transactions, preserving
 * all source cells unchanged. Missing transaction consideration stays unknown;
 * 0 is accepted only when it is attached to an actual recorded transaction.
 */
function ledgerNumber(value,{shares=false}={}){
 const raw=txt(value).replace(/[,\s]/g,'').replace(/^(?:RM|MYR)/i,'');
 const clean=shares?raw.replace(/^\*/,''):raw;
 if(!/^\+?\d+(?:\.\d+)?$/.test(clean))return null;
 const n=Number(clean);
 return Number.isFinite(n)&&n>=0?n:null;
}
const isConsiderationLabel=v=>/^(?:consideration|share consideration|amount of consideration)$/i.test(txt(v));
const isSharesLabel=v=>/^(?:no\.?\s*of shares|number of shares|shares transferred|shares acquired|quantity of shares)$/i.test(txt(v));
function ledgerHeader(row){
 const cols=(row||[]).map((v,i)=>isConsiderationLabel(v)?i:-1).filter(i=>i>=0);
 const shares=(row||[]).map((v,i)=>isSharesLabel(v)?i:-1).filter(i=>i>=0);
 if(cols.length<2||shares.length<2)return null;
 const left=cols[0],right=cols[1],ls=shares.find(i=>i<left),rs=shares.find(i=>i>left&&i<right);
 if(ls===undefined||rs===undefined)return null;
 // In the standard section-50 register the two transaction blocks begin
 // with a date and have a reference number before each share count.
 const firstTransferCol=(row||[]).findIndex((v,i)=>i>left&&i<rs&&/^date\s*$/i.test(txt(v)));
 const dateA=(row||[]).findIndex((v,i)=>i<ls&&/^date\s*$/i.test(txt(v)));
 const dateT=firstTransferCol>=0?firstTransferCol:Math.max(left+1,rs-4);
 return {sharesA:ls,moneyA:left,sharesT:rs,moneyT:right,dateA,dateT,
  referenceA:ls>=3?ls-3:-1,referenceT:rs>=3?rs-3:-1};
}
function ledgerEvidence(row,dateCol,referenceCol,shares,consideration){
 // A number on an unlabeled blank template row is not an actual transfer.
 // A positive share amount is sufficient evidence when the header is known.
 const explicitDate=dateCol>=0&&!blank(row[dateCol]);
 const explicitRef=referenceCol>=0&&!blank(row[referenceCol]);
 return (shares!==null&&shares>0)||
  ((explicitDate||explicitRef)&&consideration!==null&&consideration>0);
}
export function memberLedgerTotals(rows,start,end){
 const summary={
  acquiredShares:0,acquisitionConsideration:0,
  transferredShares:0,transferConsideration:0,
  acquisitionCount:0,transferCount:0,
  acquisitionValueCount:0,transferValueCount:0
 };
 let cols=null;
 // A member folio has its own ledger header and may have repeated headings.
 for(let i=start;i<end;i++){
  const row=rows[i]||[];
  const detected=ledgerHeader(row);
  if(detected){cols=detected;continue;}
  if(!cols)continue;
  const acquired=ledgerNumber(row[cols.sharesA],{shares:true});
  const transferred=ledgerNumber(row[cols.sharesT],{shares:true});
  const paid=ledgerNumber(row[cols.moneyA]);
  const received=ledgerNumber(row[cols.moneyT]);
  if(ledgerEvidence(row,cols.dateA,cols.referenceA,acquired,paid)){
   summary.acquisitionCount++;
   if(acquired!==null)summary.acquiredShares+=acquired;
   if(paid!==null){summary.acquisitionValueCount++;summary.acquisitionConsideration+=paid;}
  }
  if(ledgerEvidence(row,cols.dateT,cols.referenceT,transferred,received)){
   summary.transferCount++;
   if(transferred!==null)summary.transferredShares+=transferred;
   if(received!==null){summary.transferValueCount++;summary.transferConsideration+=received;}
  }
 }
 // Avoid floating binary artefacts from source currency decimals.
 summary.acquisitionConsideration=Math.round((summary.acquisitionConsideration+Number.EPSILON)*100)/100;
 summary.transferConsideration=Math.round((summary.transferConsideration+Number.EPSILON)*100)/100;
 return summary;
}
export function parseMemberFolios(rows){
 const starts=[];
 for(let i=0;i<(rows||[]).length;i++)
  if((rows[i]||[]).some(isName))starts.push(i);
 if(!starts.length)return [];
 const records=[];
 for(let n=0;n<starts.length;n++){
  const start=starts[n],end=starts[n+1]??rows.length;
  const movement=rows.findIndex((row,i)=>i>start&&i<end&&
   (row||[]).some(v=>/^shares acquired$/i.test(txt(v))));
  const detailsEnd=movement>=0?movement:end;
  const fields=[];
  // Folio No. is printed above the member's Name in the source workbook.
  // Keep its original row and column coordinates for editing.
  for(let ri=Math.max(0,start-4);ri<start;ri++){
   const row=rows[ri]||[];
   for(let col=0;col<row.length-1;col++)
    if(/^folio no\.?:$/i.test(txt(row[col])))
     fields.push(asField(ri,col+1,row[col],row[col+1]));
  }
  for(let ri=start;ri<detailsEnd;ri++){
   const row=rows[ri]||[];
   for(let col=0;col<row.length-1;col++){
    if(!/^.{2,84}:\s*$/.test(txt(row[col])))continue;
    if(/^(?:company name|company no|last update):$/i.test(txt(row[col])))continue;
    fields.push(asField(ri,col+1,row[col],row[col+1]));
    col++;
   }
   if(!row[0]&&row[1]&&fields.some(f=>/^address$/i.test(f.label)))
    fields.push(asField(ri,1,'Address · continued',row[1]));
  }
  const named=fields.find(f=>/^(?:name|full name|shareholder'?s? name|member'?s? name)$/i.test(f.label));
  if(!named||blank(named.value))continue;
  const ceased=fields.find(f=>isCeased(f.label));
  const total=fields.find(f=>isTotal(f.label));
  const balance=movement<0?null:ledgerBalance(rows,movement+1,end);
  // An explicit zero is authoritative. Only use a ledger balance when the
  // folio's Total Shares Held is genuinely blank.
  const shareField=total&&!blank(total.value)?total:balance||total||null;
  const identityField=fields.find(f=>isIdentity(f.label))||null;
  const ceasedValue=txt(ceased?.value);
  const status=ceased&&!blank(ceasedValue)&&ceasedValue!=='0'?'former':'current';
  const ledgerTotals=movement<0?null:memberLedgerTotals(rows,movement+1,end);
  records.push({row:named.row,title:txt(named.value),fields,shareField,
   identityField,ceasedField:ceased||null,ledgerTotals,status});
 }
 return records;
}
export function currentMemberKey(record){
 const identity=txt(record?.identityField?.value).replace(/[^a-z0-9]/gi,'').toUpperCase();
 if(identity)return 'ID:'+identity;
 const name=txt(record?.title).replace(/[^a-z0-9]/gi,'').toUpperCase();
 return name?'NAME:'+name:'';
}
export function isCurrentMember(record){
 return record?.status!=='former'&&positiveShares(record?.shareField?.value)&&
  !!txt(record?.title)&&!/^(?:-|n\/a|nil|none)$/i.test(txt(record.title));
}
