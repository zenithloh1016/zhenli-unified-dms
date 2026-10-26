// ZHENLI DMS - Supabase-native sequential signing; NO Tencent EdgeOne dependency.
// Deploy this function with verify_jwt=false: public bearer links are validated
// cryptographically; EVERY administrative action manually validates user JWT.
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const enc = new TextEncoder();
const env = (key) => Deno.env.get(key) || "";
const supaUrl = env("SUPABASE_URL");
function serviceKey() {
  if (env("SUPABASE_SERVICE_ROLE_KEY")) return env("SUPABASE_SERVICE_ROLE_KEY");
  try {
    const keys = JSON.parse(env("SUPABASE_SECRET_KEYS"));
    return typeof keys.default === "string" ? keys.default : Object.values(keys)[0];
  } catch { return ""; }
}
const admin = createClient(supaUrl, serviceKey(), { auth: { persistSession:false,autoRefreshToken:false } });
const table = () => admin.from("dms_native_sign_requests");
const relayTable = () => admin.from("dms_native_mail_relays");
const bucket = () => admin.storage.from("dms-native-signing");
const secret = env("NATIVE_SIGNING_SECRET");
// If no Edge Function secret has been configured, use the randomly generated,
// service-role-only signing key from the same project database.
async function signingSecret() {
  if (secret.length >= 32) return secret;
  const {data,error} = await admin.from("dms_native_signing_config")
    .select("secret").eq("id",true).single();
  if (error || !data?.secret || data.secret.length<64)
    throw Error("Private signing key is unavailable; check native signing database setup");
  return data.secret;
}
const defaultSenderEmail = "zhenlisecretary@gmail.com";
const maxPdf = 3 * 1024 * 1024;
const maxSign = 300 * 1024;
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const safe = (s,n=250) => String(s ?? "").trim().slice(0,n);
const validEmail = (s) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);
const secureHex = (b) => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function hash(b) { return secureHex(await crypto.subtle.digest("SHA-256", b)); }
function decode64(s) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)||s.length>maxPdf*2) throw Error("Invalid file encoding");
  return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
}
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v));
const fail = (message, status=400) => ({error:String(message), status});
const rowError = (r) => { if (r.error) throw Error(r.error.message); return r.data; };
function publicLinkBase() {
  const val = env("PUBLIC_SIGNING_URL") || "https://zenithloh1016.github.io/zhenli-unified-dms/sign/";
  const u = new URL(val);
  if (u.protocol !== "https:" || u.username || u.password || u.hash || u.search ||
      !(/\/sign\/?$/.test(u.pathname) || /\/sign\/index\.html$/.test(u.pathname))) {
    throw Error("PUBLIC_SIGNING_URL must be the HTTPS public DMS /sign/ page");
  }
  return u;
}
const allowedOrigins = () => {
  const list = env("DMS_ALLOWED_ORIGINS").split(",").map(x=>x.trim()).filter(Boolean);
  try { list.push(publicLinkBase().origin); } catch { /* configuration error surfaced on link creation */ }
  return list;
};
function cors(origin) {
  const allowed = origin && allowedOrigins().includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary":"Origin"
  };
}
function json(data,status=200,origin="") {
  return new Response(JSON.stringify(data),{status,headers:{
    ...cors(origin),"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store", "Referrer-Policy":"no-referrer",
    "X-Content-Type-Options":"nosniff"
  }});
}
function bytesResponse(bytes, origin) {
  return new Response(bytes,{headers:{
    ...cors(origin),"Content-Type":"application/octet-stream","Cache-Control":"no-store, private",
    "Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff",
    "Content-Disposition":"inline; filename=\"signing-document.pdf\""
  }});
}
async function signerMac(id,sid) {
  const key = await crypto.subtle.importKey("raw",enc.encode(await signingSecret()),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return secureHex(await crypto.subtle.sign("HMAC",key,enc.encode("ZHENLI_NATIVE_V1:"+id+":"+sid)));
}
async function createToken(r,s) {return r.id+"."+s.id+"."+await signerMac(r.id,s.id);}
async function signerLink(r,s) {
  const u=publicLinkBase(); u.searchParams.set("token",await createToken(r,s)); return u.toString();
}
function constantEqual(a,b) {
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
async function signerAccess(token) {
  const p=String(token||"").split(".");
  if(p.length!==3 || !isUuid(p[0]) || !isUuid(p[1]) || !/^[0-9a-f]{64}$/.test(p[2]) ||
     !constantEqual(p[2],await signerMac(p[0],p[1])))throw Error("Invalid signing link");
  const r=rowError(await table().select("*").eq("id",p[0]).maybeSingle());
  if(!r || r.deleted_at)throw Error("Signing request is unavailable");
  const s=r.signers.find(x=>x.id===p[1]);if(!s)throw Error("Invalid signer");
  return {r,s};
}
function canAct(r,s) {
  return r.status==="pending"&&new Date(r.expires_at).getTime()>Date.now() &&
    r.signers.find(x=>!x.signedAt)?.id===s.id;
}
async function who(req) {
  const bearer=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i);
  if(!bearer)throw Error("Sign in to DMS first");
  const result=await admin.auth.getUser(bearer[1]);
  if(result.error||!result.data?.user)throw Error("Your DMS login has expired");
  return result.data.user.id;
}
async function owned(id,user) {
  if(!isUuid(id))throw Error("Invalid request identifier");
  const r=rowError(await table().select("*").eq("id",id).eq("owner_id",user).maybeSingle());
  if(!r || r.deleted_at)throw Error("Request not found in your active DMS signing list");
  return r;
}
async function write(r,changes) {
  return rowError(await table().update({...changes,updated_at:now()}).eq("id",r.id).select("*").single());
}
async function log(r,name,extra={}) {
  return write(r,{audit:[...(r.audit||[]),{event:name,at:now(),...extra}]});
}
async function presentation(r,includeLinks=false) {
  const signers=await Promise.all(r.signers.map(async s=>({
    id:s.id,name:s.name,email:s.email,position:s.position,
    signedAt:s.signedAt||null,link:includeLinks?await signerLink(r,s):undefined
  })));
  return {id:r.id,company:r.company,subject:r.subject,note:r.note,status:r.status,
    senderEmail:r.sender_email||defaultSenderEmail,
    expiresAt:r.expires_at,createdAt:r.created_at,signers,documents:r.documents.map(d=>({
      id:d.id,name:d.name,pages:d.pages,ready:!!d.finalPath
    })),boxes:r.boxes,audit:r.audit};
}
// Only trust Google Apps Script's production /exec deployments; the
// deployment must execute as the verified zhenlisecretary@gmail.com owner.
function relayUrl(value) {
  const url=new URL(safe(value,900));
  if(url.protocol!=="https:"||url.origin!=="https://script.google.com"||
     !/^\/macros\/s\/[A-Za-z0-9_-]{15,}\/exec$/.test(url.pathname)||
     url.search||url.hash||url.username||url.password||url.port)
    throw Error("Use a Google Apps Script production Web app /exec URL");
  return url.toString();
}
async function sendRelayRequest(relay,payload) {
  const timestamp=Date.now(),nonce=uuid().replace(/-/g,"");
  const message=timestamp+"."+nonce+"."+JSON.stringify(payload);
  const key=await crypto.subtle.importKey("raw",enc.encode(relay.relay_hmac_secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=secureHex(await crypto.subtle.sign("HMAC",key,enc.encode(message)));
  const response=await fetch(relayUrl(relay.script_url),{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({timestamp,nonce,payload,signature}),
    redirect:"follow",signal:AbortSignal.timeout(17000)
  });
  if(!response.ok)throw Error("Google Apps Script returned HTTP "+response.status);
  const result=await response.json();
  if(!result?.ok)throw Error("Gmail relay: "+safe(result?.error||"request refused",160));
  if(result.sender!=="zhenlisecretary@gmail.com")
    throw Error("Gmail sender identity does not match zhenlisecretary@gmail.com");
  return result;
}
// Use the uploaded PDF's filename as the invitation email title rather than
// the generic company name. Only the first title is shown when multiple PDFs
// are attached, with a count for the other documents. Never derive subjects
// from a signer-supplied value or an HTML file.
function invitationDocumentTitle(r) {
  const documents=Array.isArray(r.documents)?r.documents:[];
  const title=documents.length?String(documents[0]?.name||""):"";
  const cleaned=title.replace(/\.pdf$/i,"")
    .replace(/[\x00-\x1f\x7f]+/g," ").replace(/\s+/g," ").trim();
  const fallback=String(r.subject||"Document for signing")
    .replace(/[\x00-\x1f\x7f]+/g," ").replace(/\s+/g," ").trim();
  const more=documents.length>1?" (+"+(documents.length-1)+" more document"+(documents.length>2?"s":"")+")":"";
  return (cleaned||fallback).slice(0,Math.max(1,160-more.length))+more;
}
async function sendInvite(r,s) {
  if(!s)return "no pending signer";
  const documentTitle=invitationDocumentTitle(r);
  // Owner-authenticated connection to Gmail's send-only MailApp service.
  // An invalid/not-yet-installed relay must never prevent manual link sharing.
  const {data:relay,error:relayError}=await relayTable().select("*").eq("owner_id",r.owner_id)
    .eq("enabled",true).maybeSingle();
  if(relayError)return "manual — Gmail relay configuration unavailable";
  if(relay){
    try{
      const result=await sendRelayRequest(relay,{
        kind:"send",to:s.email,name:s.name,company:r.company,subject:r.subject,
        documentTitle,note:safe(r.note,1000),link:await signerLink(r,s)
      });
      return result.accepted
        ? "accepted by Gmail ("+result.sender+"); inbox delivery is not guaranteed"
        : "manual — Gmail relay did not confirm acceptance";
    }catch(ex){
      return "manual — "+safe(ex instanceof Error?ex.message:"Gmail relay unavailable",170);
    }
  }
  const key=env("RESEND_API_KEY"),from=env("SIGNING_FROM_EMAIL");
  if(!key||!from)return "manual — "+defaultSenderEmail+" is not connected to an email delivery service";
  // Never label a message as sent by an unverified Gmail address.
  if(from.trim().toLowerCase()!==(r.sender_email||defaultSenderEmail).toLowerCase())
    return "manual — requested sender "+defaultSenderEmail+" is not an authenticated sending identity";
  const link=await signerLink(r,s);
  const subject="ZHENLI | Signature required: "+documentTitle;
  const text="Dear "+s.name+",\n\nYou have a document requiring your electronic signature.\nCompany: "+
    r.company+"\nDocument: "+documentTitle+"\nSubject: "+r.subject+"\n\nSecure signing link:\n"+link+
    "\n\nThis link is individual and expires "+r.expires_at+". Do not forward it.\n\n"+
    safe(r.note,1000)+"\n\nZHENLI CONSULTANCY SERVICES SDN BHD";
  try {
    const res=await fetch("https://api.resend.com/emails",{
      method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
      body:JSON.stringify({from,to:[s.email],subject,text})
    });
    if(!res.ok)return "email rejected ("+res.status+"); copy link manually";
    return "accepted by email provider (delivery not guaranteed)";
  } catch {return "email service unavailable; copy link manually";}
}
async function finalize(r) {
  if(r.status!=="finalizing")throw Error("Request is not ready to finalize");
  const updated: any[]=[];
  for(const d of r.documents){
    if(d.finalPath){updated.push(d);continue;}
    const original=rowError(await bucket().download(d.path));
    const pdf=await PDFDocument.load(await original.arrayBuffer(),{ignoreEncryption:false});
    for(const box of r.boxes.filter(x=>x.documentId===d.id)){
      const signer=r.signers.find(x=>x.id===box.signerId);
      if(!signer?.signaturePath)throw Error("Missing recorded signer image");
      const p=pdf.getPage(box.page-1);
      if(!p || p.getRotation().angle%360!==0)throw Error("Rotated PDF pages are not supported; contact administrator");
      const png=rowError(await bucket().download(signer.signaturePath));
      const image=await pdf.embedPng(await png.arrayBuffer());
      const {width,height}=p.getSize();
      p.drawImage(image,{x:width*box.x/100,y:height*(1-(box.y+box.height)/100),
        width:width*box.width/100,height:height*box.height/100});
    }
    const output=await pdf.save();
    const finalPath=r.owner_id+"/"+r.id+"/final/"+d.id+".pdf";
    rowError(await bucket().upload(finalPath,output,{contentType:"application/pdf",upsert:true}));
    updated.push({...d,finalPath,finalSha256:await hash(output)});
  }
  const current=rowError(await table().select("status").eq("id",r.id).single());
  if(current.status!=="finalizing")throw Error("Request status changed; refresh");
  const result=await write(r,{status:"completed",documents:updated,
    audit:[...(r.audit||[]),{event:"finalized",at:now()}]});
  return result;
}
// Never reorder a person who has signed: signed signers must remain a locked
// prefix. Existing signer IDs, signature storage paths and PDF boxes are stable.
function reorderUnsignedSigners(r,requested) {
  if(!["draft","pending"].includes(r.status))throw Error("Only draft or pending requests can change signing order");
  if(!Array.isArray(requested)||requested.length!==r.signers.length)
    throw Error("Signing order must include every signer exactly once");
  const ids=r.signers.map(x=>x.id);
  if(requested.some(x=>typeof x!=="string")||
    new Set(requested).size!==ids.length || requested.some(x=>!ids.includes(x)))
    throw Error("Signing order contains an unknown or duplicate signer");
  const fixed=r.signers.filter(s=>s.signedAt).map(s=>s.id);
  if(fixed.some((id,i)=>requested[i]!==id))
    throw Error("Signed signers cannot be moved or placed after unsigned signers");
  return requested.map((id,i)=>({...r.signers.find(x=>x.id===id),position:i+1}));
}
function resetSignerMapping(r) {
  const map=new Map();
  const signers=r.signers.map((s,i)=>{
    const id=uuid();map.set(s.id,id);
    return {id,position:i+1,name:s.name,email:s.email,
      signedAt:null,signaturePath:null};
  });
  return {signers,map};
}
async function handleAdmin(action,req,body) {
  const user=await who(req);
  if(action==="list"){
    // JSONB signer/document arrays are selected ONLY inside the trusted
    // Edge Function. Expose aggregate progress, not emails, signature paths,
    // private storage paths or signer tokens in the listing response.
    const rows=rowError(await table().select(
      "id,company,subject,status,created_at,expires_at,signers,documents")
      .eq("owner_id",user).is("deleted_at",null)
      .order("created_at",{ascending:false}).limit(100));
    const {count,error}=await table().select("id",{count:"exact",head:true})
      .eq("owner_id",user).is("deleted_at",null);
    if(error)throw Error(error.message);
    const requests=rows.map(r=>{
      const signers=Array.isArray(r.signers)?r.signers:[];
      const docs=Array.isArray(r.documents)?r.documents:[];
      return {
        id:r.id,company:r.company,subject:r.subject,status:r.status,
        created_at:r.created_at,expires_at:r.expires_at,
        signedCount:signers.filter(s=>!!s.signedAt).length,
        signerCount:signers.length,
        docCount:docs.length,
        signedPdfCount:docs.filter(d=>!!d.finalPath).length
      };
    });
    return {requests,total:count||0};
  }
  if(action==="delete-all"){
    // This does not erase legally relevant signed records or PDF evidence.
    // It removes requests from the active DMS UI, invalidates pending links
    // and appends an audit event to each affected request.
    if(body.confirmation!=="DELETE ALL")throw Error("Type DELETE ALL to confirm");
    const expectedCount=Number(body.expectedCount);
    if(!Number.isSafeInteger(expectedCount)||expectedCount<1)
      throw Error("Select an existing set of requests before deletion");
    const removed=rowError(await admin.rpc("dms_native_hide_all_sign_requests",{
      p_owner_id:user,p_expected_count:expectedCount
    }));
    return {deleted:removed,evidencePreserved:true};
  }
  if(action==="mail-status"){
    const entry=rowError(await relayTable().select("enabled,verified_at,sender_email")
      .eq("owner_id",user).maybeSingle());
    return {connected:!!entry?.enabled,senderEmail:"zhenlisecretary@gmail.com",
      verifiedAt:entry?.enabled?entry.verified_at:null};
  }
  if(action==="mail-connect"){
    const script_url=relayUrl(body.scriptUrl);
    const relay_hmac_secret=safe(body.sharedSecret,128);
    if(!/^[0-9a-f]{64}$/.test(relay_hmac_secret))
      throw Error("Enter the exact 64-character secret saved in Apps Script Properties");
    const result=await sendRelayRequest({script_url,relay_hmac_secret},{kind:"ping"});
    if(!Number.isInteger(result.quotaRemaining))
      throw Error("Gmail authorization check did not report remaining quota");
    if(result.quotaRemaining<1)
      throw Error("Gmail account is authenticated but the daily sending quota is exhausted");
    rowError(await relayTable().upsert({
      owner_id:user,script_url,relay_hmac_secret,enabled:true,
      sender_email:"zhenlisecretary@gmail.com",
      verified_at:now(),updated_at:now()
    },{onConflict:"owner_id"}));
    return {connected:true,senderEmail:"zhenlisecretary@gmail.com",
      quotaRemaining:result.quotaRemaining};
  }
  if(action==="mail-disable"){
    rowError(await relayTable().update({enabled:false,updated_at:now()}).eq("owner_id",user));
    return {connected:false};
  }

  if(action==="create"){
    const company=safe(body.company),subject=safe(body.subject),note=safe(body.note,1000);
    if(company.length<2||subject.length<2)throw Error("Company and subject are required");
    const raw=body.signers;
    if(!Array.isArray(raw)||raw.length<1||raw.length>15)throw Error("Enter 1–15 sequential signers");
    const signers=raw.map((s,i)=>({id:uuid(),position:i+1,name:safe(s.name,180),
      email:safe(s.email,250).toLowerCase(),signedAt:null,signaturePath:null}));
    if(signers.some(s=>!s.name||!validEmail(s.email)))throw Error("Each signer needs a name and valid email");
    const days=Number(body.days)||14;
    if(![7,14,30,60].includes(days))throw Error("Choose 7, 14, 30 or 60 days");
    const date=new Date(Date.now()+days*86400000).toISOString();
    const r=rowError(await table().insert({owner_id:user,company,subject,note,
      sender_email:defaultSenderEmail,signers,expires_at:date,
      audit:[{event:"created",at:now()}]}).select("*").single());
    return {request:await presentation(r,true)};
  }
  const r=await owned(body.requestId,user);
  if(action==="detail")return {request:await presentation(r,true)};
  if(action==="order"){
    const reordered=reorderUnsignedSigners(r,body.signerIds);
    const previous=r.signers.map(s=>s.id);
    const next=reordered.map(s=>s.id);
    if(previous.every((id,i)=>id===next[i]))
      return {request:await presentation(r,true),changed:false};
    const {data:updated,error:problem}=await table().update({
      signers:reordered,updated_at:now(),
      audit:[...(r.audit||[]),{event:"signing_order_changed",at:now(),
        previousOrder:previous,newOrder:next}]
    }).eq("id",r.id).eq("owner_id",user).eq("status",r.status)
      .eq("updated_at",r.updated_at).select("*").maybeSingle();
    if(problem)throw Error(problem.message);
    if(!updated)throw Error("Request changed during reordering. Reload and try again.");
    // Avoid sending unsolicited or duplicate email: use Resend invitation
    // explicitly if the next signer has changed.
    return {request:await presentation(updated,true),changed:true};
  }
  if(action==="reset"){
    // A reset starts a NEW independent draft. Original request, signed
    // evidence and audit remain intact. The old pending links get revoked.
    if(r.status==="finalizing")throw Error("Finish PDF finalization before resetting this request");
    const newId=uuid();
    const {signers,map}=resetSignerMapping(r);
    const uploaded: string[]=[];
    const documents: any[]=[];
    let cloned=false;
    try {
      for(const d of r.documents){
        const id=uuid(),path=user+"/"+newId+"/original/"+id+".pdf";
        const original=rowError(await bucket().download(d.path));
        const bytes=new Uint8Array(await original.arrayBuffer());
        if(bytes.length<20||bytes.length>maxPdf ||
           new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")
          throw Error("An original PDF is missing or invalid. The old request was not changed.");
        rowError(await bucket().upload(path,bytes,{contentType:"application/pdf",upsert:false}));
        uploaded.push(path);
        documents.push({id,name:d.name,pages:d.pages,path,
          sha256:await hash(bytes)});
      }
      const docIds=new Map(r.documents.map((d,i)=>[d.id,documents[i].id]));
      const boxes=r.boxes.map(box=>({
        ...box,documentId:docIds.get(box.documentId),
        signerId:map.get(box.signerId)
      }));
      if(boxes.some(b=>!b.documentId||!b.signerId))
        throw Error("Signature position mapping failed; the old request was not changed");
      const fresh=rowError(await table().insert({
        id:newId,owner_id:user,company:r.company,subject:r.subject,
        note:r.note,sender_email:r.sender_email||defaultSenderEmail,
        signers,documents,boxes,
        status:"draft",expires_at:new Date(Date.now()+14*86400000).toISOString(),
        audit:[{event:"reset_created",at:now(),sourceRequestId:r.id}]
      }).select("*").single());
      cloned=true;
      // Render the new draft before touching original status so a link
      // configuration problem can never revoke the source without providing a
      // replacement draft to the DMS.
      const freshPresentation=await presentation(fresh,true);
      // CAS refuses reset if anyone has signed or edited concurrently.
      // Completed originals stay completed; pending links become revoked.
      const nextStatus=["pending","draft"].includes(r.status)?"revoked":r.status;
      const {data:originalUpdated,error:problem}=await table().update({
        status:nextStatus,updated_at:now(),
        audit:[...(r.audit||[]),{event:"reset_to_new_draft",at:now(),
          replacementRequestId:newId,previousStatus:r.status}]
      }).eq("id",r.id).eq("owner_id",user).eq("status",r.status)
        .eq("updated_at",r.updated_at).select("id").maybeSingle();
      if(problem)throw Error(problem.message);
      if(!originalUpdated)throw Error("The original request changed during reset. Reload and retry.");
      return {request:freshPresentation,
        sourceStatus:nextStatus,originalId:r.id};
    }catch(error){
      // Cleanup only NEW draft content. Never delete old PDFs or signatures.
      if(cloned){
        try{await table().delete().eq("id",newId).eq("owner_id",user);}catch{ /* return original error */ }
      }
      if(uploaded.length){
        try{await bucket().remove(uploaded);}catch{ /* return original error */ }
      }
      throw error;
    }
  }
  if(action==="edit"){
    // Drafts can be edited normally. An activated request is editable only
    // before its first signature: editing returns it to draft and rotates ALL
    // signer IDs, revoking old bearer links while preserving the original PDFs.
    if(!["draft","pending"].includes(r.status) || r.signers.some(s=>s.signedAt))
      throw Error("Only drafts and requests without signed documents can be edited");
    const company=safe(body.company),subject=safe(body.subject),note=safe(body.note,1000);
    if(company.length<2||subject.length<2)throw Error("Company and subject are required");
    const requested=body.signers;
    if(!Array.isArray(requested)||!requested.length||requested.length>15)
      throw Error("Enter 1–15 sequential signers");
    const ids=new Set(),byId=new Map(r.signers.map(s=>[s.id,s]));
    const mapped=new Map();
    const signers=requested.map((sg,index)=>{
      const priorId=String(sg.id||"");
      if(priorId&&(!byId.has(priorId)||ids.has(priorId)))
        throw Error("Invalid or duplicate original signer ID");
      if(priorId)ids.add(priorId);
      const name=safe(sg.name,180),email=safe(sg.email,250).toLowerCase();
      if(!name||!validEmail(email))throw Error("All signers need valid names and emails");
      const newId=r.status==="pending"?uuid():(priorId||uuid());
      if(priorId)mapped.set(priorId,newId);
      return {id:newId,position:index+1,name,email,signedAt:null,signaturePath:null};
    });
    const days=body.days===null||body.days===undefined||body.days===""?0:Number(body.days);
    if(![0,7,14,30,60].includes(days))throw Error("Expiry renewal must be 7, 14, 30 or 60 days");
    const expiry=days?new Date(Date.now()+days*86400000).toISOString():r.expires_at;
    const boxes=r.boxes.filter(b=>mapped.has(b.signerId))
      .map(b=>({...b,signerId:mapped.get(b.signerId)}));
    const reset=r.status==="pending";
    const change={
      company,subject,note,signers,boxes,status:"draft",expires_at:expiry,
      sender_email:defaultSenderEmail,updated_at:now(),
      audit:[...(r.audit||[]),{
        event:"details_edited",at:now(),previousStatus:r.status,
        oldLinksRevoked:reset,signerCount:signers.length
      }]
    };
    // CAS prevents an in-flight signature, activation or another editor from
    // being overwritten by a stale full-row update.
    const {data:updated,error:problem}=await table().update(change)
      .eq("id",r.id).eq("owner_id",user).eq("status",r.status)
      .eq("updated_at",r.updated_at).select("*").maybeSingle();
    if(problem)throw Error(problem.message);
    if(!updated)throw Error("Request changed while editing. Reload before saving.");
    return {request:await presentation(updated,true),linksRevoked:reset};
  }

  if(action==="document"){
    const d=r.documents.find(x=>x.id===body.documentId);if(!d)throw Error("Document missing");
    const b=rowError(await bucket().download(d.finalPath||d.path));
    return {pdf:b}; 
  }
  if(action==="upload"){
    if(r.status!=="draft"||r.documents.length>=8)throw Error("Draft allows no more than 8 documents");
    const b=decode64(String(body.base64||""));
    if(b.length>maxPdf||b.length<20||new TextDecoder().decode(b.slice(0,5))!=="%PDF-")
      throw Error("PDF must be valid and 3 MB or smaller");
    const pdf=await PDFDocument.load(b,{ignoreEncryption:false});
    const pages=pdf.getPageCount();
    if(pages<1||pages>100)throw Error("Only PDFs of 1–100 pages are supported");
    for(const p of pdf.getPages())if(p.getRotation().angle%360!==0)
      throw Error("Please rotate the PDF to upright pages before uploading");
    const fileId=uuid(),filename=safe(body.filename,120).replace(/[\/\\\u0000-\u001f]/g,"_")||"document.pdf";
    const path=user+"/"+r.id+"/original/"+fileId+".pdf";
    rowError(await bucket().upload(path,b,{contentType:"application/pdf",upsert:false}));
    const d={id:fileId,name:filename,pages,path,sha256:await hash(b)};
    const updated=await write(r,{documents:[...r.documents,d]});
    return {request:await presentation(updated,true)};
  }
  if(action==="boxes"){
    if(r.status!=="draft")throw Error("Only drafts can be edited");
    if(!Array.isArray(body.boxes)||body.boxes.length<1||body.boxes.length>80)
      throw Error("Add 1–80 signature boxes");
    const boxes=body.boxes.map(x=>({
      documentId:String(x.documentId||""),signerId:String(x.signerId||""),
      page:Number(x.page),x:Number(x.x),y:Number(x.y),
      width:Number(x.width),height:Number(x.height)
    }));
    for(const box of boxes){
      const doc=r.documents.find(x=>x.id===box.documentId);
      if(!doc||!r.signers.some(x=>x.id===box.signerId)||
        !Number.isInteger(box.page)||box.page<1||box.page>doc.pages||
        ![box.x,box.y,box.width,box.height].every(Number.isFinite)||
        box.x<0||box.y<0||box.width<1||box.height<1||
        box.x+box.width>100||box.y+box.height>100)
        throw Error("Invalid signer, document, page or percentage box");
    }
    const updated=await write(r,{boxes});
    return {request:await presentation(updated,true)};
  }
  if(action==="activate"){
    if(r.status!=="draft"||!r.documents.length)throw Error("Upload a PDF first");
    if(!r.signers.every(s=>r.boxes.some(b=>b.signerId===s.id)))
      throw Error("Assign at least one PDF signature box to every signer");
    const updated=await write(r,{status:"pending",audit:[...r.audit,{event:"activated",at:now()}]});
    return {request:await presentation(updated,true),email:await sendInvite(updated,updated.signers[0])};
  }
  if(action==="invite"){
    if(r.status!=="pending")throw Error("Request is not awaiting signatures");
    const next=r.signers.find(x=>!x.signedAt);
    return {email:await sendInvite(r,next)};
  }
  if(action==="finalize"){
    const updated=await finalize(r);return {request:await presentation(updated,true)};
  }
  if(action==="revoke"){
    if(r.status==="revoked")return {request:await presentation(r,true)};
    const updated=await write(r,{status:"revoked",audit:[...r.audit,{event:"revoked",at:now()}]});
    return {request:await presentation(updated,true)};
  }
  throw Error("Unknown administrative action");
}
async function handleSigner(action,body) {
  const {r,s}=await signerAccess(body.token);
  if(action==="view"){
    return {request:{company:r.company,subject:r.subject,note:r.note,
      status:r.status,expiresAt:r.expires_at,signerName:s.name,
      position:s.position,signedAt:s.signedAt||null,canSign:canAct(r,s),
      documents:canAct(r,s)||r.status==="completed"
        ?r.documents.map(d=>({id:d.id,name:d.name,pages:d.pages})):[]}};
  }
  if(action==="document"){
    if(!canAct(r,s)&&r.status!=="completed")throw Error("Signing document unavailable at this stage");
    const d=r.documents.find(x=>x.id===body.documentId);
    if(!d)throw Error("Document not found");
    const blob=rowError(await bucket().download(r.status==="completed"?(d.finalPath||d.path):d.path));
    return {pdf:blob};
  }
  if(action==="sign"){
    if(!canAct(r,s))throw Error("This signing link is not currently eligible");
    if(body.consent!==true||safe(body.typedName,180)!==s.name)
      throw Error("Please confirm the signer's exact name and give consent");
    const data=String(body.signature||"");
    if(!data.startsWith("data:image/png;base64,"))throw Error("Draw a PNG signature before submitting");
    const png=decode64(data.slice(22));
    if(png.length<100||png.length>maxSign||
       secureHex(png.slice(0,8))!=="89504e470d0a1a0a")throw Error("Invalid signature image");
    const path=r.owner_id+"/"+r.id+"/signatures/"+s.id+".png";
    rowError(await bucket().upload(path,png,{upsert:false,contentType:"image/png"}));
    const rpc=await admin.rpc("dms_native_accept_signature",{
      p_request_id:r.id,p_signer_id:s.id,p_signature_path:path
    });
    if(rpc.error){await bucket().remove([path]);throw Error(rpc.error.message);}
    const updated=rowError(await table().select("*").eq("id",r.id).single());
    let status=rpc.data,email="";
    if(status==="finalizing"){
      try {await finalize(updated);status="completed";}
      catch{status="finalizing";} // admin can safely retry finalization
    } else {
      email=await sendInvite(updated,updated.signers.find(x=>!x.signedAt));
    }
    return {signed:true,status,email};
  }
  throw Error("Unknown public signer action");
}
Deno.serve(async (req) => {
  const origin=req.headers.get("origin")||"";
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=="POST")return json({error:"Method not allowed"},405,origin);
  if(origin&&!allowedOrigins().includes(origin))return json({error:"Unrecognised website origin"},403,origin);
  if(!supaUrl||!serviceKey())return json({error:"Native signing backend is not configured"},503,origin);
  try {
    const raw=await req.text();
    if(raw.length>5*1024*1024) return json({error:"Request too large"},413,origin);
    const body=JSON.parse(raw);
    const action=String(body.action||"");
    let result;
    if(action.startsWith("admin-"))result=await handleAdmin(action.slice(6),req,body);
    else if(action.startsWith("signer-"))result=await handleSigner(action.slice(7),body);
    else return json({error:"Unknown action"},400,origin);
    if(result.pdf)return bytesResponse(result.pdf,origin);
    return json(result,200,origin);
  }catch(error){return json({error:error instanceof Error?error.message:"Request failed"},400,origin);}
});
