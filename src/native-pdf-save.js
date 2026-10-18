import {Capacitor,registerPlugin} from '@capacitor/core';
import {Filesystem,Directory} from '@capacitor/filesystem';

const saver=registerPlugin('AnnualReturnSaver');
const MAX_PDF_BYTES=60*1024*1024;
export function validatedPdf(blob,filename){
 if(!(blob instanceof Blob)||!blob.size||blob.size>MAX_PDF_BYTES)throw Error('Generated PDF is empty or exceeds 60 MB.');
 if(typeof filename!=='string'||!filename.toLowerCase().endsWith('.pdf'))throw Error('Only PDF documents can be saved.');
 return filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').trim().slice(0,145);
}
function toBase64(blob){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(Error('Could not read the generated PDF.'));
  reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
  reader.readAsDataURL(blob);
 });
}
/** Opens Android's real ACTION_CREATE_DOCUMENT Save As system UI.
 * User explicitly picks Downloads, Documents or another provider; success is
 * returned only after Android has finished writing the entire PDF stream.
 */
export async function savePdfToAndroidFiles(blob,filename){
 const name=validatedPdf(blob,filename);
 if(!Capacitor.isNativePlatform())throw Error('Native Android PDF saving is available only in the updated APK.');
 if(!Capacitor.isPluginAvailable('AnnualReturnSaver'))
  throw Error('The Android Save PDF component is missing. Install the latest Annual Return APK.');
 const path='annual-return-pdf/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.pdf';
 const file=await Filesystem.writeFile({path,directory:Directory.Cache,recursive:true,data:await toBase64(blob)});
 try{
  const result=await saver.saveFile({path:file.uri,filename:name});
  if(result?.saved!==true)throw Error('Android did not confirm that the PDF was saved.');
  return {filename:name,uri:result.uri};
 }finally{
  // The permanent document is already in the user-chosen folder; this is only
  // the app-private staging copy. Even cancellation won't leave a cache copy.
  try{await Filesystem.deleteFile({path,directory:Directory.Cache});}catch{}
 }
}
