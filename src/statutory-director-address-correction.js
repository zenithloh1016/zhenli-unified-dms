/**
 * Apply owner-authored residential-address corrections to the actual privately
 * stored Register of Directors, not just the Annual Return projection.
 * Corrections are held in the user's RLS-protected cloud draft; this module
 * contains no names, identity numbers, or residential addresses.
 */
const tidy = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
const key = value => tidy(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
const addressKey = value => tidy(value).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+MALAYSIA$/, '').trim();
const labelKey = value => tidy(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const nameLabels = new Set(['name', 'full name', 'director name']);
const idLabels = new Set(['identification no', 'identification number', 'nric no', 'nric number', 'ic no', 'ic no passport no', 'nric passport no']);
const addressLabels = new Set(['residential address', 'residential address of director']);
const isDirectors = name => /^register (?:of|or) directors?(?:\b|\s*\()/i.test(tidy(name));

function correctionFor(fields, corrections) {
  const name = fields.find(f => nameLabels.has(labelKey(f.label)));
  const identification = fields.find(f => idLabels.has(labelKey(f.label)));
  const address = fields.find(f => addressLabels.has(labelKey(f.label)));
  if (!name || !address) return null;
  for (const item of corrections || []) {
    if (!item?.fullName || !item?.newAddress || !item?.previousAddress) continue;
    if (key(name.value) !== key(item.fullName)) continue;
    if (item.identificationNo && identification?.value && key(item.identificationNo) !== key(identification.value)) continue;
    if (addressKey(address.value) !== addressKey(item.previousAddress)) continue;
    const oldNo = /^(\s*NO\.?\s*)(\d+)\b/i.exec(String(item.previousAddress));
    const nextNo = /^(\s*NO\.?\s*)(\d+)\b/i.exec(String(item.newAddress));
    const existingNo = /^(\s*NO\.?\s*)(\d+)\b/i.exec(String(address.value));
    if (!oldNo || !nextNo || !existingNo || existingNo[2] !== oldNo[2]) continue;
    return {address, value: String(address.value).replace(/^(\s*NO\.?\s*)(\d+)\b/i, (_whole,prefix) => prefix + nextNo[2])};
  }
  return null;
}

export function applyDirectorAddressCorrections(book, corrections) {
  const updated = structuredClone(book);
  let changed = 0;
  for (const sheet of updated?.sheets || []) {
    if (!isDirectors(sheet.name)) continue;
    const rows = sheet.rows || [];
    // Common imported Excel/table layout: column headings followed by one row per director.
    for (let headerRow = 0; headerRow < Math.min(rows.length, 40); headerRow++) {
      const headings = (rows[headerRow] || []).map(labelKey);
      if (!headings.some(label => nameLabels.has(label)) || !headings.some(label => addressLabels.has(label))) continue;
      const firstNameCol = headings.findIndex(label => nameLabels.has(label));
      if (firstNameCol > 2) continue;
      for (let ri = headerRow + 1; ri < rows.length; ri++) {
        const row = rows[ri] || [];
        if (!row[firstNameCol] || nameLabels.has(labelKey(row[firstNameCol]))) continue;
        const fields = headings.map((label,col) => ({label, value:row[col], row:ri, col}));
        const result = correctionFor(fields, corrections);
        if (result && rows[result.address.row]?.[result.address.col] !== result.value) {
          rows[result.address.row][result.address.col] = result.value;
          changed++;
        }
      }
      break;
    }
    // Historical register variants store one labelled field/value pair per row.
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri] || [];
      if (!nameLabels.has(labelKey(row[0])) || !row[1]) continue;
      const fields=[];
      for (let j=ri; j<Math.min(ri+18,rows.length);j++) {
        const r=rows[j]||[];
        if (j>ri && nameLabels.has(labelKey(r[0]))) break;
        if (r.length>=2) fields.push({label:r[0], value:r[1], row:j, col:1});
      }
      const result=correctionFor(fields,corrections);
      if (result && rows[result.address.row]?.[result.address.col] !== result.value) {
        rows[result.address.row][result.address.col]=result.value;
        changed++;
      }
    }
  }
  return {book: changed ? updated : book, changed};
}


