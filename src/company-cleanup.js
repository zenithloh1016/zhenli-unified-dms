// Company deletion storage cleanup. Only paths scoped to the signed-in user and
// exact company UUID are eligible for removal. A failed cleanup is retried from
// the server-side dms_company_cleanup_queue on the next DMS refresh.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function listFiles(storage,prefix,{search='',filter=()=>true}={}){
  const found=[];
  for(let offset=0;offset<10000;offset+=1000){
    const {data,error}=await storage.list(prefix,{limit:1000,offset,...(search?{search}:{})});
    if(error)throw Error('Cannot list private company files: '+error.message);
    for(const item of data||[]){
      if(item.id && typeof item.name==='string' && filter(item.name))
        found.push(prefix+'/'+item.name);
    }
    if((data||[]).length<1000)return found;
  }
  throw Error('More than 10,000 company files require an administrator review.');
}

export async function removeDeletedCompanyStorage(db,bucket,userId,companyId){
  if(!UUID.test(String(userId))||!UUID.test(String(companyId)))
    throw Error('Invalid private company identity; no files have been deleted.');
  const storage=db.storage.from(bucket);
  const companyPrefix=userId+'/'+companyId;
  const registerPrefix=userId+'/statutory-registers';
  const historyPrefix=registerPrefix+'/history';
  const registerFile=registerPrefix+'/'+companyId+'.json';
  const documents=await listFiles(storage,companyPrefix);
  const histories=await listFiles(storage,historyPrefix,{
    search:companyId+'-',
    filter:name=>name.startsWith(companyId+'-')&&name.endsWith('.json')
  });
  // A missing register is safe to remove and is not treated as an error.
  const paths=[...new Set([...documents,...histories,registerFile])];
  for(let i=0;i<paths.length;i+=100){
    const {error}=await storage.remove(paths.slice(i,i+100));
    if(error)throw Error('Private company files could not be removed: '+error.message);
  }
  const [docsLeft,historyLeft,registerLeft]=await Promise.all([
    listFiles(storage,companyPrefix),
    listFiles(storage,historyPrefix,{search:companyId+'-',
      filter:name=>name.startsWith(companyId+'-')&&name.endsWith('.json')}),
    listFiles(storage,registerPrefix,{search:companyId+'.json',
      filter:name=>name===companyId+'.json'})
  ]);
  if(docsLeft.length||historyLeft.length||registerLeft.length)
    throw Error('Company files are still present in private storage; cleanup will retry.');
  return {documents:documents.length,registerVersions:histories.length+1};
}
