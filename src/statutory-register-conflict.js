/**
 * Conservative three-way merge of independently edited statutory registers.
 * Only disjoint field edits are merged. Concurrent structural array changes
 * are refused: row insertions/deletions can shift indexes and corrupt registers.
 */
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

function combine(base,local,remote,path,conflicts){
 if(equal(local,remote))return local;
 if(equal(local,base))return remote;
 if(equal(remote,base))return local;
 if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remote)){
  if(base.length!==local.length||base.length!==remote.length){
   conflicts.push(path);return remote;
  }
  return base.map((original,i)=>combine(original,local[i],remote[i],path+'['+i+']',conflicts));
 }
 if(record(base)&&record(local)&&record(remote)){
  const result={};
  for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
   const value=combine(base[key],local[key],remote[key],path+'.'+key,conflicts);
   if(value!==undefined)result[key]=value;
  }
  return result;
 }
 conflicts.push(path);return remote;
}

/**
 * @returns {{book: object|null, conflicts: string[]}}
 * A null book means both devices changed the same field or a structural
 * worksheet change could not be merged without risking lost register data.
 */
export function mergeStatutoryRegisterEdits(base,local,remote){
 if(!base||!local||!remote||
  base.companyId!==local.companyId||base.companyId!==remote.companyId||
  base.version!==local.version||base.version!==remote.version){
  return {book:null,conflicts:['company/version mismatch']};
 }
 // updatedAt is a revision marker, not a substantive statutory field.
 const before={...base,updatedAt:null};
 const edited={...local,updatedAt:null};
 const latest={...remote,updatedAt:null};
 const conflicts=[];
 const merged=combine(before,edited,latest,'register',conflicts);
 if(conflicts.length)return {book:null,conflicts};
 return {book:{...merged,updatedAt:remote.updatedAt},conflicts:[]};
}
