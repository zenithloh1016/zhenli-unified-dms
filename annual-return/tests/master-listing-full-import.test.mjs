import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneBlank} from '../src/core.js';
import {prepopulateAnnualReturnFromMasterListing} from '../src/master-listing-import.js';
const data={
 fields:{'Company Name':'EXAMPLE SDN BHD','Company Registration No.':'202601000001',
  'Former Name':'FORMER EXAMPLE SDN BHD','Date of Incorporation':'01/01/2020',
  'Registered Office':'IPOH OFFICE','Principal Place of Business':'IPOH BUSINESS',
  'Nature of Business / MSIC Code':'CONSTRUCTION | MSIC: 41001',
  'Classes of Shares Issued':'Ordinary','Number of Ordinary Shares':'100',
  'Ordinary Share Capital (recorded amount paid)':'100,000',
  'Annual Return Year':'2026'},
 people:{directors:['DIRECTOR A','DIRECTOR B','DIRECTOR C','DIRECTOR D','DIRECTOR E'],
  members:['MEMBER A','PARENT HOLDING SDN BHD'],bos:['BO A','BO B']},
 secretary:{'Secretary Name':'SECRETARY A','Secretary NRIC':'SSM-SECRETARY',
  'Practising Certificate Number':'PC123','Professional Membership':'MIA456'}
};
const auditor={name:'AUDIT & CO',registrationNo:'AF1234',address:'IPOH AUDIT OFFICE'};
const field=(doc,key)=>doc.particulars.find(x=>x.type==='field'&&x.en===key)?.value;
function scoped(doc,heading,key){
 const idx=doc.particulars.findIndex(x=>x.type==='heading'&&x.en===heading);
 if(idx<0)return undefined;
 const fields=doc.particulars.slice(idx+1);
 const stop=fields.findIndex(x=>x.type!=='field');
 return (stop<0?fields:fields.slice(0,stop)).find(x=>x.type==='field'&&x.en===key)?.value;
}
test('prefills all available matched listing fields, secretary, auditor and persons in empty existing AR',()=>{
 const blank=cloneBlank(),original=structuredClone(blank),listing=structuredClone(data);
 const {document,filled,listingFields,peopleFields,secretaryFields,auditorFields}=
  prepopulateAnnualReturnFromMasterListing(blank,listing,auditor);
 assert(filled>=20);
 assert(listingFields>=9);assert(peopleFields>=9);
 assert.equal(secretaryFields,4);assert.equal(auditorFields,3);
 assert.equal(field(document,'Company Name'),'EXAMPLE SDN BHD');
 assert.equal(document.company.no,'202601000001');
 assert.equal(field(document,'Nature of Business / MSIC Code'),'CONSTRUCTION\n41001 — ');
 assert.equal(field(document,'Ordinary Share Capital (recorded amount paid)'),'100,000');
 assert.equal(scoped(document,'DIRECTOR 5','Full Name'),'DIRECTOR E');
 assert.equal(scoped(document,'MEMBER 1','Individual Full Name'),'MEMBER A');
 assert.equal(scoped(document,'MEMBER 2','Corporate Name'),'PARENT HOLDING SDN BHD');
 assert.equal(scoped(document,'MEMBER 2','Member Type'),'Body Corporate');
 assert.equal(scoped(document,'BENEFICIAL OWNER 2','Full Name'),'BO B');
 assert.equal(scoped(document,'COMPANY SECRETARY','Secretary Name'),'SECRETARY A');
 assert.equal(scoped(document,'COMPANY SECRETARY','Practising Certificate Number'),'PC123');
 assert.equal(scoped(document,'AUDITOR','Audit Firm Name'),'AUDIT & CO');
 assert.equal(scoped(document,'AUDITOR','Audit Firm Registration No.'),'AF1234');
 assert.deepEqual(data,listing);
 assert.deepEqual(blank,original,'original remains untouched');
});
test('statutory and manually entered particulars always beat Master Listing and persons are not cross-combined',()=>{
 const d=cloneBlank();
 d.particulars.find(x=>x.en==='Company Name').value='VERIFIED COMPANY';
 d.particulars.find(x=>x.en==='Ordinary Share Capital (recorded amount paid)').value='VERIFIED RM 200,000';
 const director=d.particulars.findIndex(x=>x.type==='heading'&&x.en==='DIRECTOR 1');
 d.particulars[director+1].value='CURRENT REGISTER DIRECTOR';
 const secretary=d.particulars.findIndex(x=>x.type==='heading'&&x.en==='COMPANY SECRETARY');
 d.particulars[secretary+1].value='REGISTER SECRETARY';
 const {document,secretaryConflict}=prepopulateAnnualReturnFromMasterListing(d,data,auditor);
 assert.equal(field(document,'Company Name'),'VERIFIED COMPANY');
 assert.equal(field(document,'Ordinary Share Capital (recorded amount paid)'),'VERIFIED RM 200,000');
 assert.equal(scoped(document,'DIRECTOR 1','Full Name'),'CURRENT REGISTER DIRECTOR');
 assert.equal(scoped(document,'DIRECTOR 2','Full Name'),'','name fallbacks must not combine with register records');
 assert.equal(scoped(document,'COMPANY SECRETARY','Secretary NRIC'),'');
 assert.equal(secretaryConflict,true);
});
test('existing auditor is retained, absent listing can still populate auditor and deleted fields are not restored',()=>{
 const d=cloneBlank();
 d.particulars=d.particulars.filter(x=>x.en!=='Former Name');
 d.particulars.find(x=>x.en==='Audit Firm Name').value='VERIFIED AUDITOR';
 const result=prepopulateAnnualReturnFromMasterListing(d,data,auditor);
 assert.equal(result.document.particulars.find(x=>x.en==='Former Name'),undefined);
 assert.equal(scoped(result.document,'AUDITOR','Audit Firm Name'),'VERIFIED AUDITOR');
 assert.equal(scoped(result.document,'AUDITOR','Audit Firm Registration No.'),'AF1234');
 const noListing=prepopulateAnnualReturnFromMasterListing(cloneBlank(),null,auditor);
 assert.equal(scoped(noListing.document,'AUDITOR','Audit Firm Name'),'AUDIT & CO');
 assert.equal(noListing.secretaryFields,0);
});
