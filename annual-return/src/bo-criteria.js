/** Shared BO criterion descriptions for the editor and exported Annual Return.
 * Keep the PDF descriptions identical to the options selected on screen.
 */
export const BO_CRITERIA_DESCRIPTIONS=Object.freeze({
 A:'Holds directly or indirectly not less than 20% of the company shares',
 B:'Holds directly or indirectly not less than 20% of the voting shares',
 C:'Has ultimate effective control (formal or informal) over the company, directors or management',
 D:'Can directly or indirectly appoint or remove directors who hold a majority of directors’ meeting voting rights',
 E:'Is a member of the company and, under an agreement with another member, controls alone a majority of the voting rights in the company',
 F:'Has less than 20% of shares or voting shares but exercises significant control or influence over the company'
});

/** Accept saved "Criteria A, Criteria C" and imported "A, C" lists.
 * Returns only selected criteria, in their original A–F display order.
 * Unrecognised free text is not interpreted as a criterion.
 */
export function selectedBoCriteria(value){
 const text=String(value??'').trim();
 if(!text)return [];
 const normalised=text.replace(/\bcriteria\s*[-:]?\s*([A-F])\b/gi,'$1')
  .replace(/\band\b/gi,',').trim();
 let letters;
 if(/^[A-F](?:\s*[,;\/&+|]\s*[A-F])*$/i.test(normalised)){
  letters=normalised.match(/[A-F]/gi)||[];
 }else{
  // Recover explicitly labelled criteria from richer imported values.
  letters=[...text.matchAll(/\bcriteria\s*[-:]?\s*([A-F])\b/gi)].map(m=>m[1]);
 }
 const selected=new Set(letters.map(v=>v.toUpperCase()));
 return Object.entries(BO_CRITERIA_DESCRIPTIONS)
  .filter(([code])=>selected.has(code))
  .map(([code,description])=>({code,label:'Criteria '+code,description}));
}
