/** In-memory undo/redo for one Annual Return form.
 * Snapshots include all field values and structure, and never cross companies.
 * Undo history is not uploaded to Supabase and is discarded when the tab closes.
 */
export function createAnnualReturnHistory(initial,{limit=100}={}){
 const max=Math.max(2,Math.min(Number(limit)||100,200));
 let records=[JSON.stringify(initial)],position=0;
 const controls=()=>({canUndo:position>0,canRedo:position<records.length-1,length:records.length});
 return {
  get state(){return controls();},
  reset(value){records=[JSON.stringify(value)];position=0;return controls();},
  capture(value){
   const snapshot=JSON.stringify(value);
   if(snapshot===records[position])return false;
   records=records.slice(0,position+1);
   records.push(snapshot);
   if(records.length>max)records.shift();
   position=records.length-1;
   return true;
  },
  undo(){
   if(position<1)return null;
   position--;
   return JSON.parse(records[position]);
  },
  redo(){
   if(position>=records.length-1)return null;
   position++;
   return JSON.parse(records[position]);
  }
 };
}
