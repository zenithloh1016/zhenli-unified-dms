'use strict';
/**
 * ZHENLI Company Secretarial Task Hub — private browser edition.
 * No API, login, server storage, analytics or external dependencies.
 * IMPORTANT: localStorage is device/browser specific; use Export/Import for backup.
 */
(function () {
  const STORAGE_KEY = 'zhenli_secretarial_task_hub_v1'; // preserve existing tasks on the same website origin
  const CATEGORIES = ['Annual Return (AR)','Financial Statements (AFS)','Beneficial Ownership (BO)','SSM Lodgement / CRS','Board Resolution','Members’ Resolution','Banking & Signatories','Auditor / Tax Agent','Company Incorporation','Strike-off / Winding-up','Director / Secretary Changes','Shares & Allotments','Registered Charges','Client Follow-up','Electronic Signing','Registers & Statutory Books','General / Other'];
  const STATUSES = [
    {id:'todo',name:'To do',short:'To do'},
    {id:'progress',name:'In progress',short:'In progress'},
    {id:'client',name:'Waiting client',short:'Waiting client'},
    {id:'ssm',name:'Waiting SSM',short:'Waiting SSM'},
    {id:'done',name:'Completed',short:'Completed'}
  ];
  const PRIORITIES = [{id:'urgent',name:'Urgent'},{id:'high',name:'High'},{id:'normal',name:'Normal'},{id:'low',name:'Low'}];
  const NAV_NAMES = {deadlines:'Statutory deadlines',dashboard:'Overview',all:'All tasks',today:'Today',upcoming:'Next 7 days',overdue:'Overdue',board:'Kanban board',calendar:'Calendar',completed:'Completed',companies:'Companies',activity:'Activity history'};
  const ICONS = {
    'layout-dashboard':'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    'list-todo':'<rect x="8" y="4" width="13" height="16" rx="2"/><path d="M12 9h5m-5 5h5M3 9l1 1 2-2M3 15l1 1 2-2"/>',
    'sun':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
    'calendar-days':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 4h2m4 0h2m-8 4h2"/>',
    'alert-circle':'<circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>',
    'columns-3':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m6-18v18"/>',
    'calendar-range':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-12 5h6"/>',
    'check-circle-2':'<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    'building-2':'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 7h.01M12 7h.01M16 7h.01M8 12h.01M12 12h.01M16 12h.01"/>',
    'history':'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    'shield-check':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    'settings-2':'<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    'plus':'<path d="M12 5v14M5 12h14"/>',
    'menu':'<path d="M4 6h16M4 12h16M4 18h16"/>',
    'x':'<path d="M18 6 6 18M6 6l12 12"/>',
    'moon':'<path d="M20.5 13.2A9 9 0 0 1 10.8 3.5a9 9 0 1 0 9.7 9.7Z"/>',
    'sun-moon':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>',
    'check':'<path d="m5 12 4 4L19 6"/>',
    'search':'<circle cx="10.8" cy="10.8" r="7.2"/><path d="m16.2 16.2 4.6 4.6"/>',
    'download':'<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
    'upload':'<path d="M12 16V4m-4 4 4-4 4 4M4 17v4h16v-4"/>',
    'file-spreadsheet':'<path d="M5 2h10l5 5v15H5z"/><path d="M15 2v5h5M8 12h9m-9 4h9m-6-7v10"/>',
    'file-text':'<path d="M5 2h10l5 5v15H5z"/><path d="M15 2v5h5M8 12h9m-9 4h9"/>',
    'clock-3':'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    'arrow-right':'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    'chevron-left':'<path d="m15 18-6-6 6-6"/>',
    'chevron-right':'<path d="m9 18 6-6-6-6"/>',
    'more-horizontal':'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    'trash-2':'<path d="M3 6h18M8 6V4h8v2m-11 0 1 15h12l1-15M10 10v7m4-7v7"/>',
    'repeat':'<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
    'filter':'<path d="M4 7h16M7 12h10m-7 5h4"/>',
    'briefcase-business':'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12h18"/>',
    'inbox':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 13h5l2 3h4l2-3h5"/>',
    'circle-help':'<circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 0 1 6 1c0 2-3 2-3 4m0 3h.01"/>'
  };
  const $ = sel => document.querySelector(sel);
  const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const svg = (id, extra='') => `<svg ${extra} xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id]||ICONS['file-text']}</svg>`;
  const uniqueId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const todayStr = () => dateToStr(new Date());
  const dateToStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parseDay = str => str ? new Date(+str.slice(0,4), +str.slice(5,7)-1, +str.slice(8,10)) : null;
  const shiftDay = (str, num) => {const d=parseDay(str);if(!d)return '';d.setDate(d.getDate()+num);return dateToStr(d)};
  const nextRecurring = (str, freq) => {const d=parseDay(str||todayStr());if(freq==='daily')d.setDate(d.getDate()+1);else if(freq==='weekly')d.setDate(d.getDate()+7);else if(freq==='monthly'||freq==='yearly'){const day=d.getDate();const y=d.getFullYear();const m=d.getMonth();const ny=freq==='yearly'?y+1:y+Math.floor((m+1)/12);const nm=freq==='yearly'?m:(m+1)%12;const end=new Date(ny,nm+1,0).getDate();return dateToStr(new Date(ny,nm,Math.min(end,day)));}return dateToStr(d)};
  const formatDate = (str,opts={}) => {const d=parseDay(str);return d?d.toLocaleDateString('en-MY',{day:'2-digit',month:'short',...(opts.year?{year:'numeric'}:{})}):'No due date'};
  const fullDate = date => date.toLocaleDateString('en-MY',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const sameDate = (a,b)=>a===b;
  const isDone = t => t.status==='done';
  const isOverdue = t => t.dueDate && t.dueDate<todayStr()&&!isDone(t);
  const isToday = t => t.dueDate===todayStr()&&!isDone(t);
  const dueSoon = t => t.dueDate && t.dueDate>=todayStr() && t.dueDate<=shiftDay(todayStr(),7) && !isDone(t);
  const statusObj = id => STATUSES.find(x=>x.id===id)||STATUSES[0];
  const priorityObj = id => PRIORITIES.find(x=>x.id===id)||PRIORITIES[2];
  const plural = (n,word) => `${n} ${word}${n===1?'':'s'}`;
  const timestamp = () => new Date().toISOString();
  const DEFAULT_DATA = {version:1,tasks:[],companies:[],activity:[],settings:{theme:'light',compact:false}};
  // ZHENLI_SYNC_BRIDGE_V1: when embedded, data stays inside the authenticated DMS Supabase account.
  const EMBEDDED = window.parent !== window;
  let hubReady = !EMBEDDED;
  let data=EMBEDDED ? structuredClone(DEFAULT_DATA) : readData();
  let state={deadlineKind:'all',deadlinePeriod:'all',deadlineQuery:'',view:'dashboard',query:'',filterCompany:'',filterPriority:'',filterCategory:'',filterStatus:'',sort:'due',calendarYear:new Date().getFullYear(),calendarMonth:new Date().getMonth(),companyQuery:''};
  let editingSteps=[];
  let lastExport=null;

  function readData(){try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return structuredClone(DEFAULT_DATA);const val=JSON.parse(raw);if(!val||!Array.isArray(val.tasks)||!Array.isArray(val.companies))throw Error('Invalid local data');return {...structuredClone(DEFAULT_DATA),...val,settings:{...DEFAULT_DATA.settings,...val.settings}};}catch(err){console.error('Cannot read storage',err);return structuredClone(DEFAULT_DATA)}}
  function saveData(){
    if(EMBEDDED){
      if(!hubReady) { toast('Task Hub is still connecting to secure storage.',true); return false; }
      window.parent.postMessage({type:'ZHENLI_HUB_SAVE',payload:structuredClone(data)},window.location.origin);
      return true;
    }
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));return true}catch(err){console.error(err);toast('Browser storage failed. Export a backup and check available storage.',true);return false}
  }
  function record(action,title){data.activity.unshift({id:uniqueId(),at:timestamp(),action:String(action),title:String(title)});data.activity=data.activity.slice(0,400)}
  function toast(message,error=false){const wrap=$('#toastWrap');const el=document.createElement('div');el.className='toast';el.innerHTML=`${svg(error?'alert-circle':'check-circle-2')}<span>${esc(message)}</span>`;wrap.appendChild(el);setTimeout(()=>el.remove(),4100)}
  function renderIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=svg(el.dataset.icon)})}
  function formatTime(iso){const d=new Date(iso);return isNaN(d.getTime())?'':d.toLocaleString('en-MY',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
  function filterTasks(view=state.view){let ts=data.tasks.slice();switch(view){case'today':ts=ts.filter(isToday);break;case'overdue':ts=ts.filter(isOverdue);break;case'upcoming':ts=ts.filter(dueSoon);break;case'completed':ts=ts.filter(isDone);break;case'all':ts=ts.filter(t=>!isDone(t));break;}return applyFilters(ts)}
  function applyFilters(tasks){const query=state.query.trim().toLowerCase();let result=tasks.filter(t=>(!state.filterCompany||t.company===state.filterCompany)&&(!state.filterPriority||t.priority===state.filterPriority)&&(!state.filterCategory||t.category===state.filterCategory)&&(!state.filterStatus||t.status===state.filterStatus)&&(!query||[t.title,t.company,t.category,t.assignee,t.reference,t.notes].some(x=>String(x||'').toLowerCase().includes(query))));result.sort((a,b)=>{
    if(state.sort==='priority'){const order={urgent:0,high:1,normal:2,low:3};return (order[a.priority]??2)-(order[b.priority]??2) || (a.dueDate||'9999').localeCompare(b.dueDate||'9999')}
    if(state.sort==='updated')return (b.updatedAt||'').localeCompare(a.updatedAt||'');
    if(state.sort==='company')return a.company.localeCompare(b.company)|| (a.dueDate||'9999').localeCompare(b.dueDate||'9999');
    return (a.dueDate||'9999').localeCompare(b.dueDate||'9999') || (a.priority||'').localeCompare(b.priority||'');
  });return result}
  function countActive(){return data.tasks.filter(t=>!isDone(t)).length}
  function setView(view){state.view=view;if(view==='companies')state.companyQuery='';state.filterStatus='';state.query='';state.filterCompany='';state.filterPriority='';state.filterCategory='';state.sort='due';render();closeMobile();window.scrollTo({top:0,behavior:'smooth'})}
  function render(){document.body.classList.toggle('dark',data.settings.theme==='dark');document.body.classList.toggle('compact',!!data.settings.compact);
    $('#headerDate').textContent=fullDate(new Date());$('#breadcrumbName').textContent=NAV_NAMES[state.view]||'Overview';
    document.querySelectorAll('.nav-link').forEach(x=>x.classList.toggle('selected',x.dataset.view===state.view));
    $('#navAllCount').textContent=countActive();$('#navTodayCount').textContent=data.tasks.filter(isToday).length;$('#navOverdueCount').textContent=data.tasks.filter(isOverdue).length;$('#navCompanyCount').textContent=data.companies.length;
    $('#themeToggle').innerHTML=svg(data.settings.theme==='dark'?'sun':'moon');
    const titles={deadlines:['Statutory filing deadlines.','AR and AFS lodgement dates from your private Master Listing.','COMPLIANCE CALENDAR'],dashboard:["Good day, let's get things done.",'All your company secretarial work, in one organized place.','YOUR WORKSPACE'],all:['All active tasks.','Review, filter and update everything that needs attention.','TASK REGISTER'],today:["Today's priorities.",'Tasks with deadlines falling today.','FOCUS VIEW'],upcoming:['Coming up this week.','All outstanding tasks due within the next 7 days.','DEADLINE PLANNER'],overdue:['Overdue work.','Resolve outstanding deadlines and keep filings on track.','NEEDS ATTENTION'],board:['See your workflow.','Move tasks between stages to track progress.','WORKFLOW BOARD'],calendar:['Your deadline calendar.','Plan around upcoming company secretarial deadlines.','MONTHLY PLANNER'],completed:['Work completed.','A record of tasks already completed.','TASK ARCHIVE'],companies:['Company portfolio.','Manage client companies and their key dates.','COMPANY REGISTER'],activity:['Activity history.','A local history of tasks you have changed in this browser.','AUDIT TRAIL']};
    const [title,desc,brow]=titles[state.view];$('#pageTitle').innerHTML=esc(title.slice(0,-1))+'<span class="heading-dot">.</span>';$('#pageDescription').textContent=desc;$('#pageEyebrow').textContent=brow;$('#quickCompanyBtn').style.visibility=state.view==='companies'?'visible':'hidden';
    let html='';switch(state.view){case'dashboard':html=renderDashboard()+renderDeadlineSummary();break;case'deadlines':html=renderDeadlines();break;case'board':html=renderBoard();break;case'calendar':html=renderCalendar();break;case'companies':html=renderCompanies();break;case'activity':html=renderActivity();break;default:html=renderList(state.view)}$('#pageContent').innerHTML=html;
  }
  function renderDashboard(){const total=countActive(), overdue=data.tasks.filter(isOverdue).length,today=data.tasks.filter(isToday).length,upcoming=data.tasks.filter(dueSoon).length,complete=data.tasks.filter(isDone).length, waiting=data.tasks.filter(x=>['client','ssm'].includes(x.status)).length;
    let focus=data.tasks.filter(t=>!isDone(t)).sort((a,b)=>{const w=t=>isOverdue(t)?0:isToday(t)?1:dueSoon(t)?2:3;return w(a)-w(b)|| (a.dueDate||'9999').localeCompare(b.dueDate||'9999')}).slice(0,7);
    let focusRows=focus.map(t=>`<div class="mini-task-row" data-edit-task="${esc(t.id)}"><span class="priority-stripe ${esc(t.priority)}"></span><button class="mini-check" data-toggle-task="${esc(t.id)}" title="Mark completed" aria-label="Complete ${esc(t.title)}"></button><div class="mini-task-text"><div class="mini-task-title">${esc(t.title)}</div><div class="mini-task-sub"><span>${esc(t.company||'No company')}</span><span>·</span><span>${esc(t.category)}</span></div></div><div class="mini-date ${isOverdue(t)?'overdue-date':''}">${isOverdue(t)?'Overdue':isToday(t)?'Today':formatDate(t.dueDate)}</div></div>`).join('');
    const stat=(label,n,icon,color,small,view)=>`<button type="button" class="stat-card" data-nav="${view}"><div class="stat-top"><span>${esc(label)}</span><span class="stat-symbol ${color}">${svg(icon)}</span></div><div class="stat-number">${n}</div><div class="stat-bottom">${esc(small)}</div></button>`;
    return `<div class="stats-grid">${stat('Active tasks',total,'list-todo','','Across all clients','all')}${stat('Due today',today,'sun','amber','Require action today','today')}${stat('Overdue',overdue,'alert-circle','red','Past their due date','overdue')}${stat('Next 7 days',upcoming,'calendar-days','teal','Upcoming deadlines','upcoming')}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Priority work queue</h2><p class="panel-sub">Your most urgent outstanding tasks</p></div><button class="text-link" data-nav="all">View all ${svg('arrow-right')}</button></div>${focusRows||emptyInner('No tasks yet','Add a task to build your daily work queue.','inbox')}</section><div><section class="panel quick-card"><h3>Quick start</h3><p>Capture new work in seconds, with categories designed for company secretarial practice.</p><div class="quick-actions"><button data-template="Annual Return (AR)" class="quick-action">${svg('calendar-days')} Annual Return</button><button data-template="Board Resolution" class="quick-action">${svg('file-text')} Resolution</button><button data-template="SSM Lodgement / CRS" class="quick-action">${svg('upload')} SSM lodgement</button><button data-template="Client Follow-up" class="quick-action">${svg('clock-3')} Client follow-up</button></div></section><section class="panel mini-section"><div class="panel-head"><div><h2 class="panel-title">Workload snapshot</h2><p class="panel-sub">Current tasks by stage</p></div></div><div class="simple-metrics">${metric('In progress',data.tasks.filter(t=>t.status==='progress').length,total,'')}${metric('Waiting client / SSM',waiting,total,'amber')}${metric('Completed',complete,data.tasks.length,'teal')}</div></section></div></div>`}
  function metric(label,n,total,color){const val=total?Math.round(n/total*100):0;return `<div><div class="metric-line"><span>${esc(label)}</span><strong>${n}</strong></div><div class="metric-progress"><div class="metric-fill ${color}" style="width:${val}%"></div></div></div>`}
  function emptyInner(title,desc,icon='inbox'){return `<div class="empty-state compact-empty"><span class="empty-icon">${svg(icon)}</span><h3>${esc(title)}</h3><p>${esc(desc)}</p><button data-new-task class="outline-btn small">${svg('plus')} Create task</button></div>`}
  function emptyFull(title,desc){return `<div class="panel"><div class="empty-state"><span class="empty-icon">${svg('inbox')}</span><h3>${esc(title)}</h3><p>${esc(desc)}</p><button data-new-task class="primary-btn">${svg('plus')} Add your first task</button></div></div>`}
  function companyOptions(value=''){const choices=[...new Set([...data.companies.map(x=>x.name),...data.tasks.map(x=>x.company).filter(Boolean)])].sort();return `<option value="">All companies</option>${choices.map(x=>`<option value="${esc(x)}" ${value===x?'selected':''}>${esc(x)}</option>`).join('')}`}
  function toolbar(){return `<div class="toolbar"><div class="search-input">${svg('search')}<input id="searchTasks" aria-label="Search tasks" placeholder="Search tasks, companies, references..." value="${esc(state.query)}"></div><div class="filter-group"><select id="companyFilter" aria-label="Filter by company">${companyOptions(state.filterCompany)}</select><select id="priorityFilter" aria-label="Filter by priority"><option value="">All priorities</option>${PRIORITIES.map(p=>`<option value="${p.id}" ${state.filterPriority===p.id?'selected':''}>${p.name}</option>`).join('')}</select><select id="categoryFilter" aria-label="Filter by category"><option value="">All categories</option>${CATEGORIES.map(x=>`<option ${state.filterCategory===x?'selected':''} value="${esc(x)}">${esc(x)}</option>`).join('')}</select>${state.view==='board'? '':`<select id="sortFilter" aria-label="Sort tasks"><option value="due" ${state.sort==='due'?'selected':''}>Sort: Due date</option><option value="priority" ${state.sort==='priority'?'selected':''}>Sort: Priority</option><option value="updated" ${state.sort==='updated'?'selected':''}>Sort: Recently updated</option><option value="company" ${state.sort==='company'?'selected':''}>Sort: Company</option></select>`}<button class="outline-btn" type="button" data-reset-filters title="Clear all filters">${svg('filter')} Reset</button></div></div>`}
  function renderList(view){const tasks=filterTasks(view);const badge=view==='completed'?'Completed': 'Active';return `${toolbar()}<section class="panel"><div class="panel-head"><div><h2 class="panel-title">${esc(NAV_NAMES[view]||'Tasks')}</h2><p class="panel-sub">${plural(tasks.length,'task')} shown · ${badge} records</p></div><button data-new-task type="button" class="outline-btn small">${svg('plus')} Add task</button></div>${tasks.length?`<div class="table-wrap"><table class="task-table"><thead><tr><th class="task-title-col">Task / category</th><th class="task-company-col">Company</th><th class="task-due-col">Due date</th><th class="task-priority-col">Priority</th><th class="task-status-col">Status</th><th></th></tr></thead><tbody>${tasks.map(renderRow).join('')}</tbody></table></div>`:emptyInner(view==='completed'?'No completed tasks yet':'No matching tasks',view==='completed'?'Complete a task to see it here.':'Try adjusting your filters or create a new task.')}</section>`}
  function renderRow(t){return `<tr><td><div class="table-title-row"><button class="mini-check ${isDone(t)?'checked':''}" data-toggle-task="${esc(t.id)}" title="${isDone(t)?'Reopen':'Complete'} task" aria-label="${isDone(t)?'Reopen':'Complete'} ${esc(t.title)}">${isDone(t)?svg('check'):''}</button><button class="task-title-button" data-edit-task="${esc(t.id)}" title="${esc(t.title)}">${esc(t.title)}</button></div><div class="table-task-sub">${esc(t.category)}${t.reference?' · '+esc(t.reference):''}${t.recurrence!=='none'?' · '+svg('repeat')+' Recurring':''}</div></td><td><span class="company-text" title="${esc(t.company||'')}">${esc(t.company||'—')}</span></td><td><span class="date-cell ${isOverdue(t)?'overdue-date':isToday(t)?'today-date':''}">${esc(formatDate(t.dueDate))}${isOverdue(t)?' !':''}</span></td><td><span class="chip ${esc(t.priority)}">${esc(priorityObj(t.priority).name)}</span></td><td><span class="chip ${esc(t.status)}">${esc(statusObj(t.status).name)}</span></td><td><button class="action-menu" data-edit-task="${esc(t.id)}" aria-label="Edit ${esc(t.title)}">${svg('more-horizontal')}</button></td></tr>`}
  function renderBoard(){const tasks=applyFilters(data.tasks);return `${toolbar()}<div class="board-wrap"><div class="board-columns">${STATUSES.map(s=>{const group=tasks.filter(t=>t.status===s.id);return `<section class="board-column" data-drop-status="${s.id}"><div class="board-col-header"><span class="board-status-line ${s.id}"></span>${esc(s.name)}<span class="board-count">${group.length}</span></div>${group.length?group.map(t=>`<article class="board-card" draggable="true" data-drag-id="${esc(t.id)}" data-edit-task="${esc(t.id)}"><h3 class="board-card-title">${esc(t.title)}</h3><div class="board-card-company">${esc(t.company||'No company')} · ${esc(t.category)}</div><div class="board-card-bottom"><span class="chip ${esc(t.priority)}">${esc(priorityObj(t.priority).name)}</span><span class="board-card-date ${isOverdue(t)?'late':''}">${esc(formatDate(t.dueDate))}</span></div></article>`).join(''):'<div class="board-empty">Drop tasks here</div>'}</section>`}).join('')}</div></div><p class="panel-sub" style="margin-top:10px">Drag cards to change status on desktop. On a phone, open a card to edit its status.</p>`}
  function renderCalendar(){const y=state.calendarYear,m=state.calendarMonth,first=new Date(y,m,1),last=new Date(y,m+1,0),start=first.getDay(),count=last.getDate(),cells=Math.ceil((start+count)/7)*7;let days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];let html=days.map(x=>`<div class="cal-dow">${x}</div>`).join('');for(let i=0;i<cells;i++){const d=new Date(y,m,1+i-start),date=dateToStr(d),outside=d.getMonth()!==m,list=data.tasks.filter(t=>t.dueDate===date).sort((a,b)=>a.status==='done'?1:b.status==='done'?-1:0),filingDates=allStatutoryDates().filter(x=>x.date===date);html+=`<div class="cal-day ${outside?'other-month':''} ${date===todayStr()?'today':''}"><button class="cal-day-num" title="Show tasks due ${date}" data-date-filter="${date}">${d.getDate()}</button>${filingDates.slice(0,2).map(x=>`<button class="cal-event statutory-${x.kind.toLowerCase()}" data-create-deadline="${x.kind}" data-company-id="${esc(x.company.id)}" title="${esc(x.company.name)} ${x.kind} due">${x.kind}: ${esc(x.company.name)}</button>`).join('')}${list.slice(0,Math.max(0,3-Math.min(2,filingDates.length))).map(t=>`<button class="cal-event ${isDone(t)?'done':isOverdue(t)?'overdue':''}" data-edit-task="${esc(t.id)}" title="${esc(t.title)}">${esc(t.title)}</button>`).join('')}${list.length+filingDates.length>3?`<div class="cal-more">+ ${list.length+filingDates.length-3} more</div>`:''}</div>`}return `<section class="panel calendar-panel"><div class="calendar-toolbar"><h2>${new Date(y,m,1).toLocaleDateString('en-MY',{month:'long',year:'numeric'})}</h2><div class="cal-nav"><button type="button" class="outline-btn small" data-cal-prev aria-label="Previous month">${svg('chevron-left')}</button><button type="button" class="outline-btn small" data-cal-today>Today</button><button type="button" class="outline-btn small" data-cal-next aria-label="Next month">${svg('chevron-right')}</button></div></div><div class="calendar-grid">${html}</div></section>`}
  function renderCompanies(){const query=(state.companyQuery||'').trim().toLowerCase();const companies=data.companies.filter(c=>!query||[c.name,c.reg].some(s=>String(s||'').toLowerCase().includes(query))).sort((a,b)=>a.name.localeCompare(b.name));return `<div class="section-heading"><h2>${plural(data.companies.length,'company')} in register</h2><button class="primary-btn" type="button" data-new-company>${svg('plus')} Add company</button></div><div class="company-list-controls"><div class="search-input">${svg('search')}<input id="searchCompanies" placeholder="Search company name or registration no." value="${esc(state.companyQuery||'')}"></div><button class="outline-btn" data-import-company-list type="button">${svg('upload')} Import Master Listing</button></div>${companies.length?`<div class="company-grid">${companies.map(c=>{const ct=data.tasks.filter(t=>t.company===c.name&&!isDone(t)).length;return `<article class="company-card"><div class="co-top"><span class="co-initial">${esc((c.name.match(/[A-Z]/g)||['C']).slice(0,2).join(''))}</span><button class="action-menu" data-edit-company="${esc(c.id)}" aria-label="Edit company">${svg('more-horizontal')}</button></div><div class="company-name">${esc(c.name)}</div><div class="company-reg">${esc(c.reg||'Registration number not set')}</div><div class="company-reg">${c.arDate?'AR anniversary: '+esc(formatDate(c.arDate,{year:true})):'AR anniversary: —'}</div><div class="company-filing-dates"><div><span>AR lodgement due</span><strong>${esc(c.arDueDate?formatDate(c.arDueDate,{year:true}):'Not set')}</strong></div><div><span>AFS lodgement due</span><strong>${esc(c.afsDueDate?formatDate(c.afsDueDate,{year:true}):c.afsDueStatus==='TBC'?'TBC':'Not provided')}</strong></div></div><div class="company-footer"><span class="muted">${plural(ct,'open task')}</span><button class="company-action" data-company-tasks="${esc(c.name)}">View tasks ${svg('arrow-right')}</button></div></article>`}).join('')}</div>`:emptyFull('Build your company portfolio','Add companies here to organize your AR, AFS, SSM and other secretarial work.')}`}
  // The original Master Listing is the authority for displayed dates.
  // No deadline is recomputed from incorporation date or FYE.
  const safeDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v||'')) ? String(v) : '';
  function allStatutoryDates(){
    const out=[];
    data.companies.forEach(c=>{
      if(safeDate(c.arDueDate))out.push({kind:'AR',date:c.arDueDate,company:c});
      if(safeDate(c.afsDueDate))out.push({kind:'AFS',date:c.afsDueDate,company:c});
    });
    return out.sort((a,b)=>a.date.localeCompare(b.date)||a.company.name.localeCompare(b.company.name)||a.kind.localeCompare(b.kind));
  }
  const deadlineDayStatus = date => !date?'missing':date<todayStr()?'past':date<=shiftDay(todayStr(),30)?'soon':'future';
  function deadlineNote(date){const status=deadlineDayStatus(date);return status==='past'?'Past source date · check filing status':status==='soon'?'Within next 30 days':'Future date'}
  function deadlineStats(){const all=allStatutoryDates();return {all,ar:all.filter(x=>x.kind==='AR').length,afs:all.filter(x=>x.kind==='AFS').length,soon:all.filter(x=>x.date>=todayStr()&&x.date<=shiftDay(todayStr(),30)),past:all.filter(x=>x.date<todayStr())}}
  function renderDeadlineSummary(){
    const d=deadlineStats();
    const next=d.soon.slice(0,6);
    return `<section class="panel compliance-summary"><div class="panel-head"><div><h2 class="panel-title">AR & AFS lodgement deadlines</h2><p class="panel-sub">Master Listing dates · Not a confirmation of filing status</p></div><button class="text-link" type="button" data-nav="deadlines">Open deadlines ${svg('arrow-right')}</button></div>
      <div class="deadline-kpis"><div><strong>${d.ar}</strong><span>AR dates</span></div><div><strong>${d.afs}</strong><span>AFS dates</span></div><div><strong>${d.soon.length}</strong><span>Next 30 days</span></div><div><strong>${d.past.length}</strong><span>Past source dates</span></div></div>
      ${next.length?`<div class="deadline-mini-list">${next.map(x=>`<div class="deadline-mini"><span class="deadline-tag ${x.kind.toLowerCase()}">${x.kind}</span><span class="deadline-mini-name">${esc(x.company.name)}</span><strong>${esc(formatDate(x.date,{year:true}))}</strong><button data-create-deadline="${x.kind}" data-company-id="${esc(x.company.id)}" title="Create a task for this date">${svg('plus')}</button></div>`).join('')}</div>`:'<p class="deadline-empty">No dated filings in the next 30 days. View all deadlines to inspect past and future dates.</p>'}
      <div class="deadline-legend">Past dates in the spreadsheet require checking; no lodgement-completion status was supplied.</div></section>`;
  }
  function renderDeadlines(){
    const summary=deadlineStats(),query=(state.deadlineQuery||'').toLowerCase().trim();
    const list=summary.all.filter(x=>(state.deadlineKind==='all'||x.kind===state.deadlineKind)
      &&(state.deadlinePeriod==='all'||(state.deadlinePeriod==='30'&&x.date>=todayStr()&&x.date<=shiftDay(todayStr(),30))||(state.deadlinePeriod==='past'&&x.date<todayStr())||(state.deadlinePeriod==='future'&&x.date>=todayStr()))
      &&(!query||[x.company.name,x.company.reg||'',x.kind].some(z=>String(z).toLowerCase().includes(query))));
    const missing=data.companies.filter(c=>!safeDate(c.afsDueDate));
    return `<div class="deadline-overview"><div class="deadline-overview-card"><strong>${summary.ar}</strong><span>AR due dates recorded</span></div><div class="deadline-overview-card"><strong>${summary.afs}</strong><span>AFS due dates recorded</span></div><div class="deadline-overview-card"><strong>${summary.soon.length}</strong><span>Dates in next 30 days</span></div><div class="deadline-overview-card"><strong>${missing.length}</strong><span>AFS dates missing / TBC</span></div></div>
      <section class="panel deadline-view"><div class="panel-head"><div><h2 class="panel-title">Lodgement due date register</h2><p class="panel-sub">${plural(list.length,'filing date')} shown · Dates supplied in the imported Master Listing</p></div><button class="outline-btn small" data-import-company-list type="button">${svg('upload')} Import revised list</button></div>
      <div class="deadline-controls"><div class="search-input">${svg('search')}<input id="searchDeadlines" placeholder="Search company or registration no." value="${esc(state.deadlineQuery)}" /></div>
      <select id="deadlineKind" aria-label="Type of lodgement"><option value="all" ${state.deadlineKind==='all'?'selected':''}>All filings</option><option value="AR" ${state.deadlineKind==='AR'?'selected':''}>Annual Return (AR)</option><option value="AFS" ${state.deadlineKind==='AFS'?'selected':''}>Financial Statements (AFS)</option></select>
      <select id="deadlinePeriod" aria-label="Deadline timeframe"><option value="all" ${state.deadlinePeriod==='all'?'selected':''}>All dates</option><option value="30" ${state.deadlinePeriod==='30'?'selected':''}>Next 30 days</option><option value="past" ${state.deadlinePeriod==='past'?'selected':''}>Past source dates</option><option value="future" ${state.deadlinePeriod==='future'?'selected':''}>Today onwards</option></select></div>
      <div class="table-wrap"><table class="deadline-table"><thead><tr><th>Company</th><th>Filing</th><th>Lodgement due</th><th>Source date status</th><th>Action</th></tr></thead><tbody>${list.map(x=>`<tr><td><strong>${esc(x.company.name)}</strong><small>${esc(x.company.reg||'')}</small></td><td><span class="deadline-tag ${x.kind.toLowerCase()}">${x.kind}</span></td><td class="deadline-nowrap">${esc(formatDate(x.date,{year:true}))}</td><td><span class="deadline-state ${deadlineDayStatus(x.date)}">${esc(deadlineNote(x.date))}</span></td><td><button class="outline-btn small" data-create-deadline="${x.kind}" data-company-id="${esc(x.company.id)}">${svg('plus')} New task</button></td></tr>`).join('')||'<tr><td colspan="5" class="muted-table">No dates match the current filters. Import your private Master Listing or change the filters.</td></tr>'}</tbody></table></div>
      <p class="deadline-disclaimer">A due date shown in the Master Listing does not establish that a filing is outstanding. Verify filing completion through your statutory records or SSM.</p></section>
      ${missing.length?`<section class="panel missing-dates"><div class="panel-head"><div><h2 class="panel-title">AFS dates requiring confirmation</h2><p class="panel-sub">No valid AFS lodgement date was entered in the Master Listing.</p></div></div><div class="missing-list">${missing.map(c=>`<div><span>${esc(c.name)}</span><span class="deadline-state uncertain">${esc(c.afsDueStatus==='TBC'?'TBC':'Not provided')}</span><button class="text-link" data-edit-company="${esc(c.id)}">Edit</button></div>`).join('')}</div></section>`:''}`;
  }
  function createTaskForDeadline(companyId,kind){
    const c=data.companies.find(x=>x.id===companyId);if(!c)return toast('Company record not found.',true);
    const due=kind==='AR'?c.arDueDate:c.afsDueDate;
    if(!safeDate(due))return toast('No valid '+kind+' lodgement date has been recorded.',true);
    openTask(null,kind==='AR'?'Annual Return (AR)':'Financial Statements (AFS)');
    $('#taskCompanySearch').value='';populateTaskCompanyDropdown(c.name);
    $('#taskCompany').value=c.name;
    $('#taskTitle').value=kind==='AR'?'Prepare and lodge Annual Return':'Prepare and lodge Audited Financial Statements';
    $('#taskCategory').value=kind==='AR'?'Annual Return (AR)':'Financial Statements (AFS)';
    $('#taskDue').value=due;
    $('#taskNotes').value='Deadline recorded in Master Listing(8).xlsx. Confirm the filing period and status before submission.';
    updateTaskDeadlineHint();
  }
  function updateTaskDeadlineHint(){
    const hint=$('#taskCompanyDeadlineHint');const company=data.companies.find(c=>c.name===$('#taskCompany').value);
    if(!company){hint.hidden=true;hint.innerHTML='';return;}
    hint.hidden=false;
    hint.innerHTML=`<strong>Company filing dates</strong><span>AR: ${company.arDueDate?esc(formatDate(company.arDueDate,{year:true})):'Not set'} · AFS: ${company.afsDueDate?esc(formatDate(company.afsDueDate,{year:true})):esc(company.afsDueStatus==='TBC'?'TBC':'Not provided')}</span><div class="hint-actions">${company.arDueDate?'<button type="button" data-use-company-deadline="AR">Use AR due date</button>':''}${company.afsDueDate?'<button type="button" data-use-company-deadline="AFS">Use AFS due date</button>':''}</div>`;
  }

  function renderActivity(){return `<section class="panel"><div class="panel-head"><div><h2 class="panel-title">Recent changes</h2><p class="panel-sub">Records are stored only in this browser and capped at 400 entries.</p></div></div>${data.activity.length?`<div class="timeline">${data.activity.map(e=>`<div class="history-row"><span class="history-dot">${svg('history')}</span><div class="history-line"><strong>${esc(e.action)}</strong> — ${esc(e.title)}<div class="history-sub">${esc(formatTime(e.at))}</div></div></div>`).join('')}</div>`:emptyInner('No activity yet','Create or update a task to start the activity log.','history')}</section>`}

