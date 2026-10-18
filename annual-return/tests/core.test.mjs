import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank,importAnnualReturnText,normalizeDocument,outputFilename,emptyCount,populatedCount} from '../src/core.js';
test('blank bilingual template has all current structural fields without real client values',()=>{
  const blank=cloneBlank();
  assert.equal(blank.particulars.length,130);
  assert.equal(blank.particulars.filter(x=>x.type==='field').length,113);
  assert.equal(populatedCount(blank),0);
  assert.equal(emptyCount(blank),113);
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
  assert.equal(normalizeDocument(draft).particulars.length,130);
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
 assert.ok(html.includes('V1.7'));
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
 assert.equal(out.schemaVersion,4);
 assert.equal(out.particulars.length,130);
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
 assert.equal(restored.particulars.length,130);
 assert.equal(restored.particulars.some(x=>/^(?:Tax Identification Number(?: \(TIN\))?|TIN|COMPANY REVIEW AND VERIFICATION NOTES)$/i.test(x.en)),false);
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
 assert.ok(root.includes('select-ar-company'));
 assert.ok(root.includes('prepare-annual-return'));
 assert.ok(root.includes('registration_no'));
 assert.ok(root.includes('ZHENLI_DMS_AR_SELECT_COMPANY'));
 assert.ok(root.includes('zh-annual-return-frame'));
});
test('DMS company picker safeguards identity and does not copy statutory particulars to another company',async()=>{
 const {readFileSync}=await import('node:fs');
 const parent=readFileSync(new URL('../../src/main.js',import.meta.url),'utf8');
 const child=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.ok(parent.includes('state.companies.slice(0,5000)'));
 assert.ok(parent.includes('Company Details → Company Name'));
 assert.ok(!parent.includes('id="ar-company-search"'));
 assert.ok(parent.includes('ZHENLI_DMS_AR_COMPANY_LIST'));
 assert.ok(parent.includes('ZHENLI_AR_SELECT_COMPANY_REQUEST'));
 assert.ok(!child.includes('data-company-lookup'));
 assert.ok(!child.includes('data-dms-company-id'));
 assert.ok(!child.includes('companyOptions('));
 assert.ok(!child.includes('Search company name or registration number'));
 assert.ok(child.includes('data-company-select'));
 assert.ok(child.includes('dmsCompanies.map'));
 assert.ok(child.includes('data-delete-field'));
 assert.ok(parent.includes('Company no longer exists'));
 assert.ok(parent.includes("event.origin!==window.location.origin"));
 assert.ok(child.includes("event.source!==window.parent"));
 assert.ok(child.includes('selectedDmsCompanyId'));
 assert.ok(child.includes('doc=cloneBlank()'));
 assert.ok(child.includes('setCompanyDetail(doc,i,name)'));
 assert.ok(child.includes('setCompanyDetail(doc,i,registrationNo)'));
 assert.ok(child.includes('This starts a new Annual Return form')||child.includes('starts a new Annual Return form'));
 assert.ok(child.includes('ZHENLI_AR_SELECTION_RESULT'));
 assert.ok(!child.includes('fetch("/api/dms/companies")'));
});


test('appointment/member entry/BO status and notice dates are removed on all imports and never reach PDF fields',()=>{
 const forbidden=['Date of Appointment','Date of Secretary Appointment','Date Entered as Member',
 'Date Became / Ceased as BO','Notice / BO Confirmation Dates','Date of Notice of BO'];
 const draft=cloneBlank();
 assert.equal(draft.particulars.some(x=>forbidden.includes(x.en)),false);
 draft.particulars.splice(48,0,...forbidden.map(en=>({type:'field',en,cn:'test',value:'2026-10-18'})));
 const restored=normalizeDocument(draft);
 assert.equal(restored.particulars.length,130);
 assert.equal(restored.particulars.filter(x=>x.type==='field').length,113);
 assert.equal(restored.particulars.some(x=>forbidden.includes(x.en)),false);
 const importedGS=importAnnualReturnText('const AR_SINGLE_COMPANY = '+JSON.stringify(draft)+';','historic.gs');
 assert.equal(importedGS.particulars.some(x=>forbidden.includes(x.en)),false);
 const importedJSON=importAnnualReturnText(JSON.stringify(draft),'historic.json');
 assert.equal(importedJSON.particulars.some(x=>forbidden.includes(x.en)),false);
 assert.ok(importedJSON.particulars.some(x=>x.en==='Date of Birth'));
 assert.ok(importedJSON.particulars.some(x=>x.en==='Date of Incorporation'));
});

