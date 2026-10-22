import {buildCombinedRegisters} from './statutory-register-annual-layout.js';
import {ensureChargeRegister} from './statutory-register-review.js';
import {validateRegisterBook} from './statutory-register-data.js';

/** Same-origin in-memory transport for the Annual Return iframe. */
export function combinedRegisterSnapshot(book,{companyId,companyName,registrationNo}={}){
 validateRegisterBook(book);
 if(!companyId||book.companyId!==companyId)throw Error('Register belongs to another company.');
 const copy=structuredClone(book);
 ensureChargeRegister(copy);
 const sections=buildCombinedRegisters(copy).map(s=>({
  title:s.title,blocks:s.blocks.filter(b=>['field','record','group','note','metric'].includes(b.type))
   .map(b=>({
    type:b.type,title:String(b.title||'').slice(0,160),
    status:String(b.status||'').slice(0,80),label:String(b.label||'').slice(0,160),
    value:String(b.value||'').slice(0,1500)
   }))
 }));
 const total=sections.reduce((n,s)=>n+s.blocks.length,0);
 if(total>3500)throw Error('This company has more than 3,500 register fields. Reduce the import scope before continuing.');
 return {version:1,companyId,companyName:companyName||book.companyName,
  registrationNo:registrationNo||book.registrationNo,sections};
}
