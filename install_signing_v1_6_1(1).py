#!/usr/bin/env python3
"""ZHENLI DMS Native Signing V1.6.1 hotfix; frontend only.

Fixes capture-before-render in Save positions and prevents sharing draft
signer links. Normalizes copied signer links onto the existing signing
site. No server, storage, secret or database configuration is modified.

Run in the root of zenithloh1016/zhenli-unified-dms.
"""
from datetime import datetime, timezone
from pathlib import Path
import shutil
import sys

ROOT = Path.cwd()
PATH = ROOT / 'src/signing-native.js'
MARKER = 'ZS_DMS_SIGNING_V1_6_1_HOTFIX'

OLD_SAVE = """    if(action==='save-boxes')return work(async()=>{
      const boxes=captureRows().map(row=>({...row,x:row.x/100,y:row.y/100,width:row.width/100,height:row.height/100}));
      await api(`/requests/${detail.id}/placements`,{method:'POST',json:{placements:boxes}});
      await open(detail.id);feedback(`Saved ${boxes.length} signature box(es).`);
    });"""

NEW_SAVE = """    // ZS_DMS_SIGNING_V1_6_1_HOTFIX: snapshot edited inputs BEFORE work() re-renders the DMS.
    if(action==='save-boxes'){
      const rows=captureRows();
      if(!rows.length)return feedback('Add a signature box before saving.',true);
      let boxes;
      try {
        boxes=rows.map((row,i)=>{
          const doc=detail.docs.find(d=>d.id===row.docId);
          const signer=detail.signers.find(s=>s.id===row.signerId);
          if(!doc||!signer||!Number.isInteger(row.page)||row.page<1||row.page>doc.pages)
            throw new Error(`Box ${i+1}: select a valid PDF, signer and page.`);
          if(![row.x,row.y,row.width,row.height].every(Number.isFinite)
             ||row.x<0||row.y<0||row.width<4||row.height<2.5
             ||row.x+row.width>100.00001||row.y+row.height>100.00001)
            throw new Error(`Box ${i+1}: signature box must fit entirely within the page.`);
          return {...row,x:row.x/100,y:row.y/100,width:row.width/100,height:row.height/100};
        });
      }catch(ex){return feedback(ex.message||String(ex),true);}
      // Preserve the edits even if the request fails. Never reset existing records.
      placementRows=rows;
      return work(async()=>{
        const result=await api(`/requests/${detail.id}/placements`,{method:'POST',json:{placements:boxes}});
        await open(detail.id);
        feedback(`Saved ${Number.isInteger(result.count)?result.count:boxes.length} signature box(es).`);
      });
    }"""

OLD_LINK = """    if(action==='copy-link'){
      const signer=detail.signers.find(s=>s.id===id);if(!signer)return;
      try {await navigator.clipboard.writeText(signer.link);feedback('Signer invitation link copied.');}
      catch{feedback('Unable to copy. Check browser clipboard permissions.',true);}return;
    }"""

NEW_LINK = """    if(action==='copy-link'){
      const signer=detail.signers.find(s=>s.id===id);if(!signer)return;
      // Never share an unactivated draft link: signer PDFs are unavailable in draft state.
      if(detail.status==='draft')return feedback('This request is still a draft. Save positions for every signer and activate the request before sharing links.',true);
      try {
        if(!signer.link)throw new Error('No signing URL was returned by the API.');
        // The API sometimes returns a link with an incorrect frontend origin.
        // Rebuild only the host/path, preserving the opaque token unchanged.
        const source=new URL(signer.link,API_ORIGIN);
        const ticket=source.searchParams.get('token');
        if(source.pathname!=='/sign.html'||!ticket||!/^[A-Za-z0-9._-]{15,400}$/.test(ticket))
          throw new Error('The signing API returned an invalid signer link.');
        const canonical=new URL('/sign.html',API_ORIGIN);
        canonical.searchParams.set('token',ticket);
        await navigator.clipboard.writeText(canonical.href);
        feedback(detail.status==='pending'&&!signer.signedAt
          ? 'Signing link copied. The signer can sign only during their turn and before expiry.'
          : 'Signing link copied. Check request status before sharing.');
      }catch(ex){feedback(`Unable to copy a working signer link: ${ex.message||ex}`,true);}return;
    }"""

def replace_one(src, old, new, label):
    c=src.count(old)
    if c!=1:
        raise ValueError(f'Stopped: expected one {label} block, found {c}. No files changed.')
    return src.replace(old,new,1)

def main():
    if not PATH.is_file():
        raise RuntimeError('Run this script from the zhenli-unified-dms repository root.')
    text=PATH.read_text(encoding='utf-8')
    if MARKER in text:
        print('Native Signing V1.6.1 hotfix already installed; no changes made.')
        return
    if 'Native Signing V1.6</span>' not in text or 'ZS_PDF_SIGNATURE_PREVIEW_V1_6' not in text:
        raise ValueError('Expected Native Signing V1.6 was not found. No files changed.')
    new=replace_one(text,OLD_SAVE,NEW_SAVE,'Save positions')
    new=replace_one(new,OLD_LINK,NEW_LINK,'Copy signing link')
    new=replace_one(new,'Native Signing V1.6</span>','Native Signing V1.6.1</span>','version label')
    backup = Path('/tmp')/'zhenli_dms_signing_v161_backup'/datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    backup.mkdir(parents=True,exist_ok=True)
    shutil.copy2(PATH,backup/PATH.name)
    PATH.write_text(new,encoding='utf-8')
    print('SUCCESS: ZHENLI DMS Native Signing V1.6.1 hotfix applied.')
    print(f'Backup of old signing module: {backup/PATH.name}')
    print('Run: npm run build')
    print('No stored signing requests, original PDFs, SMTP configuration, keys, or database entries were modified.')

if __name__=='__main__':
    try: main()
    except Exception as e:
        print(f'NOT INSTALLED: {e}',file=sys.stderr)
        sys.exit(1)
