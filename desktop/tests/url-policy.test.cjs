'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { HOME_URL, isAppURL, isAppBlobURL, isExternalURL } = require('../url-policy.cjs');

test('desktop opens the existing UNICOSEC website and company subpages', () => {
  assert.equal(HOME_URL, 'https://zenithloh1016.github.io/zhenli-unified-dms/');
  assert.equal(isAppURL(HOME_URL), true);
  assert.equal(isAppURL(HOME_URL + 'sign/?token=valid'), true);
  assert.equal(isAppURL(HOME_URL + 'task-hub/'), true);
  assert.equal(isAppURL(HOME_URL + 'annual-return/'), true);
});

test('desktop rejects lookalikes, unrelated GitHub pages, scripts and file links', () => {
  [
    'https://zenithloh1016.github.io.evil.test/zhenli-unified-dms/',
    'https://zenithloh1016.github.io/another-app/',
    'https://zenithloh1016.github.io/zhenli-unified-dms-malicious',
    'http://zenithloh1016.github.io/zhenli-unified-dms/',
    'javascript:alert(1)',
    'file:///C:/Windows/system.ini',
    'https://name:pass@zenithloh1016.github.io/zhenli-unified-dms/'
  ].forEach(url => assert.equal(isAppURL(url), false, url));
});

test('desktop allows trusted PDF blob windows without allowing arbitrary blob origins', () => {
  assert.equal(isAppBlobURL('blob:https://zenithloh1016.github.io/abcd-1234'), true);
  assert.equal(isAppBlobURL('blob:https://evil.test/abcd-1234'), false);
  assert.equal(isExternalURL('https://www.ssm.com.my/'), true);
  assert.equal(isExternalURL('mailto:secretary@example.test'), true);
  assert.equal(isExternalURL('javascript:alert(1)'), false);
});

test('Electron desktop enforces sandbox and disabled Node integration', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
  assert.match(src, /nodeIntegration:\s*false/);
  assert.match(src, /contextIsolation:\s*true/);
  assert.match(src, /sandbox:\s*true/);
  assert.match(src, /webSecurity:\s*true/);
  assert.match(src, /setPermissionRequestHandler/);
  assert.match(src, /setWindowOpenHandler/);
  assert.match(src, /will-download/);
  assert.doesNotMatch(src, /nodeIntegration:\s*true/);
});

test('installer keeps UNICOSEC identity and produces both Windows EXE formats', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.productName, 'UNICOSEC');
  assert.equal(pkg.build.appId, 'com.unicosec.desktop');
  assert.equal(pkg.build.win.target[0].target, 'nsis');
  assert.equal(pkg.build.win.target[1].target, 'portable');
  assert.match(pkg.build.nsis.artifactName, /UNICOSEC-Setup/);
  assert.match(pkg.build.portable.artifactName, /UNICOSEC-Portable/);
});
