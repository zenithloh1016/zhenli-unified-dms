/* ZHENLI Native Signing — client-side PDF placement preview.
 * PDF bytes are retrieved using the existing authenticated signing API;
 * they are not uploaded elsewhere or written to browser storage.
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);
const clamp = (v, min, max) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
const decimal = value => Math.round(value * 10) / 10;

export function createPdfSignaturePreview({fetchPdf, getRows, setRow, addRow}) {
  let docId = '', signerId = '', page = 1, placeMode = false;
  let pdfDoc = null, loadedDocId = '', requestSequence = 0;

  function reset() {
    requestSequence++;
    // Cleaning up pdf.js documents is handled asynchronously by its own worker.
    const old = pdfDoc;
    pdfDoc = null; loadedDocId = ''; docId = ''; signerId = ''; page = 1; placeMode = false;
    if (old) old.destroy().catch(() => {});
  }

  function html(docs, signers) {
    if (!docs?.length || !signers?.length) return '';
    if (!docs.some(d => d.id === docId)) { docId = docs[0].id; page = 1; }
    if (!signers.some(s => s.id === signerId)) signerId = signers[0].id;
    return `<div id="zs-pdf-preview" class="zs-preview" aria-label="PDF signature placement preview">
      <div class="zs-preview-controls">
        <label>PDF document<select data-zsp="doc">${docs.map(d=>`<option value="${escapeHTML(d.id)}" ${d.id===docId?'selected':''}>${escapeHTML(d.name)}</option>`).join('')}</select></label>
        <label>Place for signer<select data-zsp="signer">${signers.map(s=>`<option value="${escapeHTML(s.id)}" ${s.id===signerId?'selected':''}>${escapeHTML(s.position)}. ${escapeHTML(s.name)}</option>`).join('')}</select></label>
        <div class="zs-preview-pager">
          <button type="button" class="btn secondary" data-zsp="prev" aria-label="Previous PDF page">←</button>
          <span data-zsp="counter">Page ${page}</span>
          <button type="button" class="btn secondary" data-zsp="next" aria-label="Next PDF page">→</button>
        </div>
        <button type="button" class="btn ${placeMode?'primary':'secondary'}" data-zsp="add" aria-pressed="${placeMode}">${placeMode?'Cancel placement':'＋ Tap PDF to add box'}</button>
      </div>
      <p class="zs-preview-help" data-zsp="instruction">${placeMode?'Tap where the signature box should start on the PDF.':'Drag a signature box to move it; drag its bottom-right handle to resize. Save positions below when finished.'}</p>
      <p class="zs-preview-status" data-zsp="status" role="status">Loading PDF preview…</p>
      <div class="zs-preview-scroll"><div class="zs-preview-paper" data-zsp="paper">
        <canvas class="zs-preview-canvas" data-zsp="canvas" aria-label="Rendered PDF page"></canvas>
        <div class="zs-preview-overlay" data-zsp="overlay"></div>
      </div></div>
      <p class="fineprint">Preview coordinates use the PDF page's top-left corner. Changes are not saved until you select “Save positions”.</p>
    </div>`;
  }

  function drawBoxes(root) {
    const overlay = root?.querySelector('[data-zsp="overlay"]');
    if (!overlay) return;
    const signerNames = new Map([...root.querySelector('[data-zsp="signer"]')?.options || []].map(o=>[o.value,o.textContent]));
    const rows = getRows();
    overlay.innerHTML = rows.map((row, index) => {
      if (row.docId !== docId || Number(row.page) !== page) return '';
      const width = clamp(Number(row.width), 4, 100), height = clamp(Number(row.height), 2.5, 100);
      const x = clamp(Number(row.x), 0, 100-width), y = clamp(Number(row.y), 0, 100-height);
      return `<div class="zs-preview-box" data-index="${index}" style="left:${x}%;top:${y}%;width:${width}%;height:${height}%" title="Drag to move">
        <span class="zs-preview-box-label">${escapeHTML(signerNames.get(row.signerId) || 'Signature')}</span>
        <span class="zs-preview-resize" data-resize="1" title="Drag to resize"></span>
      </div>`;
    }).join('');
  }

  async function draw(root) {
    const sequence = ++requestSequence;
    const status = root.querySelector('[data-zsp="status"]');
    const canvas = root.querySelector('[data-zsp="canvas"]');
    const paper = root.querySelector('[data-zsp="paper"]');
    const counter = root.querySelector('[data-zsp="counter"]');
    if (!status || !canvas || !paper) return;
    status.textContent = 'Loading PDF preview…';
    try {
      if (loadedDocId !== docId || !pdfDoc) {
        const blob = await fetchPdf(docId);
        if (sequence !== requestSequence || !root.isConnected) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (sequence !== requestSequence || !root.isConnected) return;
        const next = await pdfjs.getDocument({data:bytes}).promise;
        if (sequence !== requestSequence || !root.isConnected) {await next.destroy(); return;}
        const old = pdfDoc;
        pdfDoc = next; loadedDocId = docId;
        if (old && old !== next) old.destroy().catch(() => {});
      }
      page = clamp(page, 1, pdfDoc.numPages);
      const pdfPage = await pdfDoc.getPage(page);
      if (sequence !== requestSequence || !root.isConnected) return;
      const base = pdfPage.getViewport({scale:1});
      const usableWidth = Math.max(250, Math.min(900, root.clientWidth - 35));
      const viewport = pdfPage.getViewport({scale:usableWidth/base.width});
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(viewport.width * ratio);
      canvas.height = Math.round(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      paper.style.width = `${viewport.width}px`;
      paper.style.height = `${viewport.height}px`;
      const context = canvas.getContext('2d');
      // The canvas is redrawn on every mount; no PDF bytes are saved to localStorage.
      await pdfPage.render({canvasContext:context, viewport, transform:[ratio,0,0,ratio,0,0]}).promise;
      if (sequence !== requestSequence || !root.isConnected) return;
      counter.textContent = `Page ${page} / ${pdfDoc.numPages}`;
      status.textContent = '';
      drawBoxes(root);
    } catch (err) {
      if (sequence !== requestSequence || !root.isConnected) return;
      status.textContent = `PDF preview unavailable: ${err?.message || err}. You can still enter signature coordinates manually.`;
    }
  }

  function mount(root) {
    if (!root || root.dataset.zspMounted) return;
    root.dataset.zspMounted = '1';
    root.addEventListener('change', ev => {
      if (ev.target.matches('[data-zsp="doc"]')) {
        docId = ev.target.value; page = 1; placeMode = false; void draw(root);
      } else if (ev.target.matches('[data-zsp="signer"]')) signerId = ev.target.value;
    });
    root.addEventListener('click', ev => {
      const ctrl = ev.target.closest('button[data-zsp]');
      if (!ctrl) return;
      switch (ctrl.dataset.zsp) {
        case 'prev': if (page > 1) {page--; void draw(root);} break;
        case 'next': if (pdfDoc && page < pdfDoc.numPages) {page++; void draw(root);} break;
        case 'add':
          placeMode = !placeMode;
          ctrl.textContent = placeMode ? 'Cancel placement' : '＋ Tap PDF to add box';
          ctrl.setAttribute('aria-pressed', String(placeMode));
          ctrl.classList.toggle('primary', placeMode);
          root.querySelector('[data-zsp="instruction"]').textContent = placeMode
            ? 'Tap where the signature box should start on the PDF.'
            : 'Drag a signature box to move it; drag its bottom-right handle to resize. Save positions below when finished.';
          root.classList.toggle('zs-preview-placing', placeMode);
          break;
      }
    });
    const paper = root.querySelector('[data-zsp="paper"]');
    let dragging = null;
    paper.addEventListener('pointerdown', ev => {
      if (!pdfDoc || !paper.clientWidth || !paper.clientHeight) return;
      const box = ev.target.closest('.zs-preview-box');
      if (box) {
        if (ev.button !== 0) return;
        const index = Number(box.dataset.index);
        const row = getRows()[index];
        if (!row) return;
        dragging = {
          pointerId:ev.pointerId, index, box,
          action:ev.target.closest('[data-resize]')?'resize':'move',
          startX:ev.clientX, startY:ev.clientY, row
        };
        ev.preventDefault();
        paper.setPointerCapture(ev.pointerId);
      } else if (placeMode && ev.button === 0) {
        const rect = paper.getBoundingClientRect();
        const x = clamp(decimal((ev.clientX - rect.left)/rect.width*100), 0, 70);
        const y = clamp(decimal((ev.clientY - rect.top)/rect.height*100), 0, 92);
        placeMode = false;
        addRow({docId, signerId, page, x, y, width:30, height:8});
        // addRow triggers a DMS render, then mount() attaches to the new page.
      }
    });
    paper.addEventListener('pointermove', ev => {
      if (!dragging || dragging.pointerId !== ev.pointerId) return;
      const dx = (ev.clientX - dragging.startX)/paper.clientWidth*100;
      const dy = (ev.clientY - dragging.startY)/paper.clientHeight*100;
      const row = dragging.row;
      const next = {...row};
      if (dragging.action === 'move') {
        next.x = decimal(clamp(row.x+dx,0,100-row.width));
        next.y = decimal(clamp(row.y+dy,0,100-row.height));
      } else {
        next.width = decimal(clamp(row.width+dx,4,100-row.x));
        next.height = decimal(clamp(row.height+dy,2.5,100-row.y));
      }
      setRow(dragging.index, next);
      dragging.box.style.left = `${next.x}%`;
      dragging.box.style.top = `${next.y}%`;
      dragging.box.style.width = `${next.width}%`;
      dragging.box.style.height = `${next.height}%`;
    });
    const stop = () => {if (dragging) {dragging=null; drawBoxes(root);}};
    paper.addEventListener('pointerup', stop);
    paper.addEventListener('pointercancel', stop);
    root.classList.toggle('zs-preview-placing', placeMode);
    void draw(root);
  }

  return {html, mount, reset, drawBoxes};
}
