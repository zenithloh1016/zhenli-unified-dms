// Supabase-native sequential signing administrator panel.
// Completely separate from legacy EdgeOne; same DMS login, private storage.
const html=(s)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const act=(name,label,id="")=>'<button type="button" class="btn secondary" data-action="ns-'+name+'" data-id="'+html(id)+'">'+html(label)+'</button>';
const stamp=s=>s?new Date(s).toLocaleString("en-MY"):"—";
const readDataURL=file=>new Promise((yes,no)=>{
  const fr=new FileReader();fr.onerror=()=>no(Error("Unable to read PDF"));
  fr.onload=()=>yes(String(fr.result));fr.readAsDataURL(file);
});
export function createSupabaseSigning({db,getCompanies,update}) {
  let view="list",requests=[],current=null,loading=false,error="",message="";
  let initialized=false,signerLines=2,boxes=[];
  const notice=(s,isError=false)=>{message=isError?"":s;error=isError?s:"";update();};
  async function call(action,fields={}) {
    if(!db)throw Error("Sign in to the DMS first");
    const {data,error}=await db.functions.invoke("dms-sequential-signing",{body:{action:"admin-"+action,...fields}});
    if(error){
      const details=error.context?.json ? await error.context.json().catch(()=>null) : null;
      throw Error(details?.error||error.message||"Signing service unavailable");
    }
    if(data?.error)throw Error(data.error);
    return data;
  }
  async function run(fn){
    if(loading)return;
    loading=true;error="";message="";update();
    try{await fn();}catch(e){notice(e.message||String(e),true);}
    finally{loading=false;update();}
  }
  async function load(){
    initialized=true; // Prevent an automatic retry loop when setup is incomplete.
    await run(async()=>{
      const r=await call("list");
      requests=r.requests||[];initialized=true;view="list";
    });
  }
  async function open(id){
    const r=await call("detail",{requestId:id});
    current=r.request;boxes=(current.boxes||[]).map(b=>({...b}));view="detail";update();
  }
  function signersInput(){
    const select=getCompanies().map(c=>'<option value="'+html(c.name)+'"></option>').join("");
    return '<section class="zs-panel"><h2>New Supabase signing request</h2>'+
      '<p class="muted">Upload PDFs and specify signature positions before activation. This route does not use Tencent EdgeOne.</p>'+
      '<form id="ns-create"><div class="zs-form-grid">'+
      '<label>Company name<input name="company" required maxlength="250" list="ns-companies"></label>'+
      '<datalist id="ns-companies">'+select+'</datalist>'+
      '<label>Subject<input name="subject" required maxlength="250" placeholder="Board resolution for signing"></label>'+
      '<label>Link validity<select name="days"><option value="7">7 days</option><option value="14" selected>14 days</option><option value="30">30 days</option><option value="60">60 days</option></select></label>'+
      '<label class="zs-span">Signer instructions<textarea name="note" rows="3" maxlength="1000"></textarea></label></div>'+
      '<h3>Signers in required order</h3><p class="muted">One signer per line: Full name | email address</p>'+
      '<textarea name="signers" rows="5" placeholder="Director One | director@example.com\nDirector Two | second@example.com" required></textarea>'+
      '<p class="fineprint">Signatures are released strictly one at a time. Invitations are sent only after activation.</p>'+
      '<div class="zs-actions"><button class="btn primary" type="submit">Create draft request</button> '+act("list","Cancel")+'</div></form></section>';
  }
  function listView(){
    return '<div class="zs-toolbar">'+act("new","＋ Create signing request")+' '+act("refresh","Refresh list")+'</div>'+
      '<section class="zs-panel"><h2>Supabase signing requests</h2><p class="muted">These records are separate from your EdgeOne history.</p>'+
      (requests.length?'<div class="zs-table-wrap"><table class="zs-table"><thead><tr>'+
      '<th>Company</th><th>Subject</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>'+
      requests.map(r=>'<tr><td><b>'+html(r.company)+'</b></td><td>'+html(r.subject)+'</td><td>'+html(r.status)+'</td><td>'+stamp(r.created_at)+'</td><td>'+act("open","Open",r.id)+'</td></tr>').join("")+
      '</tbody></table></div>':'<p class="muted">No native signing requests yet. Create one above.</p>')+'</section>';
  }
  function boxRow(b,i){
    const opts=(items,selected)=>items.map(x=>'<option value="'+html(x.id)+'" '+(x.id===selected?"selected":"")+'>'+html(x.label)+'</option>').join("");
    const docs=current.documents.map(d=>({id:d.id,label:d.name+" ("+d.pages+" pages)"}));
    const signers=current.signers.map(s=>({id:s.id,label:s.position+". "+s.name}));
    const field=(k,label,step,max)=>'<label>'+label+'<input name="'+k+'-'+i+'" type="number" min="'+(k==="width"||k==="height"?1:0)+'" max="'+max+'" step="'+step+'" value="'+html(b[k])+'" required></label>';
    return '<div class="zs-panel ns-box-row"><strong>Signature box '+(i+1)+'</strong><div class="zs-form-grid">'+
      '<label>PDF<select name="documentId-'+i+'">'+opts(docs,b.documentId)+'</select></label>'+
      '<label>Signer<select name="signerId-'+i+'">'+opts(signers,b.signerId)+'</select></label>'+
      field("page","Page",1,100)+field("x","Left %",.5,100)+
      field("y","Top %",.5,100)+field("width","Width %",.5,100)+field("height","Height %",.5,100)+
      '</div>'+act("remove-box","Remove box",String(i))+'</div>';
  }
  function detailView(){
    const r=current;
    const locked=r.status!=="draft";
    return '<div class="zs-toolbar">'+act("list","← All native requests")+' '+act("open","Reload",r.id)+
      (r.status!=="revoked"&&r.status!=="completed"?act("revoke","Revoke signing links"):"")+'</div>'+
      '<section class="zs-panel"><h2>'+html(r.company)+'</h2>'+
      '<p>'+html(r.subject)+' · <b>'+html(r.status)+'</b> · Expires '+stamp(r.expiresAt)+'</p>'+
      '<p class="muted">'+html(r.note||"No additional message")+'</p>'+
      '<h3>Signers</h3>'+
      r.signers.map(s=>'<div class="zs-signer"><div><b>'+s.position+'. '+html(s.name)+'</b> '+
        '<small>'+html(s.email)+' · '+(s.signedAt?"Signed "+stamp(s.signedAt):"Not signed")+'</small></div>'+
        (r.status!=="draft"&&r.status!=="revoked"?act("copy","Copy signer link",s.id):"")+'</div>').join("")+
      '<h3>PDFs</h3>'+r.documents.map(d=>'<div class="zs-doc"><b>'+html(d.name)+'</b> ('+d.pages+' pages) '+act("pdf","Download / preview PDF",d.id)+'</div>').join("")+
      (r.documents.length?"":'<p class="muted">No documents uploaded.</p>')+
      (!locked?'<label class="zs-upload">Upload PDF files (8 max, 3MB each)'+
        '<input id="ns-upload-pdf" type="file" accept="application/pdf,.pdf" multiple></label>':"")+
      '</section>'+
      (!locked&&r.documents.length?'<section class="zs-panel"><h3>Signature placement</h3>'+
        '<p class="muted">Specify each signature rectangle as percentages from the top-left of a PDF page. Use PDF preview to check placement. All PDF pages must be upright.</p>'+
        '<form id="ns-boxes"><input type="hidden" name="boxCount" value="'+boxes.length+'">'+
        boxes.map(boxRow).join("")+
        '<div class="zs-actions">'+act("add-box","＋ Add signature box")+
        ' <button class="btn primary" type="submit">Save signature boxes</button></div></form>'+
        '<div class="zs-actions">'+act("activate","Activate & invite first signer")+'</div></section>':"")+
      (r.status==="pending"?'<section class="zs-panel"><h3>Email invitation</h3>'+
        '<p class="muted">Automated email uses a separately configured verified Resend sender. You can always copy the active signer link manually.</p>'+
        act("invite","Resend invitation to current signer")+'</section>':"")+
      (r.status==="finalizing"?'<section class="zs-panel"><p>Signatures are recorded; PDF finalization needs retry.</p>'+act("finalize","Retry PDF finalization")+'</section>':"")+
      (r.status==="completed"?'<section class="zs-panel"><p>All required signers have completed. Download final PDFs above.</p></section>':"");
  }
  function captureBoxes(){
    const form=document.getElementById("ns-boxes");
    if(!form)return;
    boxes=boxes.map((box,i)=>{
      const f=new FormData(form),get=k=>f.get(k+"-"+i);
      return {documentId:get("documentId"),signerId:get("signerId"),
        page:Number(get("page")),x:Number(get("x")),y:Number(get("y")),
        width:Number(get("width")),height:Number(get("height"))};
    });
  }
  async function clipboard(value){
    if(!value)throw Error("No signing link available");
    await navigator.clipboard.writeText(value);
    notice("Individual signing link copied. Keep it confidential.");
  }
  async function pdf(docId){
    const r=await call("document",{requestId:current.id,documentId:docId});
    if(!(r instanceof Blob))throw Error("The PDF response was not a file");
    const u=URL.createObjectURL(r),a=document.createElement("a");
    a.href=u;a.download=(current.documents.find(d=>d.id===docId)?.name||"document.pdf");
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(u),30000);
    notice("PDF downloaded. Check its page layout before saving signature boxes.");
  }
  function onClick(name,id){
    if(!name.startsWith("ns-"))return false;
    const a=name.slice(3);
    if(a==="refresh"||a==="list"){load();return true;}
    if(a==="new"){view="new";error="";message="";update();return true;}
    if(a==="open"){run(()=>open(id));return true;}
    if(a==="copy"){run(()=>clipboard(current?.signers.find(s=>s.id===id)?.link));return true;}
    if(a==="pdf"){run(()=>pdf(id));return true;}
    if(a==="add-box"){
      captureBoxes();if(!current?.documents.length)return true;
      if(boxes.length>=80)return notice("Maximum 80 signature boxes.",true),true;
      const d=current.documents[0],s=current.signers[Math.min(boxes.length,current.signers.length-1)];
      boxes.push({documentId:d.id,signerId:s.id,page:1,x:55,y:75,width:30,height:8});
      update();return true;
    }
    if(a==="remove-box"){captureBoxes();boxes.splice(Number(id),1);update();return true;}
    if(a==="activate"){
      captureBoxes();
      if(!confirm("Activate this request? The first signer may receive an email immediately."))return true;
      run(async()=>{
        if(boxes.length)await call("boxes",{requestId:current.id,boxes});
        const r=await call("activate",{requestId:current.id});
        await open(current.id);notice("Request activated. Invitation: "+r.email);
      });return true;
    }
    if(a==="invite"){run(async()=>{const r=await call("invite",{requestId:current.id});notice("Invitation: "+r.email);});return true;}
    if(a==="finalize"){run(async()=>{await call("finalize",{requestId:current.id});await open(current.id);notice("Final PDFs generated.");});return true;}
    if(a==="revoke"){
      if(!confirm("Revoke all signer links for this native request?"))return true;
      run(async()=>{await call("revoke",{requestId:current.id});await open(current.id);notice("Links revoked.");});return true;
    }
    return true;
  }
  function submit(form){
    if(form.id==="ns-create"){
      const f=new FormData(form),raw=String(f.get("signers")||"");
      const signers=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{
        const parts=line.split("|");return {name:(parts[0]||"").trim(),email:(parts[1]||"").trim()};
      });
      run(async()=>{
        const data=await call("create",{company:f.get("company"),subject:f.get("subject"),
          note:f.get("note"),days:Number(f.get("days")),signers});
        await open(data.request.id);notice("Draft created. Upload PDFs and save signature boxes.");
      });return true;
    }
    if(form.id==="ns-boxes"){
      captureBoxes();run(async()=>{
        await call("boxes",{requestId:current.id,boxes});
        await open(current.id);notice("Signature boxes saved.");
      });return true;
    }
    return false;
  }
  function changed(input){
    if(input.id!=="ns-upload-pdf")return false;
    const files=[...input.files];input.value="";
    run(async()=>{
      for(const file of files){
        if(file.size>3*1024*1024 || !file.name.toLowerCase().endsWith(".pdf"))
          throw Error(file.name+": PDF must be no larger than 3 MB");
        const data=await readDataURL(file);
        await call("upload",{requestId:current.id,filename:file.name,base64:data.split(",")[1]});
      }
      await open(current.id);notice(files.length+" PDF(s) uploaded.");
    });
    return true;
  }
  return {
    onClick,submit,changed,
    render:()=>'<div class="integration-heading"><div><p class="eyebrow">DOCUMENT SIGNING</p>'+
      '<h1>Supabase sequential signing</h1><p class="muted">Private native alternative, independent of Tencent EdgeOne</p></div></div>'+
      (error?'<div class="zs-message zs-error">'+html(error)+'</div>':"")+
      (message?'<div class="zs-message">'+html(message)+'</div>':"")+
      (loading?'<p class="muted">Processing…</p>':"")+
      (view==="new"?signersInput():view==="detail"&&current?detailView():listView()),
    mount:()=>{if(!initialized&&!loading)load();}
  };
}
