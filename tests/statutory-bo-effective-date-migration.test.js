import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegisterBook} from '../src/statutory-register-data.js';
import {ensureReferenceParticulars} from '../src/statutory-register-review.js';
import {buildGroupedRegister} from '../src/statutory-register-annual-layout.js';
import {renderStatutoryRegisterDocument} from '../src/statutory-register-annual-ui.js';
import {extractBoBecomingDate,isLegacyBoCombinedDateField,excludeRegisterField} from '../src/statutory-register-reference.js';

const company={id:'co1',name:'TEST BO COMPANY SDN. BHD.',registration_no:'202601234567'};
const oldHeading='Date a Person Becomes / Cease to Become BO';
const otherHeading='Date a Person Becomes / Ceases to Become BO';
function imported(rows,withEffective=true){
 const headings=['Full Name','Identification No.','Criteria',
  oldHeading,'Date of Notices Pursuant to Section 56'];
 if(withEffective)headings.push('Effective Date Becoming BO');
 headings.push('Cessation Date');
 return makeRegisterBook(company,{path:'Original BO Register.xlsx',sheets:[
  {name:'Register of Beneficial Owners',rows:[headings,...rows]}
 ]});
}
const page=book=>buildGroupedRegister(book,0,{showBlanks:true});
const values=book=>page(book).blocks.filter(x=>x.type==='field');
const effective=book=>values(book).filter(x=>x.label==='Effective Date Becoming BO');

test('legacy date field is hidden and becoming date is migrated to blank effective date',()=>{
 const input=['BENEFICIAL OWNER','ID123','CRITERIA A\\nCRITERIA B',
  'Date becoming BO: 06/06/2025\\n-\\nDate ceasing BO: -',
  'Date of notice: 10/06/2025','',''];
 const book=imported([input]);
 const original=structuredClone(book.sheets[0].rows);
 assert(isLegacyBoCombinedDateField(oldHeading));
 assert(isLegacyBoCombinedDateField(otherHeading));
 assert(excludeRegisterField('Register of Beneficial Owners',oldHeading));
 assert.equal(ensureReferenceParticulars(book),true);
 assert.deepEqual(book.sheets[0].rows[1].slice(0,5),input.slice(0,5),
  'all legacy source values, including notice and combined dates, remain unchanged');
 assert.equal(book.sheets[0].rows[1][5],'06/06/2025',
  'only the previously blank effective-date cell receives the becoming date');
 assert.equal(book.sheets[0].rows[1][6],'','cessation remains unmodified');
 const cells=values(book);
 assert.equal(effective(book).length,1);
 assert.equal(effective(book)[0].value,'06/06/2025');
 assert(!cells.some(x=>/Date a Person Becomes \/ Cease/i.test(x.label)));
 assert(!cells.some(x=>/Date of Notices/i.test(x.label)));
 assert(!cells.some(x=>x.value.includes('Date ceasing BO:')));
 const html=renderStatutoryRegisterDocument(book,0,{showBlanks:true});
 assert(html.includes('Effective Date Becoming BO'));
 assert(html.includes('06/06/2025'));
 assert(!html.includes('Date a Person Becomes'));
 assert(!html.includes('Date ceasing BO'));
 assert.equal(ensureReferenceParticulars(book),false,'second standardization is idempotent');
 assert.deepEqual(book.sheets[0].rows[0].slice(0,original[0].length),original[0]);
});

test('legacy imported BO sheets without an effective-date column gain one and preserve other dates',()=>{
 const b=imported([
  ['ONE','ID-1','A','Date becoming BO: 23/07/2014','Date of notice: 11/08/2014',''],
  ['TWO','ID-2','B','Date becoming BO: 05/05/2020','Date of notice: 12/05/2020','01/01/2026']
 ],false);
 const originals=structuredClone(b.sheets[0].rows);
 assert.equal(ensureReferenceParticulars(b),true);
 assert.equal(b.sheets[0].rows[0].filter(x=>x==='Effective Date Becoming BO').length,1);
 const labels=b.sheets[0].rows[0],eff=labels.indexOf('Effective Date Becoming BO');
 assert.equal(b.sheets[0].rows[1][eff],'23/07/2014');
 assert.equal(b.sheets[0].rows[2][eff],'05/05/2020');
 assert.deepEqual(b.sheets[0].rows[1].slice(0,originals[1].length),originals[1]);
 assert.deepEqual(b.sheets[0].rows[2].slice(0,originals[2].length),originals[2]);
 assert.equal(page(b).blocks.filter(x=>x.type==='record'&&x.status==='Former').length,1);
 assert.equal(effective(b).length,2);
 assert.equal(ensureReferenceParticulars(b),false);
});

test('existing recorded effective date is never overwritten by a different legacy date',()=>{
 const b=imported([['ONE','ID-1','A','Date becoming BO: 06/06/2025',
  'Date of notice: 06/06/2025','01/05/2025','']]);
 assert.equal(ensureReferenceParticulars(b),true);
 assert.equal(effective(b)[0].value,'01/05/2025');
 assert.equal(b.sheets[0].rows[1][3],'Date becoming BO: 06/06/2025');
});

test('ambiguous, blank and invalid legacy values do not create guessed BO effective dates',()=>{
 const ambiguous='Date becoming BO: 31/02/2025\\nDate ceasing BO: 01/03/2025';
 for(const [raw,expected] of [
  ['Date becoming BO: 06/06/2025\\nDate ceasing BO: 01/08/2025','06/06/2025'],
  ['06/06/2025','06/06/2025'],
  ['2025-06-06','2025-06-06'],
  ['Date ceasing BO: 01/08/2025',''],
  ['Date of notice: 07/07/2025',''],
  [ambiguous,''],
  ['Date becoming BO: -\\nDate ceasing BO: -',''],
  ['06/06/2025\\n07/07/2025','']
 ])assert.equal(extractBoBecomingDate(raw.replaceAll('\\n','\n')),expected,raw);
 const b=imported([['ONE','ID','A',ambiguous.replaceAll('\\n','\n'),'','', '']]);
 ensureReferenceParticulars(b);
 assert.equal(effective(b)[0].value,'');
});

test('old combined heading is hidden even when no date can be extracted',()=>{
 const b=imported([['ONE','ID','A','Not yet available','','','']]);
 ensureReferenceParticulars(b);
 const cells=values(b);
 assert(!cells.some(x=>x.label===oldHeading));
 assert.equal(effective(b).length,1);
 assert.equal(effective(b)[0].value,'');
});