/**
 * Build a reviewable correction proposal from an existing Annual Return draft.
 * Require an exact name + identification-number match and the same street /
 * postcode; only the residence's house number may change automatically.
 */
export function proposeDirectorAddressCorrections(book, draft) {
  const particulars=Array.isArray(draft?.particulars)?draft.particulars:[];
  const draftDirectors=[];
  for(let i=0;i<particulars.length;i++){
    const label=tidy(particulars[i]?.en);
    if(!/^DIRECTOR\s+\d+$/i.test(label))continue;
    const record={};
    for(let j=i+1;j<Math.min(i+12,particulars.length);j++){
      const item=particulars[j],field=tidy(item?.en);
      if(/^DIRECTOR\s+\d+$|^COMPANY SECRETARY$|^SECTION\s+[A-Z]\b/i.test(field))break;
      if(field==='Full Name')record.fullName=item.value;
      if(field==='NRIC / Passport No.')record.identificationNo=item.value;
      if(field==='Residential Address')record.newAddress=item.value;
    }
    if(record.fullName&&record.identificationNo&&record.newAddress)
      draftDirectors.push(record);
  }
  const proposals=[],seen=new Set();
  const consider=fields=>{
    const name=fields.find(f=>nameLabels.has(labelKey(f.label)));
    const id=fields.find(f=>idLabels.has(labelKey(f.label)));
    const address=fields.find(f=>addressLabels.has(labelKey(f.label)));
    if(!name||!id||!address||!id.value||!address.value)return;
    const match=draftDirectors.find(d=>key(d.fullName)===key(name.value)&&
      key(d.identificationNo)===key(id.value));
    if(!match)return;
    const oldNo=/^NO\s+(\d+)\b/.exec(addressKey(address.value));
    const nextNo=/^NO\s+(\d+)\b/.exec(addressKey(match.newAddress));
    if(!oldNo||!nextNo||oldNo[1]===nextNo[1])return;
    const oldStreet=addressKey(address.value).replace(/^NO\s+\d+\s+/,'');
    const newStreet=addressKey(match.newAddress).replace(/^NO\s+\d+\s+/,'');
    if(oldStreet!==newStreet)return; // Never silently change street, postcode, or state.
    const proposal={fullName:match.fullName,identificationNo:match.identificationNo,
      previousAddress:String(address.value),newAddress:String(match.newAddress)};
    const signature=[key(proposal.fullName),key(proposal.identificationNo),
      addressKey(proposal.previousAddress),addressKey(proposal.newAddress)].join(':');
    if(!seen.has(signature)){seen.add(signature);proposals.push(proposal);}
  };
  for(const sheet of book?.sheets||[]){
    if(!isDirectors(sheet.name))continue;
    const rows=sheet.rows||[];
    for(let hi=0;hi<Math.min(rows.length,40);hi++){
      const headings=(rows[hi]||[]).map(labelKey);
      if(!headings.some(label=>nameLabels.has(label))||
        !headings.some(label=>addressLabels.has(label)))continue;
      for(let ri=hi+1;ri<rows.length;ri++){
        const row=rows[ri]||[];
        consider(headings.map((label,col)=>({label,value:row[col]})));
      }
      break;
    }
    for(let ri=0;ri<rows.length;ri++){
      const row=rows[ri]||[];
      if(!nameLabels.has(labelKey(row[0]))||!row[1])continue;
      const fields=[];
      for(let j=ri;j<Math.min(ri+18,rows.length);j++){
        const r=rows[j]||[];
        if(j>ri&&nameLabels.has(labelKey(r[0])))break;
        if(r.length>=2)fields.push({label:r[0],value:r[1]});
      }
      consider(fields);
    }
  }
  return proposals;
}


/**
 * Unified person/identity residential-address correction across the user's
 * editable Registers of Directors, Members and Beneficial Owners. Original
 * archived Excel and unrelated service/business addresses are not rewritten.
 *
 * Only a house-number mismatch with an otherwise identical full street,
 * town, postcode and state can be suggested. All writes happen through the
 * existing user-authenticated register save + private history mechanism.
 */
