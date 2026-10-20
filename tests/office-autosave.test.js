import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfficeAutoSaver} from '../src/office-autosave.js';

const START='user-1/company-1/original-document';
function memoryDb(){
 const records=new Map([['document-1',{
  id:'document-1',user_id:'user-1',company_id:'company-1',folder_id:'folder-1',
  name:'Register Book.xlsx',storage_path:START,size_bytes:12,mime_type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 }]]);
 const objects=new Map([[START,new Blob(['original file'])]]);
 const storage={
  async upload(path,blob){if(objects.has(path))return {error:{message:'Duplicate object'}};objects.set(path,blob);return{error:null};},
  async remove(paths){for(const x of paths)objects.delete(x);return{error:null};}
 };
 const db={
  storage:{from:()=>storage},
  from(table){
   if(table!=='documents')throw Error('Unexpected table '+table);
   return {
    update(values){
     const conditions={};
     return {
      eq(field,value){conditions[field]=value;return this;},
      async select(){
       const r=records.get(conditions.id);
       if(!r||Object.entries(conditions).some(([key,value])=>r[key]!==value))return{data:[],error:null};
       if([...records.values()].some(x=>x.id!==r.id&&x.storage_path===values.storage_path))return{error:{message:'Duplicate storage path'},data:null};
       Object.assign(r,values);return{data:[{id:r.id}],error:null};
      }
     };
    },
    async insert(value){
     if([...records.values()].some(x=>x.storage_path===value.storage_path))return{error:{message:'Duplicate storage path'}};
     records.set('backup-'+records.size,{...value});return{error:null};
    }
   };
  }
 };
 return {db,records,objects};
}
const original={id:'document-1',name:'Register Book.xlsx',user_id:'user-1',company_id:'company-1',
 folder_id:'folder-1',storage_path:START,size_bytes:12,mime_type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
test('autosave updates existing DMS document, keeping first uploaded file as previous version',async()=>{
 const m=memoryDb(),messages=[],events=[];let text='Updated file';
 const saver=createOfficeAutoSaver({
  db:m.db,bucket:'dms-private',userId:'user-1',document:original,
  makeBlob:()=>new Blob([text],{type:original.mime_type}),
  onSaved:info=>events.push(info),onStatus:status=>messages.push(status),delay:60000
 });
 saver.schedule();assert.equal(saver.pending,true);await saver.flush();
 assert.equal(saver.pending,false);
 assert.equal(m.records.size,2);
 const current=m.records.get('document-1'),previous=m.records.get('backup-1');
 assert.notEqual(current.storage_path,START);
 assert.equal(previous.storage_path,START);
 assert.match(previous.name,/previous/);
 assert.equal(m.objects.has(START),true);
 assert.equal(await m.objects.get(current.storage_path).text(),'Updated file');
 assert.equal(events.length,1);
 text='Third iteration';saver.schedule();await saver.flush();
 assert.equal(m.records.size,2);
 assert.equal(await m.objects.get(m.records.get('document-1').storage_path).text(),'Third iteration');
 assert.equal(m.objects.has(START),true);
 assert.equal(events.length,2);
 assert.ok(messages.some(x=>x.includes('All changes saved')));
 saver.close();
});
test('remote modification conflict does not overwrite a newer document or create backup',async()=>{
 const m=memoryDb();let count=0;
 const saver=createOfficeAutoSaver({db:m.db,bucket:'dms-private',userId:'user-1',document:original,
  makeBlob:()=>new Blob(['changed']),onStatus:()=>{},onSaved:()=>{count++;},delay:60000});
 m.records.get('document-1').storage_path='user-1/company-1/new-version-from-other-session';
 saver.schedule();
 await assert.rejects(saver.flush(),/changed in another session/);
 assert.equal(count,0);
 assert.equal(m.records.size,1);
 assert.equal(m.records.get('document-1').storage_path,'user-1/company-1/new-version-from-other-session');
 assert.equal(saver.pending,true);saver.close();
});
