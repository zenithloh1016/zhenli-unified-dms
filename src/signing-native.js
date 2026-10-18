import {createPdfSignaturePreview} from './signature-preview.js'; // ZS_PDF_SIGNATURE_PREVIEW_V1_6
/* ZHENLI_DMS_NATIVE_SIGNING_V1_5
 * Administrator screens live entirely in DMS (no EdgeOne iframe, no external login).
 * Existing EdgeOne Blob request and document storage remains the system of record.
 * Bearer credentials are kept ONLY in JavaScript memory and expire after 8 hours.
 */
const API_ORIGIN='https://zhenli-sequential-signing.edgeone.cool';
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=s=>s?e(String(s).slice(0,16).replace('T',' ')):'—';
const b=(label,action,id='',style='secondary')=>`<button type="button" class="btn ${style}" data-action="zs-${action}" data-id="${e(id)}">${label}</button>`;
export function createNativeSigning({update,getCompanies}) {
  let token=''; // deliberately NOT localStorage, sessionStorage, GitHub, Supabase or cookies
  let view='login',busy=false,message='',error=false,requests=[],detail=null,placementRows=[];
  let signerCount=2;
  function feedback(msg,isError=false){message=msg;error=isError;update();}
  function resetAuth(msg='Sign in to manage your existing signing requests.'){
    token='';requests=[];detail=null;preview.reset();view='login';feedback(msg);
  }
  async function api(path,{method='GET',json,body,headers={},binary=false}={}){
    const h={'X-ZH-Request':'1',...headers};
    if(token)h.Authorization=`Bearer ${token}`;
    if(json!==undefined)h['Content-Type']='application/json';
    let res;
    try{
      const route= /^\/requests(?:\/|$)/.test(path) ? '/dms'+path : path;
      res=await fetch(`${API_ORIGIN}/api${route}`,{method,headers:h,body:json===undefined?body:JSON.stringify(json),credentials:'omit',mode:'cors',cache:'no-store',redirect:'error'});
    }catch{
      throw new Error('Cannot connect to signing API. Deploy the EdgeOne V1.5 backend patch and check DMS_ALLOWED_ORIGINS. Do not use an expired EdgeOne preview link.');
    }
    if(!res.ok){let data={};try{data=await res.json();}catch{};
      if(res.status===401 && token){resetAuth('Signing session expired. Please sign in again.');}
      throw new Error(data.error||`Signing API returned HTTP ${res.status}`);
    }
    return binary?await res.blob():await res.json();
  }
  async function work(fn){if(busy)return;busy=true;message='';update();try{await fn();}catch(ex){feedback(ex.message||String(ex),true);}finally{busy=false;update();}}
  function select(items,field,selected,placeholder){return `<select name="${field}" required>${placeholder?`<option value="">${placeholder}</option>`:''}${items.map(x=>`<option value="${e(x.id)}" ${x.id===selected?'selected':''}>${e(x.label)}</option>`).join('')}</select>`;}
  function renderPlacement(row,idx){
    if(!detail)return '';
    return `<div class="zs-placement-row" data-index="${idx}">
      <label>PDF${select(detail.docs.map(d=>({id:d.id,label:d.name})), 'docId',row.docId,'Select PDF')}</label>
      <label>Signer${select(detail.signers.map(s=>({id:s.id,label:`${s.position}. ${s.name}`})),'signerId',row.signerId,'Select signer')}</label>
      <label>Page<input type="number" name="page" min="1" step="1" value="${e(row.page)}" required></label>
      <label>Left %<input type="number" name="x" min="0" max="100" step="0.1" value="${e(row.x)}" required></label>
      <label>Top %<input type="number" name="y" min="0" max="100" step="0.1" value="${e(row.y)}" required></label>
      <label>Width %<input type="number" name="width" min="4" max="100" step="0.1" value="${e(row.width)}" required></label>
      <label>Height %<input type="number" name="height" min="2.5" max="100" step="0.1" value="${e(row.height)}" required></label>
      ${b('Remove','remove-box',String(idx))}</div>`;
  }
  // ZS_PDF_SIGNATURE_PREVIEW_V1_6: draft-only visual placement using existing API.
  const preview = createPdfSignaturePreview({
    fetchPdf: docId => api(`/requests/${detail.id}/docs/${encodeURIComponent(docId)}`, {binary:true}),
    getRows: () => captureRows(),
    setRow: (index, row) => {
      const element = document.querySelector(`.zs-placement-row[data-index="${index}"]`);
      if (!element) return;
      for (const field of ['x','y','width','height']) {
        const input = element.querySelector(`[name="${field}"]`);
        if (input) input.value = String(row[field]);
      }
    },
    addRow: row => {
      placementRows = captureRows();
      placementRows.push(row);
      update(); // Existing Save positions handler continues to own persistence.
    }
  });
  function main(){
    if(!token){return `<section class="zs-panel zs-login"><h2>Signing administrator login</h2><p class="muted">Sign in here, inside DMS, using the administrator password already configured on Tencent EdgeOne. No external site will open.</p>
    <form id="zs-login-form"><label class="input-label">Sequential Signing administrator password<input type="password" name="password" minlength="12" autocomplete="current-password" required></label><button class="btn primary" type="submit" ${busy?'disabled':''}>Sign in to Signing</button></form>
    <p class="fineprint">Your DMS account and signing administrator password are separate. This login stays inside the DMS and uses a temporary 8-hour API session. No password or token is stored on your device.</p></section>`;}
    if(view==='list')return `<div class="zs-toolbar">${b('+ New signing request','new','','primary')}${b('Refresh requests','refresh')}${b('Sign out of Signing','logout')}</div>
    <section class="zs-panel"><h2>Signing requests <span class="zs-count">${requests.length}</span></h2>
    <div class="zs-table-wrap"><table class="zs-table"><thead><tr><th>Company / subject</th><th>Status</th><th>Signed</th><th>PDFs</th><th>Created</th><th></th></tr></thead><tbody>${requests.length?requests.map(r=>`<tr><td><b>${e(r.company)}</b><small>${e(r.subject)}</small></td><td><span class="zs-tag">${e(r.status)}</span></td><td>${r.done}/${r.signers}</td><td>${r.docs}</td><td>${fmtDate(r.createdAt)}</td><td>${b('Manage','detail',r.id)}</td></tr>`).join(''):'<tr><td colspan="6">No signing requests found.</td></tr>'}</tbody></table></div></section>`;
    if(view==='new'){
      const companies=(getCompanies()||[]).map(x=>`<option value="${e(x.name)}"></option>`).join('');
      return `<div class="zs-toolbar">${b('← Back to signing requests','refresh')}</div>
      <section class="zs-panel"><h2>Create signing request</h2><p class="muted">Signer order determines who signs first. Upload PDFs and assign a signature box to every signer before activation.</p>
      <form id="zs-create-form"><div class="zs-formgrid">
      <label>Company name<input list="zs-companies" name="company" maxlength="180" required placeholder="Choose a company"></label><datalist id="zs-companies">${companies}</datalist>
      <label>Subject<input name="subject" maxlength="180" required placeholder="Board resolution signing"></label>
      <label>Expiry (days)<input type="number" name="days" min="1" max="60" value="14" required></label>
      <label class="zs-span">Signing message<textarea name="note" rows="3" maxlength="1000" placeholder="Instructions to the signers"></textarea></label></div>
      <h3>Sequential signers</h3><div id="zs-signers">${Array.from({length:signerCount},(_,i)=>signerField(i+1)).join('')}</div>
      ${b('+ Add signer','add-signer')} <button class="btn primary" type="submit" ${busy?'disabled':''}>Create draft signing request</button></form></section>`;
    }
    if(view==='edit'&&detail?.status==='draft'){
      const r=detail,companies=(getCompanies()||[]).map(x=>`<option value="${e(x.name)}"></option>`).join('');
      return `<div class="zs-toolbar">${b('← Cancel editing','cancel-edit')}</div>
      <section class="zs-panel"><h2>Edit signing request</h2><p class="muted">Draft only. Edits synchronize with the original EdgeOne website.</p>
      <form id="zs-edit-form"><div class="zs-formgrid">
      <label>Company name<input list="zs-edit-companies" name="company" maxlength="180" value="${e(r.company)}" required></label>
      <datalist id="zs-edit-companies">${companies}</datalist>
      <label>Subject<input name="subject" maxlength="180" value="${e(r.subject)}" required></label>
      <label>Link validity<select name="days"><option value="">Keep existing expiry</option><option value="7">Renew 7 days</option><option value="14">Renew 14 days</option><option value="30">Renew 30 days</option><option value="60">Renew 60 days</option></select></label>
      <label class="zs-span">Signing message<textarea name="note" rows="3" maxlength="1000">${e(r.note||'')}</textarea></label>
      </div><h3>Sequential signers</h3><p class="muted">Use Up / Down to reorder. Removing signers also removes their saved signature boxes.</p>
      <div id="zs-edit-signers">${r.signers.map((sg,i)=>editSignerField(sg,i+1)).join('')}</div>
      ${b('+ Add signer','add-edit-signer')} <button class="btn primary" type="submit" ${busy?'disabled':''}>Save draft changes</button></form></section>`;
    }
    if(view==='detail'&&detail){const r=detail;const pending=r.status==='draft';
      const docs= r.docs.map(d=>`<div class="zs-doc"><span>📄 <b>${e(d.name)}</b> <small>${d.pages} page(s)</small></span>${b('Download PDF','pdf',d.id)}${pending?b('Remove PDF','delete-draft-pdf',d.id):''}</div>`).join('');
      const signers=r.signers.map(s=>`<div class="zs-signer"><div><b>${s.position}. ${e(s.name)}</b> <small>${e(s.email)} · ${s.signedAt?'Signed '+fmtDate(s.signedAt):'Not signed'} · ${e(s.invitation||'Not sent')}</small></div>${b('Copy signing link','copy-link',s.id)}</div>`).join('');
      return `<div class="zs-toolbar">${b('← All requests','refresh')}${b('Reload details','detail',r.id)}${pending?b('✎ Edit draft','edit-draft',r.id,'primary'):''}${b('Sign out','logout')}</div>
      <section class="zs-panel"><div class="zs-details-heading"><div><h2>${e(r.company)}</h2><p class="muted">${e(r.subject)} · ${e(r.status)} · Expires ${fmtDate(r.expiry)}</p></div>${b('Download signed archive / evidence','archive')}</div>
      <p class="muted">${e(r.note||'No signing message')}</p><h3>Documents (${r.docs.length})</h3>${docs||'<p class="muted">No PDFs uploaded.</p>'}
      ${pending?`<label class="zs-upload">Upload PDFs (up to eight, 3 MB each)<input id="zs-doc-upload" type="file" accept="application/pdf,.pdf" multiple ${busy?'disabled':''}></label>`:''}
      <h3>Signers (${r.signers.length})</h3>${signers}
      ${pending?`<h3>Signature positions</h3><p class="muted">Choose the PDF, signer and page; enter percentages measured from the PDF page's top-left. Download each PDF to verify its page layout before saving. Every signer needs at least one box.</p>
      <div id="zs-placements">${placementRows.map(renderPlacement).join('')}</div>${b('+ Add signature box','add-box')} ${b('Save positions','save-boxes','','primary')}
      <div class="zs-actions">${b('Activate signing request','activate','','primary')}</div>`:''}
      ${r.status==='pending'?`<div class="zs-actions">${b('Resend invitation to next signer','invite','','primary')}</div>`:''}
      ${r.status==='finalizing'?`<div class="zs-actions">${b('Retry PDF finalization','finalize','','primary')}</div>`:''}
      ${pending?preview.html(r.docs,r.signers):''}
      <p class="fineprint">Existing signer links continue to use your Tencent EdgeOne signing service. Administrator functions are handled directly inside DMS.</p></section>`;
    }
    return '<section class="zs-panel">Loading signing workspace…</section>';
  }
  function signerField(n){return `<div class="zs-signer-input"><b>${n}.</b><label>Full name<input name="zs-name" maxlength="180" required placeholder="Signer name"></label><label>Email<input type="email" name="zs-email" required placeholder="Email address"></label>${b('Remove','remove-signer')}</div>`;}

  function editSignerField(s,n){return `<div class="zs-signer-input zs-edit-signer" data-signer-id="${e(s.id||'')}"><b>${n}.</b><label>Full name<input name="zs-edit-name" maxlength="180" required value="${e(s.name||'')}"></label><label>Email<input type="email" name="zs-edit-email" required value="${e(s.email||'')}"></label><div class="zs-edit-signer-actions">${b('↑ Up','edit-up')}${b('↓ Down','edit-down')}${b('Remove','remove-edit-signer')}</div></div>`;}
  function renumberEditedSigners(){[...document.querySelectorAll('#zs-edit-signers .zs-edit-signer')].forEach((row,i)=>row.querySelector('b').textContent=`${i+1}.`);}
  async function list(){requests=(await api('/requests')).requests||[];view='list';detail=null;update();}
  async function open(rid){const oldId=detail?.id;detail=await api('/requests/'+encodeURIComponent(rid));if(oldId!==detail.id)preview.reset();view='detail';placementRows=(detail.placements||[]).map(x=>({...x,x:+(100*x.x).toFixed(1),y:+(100*x.y).toFixed(1),width:+(100*x.width).toFixed(1),height:+(100*x.height).toFixed(1)}));update();}
  function captureRows(){
    const rows=[...document.querySelectorAll('.zs-placement-row')];
    return rows.map((el,i)=>{
      const get=k=>el.querySelector(`[name="${k}"]`)?.value;
      return {id:placementRows[i]?.id || `dms_${Date.now().toString(36)}_${i}`,docId:get('docId'),signerId:get('signerId'),page:Number(get('page')),x:Number(get('x')),y:Number(get('y')),width:Number(get('width')),height:Number(get('height'))};
    });
  }
  async function openBlob(path,filename,media='application/pdf'){
    const data=await api(path,{binary:true});
    const url=URL.createObjectURL(new Blob([data],{type:media}));
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    // Blob URLs are short-lived and contain the user's private document bytes.
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function click(action,id,target){
    if(action==='logout'){resetAuth();return;}
    if(action==='new'){signerCount=2;view='new';message='';update();return;}
    if(action==='refresh'){return work(list);}
    if(action==='add-signer'){
      const root=document.getElementById('zs-signers');if(root.children.length>=15)return feedback('Maximum 15 signers.',true);
      root.insertAdjacentHTML('beforeend',signerField(root.children.length+1));return;
    }
    if(action==='remove-signer'){
      const button=target||document.activeElement;
      const el=button?.closest('.zs-signer-input');const root=document.getElementById('zs-signers');
      if(el&&root.children.length>1){el.remove();[...root.children].forEach((row,i)=>row.querySelector('b').textContent=`${i+1}.`);}return;
    }
    if(action==='detail')return work(()=>open(id));
    if(action==='edit-draft'){
      if(detail?.status!=='draft')return feedback('Only drafts can be edited.',true);
      if(JSON.stringify(captureRows())!==JSON.stringify(placementRows)&&!confirm('Unsaved signature positions will be lost. Continue?'))return;
      view='edit';update();return;
    }
    if(action==='cancel-edit'){view='detail';update();return;}
    if(action==='add-edit-signer'){
      const root=document.getElementById('zs-edit-signers');if(!root)return;
      if(root.children.length>=15)return feedback('Maximum 15 signers.',true);
      root.insertAdjacentHTML('beforeend',editSignerField({},root.children.length+1));return;
    }
    if(['edit-up','edit-down','remove-edit-signer'].includes(action)){
      const row=target?.closest('.zs-edit-signer'),root=document.getElementById('zs-edit-signers');
      if(!row||!root)return;
      if(action==='remove-edit-signer'&&root.children.length>1)row.remove();
      if(action==='edit-up'&&row.previousElementSibling)root.insertBefore(row,row.previousElementSibling);
      if(action==='edit-down'&&row.nextElementSibling)root.insertBefore(row.nextElementSibling,row);
      renumberEditedSigners();return;
    }
    if(action==='delete-draft-pdf'){
      if(detail?.status!=='draft')return feedback('PDFs are locked after activation.',true);
      const doc=detail.docs.find(d=>d.id===id);if(!doc)return;
      if(!confirm(`Remove PDF "${doc.name}" and its saved signature positions from this draft? This cannot be undone.`))return;
      return work(async()=>{
        const result=await api(`/requests/${detail.id}/docs/${id}`,{method:'DELETE'});
        await open(detail.id);
        feedback(`PDF removed. ${result.removedPlacements} signature position(s) removed.`);
      });
    }

    if(!detail)return;
    if(action==='add-box'){
      if(!detail.docs.length)return feedback('Upload a PDF first.',true);
      placementRows=captureRows();placementRows.push({docId:detail.docs[0].id,signerId:detail.signers[0].id,page:1,x:55,y:75,width:30,height:8});update();return;
    }
    if(action==='remove-box'){
      placementRows=captureRows();placementRows.splice(Number(id),1);update();return;
    }
    // ZS_DMS_SIGNING_V1_6_1_HOTFIX: snapshot edited inputs BEFORE work() re-renders the DMS.
    if(action==='save-boxes'){
      const rows=captureRows();
      if(!rows.length)return feedback('Add a signature box before saving.',true);
      let boxes;
      try {
        boxes=rows.map((row,i)=>{
          const doc=detail.docs.find(d=>d.id===row.docId);
          const signer=detail.signers.find(s=>s.id===row.signerId);
          if(!doc||!signer||!Number.isInteger(row.page)||row.page<1||row.page>doc.pages)
            throw new Error(`Box ${i+1}: select a valid PDF, signer and page.`);
          if(![row.x,row.y,row.width,row.height].every(Number.isFinite)
             ||row.x<0||row.y<0||row.width<4||row.height<2.5
             ||row.x+row.width>100.00001||row.y+row.height>100.00001)
            throw new Error(`Box ${i+1}: signature box must fit entirely within the page.`);
          return {...row,x:row.x/100,y:row.y/100,width:row.width/100,height:row.height/100};
        });
      }catch(ex){return feedback(ex.message||String(ex),true);}
      // Preserve the edits even if the request fails. Never reset existing records.
      placementRows=rows;
      return work(async()=>{
        const result=await api(`/requests/${detail.id}/placements`,{method:'POST',json:{placements:boxes}});
        await open(detail.id);
        feedback(`Saved ${Number.isInteger(result.count)?result.count:boxes.length} signature box(es).`);
      });
    }
    if(action==='activate'){
      if(!confirm('Activate this signing request? The first signer may receive an email immediately.'))return;
      return work(async()=>{const r=await api(`/requests/${detail.id}/activate`,{method:'POST'});await open(detail.id);feedback(r.mailResult||'Signing request activated.');});
    }
    if(action==='invite')return work(async()=>{const r=await api(`/requests/${detail.id}/invite`,{method:'POST'});await open(detail.id);feedback(r.result||'Invitation attempted.',!r.ok);});
    if(action==='finalize')return work(async()=>{await api(`/requests/${detail.id}/finalize`,{method:'POST'});await open(detail.id);feedback('Finalized successfully.');});
    if(action==='pdf'){
      const doc=detail.docs.find(d=>d.id===id);
      if(doc)return work(()=>openBlob(`/requests/${detail.id}/docs/${doc.id}`,doc.name));return;
    }
    if(action==='archive')return work(()=>openBlob(`/requests/${detail.id}/archive`,`Signing-${detail.id}.zip`,'application/zip'));
    if(action==='copy-link'){
      const signer=detail.signers.find(s=>s.id===id);if(!signer)return;
      // Never share an unactivated draft link: signer PDFs are unavailable in draft state.
      if(detail.status==='draft')return feedback('This request is still a draft. Save positions for every signer and activate the request before sharing links.',true);
      try {
        if(!signer.link)throw new Error('No signing URL was returned by the API.');
        // The API sometimes returns a link with an incorrect frontend origin.
        // Rebuild only the host/path, preserving the opaque token unchanged.
        const source=new URL(signer.link,API_ORIGIN);
        const ticket=source.searchParams.get('token');
        if(source.pathname!=='/sign.html'||!ticket||!/^[A-Za-z0-9._-]{15,400}$/.test(ticket))
          throw new Error('The signing API returned an invalid signer link.');
        const canonical=new URL('/sign.html',API_ORIGIN);
        canonical.searchParams.set('token',ticket);
        await navigator.clipboard.writeText(canonical.href);
        feedback(detail.status==='pending'&&!signer.signedAt
          ? 'Signing link copied. The signer can sign only during their turn and before expiry.'
          : 'Signing link copied. Check request status before sharing.');
      }catch(ex){feedback(`Unable to copy a working signer link: ${ex.message||ex}`,true);}return;
    }
  }
  function onClick(a,id,event){if(!a.startsWith('zs-'))return false;click(a.slice(3),id,event.target.closest('[data-action]'));return true;}
  function submit(form){if(!form?.id?.startsWith('zs-'))return false;
    if(form.id==='zs-login-form'){
      const pwd=String(new FormData(form).get('password')||'');form.reset();
      work(async()=>{
        const data=await api('/dms/session',{method:'POST',json:{password:pwd}});
        token=data.token;await list();feedback('Signed in to the existing Sequential Signing workspace.');
      });return true;
    }
    if(form.id==='zs-edit-form'){
      if(detail?.status!=='draft')return false;
      const draftId=detail.id;
      const rows=[...form.querySelectorAll('.zs-edit-signer')];
      const signers=rows.map(row=>({
        id:row.dataset.signerId||undefined,
        name:row.querySelector('[name="zs-edit-name"]').value.trim(),
        email:row.querySelector('[name="zs-edit-email"]').value.trim()
      }));
      const data=new FormData(form);
      const payload={expectedUpdatedAt:detail.updatedAt||detail.createdAt,
        company:data.get('company'),subject:data.get('subject'),note:data.get('note'),signers};
      if(data.get('days'))payload.days=Number(data.get('days'));
      work(async()=>{
        const result=await api(`/requests/${draftId}`,{method:'PATCH',json:payload});
        await open(draftId);
        feedback(result.removedPlacements
          ?`Draft updated. ${result.removedPlacements} orphaned signature box(es) removed. Review positions before activation.`
          :'Draft changes saved. Review signature positions before activation.');
      });return true;
    }
    if(form.id==='zs-create-form'){
      const data=new FormData(form),names=data.getAll('zs-name'),emails=data.getAll('zs-email');
      const signers=names.map((name,i)=>({name:String(name).trim(),email:String(emails[i]||'').trim()}));
      work(async()=>{const created=await api('/requests',{method:'POST',json:{company:data.get('company'),subject:data.get('subject'),days:Number(data.get('days')||14),note:data.get('note'),signers}});await open(created.id);feedback('Draft request created. Upload documents and assign signature boxes before activating.');});return true;
    }
    return false;
  }
  function changed(input){if(input?.id!=='zs-doc-upload')return false;
    const files=[...input.files];if(!files.length)return true;
    work(async()=>{for(const f of files){if(f.size>3*1024*1024||!f.name.toLowerCase().endsWith('.pdf'))throw new Error(`${f.name}: only PDFs up to 3 MB are accepted.`);
      await api(`/requests/${detail.id}/docs`,{method:'POST',body:f,headers:{'Content-Type':'application/pdf','X-File-Name':encodeURIComponent(f.name)}});
    }await open(detail.id);feedback(`${files.length} PDF(s) uploaded successfully.`);});return true;
  }
  return {mount:()=>{if(view==='detail'&&detail?.status==='draft')preview.mount(document.getElementById('zs-pdf-preview'));},
    input:target=>{if(target?.closest?.('.zs-placement-row'))preview.drawBoxes(document.getElementById('zs-pdf-preview'));return false;},
    render:()=>`<div class="integration-heading"><div><p class="eyebrow">DOCUMENT SIGNING</p><h1>Sequential Signing</h1><p class="muted">Administrator login and signing requests directly inside ZHENLI DMS</p></div><span class="zs-version">Native Signing V1.7 Preview</span></div>
    ${message?`<div class="zs-message ${error?'zs-error':''}" role="status">${e(message)}</div>`:''}
    ${busy?'<div class="zs-message">Connecting to the private signing service…</div>':''}${main()}`,
    onClick,submit,changed};
}
