import {createNativeSigning} from './signing-native.js';
import {createSupabaseSigning} from './signing-supabase.js';
import { createClient } from '@supabase/supabase-js';
import readExcelFile from 'read-excel-file/browser';
import {openMasterListingWorkbook} from './master-listing-reader.js';
import {createMasterListingTab} from './master-listing-tab.js';
import {renderStatutoryDeadlines} from './statutory-deadlines.js';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {saveOrShareFile} from './file-transfer.js';
import {savePdfToAndroidFiles,validatedPdf} from './native-pdf-save.js';
import {BO_FOLDER_NAME,BO_FOLDER_SORT_ORDER,missingBeneficialOwnerFolders} from './beneficial-owners-folders.js';
import {CONSTITUTION_FOLDER_NAME,CONSTITUTION_FOLDER_SORT_ORDER,missingConstitutionFolders} from './constitution-folders.js';
import {WORKING_RESOLUTION_FOLDER_NAME,WORKING_RESOLUTION_FOLDER_SORT_ORDER,missingWorkingResolutionFolders} from './working-resolution-folders.js';
import {CHARGES_FOLDER_NAME,CHARGES_FOLDER_SORT_ORDER,missingChargesFolders} from './charges-folders.js';
import {STANDARD_FOLDER_COUNT,isExistingRegisterBookFolder} from './register-book-folders.js';
import {createRegisterBookTab} from './register-book-tab.js';
import {combinedRegisterSnapshot} from './statutory-ar-bridge.js';
import './style.css';
import {installHubBridge} from './integrated-modules.js';

const ROOT = document.getElementById('app');
const BUCKET = 'dms-private';
const SIGNING_BASE = 'https://zhenli-sequential-signing.edgeone.cool/';
const TASK_HUB_BUNDLED = new globalThis.URL('./task-hub/index.html', document.baseURI).href + '?v=20261023-eight-status-v4';
const TASK_HUB_CLOUD = new globalThis.URL('./task-hub-cloud/index.html', document.baseURI).href;
const ANNUAL_RETURN_BUNDLED = new globalThis.URL('./annual-return/index.html', document.baseURI).href;
function allowedHttpsUrl(value, expectedHost = '') {
  const url = new globalThis.URL(String(value || '').trim());
  if (url.protocol !== 'https:' || (expectedHost && url.hostname !== expectedHost)) throw new Error('Use the valid HTTPS URL for the selected app.');
  return url.href;
}
function getSigningUrl() {
  try { return allowedHttpsUrl(sessionStorage.getItem('zhenli:signing:session') || SIGNING_BASE, 'zhenli-sequential-signing.edgeone.cool'); }
  catch { return SIGNING_BASE; }
}

const rawSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
const parsedSupabaseUrl = rawSupabaseUrl ? new globalThis.URL(rawSupabaseUrl) : null;
const URL = parsedSupabaseUrl?.protocol === 'https:' && parsedSupabaseUrl.hostname.endsWith('.supabase.co') ? parsedSupabaseUrl.origin : '';
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const db = URL && KEY ? createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
}) : null;

const state = {
  user: null, companies: [], folders: [], documents: [],
  companyId: null, folderId: null, search: '', busy: false, notice: '',
  tab: 'documents', totalDocs: 0, taskFullscreen: false, signingFullscreen: false, arFullscreen: false,
  signingProvider: localStorage.getItem('zhenli:signing:provider')==='supabase'?'supabase':'edgeone',
  arSelectedCompanyId: null,
  deadlineQuery: '', deadlineKind: 'all', deadlinePeriod: 'all',
  modal: null, authMode: 'login', importData: null, importWorkbook: null, importReader: '',
  importSheet: 0, importNameCol: 0, importRegCol: -1, importStartRow: 2,
  importProgress: null, importFileName: '', importError: '',
  registerZipPreview: null, registerZipStatus: '', registerZipFilename: '',

};

const masterListingUI=createMasterListingTab({
 db,bucket:BUCKET,getUser:()=>state.user,getCompanies:()=>state.companies,
 openCompany:id=>{state.tab='documents';openCompany(id);},
 refreshCompanies:async()=>{await reloadCompanies();render();},
 notify:message=>{if(message)state.notice=message;}
});
masterListingUI.afterRender(()=>render());
const registerBookUI=createRegisterBookTab({db,getUser:()=>state.user,getCompanies:()=>state.companies});
registerBookUI.afterRender(()=>{if(state.tab==='statutory-registers')render();});
let deadlineLastCheck=0;
async function reloadStatutoryDeadlines(force=false){
  if(!state.user||state.tab!=='statutory-deadlines')return;
  if(masterListingUI.state.loading||masterListingUI.state.saving)return;
  const now=Date.now();
  if(!force&&now-deadlineLastCheck<45000)return;
  deadlineLastCheck=now;
  await masterListingUI.load(true);
}
// Other-device edits are rechecked on tab entry, focus and periodically while
// this tab is open. Dates are read from the existing private Master Listing.
setInterval(()=>{
  if(state.tab==='statutory-deadlines'&&!document.hidden)
    reloadStatutoryDeadlines().catch(error=>console.warn('Deadline refresh:',error));
},60000);
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&state.tab==='statutory-deadlines')
    reloadStatutoryDeadlines().catch(error=>console.warn('Deadline refresh:',error));
});
window.addEventListener('focus',()=>{
  if(state.tab==='statutory-deadlines')
    reloadStatutoryDeadlines().catch(error=>console.warn('Deadline refresh:',error));
});

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, m => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[m]);
const norm = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const fileSize = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const action = (label, kind, id = '', style = 'quiet') => `<button class="btn ${style}" type="button" data-action="${kind}" data-id="${esc(id)}">${label}</button>`;
const icon = name => ({ folder:'📁', document:'📄', back:'←', upload:'↑' })[name] || '•';
const currentCompany = () => state.companies.find(c => c.id === state.companyId);
const currentFolder = () => state.folders.find(f => f.id === state.folderId);
function toast(text) { state.notice = text; render(); }
function showError(e) { console.error(e); toast('Error: ' + (e?.message || String(e))); }
function check(error) { if (error) throw error; }
function busyDo(fn) { if (state.busy) return; state.busy = true; render(); Promise.resolve().then(fn).catch(showError).finally(() => { state.busy = false; render(); }); }

async function reloadCompanies() {
  const {data, error} = await db.from('companies').select('*').order('name', { ascending: true });
  check(error); state.companies = data || [];
  if (state.companyId && !state.companies.some(c=>c.id===state.companyId)) {
    state.companyId = null; state.folderId = null;
  }
}
async function reloadContent() {
  if (!state.companyId) { state.folders=[]; state.documents=[]; return; }
  const [f, d] = await Promise.all([
    db.from('folders').select('*').eq('company_id', state.companyId).order('sort_order').order('name'),
    db.from('documents').select('*').eq('company_id', state.companyId).order('name')
  ]);
  check(f.error); check(d.error);
  state.folders = f.data || []; state.documents = d.data || [];
  if (state.folderId && !state.folders.some(x=>x.id===state.folderId)) state.folderId = null;
}
const boVerifiedCompanyIds=new Set();
let boVerifiedForUser=null;
async function ensureBeneficialOwnersFolders({force=false}={}){
  const user=state.user;
  if(!user?.id)return {created:0,existing:0,failed:0};
  if(boVerifiedForUser!==user.id){boVerifiedForUser=user.id;boVerifiedCompanyIds.clear();}
  if(force)boVerifiedCompanyIds.clear();
  const pending=state.companies.filter(c=>!boVerifiedCompanyIds.has(c.id));
  let created=0,existing=0,failed=0;
  // Keep queries small and scoped to the signed-in user's portfolio.
  for(let i=0;i<pending.length;i+=80){
    const group=pending.slice(i,i+80);
    const ids=group.map(c=>c.id);
    const {data,error}=await db.from('folders')
      .select('company_id,name,parent_id').in('company_id',ids).is('parent_id',null)
      .or('name.ilike.%beneficial%,name.ilike.%ebos%').limit(1000);
    if(error)throw Error('Beneficial Owners folder check failed: '+error.message);
    const missing=missingBeneficialOwnerFolders(group,data||[]);
    const missingIds=new Set(missing.map(c=>c.id));
    for(const c of group)if(!missingIds.has(c.id)){boVerifiedCompanyIds.add(c.id);existing++;}
    // The database root-folder unique index protects against duplicate creation
    // by concurrent DMS sessions. Never modify old folders or PDFs.
    for(let k=0;k<missing.length;k+=8){
      const results=await Promise.all(missing.slice(k,k+8).map(async company=>{
        const {error:insertError}=await db.from('folders').insert({
          user_id:user.id,company_id:company.id,parent_id:null,
          name:BO_FOLDER_NAME,sort_order:BO_FOLDER_SORT_ORDER
        });
        if(!insertError)return {id:company.id,created:true};
        if(insertError.code==='23505')return {id:company.id,created:false};
        return {id:company.id,error:insertError.message};
      }));
      for(const result of results){
        if(result.error){failed++;console.warn('BO folder for company not created:',result.error);}
        else{boVerifiedCompanyIds.add(result.id);result.created?created++:existing++;}
      }
    }
  }
  return {created,existing,failed};
}

