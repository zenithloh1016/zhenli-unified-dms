import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank,importAnnualReturnText,normalizeDocument,outputFilename,emptyCount,populatedCount} from '../src/core.js';
test('blank bilingual template has all current structural fields without real client values',()=>{
  const blank=cloneBlank();
  assert.equal(blank.particulars.length,129);
  assert.equal(blank.particulars.filter(x=>x.type==='field').length,112);
  assert.equal(populatedCount(blank),0);
  assert.equal(emptyCount(blank),112);
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
  assert.equal(normalizeDocument(draft).particulars.length,129);
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
 assert.ok(html.includes('V1.9'));
 assert.ok(!html.includes('id="register-book-file"'));
 assert.ok(!html.includes('id="apply-register"'));
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
 assert.equal(out.schemaVersion,6);
 assert.equal(out.particulars.length,129);
 assert.equal(out.particulars.some(x=>forbidden.includes(x.en)),false);
 assert.equal(Object.hasOwn(out.company,'lodgementDueDate'),false);
 assert.equal(Object.hasOwn(out.company,'masterListingDueDate'),false);
 const gs='const AR_SINGLE_COMPANY = '+JSON.stringify(draft)+';';
 const parsed=importAnnualReturnText(gs,'legacy.gs');
 assert.equal(parsed.particulars.some(x=>forbidden.includes(x.en)),false);
 assert.ok(parsed.particulars.some(x=>x.en==='Nature of Business / MSIC Code'));
});

test('V1.6 removes TIN and the entire Company Review and Verification section from old imports',()=>{
 const raw=cloneBlank();
 raw.particulars.splice(4,0,{type:'field',en:'Tax Identification Number (TIN)',cn:'税务识别号码',value:'C-123'});
 raw.particulars.push({type:'section',en:'COMPANY REVIEW AND VERIFICATION NOTES',cn:'公司资料核实事项',value:''});
 raw.particulars.push({type:'field',en:'Preference Allotment',cn:'优先股配发',value:'Private client details'});
 raw.particulars.push({type:'field',en:'BO Information',cn:'实益拥有人资料',value:'Private details'});
 raw.signatureDirector.date='2026-10-18';
 raw.signatureDirector.acknowledgement='Signed';
 const restored=importAnnualReturnText('const AR_SINGLE_COMPANY = '+JSON.stringify(raw)+';', 'legacy.gs');
 assert.equal(restored.particulars.length,129);
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
});

test('V1.6 removes all requested dates in both blank template and legacy imported GS',()=>{
 const fieldNames=['Date of Appointment','Date of Secretary Appointment','Date Entered as Member',
 'Date Became / Ceased as BO','Notice / BO Confirmation Dates','Date of Notice'];
 const blank=cloneBlank();
 assert.equal(blank.particulars.some(x=>fieldNames.includes(x.en)),false);
 const legacy=cloneBlank();
 legacy.particulars.push(...fieldNames.map(en=>({type:'field',en,cn:'测试',value:'2026-10-18'})));
 const parsed=importAnnualReturnText('const AR_SINGLE_COMPANY = '+JSON.stringify(legacy)+';','legacy.gs');
 assert.equal(parsed.particulars.length,129);
 assert.equal(parsed.particulars.some(x=>fieldNames.includes(x.en)),false);
 assert.equal(parsed.particulars.some(x=>x.en==='Date of Incorporation'),true);
 assert.equal(parsed.particulars.some(x=>x.en==='Date of Birth'),true);
 assert.equal(parsed.particulars.some(x=>x.en==='Date of Registration'),true);
 assert.equal(parsed.particulars.some(x=>x.en==='Discharge Date'),false);
 assert.deepEqual(Object.keys(parsed.signatureDirector).sort(),['designation','name','nric']);
});
test('V1.6 Criteria E is in the selectable BO criteria list and survives JSON serialization',async()=>{
 const {readFileSync}=await import('node:fs');
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const pdf=readFileSync(new URL('../src/pdf.js',import.meta.url),'utf8');
 assert.ok(main.includes(" E:'Is a member of the company"));
 assert.ok(main.includes('([ABCDE])'));
 const draft=cloneBlank();
 const criteria=draft.particulars.find(x=>x.en==='Criteria of Beneficial Ownership');
 criteria.value='Criteria A, Criteria C, Criteria E';
 const imported=importAnnualReturnText(JSON.stringify(draft),'draft.json');
 assert.equal(imported.particulars.find(x=>x.en==='Criteria of Beneficial Ownership').value,'Criteria A, Criteria C, Criteria E');
 assert.ok(pdf.includes('DIRECTOR CONFIRMATION'));
 assert.ok(!pdf.includes('SIGNING ACKNOWLEDGEMENT'));
 assert.ok(!pdf.includes('sign.date'));
});

