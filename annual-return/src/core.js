import template from './template.json' with {type:'json'};
export const SCHEMA_VERSION=2;
export const cloneBlank=()=>structuredClone(template);
const safe=(s,n=20000)=>String(s??'').slice(0,n);

/** Company identity is entered ONCE, in the first Company Details section.
 * Retain the historical company object for PDF filenames and .gs/JSON compatibility.
 */
export const COMPANY_DETAILS={
 'Company Name':'name',
 'Company Registration No.':'no',
 'Annual Return Year':'arYear',
 'Anniversary Date':'arDate'
};
export function syncCompanyDetails(doc,{preferFields=true}={}){
 if(!doc?.company||!Array.isArray(doc.particulars))return doc;
 const first=doc.particulars.findIndex(x=>x.type==='section');
 const end=doc.particulars.findIndex((x,i)=>i>first&&x.type==='section');
 const from=first>=0?first+1:0,to=end>=0?end:doc.particulars.length;
 for(let i=from;i<to;i++){
  const item=doc.particulars[i];if(item.type!=='field')continue;
  const key=COMPANY_DETAILS[item.en];
  if(!key)continue;
  const fieldVal=String(item.value||'').trim(),profileVal=String(doc.company[key]||'').trim();
  if(fieldVal&&(preferFields||!profileVal))doc.company[key]=item.value;
  else if(!fieldVal&&profileVal)item.value=String(doc.company[key]);
 }
 return doc;
}
export function setCompanyDetail(doc,index,value){
 const first=doc.particulars.findIndex(x=>x.type==='section');
 const end=doc.particulars.findIndex((x,i)=>i>first&&x.type==='section');
 if(first<0||index<=first||(end>=0&&index>=end))return;
 const key=COMPANY_DETAILS[doc.particulars[index]?.en];
 if(key)doc.company[key]=String(value||'');
}

function readJsonObjectAfter(script,marker){
  const start=script.indexOf(marker);
  if(start<0) return null;
  const assign=script.indexOf('=',start+marker.length);
  if(assign<0)throw Error('Invalid Apps Script assignment: '+marker);
  const begin=script.indexOf('{',assign);
  if(begin<0)throw Error('Missing JSON data after '+marker);
  let depth=0,quoted=false,escaped=false;
  for(let i=begin;i<script.length;i++){
    const ch=script[i];
    if(quoted){
      if(escaped)escaped=false;
      else if(ch==='\\')escaped=true;
      else if(ch==='"')quoted=false;
    }else if(ch==='"')quoted=true;
    else if(ch==='{')depth++;
    else if(ch==='}'&&!--depth){
      try{return JSON.parse(script.slice(begin,i+1));}
      catch{throw Error(marker+' is not a JSON-compatible Apps Script object. Use a previously generated .gs or JSON file.');}
    }
  }
  throw Error('Unfinished Apps Script data object: '+marker);
}
export function normalizeDocument(raw){
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.particulars))throw Error('Expected an Annual Return object with a particulars array.');
  if(raw.particulars.length>1200)throw Error('The imported script has too many fields.');
  const company=raw.company||{};
  const director=raw.signatureDirector||raw.signatory||{};
  const doc={
    schemaVersion:SCHEMA_VERSION,
    company:{name:safe(company.name,300),no:safe(company.no,120),
      arYear:safe(company.arYear,12),arDate:safe(company.arDate,40)},
    signatureDirector:{name:safe(director.name,200),nric:safe(director.nric||director.id||'',100),date:safe(director.date||'',40),
      acknowledgement:safe(director.acknowledgement||'',500),designation:safe(director.designation||'Director',80)},
    particulars:raw.particulars.filter(x=>x&&['field','section','heading'].includes(x.type)&&!
      /^(?:Statutory Lodgement Deadline(?: \(30 calendar days\))?|Master Listing Internal Due Date|Register Last Updated|Master Listing Internal Due vs Statutory 30 Days)$/i.test(String(x.en||'').trim())).map(x=>({
      type:x.type,en:safe(x.en,350),cn:safe(x.cn,350),value:x.type==='field'?safe(x.value,15000):''
    }))
  };
  // Historic .gs source may omit this controlled field; append it without deleting any data.
  if(!doc.particulars.some(x=>x.type==='field'&&x.en==='Type of Shares Issued')){
    const i=doc.particulars.findIndex(x=>x.type==='section'&&/SHARE CAPITAL/i.test(x.en));
    if(i>=0)doc.particulars.splice(i+1,0,{type:'field',en:'Type of Shares Issued',cn:'股份发行方式（现金／非现金）',value:''});
  }
  if(!doc.particulars.length)throw Error('No valid Annual Return particulars found.');
  // Old Google Apps Script files called this first group "COMPANY INFORMATION".
  // Show the new Company Details title without changing any supplied values.
  const firstSection=doc.particulars.find(x=>x.type==='section');
  if(firstSection&&/^(?:COMPANY INFORMATION|COMPANY PARTICULARS|COMPANY DETAILS)$/i.test(firstSection.en.trim())){
    firstSection.en='COMPANY DETAILS';
    firstSection.cn='公司资料';
  }
  return syncCompanyDetails(doc);
}
export function importAnnualReturnText(content,filename=''){
  if(typeof content!=='string'||content.length>3_000_000)throw Error('Select a .gs/.json file smaller than 3 MB.');
  const name=filename.toLowerCase();
  if(name.endsWith('.gs')||/const\s+AR_SINGLE_COMPANY\s*=/.test(content)){
    const raw=readJsonObjectAfter(content,'AR_SINGLE_COMPANY');
    if(!raw)throw Error('Apps Script does not contain AR_SINGLE_COMPANY.');
    const sig=readJsonObjectAfter(content,'AR_SIGNATURE_DIRECTOR');
    if(sig)raw.signatureDirector=sig;
    return normalizeDocument(raw);
  }
  try{
    const raw=JSON.parse(content);
    return normalizeDocument(raw.AR_SINGLE_COMPANY||raw);
  }catch(error){
    if(error.message?.startsWith('Expected'))throw error;
    throw Error('Invalid JSON backup or Annual Return script. '+error.message);
  }
}
export const outputFilename=doc=>{
  const name=safe(doc.company.name||'COMPANY',75).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/\s+/g,' ').trim();
  const year=safe(doc.company.arYear||new Date().getFullYear(),8).replace(/[^0-9]/g,'')||'YEAR';
  return name+' - Annual Return '+year+' Review.pdf';
};
export const populatedCount=doc=>doc.particulars.filter(x=>x.type==='field'&&String(x.value||'').trim()).length;
export const emptyCount=doc=>doc.particulars.filter(x=>x.type==='field'&&!String(x.value||'').trim()).length;
