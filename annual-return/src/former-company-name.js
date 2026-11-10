/**
 * Keep the Annual Return's existing Former Name field aligned with the
 * current Documents company's verified name history. This must run again
 * after a cloud or device draft is loaded, not just when selecting a company.
 * Other return particulars and record/field sequencing are never modified.
 */
export function syncFormerNameField(document,formerName){
 const value=String(formerName||'').trim();
 if(!value||!document||!Array.isArray(document.particulars))return false;
 const raw=value.normalize('NFKC').replace(/^F\s*\.?\s*K\s*\.?\s*A\s*\.?\s*[:=–—-]?\s*/i,'').trim();
 if(!raw)return false;
 const official=raw;
 const field=document.particulars.find(x=>x.type==='field'&&x.en==='Former Name');
 if(!field||field.value===official)return false;
 field.value=official;
 return true;
}
