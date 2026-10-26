import {createPdfSignaturePreview} from './signature-preview.js';

// Supabase Sequential Signing shares the original Tencent EdgeOne interface and
// PDF.js placement preview, but retains its separate secure Supabase backend.
// Never transfer EdgeOne request tokens, credentials or private PDF files here.
const e = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const b = (label, action, id='', style='secondary') =>
  '<button type="button" class="btn '+style+'" data-action="ns-'+action+
  '" data-id="'+e(id)+'">'+e(label)+'</button>';
const stamp = value => {
  if (!value) return '—';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'—':e(date.toLocaleString('en-MY'));
};
const DEFAULT_SENDER_EMAIL = "zhenlisecretary@gmail.com";
const pdfAsDataUrl = file => new Promise((resolve, reject) => {
  const reader=new FileReader();
  reader.onerror=()=>reject(Error('Cannot read the selected PDF.'));
  reader.onload=()=>resolve(String(reader.result));
  reader.readAsDataURL(file);
});

export function createSupabaseSigning({db,getCompanies,update}) {
  let view='list',requests=[],detail=null,busy=false,message='',error=false;
  let initialized=false, signerCount=2, placementRows=[],totalRequests=0;
  let mailStatus={connected:false,senderEmail:'zhenlisecretary@gmail.com'};
  function feedback(text,isError=false){message=String(text||'');error=isError;update();}

  async function api(action,params={}) {
    if(!db)throw Error('Please sign in to DMS first.');
    const {data,error:problem}=await db.functions.invoke('dms-sequential-signing',{
      body:{action:'admin-'+action,...params}
    });
    if(problem) {
      const details=problem.context?.json
        ? await problem.context.json().catch(()=>null) : null;
      throw Error(details?.error||problem.message||'Supabase signing service is unavailable.');
    }
    if(data?.error)throw Error(data.error);
    return data;
  }
  async function work(fn) {
    if(busy)return;
    busy=true;message='';error=false;update();
    try{await fn();}catch(ex){feedback(ex?.message||String(ex),true);}
    finally{busy=false;update();}
  }
  // The Edge Function returns private PDFs as binary octet-stream to ensure that
  // supabase-js leaves the result as a Blob, not as JSON. Normalize the MIME type
  // only after validating the PDF magic bytes; never publicly expose a Storage URL.
  async function getPdf(docId) {
    if(!detail)throw Error('Select a signing request first.');
    const data=await api('document',{requestId:detail.id,documentId:docId});
    if(!(data instanceof Blob)&&!(data instanceof ArrayBuffer))
      throw Error('Signing service returned an unexpected PDF response.');
    const bytes=new Uint8Array(data instanceof Blob?await data.arrayBuffer():data);
    if(bytes.length<8||String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')
      throw Error('The document could not be read as a PDF. Reload the request and retry.');
    return new Blob([bytes],{type:'application/pdf'});
  }

  function captureRows() {
    const root=document.getElementById('ns-placements');
    const rows=[...(root?.querySelectorAll('.zs-placement-row')||[])];
    if(!rows.length)return placementRows.map(row=>({...row}));
    return rows.map(el=>{
      const get=name=>el.querySelector('[name="'+name+'"]')?.value||'';
      return {
        docId:get('docId'),signerId:get('signerId'),page:Number(get('page')),
        x:Number(get('x')),y:Number(get('y')),width:Number(get('width')),
        height:Number(get('height'))
      };
    });
  }
  const preview=createPdfSignaturePreview({
    fetchPdf:docId=>getPdf(docId),
    getRows:()=>captureRows(),
    setRow:(index,row)=>{
      const el=document.querySelector('#ns-placements .zs-placement-row[data-index="'+index+'"]');
      if(!el)return;
      for(const field of ['x','y','width','height']){
        const input=el.querySelector('[name="'+field+'"]');
        if(input)input.value=String(row[field]);
      }
    },
    addRow:row=>{
      placementRows=captureRows();
      placementRows.push(row);
      update(); // Same immediate preview repaint as original EdgeOne signing.
    }
  });

  async function list() {
    const [data,status]=await Promise.all([api('list'),api('mail-status')]);
    requests=data.requests||[];totalRequests=Number(data.total??requests.length);
    mailStatus=status;view='list';detail=null;preview.reset();update();
  }
  async function open(id) {
    const data=await api('detail',{requestId:id});
    if(!data?.request)throw Error('Could not retrieve signing request details.');
    if(detail?.id!==data.request.id)preview.reset();
    detail=data.request;view='detail';
    placementRows=(detail.boxes||[]).map(x=>({
      docId:x.documentId,signerId:x.signerId,page:x.page,
      x:x.x,y:x.y,width:x.width,height:x.height
    }));
    update();
  }

  const select = (rows,name,value,placeholder='') =>
    '<select name="'+name+'" required>'+
    (placeholder?'<option value="">'+e(placeholder)+'</option>':'')+
    rows.map(x=>'<option value="'+e(x.id)+'"'+(x.id===value?' selected':'')+'>'+
      e(x.label)+'</option>').join('')+'</select>';

  function signerField(index,person=null){
    const editing=!!person;
    return '<div class="zs-signer-input'+(editing?' zs-edit-signer':'')+
      '" data-ns-signer data-signer-id="'+e(person?.id||'')+'"><b>'+index+'.</b>'+
      '<label>Full name<input name="ns-name" maxlength="180" required placeholder="Signer name" value="'+e(person?.name||'')+'"></label>'+
      '<label>Email<input type="email" name="ns-email" maxlength="250" required placeholder="Email address" value="'+e(person?.email||'')+'"></label>'+
      (editing?'<div class="zs-edit-signer-actions">'+b('↑ Up','move-signer-up')+b('↓ Down','move-signer-down')+b('Remove','remove-signer')+'</div>':b('Remove','remove-signer'))+
      '</div>';
  }
  const senderField=()=>'<label>Sender email address<input name="senderEmail" type="email" value="'+
    DEFAULT_SENDER_EMAIL+'" readonly aria-readonly="true"></label>'+
    '<p class="muted zs-span">Default invitation sender. Automatic email from this Gmail account requires a separately authenticated delivery connection; until then, copy signing links to send manually.</p>';
  function editForm() {
    const r=detail;
    if(!r||!['draft','pending'].includes(r.status)||r.signers.some(s=>s.signedAt))
      return '<section class="zs-panel"><p>Request details can no longer be edited.</p></section>';
    const options=(getCompanies()||[]).map(x=>'<option value="'+e(x.name)+'"></option>').join('');
    const resets=r.status==='pending';
    return '<div class="zs-toolbar">'+b('← Cancel editing','cancel-edit')+'</div>'+
      '<section class="zs-panel"><h2>Edit signing request</h2>'+
      '<p class="muted">Edit company details, the signing message, expiry and sequential signers. Existing PDF documents and signature boxes are preserved for retained signers.</p>'+
      (resets?'<p class="zs-message zs-error">This request is already activated. Saving changes will return it to Draft, revoke all previously issued signing links and require activation again. No signer has signed yet.</p>':'')+
      '<form id="ns-edit"><div class="zs-formgrid">'+
      '<label>Company name<input name="company" list="ns-edit-companies" maxlength="180" required value="'+e(r.company)+'"></label>'+
      '<datalist id="ns-edit-companies">'+options+'</datalist>'+
      '<label>Subject<input name="subject" maxlength="180" required value="'+e(r.subject)+'"></label>'+
      senderField()+
      '<label>Link validity<select name="days"><option value="" selected>Keep existing expiry</option>'+
      [7,14,30,60].map(x=>'<option value="'+x+'">Renew '+x+' days</option>').join('')+
      '</select></label>'+
      '<label class="zs-span">Signing message<textarea name="note" rows="3" maxlength="1000">'+e(r.note||'')+'</textarea></label>'+
      '</div><h3>Sequential signers</h3>'+
      '<p class="muted">Move Up / Down to change signing order. Removing a signer also removes their signature boxes.</p>'+
      '<div id="ns-edit-signers">'+r.signers.map((sg,i)=>signerField(i+1,sg)).join('')+'</div>'+
      b('+ Add signer','add-signer')+
      ' <button class="btn primary" type="submit">Save signing details</button></form></section>';
  }
  function newForm() {
    const options=(getCompanies()||[]).map(x=>'<option value="'+e(x.name)+'"></option>').join('');
    return '<div class="zs-toolbar">'+b('← Back to signing requests','refresh')+'</div>'+
      '<section class="zs-panel"><h2>Create signing request</h2>'+
      '<p class="muted">Signer order determines who signs first. Upload PDFs and assign a signature box to every signer before activation.</p>'+
      '<form id="ns-create"><div class="zs-formgrid">'+
      '<label>Company name<input name="company" list="ns-companies" maxlength="180" required placeholder="Choose a company"></label>'+
      '<datalist id="ns-companies">'+options+'</datalist>'+
      '<label>Subject<input name="subject" maxlength="180" required placeholder="Board resolution signing"></label>'+
      senderField()+
      '<label>Expiry (days)'+select(
        [7,14,30,60].map(n=>({id:String(n),label:String(n)})),'days','14')+'</label>'+
      '<label class="zs-span">Signing message<textarea name="note" rows="3" maxlength="1000" placeholder="Instructions to the signers"></textarea></label>'+
      '</div><h3>Sequential signers</h3><div id="ns-signers">'+
      Array.from({length:signerCount},(_,i)=>signerField(i+1)).join('')+'</div>'+
      b('+ Add signer','add-signer')+
      ' <button class="btn primary" type="submit"'+(busy?' disabled':'')+
      '>Create draft signing request</button></form></section>';
  }
  function orderForm() {
    const r=detail;
    if(!r||!["draft","pending"].includes(r.status))
      return '<section class="zs-panel">This request cannot be reordered.</section>';
    const unsigned=r.signers.filter(s=>!s.signedAt).length;
    return '<div class="zs-toolbar">'+b('← Cancel and return','cancel-order')+'</div>'+
      '<section class="zs-panel"><h2>Edit signing order</h2>'+
      '<p class="muted">Assign a signing position to each unsigned signer. Selecting a position automatically shifts the other unsigned signers. Signed signers are permanently locked in their original positions.</p>'+
      (r.status==='pending'
        ?'<p class="muted">Pending request: changes take effect immediately, but do not trigger a new invitation. Use Resend invitation when ready to notify the next signer.</p>':'')+
      (unsigned<2?'<p class="zs-message">Only '+unsigned+
        ' unsigned signer remains. There is no alternate order; use Reset signing request if you need a completely fresh signing round.</p>':'')+
      '<div id="ns-order-signers">'+r.signers.map((s,i)=>
        '<div class="zs-signer zs-order-signer" data-ns-order-id="'+e(s.id)+'">'+
        '<div><b class="ns-order-position">'+(i+1)+'. '+e(s.name)+'</b>'+
        '<small>'+e(s.email)+' · '+(s.signedAt?'Already signed — order locked':'Not signed')+'</small></div>'+
        '<div class="zs-edit-signer-actions">'+(s.signedAt?'<span class="zs-tag">Signed</span>':
        '<label>Signing position <select name="orderPosition" aria-label="Signing position for '+e(s.name)+'">'+
        r.signers.map((candidate,pos)=>!candidate.signedAt
          ?'<option value="'+(pos+1)+'"'+(i===pos?' selected':'')+'>'+(pos+1)+'</option>':'').join('')+
        '</select></label> '+b('↑ Up','order-up')+b('↓ Down','order-down'))+'</div></div>').join('')+
      '</div><div class="zs-actions">'+b('Save signing order','save-order','','primary')+'</div>'+
      '<p class="fineprint">This operation retains the original signer IDs and does not invalidate existing bearer links. Only the allowed signing sequence changes.</p>'+
      '</section>';
  }
  function mailInfo() {
    return '<section class="zs-panel"><h3>Gmail signing invitations</h3><p class="muted">'+
      (mailStatus.connected
        ? 'Connected: <b>zhenlisecretary@gmail.com</b> — the relay is authorized to submit invitations. Inbox delivery is not guaranteed.'
        : 'Not connected: <b>zhenlisecretary@gmail.com</b> — invitations must be copied and shared manually until Gmail is authorized.')+
      '</p>'+b('Gmail invitation settings','mail-settings','','primary')+'</section>';
  }
  function mailForm(){
    const script='https://github.com/zenithloh1016/zhenli-unified-dms/blob/main/google-apps-script/SequentialSigningGmailRelay.gs';
    const guide='https://github.com/zenithloh1016/zhenli-unified-dms/blob/main/GMAIL_SIGNING_RELAY_SETUP.md';
    return '<div class="zs-toolbar">'+b('← Return to signing requests','refresh')+'</div>'+
      '<section class="zs-panel"><h2>Connect Gmail for automatic signing invitations</h2>'+
      '<p class="muted">Sender account: <b>zhenlisecretary@gmail.com</b>. This setup only sends invitation links; it does not read emails or access PDF files.</p>'+
      '<p>1. Sign in as <b>zhenlisecretary@gmail.com</b> at '+
      '<a href="https://script.google.com/home/start" target="_blank" rel="noopener noreferrer">Google Apps Script</a> and create a new project.</p>'+
      '<p>2. Copy the <a href="'+script+'" target="_blank" rel="noopener noreferrer">ZHENLI Gmail Relay Code.gs</a> into the script editor.</p>'+
      '<p>3. Generate a new secret below and copy it. Under <b>Project Settings → Script Properties</b>, set the property name <code>ZHENLI_RELAY_SECRET</code> to that secret. Never paste it into GitHub.</p>'+
      '<p>4. Select the <code>authorizeSender</code> function, press Run and allow send-mail access. Deploy → New deployment → Web app; choose <b>Execute as: Me</b> and <b>Who has access: Anyone</b>. Copy the Web app URL ending in <code>/exec</code>.</p>'+
      '<p>5. Paste the URL and the same secret below, then choose <b>Test & connect Gmail relay</b>.</p>'+
      '<p class="muted">See the <a href="'+guide+'" target="_blank" rel="noopener noreferrer">full setup instructions</a>. The public Apps Script endpoint checks a cryptographic signature for every request.</p>'+
      '<div class="zs-actions">'+b('Generate new 64-character secret','mail-generate')+
      ' '+b('Copy secret','mail-copy')+'</div>'+
      '<form id="ns-mail-connect" autocomplete="off" class="zs-formgrid">'+
      '<label class="zs-span">Google Apps Script Web app URL (/exec)'+
      '<input name="scriptUrl" type="url" required placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off"></label>'+
      '<label class="zs-span">Shared relay secret (64 hex characters)'+
      '<input name="sharedSecret" id="ns-relay-secret" type="password" minlength="64" maxlength="64" pattern="[a-f0-9]{64}" required autocomplete="off"></label>'+
      '<button class="btn primary" type="submit">Test & connect Gmail relay</button></form>'+
      (mailStatus.connected?'<div class="zs-actions">'+b('Disconnect Gmail relay','mail-disable')+'</div>':'')+
      '<p class="fineprint">A connected relay sends invitations to each signer in turn. You may resend the current pending invitation after connecting. Google daily quotas and recipient spam filtering still apply.</p>'+
      '</section>';
  }
  function signingProgress(r){
    const done=Number.isInteger(r.signedCount)?r.signedCount:null;
    const total=Number.isInteger(r.signerCount)?r.signerCount:null;
    return done===null||total===null
      ?'—/—':e(done)+'/'+e(total);
  }
  function pdfProgress(r){
    const all=Number.isInteger(r.docCount)?r.docCount:null;
    const ready=Number.isInteger(r.signedPdfCount)?r.signedPdfCount:null;
    if(all===null)return '—';
    if(ready===null)return e(all)+' PDF'+(all===1?'':'s');
    if(!all)return '0 PDFs';
    return e(all)+' PDF'+(all===1?'':'s')+
      '<small>'+(ready===all?e(ready)+' signed PDF'+(ready===1?'':'s')+' ready':
       ready>0?e(ready)+'/'+e(all)+' signed PDFs ready':
       r.status==='finalizing'?'Finalizing signed PDFs':
       r.status==='completed'?'Signed PDFs not yet ready':
       'Awaiting completion')+'</small>';
  }
  function listView(){
    return '<div class="zs-toolbar">'+b('+ New signing request','new','','primary')+
      b('Refresh requests','refresh')+
      (totalRequests?b('Delete all signing requests','delete-all','','danger'):'')+'</div>'+
      (totalRequests?'<p class="fineprint">Delete all removes all '+totalRequests+
      ' signing requests from your active list and revokes outstanding links. Signed PDFs and audit evidence are retained securely.</p>':'')+
      mailInfo()+
      '<section class="zs-panel"><h2>Signing requests <span class="zs-count">'+totalRequests+'</span></h2>'+
      '<div class="zs-table-wrap"><table class="zs-table"><thead><tr>'+
      '<th>Company / subject</th><th>Status</th><th>Signed</th><th>PDFs</th><th>Created</th><th></th>'+
      '</tr></thead><tbody>'+
      (requests.length?requests.map(r=>'<tr>'+
        '<td><b>'+e(r.company)+'</b><small>'+e(r.subject)+'</small></td>'+
        '<td><span class="zs-tag">'+e(r.status)+'</span></td>'+
        '<td>'+signingProgress(r)+'</td>'+
        '<td>'+pdfProgress(r)+'</td>'+
        '<td>'+stamp(r.created_at)+'</td><td>'+
        b('Manage','open',r.id)+'</td></tr>').join(''):
        '<tr><td colspan="6">No signing requests found.</td></tr>')+
      '</tbody></table></div></section>';
  }

  function renderPlacement(row,index) {
    if(!detail)return '';
    const field=(name,label,min,step)=>'<label>'+label+'<input type="number" name="'+name+
      '" min="'+min+'" max="100" step="'+step+'" value="'+e(row[name])+'" required></label>';
    return '<div class="zs-placement-row" data-index="'+index+'">'+
      '<label>PDF'+select(detail.documents.map(d=>({id:d.id,label:d.name})),
        'docId',row.docId,'Select PDF')+'</label>'+
      '<label>Signer'+select(detail.signers.map(s=>({id:s.id,label:s.position+'. '+s.name})),
        'signerId',row.signerId,'Select signer')+'</label>'+
      '<label>Page<input name="page" type="number" min="1" step="1" value="'+e(row.page)+'" required></label>'+
      field('x','Left %',0,0.1)+field('y','Top %',0,0.1)+
      field('width','Width %',4,0.1)+field('height','Height %',2.5,0.1)+
      b('Remove','remove-box',String(index))+'</div>';
  }

  function detailView(){
    const r=detail,draft=r.status==='draft';
    const docs=r.documents.map(d=>'<div class="zs-doc"><span>📄 <b>'+e(d.name)+
      '</b> <small>'+e(d.pages)+' page(s) · '+
      (d.ready?'Signed PDF ready':r.status==='finalizing'?'Finalizing signed PDF':'Original PDF — awaiting final signatures')+
      '</small></span>'+
      b(d.ready?'Download signed PDF':'Download original PDF','pdf',d.id)+'</div>').join('');
    const signers=r.signers.map(s=>'<div class="zs-signer"><div><b>'+s.position+'. '+e(s.name)+
      '</b> <small>'+e(s.email)+' · '+(s.signedAt?'Signed '+stamp(s.signedAt):'Not signed')+
      ' · '+(s.signedAt?'Completed':r.status==='pending'?'Awaiting signature':'Not sent')+'</small></div>'+
      (r.status!=='draft'&&r.status!=='revoked'?b('Copy signing link','copy',s.id):'')+'</div>').join('');
    return '<div class="zs-toolbar">'+b('← All requests','refresh')+
      b('Reload details','open',r.id)+
      (['draft','pending'].includes(r.status)&&r.signers.every(s=>!s.signedAt)
        ?b('✎ Edit signing details','edit',r.id,'primary'):'')+
      (['draft','pending'].includes(r.status)
        ?b('↕ Edit signing order','order',r.id):'')+
      (r.status!=='finalizing'?b('Reset signing request','reset',r.id):'')+
      (r.status!=='completed'&&r.status!=='revoked'?b('Revoke signing links','revoke',r.id):'')+
      '</div>'+mailInfo()+'<section class="zs-panel">'+
      '<div class="zs-details-heading"><div><h2>'+e(r.company)+'</h2>'+
      '<p class="muted">'+e(r.subject)+' · '+e(r.status)+' · Expires '+stamp(r.expiresAt)+'</p></div></div>'+
      '<p class="muted">Default sender email: <b>'+e(r.senderEmail||DEFAULT_SENDER_EMAIL)+
      '</b> · Automatic delivery requires an authenticated Gmail sender connection.</p>'+
      '<p class="muted">'+e(r.note||'No signing message')+'</p>'+
      '<h3>Documents ('+r.documents.length+')</h3>'+docs+
      (r.documents.length?'':'<p class="muted">No PDFs uploaded.</p>')+
      (draft?'<label class="zs-upload">Upload PDFs (up to eight, 3 MB each)'+
        '<input id="ns-upload-pdf" type="file" accept="application/pdf,.pdf" multiple'+
        (busy?' disabled':'')+'></label>':'')+
      '<h3>Signers ('+r.signers.length+')</h3>'+signers+
      (draft?'<h3>Signature positions</h3>'+
        '<p class="muted">Choose a PDF, signer and page. Enter coordinates manually, or use the PDF preview below to tap, drag and resize a signature box.</p>'+
        '<div id="ns-placements">'+placementRows.map(renderPlacement).join('')+'</div>'+
        b('+ Add signature box','add-box')+' '+b('Save positions','save-boxes','','primary')+
        '<div class="zs-actions">'+b('Activate signing request','activate','','primary')+'</div>':'')+
      (r.status==='pending'?'<div class="zs-actions">'+b('Resend invitation to next signer','invite','','primary')+'</div>':'')+
      (r.status==='finalizing'?'<div class="zs-actions">'+b('Retry PDF finalization','finalize','','primary')+'</div>':'')+
      (draft?preview.html(r.documents,r.signers):'')+
      '<p class="fineprint">This Supabase signing workspace is independent of Tencent EdgeOne. PDF previews and placement follow the same controls as the original signing interface.</p>'+
      '</section>';
  }

  async function downloadPdf(id) {
    const blob=await getPdf(id);
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=detail.documents.find(d=>d.id===id)?.name||'document.pdf';
    document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    const finalized=detail.documents.find(d=>d.id===id)?.ready;
    feedback(finalized?'Completed signed PDF downloaded.':
      'Original PDF downloaded. Final signed PDF will be available after completion.');
  }
  async function copyLink(id) {
    if(!detail||detail.status==='draft')throw Error('Activate the request before sharing links.');
    if(detail.status==='revoked')throw Error('This signing request was revoked.');
    const link=detail.signers.find(s=>s.id===id)?.link;
    if(!link)throw Error('No signer URL was returned.');
    await navigator.clipboard.writeText(link);
    feedback('Signing link copied. The signer may sign only during their turn.');
  }
  function validatePlacements(rows) {
    if(!rows.length)throw Error('Add a signature box to the PDF preview first.');
    return rows.map((row,i)=>{
      const d=detail.documents.find(d=>d.id===row.docId);
      const s=detail.signers.find(s=>s.id===row.signerId);
      if(!d||!s||!Number.isInteger(row.page)||row.page<1||row.page>d.pages)
        throw Error('Box '+(i+1)+': Select a valid document, signer and PDF page.');
      if(![row.x,row.y,row.width,row.height].every(Number.isFinite)||
          row.x<0||row.y<0||row.width<4||row.height<2.5||
          row.x+row.width>100.00001||row.y+row.height>100.00001)
        throw Error('Box '+(i+1)+': Keep the signature rectangle within the PDF page.');
      return {
        documentId:row.docId,signerId:row.signerId,page:row.page,
        x:row.x,y:row.y,width:row.width,height:row.height
      };
    });
  }
  function syncOrderPositions(root) {
    [...root.children].forEach((row,index)=>{
      const signer=detail?.signers.find(x=>x.id===row.dataset.nsOrderId);
      const label=row.querySelector('.ns-order-position');
      if(label&&signer)label.textContent=(index+1)+'. '+signer.name;
      const select=row.querySelector('[name="orderPosition"]');
      if(select)select.value=String(index+1);
    });
  }
  function onClick(action,id,ev) {
    if(!action?.startsWith('ns-'))return false;
    action=action.slice(3);
    if(action==='refresh') {work(list);return true;}
    if(action==='delete-all'){
      if(totalRequests<1)return true;
      const count=totalRequests;
      if(!confirm('Delete ALL '+count+' signing requests from the active list? Outstanding signing links will be revoked. Completed signatures, PDFs and audit evidence will be retained securely. This cannot be undone from the DMS interface.'))return true;
      const typed=prompt('To confirm deletion of all '+count+' signing requests, type DELETE ALL exactly:');
      if(typed!=='DELETE ALL'){
        feedback('Deletion cancelled. Type DELETE ALL exactly to confirm.',true);return true;
      }
      work(async()=>{
        const result=await api('delete-all',{expectedCount:count,confirmation:typed});
        await list();
        feedback(result.deleted+' signing request(s) removed from the active list. Outstanding links revoked. Signed records and audit evidence retained.');
      });
      return true;
    }
    if(action==='mail-settings'){view='mail';message='';error=false;update();return true;}
    if(action==='mail-generate'){
      const input=document.getElementById('ns-relay-secret');
      if(!input)return true;
      const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
      input.value=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
      input.type='text';input.focus();input.select();return true;
    }
    if(action==='mail-copy'){
      const secret=document.getElementById('ns-relay-secret')?.value||'';
      if(!/^[a-f0-9]{64}$/.test(secret))
        return feedback('Generate a secret first.',true),true;
      navigator.clipboard.writeText(secret).then(()=>{
        const field=document.getElementById('ns-relay-secret');
        if(field)field.type='password';
      }).catch(()=>{const field=document.getElementById('ns-relay-secret');field?.select();});
      return true;
    }
    if(action==='mail-disable'){
      if(!confirm('Disable automatic Gmail invitations? Existing signing links and PDFs will remain unchanged.'))return true;
      work(async()=>{await api('mail-disable');mailStatus={connected:false};
        feedback('Gmail relay disconnected. Share pending signer links manually.');});
      return true;
    }
    if(action==='open'){work(()=>open(id));return true;}
    if(action==='new'){
      signerCount=2;view='new';message='';update();return true;
    }
    if(action==='edit'){
      if(!detail||detail.id!==id)return true;
      if(!['draft','pending'].includes(detail.status)||detail.signers.some(s=>s.signedAt))
        return feedback('Only drafts and requests without signatures can be edited.',true),true;
      view='edit';message='';update();return true;
    }
    if(action==='cancel-edit'){view='detail';update();return true;}
    if(action==='order'){
      if(!detail||detail.id!==id||!['draft','pending'].includes(detail.status))return true;
      view='order';message='';update();return true;
    }
    if(action==='cancel-order'){view='detail';update();return true;}
    if(action==='order-up'||action==='order-down'){
      const root=document.getElementById('ns-order-signers');
      const item=ev?.target?.closest('[data-ns-order-id]');
      if(!root||!item)return true;
      const target=action==='order-up'?item.previousElementSibling:item.nextElementSibling;
      if(!target)return true;
      const targetSigner=detail?.signers.find(s=>s.id===target.dataset.nsOrderId);
      if(targetSigner?.signedAt)return true; // Locked signed prefix
      if(action==='order-up')root.insertBefore(item,target);
      else root.insertBefore(target,item);
      syncOrderPositions(root);
      return true;
    }
    if(action==='save-order'){
      const root=document.getElementById('ns-order-signers');
      if(!root||!detail)return true;
      const signerIds=[...root.children].map(x=>x.dataset.nsOrderId);
      work(async()=>{
        const result=await api('order',{requestId:detail.id,signerIds});
        await open(result.request.id);
        feedback(result.changed?
          'Signing order saved. Signed records remain unchanged. Resend the invitation if the next signer has changed.':
          'Signing order is unchanged.');
      });
      return true;
    }
    if(action==='reset'){
      if(!detail||detail.id!==id)return true;
      if(!confirm('RESET this signing request? A NEW draft will be created with fresh signer links, the original PDFs and signature boxes. All signatures and audit history in the ORIGINAL request will be preserved. Pending original links will be revoked. Continue?'))return true;
      work(async()=>{
        const result=await api('reset',{requestId:detail.id});
        await open(result.request.id);
        feedback('New draft created from the original signing request. Original signatures and audit records are preserved. Review PDF and signature positions, then activate to issue NEW signing links.');
      });
      return true;
    }
    if(action==='add-signer'){
      const root=document.getElementById(view==='edit'?'ns-edit-signers':'ns-signers');
      if(!root)return true;
      if(root.children.length>=15){feedback('Maximum 15 sequential signers.',true);return true;}
      root.insertAdjacentHTML('beforeend',signerField(root.children.length+1,
        view==='edit'?{}:null));
      signerCount=root.children.length;return true;
    }
    if(action==='remove-signer'||action==='move-signer-up'||action==='move-signer-down'){
      const root=document.getElementById(view==='edit'?'ns-edit-signers':'ns-signers');
      const item=ev?.target?.closest('[data-ns-signer]');
      if(!root||!item)return true;
      if(action==='remove-signer'){
        if(root.children.length<=1){feedback('At least one signer is required.',true);return true;}
        item.remove();
      } else if(action==='move-signer-up'&&item.previousElementSibling)
        root.insertBefore(item,item.previousElementSibling);
      else if(action==='move-signer-down'&&item.nextElementSibling)
        root.insertBefore(item.nextElementSibling,item);
      [...root.children].forEach((element,i)=>{
        const num=element.querySelector('b');if(num)num.textContent=(i+1)+'.';
      });
      signerCount=root.children.length;return true;
    }
    if(action==='copy'){work(()=>copyLink(id));return true;}
    if(action==='pdf'){work(()=>downloadPdf(id));return true;}
    if(action==='add-box'){
      placementRows=captureRows();
      if(!detail?.documents.length)return true;
      if(placementRows.length>=80){feedback('Maximum 80 signature boxes.',true);return true;}
      const d=detail.documents[0],s=detail.signers[Math.min(placementRows.length,detail.signers.length-1)];
      placementRows.push({docId:d.id,signerId:s.id,page:1,x:55,y:75,width:30,height:8});
      update();return true;
    }
    if(action==='remove-box'){
      placementRows=captureRows();placementRows.splice(Number(id),1);update();return true;
    }
    if(action==='save-boxes'){
      try{placementRows=captureRows();const boxes=validatePlacements(placementRows);
        work(async()=>{await api('boxes',{requestId:detail.id,boxes});await open(detail.id);
          feedback('Saved '+boxes.length+' signature box(es).');});
      }catch(ex){feedback(ex.message||String(ex),true);}
      return true;
    }
    if(action==='activate'){
      if(!confirm('Activate this signing request? The first signer may receive an email immediately.'))return true;
      try{placementRows=captureRows();const boxes=validatePlacements(placementRows);
        if(!detail.signers.every(s=>boxes.some(box=>box.signerId===s.id)))
          throw Error('Place at least one signature box for every signer before activation.');
        work(async()=>{
          // Save all current manual/dragged coordinates before activating.
          await api('boxes',{requestId:detail.id,boxes});
          const response=await api('activate',{requestId:detail.id});
          await open(detail.id);
          feedback('Request activated. Invitation: '+response.email);
        });
      }catch(ex){feedback(ex.message||String(ex),true);}
      return true;
    }
    if(action==='invite'){
      work(async()=>{const result=await api('invite',{requestId:detail.id});
        feedback('Invitation: '+result.email);});return true;
    }
    if(action==='finalize'){
      work(async()=>{await api('finalize',{requestId:detail.id});await open(detail.id);
        feedback('Signed PDFs finalized.');});return true;
    }
    if(action==='revoke'){
      if(!confirm('Revoke all signing links for this Supabase signing request?'))return true;
      work(async()=>{await api('revoke',{requestId:detail.id});await open(detail.id);
        feedback('Request revoked. Existing document records remain private.');});
      return true;
    }
    return true;
  }
  function onSubmit(form) {
    if(form?.id==='ns-mail-connect'){
      const values=new FormData(form);
      const scriptUrl=String(values.get('scriptUrl')||'').trim();
      const sharedSecret=String(values.get('sharedSecret')||'').trim();
      if(!/^[0-9a-f]{64}$/.test(sharedSecret)){
        feedback('Generate or paste the exact 64-character relay secret.',true);return true;
      }
      work(async()=>{
        const result=await api('mail-connect',{scriptUrl,sharedSecret});
        mailStatus={connected:true,senderEmail:result.senderEmail};
        view='list';feedback('Gmail authorized as '+result.senderEmail+
          '. For active requests choose Resend invitation; next signers will receive automatic invites.');
      });
      return true;
    }
    const editing=form?.id==='ns-edit';
    if(form?.id!=='ns-create'&&!editing)return false;
    const data=new FormData(form);
    const root=form.querySelector(editing?'#ns-edit-signers':'#ns-signers');
    const signers=[...(root?.querySelectorAll('[data-ns-signer]')||[])].map(row=>({
      ...(editing?{id:row.dataset.signerId||''}:{}),
      name:row.querySelector('[name="ns-name"]')?.value.trim()||'',
      email:row.querySelector('[name="ns-email"]')?.value.trim()||''
    }));
    if(editing&&detail?.status==='pending'&&!confirm(
      'This request is activated. Saving will revoke ALL old signing links, return the request to Draft and require reactivation. Continue?'
    ))return true;
    work(async()=>{
      const values={
        company:data.get('company'),subject:data.get('subject'),note:data.get('note'),
        days:editing?(data.get('days')||null):Number(data.get('days')),signers
      };
      if(editing){
        const updated=await api('edit',{requestId:detail.id,...values});
        await open(updated.request.id);
        feedback(updated.linksRevoked?
          'Signing details saved. All old links are invalid. Check signature positions, then activate again and share the new links.':
          'Signing details saved. Signature boxes for removed signers were cleared.');
      } else {
        const created=await api('create',values);
        await open(created.request.id);
        feedback('Draft created. Upload PDF documents and place the signature boxes.');
      }
    });
    return true;
  }
  function changed(input) {
    if(input?.name==='orderPosition' && view==='order'){
      const root=document.getElementById('ns-order-signers');
      const row=input.closest?.('[data-ns-order-id]');
      if(!root||!row)return true;
      const targetIndex=Number(input.value)-1;
      const locked=detail?.signers.filter(s=>s.signedAt).length||0;
      if(!Number.isInteger(targetIndex)||targetIndex<locked||
          targetIndex>=root.children.length){
        feedback('Signed signers cannot be moved. Choose an available unsigned signing position.',true);
        return true;
      }
      const arranged=[...root.children].filter(x=>x!==row);
      arranged.splice(targetIndex,0,row);
      arranged.forEach(x=>root.appendChild(x));
      syncOrderPositions(root);
      return true;
    }
    if(input?.id!=='ns-upload-pdf')return false;
    const files=[...input.files];input.value='';
    if(!files.length)return true;
    work(async()=>{
      for(const file of files){
        if(file.size>3*1024*1024||!file.name.toLowerCase().endsWith('.pdf'))
          throw Error(file.name+': Only PDF files up to 3 MB are supported.');
        const encoded=await pdfAsDataUrl(file);
        await api('upload',{requestId:detail.id,filename:file.name,base64:encoded.split(',')[1]});
      }
      preview.reset();await open(detail.id);
      feedback(files.length+' PDF(s) uploaded. You can now preview each PDF and place signature boxes.');
    });
    return true;
  }
  return {
    forgetCompany(name){
      const key=String(name||'').normalize('NFKC').trim().toUpperCase();
      requests=requests.filter(r=>String(r.company||'').normalize('NFKC').trim().toUpperCase()!==key);
      if(detail&&String(detail.company||'').normalize('NFKC').trim().toUpperCase()===key){
        detail=null;view='list';preview.reset();
      }
      totalRequests=requests.length;
      initialized=false; // Force server refresh next time Signing is opened.
      update();
    },
    onClick,onSubmit,submit:onSubmit,changed,
    input:element=>{
      if(element?.closest?.('#ns-placements .zs-placement-row'))
        preview.drawBoxes(document.getElementById('zs-pdf-preview'));
    },
    render:()=>'<div class="integration-heading"><div>'+
      '<p class="eyebrow">DOCUMENT SIGNING</p><h1>Sequential Signing</h1>'+
      '<p class="muted">Administrator workspace directly inside UNICOSEC</p></div>'+
      '<span class="zs-version">Supabase Signing · EdgeOne-compatible layout</span></div>'+
      (message?'<div class="zs-message'+(error?' zs-error':'')+'" role="status">'+e(message)+'</div>':'')+
      (busy?'<div class="zs-message">Connecting to private signing service…</div>':'')+
      (view==='mail'?mailForm():view==='new'?newForm():view==='order'&&detail?orderForm():
        view==='edit'&&detail?editForm():
        view==='detail'&&detail?detailView():listView()),
    mount:()=>{
      if(!initialized&&!busy){
        initialized=true;
        work(list);
      }
      if(view==='detail'&&detail?.status==='draft')
        preview.mount(document.getElementById('zs-pdf-preview'));
    }
  };
}