test('legacy Beneficial Owner notice date aliases never appear in saved drafts or PDFs',()=>{
 const legacy=cloneBlank();
 const extra=['Date of Notice of BO','Date of Notice of Beneficial Owner',
   'Date of Notice of Beneficial Ownership','BO Notice Date','Beneficial Ownership Notice Date',
   'Date of BO Notice','Date of Beneficial Ownership Notice'];
 legacy.particulars.push(...extra.map(en=>({type:'field',en,cn:'通知日期',value:'2026-10-18'})));
 for(const extension of ['.json','.gs']){
   const input=extension==='.gs'?'const AR_SINGLE_COMPANY = '+JSON.stringify(legacy)+';':JSON.stringify(legacy);
   const result=importAnnualReturnText(input,'older'+extension);
   assert.equal(result.particulars.length,129);
   assert.equal(result.particulars.some(x=>extra.includes(x.en)),false);
 }
});

test('DMS company picker safeguards identity and does not copy statutory particulars to another company',async()=>{
 const {readFileSync}=await import('node:fs');
 const parent=readFileSync(new URL('../../src/main.js',import.meta.url),'utf8');
 const child=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.ok(parent.includes('state.companies.slice(0,5000)'));
 assert.ok(parent.includes('complete Documents company dropdown'));
 assert.ok(!parent.includes('id="ar-company-search"'));
 assert.ok(parent.includes('ZHENLI_DMS_AR_COMPANY_LIST'));
 assert.ok(parent.includes('ZHENLI_AR_SELECT_COMPANY_REQUEST'));
 assert.ok(!child.includes('data-company-lookup'));
 assert.ok(!child.includes('data-dms-company-id'));
 assert.ok(!child.includes('companyOptions('));
 assert.ok(!child.includes('Or search by company name / registration number'));
 assert.ok(child.includes('data-company-select'));
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

test('individual field deletion is retained after exporting and importing JSON',async()=>{
 const {deleteParticularField}=await import('../src/core.js');
 const draft=cloneBlank();
 const i=draft.particulars.findIndex(x=>x.en==='Type of Shares Issued');
 assert.ok(i>=0);
 assert.equal(deleteParticularField(draft,i).en,'Type of Shares Issued');
 assert.ok(!draft.particulars.some(x=>x.en==='Type of Shares Issued'));
 const roundTrip=importAnnualReturnText(JSON.stringify(normalizeDocument(draft)),'test.json');
 assert.ok(!roundTrip.particulars.some(x=>x.en==='Type of Shares Issued'));
 assert.equal(deleteParticularField(roundTrip,roundTrip.particulars.findIndex(x=>x.en==='Company Name')).en,'Company Name');
 assert.ok(!roundTrip.particulars.some(x=>x.en==='Company Name'));
});
test('obsolete charge amount and discharge date excluded from old GS drafts and final PDF particulars',()=>{
 const excluded=['Recorded Amount of Indebtedness (not outstanding balance)','Discharge Date'];
 const doc=cloneBlank();
 assert.ok(excluded.every(x=>!doc.particulars.some(y=>y.en===x)));
 doc.particulars.push(...excluded.map(en=>({type:'field',en,cn:'',value:'PRIVATE'})));
 const json=normalizeDocument(doc);
 assert.ok(excluded.every(x=>!json.particulars.some(y=>y.en===x)));
 const oldGs=importAnnualReturnText('const AR_SINGLE_COMPANY = '+JSON.stringify(doc)+';','old.gs');
 assert.ok(excluded.every(x=>!oldGs.particulars.some(y=>y.en===x)));
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

test('Annual Return DMS selector shows full company dropdown without name or registration search',async()=>{
 const {readFileSync}=await import('node:fs');
 const child=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.ok(child.includes('dmsCompanies.map'));
 assert.ok(child.includes('data-company-select'));
 assert.ok(child.includes('— Select a company from the complete list —'));
 assert.ok(!child.includes('companyOptions('));
 assert.ok(!child.includes('data-company-lookup'));
 assert.ok(!child.includes('data-company-results'));
 assert.ok(!child.includes('Or search by company name / registration number'));
 assert.ok(!child.includes('data-dms-company-id'));
 assert.ok(child.includes('ZHENLI_AR_SELECT_COMPANY_REQUEST'));
});

test('Company Constitution is removed; non-cash share allotment labels are general and preference-free',()=>{
 const doc=cloneBlank();
 assert.ok(!doc.particulars.some(x=>x.en==='Company Constitution'));
 assert.ok(!doc.particulars.some(x=>/marked preference allotment|Non-Cash Preference Allotment/i.test(x.en)));
 assert.ok(doc.particulars.some(x=>x.en==='Shares Issued Otherwise Than in Cash'));
 assert.ok(doc.particulars.some(x=>x.en==='Amount Considered Paid on Non-Cash Allotment'));
 assert.equal(doc.particulars.find(x=>x.en==='Shares Issued Otherwise Than in Cash').cn,'以非现金方式发行的股份');
 assert.equal(doc.particulars.find(x=>x.en==='Amount Considered Paid on Non-Cash Allotment').cn,'非现金配发视为已缴金额');
});
test('old .gs and JSON imports drop Constitution while preserving existing non-cash allotment values',()=>{
 const source=cloneBlank();
 source.schemaVersion=5;
 source.particulars.splice(13,0,{type:'field',en:'Company Constitution',cn:'公司章程',value:'Confidential details'});
 const first=source.particulars.find(x=>x.en==='Shares Issued Otherwise Than in Cash');
 first.en='Shares Issued Otherwise Than in Cash (marked preference allotment)';
 first.cn='以非现金方式发行的优先股';
 first.value='7500 shares';
 const paid=source.particulars.find(x=>x.en==='Amount Considered Paid on Non-Cash Allotment');
 paid.en='Amount Considered Paid on Non-Cash Preference Allotment';
 paid.cn='非现金优先股视为已缴足金额';
 paid.value='RM 7,500';
 const verify=restored=>{
  assert.equal(restored.schemaVersion,6);
  assert.equal(restored.particulars.length,129);
  assert.equal(restored.particulars.some(x=>x.en==='Company Constitution'),false);
  assert.equal(restored.particulars.find(x=>x.en==='Shares Issued Otherwise Than in Cash').value,'7500 shares');
  assert.equal(restored.particulars.find(x=>x.en==='Amount Considered Paid on Non-Cash Allotment').value,'RM 7,500');
  assert.ok(!restored.particulars.some(x=>x.en.includes('marked preference allotment')));
 };
 verify(normalizeDocument(source));
 verify(importAnnualReturnText(JSON.stringify(source),'old.json'));
 verify(importAnnualReturnText('const AR_SINGLE_COMPANY = '+JSON.stringify(source)+';', 'old.gs'));
});


test('Annual Return fullscreen, no field search, and user-enabled new section support',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const child=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const parent=readFileSync(new URL('../../src/main.js',import.meta.url),'utf8');
 const styles=readFileSync(new URL('../../src/style.css',import.meta.url),'utf8');
 assert.ok(html.includes('id="toggle-fullscreen"'));
 assert.ok(!html.includes('id="search"'));
 assert.ok(html.includes('id="add-section"'));
 assert.ok(!child.includes("$('search')"));
 assert.ok(child.includes("$('add-section')"));
 assert.ok(child.includes('data-add-to-section'), 'retain the useful add-field control within each section');
 assert.ok(parent.includes('data-action="open-ar-fullscreen"'));
 assert.ok(parent.includes('data-action="exit-ar-fullscreen"'));
 assert.ok(parent.includes('ZHENLI_AR_FULLSCREEN_TOGGLE'));
 assert.ok(parent.includes('setAnnualReturnFullscreen(!state.arFullscreen)'));
 assert.ok(styles.includes('.annual-return-module.ar-fullscreen-open'));
 assert.ok(child.includes('ZHENLI_DMS_AR_FULLSCREEN_STATE'));
 assert.ok(child.includes('ar-immersive'));
 assert.ok(parent.includes('Do not call render()'), 'full screen toggles must not reload the form');
});


test('bilingual edit and removal of every section and field survive JSON save and PDF label lookup',async()=>{
 const {displayParticularLabel,updateParticularLabel,removeParticularSection,removeParticularHeading,deleteParticularField,syncCompanyDetails,setCompanyDetail}=await import('../src/core.js');
 const doc=cloneBlank();
 const firstSection=doc.particulars.findIndex(x=>x.type==='section');
 const identity=doc.particulars.findIndex(x=>x.en==='Company Name');
 const regNo=doc.particulars.findIndex(x=>x.en==='Company Registration No.');
 doc.particulars[identity].value='EXAMPLE TEST SDN. BHD.';
 doc.particulars[regNo].value='202601001234';
 syncCompanyDetails(doc);
 updateParticularLabel(doc,firstSection,'MY COMPANY DETAILS','更新公司资料');
 updateParticularLabel(doc,identity,'Legal Entity Name','公司法定名称');
 assert.equal(doc.particulars[firstSection].en,'COMPANY DETAILS','internal schema key is preserved');
 assert.equal(doc.particulars[identity].en,'Company Name','identity mapping is preserved');
 assert.equal(displayParticularLabel(doc.particulars[identity]),'Legal Entity Name');
 assert.equal(doc.company.name,'EXAMPLE TEST SDN. BHD.');
 const restored=normalizeDocument(JSON.parse(JSON.stringify(doc)));
 assert.equal(displayParticularLabel(restored.particulars[firstSection]),'MY COMPANY DETAILS');
 assert.equal(displayParticularLabel(restored.particulars[identity],'cn'),'公司法定名称');
 assert.equal(restored.particulars[identity].value,'EXAMPLE TEST SDN. BHD.');
 setCompanyDetail(restored,identity,'NEW COMPANY NAME');
 assert.equal(restored.company.name,'NEW COMPANY NAME');
 const sectionIndex=restored.particulars.findIndex(x=>x.type==='section'&&/CURRENT BENEFICIAL OWNERS/i.test(x.en));
 assert.ok(sectionIndex>=0);
 const sectionName=displayParticularLabel(restored.particulars[sectionIndex]);
 const removed=removeParticularSection(restored,sectionIndex);
 assert.equal(removed.name,sectionName);
 assert.ok(!restored.particulars.some(x=>x.type==='section'&&x.en===sectionName));
 const fieldIndex=restored.particulars.findIndex(x=>x.en==='Company Registration No.');
 assert.equal(deleteParticularField(restored,fieldIndex).en,'Company Registration No.');
 assert.ok(!restored.particulars.some(x=>x.en==='Company Registration No.'));
 const heading=restored.particulars.findIndex(x=>x.type==='heading'&&!/^(?:DIRECTOR|MEMBER|BENEFICIAL OWNER) \d+$/i.test(x.en));
 if(heading>=0){
  const result=removeParticularHeading(restored,heading);
  assert.ok(result.name);
 }
 restored.particulars.push({type:'section',en:'CUSTOM DETAILS',cn:'自定义字段',value:''});
 assert.equal(normalizeDocument(restored).particulars.at(-1).en,'CUSTOM DETAILS');
});
test('all sections can be removed and a fresh section added without invalidating the local draft',async()=>{
 const {removeParticularSection,normalizeDocument,displayParticularLabel}=await import('../src/core.js');
 const draft=cloneBlank();
 while(draft.particulars.some(x=>x.type==='section')){
  const i=draft.particulars.findIndex(x=>x.type==='section');
  removeParticularSection(draft,i);
 }
 assert.equal(draft.particulars.length,0);
 assert.equal(normalizeDocument(draft).particulars.length,0);
 draft.particulars.push({type:'section',en:'RESTORED SECTION',cn:'恢复部分',value:''});
 assert.equal(displayParticularLabel(normalizeDocument(draft).particulars[0]),'RESTORED SECTION');
});
