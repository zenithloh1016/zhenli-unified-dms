/* Launch original Word/Excel applications rather than running an editor inside DMS.
   Mobile: a temporary private cache copy opened using Android's app chooser.
   Web: official Microsoft Office URI linking to a short-lived private signed URL.
   External-app edits do not write through to Supabase; the DMS document stays unchanged. */
import {Filesystem,Directory} from '@capacitor/filesystem';
import {FileOpener} from '@capacitor-community/file-opener';
import {saveOrShareFile} from './file-transfer.js';

const formats={
 doc:'application/msword',
 docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 docm:'application/vnd.ms-word.document.macroEnabled.12',
 xls:'application/vnd.ms-excel',
 xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 xlsm:'application/vnd.ms-excel.sheet.macroEnabled.12'
};
export function officeType(name){
 const ext=String(name||'').split('.').pop().toLowerCase();
 const mime=formats[ext];
 if(!mime)return null;
 return {extension:ext,kind:ext.startsWith('xls')?'Excel':'Word',
  scheme:ext.startsWith('xls')?'ms-excel':'ms-word',mime};
}
export function officeViewUri(name,url){
 const kind=officeType(name);
 if(!kind)throw Error('The selected file is not a Word or Excel document.');
 const parsed=new URL(url);
 if(parsed.protocol!=='https:')throw Error('Office files must be served over HTTPS.');
 return kind.scheme+':ofv|u|'+parsed.href;
}
async function base64Of(blob){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(Error('Cannot prepare this Office file for the installed application.'));
  reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
  reader.readAsDataURL(blob);
 });
}
export async function openOfficeOnAndroid(blob,filename){
 const kind=officeType(filename);
 if(!kind)throw Error('Only Word and Excel file types can be opened in Office.');
 if(!(blob instanceof Blob)||!blob.size)throw Error('This document is empty or cannot be retrieved.');
 if(blob.size>25*1024*1024)throw Error('The Office file is over the 25 MB local opener limit. Use Download to open it manually.');
 const safe=String(filename||'document').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,160);
 const target='office-open/'+Date.now()+'-'+Math.random().toString(36).slice(2,9)+'-'+safe;
 const written=await Filesystem.writeFile({path:target,data:await base64Of(blob),directory:Directory.Cache,recursive:true});
 try {
  await FileOpener.open({filePath:written.uri,contentType:kind.mime,openWithDefault:true});
  return {method:'opened',app:kind.kind};
 }catch(err){
  // Some Android OEMs do not expose ACTION_VIEW for Office documents;
  // the standard Android share chooser can still offer Word/Excel as targets.
  try{
   const shared=await saveOrShareFile(blob,filename,{preferShare:true});
   return {method:shared.method==='cancelled'?'cancelled':'chooser',app:kind.kind};
  }catch{
   throw Error('No compatible '+kind.kind+' app could open the document. Install Microsoft '+kind.kind+
    ' or use Download. '+(err?.message||''));
  }
 }
}
