#!/usr/bin/env python3
"""Patch signing panel to use first-party EdgeOne login, v1.3.
Only edits src/main.js. Handles original DMS V1.0, import fix V1.1, signing fix V1.2.
Does not touch EdgeOne, Supabase, documents, signing requests, other app modules.
"""
from pathlib import Path
import sys
import re

src = Path('src/main.js')
if not src.exists():
    sys.exit('ERROR: Run this from the repository root, where src/main.js exists.')
s = src.read_text('utf-8')
start = s.find('function renderSigning(){')
end = s.find('\nfunction renderLinkModal()',start)
if start < 0 or end < 0:
    sys.exit('ERROR: Expected signing panel was not found. No changes applied.')
if 'const SIGNING_BASE' not in s or 'getSigningUrl' not in s or 'Browser.open' not in s:
    sys.exit('ERROR: Expected original signing configuration not found. No changes applied.')

replacement = '''// ZHENLI_SIGNING_DIRECT_LAUNCH_V1_3
function renderSigning(){
  const url = getSigningUrl();
  const protectedLink = url !== SIGNING_BASE;
  return `<div class="integration-heading"><div><p class="eyebrow">ELECTRONIC DOCUMENT SIGNING</p><h1>Sequential Signing</h1><p class="muted">Original Tencent EdgeOne signing service · Secure browser mode</p></div>
    <div class="header-buttons">${action('Open Signing / Administrator Login','open-signing','','primary')}</div></div>
    <div class="integration-info"><b>Signing connection V1.3 — external secure login enabled.</b> The signing login no longer runs inside the DMS page. Android opens it in a Chrome Custom Tab; the website opens it in a separate tab. This preserves the original EdgeOne administrator session and its secure cookies.</div>
    <section class="info-panel"><h2>Signing workspace</h2><p>Tap <b>Open Signing / Administrator Login</b> to manage your original signing requests, signer links, signature coordinates and signed documents. Your signing database is not copied or modified.</p>
    <div class="quick-actions">${action('Open Signing / Administrator Login','open-signing','','primary')}</div>
    <p class="fineprint">Signing connection version: <b>V1.3</b>. If you still see a signing login screen directly inside this DMS tab, you are running an outdated website or APK.</p></section>
    <form class="link-form" id="signing-link-form"><label for="signing-link">Temporary EdgeOne access URL (only if EdgeOne requests one)</label><div class="link-entry"><input id="signing-link" name="signingLink" type="url" inputmode="url" autocomplete="off" placeholder="https://zhenli-sequential-signing.edgeone.cool/?eo_token=..." value=""><button type="submit" class="btn primary">Save link for session</button>${action('Clear','clear-signing','','quiet')}</div><p class="fineprint">Protected access tokens are stored only in this browser session, never in GitHub or Supabase. Generate a fresh link when the token expires.</p></form>`;
}
'''
s = s[:start] + replacement + s[end:]

# Remove legacy refresh action, if present.
s, n_refresh = re.subn(r"^\s*if\(a==='reload-signing'\).*?\}\s*return;\s*\}\s*\n", '\n', s, flags=re.MULTILINE)

# Keep launch handler, including V1.2 expiry check if present.
if "a==='open-signing'||a==='launch-hosted-task'" not in s:
    sys.exit('ERROR: Cannot find direct browser launcher. No changes applied.')

# Explicit version in footer where this known text still exists.
s = s.replace('ZHENLI DMS V1.0 · Web + Android', 'ZHENLI DMS V1.0 · Web + Android · Signing V1.3')

# Guard against accidentally leaving an iframe in signing panel.
span = s[s.index('function renderSigning(){'):s.index('function renderLinkModal()')]
if '<iframe' in span or 'signing-frame' in span:
    sys.exit('ERROR: Embedded signing iframe remains. No changes applied.')

src.write_text(s, encoding='utf-8')
print('SUCCESS: Signing tab now uses secure first-party browser login (V1.3).')
print('Check the DMS Signing tab for the visible label: Signing connection V1.3.')
print('Task Hub, Master Listing importer, EdgeOne and Supabase were not modified.')