const personNames=new Set([
 'name','full name','director name','name of director','name of the director',
 'member name','members name','shareholder name','shareholders name',
 'beneficial owner name','beneficial owners name','name of beneficial owner',
 'name of bo','bo name','individual full name'
]);
const personIds=new Set([
 'identification no','identification number','identification registration no',
 'nric no','nric number','nric passport no','nric passport number',
 'nric passport no of individual','passport no','passport number',
 'ic no','ic number','ic no passport no','identity card no'
]);
const personResidences=new Set([
 'residential address','residence address','residential correspondence address',
 'individual residential correspondence address','residential address of director'
]);
function registerScope(name){
 const text=tidy(name).toLowerCase();
 if(/^register (?:of|or) directors?\b/.test(text))return 'directors';
 if(/^register (?:of|or) (?:beneficial owners?|bo)\b/.test(text))return 'beneficialOwners';
 if(/^register (?:of|or) members?\b/.test(text))return 'members';
 return '';
}
function residenceLabel(scope,label){
 const normalized=labelKey(label);
 return personResidences.has(normalized)||
  (scope==='members' && normalized==='address');
}
function houseParts(value) {
 const match=/^NO\s+(\d+)\s+(.+)$/.exec(addressKey(value));
 if(!match)return null;
 return {number:match[1],location:match[2]};
}
function candidateChange(fields,scope,candidates){
 const person=fields.find(field=>personNames.has(labelKey(field.label)));
 const identity=fields.find(field=>personIds.has(labelKey(field.label)));
 const address=fields.find(field=>residenceLabel(scope,field.label));
 if(!person?.value||!identity?.value||!address?.value)return null;
 const canonical=(candidates||[]).find(item=>
  key(item.fullName)===key(person.value)&&
  key(item.identificationNo)===key(identity.value));
 if(!canonical?.newAddress)return null;
 const before=String(address.value||'');
 const old=houseParts(before),next=houseParts(canonical.newAddress);
 if(!old||!next||old.number===next.number||old.location!==next.location)return null;
 const originalCell=String(address.cellValue??address.value);
 const replacement=originalCell.replace(/^(\s*NO\.?\s*)\d+\b/i,(_entire,prefix)=>prefix+next.number);
 if(replacement===originalCell)return null;
 return {row:address.row,col:address.col,oldCell:originalCell,newCell:replacement,
  sheet:scope,fullName:String(person.value),identificationNo:String(identity.value),
  oldAddress:before,newAddress:String(canonical.newAddress)};
}

