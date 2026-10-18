import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank,importAnnualReturnText,normalizeDocument,outputFilename,emptyCount,populatedCount} from '../src/core.js';
test('blank bilingual template has all current structural fields without real client values',()=>{
  const blank=cloneBlank();
  assert.equal(blank.particulars.length,127);
  assert.equal(blank.particulars.filter(x=>x.type==='field').length,110);
  assert.equal(populatedCount(blank),0);
  assert.equal(emptyCount(blank),110);
  assert.ok(blank.particulars.some(x=>x.cn.includes('股权')));
  assert.equal(blank.company.name,'');
  assert.equal(blank.signatureDirector.nric,'');
  assert.ok(!JSON.stringify(blank).includes('CHANG AI NEE'));
});
test('imports JSON-compatible Google Apps Script without executing arbitrary JS',()=>{
  const script='const AR_SINGLE_COMPANY = '+JSON.stringify({
    company:{name:'EXAMPLE TEST SDN. BHD.',no:'202601000001',arYear:'2027',arDate:'01/02/2027'},
    particulars:[{type:'section',en:'COMPANY INFORMATION',cn:'公司资料'},
      {type:'field',en:'Registered Office',cn:'注册办事处',value:'Test address'}]
  },null,2)+';\nconst AR_SIGNATURE_DIRECTOR = '+JSON.stringify({name:'TEST DIRECTOR',nric:'TEST-ONLY'})+';\n';
  const actual=importAnnualReturnText(script,'test.gs');
  assert.equal(actual.company.name,'EXAMPLE TEST SDN. BHD.');
  assert.equal(actual.signatureDirector.name,'TEST DIRECTOR');
  assert.equal(actual.particulars[1].value,'Test address');
  assert.equal(outputFilename(actual),'EXAMPLE TEST SDN. BHD. - Annual Return 2027 Review.pdf');
});
test('rejects malformed or unsafe scripts and maintains editable draft JSON',()=>{
  assert.throws(()=>importAnnualReturnText('const AR_SINGLE_COMPANY = {}; alert(1);','bad.gs'),/Expected/);
  const draft=cloneBlank();draft.company.name='SAMPLE SDN. BHD.';draft.particulars[2].value='Test';
  const recovered=importAnnualReturnText(JSON.stringify(draft),'save.json');
  assert.equal(recovered.company.name,'SAMPLE SDN. BHD.');
  assert.equal(recovered.particulars[2].value,'Test');
  assert.equal(normalizeDocument(draft).particulars.length,127);
});

test('preserves multiple BO criteria and director capacity without signing date',()=>{
 const draft=cloneBlank();
 const item=draft.particulars.find(x=>x.en==='Criteria of Beneficial Ownership');
 assert.ok(item);item.value='Criteria A, Criteria C, Criteria D';
 draft.signatureDirector.acknowledgement='Old acknowledgement must be removed';
 draft.signatureDirector.date='2026-10-18';
 draft.signatureDirector.designation='Director';
 const recovered=normalizeDocument(draft);
 assert.equal(recovered.particulars.find(x=>x.en==='Criteria of Beneficial Ownership').value,'Criteria A, Criteria C, Criteria D');
 assert.equal(recovered.signatureDirector.designation,'Director');
 assert.equal(Object.hasOwn(recovered.signatureDirector,'acknowledgement'),false);
 assert.equal(Object.hasOwn(recovered.signatureDirector,'date'),false);
 assert.ok(recovered.particulars.some(x=>x.en==='Type of Shares Issued'));
});
test('Company Details replaces profile fields and remains source of PDF identity',async()=>{
 const {syncCompanyDetails,setCompanyDetail}=await import('../src/core.js');
 const blank=cloneBlank();
 assert.equal(blank.particulars[0].en,'COMPANY DETAILS');
 const nameIndex=blank.particulars.findIndex(x=>x.en==='Company Name');
 const numberIndex=blank.particulars.findIndex(x=>x.en==='Company Registration No.');
 const yearIndex=blank.particulars.findIndex(x=>x.en==='Annual Return Year');
 blank.particulars[nameIndex].value='DEMO REVIEW SDN. BHD.';
 setCompanyDetail(blank,nameIndex,blank.particulars[nameIndex].value);
 blank.particulars[numberIndex].value='202601234567';
 setCompanyDetail(blank,numberIndex,blank.particulars[numberIndex].value);
 blank.particulars[yearIndex].value='2027';
 setCompanyDetail(blank,yearIndex,blank.particulars[yearIndex].value);
 assert.equal(blank.company.name,'DEMO REVIEW SDN. BHD.');
 assert.equal(blank.company.no,'202601234567');
 assert.equal(blank.company.arYear,'2027');
 assert.equal(outputFilename(blank),'DEMO REVIEW SDN. BHD. - Annual Return 2027 Review.pdf');
 const recovered=normalizeDocument(blank);
 assert.equal(recovered.particulars[nameIndex].value,'DEMO REVIEW SDN. BHD.');
 assert.equal(recovered.company.no,'202601234567');
 const oldDraft=cloneBlank();
 oldDraft.particulars[0].en='COMPANY INFORMATION';
 oldDraft.company.name='LEGACY COMPANY SDN. BHD.';
 oldDraft.company.no='201901111111';
 const converted=normalizeDocument(oldDraft);
 assert.equal(converted.particulars[0].en,'COMPANY DETAILS');
 assert.equal(converted.particulars.find(x=>x.en==='Company Name').value,'LEGACY COMPANY SDN. BHD.');
 assert.equal(converted.particulars.find(x=>x.en==='Company Registration No.').value,'201901111111');
 assert.equal(syncCompanyDetails(converted).company.name,'LEGACY COMPANY SDN. BHD.');
});
test('Company Profile panel removed and Director Confirmation retained without signing acknowledgements',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const pdf=readFileSync(new URL('../src/pdf.js',import.meta.url),'utf8');
 assert.ok(html.includes('01 / COMPANY DETAILS'));
 assert.ok(html.includes('V1.5'));
 assert.ok(!html.includes('company-panel'));
 assert.ok(!html.includes('id="company-fields"'));
 assert.ok(html.indexOf('id="company-details"')<html.indexOf('id="signature-fields"'));
 assert.ok(pdf.includes('DIRECTOR CONFIRMATION'));
 assert.ok(!pdf.includes('SIGNING ACKNOWLEDGEMENT'));
 assert.ok(!pdf.includes('sign.date'));
 assert.ok(!html.includes('Signing Acknowledgement'));
 assert.ok(!pdf.includes('const meta=['));
});

