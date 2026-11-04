/**
 * Populate only empty auditor particulars in a same-company Annual Return draft.
 * The caller validates company ownership and retrieves the Master Listing.
 */
import {cloneBlank} from './core.js';
const blank=v=>!String(v??'').trim()||/^(?:-|–|—|n\/a|na|nil|none)$/i.test(String(v).trim());
const labels={
 name:'Audit Firm Name',
 registrationNo:'Audit Firm Registration No.',
 address:'Audit Firm Address'
};
export function prepopulateAuditorFromMasterListing(document,auditor){
 const original=structuredClone(document);
 if(!auditor||typeof auditor!=='object'||!original?.particulars)
  return {document:original,filled:0,kept:0,restored:false};
 const incoming=Object.entries(labels).filter(([key])=>!blank(auditor[key]))
  .map(([key,label])=>({label,value:String(auditor[key]).trim()}));
 if(!incoming.length)return {document:original,filled:0,kept:0,restored:false};
 const items=original.particulars;
 let heading=items.findIndex(item=>item.type==='heading'&&/^AUDITOR$/i.test(String(item.en||'').trim()));
 let restored=false;
 if(heading<0){
  const section=items.findIndex(item=>item.type==='section'&&/DIRECTORS, COMPANY SECRETARY/i.test(item.en||''));
  if(section<0)return {document:original,filled:0,kept:0,restored:false};
  const next=items.findIndex((item,i)=>i>section&&item.type==='section');
  const source=cloneBlank().particulars;
  const begin=source.findIndex(item=>item.type==='heading'&&item.en==='AUDITOR');
  const end=source.findIndex((item,i)=>i>begin&&item.type==='section');
  if(begin<0||end<0)return {document:original,filled:0,kept:0,restored:false};
  heading=next<0?items.length:next;
  items.splice(heading,0,...source.slice(begin,end).map(item=>({...item,value:''})));
  restored=true;
 }
 let filled=0,kept=0;
 for(const {label,value} of incoming){
  const end=items.findIndex((item,i)=>i>heading&&(item.type==='section'||item.type==='heading'));
  const last=end<0?items.length:end;
  const field=items.slice(heading+1,last).find(item=>item.type==='field'&&item.en===label);
  if(!field)continue;
  if(!blank(field.value)){kept++;continue;}
  field.value=value;filled++;
 }
 return {document:original,filled,kept,restored};
}
