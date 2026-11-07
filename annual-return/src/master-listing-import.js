/**
 * Copy all Annual Return-compatible company particulars from the matched
 * private Master Listing into blank fields. Current-person name lists are a
 * fallback ONLY when the Statutory Registers have not supplied those records.
 * Never overwrite manually verified or register-derived draft values.
 */
import {cloneBlank,syncCompanyDetails} from './core.js';
import {prepopulateAuditorFromMasterListing} from './auditor-import.js';

const txt=v=>String(v??'').trim();
const exists=v=>txt(v)&&!/^(?:-|–|—|n\/?a|nil|none|not applicable|not provided|unknown)$/i.test(txt(v));
const template=cloneBlank().particulars;
const firstHeading=template.findIndex(x=>x.type==='heading');
const companyKeys=new Set(template.slice(0,firstHeading).filter(x=>x.type==='field').map(x=>x.en));
const MAX_PARTICULARS=1200;
function records(doc,prefix){
 const pattern=new RegExp('^'+prefix+' \\d+$');
 const groups=[];
 for(let i=0;i<doc.particulars.length;i++){
  const item=doc.particulars[i];
  if(item.type!=='heading'||!pattern.test(item.en))continue;
  const tail=doc.particulars.slice(i+1);
  const end=tail.findIndex(x=>x.type!=='field');
  groups.push({index:i,fields:end<0?tail:tail.slice(0,end)});
 }
 return groups;
}
function fillPeople(doc,kind,names){
 if(!Array.isArray(names)||!names.length)return 0;
 const map={
  directors:{label:'DIRECTOR',name:'Full Name'},
  members:{label:'MEMBER',name:'Individual Full Name'},
  bos:{label:'BENEFICIAL OWNER',name:'Full Name'}
 }[kind];
 if(!map)return 0;
 let groups=records(doc,map.label);
 if(!groups.length||groups.some(g=>g.fields.some(x=>
  x.type==='field'&&
  (kind==='members'?['Individual Full Name','Corporate Name'].includes(x.en):x.en===map.name)&&exists(x.value))))
  return 0;
 const sampleStart=template.findIndex(x=>x.type==='heading'&&x.en===map.label+' 1');
 if(sampleStart<0)return 0;
 let sampleEnd=sampleStart+1;
 while(sampleEnd<template.length&&template[sampleEnd].type==='field')sampleEnd++;
 const sample=template.slice(sampleStart,sampleEnd);
 const toAdd=Math.min(names.length,100);
 while(groups.length<toAdd&&doc.particulars.length+sample.length<=MAX_PARTICULARS){
  const next=groups.length+1,sectionIndex=doc.particulars.findIndex(x=>
   x.type==='section'&&(map.label==='BENEFICIAL OWNER'?
    /PARTICULARS OF CURRENT BENEFICIAL OWNERS/i.test(x.en):
    map.label==='DIRECTOR'?/DIRECTORS, COMPANY SECRETARY/i.test(x.en):
    /PARTICULARS OF MEMBERS/i.test(x.en)));
  if(sectionIndex<0)break;
  let insert=sectionIndex+1;
  while(insert<doc.particulars.length&&doc.particulars[insert].type!=='section')insert++;
  const copy=sample.map(x=>({...x,value:''}));
  copy[0].en=map.label+' '+next;
  copy[0].cn=txt(copy[0].cn).replace(/\d+$/,String(next));
  doc.particulars.splice(insert,0,...copy);
  groups=records(doc,map.label);
 }
 let filled=0;
 for(let i=0;i<Math.min(toAdd,groups.length);i++){
  const name=txt(names[i]);
  if(!exists(name)||name.length>180)continue;
  const corporate=kind==='members'&&/\b(?:SDN\.?\s*BHD\.?|BERHAD|BHD\.?|LIMITED|LTD\.?|LLP)\s*$/i.test(name);
  const dest=corporate?'Corporate Name':map.name;
  const field=groups[i].fields.find(x=>x.type==='field'&&x.en===dest);
  if(field&&!exists(field.value)){field.value=name;filled++;}
  if(corporate){
   const type=groups[i].fields.find(x=>x.type==='field'&&x.en==='Member Type');
   if(type&&!exists(type.value)){type.value='Body Corporate';filled++;}
  }
 }
 return filled;
}
export function prepopulateAnnualReturnFromMasterListing(document,listing,auditor){
 const input=structuredClone(document||cloneBlank());
 if(!listing||typeof listing!=='object') {
  const result=prepopulateAuditorFromMasterListing(input,auditor);
  return {document:result.document,filled:result.filled,kept:result.kept,
   listingFields:0,peopleFields:0,auditorFields:result.filled};
 }
 const fields=listing.fields&&typeof listing.fields==='object'?listing.fields:{};
 let filled=0,kept=0,listingFields=0,peopleFields=0;
 for(const [key,raw] of Object.entries(fields)){
  if(!companyKeys.has(key)||!exists(raw))continue;
  const cell=input.particulars.find(x=>x.type==='field'&&x.en===key);
  if(!cell)continue; // A user-deleted field is not recreated.
  if(exists(cell.value)){kept++;continue;}
  cell.value=txt(raw).slice(0,1400);
  filled++;listingFields++;
 }
 const people=listing.people||{};
 for(const kind of ['directors','members','bos']){
  const added=fillPeople(input,kind,people[kind]);
  filled+=added;peopleFields+=added;
 }
 syncCompanyDetails(input);
 const audited=prepopulateAuditorFromMasterListing(input,auditor);
 filled+=audited.filled;kept+=audited.kept;
 return {document:audited.document,filled,kept,listingFields,
  peopleFields,auditorFields:audited.filled};
}
