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
  let initialized=false, signerCount=2, placementRows=[];
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
    const data=await api('list');
    requests=data.requests||[];view='list';detail=null;preview.reset();update();
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
  function listView(){
    return '<div class="zs-toolbar">'+b('+ New signing request','new','','primary')+
      b('Refresh requests','refresh')+'</div>'+
      '<section class="zs-panel"><h2>Signing requests <span class="zs-count">'+requests.length+'</span></h2>'+
      '<div class="zs-table-wrap"><table class="zs-table"><thead><tr>'+
      '<th>Company / subject</th><th>Status</th><th>Signed</th><th>PDFs</th><th>Created</th><th></th>'+
      '</tr></thead><tbody>'+
      (requests.length?requests.map(r=>'<tr>'+
        '<td><b>'+e(r.company)+'</b><small>'+e(r.subject)+'</small></td>'+
        '<td><span class="zs-tag">'+e(r.status)+'</span></td>'+
        '<td>'+e(r.signedCount??'—')+'/'+e(r.signerCount??'—')+'</td>'+
        '<td>'+e(r.docCount??'—')+'</td>'+
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
      '</b> <small>'+e(d.pages)+' page(s)</small></span>'+
      b('Download PDF','pdf',d.id)+'</div>').join('');
    const signers=r.signers.map(s=>'<div class="zs-signer"><div><b>'+s.position+'. '+e(s.name)+
      '</b> <small>'+e(s.email)+' · '+(s.signedAt?'Signed '+stamp(s.signedAt):'Not signed')+
      ' · '+(s.signedAt?'Completed':r.status==='pending'?'Awaiting signature':'Not sent')+'</small></div>'+
      (r.status!=='draft'&&r.status!=='revoked'?b('Copy signing link','copy',s.id):'')+'</div>').join('');
    return '<div class="zs-toolbar">'+b('← All requests','refresh')+
      b('Reload details','open',r.id)+
      (['draft','pending'].includes(r.status)&&r.signers.every(s=>!s.signedAt)
        ?b('✎ Edit signing details','edit',r.id,'primary'):'')+
      (r.status!=='completed'&&r.status!=='revoked'?b('Revoke signing links','revoke',r.id):'')+
      '</div><section class="zs-panel">'+
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
    feedback('Document downloaded. You can also place signature boxes directly on the PDF preview.');
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
  function onClick(action,id,ev) {
    if(!action?.startsWith('ns-'))return false;
    action=action.slice(3);
    if(action==='refresh') {work(list);return true;}
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
    onClick,onSubmit,submit:onSubmit,changed,
    input:element=>{
      if(element?.closest?.('#ns-placements .zs-placement-row'))
        preview.drawBoxes(document.getElementById('zs-pdf-preview'));
    },
    render:()=>'<div class="integration-heading"><div>'+
      '<p class="eyebrow">DOCUMENT SIGNING</p><h1>Sequential Signing</h1>'+
      '<p class="muted">Administrator workspace directly inside ZHENLI DMS</p></div>'+
      '<span class="zs-version">Supabase Signing · EdgeOne-compatible layout</span></div>'+
      (message?'<div class="zs-message'+(error?' zs-error':'')+'" role="status">'+e(message)+'</div>':'')+
      (busy?'<div class="zs-message">Connecting to private signing service…</div>':'')+
      (view==='new'?newForm():view==='edit'&&detail?editForm():
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
