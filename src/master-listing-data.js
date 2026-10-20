/* Pure Master Listing tab data model. Preserves every imported worksheet column.
   Values are stored as strings, so company registration numbers and leading zeros
   are not changed during importing or editing. */
const LIMIT_ROWS=5000,LIMIT_COLUMNS=200,LIMIT_VALUE=15000;
export const listingLimits={rows:LIMIT_ROWS,columns:LIMIT_COLUMNS};
const normal=s=>String(s??'').normalize('NFKC').trim().replace(/\s+/g,' ');
const key=s=>normal(s).toLowerCase().replace(/[^a-z0-9]/g,'');
const nameHeader=/^(?:company(?:name|names)?|nameofcompan(?:y|ies)|companysname|clientsname|clientname|namasyarikat|namapelanggan|syarikat)$/;
const regHeader=/(?:reg(?:istration)?|company|ssm|roc).*?(?:no|number)$|registrationnumber/;
const invalidName=/^(?:company|name|total|grand total|no|bil|remarks|summary|registration|number|client|sheet\d+)$/i;
function clean(value){
 if(value===null||value===undefined)return '';
 const text=String(value);
 if(text.length>LIMIT_VALUE)throw Error('A Master Listing cell exceeds '+LIMIT_VALUE+' characters.');
 return text.replace(/\u0000/g,'');
}
export function detectListingColumns(rows){
 let detected={headerRow:1,startRow:2,nameColumn:0,registrationColumn:-1,score:-1};
 for(let i=0;i<Math.min(30,rows?.length||0);i++){
  const cells=rows[i]||[];
  for(let c=0;c<Math.min(cells.length,LIMIT_COLUMNS);c++){
   const label=key(cells[c]);
   if(!nameHeader.test(label)&&!/companyname|nameofcompany|namasyarikat|companysname/.test(label))continue;
   const score=nameHeader.test(label)?6:4;
   if(score>detected.score){
    const reg=cells.findIndex((x,j)=>j!==c&&regHeader.test(key(x)));
    detected={headerRow:i+1,startRow:i+2,nameColumn:c,registrationColumn:reg,score};
   }
  }
 }
 return {headerRow:detected.headerRow,startRow:detected.startRow,
  nameColumn:detected.nameColumn,registrationColumn:detected.registrationColumn};
}
export function buildMasterListing(rows,opts={}){
 if(!Array.isArray(rows)||!rows.length)throw Error('This worksheet has no readable rows.');
 const options={...detectListingColumns(rows),...opts};
 const headerIndex=Number(options.headerRow)-1,startIndex=Number(options.startRow)-1;
 if(!Number.isInteger(headerIndex)||headerIndex<0||headerIndex>=rows.length)throw Error('Invalid header row.');
 if(!Number.isInteger(startIndex)||startIndex<=headerIndex||startIndex>=rows.length)throw Error('First company row must be below the header and within the worksheet.');
 const nameColumn=Number(options.nameColumn),regColumn=Number(options.registrationColumn);
 const width=Math.max(1,...rows.slice(headerIndex,Math.min(rows.length,startIndex+40)).map(r=>r?.length||0));
 if(width>LIMIT_COLUMNS)throw Error('The worksheet has more than '+LIMIT_COLUMNS+' columns. Split it into a smaller listing.');
 if(nameColumn<0||nameColumn>=width||!Number.isInteger(nameColumn))throw Error('Select the company-name column.');
 if(regColumn>=width||regColumn<-1||!Number.isInteger(regColumn))throw Error('Registration number column is invalid.');
 const columns=Array.from({length:width},(_,i)=>({
  id:'c'+i,label:normal(rows[headerIndex]?.[i])||'Column '+(i+1)
 }));
 const seen=new Set(),importRows=[],skipped={blank:0,duplicate:0};
 for(let i=startIndex;i<rows.length;i++){
  const values=columns.map((_,j)=>clean(rows[i]?.[j]));
  const name=normal(values[nameColumn]).split(/\r?\n/)[0];
  if(!name||name.length<3||/^[\d\W]+$/.test(name)||invalidName.test(name)){skipped.blank++;continue;}
  const normalized=key(name),registration=regColumn>=0?normal(values[regColumn]):'';
  const unique=registration.replace(/[^A-Z0-9]/gi,'').toLowerCase()||normalized;
  if(seen.has(unique)){skipped.duplicate++;continue;}
  seen.add(unique);
  importRows.push({id:'r'+importRows.length,values});
  if(importRows.length>LIMIT_ROWS)throw Error('The listing contains more than '+LIMIT_ROWS+' companies. Split the workbook.');
 }
 if(!importRows.length)throw Error('No valid company rows were found. Check the heading row and company name column.');
 return {version:1,filename:String(options.filename||'Master Listing.xlsx').slice(0,250),
  worksheet:String(options.worksheet||'Master Listing').slice(0,120),
  headerRow:headerIndex+1,startRow:startIndex+1,nameColumn,registrationColumn:regColumn,
  columns,rows:importRows,importedAt:new Date().toISOString(),skipped};
}
export function validateMasterListing(value){
 if(!value||value.version!==1||!Array.isArray(value.columns)||!Array.isArray(value.rows))
  throw Error('Stored Master Listing has an unsupported format.');
 if(!value.columns.length||value.columns.length>LIMIT_COLUMNS||value.rows.length>LIMIT_ROWS)
  throw Error('Stored Master Listing exceeds supported limits.');
 if(!Number.isInteger(value.nameColumn)||value.nameColumn<0||value.nameColumn>=value.columns.length)
  throw Error('Stored Master Listing has an invalid company name column.');
 if(!Number.isInteger(value.registrationColumn)||value.registrationColumn>=value.columns.length||value.registrationColumn<-1)
  throw Error('Stored Master Listing has an invalid registration number column.');
 for(const c of value.columns)if(typeof c.label!=='string'||c.label.length>300)throw Error('Invalid listing header.');
 for(const row of value.rows){
  if(!Array.isArray(row.values)||row.values.length!==value.columns.length)throw Error('Invalid listing row.');
  for(const v of row.values)if(typeof v!=='string'||v.length>LIMIT_VALUE)throw Error('Invalid listing cell.');
 }
 return value;
}
export function companyData(model,row){
 if(!model||!row)return null;
 return {name:normal(row.values[model.nameColumn]).split(/\r?\n/)[0],
  registration:model.registrationColumn>=0?normal(row.values[model.registrationColumn]):''};
}
export function findCompanyMatch(model,row,companies){
 const info=companyData(model,row);if(!info)return null;
 const registration=info.registration.match(/\d{12}/)?.[0]||'';
 const regMatches=registration?(companies||[]).filter(c=>String(c.registration_no||'').includes(registration)):[];
 if(regMatches.length===1)return regMatches[0];
 if(regMatches.length>1)return null;
 const nameMatches=(companies||[]).filter(c=>key(c.name)===key(info.name));
 return nameMatches.length===1?nameMatches[0]:null;
}
export function changeListingCell(model,rowIndex,columnIndex,nextValue){
 validateMasterListing(model);
 if(!Number.isInteger(rowIndex)||rowIndex<0||rowIndex>=model.rows.length)throw Error('Invalid company row.');
 if(!Number.isInteger(columnIndex)||columnIndex<0||columnIndex>=model.columns.length)throw Error('Invalid listing column.');
 const value=clean(nextValue);
 if(columnIndex===model.nameColumn&&normal(value).length<3)throw Error('Company name is required.');
 model.rows[rowIndex].values[columnIndex]=value;
 return model;
}
export function listingRowsForSearch(model,search){
 if(!model)return[];
 const q=normal(search).toLowerCase();
 const rows=model.rows.map((r,index)=>({row:r,index}));
 if(!q)return rows;
 return rows.filter(({row})=>row.values.some(v=>v.toLowerCase().includes(q)));
}
export function listingCSV(model){
 validateMasterListing(model);
 const csvCell=value=>{
  // Avoid formula injection when CSV is opened by spreadsheet applications.
  let s=String(value??'');
  if(/^[\s]*[=+\-@]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
 };
 return [model.columns.map(x=>csvCell(x.label)).join(','),
  ...model.rows.map(row=>row.values.map(csvCell).join(','))].join('\r\n');
}
