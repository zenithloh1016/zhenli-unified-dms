/** UNICOSEC Annual Return cloud drafts, shared by the website, Windows and APK.
 * All queries use the signed-in DMS Supabase client; RLS restricts rows.
 * A revision match prevents one device overwriting a newer draft elsewhere.
 */
const MAX_LENGTH=3_500_000;
export async function annualReturnCloudAction(db,{user,company,operation,document,revision}){
 if(!db||!user?.id||!company?.id||company.user_id!==user.id)
  throw Error('Company is not available in this signed-in DMS account.');
 if(!['load','save','delete'].includes(operation))throw Error('Unknown Annual Return cloud operation.');
 const query=()=>db.from('annual_return_drafts');
 const read=async()=>{
  const {data,error}=await query().select('payload,revision,updated_at')
   .eq('user_id',user.id).eq('company_id',company.id).maybeSingle();
  if(error)throw Error('Cannot read the private Annual Return draft: '+error.message);
  return data?{document:data.payload,revision:Number(data.revision),updatedAt:data.updated_at}:null;
 };
 if(operation==='load')return {record:await read()};
 if(operation==='delete'){
  const {error}=await query().delete().eq('user_id',user.id).eq('company_id',company.id);
  if(error)throw Error('Cannot delete the cloud Annual Return draft: '+error.message);
  return {record:null};
 }
 const json=JSON.stringify(document??null);
 if(!document||typeof document!=='object'||Array.isArray(document)||
  !Array.isArray(document.particulars)||json.length>MAX_LENGTH)
  throw Error('Annual Return draft is missing, invalid or too large.');
 if(String(document.company?.name||'').trim().replace(/\s+/g,' ').toUpperCase()!==
    String(company.name||'').trim().replace(/\s+/g,' ').toUpperCase())
  throw Error('Annual Return draft belongs to a different company.');
 const expected=Number(revision);
 if(!Number.isSafeInteger(expected)||expected<0)throw Error('Invalid cloud revision.');
 const updated_at=new Date().toISOString();
 if(expected===0){
  const {data,error}=await query().insert({user_id:user.id,company_id:company.id,
   payload:document,revision:1,updated_at})
   .select('revision,updated_at').maybeSingle();
  if(error){
   if(error.code==='23505')return {conflict:true,record:await read()};
   throw Error('Could not create cloud Annual Return draft: '+error.message);
  }
  return {record:{revision:Number(data.revision),updatedAt:data.updated_at}};
 }
 const {data,error}=await query().update({payload:document,revision:expected+1,updated_at})
  .eq('user_id',user.id).eq('company_id',company.id).eq('revision',expected)
  .select('revision,updated_at').maybeSingle();
 if(error)throw Error('Could not update cloud Annual Return draft: '+error.message);
 if(!data)return {conflict:true,record:await read()};
 return {record:{revision:Number(data.revision),updatedAt:data.updated_at}};
}