export function planPersonResidentialAddressUpdates(book,candidates){
 const planned=[],visited=new Set();
 function add(fields,scope,si,sheetName){
  const edit=candidateChange(fields,scope,candidates);
  if(!edit)return;
  const coordinate=si+':'+edit.row+':'+edit.col;
  if(visited.has(coordinate))return;
  visited.add(coordinate);
  planned.push({...edit,sheetIndex:si,sheetName});
 }
 for(let si=0;si<(book?.sheets||[]).length;si++){
  const sheet=book.sheets[si],scope=registerScope(sheet.name);
  if(!scope)continue;
  const rows=sheet.rows||[];
  // Table-style Excel registers: named columns followed by individual rows.
  for(let hi=0;hi<Math.min(rows.length,45);hi++){
   const headings=(rows[hi]||[]).map(labelKey);
   if(!headings.some(x=>personNames.has(x))||
      !headings.some(x=>personIds.has(x))||
      !headings.some(x=>residenceLabel(scope,x)))continue;
   const nameCol=headings.findIndex(x=>personNames.has(x));
   if(nameCol>2)continue;
   for(let ri=hi+1;ri<rows.length;ri++){
    const row=rows[ri]||[];
    if(!row[nameCol]||personNames.has(labelKey(row[nameCol])))continue;
    add(headings.map((label,col)=>({label,value:row[col],cellValue:row[col],row:ri,col})),
      scope,si,sheet.name);
   }
   break;
  }
  // Multi-folio Members registers and legacy key/value Directors/BO layouts.
  // A new explicit Name or ledger section ends the previous person's record.
  for(let start=0;start<rows.length;start++){
   const row=rows[start]||[];
   const named=[];
   for(let col=0;col<row.length-1;col++)
    if(personNames.has(labelKey(row[col]))&&String(row[col+1]||'').trim())
     named.push({col,personValue:row[col+1]});
   if(!named.length)continue;
   for(const person of named){
    const fields=[{label:'Name',value:person.personValue,row:start,col:person.col+1}];
    for(let ri=start;ri<Math.min(start+55,rows.length);ri++){
     const r=rows[ri]||[];
     if(ri>start && r.some((v,col)=>col<r.length-1&&
       personNames.has(labelKey(v))&&String(r[col+1]||'').trim()))break;
     if(ri>start && r.some(v=>/^(?:shares acquired|shares transferred)$/i.test(tidy(v))))break;
     for(let col=0;col<r.length-1;col++){
      const label=labelKey(r[col]);
      if(!personIds.has(label)&&!residenceLabel(scope,label))continue;
      const value=String(r[col+1]||'');
      if(!value)continue;
      let full=value;
      if(residenceLabel(scope,label)){
       for(let continuation=ri+1;continuation<Math.min(ri+8,rows.length);continuation++){
        const next=rows[continuation]||[];
        if(tidy(next[col])||!tidy(next[col+1]))break;
        full+='\n'+next[col+1];
       }
      }
      fields.push({label:r[col],value:full,cellValue:value,row:ri,col:col+1});
     }
    }
    add(fields,scope,si,sheet.name);
   }
  }
 }
 return planned;
}
export function applyPersonResidentialAddressUpdates(book,candidates){
 const changes=planPersonResidentialAddressUpdates(book,candidates);
 if(!changes.length)return {book,changed:0,details:[]};
 const updated=structuredClone(book);
 for(const change of changes)
  updated.sheets[change.sheetIndex].rows[change.row][change.col]=change.newCell;
 return {book:updated,changed:changes.length,details:changes};
}

/**
 * Extract consistent individual residential address records from existing
 * Annual Return cloud drafts, filtered to the user-entered Director's name.
 * A conflicting address for the same identification number is NOT guessed.
 */
export function directorAddressesFromAnnualReturnDrafts(drafts,requestedFullName){
 const target=key(requestedFullName),seen=new Map(),conflicts=[];
 if(!target)return {candidates:[],conflicts:[]};
 for(const draft of drafts||[]){
  const particulars=Array.isArray(draft?.payload?.particulars)?
   draft.payload.particulars: Array.isArray(draft?.particulars)?draft.particulars:[];
  for(let i=0;i<particulars.length;i++){
   const heading=particulars[i];
   if(!/^DIRECTOR\s+\d+$/i.test(tidy(heading?.en))||heading?.type!=='heading')continue;
   const record={};
   for(let j=i+1;j<particulars.length;j++){
    const item=particulars[j],label=tidy(item?.en);
    if(item?.type==='heading'||item?.type==='section')break;
    if(label==='Full Name')record.fullName=item.value;
    else if(label==='NRIC / Passport No.')record.identificationNo=item.value;
    else if(label==='Residential Address')record.newAddress=item.value;
   }
   if(key(record.fullName)!==target||!key(record.identificationNo)||
      !houseParts(record.newAddress))continue;
   const id=key(record.identificationNo);
   const previous=seen.get(id);
   if(!previous){seen.set(id,record);continue;}
   if(addressKey(previous.newAddress)!==addressKey(record.newAddress))
    conflicts.push({fullName:record.fullName,identificationNo:record.identificationNo});
  }
 }
 const conflictsIds=new Set(conflicts.map(x=>key(x.identificationNo)));
 return {candidates:[...seen.values()].filter(x=>!conflictsIds.has(key(x.identificationNo))),
  conflicts};
}