test('Users can delete a single Annual Return field and it stays deleted in exported/reimported JSON',async()=>{
 const {deleteParticularField}=await import('../src/core.js');
 const draft=cloneBlank();
 const index=draft.particulars.findIndex(x=>x.en==='Type of Shares Issued');
 assert.ok(index>=0);
 assert.equal(deleteParticularField(draft,index).en,'Type of Shares Issued');
 assert.equal(draft.particulars.some(x=>x.en==='Type of Shares Issued'),false);
 const exported=JSON.stringify(normalizeDocument(draft));
 const reopened=importAnnualReturnText(exported,'reimport.json');
 assert.equal(reopened.particulars.some(x=>x.en==='Type of Shares Issued'),false);
 assert.throws(()=>deleteParticularField(draft,draft.particulars.findIndex(x=>x.en==='Company Name')),/required/);
 assert.equal(reopened.particulars.find(x=>x.en==='Company Name').type,'field');
});
test('Charge field exclusions never reappear after legacy GS/JSON import',()=>{
 const excluded=['Recorded Amount of Indebtedness (not outstanding balance)','Discharge Date'];
 const draft=cloneBlank();
 assert.ok(excluded.every(name=>!draft.particulars.some(x=>x.en===name)));
 draft.particulars.push(...excluded.map(en=>({type:'field',en,cn:'',value:'EXCLUDED'})));
 const r=normalizeDocument(draft);
 assert.ok(excluded.every(name=>!r.particulars.some(x=>x.en===name)));
 const gs=importAnnualReturnText('const AR_SINGLE_COMPANY = '+JSON.stringify(draft)+';','legacy.gs');
 assert.ok(excluded.every(name=>!gs.particulars.some(x=>x.en===name)));
});

