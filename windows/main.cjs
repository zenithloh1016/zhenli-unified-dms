'use strict';
const {app,BrowserWindow,shell,session}=require('electron');
const path=require('node:path');
const APP_URL='https://zenithloh1016.github.io/zhenli-unified-dms/';
let mainWindow;
// Hidden temporary tabs keep async document opens reliable without showing blank windows.
const hiddenDocumentPopups=new WeakSet();
function appUrl(url){
 try{
  const value=new URL(url);
  return value.protocol==='https:' &&
   value.origin==='https://zenithloh1016.github.io' &&
   (value.pathname==='/zhenli-unified-dms'||value.pathname.startsWith('/zhenli-unified-dms/'));
 }catch{return false;}
}
function safeBlankOrBlob(url){
 return url==='about:blank'||url.startsWith('blob:https://zenithloh1016.github.io/');
}
function external(url){
 try{const value=new URL(url);
  if(['https:','http:','mailto:'].includes(value.protocol))void shell.openExternal(value.toString());
 }catch{}
}
function secure(contents){
 contents.setWindowOpenHandler(({url})=>{
  // Preserve the document viewer's pre-opened tab so async signed links work,
  // but never display it as a separate, empty UNICOSEC window.
  if(url==='about:blank')return {
   action:'allow',
   overrideBrowserWindowOptions:{
    show:false,autoHideMenuBar:true,
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}
   }
  };
  if(appUrl(url)||safeBlankOrBlob(url))return {
   action:'allow',
   overrideBrowserWindowOptions:{
    autoHideMenuBar:true,
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}
   }
  };
  external(url);return {action:'deny'};
 });
 contents.on('did-create-window',(popup,details)=>{
  if(details.url==='about:blank')hiddenDocumentPopups.add(popup.webContents);
 });
 contents.on('will-navigate',(event,url)=>{
  if(hiddenDocumentPopups.has(contents)){
   if(url==='about:blank')return;
   event.preventDefault();
   external(url);
   const popup=BrowserWindow.fromWebContents(contents);
   if(popup&&!popup.isDestroyed())popup.close();
   return;
  }
  if(appUrl(url)||safeBlankOrBlob(url))return;
  event.preventDefault();external(url);
 });
}
function createWindow(){
 mainWindow=new BrowserWindow({
  title:'UNICOSEC',width:1440,height:900,minWidth:940,minHeight:620,
  backgroundColor:'#061d40',show:false,autoHideMenuBar:true,
  icon:path.join(__dirname,'build','icon.png'),
  webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}
 });
 mainWindow.once('ready-to-show',()=>{if(!mainWindow.isDestroyed())mainWindow.show();});
 mainWindow.on('closed',()=>{mainWindow=null;});
 void mainWindow.loadURL(APP_URL).catch(()=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.show();});
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.setAppUserModelId('com.zhenli.unicosec.windows');
 app.on('web-contents-created',(_e,c)=>secure(c));
 app.on('second-instance',()=>{
  if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}
 });
 app.whenReady().then(()=>{
  // Use Windows Save As for PDFs generated in the hosted Annual Return editor.
  session.defaultSession.on('will-download',(_event,item)=>{
   item.setSaveDialogOptions({title:'Save UNICOSEC PDF',defaultPath:item.getFilename()});
  });
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
 });
 app.on('window-all-closed',()=>app.quit());
}
