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
  records.push({row:named.row,title:txt(named.value),fields,shareField,identityField,status});
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