test('individual and corporate members retain separate statutory particulars and old records are upgraded',async()=>{
 const {showMemberField,MEMBER_PERSONAL_FIELDS}=await import('../src/core.js');
 const doc=cloneBlank(),list=doc.particulars;
 const first=list.findIndex(x=>x.type==='heading'&&x.en==='MEMBER 1');
 const next=list.findIndex((x,i)=>i>first&&x.type==='heading'&&x.en==='MEMBER 2');
 const rec=list.slice(first+1,next);
 assert.ok(MEMBER_PERSONAL_FIELDS.every(([en])=>rec.some(x=>x.en===en)));
 const type=list.findIndex((x,i)=>i>first&&i<next&&x.en==='Member Type');
 const person=list.findIndex((x,i)=>i>first&&i<next&&x.en==='Individual NRIC / Passport No.');
 const corp=list.findIndex((x,i)=>i>first&&i<next&&x.en==='Corporate Name');
 list[type].value='Individual';
 assert.equal(showMemberField(list,person),true);
 assert.equal(showMemberField(list,corp),false);
 list[corp].value='PREVIOUS CORPORATE NAME';
 assert.equal(showMemberField(list,corp),true,'Do not silently hide populated fields');
 list[corp].value='';
 list[type].value='Body Corporate';
 assert.equal(showMemberField(list,person),false);
 assert.equal(showMemberField(list,corp),true);
 const legacy=cloneBlank();
 legacy.particulars=legacy.particulars.filter(x=>!MEMBER_PERSONAL_FIELDS.some(([en])=>x.en===en));
 legacy.particulars.find(x=>x.en==='Corporate Name').value='LEGACY MEMBER SDN. BHD.';
 const converted=normalizeDocument(legacy);
 assert.equal(converted.particulars.filter(x=>x.en==='Member Type').length,2);
 assert.equal(converted.particulars.filter(x=>x.en==='Individual NRIC / Passport No.').length,2);
 assert.ok(converted.particulars.some(x=>x.en==='Corporate Name'&&x.value==='LEGACY MEMBER SDN. BHD.'));
});
test('old preference rights and corporate shareholder control fields stay absent from imported drafts',()=>{
 const draft=cloneBlank(),excluded=['Corporate Shareholder Control Classification','Preference Share Rights'];
 draft.particulars.push(...excluded.map(en=>({type:'field',en,cn:'',value:'OUTDATED'})));
 const normalized=normalizeDocument(draft);
 assert.ok(excluded.every(en=>!normalized.particulars.some(x=>x.en===en)));
 assert.ok(excluded.every(en=>!cloneBlank().particulars.some(x=>x.en===en)));
 const gs=importAnnualReturnText('const AR_SINGLE_COMPANY = '+JSON.stringify(draft)+';', 'old.gs');
 assert.ok(excluded.every(en=>!gs.particulars.some(x=>x.en===en)));
});
test('complete private company dropdown and Add Field per section/member appear in Annual Return editor',async()=>{
 const {readFileSync}=await import('node:fs');
 const js=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const pdf=readFileSync(new URL('../src/pdf.js',import.meta.url),'utf8');
 assert.ok(js.includes('data-company-select'));
 assert.ok(js.includes('dmsCompanies.map'));
 assert.ok(js.includes('data-add-to-section'));
 assert.ok(js.includes('data-add-to-member'));
 assert.ok(js.includes('data-add-record'));
 assert.ok(pdf.includes('showMemberField'));
});

test('Annual Return company selector has a dropdown but no search by name or registration number',async()=>{
 const {readFileSync}=await import('node:fs');
 const js=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.ok(js.includes('data-company-select'));
 assert.ok(js.includes('— Select a company from the complete list —'));
 assert.ok(!js.includes('Or search by company name / registration number'));
 assert.ok(!js.includes('data-company-lookup'));
 assert.ok(!js.includes('data-company-results'));
 assert.ok(!js.includes('data-dms-company-id'));
 assert.ok(js.includes("window.parent.postMessage({type:'ZHENLI_AR_SELECT_COMPANY_REQUEST'"));
});


test('Annual Return has fullscreen controls and no field search or Add Section button',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const child=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const parent=readFileSync(new URL('../../src/main.js',import.meta.url),'utf8');
 const styles=readFileSync(new URL('../../src/style.css',import.meta.url),'utf8');
 assert.ok(html.includes('id="toggle-fullscreen"'));
 assert.ok(!html.includes('id="search"'), 'field/section search bar must be removed');
 assert.ok(!html.includes('id="add-section"'), 'new-section creation option must be removed');
 assert.ok(!child.includes("$('search')"));
 assert.ok(!child.includes("$('add-section')"));
 assert.ok(child.includes('data-add-to-section'), 'Add field within existing sections must remain');
 assert.ok(parent.includes('data-action="open-ar-fullscreen"'));
 assert.ok(parent.includes('data-action="exit-ar-fullscreen"'));
 assert.ok(parent.includes('ZHENLI_AR_FULLSCREEN_TOGGLE'));
 assert.ok(parent.includes('setAnnualReturnFullscreen(!state.arFullscreen)'));
 assert.ok(styles.includes('.annual-return-module.ar-fullscreen-open'));
 assert.ok(child.includes('ZHENLI_DMS_AR_FULLSCREEN_STATE'));
 assert.ok(child.includes('ar-immersive'));
 assert.ok(parent.includes('Do not call render()'), 'full screen toggles must not reload iframe/drafts');
});
