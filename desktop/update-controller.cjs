'use strict';

const {RELEASE_API,RELEASE_BASE,latestDesktopRelease,releasePage}=require('./update-policy.cjs');

const SIX_HOURS=6*60*60*1000;

function createUpdateController({
  app, dialog, shell, BrowserWindow, autoUpdater, fetchImpl,
  env=process.env, setIntervalImpl=setInterval, logger=console
}) {
  const isPortable=!!env.PORTABLE_EXECUTABLE_FILE;
  const isInstalled=app.isPackaged && process.platform==='win32' && !isPortable;
  let checking=false,downloading=false,ready=false,manualCheck=false;
  let poll=null,connected=false;

  function window() {
    return BrowserWindow.getFocusedWindow()||BrowserWindow.getAllWindows()[0]||undefined;
  }
  function releaseSite(url=RELEASE_BASE) {
    return shell.openExternal(url).catch(e=>logger.warn('Could not open release page',e));
  }
  async function showNotice(title,message,buttons=['OK']) {
    return dialog.showMessageBox(window(),{
      type:'info',title,message,buttons,noLink:true,
      defaultId:0,cancelId:buttons.length-1
    });
  }
  async function showUpdateError(error) {
    logger.warn('UNICOSEC update check failed',error);
    if(!manualCheck)return;
    const {response}=await showNotice('UNICOSEC updates',
      'Could not check for desktop updates right now. Your documents are unaffected.\n\n'+
      'You can try again later or open the official GitHub Releases page.',
      ['Open Releases','Close']);
    if(response===0)void releaseSite();
  }
  async function checkPortable(userInitiated) {
    if(typeof fetchImpl!=='function')throw Error('Update service unavailable');
    const response=await fetchImpl(RELEASE_API,{
      headers:{Accept:'application/vnd.github+json','User-Agent':'UNICOSEC-Desktop'}
    });
    if(!response.ok)throw Error('Release service returned '+response.status);
    const latest=latestDesktopRelease(await response.json(),app.getVersion());
    if(!latest){
      if(userInitiated)await showNotice('UNICOSEC updates','You are using the latest available Windows desktop version ('+app.getVersion()+').');
      return;
    }
    const {response:choice}=await showNotice('UNICOSEC update available',
      'UNICOSEC '+latest.tag_name.slice('desktop-v'.length)+' is available.\n\n'+
      'Portable versions cannot replace a running EXE automatically. Download the newer Portable EXE from the official release page.',
      ['Open Download Page','Later']);
    if(choice===0)void releaseSite(releasePage(latest.tag_name));
  }
  async function check({userInitiated=false}={}) {
    if(!app.isPackaged){
      if(userInitiated)await showNotice('UNICOSEC updates','Desktop updates are available only in packaged Windows applications.');
      return;
    }
    if(checking||downloading)return;
    if(ready){
      if(userInitiated)await askInstall();
      return;
    }
    checking=true;
    manualCheck=userInitiated;
    try{
      if(isInstalled)await autoUpdater.checkForUpdates();
      else await checkPortable(userInitiated);
    }catch(e){
      await showUpdateError(e);
    }finally{
      checking=false;
      manualCheck=false;
    }
  }
  async function askInstall() {
    const {response}=await showNotice('UNICOSEC update ready',
      'The updated Windows application is downloaded.\n\n'+
      'Save any unsaved work before restarting to install the update. Your Supabase records will not be changed.',
      ['Restart and Install','Later']);
    if(response===0)autoUpdater.quitAndInstall(false,true);
  }
  function start() {
    if(connected)return;
    connected=true;
    if(isInstalled){
      autoUpdater.autoDownload=false;
      autoUpdater.autoInstallOnAppQuit=false;
      autoUpdater.allowPrerelease=false;
      autoUpdater.on('update-available', async update=>{
        const {response}=await showNotice('UNICOSEC update available',
          'UNICOSEC '+update.version+' is available.\n\n'+
          'Download and install the update now? Your online company records remain unchanged.',
          ['Download Update','Later']);
        if(response!==0||downloading)return;
        downloading=true;
        try{await autoUpdater.downloadUpdate();}
        catch(e){downloading=false;await showUpdateError(e);}
      });
      autoUpdater.on('download-progress',progress=>{
        const p=Number(progress.percent);
        if(Number.isFinite(p))window()?.setProgressBar(Math.max(0,Math.min(1,p/100)));
      });
      autoUpdater.on('update-downloaded',()=>{
        downloading=false;ready=true;window()?.setProgressBar(-1);
        void askInstall();
      });
      autoUpdater.on('update-not-available',()=>{
        if(manualCheck)void showNotice('UNICOSEC updates',
          'You are using the latest Windows desktop version ('+app.getVersion()+').');
      });
      autoUpdater.on('error',error=>{
        downloading=false;window()?.setProgressBar(-1);
        void showUpdateError(error);
      });
    }
    // Silent startup check; asks the user before downloading/installing.
    void check();
    poll=setIntervalImpl(()=>void check(),SIX_HOURS);
    if(typeof poll?.unref==='function')poll.unref();
  }
  return {start,check,get isPortable(){return isPortable;},get isInstalled(){return isInstalled;}};
}
module.exports={createUpdateController,SIX_HOURS};