// Constitution root folders are created only when absent for the authenticated company.
const constitutionVerifiedCompanyIds=new Set();
let constitutionVerifiedForUser=null;
async function ensureConstitutionFolders({force=false}={}){
  const user=state.user;
  if(!user?.id)return {created:0,existing:0,failed:0};
  if(constitutionVerifiedForUser!==user.id){constitutionVerifiedForUser=user.id;constitutionVerifiedCompanyIds.clear();}
  if(force)constitutionVerifiedCompanyIds.clear();
  const pending=state.companies.filter(c=>!constitutionVerifiedCompanyIds.has(c.id));
  let created=0,existing=0,failed=0;
  for(let i=0;i<pending.length;i+=80){
    const group=pending.slice(i,i+80),ids=group.map(c=>c.id);
    const {data,error}=await db.from('folders')
      .select('company_id,name,parent_id').in('company_id',ids).is('parent_id',null)
      .or('name.ilike.%constitution%,name.ilike.%memorandum%,name.ilike.%articles%').limit(1000);
    if(error)throw Error('Constitution folder check failed: '+error.message);
    const missing=missingConstitutionFolders(group,data||[]);
    const missingIds=new Set(missing.map(c=>c.id));
    for(const c of group)if(!missingIds.has(c.id)){constitutionVerifiedCompanyIds.add(c.id);existing++;}
    for(let k=0;k<missing.length;k+=8){
      const results=await Promise.all(missing.slice(k,k+8).map(async company=>{
        const {error:insertError}=await db.from('folders').insert({
          user_id:user.id,company_id:company.id,parent_id:null,
          name:CONSTITUTION_FOLDER_NAME,sort_order:CONSTITUTION_FOLDER_SORT_ORDER
        });
        if(!insertError)return {id:company.id,created:true};
        if(insertError.code==='23505')return {id:company.id,created:false};
        return {id:company.id,error:insertError.message};
      }));
      for(const result of results){
        if(result.error){failed++;console.warn('Constitution folder creation failed:',result.error);}
        else{constitutionVerifiedCompanyIds.add(result.id);result.created?created++:existing++;}
      }
    }
  }
  return {created,existing,failed};
}

// Working Resolution is a separate 14th root folder; do not rename or
// repurpose the existing Board & Members' Resolution folder.
const workingResolutionVerifiedCompanyIds=new Set();
let workingResolutionVerifiedForUser=null;
async function ensureWorkingResolutionFolders({force=false}={}){
  const user=state.user;
  if(!user?.id)return {created:0,existing:0,failed:0};
  if(workingResolutionVerifiedForUser!==user.id){
    workingResolutionVerifiedForUser=user.id;
    workingResolutionVerifiedCompanyIds.clear();
  }
  if(force)workingResolutionVerifiedCompanyIds.clear();
  const pending=state.companies.filter(c=>!workingResolutionVerifiedCompanyIds.has(c.id));
  let created=0,existing=0,failed=0;
  for(let i=0;i<pending.length;i+=80){
    const group=pending.slice(i,i+80),ids=group.map(c=>c.id);
    const {data,error}=await db.from('folders')
      .select('company_id,name,parent_id').in('company_id',ids)
      .is('parent_id',null).ilike('name','%working%').limit(1000);
    if(error)throw Error('Working Resolution folder check failed: '+error.message);
    const missing=missingWorkingResolutionFolders(group,data||[]);
    const missingIds=new Set(missing.map(c=>c.id));
    for(const c of group){
      if(!missingIds.has(c.id)){workingResolutionVerifiedCompanyIds.add(c.id);existing++;}
    }
    // Concurrent sessions may race; root-level unique index prevents duplicates.
    for(let k=0;k<missing.length;k+=8){
      const results=await Promise.all(missing.slice(k,k+8).map(async company=>{
        const {error:insertError}=await db.from('folders').insert({
          user_id:user.id,company_id:company.id,parent_id:null,
          name:WORKING_RESOLUTION_FOLDER_NAME,sort_order:WORKING_RESOLUTION_FOLDER_SORT_ORDER
        });
        if(!insertError)return {id:company.id,created:true};
        if(insertError.code==='23505')return {id:company.id,created:false};
        return {id:company.id,error:insertError.message};
      }));
      for(const result of results){
        if(result.error){failed++;console.warn('Working Resolution folder creation failed:',result.error);}
        else{
          workingResolutionVerifiedCompanyIds.add(result.id);
          result.created?created++:existing++;
        }
      }
    }
  }
  return {created,existing,failed};
}


 // Charges is a separate 15th root folder. Never change existing folders,
 // charge documents, or the original statutory categories.
const chargesVerifiedCompanyIds=new Set();
let chargesVerifiedForUser=null;
async function ensureChargesFolders({force=false}={}){
  const user=state.user;
  if(!user?.id)return {created:0,existing:0,failed:0};
  if(chargesVerifiedForUser!==user.id){
    chargesVerifiedForUser=user.id;
    chargesVerifiedCompanyIds.clear();
  }
  if(force)chargesVerifiedCompanyIds.clear();
  const pending=state.companies.filter(c=>!chargesVerifiedCompanyIds.has(c.id));
  let created=0,existing=0,failed=0;
  for(let i=0;i<pending.length;i+=80){
    const group=pending.slice(i,i+80), ids=group.map(c=>c.id);
    const {data,error}=await db.from('folders')
      .select('company_id,name,parent_id').in('company_id',ids)
      .is('parent_id',null).ilike('name','%charge%').limit(1000);
    if(error)throw Error('Charges folder check failed: '+error.message);
    const missing=missingChargesFolders(group,data||[]);
    const missingIds=new Set(missing.map(c=>c.id));
    for(const c of group){
      if(!missingIds.has(c.id)){chargesVerifiedCompanyIds.add(c.id);existing++;}
    }
    // Protect concurrent sessions using the existing unique company-root index.
    for(let k=0;k<missing.length;k+=8){
      const results=await Promise.all(missing.slice(k,k+8).map(async company=>{
        const {error:insertError}=await db.from('folders').insert({
          user_id:user.id,company_id:company.id,parent_id:null,
          name:CHARGES_FOLDER_NAME,sort_order:CHARGES_FOLDER_SORT_ORDER
        });
        if(!insertError)return {id:company.id,created:true};
        if(insertError.code==='23505')return {id:company.id,created:false};
        return {id:company.id,error:insertError.message};
      }));
      for(const result of results){
        if(result.error){failed++;console.warn('Charges folder creation failed:',result.error);}
        else{
          chargesVerifiedCompanyIds.add(result.id);
          result.created?created++:existing++;
        }
      }
    }
  }
  return {created,existing,failed};
}

async function refresh() {
  await reloadCompanies();
  try{
    const bo=await ensureBeneficialOwnersFolders();
    if(bo.failed)state.notice='Beneficial Owners folders could not be created for '+bo.failed+' companies. Tap Ensure BO folders to retry.';
  }catch(error){console.warn(error);state.notice='Beneficial Owners folders need attention: '+error.message;}
  try{
    const constitution=await ensureConstitutionFolders();
    if(constitution.failed)state.notice='Constitution folders could not be created for '+constitution.failed+' companies. Tap Ensure Constitution folders to retry.';
  }catch(error){console.warn(error);state.notice='Constitution folders need attention: '+error.message;}
  try{
    const working=await ensureWorkingResolutionFolders();
    if(working.failed)state.notice='Working Resolution folders could not be created for '+working.failed+' companies. Tap Ensure Working Resolution folders to retry.';
  }catch(error){console.warn(error);state.notice='Working Resolution folders need attention: '+error.message;}
  try{
    const charges=await ensureChargesFolders();
    if(charges.failed)state.notice='Charges folders could not be created for '+charges.failed+' companies. Tap Ensure Charges folders to retry.';
  }catch(error){console.warn(error);state.notice='Charges folders need attention: '+error.message;}
  await reloadContent();
  const {count,error} = await db.from('documents').select('id',{count:'exact',head:true});
  if(!error) state.totalDocs = count || 0;
  render();
}

function folderTrail() {
  const seen = new Set(); const trail = []; let folder = currentFolder();
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id); trail.unshift(folder); folder = state.folders.find(x=>x.id===folder.parent_id);
  }
  return trail;
}


function modalHTML() {
  const m = state.modal;
  if (!m) return '';
  if (m.kind === 'import') return renderImportModal();
  const title = m.kind === 'company' ? 'Add company' : m.kind === 'folder' ? 'Create subfolder' : m.kind === 'rename' ? 'Rename' : 'Confirm permanent deletion';
  let body = '';
  if (['company','folder','rename'].includes(m.kind)) {
    const name = m.kind === 'rename' ? m.name : '';
    body = `<label class="input-label">${m.kind === 'company' ? 'Company name' : 'Name'}<input name="name" required maxlength="250" autofocus value="${esc(name)}" placeholder="${m.kind === 'company' ? 'Example Sdn Bhd' : 'Folder name'}"/></label>`;
    if (m.kind === 'company') body += `<label class="input-label">Registration number (optional)<input name="registration" maxlength="100" placeholder="e.g. 202601234567"/></label>`;
  } else {
    body = `<p>Delete <strong>${esc(m.name)}</strong>?</p><p class="alert">This permanently removes ${m.target === 'company' ? 'the company, all nested folders and ALL its uploaded files, and its matching Master Listing entry (with private backup)' : m.target === 'folder' ? 'this folder, all nested subfolders and their documents' : 'this document'}. This cannot be undone.</p>`;
  }
  return `<div class="modal-backdrop" data-action="modal-bg"><section class="modal" role="dialog" aria-modal="true" aria-label="${title}"><div class="modal-heading"><h3>${title}</h3>${action('✕','close-modal')}</div><form id="modal-form">${body}<div class="modal-actions">${action('Cancel','close-modal')}<button class="btn ${m.kind==='delete'?'danger':'primary'}" type="submit">${m.kind === 'delete' ? 'Delete permanently' : 'Save'}</button></div></form></section></div>`;
}

