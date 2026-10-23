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
const bucket = () => admin.storage.from("dms-native-signing");
const secret = env("NATIVE_SIGNING_SECRET");
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
  const val = env("PUBLIC_SIGNING_URL");
  if (!val) throw Error("PUBLIC_SIGNING_URL is not configured");
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
  const key = await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
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
  if(!r)throw Error("Signing request not found");
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
  if(!r)throw Error("Request not found in your DMS account");
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
    expiresAt:r.expires_at,createdAt:r.created_at,signers,documents:r.documents.map(d=>({
      id:d.id,name:d.name,pages:d.pages,ready:!!d.finalPath
    })),boxes:r.boxes,audit:r.audit};
}
async function sendInvite(r,s) {
  if(!s)return "no pending signer";
  const key=env("RESEND_API_KEY"),from=env("SIGNING_FROM_EMAIL");
  if(!key||!from)return "manual — verified sender not configured";
  const link=await signerLink(r,s);
  const subject="ZHENLI | Document signature required: "+r.company;
  const text="Dear "+s.name+",\n\nYou have a document requiring your electronic signature.\nCompany: "+
    r.company+"\nSubject: "+r.subject+"\n\nSecure signing link:\n"+link+
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
async function handleAdmin(action,req,body) {
  const user=await who(req);
  if(action==="list"){
    const rows=rowError(await table().select("id,company,subject,status,created_at,expires_at")
      .eq("owner_id",user).order("created_at",{ascending:false}).limit(100));
    return {requests:rows};
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
      signers,expires_at:date,audit:[{event:"created",at:now()}]}).select("*").single());
    return {request:await presentation(r,true)};
  }
  const r=await owned(body.requestId,user);
  if(action==="detail")return {request:await presentation(r,true)};
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
  if(secret.length<32||!supaUrl||!serviceKey())return json({error:"Native signing backend is not configured"},503,origin);
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