// Native company dropdown with a separate searchable filter.
// Importing a new Master Listing preserves company selections already used in tasks.
function populateTaskCompanyDropdown(value='',query='') {
  const select=$('#taskCompany');
  const filter=String(query||'').trim().toLowerCase();
  const companies=new Map();
  data.companies.forEach(c=>companies.set(c.name,{name:c.name,reg:c.reg||''}));
  data.tasks.forEach(t=>{if(t.company && !companies.has(t.company))companies.set(t.company,{name:t.company,reg:''})});
  if(value && !companies.has(value))companies.set(value,{name:value,reg:''});
  const sorted=[...companies.values()].sort((a,b)=>a.name.localeCompare(b.name));
  const visible=sorted.filter(c=>!filter||c.name.toLowerCase().includes(filter)||c.reg.toLowerCase().includes(filter)||c.name===value);
  select.innerHTML='<option value="">General / No company selected</option>'+visible.map(c=>`<option value="${esc(c.name)}" ${value===c.name?'selected':''}>${esc(c.name)}${c.reg?' · '+esc(c.reg):''}</option>`).join('');
  select.value=value;
  if(!value)select.selectedIndex=0;
  select.dataset.itemsShown=String(visible.length);
}

  function openTask(id=null,template=null){const t=id?data.tasks.find(x=>x.id===id):null;if(id&&!t)return toast('Task not found.',true);$('#taskForm').reset();$('#taskId').value=t?.id||'';$('#taskDialogTitle').textContent=t?'Edit task':'Create a task';$('#saveTaskBtn').innerHTML=svg('check')+(t?' Save changes':' Create task');$('#deleteTaskBtn').hidden=!t;
    $('#taskCategory').innerHTML=CATEGORIES.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');$('#taskPriority').innerHTML=PRIORITIES.map(x=>`<option value="${x.id}">${x.name}</option>`).join('');$('#taskStatus').innerHTML=STATUSES.map(x=>`<option value="${x.id}">${x.name}</option>`).join('');$('#taskCompanySearch').value='';populateTaskCompanyDropdown(t?.company||'');
    $('#taskTitle').value=t?.title|| (template?templateTitle(template):'');$('#taskCompany').value=t?.company||'';$('#taskCategory').value=t?.category||(template||'General / Other');$('#taskDue').value=t?.dueDate||'';$('#taskPriority').value=t?.priority||'normal';$('#taskStatus').value=t?.status||'todo';$('#taskRepeat').value=t?.recurrence||'none';$('#taskAssignee').value=t?.assignee||'';$('#taskReference').value=t?.reference||'';$('#taskNotes').value=t?.notes||'';editingSteps=structuredClone(t?.checklist||[]);renderSteps();updateTaskDeadlineHint();$('#taskTitleError').hidden=true;$('#taskDialog').showModal();setTimeout(()=>$('#taskTitle').focus(),50);
  }
  function templateTitle(cat){return ({'Financial Statements (AFS)':'Prepare and lodge Audited Financial Statements','Annual Return (AR)':'Prepare and lodge Annual Return','Board Resolution':'Prepare Directors’ Resolution','SSM Lodgement / CRS':'Prepare and submit SSM lodgement','Client Follow-up':'Follow up with client'})[cat]||''}
  function renderSteps(){$('#checklistEditor').innerHTML=editingSteps.map(step=>`<div class="checklist-edit-row" data-step-id="${esc(step.id)}"><input type="checkbox" data-step-toggle="${esc(step.id)}" ${step.done?'checked':''} aria-label="Checklist done"><input type="text" data-step-text="${esc(step.id)}" value="${esc(step.text)}" maxlength="180" aria-label="Checklist step"><button type="button" data-step-remove="${esc(step.id)}" aria-label="Remove checklist step">${svg('x')}</button></div>`).join('')}
  function createFromForm(ev){ev.preventDefault();const id=$('#taskId').value;const title=$('#taskTitle').value.trim();if(!title){$('#taskTitleError').hidden=false;$('#taskTitle').focus();return;}const now=timestamp(),old=id?data.tasks.find(x=>x.id===id):null;
    const vals={title,company:$('#taskCompany').value.trim(),category:$('#taskCategory').value,priority:$('#taskPriority').value,status:$('#taskStatus').value,dueDate:$('#taskDue').value,assignee:$('#taskAssignee').value.trim(),reference:$('#taskReference').value.trim(),notes:$('#taskNotes').value.trim(),recurrence:$('#taskRepeat').value,checklist:editingSteps.map(s=>({...s,text:s.text.trim()})).filter(s=>s.text),updatedAt:now};
    if(old){const wasDone=isDone(old);Object.assign(old,vals);old.completedAt=isDone(old)?(old.completedAt||now):null;record('Updated task',title);if(!wasDone&&isDone(old))spawnRecurring(old);}else{const t={id:uniqueId(),...vals,createdAt:now,completedAt:vals.status==='done'?now:null};data.tasks.push(t);record('Created task',title);if(t.status==='done')spawnRecurring(t)}
    saveData();$('#taskDialog').close();render();toast(old?'Task updated.':'Task created.');
  }
  function spawnRecurring(t){if(!t.recurrence||t.recurrence==='none')return;const next=nextRecurring(t.dueDate||todayStr(),t.recurrence);let nextDate=next;let guard=0;while(nextDate<todayStr()&&guard++<500){nextDate=nextRecurring(nextDate,t.recurrence);}const already=data.tasks.some(x=>x.recurrenceParent===t.id);if(already)return;const fresh={...structuredClone(t),id:uniqueId(),status:'todo',dueDate:nextDate,createdAt:timestamp(),updatedAt:timestamp(),completedAt:null,recurrenceParent:t.id,checklist:(t.checklist||[]).map(s=>({...s,done:false}))};data.tasks.push(fresh);record('Created next recurring task',`${t.title} (${nextDate})`)}
  function toggleTask(id){const t=data.tasks.find(x=>x.id===id);if(!t)return;const before=isDone(t);t.status=before?'todo':'done';t.completedAt=before?null:timestamp();t.updatedAt=timestamp();record(before?'Reopened task':'Completed task',t.title);if(!before)spawnRecurring(t);saveData();render();toast(before?'Task reopened.':'Task completed.');}
  function changeTaskStatus(id,status){const t=data.tasks.find(x=>x.id===id);if(!t||!STATUSES.some(s=>s.id===status)||t.status===status)return;t.status=status;t.updatedAt=timestamp();t.completedAt=status==='done'?timestamp():null;record('Moved task to '+statusObj(status).name,t.title);if(status==='done')spawnRecurring(t);saveData();render();toast('Task moved to '+statusObj(status).name+'.')}
  function deleteTask(){const t=data.tasks.find(x=>x.id===$('#taskId').value);if(!t)return;if(!confirm(`Delete "${t.title}"? This cannot be undone without a backup.`))return;data.tasks=data.tasks.filter(x=>x.id!==t.id);record('Deleted task',t.title);saveData();$('#taskDialog').close();render();toast('Task deleted.')}
  function openCompany(id=null){const c=id?data.companies.find(x=>x.id===id):null;$('#companyForm').reset();$('#companyId').value=c?.id||'';$('#companyDialogTitle').textContent=c?'Edit company':'Add company';$('#companyName').value=c?.name||'';$('#companyReg').value=c?.reg||'';$('#companyAr').value=c?.arDate||'';$('#companyArDue').value=c?.arDueDate||'';$('#companyAfsDue').value=c?.afsDueDate||'';$('#companyAfsStatus').value=c?.afsDueStatus==='TBC'?'TBC':'not provided';$('#companyFinYearEnded').value=c?.financialYearEnded||'';$('#companyFye').value=c?.fye||'';$('#companyNotes').value=c?.notes||'';$('#deleteCompanyBtn').hidden=!c;$('#companyDialog').showModal();setTimeout(()=>$('#companyName').focus(),50)}
  function saveCompany(ev){ev.preventDefault();const name=$('#companyName').value.trim().toUpperCase();if(!name)return $('#companyName').focus();const id=$('#companyId').value;const old=id?data.companies.find(x=>x.id===id):null;const dupe=data.companies.find(x=>x.name.toUpperCase()===name&&x.id!==id);if(dupe)return toast('Company already exists. Edit that record instead.',true);const val={name,reg:$('#companyReg').value.trim(),arDate:$('#companyAr').value,arDueDate:$('#companyArDue').value,afsDueDate:$('#companyAfsDue').value,afsDueStatus:$('#companyAfsDue').value?'dated':$('#companyAfsStatus').value,financialYearEnded:$('#companyFinYearEnded').value,fye:$('#companyFye').value,notes:$('#companyNotes').value.trim(),updatedAt:timestamp()};if(old){const from=old.name;Object.assign(old,val);if(from!==name)data.tasks.forEach(t=>{if(t.company===from)t.company=name});record('Updated company',name)}else{data.companies.push({id:uniqueId(),...val,createdAt:timestamp()});record('Added company',name)}saveData();$('#companyDialog').close();render();toast(old?'Company updated.':'Company added.')}
  function deleteCompany(){const c=data.companies.find(x=>x.id===$('#companyId').value);if(!c)return;if(!confirm(`Remove "${c.name}" from the company register? Existing tasks will remain unchanged.`))return;data.companies=data.companies.filter(x=>x.id!==c.id);record('Removed company',c.name);saveData();$('#companyDialog').close();render();toast('Company removed. Existing tasks were retained.')}
  function download(filename,mime,text){const blob=new Blob([text],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000)}