function renderAuth() {
  return `<div class="auth-page"><div class="auth-card"><div class="auth-logo">Z</div><p class="eyebrow">ZHENLI DOCUMENT MANAGEMENT</p><h1>Your company files, organized.</h1><p class="muted">Private, synchronized cloud storage accessible from your laptop and Android phone.</p>
  <div class="switcher">${action('Sign in', 'auth-login', '', state.authMode==='login'?'active':'quiet')}${action('Create account', 'auth-signup', '', state.authMode==='signup'?'active':'quiet')}</div>
  <form id="auth-form"><label class="input-label">Email<input name="email" type="email" autocomplete="email" required placeholder="you@company.com"></label><label class="input-label">Password<input name="password" type="password" minlength="6" autocomplete="${state.authMode==='login'?'current-password':'new-password'}" required></label><button class="btn primary full" type="submit">${state.authMode==='login'?'Sign in':'Create account'}</button></form>
  <p class="fineprint">Each account has a separate private portfolio. Sign in with the <b>same account</b> on both devices.</p>${state.notice ? `<div class="notice">${esc(state.notice)}</div>` : ''}</div></div>`;
}

function renderCompanyCard(company) {
  const count = state.companyId === company.id ? state.folders.filter(f=>f.parent_id===null&&!isExistingRegisterBookFolder(f)).length : STANDARD_FOLDER_COUNT;
  return `<div class="company-card"><button class="company-open" data-action="open-company" data-id="${company.id}"><div class="company-symbol">${icon('folder')}</div><div class="company-name">${esc(company.name)}</div><div class="company-number">${esc(company.registration_no || 'No registration number entered')}</div><div class="company-foot">Standard folders ready <span>View folders →</span></div></button><div class="card-options">${action('Annual Return','prepare-annual-return',company.id,'secondary')}${action('Rename','rename-company', company.id)}${action('Delete','delete-company',company.id)}</div></div>`;
}
function renderCompanies() {
  const q=state.search.trim().toLowerCase();
  const matches=state.companies.filter(x=>`${x.name} ${x.registration_no||''}`.toLowerCase().includes(q));
  return `<div class="content-header"><div><p class="eyebrow">CLIENT PORTFOLIO</p><h1>Companies</h1><p class="muted">${state.companies.length} companies • ${STANDARD_FOLDER_COUNT} standard folders per company</p></div><div class="header-buttons">${action('↑ Import Master Listing','import', '', 'secondary')}${action('Ensure BO folders','ensure-bo-folders','','secondary')}${action('Ensure Constitution folders','ensure-constitution-folders','','secondary')}${action('Ensure Working Resolution folders','ensure-working-resolution-folders','','secondary')}${action('Ensure Charges folders','ensure-charges-folders','','secondary')}${action('+ Add company','new-company', '', 'primary')}</div></div>
  <div class="searchbar"><span>⌕</span><input aria-label="Search companies" id="search" placeholder="Search by company name or registration number" value="${esc(state.search)}"/></div>
  ${matches.length ? `<div class="company-grid">${matches.map(renderCompanyCard).join('')}</div>` : `<div class="empty-state"><div>📁</div><h3>${q ? 'No matching companies' : 'Your company portfolio is empty'}</h3><p>${q ? 'Try another search term.' : 'Add a company or import your Excel Master Listing to create the standard folders automatically.'}</p></div>`}`;
}
function folderCard(folder) {
  const nFolders = state.folders.filter(f=>f.parent_id===folder.id).length;
  const nFiles = state.documents.filter(d=>d.folder_id===folder.id).length;
  return `<div class="item-row"><button class="item-main" type="button" data-action="open-folder" data-id="${folder.id}"><span class="item-icon folder-icon">📁</span><span class="item-details"><strong>${esc(folder.name)}</strong><small>${nFolders} folders • ${nFiles} documents</small></span><span class="item-chevron">›</span></button><div class="item-tools">${action('Rename','rename-folder',folder.id)}${action('Delete','delete-folder',folder.id)}</div></div>`;
}
function documentCard(doc) {
  // Office files use the existing Download action; no app launch or embedded editing.
  const office=/\.(?:doc|docx|docm|xls|xlsx|xlsm)$/i.test(doc.name);
  return `<div class="item-row"><button class="item-main" type="button" data-action="${office?'download-file':'view-file'}" data-id="${doc.id}"><span class="item-icon file-icon">${/\.pdf$/i.test(doc.name)?'📕':'📄'}</span><span class="item-details"><strong>${esc(doc.name)}</strong><small>${fileSize(doc.size_bytes || 0)} • ${new Date(doc.created_at).toLocaleDateString()}</small></span><span class="item-chevron">↗</span></button><div class="item-tools">${action('Download','download-file',doc.id)}${action('Rename','rename-file',doc.id)}${action('Delete','delete-file',doc.id)}</div></div>`;
}
function renderFolder() {
  const company=currentCompany(); if (!company) return renderCompanies();
  const trail=folderTrail(), current=currentFolder();
  const childFolders=state.folders.filter(f => f.parent_id === (current?.id || null) && !isExistingRegisterBookFolder(f));
  const docs=current ? state.documents.filter(d=>d.folder_id===current.id) : [];
  const crumbs = `<button type="button" data-action="home">Companies</button><span>›</span><button type="button" data-action="open-company" data-id="${company.id}">${esc(company.name)}</button>${trail.map(f=>`<span>›</span><button type="button" data-action="open-folder" data-id="${f.id}">${esc(f.name)}</button>`).join('')}`;
  return `<div class="breadcrumbs">${crumbs}</div><div class="content-header"><div><p class="eyebrow">${current?'FOLDER CONTENTS':'COMPANY DOCUMENTS'}</p><h1>${esc(current?.name||company.name)}</h1><p class="muted">${current ? `${childFolders.length} subfolders • ${docs.length} documents` : esc(company.registration_no||'Select a statutory category below')}</p></div><div class="header-buttons">${action('Generate Annual Return','prepare-annual-return',company.id,'secondary')}${action('+ New '+(current?'subfolder':'folder'),'new-folder','','secondary')}${current?action('↑ Upload documents','upload-trigger','','primary'):''}</div></div>
  ${current?`<div class="upload-zone" id="dropzone" role="button" tabindex="0"><strong>↑ Upload documents here</strong><span>Choose PDFs, Word, Excel, images, JSON or ZIP. Max 50 MB per file; upload progress and errors shown.</span></div>`:`<div class="info-strip">Your ${STANDARD_FOLDER_COUNT} standard categories, including Beneficial Owners, Constitution, Working Resolution and Charges, are shown below. Open a category to upload files or create nested folders.</div>`}
  <section class="items"><div class="section-caption">FOLDERS <span>${childFolders.length}</span></div>${childFolders.map(folderCard).join('') || '<div class="empty-line">No subfolders yet.</div>'}
  ${current ? `<div class="section-caption">DOCUMENTS <span>${docs.length}</span></div>${docs.map(documentCard).join('') || '<div class="empty-line">No documents in this folder. Upload PDFs, Word documents, Excel files or images.</div>'}` : ''}</section>`;
}
/** CSV or spreadsheet TSV paste, respecting commas and multiline quoted values. */
function parseDelimitedRows(value) {
  const input = String(value || '').replace(/^\uFEFF/, '');
  const firstLine = input.split(/\r?\n/, 1)[0];
  const delimiter = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<input.length;i++) {
    const char=input[i];
    if(quoted){
      if(char==='"' && input[i+1]==='"'){cell+='"';i++;}
      else if(char==='"') quoted=false;
      else cell+=char;
    }else if(char==='"' && cell==='') quoted=true;
    else if(char===delimiter){row.push(cell);cell='';}
    else if(char==='\r' || char==='\n'){
      if(char==='\r' && input[i+1]==='\n')i++;
      row.push(cell); if(row.some(x=>String(x).trim())) rows.push(row);
      cell='';row=[];
    }else cell+=char;
  }
  row.push(cell);if(row.some(x=>String(x).trim()))rows.push(row);
  if(quoted)throw new Error('CSV contains a quotation mark that is not closed.');
  return rows;
}
function importHint(error) {
  const message=String(error?.message || error || 'Unknown import error');
  if(/PGRST202|create_company_with_folders|schema cache/i.test(message))
    return 'Supabase function unavailable. In Supabase SQL Editor run supabase/setup.sql (the database setup script) and retry. Details: '+message;
  if(/permission denied|42501|row.level security|JWT|not authenticated/i.test(message))
    return 'Database permissions or login prevented the import. Sign in again and check the Supabase RLS policies from supabase/setup.sql. Details: '+message;
  return message;
}
async function prepareExcelImport(file){
  let firstError=null;
  try {
    const book=await openMasterListingWorkbook(file);
    const sheets=book.sheetNames.map(sheet=>({sheet,data:null}));
    const selected=book.sheetNames.indexOf(book.preferred);
    sheets[selected].data=book.readSheet(book.preferred);
    return {book,sheets,selected,reader:'Android-compatible Excel reader'};
  } catch(error){firstError=error;}
  // Certain Excel variants cannot be read by the first parser. Avoid reading
  // all worksheets at once: use the best worksheet with the bundled library.
  try {
    const info=await readExcelFile(file,{getSheets:true});
    const names=(info||[]).map(v=>v.name).filter(Boolean);
    if(!names.length)throw Error('No worksheets found in Excel file.');
    const selected=Math.max(0,names.findIndex(x=>/master\s*listing/i.test(x)));
    const readSheet=name=>readExcelFile(file,{sheet:name});
    const sheets=names.map(sheet=>({sheet,data:null}));
    sheets[selected].data=await readSheet(names[selected]);
    return {book:{readSheet},sheets,selected,reader:'Compatibility Excel reader'};
  } catch(error){
    throw new Error('Neither Excel reader could open this workbook. Main reader: '
      +(firstError?.message||'Unknown issue')+'. Compatibility reader: '+(error?.message||'Unknown issue')
      +'. Try opening the file in Excel and saving a new .xlsx copy without protection.');
  }
}
async function selectImportSheet(index){
  if(!state.importData?.[index])return;
  state.importError='';state.importProgress='Opening worksheet '+state.importData[index].sheet+'…';render();
  try{
    const entry=state.importData[index];
    if(!entry.data)entry.data=await state.importWorkbook.readSheet(entry.sheet);
    if(!Array.isArray(entry.data)||!entry.data.length)throw Error('This worksheet contains no readable rows.');
    state.importSheet=index;state.importProgress=null;autoColumns();render();
  }catch(error){
    state.importProgress=null;
    state.importError='Could not open '+state.importData[index].sheet+': '+importHint(error);
    render();
  }
}
function getImportRows() {return state.importData?.[state.importSheet]?.data || [];}
function importCandidate() {
  const rows = getImportRows(), included = [], seen = new Set(); let rejected=0;
  for (let i=Math.max(0,state.importStartRow-1);i<rows.length;i++) {
    const name = norm(String(rows[i]?.[state.importNameCol] ?? '').split(/\r?\n/)[0]);
    if (!name || name.length<3 || /^[\d\W]+$/.test(name) || /^(?:company|name|total|grand total|no\.|bil|remarks|summary|registration|number|client|sheet\d+)$/i.test(name)) { rejected++; continue; }
    const key=name.toLowerCase(); if(seen.has(key)) { rejected++; continue; }
    seen.add(key);
    const reg = state.importRegCol >= 0 ? norm(rows[i]?.[state.importRegCol]) : '';
    included.push({name, registration:reg});
  }
  return {included, rejected};
}
function autoColumns() {
  const rows=getImportRows(); let best={score:-1, name:0, reg:-1, start:1};
  for(let i=0;i<Math.min(30, rows.length);i++) {
    for(let c=0;c<(rows[i]||[]).length;c++) {
      const s=norm(rows[i][c]).toLowerCase().replace(/[\s_\-]+/g,' ');
      const match=/^(?:company(?: name| names)?|name of compan(?:y|ies)|company's name|nama syarikat|nama company|company name \(.*\)|name of client|client name|nama pelanggan|syarikat)$/.test(s) || /company name|name of compan|nama syarikat|company's name/.test(s);
      if(!match) continue;
      const score= /company name|name of compan|nama syarikat/.test(s)?5:3;
      if(score>best.score){best={score, name:c,reg:-1,start:i+2}; for(let j=0;j<(rows[i]||[]).length;j++){if(j===c)continue; const h=norm(rows[i][j]).toLowerCase(); if(/reg(?:istration)?\s*(?:no|number)|company\s*(?:no|number)|ssm\s*(?:no|number)|roc\s*(?:no|number)/i.test(h)){best.reg=j;break;}}}
    }
  }
  state.importNameCol=best.name;state.importRegCol=best.reg;state.importStartRow=best.start;
}
function colName(index) {
  let n=index+1, result='';
  while(n>0) { n--;result=String.fromCharCode(65+n%26)+result;n=Math.floor(n/26); }
  return result;
}
function columnOptions(selected, includeNone=false) {
  const rows=getImportRows(), count=Math.min(80, Math.max(1,...rows.slice(0,30).map(x=>x.length)));
  return `${includeNone?`<option value="-1" ${selected<0?'selected':''}>Not available</option>`:''}${Array.from({length:count},(_,i)=>`<option value="${i}" ${selected===i?'selected':''}>${colName(i)} — ${esc(norm(rows[Math.max(0,state.importStartRow-2)]?.[i]).slice(0,48)||'Column '+(i+1))}</option>`).join('')}`;
}
function renderImportModal() {
  const sheets=state.importData||[], rows=getImportRows(), c=importCandidate();
  return `<div class="modal-backdrop"><section class="modal import-modal" role="dialog" aria-modal="true" aria-label="Import Excel Master Listing"><div class="modal-heading"><h3>Import Excel Master Listing</h3>${action('✕','close-modal')}</div>
  <p class="muted">Import Excel (.xlsx), CSV or JSON company lists. The <strong>Master Listing</strong> worksheet is selected first and other worksheets cannot block it. Review the preview before creating folders; existing company records and files remain untouched.</p>
  <label class="input-label">1. Select file (.xlsx, .csv or .json)<input type="file" id="excel-input" accept=".xlsx,.csv,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/json"/></label>${state.importFileName?`<p class="muted">Selected: ${esc(state.importFileName)}${state.importReader?' · '+esc(state.importReader):''}</p>`:''}
  <details class="import-paste-wrap"><summary>File picker not working? Paste company names instead</summary><p class="muted">Paste rows copied from Excel, or one company name per line. Tab-separated registration numbers are also supported.</p><textarea id="import-paste" rows="5" placeholder="Company Name,Registration No.&#10;EXAMPLE SDN. BHD.,202601234567"></textarea>${action('Use pasted list','load-paste','','secondary')}</details>
  ${sheets.length ? `<div class="import-grid"><label class="input-label">Worksheet<select id="sheet-choice">${sheets.map((s,i)=>`<option value="${i}" ${state.importSheet===i?'selected':''}>${esc(s.sheet)}</option>`).join('')}</select></label><label class="input-label">Company name column<select id="name-column">${columnOptions(state.importNameCol)}</select></label><label class="input-label">Registration number column<select id="registration-column">${columnOptions(state.importRegCol,true)}</select></label><label class="input-label">First data row (1-based)<input id="start-row" type="number" min="1" max="${Math.max(rows.length,1)}" value="${state.importStartRow}"/></label></div>
  <div class="import-preview"><strong>Selected file preview</strong><div class="preview-scroll"><table><tbody>${rows.slice(0,8).map((row,i)=>`<tr><td class="rowno">${i+1}</td>${row.slice(0,9).map(cell=>`<td>${esc(norm(cell).slice(0,55))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>
  <div class="import-summary"><strong>${c.included.length} unique company names found</strong><span>${c.rejected} empty / duplicate / skipped rows</span><small>First names: ${esc(c.included.slice(0,5).map(x=>x.name).join(' • ')||'None')}</small></div>` : `<div class="info-strip">Your Master Listing stays on your device; only the company names and selected registration numbers are uploaded to your private database.</div>`}
  ${state.importProgress?`<div class="notice">${esc(state.importProgress)}</div>`:''}
  ${state.importError?`<div class="alert">${esc(state.importError)}</div>`:''}
  <div class="modal-actions">${action('Cancel','close-modal')}<button class="btn primary" data-action="run-import" type="button" ${!c.included.length || state.busy?'disabled':''}>Create company folders (${c.included.length})</button></div></section></div>`;
}
function renderOverview() {
  return `<div class="intro"><p class="eyebrow">YOUR SECRETARIAL WORKSPACE</p><h1>Overview</h1><p class="muted">Company documents, statutory work and signing in one place.</p></div>
  <section class="metrics">
    <button class="metric" data-action="tab-documents"><span>📁</span><strong>${state.companies.length}</strong><small>Companies</small></button>
    <button class="metric" data-action="tab-documents"><span>📄</span><strong>${state.totalDocs}</strong><small>Uploaded documents</small></button>
    <button class="metric" data-action="tab-tasks"><span>✓</span><strong>Task Hub</strong><small>Open existing tasks</small></button>
    <button class="metric" data-action="tab-annual-return"><span>📑</span><strong>Annual Return</strong><small>Generate bilingual PDF</small></button>
    <button class="metric" data-action="tab-signing"><span>✍️</span><strong>Signing</strong><small>EdgeOne workspace</small></button>
  </section>
  <section class="info-panel"><h2>Welcome to your private workspace</h2><p>Import your full Excel Master Listing under <b>Master Listing</b>, manage deadlines and tasks under <b>Tasks</b>, and access signing requests under <b>Signing</b>, and prepare review PDFs under <b>Annual Return</b>.</p><div class="quick-actions">${action('View company folders','tab-documents','','primary')}${action('Master Listing','tab-master-listing','','secondary')}${action('Open Task Hub','tab-tasks','','secondary')}${action('Annual Return PDFs','tab-annual-return','','secondary')}${action('Open Signing','tab-signing','','secondary')}</div></section>`;
}
function sendAnnualReturnCompanyList(){
 const frame=ROOT.querySelector('#zh-annual-return-frame');
 if(!frame||!state.user)return;
 const companies=state.companies.slice(0,5000).map(c=>({
  id:String(c.id),name:String(c.name||''),registrationNo:String(c.registration_no||'')
 }));
 frame.contentWindow?.postMessage({type:'ZHENLI_DMS_AR_COMPANY_LIST',companies,userId:String(state.user.id)},window.location.origin);
}
function sendAnnualReturnCompany(){
 const frame=ROOT.querySelector('#zh-annual-return-frame');
 const company=state.companies.find(c=>c.id===state.arSelectedCompanyId);
 if(!frame||!company||!state.user)return;
 frame.contentWindow?.postMessage({type:'ZHENLI_DMS_AR_SELECT_COMPANY',company:{
  id:String(company.id),name:String(company.name||''),registrationNo:String(company.registration_no||'')
 }},window.location.origin);
}
function renderAnnualReturn(){
 return '<section id="zh-ar-shell" class="annual-return-module '+(state.arFullscreen?'ar-fullscreen-open':'')+'" aria-label="Annual Return PDF generator">'+
 '<div class="ar-fullscreen-toolbar"><strong>📑 Annual Return PDF Generator</strong><button type="button" class="btn secondary" data-action="exit-ar-fullscreen">Exit full screen ✕</button></div>'+
 '<div class="ar-module-inner">'+
 '<div class="integration-heading"><div><p class="eyebrow">STATUTORY PARTICULARS REVIEW · V1.8</p>'+
 '<h1>Annual Return PDF Generator</h1>'+
 '<p class="muted">Choose any existing company from the complete Documents company dropdown inside Company Details; registration number fills automatically. Complete the statutory particulars and save your bilingual PDF.</p></div>'+
 '<div class="header-buttons"><button type="button" class="btn secondary" data-action="open-ar-fullscreen">Full-screen view ⛶</button></div></div>'+
 '<div class="integration-info">Drafts save locally on this device under the current DMS user and company. Resume Draft reopens your work. No cloud draft synchronisation. The full-screen button will not reload this form.</div>'+
 '<div class="ar-frame-shell"><iframe id="zh-annual-return-frame" title="ZHENLI Annual Return PDF Generator V1.8" src="'+esc(ANNUAL_RETURN_BUNDLED)+'" class="ar-integration-frame" loading="eager" allow="web-share; fullscreen" allowfullscreen></iframe></div>'+
 '</div></section>';
}
function setAnnualReturnFullscreen(open){
 state.arFullscreen=Boolean(open);
 const shell=ROOT.querySelector('#zh-ar-shell');
 shell?.classList.toggle('ar-fullscreen-open',state.arFullscreen);
 document.body.classList.toggle('zh-ar-fullscreen-open',state.arFullscreen);
 shell?.querySelector('#zh-annual-return-frame')?.contentWindow?.postMessage({type:'ZHENLI_DMS_AR_FULLSCREEN_STATE',open:state.arFullscreen},window.location.origin);
 // Do not call render(): it would reload the iframe and interrupt editing.
 shell?.querySelector('[data-action="'+(state.arFullscreen?'exit-ar-fullscreen':'open-ar-fullscreen')+'"]')?.focus({preventScroll:true});
}
function renderTasks(){
  // Reuse the original Task Hub implementation in the signed-in DMS iframe.
  // Standalone is served on this same GitHub Pages origin; both read and
  // write the existing row-level-secured Supabase task_hub_state records.
  return `<div class="integration-heading"><div><p class="eyebrow">SECRETARIAL TASK MANAGER</p><h1>Task Hub</h1>
    <p class="muted">Your company-secretarial Task Hub is connected directly to your private Supabase account.</p></div>
    <div class="header-buttons">${action('Full-screen view','open-tasks','','secondary')}</div></div>
    <div class="integration-info">Supabase cloud sync is enabled using your existing DMS login and private Task Hub records.
      Task creation, company tasks, checklists, recurring tasks, Kanban, calendar and Master Listing import all use the same original layout.
      Previously saved tasks and company records are retained. Export a Task Hub JSON backup before replacing or importing any records.</div>
    <div class="frame-shell ${state.taskFullscreen?'task-expanded':''}">${state.taskFullscreen?'<div class="frame-toolbar"><strong>Task Hub</strong><button type="button" class="btn secondary" data-action="exit-tasks">Exit full screen ✕</button></div>':''}
    <iframe id="zh-task-frame" class="integration-frame" title="ZHENLI Secretarial Task Hub · Supabase" src="${esc(TASK_HUB_BUNDLED)}" loading="lazy" referrerpolicy="same-origin"></iframe></div>`;
}
// ZHENLI_SIGNING_COOKIE_SAFE_LAUNCH_V1_2
// ZHENLI_SIGNING_DIRECT_LAUNCH_V1_3
// ZHENLI_DMS_NATIVE_SIGNING_V1_5
const signingUI=createNativeSigning({update:()=>render(),getCompanies:()=>state.companies});
const signingSupabaseUI=createSupabaseSigning({db,getCompanies:()=>state.companies,update:()=>render()});
// Same contained full-screen layout as Task Hub. Preserve the native signing DOM
// on toggle so unsaved PDF placements and request fields are never discarded.
function renderSigning(){
  return `<section id="zh-signing-shell" class="signing-frame-shell ${state.signingFullscreen?'signing-expanded':''}" aria-label="ZHENLI Sequential Signing workspace">
    <div class="signing-fullscreen-toolbar">
      <strong>✍️ Sequential Signing</strong>
      ${action('Exit full screen ✕','exit-signing-fullscreen','','secondary')}
    </div>
    <div class="signing-workspace">
      <div class="signing-fullscreen-launch">${action('Full-screen view','open-signing-fullscreen','','secondary')}</div>
      <div class="zs-toolbar" aria-label="Signing service options">
        <button type="button" class="btn ${state.signingProvider==='supabase'?'primary':'secondary'}" data-action="signing-provider" data-id="supabase">Supabase signing (independent)</button>
        <button type="button" class="btn ${state.signingProvider==='edgeone'?'primary':'secondary'}" data-action="signing-provider" data-id="edgeone">Existing Tencent EdgeOne</button>
      </div>
      ${state.signingProvider==='supabase'?signingSupabaseUI.render():signingUI.render()}
    </div>
  </section>`;
}
function setSigningFullscreen(open){
  state.signingFullscreen=Boolean(open);
  const shell=ROOT.querySelector('#zh-signing-shell');
  shell?.classList.toggle('signing-expanded',state.signingFullscreen);
  document.body.classList.toggle('zh-signing-fullscreen-open',state.signingFullscreen);
  const actionName=state.signingFullscreen?'exit-signing-fullscreen':'open-signing-fullscreen';
  shell?.querySelector('[data-action="'+actionName+'"]')?.focus({preventScroll:true});
}

function render() {
  document.body.classList.toggle('zh-signing-fullscreen-open',!!(state.user && state.tab==='signing' && state.signingFullscreen));
  document.body.classList.toggle('zh-ar-fullscreen-open',!!(state.user && state.tab==='annual-return' && state.arFullscreen));
  if (!db) { ROOT.innerHTML=`<div class="auth-page"><div class="auth-card"><div class="auth-logo">Z</div><h1>Set up private workspace</h1><p>Connect a Supabase project to enable authenticated documents and synced company folders.</p><p class="muted">Follow START_HERE.md in the downloadable source package. The Task Hub and Signing code is already bundled.</p></div></div>`;return; }
  if (!state.user) {ROOT.innerHTML=renderAuth();return;}
  const tabs = ['overview','documents','master-listing','statutory-registers','statutory-deadlines','tasks','annual-return','signing'];
  const label = {overview:'Overview',documents:'Documents','master-listing':'Master Listing','statutory-registers':'Statutory Registers','statutory-deadlines':'Statutory Deadlines',tasks:'Tasks','annual-return':'Annual Return',signing:'Signing'};
  ROOT.innerHTML = `<div class="app-shell"><header class="topbar"><div class="top-title">Document Management System</div><div class="top-right"><span class="online-dot"></span> Private workspace</div></header>
    <nav class="tabbar" aria-label="Main workspace navigation">${tabs.map(t=>`<button type="button" class="tab ${state.tab===t?'current':''}" data-action="tab-${t}" ${state.tab===t?'aria-current="page"':''}>${label[t]}</button>`).join('')}</nav>
    <main class="main-content">${state.tab==='documents'?(state.companyId?renderFolder():renderCompanies()):state.tab==='overview'?renderOverview():state.tab==='master-listing'?masterListingUI.render():state.tab==='statutory-registers'?registerBookUI.render():state.tab==='statutory-deadlines'?renderStatutoryDeadlines(masterListingUI.state.userId===state.user?.id?masterListingUI.model:null,{query:state.deadlineQuery,kind:state.deadlineKind,period:state.deadlinePeriod,loading:masterListingUI.state.loading,error:masterListingUI.state.error}):state.tab==='tasks'?renderTasks():state.tab==='annual-return'?renderAnnualReturn():renderSigning()}</main>
    <footer class="app-footer"><span>ZHENLI DMS V1.2 · Add Company · Web + Android</span><span>${esc(state.user.email || '')} · ${action('Sign out','sign-out')}</span></footer></div>
  ${state.notice ? `<div class="toast" role="status">${esc(state.notice)} ${action('✕','dismiss')}</div>` : ''}
  ${state.busy ? '<div class="busy-bar">Working… please keep this page open</div>' : ''}
  ${modalHTML()}
  <input id="document-upload" type="file" multiple hidden />`;
  if(state.tab==='signing') (state.signingProvider==='supabase'?signingSupabaseUI:signingUI).mount();
   if(state.tab==='annual-return'){
     ROOT.querySelector('#zh-annual-return-frame')?.addEventListener('load',()=>{sendAnnualReturnCompanyList();sendAnnualReturnCompany();},{once:true});
   }
}

function openCompany(id){state.companyId=id;state.folderId=null;state.search='';busyDo(reloadContent);}
function openFolder(id){state.folderId=id;render();}
function getDocument(id){return state.documents.find(d=>d.id===id);}
function getFolder(id){return state.folders.find(f=>f.id===id);}

async function removeObjects(paths) {
  for(let i=0;i<paths.length;i+=100){
    const {error}=await db.storage.from(BUCKET).remove(paths.slice(i,i+100));check(error);
  }
}
function descendants(folderId, folderList = state.folders) {
  const all = new Set([folderId]);let changed=true;
  while(changed){changed=false;for(const f of folderList){if(f.parent_id && all.has(f.parent_id) && !all.has(f.id)){all.add(f.id);changed=true;}}}
  return all;
}
async function deleteTarget(m) {
  if (m.target==='file') {
    const d=getDocument(m.id);if(!d)return;
    await removeObjects([d.storage_path]);
    const {error}=await db.from('documents').delete().eq('id',m.id);check(error);
  } else if (m.target==='folder') {
    const [freshFolders, freshDocs] = await Promise.all([
      db.from('folders').select('id,parent_id').eq('company_id',state.companyId),
      db.from('documents').select('folder_id,storage_path').eq('company_id',state.companyId)
    ]);
    check(freshFolders.error); check(freshDocs.error);
    const ids=descendants(m.id,freshFolders.data||[]);
    const paths=(freshDocs.data||[]).filter(d=>ids.has(d.folder_id)).map(d=>d.storage_path);
    await removeObjects(paths);
    const {error}=await db.from('folders').delete().eq('id',m.id);check(error);
  } else {
    // Capture the original identity before deleting the Documents company.
    const {data:deletedCompany,error:lookupError}=await db.from('companies')
      .select('id,name,registration_no').eq('id',m.id).single();check(lookupError);
    const {data,error}=await db.from('documents').select('storage_path').eq('company_id',m.id);check(error);
    await removeObjects((data||[]).map(d=>d.storage_path));
    const {error:e}=await db.from('companies').delete().eq('id',m.id);check(e);
    if(state.companyId===m.id){state.companyId=null;state.folderId=null;}
    await reloadCompanies();
    let message='Company Documents deleted.';
    try {
      const result=await masterListingUI.removeDeletedCompany(deletedCompany,state.companies);
      message+=result.removed?' Matching Master Listing row removed and backed up.':
        ' Master Listing: '+(result.reason||'No matching entry found.');
    }catch(syncError){
      message+=' Master Listing removal failed: '+String(syncError?.message||syncError)+
        '. Your Documents company was deleted, but Master Listing sync could not finish. Check your connection and contact the DMS administrator before deleting another company.';
    }
    state.modal=null;await refresh();toast(message);
    return;
  }
  state.modal=null;await refresh();toast('Deleted permanently.');
}
async function uploadFiles(files) {
  if(!state.folderId||!state.user){toast('Open a company folder before uploading documents.');return;}
  const folderId=state.folderId,companyId=state.companyId,userId=state.user.id;
  const existing=new Set(state.documents.filter(d=>d.folder_id===folderId).map(d=>d.name+'|'+(d.size_bytes||0)));
  let saved=0,skipped=0;const failed=[];
  try{
    for(const [i,file] of files.entries()){
      state.notice='Uploading '+(i+1)+'/'+files.length+': '+file.name+'…';render();
      if(!file||!file.size){failed.push((file?.name||'Unnamed')+': empty file');continue;}
      if(file.size>50*1024*1024){failed.push(file.name+': exceeds the 50 MB limit');continue;}
      if(file.name.length>240){failed.push('Filename exceeds 240 characters');continue;}
      const fingerprint=file.name+'|'+file.size;
      if(existing.has(fingerprint)){skipped++;continue;}
      const path=userId+'/'+companyId+'/'+crypto.randomUUID();
      try{
        const {error:uploadErr}=await db.storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});check(uploadErr);
        const {error}=await db.from('documents').insert({user_id:userId,company_id:companyId,folder_id:folderId,
          name:file.name,storage_path:path,size_bytes:file.size,mime_type:file.type||null});
        if(error){await db.storage.from(BUCKET).remove([path]).catch(()=>{});throw error;}
        saved++;existing.add(fingerprint);
      }catch(err){failed.push(file.name+': '+(err.message||String(err)));}
    }
  }finally{await reloadContent().catch(console.error);}
  if(failed.length)toast(saved+' uploaded, '+skipped+' duplicates skipped, '+failed.length+' failed: '+failed.slice(0,2).join(' | ')+'. Check your folder and retry failed files.');
  else toast(saved+' uploaded successfully'+(skipped?'; '+skipped+' identical duplicate(s) skipped':'')+'. Saved in this company folder.');
}
async function openDocument(id, download=false, blankTab=null) {
  const d=getDocument(id);if(!d){blankTab?.close();return;}
  try {
    const {data,error}=await db.storage.from(BUCKET).createSignedUrl(d.storage_path,120, download?{download:d.name}:{});check(error);
    if(Capacitor.isNativePlatform()){
      if(download && (d.size_bytes||0)<=25*1024*1024){
        const response=await fetch(data.signedUrl,{cache:'no-store'});
        if(!response.ok)throw Error('Cannot retrieve document for saving (HTTP '+response.status+').');
        const saved=await saveOrShareFile(await response.blob(),d.name,{preferShare:true});
        toast(saved.method==='cancelled'?'Save cancelled. Tap Download to try again.':'Choose Files or Drive in the Android share sheet to keep this document.');
      }else {
        await Browser.open({url:data.signedUrl});
        if(download)toast('Opened in your browser. Use its Download option; check Android Files → Downloads.');
      }
    }else if(blankTab){
      blankTab.location.replace(data.signedUrl);
      if(download)toast('Download started in a browser tab. Look for '+d.name+' in browser Downloads.');
    }else{
      const a=document.createElement('a');a.href=data.signedUrl;a.target='_blank';a.rel='noopener noreferrer';a.click();
    }
  }catch(err){blankTab?.close();throw err;}
}
async function runImport() {
  const chosen=importCandidate().included;
  if(!chosen.length) throw new Error('No valid names found. Check worksheet and column mapping.');
  if(chosen.length>5000) throw new Error('Import is limited to 5,000 companies per file. Split the Master Listing into smaller files.');
  state.importError=''; state.importProgress=`Starting import of ${chosen.length} companies…`;render();
  let done=0, failures=[];
  const succeededCompanies=[];
  for(let i=0;i<chosen.length;i+=4){
    const chunk=chosen.slice(i,i+4);
    const answers=await Promise.all(chunk.map(async c=> {
      try {
        const {error}=await db.rpc('create_company_with_folders',{p_name:c.name,p_registration_no:c.registration});
        return {company:c,error:error ? `${c.name}: ${importHint(error)}` : null};
      } catch(e){return {company:c,error:`${c.name}: ${importHint(e)}`};}
    }));
    const failed=answers.filter(x=>x.error).map(x=>x.error);
    succeededCompanies.push(...answers.filter(x=>!x.error).map(x=>({name:x.company.name,registration_no:x.company.registration})));
    failures.push(...failed);done+=chunk.length;
    state.importProgress=`Processed ${done} of ${chosen.length} company names; ${failures.length} errors so far.`;
    render();
    // Missing RPC/policies will affect every row; stop early instead of making 85 doomed requests.
    if(i===0 && failed.length===chunk.length){break;}
  }
  await refresh();
  let listingStatus='';
  if(succeededCompanies.length){
    try{
      const result=await masterListingUI.syncDocumentCompanies(succeededCompanies);
      listingStatus=' Master Listing: '+result.added+' new, '+result.existing+' already listed.';
    }catch(error){
      listingStatus=' Master Listing sync failed: '+String(error?.message||error)+'. Use Master Listing → Sync from Documents to retry.';
    }
  }

  if(failures.length){
    state.importError=`Imported or verified ${done-failures.length} of ${done} attempted companies. ${failures.length} failed. ${failures.slice(0,3).join(' | ')}. Your selected data is preserved; fix the error and retry safely.${listingStatus}`;
    state.importProgress=`Import paused. ${state.companies.length} companies are currently in your account.`;
    render();return;
  }
  state.importData=null;state.modal=null;state.importProgress=null;state.importError='';
  toast(`${done} companies processed successfully. Existing companies were not duplicated; standard folders were ensured.${listingStatus}`);
}

ROOT.addEventListener('click', event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const a=button.dataset.action,id=button.dataset.id;
  if(masterListingUI.onClick(a,id))return;
  if(a==='signing-provider'){if(id==='supabase'||id==='edgeone'){state.signingProvider=id;localStorage.setItem('zhenli:signing:provider',id);render();}return;}
  if(signingSupabaseUI.onClick(a,id,event))return;
  if(signingUI.onClick(a,id,event))return;
  if(a==='rb-refresh'){busyDo(()=>registerBookUI.load(true));return;}
  if(a==='sr-pick'){ROOT.querySelector('#sr-zip-input')?.click();return;}
  if(a==='sr-open'){busyDo(()=>registerBookUI.openCompany(id));return;}
  if(a==='sr-save'){busyDo(()=>registerBookUI.save());return;}
  if(a==='sr-history'){busyDo(()=>registerBookUI.openHistory());return;}
  if(a==='sr-history-preview'){busyDo(()=>registerBookUI.previewHistory(id));return;}
  if(a==='sr-history-restore'){busyDo(()=>registerBookUI.restoreHistory());return;}
  if(a==='sr-discard'){busyDo(()=>registerBookUI.discardUnsaved());return;}
  if(a==='sr-import'){busyDo(()=>registerBookUI.importZip());return;}
  if(a==='sr-pdf'){busyDo(()=>registerBookUI.pdf());return;}
  if(a==='sr-pdf-combined'){busyDo(()=>registerBookUI.pdf({combined:true}));return;}
  if(registerBookUI.command(a,id))return;
  if(a==='deadline-refresh'){reloadStatutoryDeadlines(true).catch(showError);return;}
  if(a==='deadline-open-master'){
    state.tab='master-listing';render();
    void (async()=>{
      await reloadCompanies();
      await masterListingUI.reconcileOrphanedCompanies(state.companies);
    })().catch(showError);return;
  }
  if(a==='deadline-edit'){
    const index=Number(id);
    if(!Number.isSafeInteger(index)||index<0||index>=(masterListingUI.model?.rows?.length||0))return;
    state.tab='master-listing';render();
    masterListingUI.onClick('ml-edit',String(index));return;
  }
  if(a==='deadline-clear'){
    state.deadlineQuery='';state.deadlineKind='all';state.deadlinePeriod='all';
    render();return;
  }
  if(a==='modal-bg' && event.target===button){state.modal=null;render();return;}
  if(a==='dismiss'){state.notice='';render();return;}
  if(a==='close-modal' && !state.busy){state.modal=null;state.importData=null;render();return;}
  if(state.busy) return;
  if(a.startsWith('tab-')){
    const nextTab=a.slice(4);
    // Drafts are saved as edits are made; no JSON export is needed before switching modules.
    if(state.tab==='statutory-registers' && nextTab!=='statutory-registers' && !registerBookUI.canLeave())return;
    state.tab=nextTab;if(state.tab!=='signing')state.signingFullscreen=false;if(state.tab!=='annual-return')state.arFullscreen=false;render();
    if(nextTab==='master-listing'){
      // Reload the authoritative Documents companies before reconciling
      // historical deletions. Orphan cleanup never affects imported-only rows.
      void (async()=>{
        await reloadCompanies();
        await masterListingUI.reconcileOrphanedCompanies(state.companies);
      })().catch(showError);
    }
    if(nextTab==='statutory-registers')registerBookUI.load().catch(showError);
    if(nextTab==='statutory-deadlines')reloadStatutoryDeadlines(true).catch(showError);
    return;
  }
  if(a==='prepare-annual-return'||a==='select-ar-company'){
     const company=state.companies.find(c=>c.id===id);
     if(!company)return toast('Company no longer exists in the Documents list.');
     state.arSelectedCompanyId=id;
     if(a==='prepare-annual-return'){state.tab='annual-return';state.signingFullscreen=false;state.arFullscreen=false;render();}
     else{sendAnnualReturnCompany();}
     return;
   }
   if(a==='open-ar-fullscreen'||a==='exit-ar-fullscreen'){if(state.tab==='annual-return')setAnnualReturnFullscreen(a==='open-ar-fullscreen');return;}
   if(a==='open-signing-fullscreen'||a==='exit-signing-fullscreen'){
    if(state.tab==='signing')setSigningFullscreen(a==='open-signing-fullscreen');
    return;
  }
  if(a==='clear-signing'){sessionStorage.removeItem('zhenli:signing:session');render();return;}
  if(a==='open-tasks'||a==='exit-tasks'){
    state.taskFullscreen = a==='open-tasks';render();return;
  }
  if(a==='open-signing'||a==='launch-cloud-task'){
    const url=a==='open-signing'?getSigningUrl():TASK_HUB_CLOUD;
    if(a==='open-signing'){
      const time = new globalThis.URL(url).searchParams.get('eo_time');
      if(time && /^\d{10}$/.test(time) && Number(time)*1000 < Date.now()){
        toast('Your temporary EdgeOne access link has expired. Paste a fresh link from the EdgeOne console and try again.');
        return;
      }
    }
    if(Capacitor.isNativePlatform()) busyDo(()=>Browser.open({url}));
    else window.open(url,'_blank','noopener,noreferrer');
    return;
  }
  if(a==='auth-login'||a==='auth-signup'){state.authMode=a==='auth-login'?'login':'signup';state.notice='';render();return;}
  if(a==='sign-out'){busyDo(async()=>{check((await db.auth.signOut()).error);masterListingUI.reset();registerBookUI.reset();state.user=null;state.companies=[];state.companyId=null;state.notice='';state.signingFullscreen=false;state.arFullscreen=false;});return;}
  if(a==='home'){state.tab='documents';state.companyId=null;state.folderId=null;state.search='';render();return;}
  if(a==='open-company'){openCompany(id);return;}
  if(a==='open-folder'){openFolder(id);return;}
  if(a==='ensure-charges-folders'){
    busyDo(async()=>{
      await reloadCompanies();
      const report=await ensureChargesFolders({force:true});
      await reloadContent();
      if(report.failed)throw Error('Created '+report.created+' Charges folders; '+report.failed+' failed. Retry or check Supabase folder permissions.');
      toast('Charges folders ready: '+report.created+' created, '+report.existing+' already present. Existing company documents untouched.');
    });
    return;
  }
  if(a==='ensure-working-resolution-folders'){
    busyDo(async()=>{
      await reloadCompanies();
      const report=await ensureWorkingResolutionFolders({force:true});
      await reloadContent();
      if(report.failed)throw Error('Created '+report.created+' Working Resolution folders; '+report.failed+' failed. Retry or check Supabase folder permissions.');
      toast('Working Resolution folders ready: '+report.created+' created, '+report.existing+' already present. Existing company documents untouched.');
    });
    return;
  }
  if(a==='ensure-constitution-folders'){
    busyDo(async()=>{
      await reloadCompanies();
      const report=await ensureConstitutionFolders({force:true});
      await reloadContent();
      if(report.failed)throw Error('Created '+report.created+' Constitution folders; '+report.failed+' failed. Retry or check Supabase folder permissions.');
      toast('Constitution folders ready: '+report.created+' created, '+report.existing+' already present. Existing documents unchanged.');
    });
    return;
  }
  if(a==='ensure-bo-folders'){
    busyDo(async()=>{
      await reloadCompanies();
      const report=await ensureBeneficialOwnersFolders({force:true});
      await reloadContent();
      if(report.failed)throw Error('Created '+report.created+' Beneficial Owners folders; '+report.failed+' failed. Please retry or check Supabase permissions.');
      toast('Beneficial Owners folders ready: '+report.created+' created, '+report.existing+' already present. No existing files changed.');
    });
    return;
  }
  if(a==='new-company'){state.modal={kind:'company'};render();return;}
  if(a==='new-folder'){state.modal={kind:'folder'};render();return;}
  if(a==='rename-company'){const c=state.companies.find(x=>x.id===id);if(c){state.modal={kind:'rename',target:'company',id,name:c.name};render();}return;}
  if(a==='rename-folder'){const f=getFolder(id);if(f){state.modal={kind:'rename',target:'folder',id,name:f.name};render();}return;}
  if(a==='rename-file'){const f=getDocument(id);if(f){state.modal={kind:'rename',target:'file',id,name:f.name};render();}return;}
  if(a.startsWith('delete-')){const target=a.slice(7), record=target==='company'?state.companies.find(x=>x.id===id):target==='folder'?getFolder(id):getDocument(id);if(record){state.modal={kind:'delete',target,id,name:record.name};render();}return;}
  if(a==='upload-trigger'){document.getElementById('document-upload').click();return;}
  if(a==='view-file'||a==='download-file'){
    const blankTab = !Capacitor.isNativePlatform() ? window.open('about:blank','_blank') : null;
    if(blankTab) blankTab.opener=null;
    busyDo(()=>openDocument(id,a==='download-file',blankTab));return;
  }
  if(a==='import'){state.modal={kind:'import'};state.importData=null;state.importWorkbook=null;state.importReader='';state.importProgress=null;state.importError='';state.importFileName='';render();return;}
  if(a==='load-paste'){
    try{
      const raw=document.getElementById('import-paste')?.value||'';
      const rows=parseDelimitedRows(raw);
      if(!rows.length)throw new Error('Paste one or more company names first.');
      state.importData=[{sheet:'Pasted list',data:rows}];state.importSheet=0;
      state.importFileName='Pasted list';state.importError='';state.importProgress=null;autoColumns();render();
    }catch(e){state.importError=importHint(e);render();}
    return;
  }
  if(a==='run-import') {busyDo(runImport);return;}
});
ROOT.addEventListener('submit',event=>{
  if(masterListingUI.onSubmit(event.target)){event.preventDefault();return;}
  if(signingSupabaseUI.submit(event.target)){event.preventDefault();return;}
  if(signingUI.submit(event.target)){event.preventDefault();return;}
  if(event.target.id==='signing-link-form'){
    event.preventDefault();
    const input=event.target.elements.signingLink.value;
    try { sessionStorage.setItem('zhenli:signing:session', allowedHttpsUrl(input, 'zhenli-sequential-signing.edgeone.cool'));render(); }
    catch(e){toast(e.message)}
    return;
  }
  if(!['auth-form','modal-form'].includes(event.target.id)) return;
  event.preventDefault(); if(state.busy) return;
  const form=new FormData(event.target);
  if(event.target.id==='auth-form'){
    const email=norm(form.get('email')),password=String(form.get('password')||'');
    busyDo(async()=>{
      if(state.authMode==='login'){
        const {data,error}=await db.auth.signInWithPassword({email,password});check(error);
        state.user=data.user;await refresh();state.notice='';
      }else{
        const {data,error}=await db.auth.signUp({email,password});check(error);
        if(!data.session)toast('Account created. Check your email to confirm your address, then sign in.');
        else {state.user=data.user;await refresh();}
      }
    });return;
  }
  const m=state.modal;if(!m)return;
  busyDo(async()=>{
    if(m.kind==='delete'){await deleteTarget(m);return;}
    const name=norm(form.get('name'));
    if(!name)throw new Error('Name cannot be blank.');
    let companySyncNotice='';
    if(m.kind==='company'){
      const registration=norm(form.get('registration'));
      const {error}=await db.rpc('create_company_with_folders',{p_name:name,p_registration_no:registration});check(error);
      await reloadCompanies();
      try{
        const result=await masterListingUI.syncDocumentCompanies([{name,registration_no:registration}]);
        companySyncNotice=result.added?'Company folders created and Master Listing updated.':'Company folders created; already in Master Listing.';
      }catch(error){
        companySyncNotice='Company folders created, but Master Listing sync failed: '+String(error?.message||error)+'. Open Master Listing → Sync from Documents to retry.';
      }
    }else if(m.kind==='folder'){
      const {error}=await db.from('folders').insert({user_id:state.user.id,company_id:state.companyId,parent_id:state.folderId,name});check(error);
      await reloadContent();
    }else if(m.kind==='rename'){
      const table=m.target==='company'?'companies':m.target==='folder'?'folders':'documents';
      const {error}=await db.from(table).update({name}).eq('id',m.id);check(error);
      await refresh();
    }
    state.modal=null;await refresh();toast(companySyncNotice||'Saved successfully.');
  });
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&state.tab==='master-listing'&&masterListingUI.exitFullscreen()){event.preventDefault();return;}
  if(event.key==='Escape'&&state.arFullscreen){event.preventDefault();setAnnualReturnFullscreen(false);}
   else if(event.key==='Escape'&&state.signingFullscreen){event.preventDefault();setSigningFullscreen(false);}
});
ROOT.addEventListener('input',e=>{
 if(e.target.matches?.('.rb-cell')){registerBookUI.updateCell(e.target);return;}
 if(e.target.id==='sr-review-search'){
  const pos=e.target.selectionStart??e.target.value.length;
  registerBookUI.searchReview(e.target.value);
  const input=ROOT.querySelector('#sr-review-search');
  input?.focus();input?.setSelectionRange(pos,pos);
  return;
 }
 if(e.target.id==='rb-search'){
   const pos=e.target.selectionStart??e.target.value.length;
   registerBookUI.search(e.target.value);
   const input=ROOT.querySelector('#rb-search');
   input?.focus();input?.setSelectionRange(pos,pos);
   return;
 }
 if(e.target.id==='sd-search'){
    const pos=e.target.selectionStart??e.target.value.length;
    state.deadlineQuery=e.target.value;render();
    const input=ROOT.querySelector('#sd-search');
    input?.focus();input?.setSelectionRange(pos,pos);
    return;
  }
 if(state.tab==='signing'){if(state.signingProvider==='supabase')signingSupabaseUI.input(e.target);else signingUI.input(e.target);}if(e.target.id==='search'){state.search=e.target.value;const position=e.target.selectionStart;render();const target=document.getElementById('search');target?.focus();target?.setSelectionRange(position,position);}});