test('excluded internal due dates and register update fields never survive .gs or JSON imports',()=>{
 const draft=cloneBlank();
 const forbidden=['Statutory Lodgement Deadline (30 calendar days)','Master Listing Internal Due Date',
  'Register Last Updated','Master Listing Internal Due vs Statutory 30 Days'];
 draft.company.lodgementDueDate='2026-11-01';
 draft.company.masterListingDueDate='2026-10-18';
 draft.particulars.push(...forbidden.map(en=>({type:'field',en,cn:'',value:'2026-10-18'})));
 const out=normalizeDocument(draft);
 assert.equal(out.schemaVersion,3);
 assert.equal(out.particulars.length,127);
 assert.equal(out.particulars.some(x=>forbidden.includes(x.en)),false);
 assert.equal(Object.hasOwn(out.company,'lodgementDueDate'),false);
 assert.equal(Object.hasOwn(out.company,'masterListingDueDate'),false);
 const gs='const AR_SINGLE_COMPANY = '+JSON.stringify(draft)+';';
 const parsed=importAnnualReturnText(gs,'legacy.gs');
 assert.equal(parsed.particulars.some(x=>forbidden.includes(x.en)),false);
 assert.ok(parsed.particulars.some(x=>x.en==='Nature of Business / MSIC Code'));
});

test('V1.5 removes TIN and the entire Company Review and Verification section from old imports',()=>{
 const raw=cloneBlank();
 raw.particulars.splice(4,0,{type:'field',en:'Tax Identification Number (TIN)',cn:'税务识别号码',value:'C-123'});
 raw.particulars.push({type:'section',en:'COMPANY REVIEW AND VERIFICATION NOTES',cn:'公司资料核实事项',value:''});
 raw.particulars.push({type:'field',en:'Preference Allotment',cn:'优先股配发',value:'Private client details'});
 raw.particulars.push({type:'field',en:'BO Information',cn:'实益拥有人资料',value:'Private details'});
 raw.signatureDirector.date='2026-10-18';
 raw.signatureDirector.acknowledgement='Signed';
 const restored=importAnnualReturnText('const AR_SINGLE_COMPANY = '+JSON.stringify(raw)+';', 'legacy.gs');
 assert.equal(restored.particulars.length,127);
 assert.equal(restored.particulars.some(x=>/TIN|COMPANY REVIEW AND VERIFICATION NOTES/i.test(x.en)),false);
 assert.equal(restored.particulars.some(x=>x.en==='Preference Allotment'&&x.value==='Private client details'),false);
 assert.equal(Object.hasOwn(restored.signatureDirector,'date'),false);
 assert.equal(Object.hasOwn(restored.signatureDirector,'acknowledgement'),false);
});
test('Annual Return module is part of the DMS navigation and bundler',async()=>{
 const {readFileSync}=await import('node:fs');
 const root=readFileSync(new URL('../../src/main.js',import.meta.url),'utf8');
 const pack=readFileSync(new URL('../../scripts/bundle-annual-return.mjs',import.meta.url),'utf8');
 assert.ok(root.includes("'annual-return'"));
 assert.ok(root.includes('zh-annual-return-frame'));
 assert.ok(pack.includes('dist/annual-return'));
});
