'use strict';

const path = require('node:path');
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const { HOME_URL, isAppURL, isAppBlobURL, isExternalURL } = require('./url-policy.cjs');

const TITLE = 'UNICOSEC - Company Secretarial Management System';
const APP_ID = 'com.unicosec.desktop';
let mainWindow = null;

if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

function openInBrowser(address) {
  if (isExternalURL(address)) {
    shell.openExternal(address).catch(() => {});
  }
}

function configureNavigation(webContents) {
  // Remote pages must never gain access to Node.js, filesystem or shell.
  webContents.setWindowOpenHandler(({ url }) => {
    if (isAppURL(url) || isAppBlobURL(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            webviewTag: false
          }
        }
      };
    }
    openInBrowser(url);
    return { action: 'deny' };
  });

  webContents.on('will-navigate', (event, url) => {
    if (isAppURL(url) || isAppBlobURL(url)) return;
    event.preventDefault();
    openInBrowser(url);
  });
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Open UNICOSEC in Browser', click: () => openInBrowser(HOME_URL) },
        { type: 'separator' },
        { label: 'Exit UNICOSEC', role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Refresh UNICOSEC', accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.loadURL(HOME_URL) },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'UNICOSEC Website', click: () => openInBrowser(HOME_URL) }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function showOffline(window) {
  if (!window || window.isDestroyed()) return;
  await window.loadFile(path.join(__dirname, 'offline.html')).catch(() => {});
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: TITLE,
    width: 1400,
    height: 900,
    minWidth: 850,
    minHeight: 570,
    show: false,
    backgroundColor: '#f6f8fb',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged
    }
  });
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });
  mainWindow.webContents.on('did-fail-load',
    (_event, _code, _description, _url, isMainFrame) => {
      if (isMainFrame) void showOffline(mainWindow);
    }
  );
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(HOME_URL).catch(() => void showOffline(mainWindow));
}

if (singleInstance) {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Permit ordinary file downloads, but only a narrow set of browser
    // permissions. Authenticated content runs entirely inside a sandbox.
    session.defaultSession.setPermissionRequestHandler(
      (contents, permission, callback) => {
        const allowed = isAppURL(contents.getURL()) &&
          ['clipboard-sanitized-write', 'fullscreen'].includes(permission);
        callback(allowed);
      }
    );
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({ title: 'Save UNICOSEC document' });
    });

    app.on('web-contents-created', (_event, contents) => {
      configureNavigation(contents);
    });
    createMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