ROOT.addEventListener('change',e=>{
  if(e.target.id==='sd-kind'){state.deadlineKind=e.target.value;render();return;}
  if(e.target.id==='sd-period'){state.deadlinePeriod=e.target.value;render();return;}
  if(masterListingUI.onChange(e.target,prepareExcelImport))return;
  if(signingSupabaseUI.changed(e.target))return;
  if(signingUI.changed(e.target))return;
  if(e.target.id==='document-upload'){const files=[...e.target.files];e.target.value='';if(files.length)busyDo(()=>uploadFiles(files));}
  if(e.target.id==='sr-zip-input'){const file=e.target.files?.[0];e.target.value='';if(file)busyDo(()=>registerBookUI.readZip(file));return;}
  if(e.target.matches?.('.rb-cell')){registerBookUI.updateCell(e.target);return;}
  if(e.target.id==='excel-input'){
    const file=e.target.files[0];e.target.value='';if(!file)return;
    busyDo(async()=>{
      state.importError='';state.importFileName=file.name;state.importProgress='Reading '+file.name+' ('+fileSize(file.size)+')…';render();
      try {
        if(!/\.(xlsx|csv|json)$/i.test(file.name))throw new Error('Select an .xlsx Excel file, .csv file or .json company list.');
        if(file.size>20*1024*1024)throw new Error('File exceeds 20 MB.');
        if(file.size===0)throw new Error('The file picker returned an empty Excel file. Choose the original .xlsx from Files → Downloads or local storage.');
        let sheets=[],prepared=null;
        if(/\.csv$/i.test(file.name)){
          sheets=[{sheet:'CSV import',data:parseDelimitedRows(await file.text())}];
        }else if(/\.json$/i.test(file.name)){
          const imported=JSON.parse(await file.text());
          const entries=Array.isArray(imported)?imported:imported?.companies;
          if(!Array.isArray(entries)||!entries.length||entries.length>5000)throw Error('JSON requires a companies array (1–5,000 companies).');
          sheets=[{sheet:'JSON company list',data:[['Company Name','Registration No.'],...entries.filter(c=>c&&typeof c.name==='string').map(c=>[c.name,c.reg||c.registration_no||''])]}];
        }else{
          prepared=await prepareExcelImport(file);
          sheets=prepared.sheets;
        }
        if(!sheets.length || !sheets.some(s=>s.data?.length))throw new Error('The selected worksheet has no readable data.');
        state.importData=sheets;
        state.importWorkbook=prepared?.book||null;
        state.importReader=prepared?.reader||'Text / JSON reader';
        state.importSheet=prepared?.selected||0;state.importProgress=null;autoColumns();render();
      }catch(error){state.importData=null;state.importWorkbook=null;state.importError='Could not read '+file.name+': '+importHint(error);state.importProgress=null;render();}
    });return;
  }
  if(e.target.id==='sheet-choice'){busyDo(()=>selectImportSheet(Number(e.target.value)));return;}
  if(e.target.id==='name-column'){state.importNameCol=Number(e.target.value);render();return;}
  if(e.target.id==='registration-column'){state.importRegCol=Number(e.target.value);render();return;}
  if(e.target.id==='start-row'){state.importStartRow=Math.max(1,Number(e.target.value)||1);render();return;}
});
ROOT.addEventListener('dragover',e=>{if(e.target.closest('#dropzone'))e.preventDefault();});
ROOT.addEventListener('drop',e=>{if(!e.target.closest('#dropzone'))return;e.preventDefault();const files=[...e.dataTransfer.files];if(files.length)busyDo(()=>uploadFiles(files));});
ROOT.addEventListener('keydown',e=>{if(e.target.id==='dropzone' && (e.key==='Enter'||e.key===' ')){e.preventDefault();document.getElementById('document-upload').click();}});
ROOT.addEventListener('click',e=>{if(e.target.closest('#dropzone')){if(!state.busy)document.getElementById('document-upload').click();}});

