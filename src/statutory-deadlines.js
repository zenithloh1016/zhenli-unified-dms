/**
 * Live statutory deadlines view for the ZHENLI DMS.
 * The privately stored Master Listing is the only deadline source.
 * Never infer lodgement dates from incorporation date, anniversary or FYE;
 * the dates shown are not evidence of whether lodgement is outstanding.
 */
import {validateMasterListing,normalizeListingDateText,companyData} from './master-listing-data.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
const cleanHeader=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const validDate=iso=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return false;
 const [y,m,d]=iso.split('-').map(Number);
 if(y<1900||y>2199||m<1||m>12||d<1)return false;
 return new Date(Date.UTC(y,m,0)).getUTCDate()>=d;
};
const DISPLAY_FIELDS={
 AR:['annualreturnlodgementduedate','arlodgementduedate','annualreturnduedate','arduedate','annualreturnfilingduedate'],
 AFS:['auditedfinancialstatementlodgementduedate','auditedfinancialstatementslodgementduedate',
  'financialstatementlodgementduedate','financialstatementslodgementduedate',
  'afsduedate','afslodgementduedate','auditedfinancialstatementsduedate','financialstatementsduedate']
};
export function findDeadlineColumns(model){
 if(!model?.columns)return {AR:-1,AFS:-1};
 const labels=model.columns.map(c=>cleanHeader(c.label));
 return Object.fromEntries(Object.entries(DISPLAY_FIELDS).map(([kind,aliases])=>
  [kind,aliases.map(x=>labels.indexOf(x)).find(i=>i>=0)??-1]));
}
export function readDeadline(value,{date1904=false}={}){
 const raw=String(value??'').trim();
 if(!raw||/^(?:n\/a|na|nil|none|-|not\s+(?:available|provided)|tbc|tbd)$/i.test(raw))
  return {iso:'',display:/^tbc$/i.test(raw)?'TBC':'Not provided'};
 const display=normalizeListingDateText(raw,{dateColumn:true,date1904});
 if(display){
  const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if(m){
   const iso=m[3]+'-'+m[2]+'-'+m[1];
   if(validDate(iso))return {iso,display};
  }
 }
 return {iso:'',display:'Check date'};
}
const localToday=()=>{
 const d=new Date();
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
const daysAfter=(iso,days)=>{
 const [y,m,d]=iso.split('-').map(Number);
 const t=new Date(Date.UTC(y,m-1,d+days));
 return [t.getUTCFullYear(),String(t.getUTCMonth()+1).padStart(2,'0'),String(t.getUTCDate()).padStart(2,'0')].join('-');
};
export function deadlineStatus(iso,today=localToday()){
 if(!iso)return {code:'missing',label:'Date not recorded'};
 if(iso<today)return {code:'past',label:'Past source date · verify filing'};
 if(iso<=daysAfter(today,30))return {code:'soon',label:'Within 30 days'};
 return {code:'future',label:'Future date'};
}
export function statutoryDeadlineData(model,today=localToday()){
 if(!model)return {rows:[],columns:{AR:-1,AFS:-1},stats:{ar:0,afs:0,soon:0,past:0,missing:0},sourceUpdatedAt:''};
 validateMasterListing(model);
 const cols=findDeadlineColumns(model);
 const rows=[];
 for(let i=0;i<model.rows.length;i++){
  const record=model.rows[i],info=companyData(model,record);
  if(!info?.name)continue;
  for(const kind of ['AR','AFS']){
   const value=cols[kind]<0?'':record.values[cols[kind]];
   const date=readDeadline(value,{date1904:!!model.date1904});
   rows.push({rowIndex:i,company:info.name,registration:info.registration,
    kind,iso:date.iso,display:cols[kind]<0?'Column not found':date.display,
    status:cols[kind]<0?{code:'missing',label:'Column not found'}:deadlineStatus(date.iso,today)});
  }
 }
 rows.sort((a,b)=>(a.iso||'9999-12-31').localeCompare(b.iso||'9999-12-31')||
   a.company.localeCompare(b.company)||a.kind.localeCompare(b.kind)||a.rowIndex-b.rowIndex);
 return {rows,columns:cols,stats:{
  ar:rows.filter(x=>x.kind==='AR'&&x.iso).length,
  afs:rows.filter(x=>x.kind==='AFS'&&x.iso).length,
  soon:rows.filter(x=>x.status.code==='soon').length,
  past:rows.filter(x=>x.status.code==='past').length,
  missing:rows.filter(x=>!x.iso).length
 },sourceUpdatedAt:model.updatedAt||model.importedAt||''};
}
export function filterStatutoryDeadlines(rows,{query='',kind='all',period='all'}={}){
 const q=String(query).toLowerCase().trim();
 return (rows||[]).filter(x=>
   (kind==='all'||x.kind===kind)&&
   (period==='all'||period==='30'&&x.status.code==='soon'||
    period==='past'&&x.status.code==='past'||
    period==='future'&&(x.status.code==='soon'||x.status.code==='future')||
    period==='missing'&&x.status.code==='missing')&&
   (!q||[x.company,x.registration,x.kind].some(s=>String(s||'').toLowerCase().includes(q))));
}
export function renderStatutoryDeadlines(model,{query='',kind='all',period='all',loading=false,error=''}={}){
 const source=statutoryDeadlineData(model);
 const rows=filterStatutoryDeadlines(source.rows,{query,kind,period});
 const originalCount=source.rows.length/2;
 const issues=['AR','AFS'].filter(t=>source.columns[t]<0);
 const options=(items,value)=>items.map(([v,label])=>'<option value="'+esc(v)+'"'+(value===v?' selected':'')+'>'+esc(label)+'</option>').join('');
 const update=source.sourceUpdatedAt&&Number.isFinite(Date.parse(source.sourceUpdatedAt))
   ?new Date(source.sourceUpdatedAt).toLocaleString('en-MY'):'Not available';
 return '<section class="sd-workspace" aria-label="Statutory Deadlines workspace">'+
  '<div class="content-header"><div><p class="eyebrow">COMPLIANCE CALENDAR</p><h1>Statutory Deadlines</h1>'+
  '<p class="muted">Annual Return and Financial Statements lodgement due dates · Directly linked to your private Master Listing</p></div>'+
  '<div class="header-buttons"><button class="btn secondary" type="button" data-action="deadline-refresh">↻ Refresh dates</button>'+
  '<button class="btn primary" type="button" data-action="deadline-open-master">Master Listing</button></div></div>'+
  (loading?'<p class="sd-sync" role="status">Checking the latest Master Listing…</p>':'')+
  (error?'<p class="sd-warning" role="alert">Could not refresh Master Listing: '+esc(error)+'. Displayed dates may be stale.</p>':'')+
  (issues.length?'<p class="sd-warning" role="alert">Master Listing is missing '+issues.map(x=>x==='AR'?'Annual Return Lodgement Due Date':'Audited Financial Statement Lodgement Due Date').join(' and ')+'. Please check the Excel column headings.</p>':'')+
  '<div class="sd-metrics"><div><strong>'+source.stats.ar+'</strong><span>AR dates recorded</span></div>'+
  '<div><strong>'+source.stats.afs+'</strong><span>AFS dates recorded</span></div>'+
  '<div><strong>'+source.stats.soon+'</strong><span>Next 30 days</span></div>'+
  '<div><strong>'+source.stats.missing+'</strong><span>Missing / TBC dates</span></div></div>'+
  '<div class="sd-toolbar"><label>Search company or registration number<input type="search" id="sd-search" value="'+esc(query)+'" placeholder="Search companies"></label>'+
  '<label>Filing type<select id="sd-kind">'+options([['all','All filings'],['AR','Annual Return (AR)'],['AFS','Financial Statements (AFS)']],kind)+'</select></label>'+
  '<label>Due date<select id="sd-period">'+options([['all','All dates'],['30','Next 30 days'],['past','Past source dates'],['future','Today onwards'],['missing','Missing / TBC']],period)+'</select></label>'+
  '<button type="button" class="btn secondary" data-action="deadline-clear">Clear filters</button></div>'+
  (model?'<div class="sd-list-heading"><strong>'+rows.length+' filing rows</strong><span>'+originalCount+' company rows · Source last saved: '+esc(update)+'</span></div>':'')+
  (model?'<div class="sd-scroll"><table class="sd-table"><thead><tr><th>Company</th><th>Registration No.</th><th>Filing</th><th>Lodgement due</th><th>Date status</th><th>Action</th></tr></thead><tbody>'+
  (rows.length?rows.map(x=>'<tr><td class="sd-company">'+esc(x.company)+'</td><td>'+esc(x.registration||'N/A')+'</td>'+
    '<td><span class="sd-tag">'+(x.kind==='AR'?'Annual Return':'Financial Statements')+'</span></td>'+
    '<td class="sd-date">'+esc(x.display)+'</td><td><span class="sd-status sd-'+x.status.code+'">'+esc(x.status.label)+'</span></td>'+
    '<td><button type="button" class="btn secondary sd-edit" data-action="deadline-edit" data-id="'+x.rowIndex+'">Edit source</button></td></tr>').join(''):
    '<tr><td colspan="6" class="sd-empty">No filing dates match the selected filters.</td></tr>')+
  '</tbody></table></div>':
  '<div class="sd-empty-state"><h3>No Master Listing loaded</h3><p>Import your Excel Master Listing to populate Annual Return and Financial Statements due dates automatically.</p><button class="btn primary" data-action="deadline-open-master" type="button">Go to Master Listing</button></div>')+
  '<p class="sd-footnote">The recorded Master Listing dates are shown without recalculation. A past date does not confirm non-lodgement or an offence; verify actual filing status with your statutory records and SSM. Dates update after saving the Master Listing and are rechecked while this tab is open.</p>'+
 '</section>';
}