function mergeCompanyRecords(payload,overwriteDates=false){
    const list=Array.isArray(payload)?payload:payload?.companies;
    if(!Array.isArray(list)||list.length>2000||!list.length)throw Error('Expected a JSON file containing a companies array.');
    let added=0, matched=0, updated=0;
    const keys=['arDate','arDueDate','afsDueDate','financialYearEnded','fye'];
    for(const raw of list){
      if(!raw||typeof raw.name!=='string'||!raw.name.trim())continue;
      const name=raw.name.trim().replace(/\s+/g,' ').slice(0,160).toUpperCase();
      const reg=typeof raw.reg==='string'?raw.reg.trim().slice(0,80):'';
      const values={name,reg};
      keys.forEach(key=>values[key]=safeDate(raw[key]));
      values.afsDueStatus=values.afsDueDate?'dated':raw.afsDueStatus==='TBC'?'TBC':'not provided';
      let company=data.companies.find(c=>(reg&&String(c.reg||'').toUpperCase()===reg.toUpperCase())||c.name.toUpperCase()===name);
      if(company){
        matched++;
        if(!company.reg&&reg){company.reg=reg;updated++;}
        for(const key of keys){
          if(values[key]&&(!company[key]||overwriteDates)&&company[key]!==values[key]){company[key]=values[key];updated++;}
        }
        if((!company.afsDueStatus||company.afsDueStatus==='not provided'||overwriteDates)&&company.afsDueStatus!==values.afsDueStatus){
          company.afsDueStatus=company.afsDueDate?'dated':values.afsDueStatus;updated++;
        }
      }else{
        data.companies.push({id:uniqueId(),...values,notes:'',createdAt:timestamp(),updatedAt:timestamp()});added++;
      }
    }
    return {added,matched,updated};
  }
  function createImportedStatutoryReviewTasks(companies){
    let created=0,existing=0;
    const dateKinds=[['arDueDate','Annual Return (AR)','Review Annual Return lodgement status'],
      ['afsDueDate','Financial Statements (AFS)','Review financial statements lodgement status']];
    const now=timestamp();
    for(const imported of companies){
      const reg=String(imported.reg||'').toUpperCase();
      const name=String(imported.name||'').trim().replace(/\s+/g,' ').toUpperCase();
      const company=data.companies.find(c=>(reg&&String(c.reg||'').toUpperCase()===reg)||c.name.toUpperCase()===name);
      if(!company)continue;
      for(const [field,category,title] of dateKinds){
        const dueDate=safeDate(imported[field]);if(!dueDate)continue;
        if(data.tasks.some(t=>t.company===company.name&&t.category===category&&t.dueDate===dueDate)){
          existing++;continue;
        }
        data.tasks.push({id:uniqueId(),title,company:company.name,category,priority:'normal',
          status:'todo',dueDate,assignee:'',reference:'MASTER LISTING',
          notes:'Imported lodgement due date is not proof that filing is outstanding. Verify status against SSM and statutory records before acting.',
          recurrence:'none',recurrenceParent:null,checklist:[],createdAt:now,updatedAt:now,completedAt:null});
        created++;
      }
    }
    return {created,existing};
  }

  function hubRequest(type,reply,payload){
    return new Promise((resolve,reject)=>{
      if(!EMBEDDED)return reject(Error('DMS connection unavailable.'));
      const requestId='transfer_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const timeout=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('DMS did not respond. Keep this page open and try again.'));},35000);
      function receive(e){
        if(e.source!==window.parent||e.origin!==window.location.origin||e.data?.type!==reply||e.data.requestId!==requestId)return;
        clearTimeout(timeout);window.removeEventListener('message',receive);
        if(e.data.ok)resolve(e.data);
        else reject(Error(e.data.error||'DMS file operation failed.'));
      }
      window.addEventListener('message',receive);
      window.parent.postMessage({type,requestId,...payload},window.location.origin);
    });
  }
  async function persistImport(candidate){
    if(EMBEDDED)await hubRequest('ZHENLI_HUB_SAVE_CONFIRM','ZHENLI_HUB_SAVE_RESULT',{payload:candidate});
    else localStorage.setItem(STORAGE_KEY,JSON.stringify(candidate));
  }
  function displayBackupStatus(filename,message){
    const wrap=$('#backupDownloadStatus');
    if(!wrap)return;
    wrap.hidden=false;
    $('#backupDownloadFilename').textContent=filename;
    $('#backupDownloadMessage').textContent=message;
  }
  async function saveExport(exported){
    const {filename,mime,contents}=exported;
    if(EMBEDDED){
      const result=await hubRequest('ZHENLI_HUB_EXPORT_FILE','ZHENLI_HUB_EXPORT_RESULT',{filename,mime,contents});
      displayBackupStatus(filename,result.method==='share'
        ? 'Save/share panel opened. Choose Files or Drive and pick a folder to keep this backup.'
        : 'Download requested. Check the browser Downloads list or Files → Downloads.');
      toast(result.method==='share'?'Select Files or Drive in the share panel to keep '+filename+'.':'Download started for '+filename+'. Check browser Downloads.');
      return;
    }
    const file=new File([contents],filename,{type:mime});
    if(typeof navigator.share==='function' && (!navigator.canShare||navigator.canShare({files:[file]}))){
      try {
        await navigator.share({title:filename,files:[file]});
        displayBackupStatus(filename,'Save/share panel opened. Choose Files or Drive and pick a folder.');
        return;
      }catch(e){if(e?.name==='AbortError'){displayBackupStatus(filename,'Save cancelled. Tap Save / share backup again when ready.');return;}}
    }
    download(filename,mime,contents);
    displayBackupStatus(filename,'Download started. Find the filename in your browser Downloads or Android Files → Downloads.');
    toast('Backup download requested: '+filename+'. Check Android Files → Downloads.');
  }
  async function importCompanies(file) {
    if(!file)return;
    const previous=structuredClone(data);
    try{
      if(!/\.(xlsx|json)$/i.test(file.name))throw Error('Select an Excel (.xlsx) or company JSON (.json) file.');
      if(file.size>5*1024*1024)throw Error('Master Listing file exceeds 5 MB.');
      const payload=/\.xlsx$/i.test(file.name)
        ? await window.ZHENLI_XLSX.parse(file)
        : JSON.parse(await file.text());
      const imported=Array.isArray(payload)?payload:payload?.companies;
      if(!Array.isArray(imported)||!imported.length)throw Error('No company records in import file.');
      const updateDates=!!$('#overwriteStatutoryDates')?.checked;
      const generateTasks=!!$('#createStatutoryReviewTasks')?.checked;
      const nAR=imported.filter(c=>safeDate(c.arDueDate)).length;
      const nAFS=imported.filter(c=>safeDate(c.afsDueDate)).length;
      if(generateTasks&&!confirm(`Create AR/AFS REVIEW tasks for up to ${nAR+nAFS} dated filings? Dates may relate to completed filings. Existing tasks will not be replaced; verify all imported due dates.`))return;
      const result=mergeCompanyRecords(payload,updateDates);
      const tasks=generateTasks?createImportedStatutoryReviewTasks(imported):{created:0,existing:0};
      record('Imported company dates',`${result.added} added, ${result.matched} matched, ${result.updated} dates filled/updated; ${tasks.created} review tasks created`);
      await persistImport(data);
      render();$('#importCompaniesStatus').textContent='Imported '+file.name+': '+result.added+' new, '+result.matched+' matched; '+nAR+' AR and '+nAFS+' AFS due dates; '+tasks.created+' review tasks created.';
      toast(`Imported ${result.added} new companies, ${result.matched} matched; ${nAR} AR and ${nAFS} AFS dates. ${tasks.created} review tasks created (${tasks.existing} already existed).`);
    }catch(err){data=previous;render();$('#importCompaniesStatus').textContent='Import failed for '+file.name+': '+err.message;toast('Master Listing import failed: '+err.message,true)}
    finally{$('#importCompaniesFile').value=''}
  }

  async function exportJson(){
    const now=new Date(),stamp=now.toISOString().replace(/[:.]/g,'-');
    lastExport={filename:'ZHENLI_TaskHub_Backup_'+stamp+'.json',mime:'application/json',contents:JSON.stringify({...data,exportedAt:timestamp(),app:'ZHENLI Secretarial Task Hub'},null,2)};
    displayBackupStatus(lastExport.filename,'Preparing your file…');
    try{await saveExport(lastExport);}catch(err){
      displayBackupStatus(lastExport.filename,'Save failed: '+err.message+'. Tap Save / share backup again.');
      toast('Could not save backup: '+err.message,true);
    }
  }
  function csvCell(v){let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
  function exportCsv(){const fields=['Title','Company','Category','Priority','Status','Due Date','Assigned To','Reference','Notes','Repeat','Checklist Done','Checklist Total','Created At','Updated At','Completed At'];let rows=[fields.join(',')];for(const t of data.tasks){rows.push([t.title,t.company,t.category,priorityObj(t.priority).name,statusObj(t.status).name,t.dueDate,t.assignee,t.reference,t.notes,t.recurrence,(t.checklist||[]).filter(s=>s.done).length,(t.checklist||[]).length,t.createdAt,t.updatedAt,t.completedAt].map(csvCell).join(','))}download(`ZHENLI_Tasks_${todayStr()}.csv`,'text/csv;charset=utf-8','\uFEFF'+rows.join('\r\n'));toast('CSV downloaded for Excel.')}
  async function importJson(file){
    if(!file)return;
    try{
      if(!/\.json$/i.test(file.name))throw Error('Select a Task Hub .json backup file.');
      if(file.size>10*1024*1024)throw Error('Backup file exceeds 10 MB.');
      const x=JSON.parse(await file.text());
      if(!x||!Array.isArray(x.tasks)||!Array.isArray(x.companies)||x.tasks.length>30000||x.companies.length>10000)
        throw Error('This is not a compatible Task Hub backup. For a Master Listing JSON, use Import Master Listing instead.');
      if(!confirm(`Replace the current ${data.tasks.length} tasks and ${data.companies.length} companies with backup ${file.name} (${x.tasks.length} tasks, ${x.companies.length} companies)? Export a backup before replacing data.`))return;
      const candidate={version:1,tasks:x.tasks.filter(t=>t&&typeof t.id==='string'&&typeof t.title==='string').map(t=>({id:t.id,title:t.title,company:t.company||'',category:CATEGORIES.includes(t.category)?t.category:'General / Other',priority:PRIORITIES.some(p=>p.id===t.priority)?t.priority:'normal',status:STATUSES.some(s=>s.id===t.status)?t.status:'todo',dueDate:/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)?t.dueDate:'',assignee:t.assignee||'',reference:t.reference||'',notes:t.notes||'',recurrence:['none','daily','weekly','monthly','yearly'].includes(t.recurrence)?t.recurrence:'none',recurrenceParent:t.recurrenceParent||null,checklist:Array.isArray(t.checklist)?t.checklist.filter(z=>z&&typeof z.text==='string').slice(0,1000):[],createdAt:t.createdAt||timestamp(),updatedAt:t.updatedAt||timestamp(),completedAt:t.completedAt||null})),companies:x.companies.filter(c=>c&&typeof c.id==='string'&&typeof c.name==='string').map(c=>({id:c.id,name:c.name,reg:c.reg||'',arDate:safeDate(c.arDate),arDueDate:safeDate(c.arDueDate),afsDueDate:safeDate(c.afsDueDate),afsDueStatus:c.afsDueStatus||'not provided',financialYearEnded:safeDate(c.financialYearEnded),fye:safeDate(c.fye),notes:c.notes||'',updatedAt:c.updatedAt||timestamp(),createdAt:c.createdAt||timestamp()})),activity:Array.isArray(x.activity)?x.activity.slice(0,400):[],settings:{...DEFAULT_DATA.settings,...x.settings}};
      candidate.activity=[{id:uniqueId(),at:timestamp(),action:'Restored backup',title:`${candidate.tasks.length} tasks, ${candidate.companies.length} companies`},...candidate.activity].slice(0,400);
      // Persist first; never replace the current in-memory workspace if save fails.
      await persistImport(candidate);
      data=candidate;$('#importBackupStatus').textContent='Restored from '+file.name+': '+candidate.tasks.length+' tasks, '+candidate.companies.length+' companies.';$('#settingsDialog').close();render();
      toast(`Restored ${candidate.tasks.length} tasks and ${candidate.companies.length} companies from ${file.name}.`);
    }catch(err){$('#importBackupStatus').textContent='Backup restore failed: '+err.message;toast('Backup restore failed: '+err.message,true);}
    finally{$('#importJsonFile').value='';}
  }
  function resetData(){if(!confirm('Permanently erase ALL tasks, companies and activity on this browser?'))return;const answer=prompt('To confirm, type DELETE in capital letters:');if(answer!=='DELETE')return toast('Reset cancelled.');data=structuredClone(DEFAULT_DATA);saveData();$('#settingsDialog').close();setView('dashboard');toast('Local workspace reset.')}
  function closeMobile(){$('#sidebar').classList.remove('open');$('#mobileBackdrop').hidden=true}
  function openMobile(){$('#sidebar').classList.add('open');$('#mobileBackdrop').hidden=false}
  function bindEvents(){document.addEventListener('click',e=>{const b=e.target.closest('button,[data-edit-task],[data-nav],[data-edit-company],[data-company-tasks]');if(!b)return;
    if(b.matches('.nav-link'))return setView(b.dataset.view);
    if(b.dataset.createDeadline)return createTaskForDeadline(b.dataset.companyId,b.dataset.createDeadline);
    if(b.dataset.useCompanyDeadline){const company=data.companies.find(c=>c.name===$('#taskCompany').value);if(company){const d=b.dataset.useCompanyDeadline==='AR'?company.arDueDate:company.afsDueDate;if(d){$('#taskDue').value=d;$('#taskCategory').value=b.dataset.useCompanyDeadline==='AR'?'Annual Return (AR)':'Financial Statements (AFS)';}}return;}
    if(b.dataset.nav)return setView(b.dataset.nav);
    if(b.hasAttribute('data-new-task'))return openTask();
    if(b.dataset.template)return openTask(null,b.dataset.template);
    if(b.dataset.toggleTask){e.stopPropagation();return toggleTask(b.dataset.toggleTask)}
    if(b.dataset.editTask)return openTask(b.dataset.editTask);
    if(b.hasAttribute('data-new-company'))return openCompany();
    if(b.hasAttribute('data-import-company-list'))return $('#importCompaniesFile').click();
    if(b.dataset.editCompany)return openCompany(b.dataset.editCompany);
    if(b.dataset.companyTasks){setView('all');state.filterCompany=b.dataset.companyTasks;return render()}
    if(b.dataset.close){const d=document.getElementById(b.dataset.close);if(d)d.close();return}
    if(b.hasAttribute('data-reset-filters')){state.query='';state.filterCompany='';state.filterPriority='';state.filterCategory='';state.filterStatus='';state.sort='due';return render()}
    if(b.hasAttribute('data-cal-prev')){state.calendarMonth--;if(state.calendarMonth<0){state.calendarMonth=11;state.calendarYear--}return render()}
    if(b.hasAttribute('data-cal-next')){state.calendarMonth++;if(state.calendarMonth>11){state.calendarMonth=0;state.calendarYear++}return render()}
    if(b.hasAttribute('data-cal-today')){state.calendarMonth=new Date().getMonth();state.calendarYear=new Date().getFullYear();return render()}
    if(b.dataset.dateFilter){setView('all');state.query='';state.filterStatus='';return displayDateFilter(b.dataset.dateFilter)}
    if(b.dataset.stepRemove){editingSteps=editingSteps.filter(x=>x.id!==b.dataset.stepRemove);return renderSteps()}
  });
    $('#taskForm').addEventListener('submit',createFromForm);$('#companyForm').addEventListener('submit',saveCompany);
    $('#topAddTask').addEventListener('click',()=>openTask());$('#quickCompanyBtn').addEventListener('click',()=>openCompany());$('#deleteTaskBtn').addEventListener('click',deleteTask);$('#deleteCompanyBtn').addEventListener('click',deleteCompany);
    $('#openSettings').addEventListener('click',()=>{$('#compactToggle').checked=data.settings.compact;$('#settingsDialog').showModal()});$('#themeToggle').addEventListener('click',()=>{data.settings.theme=data.settings.theme==='dark'?'light':'dark';saveData();render()});
    $('#compactToggle').addEventListener('change',e=>{data.settings.compact=e.target.checked;saveData();render()});
    $('#retryBackupSave').addEventListener('click',async()=>{if(!lastExport)return;try{await saveExport(lastExport)}catch(err){displayBackupStatus(lastExport.filename,'Save failed: '+err.message);toast(err.message,true)}});
    $('#sidebarBackup').addEventListener('click',exportJson);$('#footerExport').addEventListener('click',exportJson);$('#exportJson').addEventListener('click',exportJson);$('#exportCsv').addEventListener('click',exportCsv);$('#importJsonBtn').addEventListener('click',()=>$('#importJsonFile').click());$('#importJsonFile').addEventListener('change',e=>importJson(e.target.files[0]));$('#importCompaniesBtn').addEventListener('click',()=>$('#importCompaniesFile').click());$('#importCompaniesFile').addEventListener('change',e=>importCompanies(e.target.files[0]));$('#taskCompanySearch').addEventListener('input',e=>{populateTaskCompanyDropdown($('#taskCompany').value,e.target.value);updateTaskDeadlineHint()});$('#taskCompany').addEventListener('change',updateTaskDeadlineHint);$('#resetData').addEventListener('click',resetData);
    $('#menuToggle').addEventListener('click',openMobile);$('#mobileBackdrop').addEventListener('click',closeMobile);
    $('#addChecklistItem').addEventListener('click',()=>{const txt=$('#newChecklistText').value.trim();if(!txt)return;editingSteps.push({id:uniqueId(),text:txt,done:false});$('#newChecklistText').value='';renderSteps();$('#newChecklistText').focus()});$('#newChecklistText').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#addChecklistItem').click()}});
    document.addEventListener('change',e=>{if(e.target.matches('#companyFilter')){state.filterCompany=e.target.value;render()}if(e.target.matches('#priorityFilter')){state.filterPriority=e.target.value;render()}if(e.target.matches('#categoryFilter')){state.filterCategory=e.target.value;render()}if(e.target.matches('#sortFilter')){state.sort=e.target.value;render()}if(e.target.matches('#deadlineKind')){state.deadlineKind=e.target.value;render()}if(e.target.matches('#deadlinePeriod')){state.deadlinePeriod=e.target.value;render()}if(e.target.matches('[data-step-toggle]')){const s=editingSteps.find(x=>x.id===e.target.dataset.stepToggle);if(s)s.done=e.target.checked}});
    document.addEventListener('input',e=>{if(e.target.matches('#searchDeadlines')){const cursor=e.target.selectionStart||0;state.deadlineQuery=e.target.value;render();const box=$('#searchDeadlines');if(box){box.focus();box.setSelectionRange(cursor,cursor)}}if(e.target.matches('#searchTasks')){const cursor=e.target.selectionStart||0;state.query=e.target.value;render();const box=$('#searchTasks');if(box){box.focus();box.setSelectionRange(cursor,cursor)}}if(e.target.matches('#searchCompanies')){const cursor=e.target.selectionStart||0;state.companyQuery=e.target.value;render();const box=$('#searchCompanies');if(box){box.focus();box.setSelectionRange(cursor,cursor)}}if(e.target.matches('[data-step-text]')){const s=editingSteps.find(x=>x.id===e.target.dataset.stepText);if(s)s.text=e.target.value}});
    let dragId=null;document.addEventListener('dragstart',e=>{const card=e.target.closest('[data-drag-id]');if(card){dragId=card.dataset.dragId;card.classList.add('dragging');e.dataTransfer.effectAllowed='move'}});document.addEventListener('dragend',e=>{e.target.closest('[data-drag-id]')?.classList.remove('dragging');document.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'));dragId=null});document.addEventListener('dragover',e=>{const col=e.target.closest('[data-drop-status]');if(col){e.preventDefault();col.classList.add('drag-over')}});document.addEventListener('dragleave',e=>{const col=e.target.closest('[data-drop-status]');if(col&&!col.contains(e.relatedTarget))col.classList.remove('drag-over')});document.addEventListener('drop',e=>{const col=e.target.closest('[data-drop-status]');if(col&&dragId){e.preventDefault();changeTaskStatus(dragId,col.dataset.dropStatus);dragId=null}});
    for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d)d.close()});
  }
  function displayDateFilter(date){state.view='all';const results=data.tasks.filter(t=>t.dueDate===date&&!isDone(t));$('#pageContent').innerHTML=`<div class="section-heading"><h2>Due on ${esc(formatDate(date,{year:true}))}</h2><button class="outline-btn" data-nav="calendar">${svg('chevron-left')} Back to calendar</button></div><section class="panel">${results.length?`<div class="table-wrap"><table class="task-table"><thead><tr><th class="task-title-col">Task</th><th class="task-company-col">Company</th><th class="task-due-col">Due date</th><th class="task-priority-col">Priority</th><th class="task-status-col">Status</th><th></th></tr></thead><tbody>${results.map(renderRow).join('')}</tbody></table></div>`:emptyInner('No outstanding tasks','Nothing is due on this date.')}</section>`}
  function init(){renderIcons();bindEvents();render();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  if(EMBEDDED){
    const block=document.createElement('div');
    block.id='zh-hub-sync-wait';
    block.setAttribute('role','status');
    block.textContent='Connecting Task Hub to private cloud storage…';
    Object.assign(block.style,{position:'fixed',inset:'0',zIndex:'9999',display:'grid',placeItems:'center',background:'#f3f7fb',fontWeight:'600',color:'#183f63',padding:'24px',textAlign:'center'});
    document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(block),{once:true});
    window.addEventListener('message',event=>{
      if(event.source!==window.parent || event.origin!==window.location.origin || event.data?.type!=='ZHENLI_HUB_INIT')return;
      if(event.data.error){block.textContent='Task Hub storage needs setup: '+String(event.data.error);return;}
      const incoming=event.data.payload;
      if(incoming && Array.isArray(incoming.tasks) && Array.isArray(incoming.companies)){
        data={...structuredClone(DEFAULT_DATA),...incoming,settings:{...DEFAULT_DATA.settings,...incoming.settings}};
      } else {
        data=structuredClone(DEFAULT_DATA);
      }
      hubReady=true;
      block.remove();render();
      const pill=document.querySelector('.sidebar-footer');
      if(pill)pill.textContent='Cloud sync active · ZHENLI DMS';
    });
    window.parent.postMessage({type:'ZHENLI_HUB_READY'},window.location.origin);
  }

  // Testable state API (read-only) for local QA only.
  window.ZHENLI_TASK_HUB={getCounts:()=>({tasks:data.tasks.length,companies:data.companies.length,overdue:data.tasks.filter(isOverdue).length,arDueDates:deadlineStats().ar,afsDueDates:deadlineStats().afs}),getCompanies:()=>structuredClone(data.companies),getTasks:()=>structuredClone(data.tasks),importCompanyData:(payload)=>{const r=mergeCompanyRecords(payload,false);saveData();render();return r},version:'3.0.0'};
})();
