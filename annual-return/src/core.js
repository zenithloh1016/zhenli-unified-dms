import template from './template.json' with {type:'json'};
export const SCHEMA_VERSION=2;
export const cloneBlank=()=>structuredClone(template);
const safe=(s,n=20000)=>String(s??'').slice(0,n);
function readJsonObjectAfter(script,marker){
  const start=script.indexOf(marker);
  if(start<0) return null;
  const assign=script.indexOf('=',start+marker.length);
  if(assign<0)throw Error('Invalid Apps Script assignment: '+marker);
  const begin=script.indexOf('{',assign);
  if(begin<0)throw Error('Missing JSON data after '+marker);
  let depth=0,quoted=false,escaped=false;
  for(let i=begin;i<script.length;i++){
    const ch=script[i];
    if(quoted){
      if(escaped)escaped=false;
      else if(ch==='\\')escaped=true;
      else if(ch==='"')quoted=false;
    }else if(ch==='"')quoted=true;
    else if(ch==='{')depth++;
    else if(ch==='}'&&!--depth){
      try{return JSON.parse(script.slice(begin,i+1));}
      catch{throw Error(marker+' is not a JSON-compatible Apps Script object. Use a previously generated .gs or JSON file.');}
    }
  }
  throw Error('Unfinished Apps Script data object: '+marker);
}
export function normalizeDocument(raw){
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.particulars))throw Error('Expected an Annual Return object with a particulars array.');
  if(raw.particulars.length>1200)throw Error('The imported script has too many fields.');
  const company=raw.company||{};
  const director=raw.signatureDirector||raw.signatory||{};
  const doc={
    schemaVersion:SCHEMA_VERSION,
    company:{name:safe(company.name,300),no:safe(company.no,120),
      arYear:safe(company.arYear,12),arDate:safe(company.arDate,40),
      lodgementDueDate:safe(company.lodgementDueDate,40),
      masterListingDueDate:safe(company.masterListingDueDate||'',40)},
    signatureDirector:{name:safe(director.name,200),nric:safe(director.nric||director.id||'',100),date:safe(director.date||'',40),acknowledged:director.acknowledged===true},
    particulars:raw.particulars.filter(x=>x&&['field','section','heading'].includes(x.type)).map(x=>({
      type:x.type,en:safe(x.en,350),cn:safe(x.cn,350),value:x.type==='field'?safe(x.value,15000):'',generated:x.generated===true
    }))
  };
  if(!doc.particulars.length)throw Error('No valid Annual Return particulars found.');
  // Earlier Google Apps Script templates lacked the editable consideration type.
  // Insert it beside the share-class field without disturbing imported company details.
  if(!doc.particulars.some(x=>x.type==='field'&&x.en==='Type of Shares (Consideration)')){
    const share=doc.particulars.findIndex(x=>x.type==='field'&&/Classes of Shares Issued|Type of Shares/i.test(x.en));
    if(share>=0)doc.particulars.splice(share+1,0,{type:'field',en:'Type of Shares (Consideration)',
      cn:'股份发行对价类型（现金或非现金）',value:'',generated:false});
  }
  return doc;
}
export function importAnnualReturnText(content,filename=''){
  if(typeof content!=='string'||content.length>3_000_000)throw Error('Select a .gs/.json file smaller than 3 MB.');
  const name=filename.toLowerCase();
  if(name.endsWith('.gs')||/const\s+AR_SINGLE_COMPANY\s*=/.test(content)){
    const raw=readJsonObjectAfter(content,'AR_SINGLE_COMPANY');
    if(!raw)throw Error('Apps Script does not contain AR_SINGLE_COMPANY.');
    const sig=readJsonObjectAfter(content,'AR_SIGNATURE_DIRECTOR');
    if(sig)raw.signatureDirector=sig;
    return normalizeDocument(raw);
  }
  try{
    const raw=JSON.parse(content);
    return normalizeDocument(raw.AR_SINGLE_COMPANY||raw);
  }catch(error){
    if(error.message?.startsWith('Expected'))throw error;
    throw Error('Invalid JSON backup or Annual Return script. '+error.message);
  }
}
export const outputFilename=doc=>{
  const name=safe(doc.company.name||'COMPANY',75).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/\s+/g,' ').trim();
  const year=safe(doc.company.arYear||new Date().getFullYear(),8).replace(/[^0-9]/g,'')||'YEAR';
  return name+' - Annual Return '+year+' Review.pdf';
};
export const populatedCount=doc=>doc.particulars.filter(x=>x.type==='field'&&String(x.value||'').trim()).length;
export const emptyCount=doc=>doc.particulars.filter(x=>x.type==='field'&&!String(x.value||'').trim()).length;


