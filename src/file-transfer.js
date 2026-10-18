/* ZHENLI secure file transfer
 * User-directed Android share sheet via Capacitor; standard browser downloads otherwise.
 * Temporary native files are held in app cache, not uploaded to another server.
 */
import {Capacitor} from '@capacitor/core';
import {Filesystem,Directory} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';

const safeName = value => String(value||'ZHENLI-file').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,160);
const MAX_NATIVE_SHARE=25*1024*1024;

async function base64Of(blob){
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Cannot read this file for Android sharing.'));
    reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
    reader.readAsDataURL(blob);
  });
}
export function browserDownload(blob,filename){
  const url=globalThis.URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=safeName(filename);a.textContent='Save file';a.style.display='none';
  document.body.appendChild(a);
  a.click();a.remove();
  // Android/Brave downloads can start asynchronously; do NOT revoke after 1 second.
  setTimeout(()=>globalThis.URL.revokeObjectURL(url),120_000);
  return {filename:safeName(filename),method:'download'};
}
export async function saveOrShareFile(blob,filename,{preferShare=false}={}){
  if(!(blob instanceof Blob))throw Error('File contents are not available.');
  const name=safeName(filename);
  if(Capacitor.isNativePlatform()){
    if(blob.size>MAX_NATIVE_SHARE)throw Error('This file is too large for Android sharing (25 MB). Use the web DMS download link instead.');
    const unique=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
    const {uri}=await Filesystem.writeFile({
      path:'downloads/'+unique+'-'+name,data:await base64Of(blob),
      directory:Directory.Cache,recursive:true
    });
    try {
      await Share.share({title:'Save '+name,text:'Choose a destination such as Files or Drive to keep '+name,
        url:uri,dialogTitle:'Save or share '+name});
      return {filename:name,method:'share'};
    }catch(err){
      if(err?.message?.toLowerCase()?.includes('cancel'))return {filename:name,method:'cancelled'};
      throw err;
    }
  }
  if(preferShare && typeof navigator.share==='function' && typeof File!=='undefined'){
    const file=new File([blob],name,{type:blob.type||'application/octet-stream'});
    if(!navigator.canShare || navigator.canShare({files:[file]})){
      try{
        await navigator.share({title:name,files:[file]});
        return {filename:name,method:'share'};
      }catch(err){
        if(err?.name==='AbortError')return {filename:name,method:'cancelled'};
        // Fallback to ordinary download when file sharing isn't supported.
      }
    }
  }
  return browserDownload(blob,name);
}
