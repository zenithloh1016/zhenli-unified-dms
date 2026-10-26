'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {latestDesktopRelease,compareVersions,releasePage}=require('../update-policy.cjs');
const {createUpdateController,SIX_HOURS}=require('../update-controller.cjs');

const tick=()=>new Promise(r=>setImmediate(r));
function release(version) {
  return {tag_name:'desktop-v'+version,draft:false,prerelease:false,assets:[
    {name:'UNICOSEC-Setup-'+version+'-x64.exe'},
    {name:'UNICOSEC-Portable-'+version+'-x64.exe'}
  ]};
}
function harness({portable=false,current='1.1.0'}={}) {
  const updater=new EventEmitter();
  const calls={dialogs:[],external:[],intervals:[],progress:[],downloads:0,restarts:0,checks:0};
  updater.checkForUpdates=async()=>{calls.checks++;};
  updater.downloadUpdate=async()=>{calls.downloads++;};
  updater.quitAndInstall=()=>{calls.restarts++;};
  const choices=[];
  const controller=createUpdateController({
    app:{isPackaged:true,getVersion:()=>current},
    dialog:{showMessageBox:async(_window,config)=>{
      calls.dialogs.push(config);return {response:choices.length?choices.shift():config.cancelId??0};
    }},
    shell:{openExternal:async url=>calls.external.push(url)},
    BrowserWindow:{getFocusedWindow:()=>null,getAllWindows:()=>[
      {setProgressBar:p=>calls.progress.push(p)}
    ]},
    autoUpdater:updater,
    fetchImpl:async()=>({ok:true,json:async()=>[release('1.2.0')]}),
    env:portable?{PORTABLE_EXECUTABLE_FILE:'C:/UNICOSEC-Portable.exe'}:{},
    setIntervalImpl:(fn,delay)=>{calls.intervals.push(delay);return {unref(){}}}
  });
  return {updater,calls,controller,choices};
}

test('only newer stable desktop releases with Windows EXEs qualify',()=>{
 assert.equal(compareVersions('1.2.0','1.1.0'),1);
 assert.equal(compareVersions('1.1.0','1.1.0'),0);
 assert.equal(compareVersions('1.0.0','1.1.0'),-1);
 assert.equal(latestDesktopRelease([release('1.0.0'),release('1.3.0'),release('1.2.0')],'1.1.0').tag_name,'desktop-v1.3.0');
 assert.equal(latestDesktopRelease([release('1.0.0')],'1.1.0'),null);
 assert.equal(latestDesktopRelease([{...release('1.9.0'),draft:true}],'1.1.0'),null);
 assert.equal(latestDesktopRelease([{...release('1.9.0'),prerelease:true}],'1.1.0'),null);
 assert.equal(latestDesktopRelease([{...release('1.9.0'),assets:[]}],'1.1.0'),null);
 assert.equal(releasePage('desktop-v1.2.3'),'https://github.com/zenithloh1016/zhenli-unified-dms/releases/tag/desktop-v1.2.3');
 assert.equal(releasePage('https://example.test'),'https://github.com/zenithloh1016/zhenli-unified-dms/releases/');
});

test('installed application checks on launch and every 6 hours without automatic download',async()=>{
 const {controller,calls,updater}=harness();
 controller.start();await tick();
 assert.equal(calls.checks,1);
 assert.deepEqual(calls.intervals,[SIX_HOURS]);
 assert.equal(updater.autoDownload,false);
 assert.equal(updater.autoInstallOnAppQuit,false);
 assert.equal(updater.allowPrerelease,false);
 assert.equal(calls.downloads,0);
});

test('user must explicitly approve download then restart before installer replaces app',async()=>{
 const {controller,calls,updater,choices}=harness();
 choices.push(0,0);
 controller.start();await tick();
 updater.emit('update-available',{version:'1.2.0'});
 await tick();
 assert.equal(calls.downloads,1);
 updater.emit('download-progress',{percent:42});
 updater.emit('update-downloaded');
 await tick();
 assert.equal(calls.restarts,1);
 assert.deepEqual(calls.progress,[0.42,-1]);
});

test('deferred update cannot silently download or install on quit',async()=>{
 const {controller,calls,updater,choices}=harness();
 choices.push(1);
 controller.start();await tick();
 updater.emit('update-available',{version:'1.2.0'});
 await tick();
 assert.equal(calls.downloads,0);
 assert.equal(calls.restarts,0);
 assert.equal(updater.autoInstallOnAppQuit,false);
});

test('portable app checks newer release but opens official download page rather than in-place installation',async()=>{
 const {controller,calls,choices}=harness({portable:true});
 choices.push(0);
 controller.start();await tick();
 assert.equal(calls.dialogs[0].buttons[0],'Open Download Page');
 assert.equal(calls.external[0],'https://github.com/zenithloh1016/zhenli-unified-dms/releases/tag/desktop-v1.2.0');
 assert.equal(calls.checks,0);
});
