// Standalone browser signing page. No Supabase session or service keys required.
// All documents are downloaded through the private, token-verified Edge Function.
const url=String(import.meta.env.VITE_SUPABASE_URL||"").replace(/\/$/,"");
const key=String(import.meta.env.VITE_SUPABASE_ANON_KEY||"");
const token=new URL(location.href).searchParams.get("token")||"";
const $=q=>document.querySelector(q);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let canSign=false,drew=false,current=null,busy=false;
async function api(action,fields={}) {
  if(!url||!key)throw Error("Signing page configuration is incomplete");
  const response=await fetch(url+"/functions/v1/dms-sequential-signing",{
    method:"POST",mode:"cors",cache:"no-store",referrerPolicy:"no-referrer",
    headers:{"Content-Type":"application/json","apikey":key},
    body:JSON.stringify({action:"signer-"+action,token,...fields})
  });
  if(!response.ok){
    const detail=await response.json().catch(()=>null);
    throw Error(detail?.error||"Signing service unavailable");
  }
  return action==="document"?response.blob():response.json();
}
function err(e){$("#alert").textContent=e?.message||String(e);}
async function openPdf(id) {
  const popup=window.open("about:blank","_blank");
  try {
    const blob=await api("document",{documentId:id});
    const objectUrl=URL.createObjectURL(blob);
    if(popup)popup.location.href=objectUrl;
    else {
      const a=document.createElement("a");a.href=objectUrl;a.download="signing-document.pdf";a.click();
    }
    setTimeout(()=>URL.revokeObjectURL(objectUrl),120000);
  }catch(e){if(popup)popup.close();err(e);}
}
function wireCanvas(){
  const canvas=$("#signature"),ctx=canvas.getContext("2d");
  ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#101820";ctx.lineWidth=3;
  let drawing=false;
  const point=e=>{
    const rect=canvas.getBoundingClientRect();
    return {x:(e.clientX-rect.left)*canvas.width/rect.width,
      y:(e.clientY-rect.top)*canvas.height/rect.height};
  };
  canvas.addEventListener("pointerdown",e=>{
    e.preventDefault();canvas.setPointerCapture(e.pointerId);
    drawing=true;const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y);
  });
  canvas.addEventListener("pointermove",e=>{
    if(!drawing)return;
    e.preventDefault();const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();drew=true;
  });
  const end=()=>{drawing=false;};
  canvas.addEventListener("pointerup",end);canvas.addEventListener("pointercancel",end);
  $("#clear").addEventListener("click",()=>{ctx.clearRect(0,0,canvas.width,canvas.height);drew=false;});
  $("#submit").addEventListener("click",async()=>{
    if(busy)return;
    const name=$("#fullname").value.trim();
    if(!drew||name!==current.signerName||!$("#consent").checked){
      err(Error("Draw your signature, enter the exact name shown and confirm consent."));
      return;
    }
    if(!confirm("Confirm electronic signing of all documents in this request?"))return;
    busy=true;$("#submit").disabled=true;$("#alert").textContent="";
    try {
      const outcome=await api("sign",{typedName:name,consent:true,signature:canvas.toDataURL("image/png")});
      $("#content").innerHTML="<h2>Signature recorded</h2><p>Your electronic signature has been submitted successfully.</p>"+
        (outcome.status==="finalizing"?"<p>The final documents are being processed; please contact the sender if needed.</p>":"");
    }catch(e){err(e);$("#submit").disabled=false;}finally{busy=false;}
  });
}
async function load(){
  if(!token){err(Error("Missing private signer token. Open the full link from your invitation."));return;}
  try {
    const result=await api("view"),r=result.request;current=r;canSign=!!r.canSign;
    if(r.status==="revoked"){ $("#content").innerHTML="<p>This signing request has been revoked.</p>";return; }
    if(r.signedAt){$("#content").innerHTML="<h2>Already signed</h2><p>Your signature was recorded. Thank you.</p>";return;}
    if(!canSign){
      $("#content").innerHTML="<h2>Signing is not yet available</h2><p>This request may be awaiting an earlier signer, have expired, or already be completed. Contact the company secretary for details.</p>";
      return;
    }
    $("#content").innerHTML="<h2>"+esc(r.company)+"</h2><p>"+esc(r.subject)+
      "</p><p>"+esc(r.note||"Please review the PDF(s) before signing.")+"</p>"+
      "<p class=subtle>Signer "+r.position+": <b>"+esc(r.signerName)+"</b> · Link expiry: "+esc(new Date(r.expiresAt).toLocaleString("en-MY"))+"</p>"+
      "<h3>Documents to review</h3><div id=documents></div>"+
      "<h3>Draw your signature</h3><canvas id=signature width=650 height=180 aria-label='Draw signature here'></canvas>"+
      "<button id=clear type=button class=secondary>Clear signature</button>"+
      "<label>Confirm full name<input id=fullname type=text autocomplete=name placeholder='Enter name exactly as above' required></label>"+
      "<label><input id=consent type=checkbox> I have reviewed the documents and intend to sign electronically with this signature.</label>"+
      "<button id=submit type=button>Confirm and sign all documents</button>";
    const box=$("#documents");
    for(const d of r.documents){
      const btn=document.createElement("button");btn.type="button";btn.className="secondary";
      btn.textContent="Open PDF · "+d.name+" ("+d.pages+" pages)";
      btn.addEventListener("click",()=>openPdf(d.id));box.append(btn);
    }
    wireCanvas();
  } catch(e){err(e);$("#content").textContent="Please contact the sender for a new signing link.";}
}
load();
