import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const backend=readFileSync(
  new URL('../supabase/functions/dms-sequential-signing/index.ts',import.meta.url),'utf8');
const src=backend.match(
  /(function reorderUnsignedSigners\(r,requested\) \{[\s\S]*?\n\})\n(function resetSignerMapping\(r\) \{[\s\S]*?\n\})\nasync function handleAdmin/);
assert.ok(src,'backend order/reset helpers must be present');
let counter=0;
const context=vm.createContext({uuid:()=>String(++counter).padStart(8,'0')+'-1111-4111-8111-000000000000',
  Error,Set,Map});
const reorder=vm.runInContext('('+src[1]+')',context);
const mapping=vm.runInContext('('+src[2]+')',context);
const signers=[
  {id:'s1',name:'Signer 1',position:1,signedAt:'2026-10-20T00:00:00Z',signaturePath:'original/sign1.png'},
  {id:'s2',name:'Signer 2',position:2,signedAt:null,signaturePath:null},
  {id:'s3',name:'Signer 3',position:3,signedAt:null,signaturePath:null}
];
test('pending request reorders unsigned signers while locking signed signatures and IDs',()=>{
  const original={status:'pending',signers};
  const reordered=reorder(original,['s1','s3','s2']);
  assert.deepEqual(Array.from(reordered.map(x=>x.id)),['s1','s3','s2']);
  assert.deepEqual(Array.from(reordered.map(x=>x.position)),[1,2,3]);
  assert.equal(reordered[0].signaturePath,'original/sign1.png');
  assert.equal(original.signers[1].position,2,'input is not mutated');
  assert.throws(()=>reorder(original,['s2','s1','s3']),/Signed signers/);
  assert.throws(()=>reorder(original,['s1','s2','s2']),/unknown or duplicate/);
  assert.throws(()=>reorder({...original,status:'completed'},['s1','s3','s2']),/Only draft or pending/);
});
test('reset issues entirely new signer identifiers without modifying old signed state',()=>{
  const {signers:fresh,map}=mapping({signers});
  assert.equal(fresh.length,3);
  assert.equal(fresh[0].signedAt,null);
  assert.equal(fresh[0].signaturePath,null);
  assert.notEqual(fresh[0].id,'s1');
  assert.equal(map.get('s1'),fresh[0].id);
  assert.equal(signers[0].signaturePath,'original/sign1.png');
});
test('reset clones private PDFs, preserves old signed record and revokes old pending links',async()=>{
  const original={id:'old-id',owner_id:'owner-id',status:'pending',
    updated_at:'2026-10-23T00:00:00Z',company:'TEST SDN BHD',
    subject:'Board Resolution',sender_email:'zhenlisecretary@gmail.com',
    note:'',expires_at:'2026-11-06T00:00:00Z',
    signers,documents:[{id:'doc-1',name:'test.pdf',pages:1,path:'old/path.pdf',sha256:'oldhash'}],
    boxes:[{documentId:'doc-1',signerId:'s1',page:1,x:20,y:30,width:35,height:10}],
    audit:[{event:'signed'}]
  };
  const copied=[],removed=[],inserts=[],edits=[],deleted=[];
  const b=Buffer.from('%PDF-1.7\n0123456789abcdefghij');
  const rowError=x=>{if(x.error)throw Error(x.error.message);return x.data;};
  const bucket=()=>({
    download:async path=>{assert.equal(path,'old/path.pdf');return {data:new Blob([b])};},
    upload:async(path,buf)=>{copied.push({path,bytes:Buffer.from(buf)});return {data:{}};},
    remove:async(paths)=>{removed.push(...paths);return {data:[]};}
  });
  const table=()=>({
    insert:record=>({select:()=>({single:async()=>{
      inserts.push(record);return {data:record};
    }})}),
    update:changes=>({
      eq(){return this;},
      select(){return this;},
      maybeSingle:async()=>{edits.push(changes);return {data:{id:original.id}};}
    }),
    delete:()=>({eq(){return this;},then(resolve){deleted.push(true);resolve({data:null});}})
  });
  let count=10;
  const uuid=()=>String(++count).padStart(8,'0')+'-1111-4111-8111-000000000000';
  const resetSnippet=backend.match(/(  if\(action==="reset"\)\{[\s\S]*?\n  \})\n  if\(action==="edit"\)/);
  assert.ok(resetSnippet,'reset handler must exist');
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const handler=new AsyncFunction('action','r','user','table','bucket','rowError','uuid',
    'resetSignerMapping','presentation','now','maxPdf','defaultSenderEmail','hash','TextDecoder',
    resetSnippet[1]+'\n return {unexpected:true};');
  const response=await handler('reset',original,original.owner_id,table,bucket,rowError,uuid,
    r=>{const map=new Map();const fresh=r.signers.map((s,i)=>{
      const id=uuid();map.set(s.id,id);return {...s,id,position:i+1,signedAt:null,signaturePath:null};
    });return {signers:fresh,map};},
    async r=>({id:r.id,signers:r.signers,documents:r.documents,boxes:r.boxes,status:r.status}),
    ()=>new Date().toISOString(),3*1024*1024,'zhenlisecretary@gmail.com',
    async bytes=>'test_sha',TextDecoder);
  assert.equal(response.sourceStatus,'revoked');
  assert.equal(response.request.status,'draft');
  assert.equal(inserts.length,1);
  assert.notEqual(inserts[0].id,original.id);
  assert.ok(copied[0].path.includes('/original/'));
  assert.ok(copied[0].path.startsWith('owner-id/'));
  assert.ok(inserts[0].documents[0].path!==original.documents[0].path);
  assert.equal(inserts[0].documents[0].name,'test.pdf');
  assert.equal(inserts[0].boxes[0].signerId,inserts[0].signers[0].id);
  assert.equal(edits[0].status,'revoked');
  assert.deepEqual(original.audit,[{event:'signed'}]);
  assert.equal(original.signers[0].signedAt,'2026-10-20T00:00:00Z');
  assert.equal(removed.length,0);
  assert.equal(deleted.length,0);
});
