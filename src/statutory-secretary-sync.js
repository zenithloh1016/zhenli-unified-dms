/**
 * Import ONLY a matching company's saved Annual Return secretary particulars
 * into its Register of Secretaries. Does not assert appointments, cessations
 * or substitute the Annual Return draft for supporting statutory evidence.
 * Pure transformation; call with a validated, cloned register book.
 */
const fields = [
  ['Name','Secretary Name','Full Name'],
  ['SSM Practicing Certificate No.','Practising Certificate Number','SSM Practising Certificate No.'],
  ['Membership No.','Professional Membership','Membership Number'],
  ['Date of Birth','Date of Birth','Secretary Date of Birth'],
  ['Identification No.','Secretary NRIC','NRIC / Passport No.'],
  ['Gender','Gender','Secretary Gender'],
  ['Nationality / Race','Nationality / Race','Nationality'],
  ['Residential Address','Secretary Residential Address','Residential Address'],
  ['Service Address','Service / Business Address','Business Address']
];
const canonical = [
  'Name','SSM Practicing Certificate No.','Membership No.','Date of Birth',
  'Identification No.','Passport Expiry','Gender','Nationality / Race',
  'Business Occupation','Residential Address','Service Address',
  'Appointment Date','Cessation Date'
];
const norm = v => String(v ?? '').trim().replace(/\s+/g,' ');
const key = v => norm(v).toLowerCase().replace(/[^a-z0-9]/g,'');
const personKey = v => norm(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
const meaningful = v => Boolean(norm(v)) && !/^(?:n\/?a|nil|none|not available|-|—)$/i.test(norm(v));
const canonKey = label => {
  const k = key(label);
  const group = {
    'Name':['name','fullname','secretaryname'],
    'SSM Practicing Certificate No.':['ssmpracticingcertificateno','ssmpractisingcertificateno','practisingcertificatenumber','practicingcertificatenumber'],
    'Membership No.':['membershipno','membershipnumber','professionalmembership','membership'],
    'Date of Birth':['dateofbirth','dob','secretarydateofbirth'],
    'Identification No.':['identificationno','identificationnumber','nricno','nricnumber','nricpassportno','secretarynric','icno','passportno'],
    'Gender':['gender','secretarygender'],
    'Nationality / Race':['nationalityrace','nationality','nationalityorigin'],
    'Residential Address':['residentialaddress','secretaryresidentialaddress'],
    'Service Address':['serviceaddress','servicebusinessaddress','businessaddress','secretaryserviceaddress'],
    'Cessation Date':['cessationdate','dateofcessation','dateofresignation','dateceased']
  };
  return Object.keys(group).find(n=>group[n].includes(k)) || '';
};

export function secretaryFromAnnualReturn(document) {
  if(!document || !Array.isArray(document.particulars)) return null;
  let inSecretary=false;
  const result={};
  for(const part of document.particulars) {
    const title=norm(part?.en||part?.displayEn);
    if(part?.type==='heading' || part?.type==='section') {
      if(/^company secretary(?:\s+\d+)?$/i.test(title)) {
        inSecretary=true;
      } else if(inSecretary) {
        // Only this heading's particulars, not auditor or director fields.
        break;
      }
      continue;
    }
    if(!inSecretary || part?.type!=='field')continue;
    const mapped=fields.find(row=>row.slice(1).some(alias=>key(alias)===key(part.en)));
    if(mapped && meaningful(part.value))result[mapped[0]]=norm(part.value);
  }
  return meaningful(result.Name) ? result : null;
}


/**
 * Build a reusable reference only from particulars that agree across all
 * drafts for the SAME verified identification number. Inconsistent addresses
 * are deliberately omitted rather than transferred between companies.
 */
export function unanimousSecretaryReferences(documents){
  const grouped=new Map();
  for(const document of documents||[]){
    const person=secretaryFromAnnualReturn(document);
    if(!person || !meaningful(person['Identification No.']))continue;
    const id=personKey(person['Identification No.']);
    if(!id)continue;
    if(!grouped.has(id))grouped.set(id,[]);
    grouped.get(id).push(person);
  }
  const references=[];
  for(const people of grouped.values()){
    const names=new Set(people.map(p=>personKey(p.Name)));
    if(names.size!==1 || names.has(''))continue;
    const safe={};
    const allKeys=[...new Set(people.flatMap(p=>Object.keys(p)))];
    for(const field of allKeys){
      const values=people.map(p=>p[field]).filter(meaningful);
      if(!values.length)continue;
      const distinct=new Set(values.map(v=>field==='Identification No.'?personKey(v):norm(v)));
      if(distinct.size===1)safe[field]=values[0];
    }
    if(meaningful(safe.Name) && meaningful(safe['Identification No.']))references.push(safe);
  }
  return references;
}

function tableHeader(sheet) {
  const rows=sheet?.rows||[];
  for(let i=0;i<Math.min(rows.length,40);i++) {
    const labels=rows[i]||[];
    if(!Array.isArray(labels))continue;
    const mapped=labels.map(canonKey);
    if(mapped.includes('Name') && mapped.filter(Boolean).length>=3) return {row:i,mapped};
  }
  return null;
}
const isSecretarySheet = s => /^register (?:of|or) secretar(?:y|ies)(?:\b|$)/i.test(norm(s?.name));
function isSame(existing,incoming) {
  const eid=personKey(existing['Identification No.']);
  const iid=personKey(incoming['Identification No.']);
  const en=personKey(existing.Name);
  const nn=personKey(incoming.Name);
  if(eid && iid) return eid===iid;
  return Boolean(en && nn && en===nn);
}
function rowAsObject(row,mapped) {
  const o={};
  for(let i=0;i<mapped.length;i++)if(mapped[i] && meaningful(row?.[i]))o[mapped[i]]=norm(row[i]);
  return o;
}

/** Fill blanks only, never replace recorded facts or reactivate former people. */
export function mergeSecretaryIntoBook(book, incoming, {matchExistingOnly=false}={}) {
  const result={changed:false,added:0,filled:0,conflicts:0,skipped:''};
  if(!book || !Array.isArray(book.sheets) || !meaningful(incoming?.Name)) {
    result.skipped='No secretary particulars or register book'; return result;
  }
  const secretarySheets=book.sheets.map((sheet,index)=>({sheet,index,header:tableHeader(sheet)}))
    .filter(v=>isSecretarySheet(v.sheet));
  if(!secretarySheets.length) {
    if(matchExistingOnly){result.skipped='No recorded Register of Secretaries';return result;}
    if(book.sheets.length>=100){result.skipped='Maximum register sections reached';return result;}
    const sheet={name:'Register of Secretaries',rows:[canonical.slice()]};
    book.sheets.push(sheet);
    secretarySheets.push({sheet,index:book.sheets.length-1,header:tableHeader(sheet)});
  }
  const usable=secretarySheets.filter(v=>v.header);
  if(!usable.length){result.skipped='Secretary register uses an unrecognised layout';return result;}
  const matches=[];
  let conflictingName=false;
  let historicalMatch=false;
  let unmatchedCurrent=false;
  for(const {sheet,index,header} of usable) {
    for(let r=header.row+1;r<sheet.rows.length;r++) {
      const row=sheet.rows[r];
      if(!Array.isArray(row))continue;
      const existing=rowAsObject(row,header.mapped);
      if(!meaningful(existing.Name))continue;
      const ceased=header.mapped.some((field,col)=>field==='Cessation Date' && meaningful(row[col]));
      const status=book.recordStatuses?.[index+':'+r];
      if(isSame(existing,incoming)){
        if(!ceased && status!=='former')matches.push({sheet,index,rowIndex:r,header});
        else historicalMatch=true;
      } else if(personKey(existing.Name)===personKey(incoming.Name)) {
        conflictingName=true;
      } else if(!ceased && status!=='former') {
        unmatchedCurrent=true;
      }
    }
  }
  if(conflictingName || matches.length>1){
    result.skipped='Ambiguous secretary identity or historical entries';
    result.conflicts++; return result;
  }
  if(matches.length===1){
    const {sheet,rowIndex,header}=matches[0];
    const row=sheet.rows[rowIndex];
    for(let c=0;c<header.mapped.length;c++){
      const field=header.mapped[c];
      if(!field || !meaningful(incoming[field]))continue;
      if(!meaningful(row[c])){
        while(row.length<=c)row.push('');
        row[c]=incoming[field];result.filled++;result.changed=true;
      } else if(norm(row[c])!==norm(incoming[field]) &&
          !(field==='Identification No.' && personKey(row[c])===personKey(incoming[field]))){
        result.conflicts++;
      }
    }
    return result;
  }
  // An old ceased appointment never proves that the person has been reappointed.
  // Equally, an unmatched current secretary may be a replacement or a co-secretary.
  // Never infer those statutory events from the Annual Return draft alone.
  if(historicalMatch || unmatchedCurrent){
    result.skipped=historicalMatch?
      'Former matching secretary needs reappointment verification':
      'Existing current secretary needs appointment/cessation verification';
    result.conflicts++;
    return result;
  }
  if(matchExistingOnly){result.skipped='No verified matching secretary entry';return result;}
  // Append only to the canonical sheet; preserve imported history.
  const primary=usable.find(x=>/^register of secretaries$/i.test(norm(x.sheet.name)))||usable[0];
  const row=Array.from({length:primary.header.mapped.length},()=> '');
  for(let c=0;c<primary.header.mapped.length;c++){
    const field=primary.header.mapped[c];
    if(field && meaningful(incoming[field]))row[c]=incoming[field];
  }
  if(!row.some(meaningful)){result.skipped='No compatible secretary fields';return result;}
  primary.sheet.rows.push(row);
  result.added=1;result.changed=true;
  return result;
}