// These are review-entry choices, not an assertion of SSM lodgement.
export const SELECT_OPTIONS={
  shareConsideration:['Cash','Otherwise than cash','Cash & otherwise than cash'],
  shareClass:['Ordinary','Preference','Ordinary & Preference'],
  ownershipType:['Direct','Indirect','Direct & Indirect']
};
export const BENEFICIAL_OWNER_CRITERIA=[
  {code:'A',description:'Directly or indirectly holds not less than 20% of the shares'},
  {code:'B',description:'Directly or indirectly holds not less than 20% of voting shares'},
  {code:'C',description:'Has the right to exercise ultimate effective control (formal or informal) over the company, directors or management'},
  {code:'D',description:'Has the right or power to directly or indirectly appoint or remove directors holding the majority of board voting rights'}
];
export function selectKind(label){
  const s=String(label||'').toLowerCase().trim();
  if(s==='type of shares (consideration)'||s==='type of shares')return 'shareConsideration';
  if(s==='classes of shares issued'||s==='class of shares')return 'shareClass';
  if(s==='type of beneficial ownership')return 'ownershipType';
  if(s==='criteria of beneficial ownership')return 'criteria';
  return '';
}
export const criteriaString=codes=>BENEFICIAL_OWNER_CRITERIA
  .filter(x=>codes.includes(x.code)).map(x=>'Criteria '+x.code+' – '+x.description).join('\n');
export function selectedCriteria(value){
  const result=[];
  const s=String(value||'');
  for(const item of BENEFICIAL_OWNER_CRITERIA){
    if(new RegExp('(?:criteria\\s*|^|[,;/\\s])'+item.code+'(?=\\b|[^a-z])','i').test(s))result.push(item.code);
  }
  return result;
}
export const REPEAT_CONFIG={
  charge:{label:'REGISTERED CHARGE',summary:'Number of Registered Charges'},
  director:{label:'DIRECTOR'},
  member:{label:'MEMBER'},
  beneficialOwner:{label:'BENEFICIAL OWNER'}
};
function groupSpan(parts,start,kind){
  const name=REPEAT_CONFIG[kind]?.label;
  if(!name||!new RegExp('^'+name+'\\s+\\d+$','i').test(parts[start]?.en||''))throw Error('Cannot find requested '+kind+' entry.');
  let end=start+1;
  while(end<parts.length){
    const x=parts[end];
    if(x.type==='heading'||x.type==='section'||(kind==='charge'&&x.en===REPEAT_CONFIG.charge.summary))break;
    end++;
  }
  return [start,end];
}
export function addRepeatGroup(doc,kind){
  const conf=REPEAT_CONFIG[kind];if(!conf)throw Error('Unknown add-on group.');
  const p=doc.particulars;
  const matches=p.map((x,i)=>({x,i})).filter(({x})=>x.type==='heading'&&new RegExp('^'+conf.label+'\\s+\\d+$','i').test(x.en));
  if(!matches.length)throw Error('The '+kind+' template group is missing.');
  if(p.length>1100||matches.length>=70)throw Error('This review has reached the repeat-entry limit.');
  const [first,endFirst]=groupSpan(p,matches[0].i,kind);
  const [last,endLast]=groupSpan(p,matches[matches.length-1].i,kind);
  const nextNumber=Math.max(...matches.map(({x})=>Number(x.en.match(/\d+$/)?.[0])||0))+1;
  const cloned=p.slice(first,endFirst).map((x,j)=>({...x,
    en:j===0?conf.label+' '+nextNumber:x.en,
    cn:j===0?({charge:'已登记押记',director:'董事',member:'股东',beneficialOwner:'实益拥有人'}[kind])+' '+nextNumber:x.cn,
    value:'',generated:true}));
  p.splice(endLast,0,...cloned);
  return {number:nextNumber,count:cloned.length};
}
export function removeRepeatGroup(doc,index){
  const item=doc.particulars[index];
  if(!item||item.type!=='heading'||item.generated!==true)throw Error('Only added entries may be removed.');
  const kind=Object.keys(REPEAT_CONFIG).find(k=>new RegExp('^'+REPEAT_CONFIG[k].label+'\\s+\\d+$','i').test(item.en));
  if(!kind)throw Error('This is not a repeatable entry.');
  const [start,end]=groupSpan(doc.particulars,index,kind);
  if(!doc.particulars.slice(start,end).every(x=>x.generated===true))throw Error('Original entry cannot be removed.');
  doc.particulars.splice(start,end-start);
}
