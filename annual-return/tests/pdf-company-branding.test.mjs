import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Existing saved drafts and new drafts share renderPages; their data is not migrated.
const source=readFileSync(new URL('../src/pdf.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');

test('all Annual Return review PDF pages use the ZHENLI company heading',()=>{
 assert.match(source,/class="pdf-brand-name">ZHENLI CONSULTANCY SERVICES SDN\. BHD\./);
 assert.doesNotMatch(source,/class="pdf-brand-name">UNICOSEC/);
 assert.match(source,/class="pdf-brand-note">ANNUAL RETURN REVIEW/);
 assert.match(source,/ZHENLI CONSULTANCY SERVICES SDN\. BHD\. · ANNUAL RETURN PARTICULARS/);
 assert.match(styles,/\.pdf-brand-name\{[^}]*font-size:13px/);
});
