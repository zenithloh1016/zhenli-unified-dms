/**
 * Consistent presentation for numbered Malaysian member folios.
 * A folio number is an identifier, not an amount: numeric labels 1..999
 * are padded to 001..999. Existing data and nonnumeric folios are untouched.
 */
export function formatMemberFolioNumber(value){
 const original=String(value??'');
 const v=original.trim();
 if(!/^\d+$/.test(v))return original;
 const digits=v.replace(/^0+(?=\d)/,'');
 return digits.length<=3?digits.padStart(3,'0'):digits;
}
