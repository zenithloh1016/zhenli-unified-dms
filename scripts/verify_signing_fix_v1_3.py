#!/usr/bin/env python3
"""Fail fast if outdated iframe-based Signing UI is still present."""
from pathlib import Path
import sys
p=Path('src/main.js')
if not p.is_file(): sys.exit('FAIL: src/main.js missing (wrong working directory).')
s=p.read_text('utf-8')
start=s.find('function renderSigning(){')
end=s.find('function renderLinkModal()',start)
if start<0 or end<0: sys.exit('FAIL: Cannot find Signing section.')
sec=s[start:end]
for forbidden in ('<iframe','signing-frame','reload-signing'):
    if forbidden in sec: sys.exit(f'FAIL: Old Signing integration found: {forbidden}')
for required in ('ZHENLI_SIGNING_DIRECT_LAUNCH_V1_3','Signing connection V1.3',"'open-signing'"):
    if required not in s: sys.exit(f'FAIL: Missing new Signing UI marker: {required}')
print('PASS: Signing V1.3 source is installed; iframe-based login is gone.')
