#!/usr/bin/env python3
"""Minimal, idempotent patch for ZHENLI Unified DMS Signing panel.
Changes only src/main.js. Never touches database, EdgeOne API, signing requests or PDFs.
Works on both original unified source V1.0 and Master Listing Import Fix V1.1.
"""
from pathlib import Path
import re
import sys

root = Path.cwd()
source_path = root / "src" / "main.js"
if not source_path.is_file():
    sys.exit("ERROR: src/main.js not found. Run from the GitHub repository root.")

source = source_path.read_text(encoding="utf-8")
marker = "// ZHENLI_SIGNING_COOKIE_SAFE_LAUNCH_V1_2"
if marker in source:
    print("Signing login fix V1.2 is already installed; no changes needed.")
    sys.exit(0)

start = source.find("function renderSigning(){")
end = source.find("\nfunction renderLinkModal()", start)
if start < 0 or end < 0:
    sys.exit("ERROR: Signing tab layout differs from expected V1.0/V1.1. No files changed.")

replacement = r'''// ZHENLI_SIGNING_COOKIE_SAFE_LAUNCH_V1_2
function renderSigning(){
  const url = getSigningUrl();
  const protectedLink = url !== SIGNING_BASE;
  return `<div class="integration-heading"><div><p class="eyebrow">ELECTRONIC DOCUMENT SIGNING</p><h1>Sequential Signing</h1><p class="muted">Connected to your existing Tencent EdgeOne signing workspace.</p></div>
    <div class="header-buttons">${action('Sign in / Open signing workspace','open-signing','','primary')}</div></div>
    <div class="integration-info"><b>Secure administrator login:</b> The signing website opens as a first-party browser page (Android: in-app Chrome Custom Tab; website: new tab). This allows the existing secure login cookie to work. Login inside an embedded frame is disabled because browser third-party cookie restrictions can cause a repeated login screen.</div>
    <section class="info-panel"><h2>Your existing signing requests remain available</h2><p>Use the button above to open the <b>original Tencent EdgeOne deployment</b>. You can create signing requests, set signature placements, invite signers, inspect audit logs and download signed PDFs there as before.</p>
    <p class="muted">${protectedLink ? 'A protected EdgeOne access link is active for this DMS browser session.' : 'The normal signing address is configured. If EdgeOne requires a temporary protected access link, paste a fresh one below.'} The signing administrator login is separate from your DMS login.</p>
    <div class="quick-actions">${action('Open existing signing website','open-signing','','primary')}</div></section>
    <form class="link-form" id="signing-link-form"><label for="signing-link">Temporary EdgeOne protected access URL (only if required)</label><div class="link-entry"><input id="signing-link" name="signingLink" type="url" inputmode="url" autocomplete="off" placeholder="https://zhenli-sequential-signing.edgeone.cool/?eo_token=..." value=""><button type="submit" class="btn primary">Save for session</button>${action('Clear link','clear-signing','','quiet')}</div><p class="fineprint">For security, the temporary URL is not shown after saving and is not committed to GitHub. It is cleared when your DMS browser session ends.</p></form>`;
}
'''
source = source[:start] + replacement + source[end:]

# Remove the iframe-only refresh action; the new panel deliberately has no cross-site iframe.
refresh_handler = "  if(a==='reload-signing'){const f=document.getElementById('signing-frame');if(f){f.src=getSigningUrl();}return;}\n"
if refresh_handler not in source:
    sys.exit("ERROR: Cannot locate original frame-refresh handler; no files changed.")
source = source.replace(refresh_handler, "", 1)

# Keep the original Capacitor Browser plugin and the Task Hub behavior.
old_launcher = '''  if(a==='open-signing'||a==='launch-hosted-task'){
    const url=a==='open-signing'?getSigningUrl():getTaskHubUrl();
    if(Capacitor.isNativePlatform()) busyDo(()=>Browser.open({url}));
    else window.open(url,'_blank','noopener,noreferrer');
    return;
  }'''
new_launcher = '''  if(a==='open-signing'||a==='launch-hosted-task'){
    const url=a==='open-signing'?getSigningUrl():getTaskHubUrl();
    if(a==='open-signing'){
      const time = new globalThis.URL(url).searchParams.get('eo_time');
      if(time && /^\\d{10}$/.test(time) && Number(time)*1000 < Date.now()){
        toast('Your temporary EdgeOne access link has expired. Paste a fresh link from the EdgeOne console and try again.');
        return;
      }
    }
    if(Capacitor.isNativePlatform()) busyDo(()=>Browser.open({url}));
    else window.open(url,'_blank','noopener,noreferrer');
    return;
  }'''
if source.count(old_launcher) != 1:
    sys.exit("ERROR: Cannot locate original signing launcher; no files changed.")
source = source.replace(old_launcher, new_launcher, 1)

source_path.write_text(source, encoding="utf-8")
print("SUCCESS: Updated src/main.js with secure first-party Sequential Signing launcher.")
print("Existing imports, Task Hub and DMS documents, and EdgeOne source are unchanged.")
print("Next: node --check src/main.js && git diff -- src/main.js")