// Only accept readiness/selection messages from the signed-in DMS iframe.
window.addEventListener('message',event=>{
 if(event.origin!==window.location.origin||!state.user||state.tab!=='annual-return')return;
 const frame=ROOT.querySelector('#zh-annual-return-frame');
 if(!frame||event.source!==frame.contentWindow||!event.data||typeof event.data!=='object')return;
 if(event.data.type==='ZHENLI_DMS_AR_IMPORT_COMBINED_REQUEST'){
   const requestId=event.data.id,requested=event.data.companyId;
   if(typeof requestId!=='string'||!/^ar_register_[\w-]{1,70}$/.test(requestId))return;
   const source=frame.contentWindow;
   const reply=(ok,payload,error)=>source?.postMessage({
    type:'ZHENLI_DMS_AR_IMPORT_COMBINED_RESPONSE',id:requestId,ok,
    payload:ok?payload:null,error:ok?'':String(error||'').slice(0,300)
   },window.location.origin);
   void (async()=>{
    const user=state.user,company=state.companies.find(c=>c.id===requested);
    if(!user||!company||!state.arSelectedCompanyId||state.arSelectedCompanyId!==company.id)
     throw Error('Select the correct DMS company in Annual Return before importing.');
    const key=String(user.id)+'/statutory-registers/'+company.id+'.json';
    const {data,error}=await db.storage.from(BUCKET).download(key);
    if(error)throw Error(/not found|404/i.test(error.message||'')?
     'No saved combined Statutory Registers found for this company. Save or import its registers first.':
     'Could not read the private combined registers: '+error.message);
    const book=JSON.parse(await data.text());
    if(state.user?.id!==user.id||state.arSelectedCompanyId!==company.id||
       state.tab!=='annual-return')throw Error('Company changed while loading. Try again.');
    const payload=combinedRegisterSnapshot(book,{companyId:company.id,
     companyName:company.name,registrationNo:company.registration_no||''});
    reply(true,payload,'');
   })().catch(error=>reply(false,null,error.message||error));
   return;
 }
 if(event.data.type==='ZHENLI_DMS_AR_SAVE_PDF'){
   const source=frame.contentWindow,id=event.data.id,blob=event.data.blob;
   if(typeof id!=='string'||id.length>100||!/^ar_pdf_[\w-]+$/.test(id))return;
   const reply=(ok,note,error)=>source.postMessage({type:'ZHENLI_DMS_AR_PDF_SAVED',id,ok,note,error},window.location.origin);
   void (async()=>{
     try{
       const name=validatedPdf(blob,event.data.filename);
       let note;
       if(Capacitor.isNativePlatform()){
         const saved=await savePdfToAndroidFiles(blob,name);
         note='PDF saved to your selected Android folder: '+saved.filename+'.';
       }else{
         const saved=browserDownload(blob,name);
         note='Download requested: '+saved.filename+'. Check browser Downloads or Files.';
       }
       reply(true,note,'');
     }catch(error){reply(false,'',String(error.message||error).slice(0,240));}
   })();
   return;
 }
 if(event.data.type==='ZHENLI_AR_FULLSCREEN_TOGGLE'){setAnnualReturnFullscreen(!state.arFullscreen);return;}
 if(event.data.type==='ZHENLI_AR_READY'){sendAnnualReturnCompanyList();sendAnnualReturnCompany();return;}
 if(event.data.type==='ZHENLI_AR_SELECT_COMPANY_REQUEST'){
  const id=event.data.id;
  if(typeof id!=='string'||id.length>130||!state.companies.some(x=>x.id===id))return;
  state.arSelectedCompanyId=id;sendAnnualReturnCompany();return;
 }
 if(event.data.type==='ZHENLI_AR_SELECTION_RESULT'){
  if(!event.data.ok&&event.data.reason)toast('Annual Return company selection: '+String(event.data.reason).slice(0,130));
  return;
 }
});
async function init() {
  if(!db){render();return;}
  installHubBridge(db,()=>state.user,()=>state.companies,showError);
  try {
    const {data,error}=await db.auth.getUser();
    if(error && !/session missing/i.test(error.message)) console.warn(error.message);
    state.user=data.user||null;
    if(state.user)await refresh();
    render();
    db.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'){masterListingUI.reset();registerBookUI.reset();state.user=null;state.companyId=null;state.companies=[];state.folders=[];state.documents=[];render();}
      if(event==='SIGNED_IN' && session?.user && (!state.user || state.user.id!==session.user.id)){
        state.user=session.user;Promise.resolve().then(refresh).catch(showError);
      }
    });
  }catch(e){showError(e);}
}
init();
