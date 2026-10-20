// Privacy-first import of machine-readable Malaysian Register Book text.
// Nothing is uploaded. Ambiguous items remain blank for manual confirmation.
const clean=v=>String(v??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
const standard=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
const ID='\\d{6}[- ]?\\d{2}[- ]?\\d{4}', DATE='\\d{2}\\/\\d{2}\\/\\d{4}';
const SECTION=/REGISTER OF (?:DIRECTORS|MEMBERS|ALLOTMENT|SECRETARIES|BENEFICIAL OWNERS(?: \(BO\))?|CHARGES|TRANSFER|REGISTERED CHARGES)\b/gi;
const label=(text,rx)=>clean(text.match(rx)?.[1]||'');
const dedupe=rows=>[...new Map(rows.map(x=>[standard(x.nric||x.name),x])).values()];
const usefulName=value=>{
 let s=clean(value).replace(/\b(?:DIRECTOR NAME|FULL NAME|DATE OF CESSATION|DATE OF APPOINTMENT|NRIC NO|PASSPORT NO|SERVICE ADDRESS|RESIDENTIAL ADDRESS|BUSINESS OCCUPATION|PASSPORT EXPIRY|RECEIVED|FOLIO NO)\b/gi,' ').trim();
 s=s.replace(/^(?:REGISTER OF [A-Z ]+|COMPANY DIRECTOR)\s*/i,'').trim();
 const tokens=s.split(/\s+/);if(tokens.length>6)s=tokens.slice(-5).join(' ');
 return /^[A-Z][A-Z'’().\/ -]{3,80}$/i.test(s)&&s.split(/\s+/).length>=2?s:'';
};
function section(text,kind){
 const heading=kind==='bo'?'BENEFICIAL OWNERS':kind;
 const titles=[...text.matchAll(SECTION)];
 const first=titles.findIndex(x=>new RegExp('^REGISTER OF '+heading+'\\b','i').test(x[0]));
 if(first<0)return '';
 let last=first;
 // PDF exports repeat "REGISTER OF MEMBERS" at the top of every page.
 // Treat identical repeated headings as continuations of the same register.
 while(last+1<titles.length&&new RegExp('^REGISTER OF '+heading+'\\b','i').test(titles[last+1][0]))last++;
 return text.slice(titles[first].index,titles[last+1]?.index);
}
function directors(text){
 const src=section(text,'DIRECTORS');if(!src)return [];
 const flat=src.replace(/\s+/g,' ');
 const rx=new RegExp('([A-Z][A-Z\\x27’()./ -]{3,95}?)\\s+('+DATE+')\\s+('+ID+')','g'),matches=[...flat.matchAll(rx)],out=[];
 for(let i=0;i<matches.length;i++){
  const m=matches[i],name=usefulName(m[1]);if(!name)continue;
  const chunk=flat.slice(m.index+m[0].length,matches[i+1]?.index??undefined);
  if(new RegExp(DATE+'\\s+'+DATE+'\\s*$').test(chunk))continue;
  out.push({name,dob:m[2],nric:clean(m[3])});
 }
 return dedupe(out);
}
function members(text){
 const src=section(text,'MEMBERS');if(!src)return [];
 const flat=src.replace(/\s+/g,' ');
 const rx=/\bName\s*:\s*([A-Z][A-Z0-9 '&().\/-]{2,110}?)\s+Date of Birth\s*:\s*(\d{2}\/\d{2}\/\d{4})/gi;
 const matches=[...flat.matchAll(rx)],out=[];
 for(let i=0;i<matches.length;i++){
  const m=matches[i],chunk=flat.slice(m.index,matches[i+1]?.index??undefined),name=clean(m[1]);
  if(!name||name.length>100)continue;
  const shares=label(chunk,/\bTotal Shares Held\s*:\s*([\d,]+)/i);
  if(shares&&Number(shares.replace(/,/g,''))===0)continue;
  if(/\bDate Ceased to be A Member\s*:\s*\d{2}\/\d{2}\/\d{4}/i.test(chunk))continue;
  const before=flat.slice(Math.max(0,m.index-350),m.index);
  const folio=[...before.matchAll(/Folio No\.\s*:\s*(\d+)/gi)].at(-1)?.[1]||'';
  const nric=label(chunk,/\bIdentification No\.\s*:\s*([A-Z0-9-]+)/i);
  const nationality=label(chunk,/\bNationality\/Origin\s*:\s*([A-Z ]+?)(?=\s+(?:Race:|Occupation:|Address:|Identification No\.:|Email Address:|Date Entered|ID Type:|Total Shares Held:))/i);
  const type=label(chunk,/\bID Type\s*:\s*(NRIC|PASSPORT|REGISTRATION NO\.?|COMPANY)/i);
  const cls=/\bOrdinary\b/i.test(chunk)&&!/\bPreference\b/i.test(chunk)?'Ordinary':(/\bPreference\b/i.test(chunk)&&!/\bOrdinary\b/i.test(chunk)?'Preference':'');
  out.push({name,dob:m[2],nric,nationality,folio,shares,shareClass:cls,type:/^(NRIC|PASSPORT)$/i.test(type)?'Individual':'',idType:type});
 }
 return dedupe(out);
}
function owners(text){
 const src=section(text,'BENEFICIAL OWNERS');if(!src)return [];
 // Remove the statutory register title before matching the first BO row.
 // Otherwise title fragments such as '(BO)' or 'Section 60B' attach to a person's name.
 const firstLine=src.indexOf('\n');
 const flat=(firstLine>=0?src.slice(firstLine+1):src.replace(/^REGISTER OF BENEFICIAL OWNERS(?: \(BO\))?/i,'')).replace(/\s+/g,' ');
 const rx=new RegExp('([A-Z][A-Z\\x27’()./ -]{3,90}?)\\s+('+ID+')\\s+('+DATE+')','g'),matches=[...flat.matchAll(rx)],out=[];
 for(let i=0;i<matches.length;i++){
  const m=matches[i],name=usefulName(m[1]);if(!name)continue;
  const chunk=flat.slice(m.index+m[0].length,matches[i+1]?.index??undefined);
  if(/Date ceased\s*:\s*\d{2}\/\d{2}\/\d{4}/i.test(chunk))continue;
  const percentage=label(chunk,/(\d{1,3}(?:\.\d{1,4})?)\s+(?:DIRECT|INDIRECT)(?:\s*&\s*(?:DIRECT|INDIRECT))?\s+OWNERSHIP/i);
  const ownership=label(chunk,/\b(DIRECT|INDIRECT)(?:\s*&\s*(DIRECT|INDIRECT))?\s+OWNERSHIP/i);
  const criteria=[...new Set([...chunk.matchAll(/\bCRITERIA\s+([ABCDE])\b/gi)].map(x=>'Criteria '+x[1].toUpperCase()))].join(', ');
  out.push({name,nric:clean(m[2]),dob:m[3],percentage,ownership,criteria});
 }
 return dedupe(out);
}
function secretaries(text){
 const src=section(text,'SECRETARIES');if(!src)return [];
 const flat=src.replace(/\s+/g,' ');
 const rx=new RegExp('([A-Z][A-Z\\x27’()./ -]{3,95}?)\\s*\\((MIA\\d+|LS\\d+|MAICSA\\d+|PC\\d+)\\)\\s+('+ID+')','gi'),matches=[...flat.matchAll(rx)],out=[];
 for(let i=0;i<matches.length;i++){
  const m=matches[i],name=usefulName(m[1]);if(!name)continue;
  const chunk=flat.slice(m.index+m[0].length,matches[i+1]?.index??undefined);
  if(new RegExp(DATE+'\\s+'+DATE+'\\s*$').test(chunk))continue;
  out.push({name,membership:m[2],nric:clean(m[3])});
 }
 return dedupe(out);
}
export function parseRegisterBookText(text){
 if(typeof text!=='string'||!text.trim()||text.length>2_000_000)throw Error('Register Book text is empty or too large.');
 const src=text.replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ');
 const first=src.search(SECTION),header=first>=0?src.slice(0,first):src.slice(0,1600);
 const parsed={
  company:{
   name:label(header,/\bCompany Name\s*:\s*(.+?)(?=\n|Company No\.)/i),
   no:label(header,/\bCompany No\.\s*:\s*(.+?)(?=\n|Last update:|Date of Incorporation:)/i),
   incorporated:label(header,/\bDate of Incorporation\s*:\s*(\d{2}\/\d{2}\/\d{4})/i),
   office:label(header,/\bRegistered Office\s*:\s*([\s\S]*?)(?=\bREGISTER OF\b|$)/i).replace(/\s+/g,' ').slice(0,450)
  },
  directors:directors(src),members:members(src),beneficialOwners:owners(src),secretaries:secretaries(src),warnings:[]
 };
 if(!parsed.company.name)parsed.warnings.push('Company name could not be verified.');
 if(!parsed.directors.length)parsed.warnings.push('Current directors not confidently extracted.');
 if(!parsed.members.length)parsed.warnings.push('Current shareholders not confidently extracted.');
 if(!parsed.beneficialOwners.length)parsed.warnings.push('Beneficial owners not found; verify against eBOS.');
 return parsed;
}
const recordRules={
 director:{heading:/^DIRECTOR \d+$/i,label:'DIRECTOR',identity:'Full Name'},
 member:{heading:/^MEMBER \d+$/i,label:'MEMBER',identity:'Individual Full Name'},
 bo:{heading:/^BENEFICIAL OWNER \d+$/i,label:'BENEFICIAL OWNER',identity:'Full Name'}
};
function blocks(items,kind){
 const rx=recordRules[kind].heading,out=[];
 for(let i=0;i<items.length;i++){
  if(items[i].type!=='heading'||!rx.test(items[i].en||''))continue;
  let end=i+1;while(end<items.length&&items[end].type==='field')end++;
  out.push({start:i,end,items:items.slice(i+1,end)});
 }
 return out;
}
function findRecord(items,kind,name){
 const rule=recordRules[kind],all=blocks(items,kind);
 const named=all.find(b=>b.items.some(x=>x.en===rule.identity&&standard(x.value)===standard(name)));
 if(named)return named;
 const empty=all.find(b=>!b.items.some(x=>x.en===rule.identity&&clean(x.value)));
 if(empty)return empty;
 const source=all[0];if(!source)return null;
 const clone=items.slice(source.start,source.end).map(x=>({...x,value:''}));
 if(items.length+clone.length>1200)return null;
 const number=Math.max(0,...all.map(b=>Number(items[b.start].en.match(/\d+$/)?.[0]||0)))+1;
 clone[0].en=rule.label+' '+number;
 clone[0].cn=clone[0].cn.replace(/\d+\s*$/,String(number));
 const tail=all.at(-1);items.splice(tail.end,0,...clone);
 return {start:tail.end,end:tail.end+clone.length,items:clone.slice(1)};
}
function setField(items,key,value,stats,overwrite){
 if(!clean(value))return;
 const field=items.find(x=>x.type==='field'&&x.en===key);if(!field)return;
 if(!overwrite&&clean(field.value)){if(clean(field.value)!==clean(value))stats.skipped++;return;}
 if(clean(field.value)===clean(value))return;
 field.value=String(value).slice(0,1000);stats.filled++;
}
function sectionFields(items,name){
 const i=items.findIndex(x=>x.type==='section'&&x.en===name);if(i<0)return [];
 let end=i+1;while(end<items.length&&items[end].type!=='section')end++;
 return items.slice(i+1,end).filter(x=>x.type==='field');
}
function matchCompany(a,b){
 if(!clean(a)||!clean(b))return true;
 return standard(a)===standard(b);
}
export function applyRegisterBookImport(doc,register,{overwrite=false}={}){
 if(!Array.isArray(doc?.particulars)||!register?.company)throw Error('Invalid Annual Return or register.');
 const companyFields=sectionFields(doc.particulars,'COMPANY DETAILS');
 const current=companyFields.find(x=>x.en==='Company Name')?.value||doc.company?.name;
 const currentNo=companyFields.find(x=>x.en==='Company Registration No.')?.value||doc.company?.no;
 if(!matchCompany(current,register.company.name))throw Error('Company name does not match the Annual Return. Select the correct Register Book.');
 if(clean(currentNo)&&clean(register.company.no)){
  const a=clean(currentNo).match(/\d{12}/)?.[0],b=clean(register.company.no).match(/\d{12}/)?.[0];
  if(a&&b&&a!==b)throw Error('Company registration number does not match the Annual Return.');
 }
 const stats={filled:0,skipped:0,directors:0,members:0,beneficialOwners:0,secretaries:0};
 const fill=(fields,key,value)=>setField(fields,key,value,stats,overwrite);
 fill(companyFields,'Company Name',register.company.name);
 fill(companyFields,'Company Registration No.',register.company.no);
 fill(companyFields,'Date of Incorporation',register.company.incorporated);
 fill(sectionFields(doc.particulars,'SECTION A - PARTICULARS OF COMPANY'),'Registered Office',register.company.office);
 for(const p of register.directors||[]){
  const block=findRecord(doc.particulars,'director',p.name);if(!block)continue;
  fill(block.items,'Full Name',p.name);fill(block.items,'NRIC / Passport No.',p.nric);fill(block.items,'Date of Birth',p.dob);stats.directors++;
 }
 for(const p of register.members||[]){
  const block=findRecord(doc.particulars,'member',p.name);if(!block)continue;
  fill(block.items,'Member Folio',p.folio);fill(block.items,'Member Type',p.type||'Individual');
  fill(block.items,'Individual Full Name',p.name);fill(block.items,'Individual NRIC / Passport No.',p.nric);
  fill(block.items,'Individual Identification Type',p.idType);fill(block.items,'Individual Date of Birth',p.dob);
  fill(block.items,'Individual Nationality / Citizenship',p.nationality);
  fill(block.items,'Class of Shares',p.shareClass);fill(block.items,'Number of Shares Held',p.shares);stats.members++;
 }
 for(const p of register.beneficialOwners||[]){
  const block=findRecord(doc.particulars,'bo',p.name);if(!block)continue;
  fill(block.items,'Full Name',p.name);fill(block.items,'NRIC No.',p.nric);fill(block.items,'Date of Birth',p.dob);
  fill(block.items,'Recorded Ownership / Voting Rights Percentage',p.percentage);
  fill(block.items,'Type of Beneficial Ownership',p.ownership?p.ownership.charAt(0)+p.ownership.slice(1).toLowerCase():'');
  fill(block.items,'Criteria of Beneficial Ownership',p.criteria);stats.beneficialOwners++;
 }
 const pos=doc.particulars.findIndex(x=>x.type==='heading'&&x.en==='COMPANY SECRETARY');
 if(pos>=0&&(register.secretaries||[]).length){
  const fields=[];for(let i=pos+1;i<doc.particulars.length&&doc.particulars[i].type==='field';i++)fields.push(doc.particulars[i]);
  const p=register.secretaries[0];fill(fields,'Secretary Name',p.name);fill(fields,'Secretary NRIC',p.nric);
  fill(fields,'Professional Membership',p.membership);stats.secretaries++;
 }
 const nameField=companyFields.find(x=>x.en==='Company Name'),noField=companyFields.find(x=>x.en==='Company Registration No.');
 if(doc.company){if(nameField?.value)doc.company.name=nameField.value;if(noField?.value)doc.company.no=noField.value;}
 return stats;
}
