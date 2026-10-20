/**
 * Autosave of Office edits into the existing private Supabase Documents folder.
 * Writes are serialized, optimistic, and versioned. On the first successful
 * update an independent previous-version row references the original object.
 * A stale remote edit fails without clobbering the current stored file.
 */
import {makePreviousVersionName} from './office-editor.js';

export function createOfficeAutoSaver({db,bucket,userId,document:record,makeBlob,onStatus=()=>{},onSaved=()=>{},delay=1600}){
 if(!db||!record?.id||!record.storage_path||!userId||!makeBlob)throw Error('Cannot initialize Office autosave without a valid document and account.');
 let revision=0,savedRevision=0,timer=null,writing=null,closed=false;
 let lastPath=record.storage_path,lastSize=record.size_bytes||0,lastMime=record.mime_type||null;
 let backedUp=false,hadError=false;
 const storage=db.storage.from(bucket);
 const message=(s)=>onStatus(s);

 const saveOne=async()=>{
  const targetRevision=revision;
  message('Saving changes securely to the DMS company folder…');
  const file=makeBlob();
  if(!(file instanceof Blob)||!file.size)throw Error('Edited Office document could not be generated.');
  const path=userId+'/'+record.company_id+'/'+crypto.randomUUID();
  const {error:uploadError}=await storage.upload(path,file,{upsert:false,contentType:file.type});
  if(uploadError)throw Error('File upload failed: '+uploadError.message);
  let switched=false,backupCompleted=false,oldPath=lastPath;
  try{
   const {data,error}=await db.from('documents').update({
    storage_path:path,size_bytes:file.size,mime_type:file.type
   }).eq('id',record.id).eq('user_id',userId).eq('storage_path',oldPath).select('id');
   if(error)throw error;
   if(data?.length!==1)throw Error('This document changed in another session. Your unsaved edits are still open. Reopen the latest file before saving.');
   switched=true;
   if(!backedUp){
    const {error:backupError}=await db.from('documents').insert({
     user_id:userId,company_id:record.company_id,folder_id:record.folder_id,
     name:makePreviousVersionName(record.name),storage_path:oldPath,
     size_bytes:lastSize,mime_type:lastMime
    });
    if(backupError){
     const rollback=await db.from('documents').update({
      storage_path:oldPath,size_bytes:lastSize,mime_type:lastMime
     }).eq('id',record.id).eq('user_id',userId).eq('storage_path',path).select('id');
     if(rollback.error||rollback.data?.length!==1){
      throw Error('The updated document was saved, but version backup filing failed. Both file objects are retained. Contact the administrator before further editing.');
     }
     switched=false;
     throw Error('Could not safely preserve the original version; the document was restored. '+backupError.message);
    }
    backedUp=true;backupCompleted=true;
   }
   lastPath=path;lastSize=file.size;lastMime=file.type;
   savedRevision=targetRevision;
   onSaved({storage_path:path,size_bytes:file.size,mime_type:file.type,revision:targetRevision,firstBackup:backupCompleted});
   if(backedUp&&!backupCompleted){
    // The first original version is a separate document; intermediate autosave
    // objects may be cleaned after the current row is confirmed.
    await storage.remove([oldPath]).catch(()=>{});
   }
   hadError=false;
   message(revision===savedRevision?'All changes saved to DMS.':'Saved; newer changes are waiting…');
  }catch(err){
   if(!switched)await storage.remove([path]).catch(()=>{});
   throw err;
  }
 };
 const flush=()=>{
  if(timer){clearTimeout(timer);timer=null;}
  if(writing)return writing;
  if(revision<=savedRevision){if(!hadError)message('All changes saved to DMS.');return Promise.resolve();}
  writing=(async()=>{
   try{
    while(revision>savedRevision)await saveOne();
    hadError=false;
   }catch(err){
    hadError=true;
    message('Autosave failed: '+(err.message||String(err))+'. Changes remain in this editor; choose Save now to retry.');
    throw err;
   }finally{writing=null;}
  })();
  return writing;
 };
 const schedule=()=>{
  if(closed)throw Error('Office editor session is closed.');
  revision++;hadError=false;
  if(timer)clearTimeout(timer);
  message('Unsaved edits — automatic save shortly…');
  timer=setTimeout(()=>{flush().catch(console.error);},delay);
 };
 const close=()=>{closed=true;if(timer)clearTimeout(timer);timer=null;};
 return {schedule,flush,close,
  get pending(){return revision>savedRevision||!!writing;},
  get saving(){return !!writing;},
  get lastError(){return hadError;},
  get revision(){return revision;},
  get savedRevision(){return savedRevision;}
 };
}
