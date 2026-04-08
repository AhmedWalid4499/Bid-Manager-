// ============================================================
//  app.js — Bid Command v3
// ============================================================

import {
  addBid, updateBid, deleteBid, listenBids,
  addTask, updateTask, deleteTask, listenTasks,
  addContact, updateContact, deleteContact, listenContacts,
  addDocument, deleteDocument, listenDocuments
} from './firebase.js';

// ─── STATE ──────────────────────────────────────────────────
window.App = {
  bids: [], tasks: [], contacts: [], documents: [],
  activePage: 'dashboard',
  dragItem: null,
  editingBidId: null,
  editingTaskId: null,
  editingContactId: null,
  openDetailBidId: null,
  unsubscribers: []
};

// ─── UTILS ──────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; }, 3000);
  setTimeout(() => t.remove(), 3400);
}

function fmt$(v, cur = 'USD') {
  if (!v && v !== 0) return '—';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v); }
  catch { return `${cur} ${Number(v).toLocaleString()}`; }
}

function daysTo(d) {
  if (!d) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((new Date(d) - now) / 86400000);
}

function dlClass(d) {
  const n = daysTo(d);
  if (n === null) return '';
  if (n < 0)  return 'overdue';
  if (n <= 7) return 'soon';
  return '';
}

function dlText(d) {
  if (!d) return '—';
  const n = daysTo(d);
  if (n === null) return d;
  if (n === 0) return 'Due today';
  if (n < 0)  return `${Math.abs(n)}d overdue`;
  if (n === 1) return 'Tomorrow';
  if (n <= 7)  return `In ${n} days`;
  return d;
}

function statusBadge(s) {
  const map = {
    prep:      `<span class="badge badge-amber">In Preparation</span>`,
    active:    `<span class="badge badge-blue">Active</span>`,
    submitted: `<span class="badge badge-teal">Submitted</span>`,
    won:       `<span class="badge badge-green">✓ Won</span>`,
    lost:      `<span class="badge badge-red">Lost</span>`,
    paused:    `<span class="badge badge-grey">On Hold</span>`,
  };
  return map[s] || `<span class="badge badge-grey">${s}</span>`;
}

function statusDot(s) {
  const cls = { prep:'dot-prep', active:'dot-active', submitted:'dot-submitted', won:'dot-won', lost:'dot-lost', paused:'dot-paused' };
  return `<span class="status-dot ${cls[s]||''}"></span>`;
}

function bidPct(bid) {
  const t = App.tasks.filter(t => t.bidId === bid.id);
  if (!t.length) return 0;
  return Math.round(t.filter(t => t.status === 'done').length / t.length * 100);
}

function ring(pct, color = 'var(--blue-500)', size = 58) {
  const r = (size / 2) - 5;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return `<div class="ring-wrap" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="ring-bg" cx="${size/2}" cy="${size/2}" r="${r}"/>
      <circle class="ring-fill" cx="${size/2}" cy="${size/2}" r="${r}"
        stroke="${color}" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
    </svg>
    <div class="ring-label">${pct}%</div>
  </div>`;
}

function progBar(pct, color = '') {
  const cls = pct >= 80 ? 'green' : pct >= 40 ? '' : 'amber';
  return `<div class="progress-wrap">
    <div class="progress-top">
      <span class="progress-label">Completion</span>
      <span class="progress-pct">${pct}%</span>
    </div>
    <div class="progress-track">
      <div class="progress-fill ${color||cls}" style="width:${pct}%"></div>
    </div>
  </div>`;
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
window.closeModal = closeModal;

// ─── NAVIGATION ─────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(el => el.classList.add('active'));
  App.activePage = page;
  const titles = { dashboard:'Dashboard', bids:'Bids & Tenders', kanban:'Kanban Board', tasks:'Task Manager', contacts:'Contacts', documents:'Documents' };
  document.getElementById('topbar-title').textContent = titles[page] || '';
  renderPage(page);
}

function renderPage(p) {
  if (p === 'dashboard') renderDashboard();
  if (p === 'bids')      renderBids();
  if (p === 'kanban')    renderKanban();
  if (p === 'tasks')     renderTasks();
  if (p === 'contacts')  renderContacts();
  if (p === 'documents') renderDocuments();
}

// ─── FIREBASE LISTENERS ─────────────────────────────────────
function initListeners() {
  App.unsubscribers.forEach(u => u());
  App.unsubscribers = [
    listenBids(b => { App.bids = b; updateBadges(); renderPage(App.activePage); refreshDetailIfOpen(); }),
    listenTasks(t => { App.tasks = t; updateBadges(); renderPage(App.activePage); refreshDetailIfOpen(); }),
    listenContacts(c => { App.contacts = c; if (App.activePage === 'contacts') renderContacts(); }),
    listenDocuments(d => { App.documents = d; if (App.activePage === 'documents') renderDocuments(); }),
  ];
}

function updateBadges() {
  const ab = App.bids.filter(b => ['active','prep'].includes(b.status)).length;
  const pt = App.tasks.filter(t => t.status !== 'done').length;
  document.querySelectorAll('[data-badge="bids"]').forEach(el => { el.textContent = ab; el.style.display = ab ? '' : 'none'; });
  document.querySelectorAll('[data-badge="tasks"]').forEach(el => { el.textContent = pt; el.style.display = pt ? '' : 'none'; });
}

function refreshDetailIfOpen() {
  if (App.openDetailBidId && document.getElementById('modal-bid-detail')?.classList.contains('open')) {
    renderBidDetail(App.openDetailBidId);
  }
}

// ─── DASHBOARD ──────────────────────────────────────────────
function renderDashboard() {
  const { bids, tasks } = App;
  const active   = bids.filter(b => ['active','prep'].includes(b.status));
  const won      = bids.filter(b => b.status === 'won');
  const pending  = tasks.filter(t => t.status !== 'done');
  const overdue  = tasks.filter(t => t.status !== 'done' && t.dueDate && daysTo(t.dueDate) < 0);
  const decided  = bids.filter(b => ['won','lost'].includes(b.status));
  const winRate  = decided.length ? Math.round(won.length / decided.length * 100) : 0;
  const wonVal   = won.reduce((s,b) => s + (parseFloat(b.value)||0), 0);
  const urgent   = bids.filter(b => { const d = daysTo(b.submissionDate); return d !== null && d >= 0 && d <= 14 && !['won','lost','submitted'].includes(b.status); })
                       .sort((a,b) => daysTo(a.submissionDate) - daysTo(b.submissionDate));

  // Stats
  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-card-top">
        <div><div class="stat-label">Active Bids</div><div class="stat-value">${active.length}</div></div>
        <div class="stat-icon amber">📁</div>
      </div>
      <div class="stat-meta">${bids.length} total bids in system</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-top">
        <div><div class="stat-label">Pending Tasks</div><div class="stat-value">${pending.length}</div></div>
        <div class="stat-icon blue">✅</div>
      </div>
      <div class="stat-meta">${overdue.length > 0 ? `<span class="text-red">${overdue.length} overdue</span>` : 'All on track'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-top">
        <div><div class="stat-label">Win Rate</div><div class="stat-value">${winRate}%</div></div>
        <div class="stat-icon green">🏆</div>
      </div>
      <div class="stat-meta">${won.length} won of ${decided.length} decided</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-top">
        <div><div class="stat-label">Won Value</div><div class="stat-value" style="font-size:22px">${fmt$(wonVal)}</div></div>
        <div class="stat-icon teal">💰</div>
      </div>
      <div class="stat-meta">Secured contracts</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-top">
        <div><div class="stat-label">Due ≤ 14 Days</div><div class="stat-value">${urgent.length}</div></div>
        <div class="stat-icon red">⏰</div>
      </div>
      <div class="stat-meta">Bids needing attention</div>
    </div>
  `;

  // Urgent bids
  const el = document.getElementById('dash-urgent');
  if (!urgent.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">✅</div>
      <div class="empty-title">No urgent deadlines</div>
      <p class="empty-text">No bids due within the next 14 days.</p>
    </div>`;
  } else {
    el.innerHTML = urgent.map(b => bidCardHTML(b)).join('');
  }

  // Pipeline
  const statuses = [
    { k:'prep',      l:'In Preparation' },
    { k:'active',    l:'Active' },
    { k:'submitted', l:'Submitted' },
    { k:'won',       l:'Won' },
    { k:'lost',      l:'Lost' },
    { k:'paused',    l:'On Hold' },
  ];
  document.getElementById('dash-pipeline').innerHTML = statuses.map(s => {
    const count = bids.filter(b => b.status === s.k).length;
    const val   = bids.filter(b => b.status === s.k).reduce((sum,b) => sum + (parseFloat(b.value)||0), 0);
    return `<div class="fin-row">
      <span class="fin-label flex-center gap-8">${statusDot(s.k)} ${s.l}</span>
      <div class="flex-center gap-12">
        ${val ? `<span class="text-xs text-muted text-mono">${fmt$(val)}</span>` : ''}
        <span class="fin-value">${count}</span>
      </div>
    </div>`;
  }).join('');

  // Pending tasks (top 7)
  const top = tasks.filter(t => t.status !== 'done')
    .sort((a,b) => { if (!a.dueDate && !b.dueDate) return 0; if (!a.dueDate) return 1; if (!b.dueDate) return -1; return new Date(a.dueDate) - new Date(b.dueDate); })
    .slice(0, 7);
  document.getElementById('dash-tasks').innerHTML = top.length
    ? `<div class="task-list">${top.map(t => taskHTML(t, false)).join('')}</div>`
    : `<div class="empty-state" style="padding:40px"><div class="empty-icon">📋</div><div class="empty-title">No pending tasks</div></div>`;
}

// ─── BID CARD HTML ───────────────────────────────────────────
function bidCardHTML(b) {
  const pct   = bidPct(b);
  const tAll  = App.tasks.filter(t => t.bidId === b.id);
  const tDone = tAll.filter(t => t.status === 'done').length;
  const days  = daysTo(b.submissionDate);
  const depts = (b.departments||[]).slice(0,3).map(d => `<span class="badge badge-grey text-xs">${d}</span>`).join('');

  return `<div class="bid-card" onclick="window.openBidDetail('${b.id}')">
    <div class="bid-card-header">
      <div class="bid-card-info">
        <div class="bid-ref">${b.refNumber||'—'} · ${b.region||'MEA'}</div>
        <div class="bid-name">${b.name}</div>
        <div class="bid-client">🏢 ${b.client||'Client TBC'}</div>
      </div>
      ${ring(pct, pct >= 70 ? 'var(--green-500)' : pct >= 40 ? 'var(--amber-500)' : 'var(--blue-500)')}
    </div>

    <div class="bid-card-badges">
      ${statusBadge(b.status)}
      ${b.type ? `<span class="badge badge-grey">${b.type}</span>` : ''}
      ${days !== null && days >= 0 && days <= 14 ? `<span class="badge ${days<=3?'badge-red':days<=7?'badge-amber':'badge-blue'}">${days===0?'Due today':days+'d left'}</span>` : ''}
    </div>

    ${depts ? `<div class="flex-center gap-6" style="flex-wrap:wrap">${depts}</div>` : ''}

    <div class="bid-card-stats">
      <div class="bid-stat-item">
        <div class="bid-stat-label">Deadline</div>
        <div class="bid-stat-value ${days!==null&&days<=7?'red':days!==null&&days<=14?'amber':''}">${b.submissionDate||'—'}</div>
      </div>
      <div class="bid-stat-item">
        <div class="bid-stat-label">Value</div>
        <div class="bid-stat-value amber">${b.value ? fmt$(b.value, b.currency||'USD') : '—'}</div>
      </div>
      <div class="bid-stat-item">
        <div class="bid-stat-label">Tasks</div>
        <div class="bid-stat-value">${tDone}/${tAll.length}</div>
      </div>
    </div>
    ${progBar(pct)}
  </div>`;
}

// ─── BIDS PAGE ───────────────────────────────────────────────
function renderBids() {
  const search = (document.getElementById('bids-search')?.value||'').toLowerCase();
  const filter = document.getElementById('bids-filter')?.value||'all';
  let list = App.bids;
  if (filter !== 'all') list = list.filter(b => b.status === filter);
  if (search) list = list.filter(b => `${b.name}${b.client}${b.refNumber}`.toLowerCase().includes(search));

  const g = document.getElementById('bids-grid');
  if (!list.length) {
    g.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">📁</div>
      <div class="empty-title">No bids found</div>
      <p class="empty-text">Add your first bid or change the filters above.</p>
      <button class="btn btn-primary" onclick="window.openBidModal()" style="margin-top:16px">+ Add New Bid</button>
    </div>`;
    return;
  }
  g.innerHTML = list.map(b => bidCardHTML(b)).join('');
}

// ─── TASKS PAGE ──────────────────────────────────────────────
function renderTasks() {
  const search = (document.getElementById('tasks-search')?.value||'').toLowerCase();
  const fBid  = document.getElementById('tasks-bid-filter')?.value||'all';
  const fPri  = document.getElementById('tasks-priority-filter')?.value||'all';
  const fStat = document.getElementById('tasks-status-filter')?.value||'pending';

  const drop = document.getElementById('tasks-bid-filter');
  if (drop && !drop.dataset.pop) {
    App.bids.forEach(b => { const o=document.createElement('option'); o.value=b.id; o.textContent=b.name; drop.appendChild(o); });
    drop.dataset.pop = '1';
  }

  let list = App.tasks;
  if (fBid !== 'all')    list = list.filter(t => t.bidId === fBid);
  if (fPri !== 'all')    list = list.filter(t => t.priority === fPri);
  if (fStat === 'pending') list = list.filter(t => t.status !== 'done');
  if (fStat === 'done')    list = list.filter(t => t.status === 'done');
  if (search) list = list.filter(t => `${t.title}${t.description||''}`.toLowerCase().includes(search));
  list.sort((a,b) => { if (!a.dueDate&&!b.dueDate) return 0; if (!a.dueDate) return 1; if (!b.dueDate) return -1; return new Date(a.dueDate)-new Date(b.dueDate); });

  const total = App.tasks.length;
  const done  = App.tasks.filter(t => t.status === 'done').length;
  const pct   = total ? Math.round(done/total*100) : 0;

  document.getElementById('tasks-stats').innerHTML = `
    <div class="card card-padded mb-24">
      <div class="flex-center gap-24" style="flex-wrap:wrap">
        ${ring(pct, 'var(--green-500)', 70)}
        <div>
          <div class="stat-label">Overall Completion</div>
          <div class="stat-value">${pct}%</div>
          <div class="stat-meta">${done} of ${total} tasks done</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:32px;flex-wrap:wrap">
          <div style="text-align:center">
            <div class="stat-label">High Priority</div>
            <div style="font-size:28px;font-weight:700;color:var(--red-600)">${App.tasks.filter(t=>t.priority==='high'&&t.status!=='done').length}</div>
          </div>
          <div style="text-align:center">
            <div class="stat-label">Overdue</div>
            <div style="font-size:28px;font-weight:700;color:var(--red-600)">${App.tasks.filter(t=>t.status!=='done'&&t.dueDate&&daysTo(t.dueDate)<0).length}</div>
          </div>
          <div style="text-align:center">
            <div class="stat-label">Due This Week</div>
            <div style="font-size:28px;font-weight:700;color:var(--amber-600)">${App.tasks.filter(t=>t.status!=='done'&&t.dueDate&&daysTo(t.dueDate)>=0&&daysTo(t.dueDate)<=7).length}</div>
          </div>
        </div>
      </div>
    </div>`;

  const el = document.getElementById('tasks-list');
  el.innerHTML = list.length
    ? `<div class="task-list">${list.map(t => taskHTML(t, true)).join('')}</div>`
    : `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">No tasks found</div><p class="empty-text">Try changing filters or add a new task.</p></div>`;
}

function taskHTML(task, showActions = false) {
  const bid   = App.bids.find(b => b.id === task.bidId);
  const isDone = task.status === 'done';
  const dc    = isDone ? '' : dlClass(task.dueDate);
  return `<div class="task-item priority-${task.priority||'medium'} ${isDone?'done':''}">
    <div class="task-checkbox ${isDone?'checked':''}" onclick="window.toggleTask('${task.id}')"></div>
    <div class="task-body">
      <div class="task-title">${task.title}</div>
      <div class="task-meta">
        ${bid ? `<span class="task-bid-link">📁 ${bid.name}</span>` : ''}
        ${task.assignee ? `<span>👤 ${task.assignee}</span>` : ''}
        ${task.category ? `<span>${task.category}</span>` : ''}
      </div>
      ${task.description ? `<div class="text-sm text-muted" style="margin-top:4px">${task.description}</div>` : ''}
    </div>
    <div class="task-right">
      ${task.dueDate ? `<div class="task-due ${dc}">${isDone ? task.dueDate : dlText(task.dueDate)}</div>` : ''}
      <span class="badge ${task.priority==='high'?'badge-red':task.priority==='medium'?'badge-amber':'badge-blue'} text-xs">${task.priority||'med'}</span>
      ${showActions ? `<div class="task-actions">
        <button class="btn btn-secondary btn-icon-sm" onclick="event.stopPropagation();window.editTask('${task.id}')" title="Edit">✏️</button>
        <button class="btn btn-danger btn-icon-sm" onclick="event.stopPropagation();window.removeTask('${task.id}')" title="Delete">🗑</button>
      </div>` : ''}
    </div>
  </div>`;
}

window.toggleTask = async function(id) {
  const t = App.tasks.find(t => t.id === id);
  if (!t) return;
  const done = t.status !== 'done';
  await updateTask(id, { status: done?'done':'pending', kanbanStatus: done?'done':'todo' });
  showToast(done ? 'Task marked complete' : 'Task reopened');
};

window.removeTask = async function(id) {
  if (!confirm('Delete this task?')) return;
  await deleteTask(id);
  showToast('Task deleted');
};

// ─── KANBAN ──────────────────────────────────────────────────
function renderKanban() {
  const fBid = document.getElementById('kanban-bid-filter')?.value || 'all';
  const drop = document.getElementById('kanban-bid-filter');
  if (drop && !drop.dataset.pop) {
    App.bids.forEach(b => { const o=document.createElement('option'); o.value=b.id; o.textContent=b.name; drop.appendChild(o); });
    drop.dataset.pop = '1';
  }

  const tasks = fBid === 'all' ? App.tasks : App.tasks.filter(t => t.bidId === fBid);
  const cols = [
    { key:'todo',        label:'📋 To Do',       color:'' },
    { key:'in-progress', label:'⚡ In Progress',  color:'var(--blue-600)' },
    { key:'review',      label:'🔍 In Review',    color:'var(--amber-600)' },
    { key:'done',        label:'✅ Done',          color:'var(--green-600)' },
  ];

  document.getElementById('kanban-board').innerHTML = cols.map(col => {
    const items = tasks.filter(t => (t.kanbanStatus||(t.status==='done'?'done':'todo')) === col.key);
    return `<div class="kanban-col">
      <div class="kanban-col-head">
        <span class="kanban-col-title" style="${col.color?'color:'+col.color:''}">${col.label}</span>
        <span class="kanban-col-count">${items.length}</span>
      </div>
      <div class="kanban-items" data-col="${col.key}"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="window.kanbanDrop(event,'${col.key}')">
        ${items.map(t => kanbanCardHTML(t)).join('')}
        <button class="btn btn-secondary btn-sm w-full" style="margin-top:4px"
          onclick="window.openTaskModal('${col.key}','${fBid!=='all'?fBid:''}')">+ Add</button>
      </div>
    </div>`;
  }).join('');
}

function kanbanCardHTML(t) {
  const bid  = App.bids.find(b => b.id === t.bidId);
  const dc   = dlClass(t.dueDate);
  return `<div class="kanban-card" draggable="true"
    ondragstart="window.kanbanDragStart(event,'${t.id}')"
    ondragend="event.target.classList.remove('dragging')">
    ${bid?`<div class="kanban-card-bid">${bid.name}</div>`:''}
    <div class="kanban-card-title">${t.title}</div>
    ${t.assignee?`<div class="text-xs text-muted" style="margin-bottom:8px">👤 ${t.assignee}</div>`:''}
    <div class="kanban-card-foot">
      <span class="badge ${t.priority==='high'?'badge-red':t.priority==='medium'?'badge-amber':'badge-blue'} text-xs">${t.priority||'med'}</span>
      <div class="flex-center gap-6">
        ${t.dueDate?`<span class="text-xs ${dc==='overdue'?'text-red':dc==='soon'?'text-amber':'text-muted'}">${dlText(t.dueDate)}</span>`:''}
        <button class="btn btn-ghost btn-icon-sm" onclick="window.editTask('${t.id}')">✏️</button>
        <button class="btn btn-ghost btn-icon-sm" onclick="window.removeTask('${t.id}')">🗑</button>
      </div>
    </div>
  </div>`;
}

window.kanbanDragStart = function(e, id) {
  App.dragItem = id;
  setTimeout(() => e.target.classList.add('dragging'), 0);
};
window.kanbanDrop = async function(e, col) {
  e.preventDefault();
  document.querySelectorAll('.kanban-items').forEach(el => el.classList.remove('drag-over'));
  if (!App.dragItem) return;
  await updateTask(App.dragItem, { kanbanStatus: col, status: col==='done'?'done':'pending' });
  App.dragItem = null;
};

// ─── BID DETAIL ──────────────────────────────────────────────
window.openBidDetail = function(bidId) {
  App.openDetailBidId = bidId;
  renderBidDetail(bidId);
  openModal('modal-bid-detail');
};

function renderBidDetail(bidId) {
  const bid = App.bids.find(b => b.id === bidId);
  if (!bid) return;
  const tasks = App.tasks.filter(t => t.bidId === bidId);
  const pct   = bidPct(bid);
  const days  = daysTo(bid.submissionDate);

  document.querySelector('#modal-bid-detail .modal-title').textContent = bid.name;

  let alertHtml = '';
  if (days !== null && days >= 0 && days <= 7 && !['won','lost'].includes(bid.status))
    alertHtml = `<div class="alert alert-${days<=3?'danger':'warning'}">⏰ Submission in <strong>${days===0?'TODAY':days+' days'}</strong> — ${bid.submissionDate}</div>`;
  else if (days !== null && days < 0 && !['won','lost','submitted'].includes(bid.status))
    alertHtml = `<div class="alert alert-danger">⚠️ Deadline passed ${Math.abs(days)} days ago</div>`;

  document.getElementById('bid-detail-body').innerHTML = `
    ${alertHtml}
    <div class="tabs">
      <button class="tab-btn active" onclick="window.switchBidTab(this,'overview')">Overview</button>
      <button class="tab-btn" onclick="window.switchBidTab(this,'tasks')">Tasks (${tasks.length})</button>
      <button class="tab-btn" onclick="window.switchBidTab(this,'financials')">Financials</button>
      <button class="tab-btn" onclick="window.switchBidTab(this,'teams')">Teams & Notes</button>
    </div>

    <!-- OVERVIEW -->
    <div id="bt-overview">
      <div class="info-grid mb-20">
        <div class="info-block"><div class="info-block-label">Reference</div><div class="info-block-value text-mono">${bid.refNumber||'—'}</div></div>
        <div class="info-block"><div class="info-block-label">Status</div><div class="info-block-value">${statusBadge(bid.status)}</div></div>
        <div class="info-block"><div class="info-block-label">Client</div><div class="info-block-value">🏢 ${bid.client||'—'}</div></div>
        <div class="info-block"><div class="info-block-label">Region</div><div class="info-block-value">${bid.region||'—'}</div></div>
        <div class="info-block"><div class="info-block-label">Submission Deadline</div><div class="info-block-value ${days!==null&&days<=7?'text-red':days!==null&&days<=14?'text-amber':''}">${bid.submissionDate||'—'}</div></div>
        <div class="info-block"><div class="info-block-label">Bid Type</div><div class="info-block-value">${bid.type||'—'}</div></div>
        <div class="info-block"><div class="info-block-label">Bid Lead</div><div class="info-block-value">${bid.lead||'—'}</div></div>
        <div class="info-block"><div class="info-block-label">Contract Value</div><div class="info-block-value text-amber">${bid.value?fmt$(bid.value,bid.currency||'USD'):'—'}</div></div>
      </div>
      ${bid.description?`<div class="card card-padded mb-16"><div class="card-title mb-8">Scope & Description</div><div style="font-size:14px;line-height:1.8;color:var(--grey-700)">${bid.description}</div></div>`:''}
      <div class="card card-padded">
        <div class="card-title mb-16">Progress</div>
        <div class="flex-center gap-20">
          ${ring(pct, pct>=70?'var(--green-500)':pct>=40?'var(--amber-500)':'var(--blue-500)', 70)}
          <div style="flex:1">${progBar(pct)}<div class="text-sm text-muted mt-8">${tasks.filter(t=>t.status==='done').length} of ${tasks.length} tasks complete</div></div>
        </div>
      </div>
    </div>

    <!-- TASKS -->
    <div id="bt-tasks" style="display:none">
      <div class="section-header mb-16">
        <h3 class="section-title">Tasks for This Bid</h3>
        <button class="btn btn-primary btn-sm" onclick="window.openTaskModal('todo','${bidId}')">+ Add Task</button>
      </div>
      <div id="bid-tasks-list">
        ${tasks.length
          ? `<div class="task-list">${tasks.map(t => taskHTML(t, true)).join('')}</div>`
          : `<div class="empty-state" style="padding:48px">
              <div class="empty-icon">📋</div>
              <div class="empty-title">No tasks yet</div>
              <p class="empty-text">Add tasks to track exactly what needs to be done for this bid.</p>
              <button class="btn btn-primary" onclick="window.openTaskModal('todo','${bidId}')" style="margin-top:16px">+ Add First Task</button>
            </div>`
        }
      </div>
    </div>

    <!-- FINANCIALS — EDITABLE -->
    <div id="bt-financials" style="display:none">
      <div class="flex-between mb-20">
        <h3 class="section-title">Financial Details</h3>
        <button class="btn btn-amber btn-sm" onclick="window.saveFinancials('${bidId}')">💾 Save Financials</button>
      </div>
      <div class="card card-padded mb-16">
        <div class="form-section">💰 Contract & Value</div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Estimated Contract Value</label>
            <input class="form-control" id="fin-value" type="number" value="${bid.value||''}" placeholder="e.g. 5000000">
          </div>
          <div class="form-group">
            <label class="form-label">Currency</label>
            <select class="form-control" id="fin-currency">
              ${['USD','EUR','GBP','AED','SAR','EGP','LBP','JOD','KWD','QAR','OMR','BHD','MAD'].map(c=>`<option value="${c}" ${bid.currency===c?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Internal Cost Estimate</label>
            <input class="form-control" id="fin-cost" type="number" value="${bid.costEstimate||''}" placeholder="Our cost to deliver">
          </div>
          <div class="form-group">
            <label class="form-label">Target Margin %</label>
            <input class="form-control" id="fin-margin" type="number" value="${bid.margin||''}" placeholder="e.g. 25">
          </div>
          <div class="form-group">
            <label class="form-label">Payment Terms</label>
            <input class="form-control" id="fin-payment" value="${bid.paymentTerms||''}" placeholder="e.g. 30/60/10 milestone payments">
          </div>
          <div class="form-group">
            <label class="form-label">Bond / Guarantee</label>
            <input class="form-control" id="fin-bond" value="${bid.bond||''}" placeholder="e.g. 5% performance bond">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Financial Notes</label>
          <textarea class="form-control" id="fin-notes">${bid.financialNotes||''}</textarea>
        </div>
      </div>
      <div class="card card-padded">
        <div class="form-section">📊 Summary</div>
        <div class="fin-row"><span class="fin-label">Contract Value</span><span class="fin-value positive">${fmt$(bid.value, bid.currency||'USD')}</span></div>
        <div class="fin-row"><span class="fin-label">Internal Cost</span><span class="fin-value">${fmt$(bid.costEstimate, bid.currency||'USD')}</span></div>
        <div class="fin-row"><span class="fin-label">Gross Profit</span><span class="fin-value ${bid.value&&bid.costEstimate&&bid.value>bid.costEstimate?'positive':'negative'}">${bid.value&&bid.costEstimate?fmt$(bid.value-bid.costEstimate,bid.currency||'USD'):'—'}</span></div>
        <div class="fin-row"><span class="fin-label">Margin %</span><span class="fin-value ${(bid.margin||0)>=20?'positive':'warning'}">${bid.margin?bid.margin+'%':'—'}</span></div>
        <div class="fin-row"><span class="fin-label">Payment Terms</span><span class="fin-value">${bid.paymentTerms||'—'}</span></div>
        <div class="fin-row"><span class="fin-label">Bond / Guarantee</span><span class="fin-value">${bid.bond||'—'}</span></div>
      </div>
    </div>

    <!-- TEAMS & NOTES — EDITABLE -->
    <div id="bt-teams" style="display:none">
      <div class="flex-between mb-20">
        <h3 class="section-title">Teams, Departments & Notes</h3>
        <button class="btn btn-amber btn-sm" onclick="window.saveTeamsNotes('${bidId}')">💾 Save Changes</button>
      </div>
      <div class="card card-padded mb-16">
        <div class="form-section">🏗️ Departments Involved <span class="text-xs text-muted fw-600">(click to toggle)</span></div>
        <div class="chip-group" id="detail-depts">
          ${['MEP','Structure','Architecture','Civil','Electrical','Mechanical','IT/ICT','Sustainability','Project Management','Cost Management','Planning','Environmental'].map(d=>
            `<span class="chip ${(bid.departments||[]).includes(d)?'selected':''}" onclick="this.classList.toggle('selected')" data-dept="${d}">${d}</span>`
          ).join('')}
        </div>
      </div>
      <div class="card card-padded mb-16">
        <div class="form-section">👥 Key People</div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Bid Lead / Manager</label>
            <input class="form-control" id="td-lead" value="${bid.lead||''}" placeholder="Name of bid manager">
          </div>
          <div class="form-group">
            <label class="form-label">Technical Lead</label>
            <input class="form-control" id="td-tech" value="${bid.technicalLead||''}" placeholder="Technical discipline lead">
          </div>
          <div class="form-group">
            <label class="form-label">Sub-consultants / Partners</label>
            <input class="form-control" id="td-subs" value="${bid.subConsultants||''}" placeholder="Any sub-consultants involved">
          </div>
          <div class="form-group">
            <label class="form-label">Client Contact Person</label>
            <input class="form-control" id="td-contact" value="${bid.clientContact||''}" placeholder="Client point of contact">
          </div>
        </div>
      </div>
      <div class="card card-padded mb-16">
        <div class="form-section">📋 Requirements</div>
        <div class="form-group">
          <label class="form-label">Prequalification Status</label>
          <select class="form-control" id="td-preq">
            ${['N/A','Not Started','In Progress','Submitted','Approved','Rejected'].map(s=>`<option value="${s}" ${bid.prequalStatus===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Special Requirements / Compliance</label>
          <textarea class="form-control" id="td-reqs">${bid.requirements||''}</textarea>
        </div>
      </div>
      <div class="card card-padded">
        <div class="form-section">📝 Strategy & Notes</div>
        <div class="form-group">
          <label class="form-label">Win Strategy</label>
          <textarea class="form-control" id="td-strategy" placeholder="Our competitive advantage for this bid...">${bid.strategy||''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Risks & Concerns</label>
          <textarea class="form-control" id="td-risks" placeholder="Known risks or red flags...">${bid.risks||''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">General Notes</label>
          <textarea class="form-control" id="td-notes" placeholder="Anything else to keep track of...">${bid.notes||''}</textarea>
        </div>
      </div>
    </div>
  `;

  document.getElementById('bid-detail-edit-btn').onclick = () => { closeModal('modal-bid-detail'); window.openBidModal(bidId); };
  document.getElementById('bid-detail-delete-btn').onclick = () => {
    if (confirm(`Delete "${bid.name}"? This cannot be undone.`)) {
      deleteBid(bidId).then(() => { closeModal('modal-bid-detail'); App.openDetailBidId = null; showToast('Bid deleted'); });
    }
  };
}

window.switchBidTab = function(btn, tab) {
  document.querySelectorAll('#bid-detail-body .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['overview','tasks','financials','teams'].forEach(t => {
    const el = document.getElementById(`bt-${t}`);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
};

window.saveFinancials = async function(bidId) {
  try {
    await updateBid(bidId, {
      value: parseFloat(document.getElementById('fin-value').value)||null,
      currency: document.getElementById('fin-currency').value,
      costEstimate: parseFloat(document.getElementById('fin-cost').value)||null,
      margin: parseFloat(document.getElementById('fin-margin').value)||null,
      paymentTerms: document.getElementById('fin-payment').value.trim(),
      bond: document.getElementById('fin-bond').value.trim(),
      financialNotes: document.getElementById('fin-notes').value.trim(),
    });
    showToast('Financials saved');
  } catch(e) { showToast('Error: '+e.message, 'error'); }
};

window.saveTeamsNotes = async function(bidId) {
  const departments = [...document.querySelectorAll('#detail-depts .chip.selected')].map(el => el.dataset.dept);
  try {
    await updateBid(bidId, {
      departments,
      lead: document.getElementById('td-lead').value.trim(),
      technicalLead: document.getElementById('td-tech').value.trim(),
      subConsultants: document.getElementById('td-subs').value.trim(),
      clientContact: document.getElementById('td-contact').value.trim(),
      prequalStatus: document.getElementById('td-preq').value,
      requirements: document.getElementById('td-reqs').value.trim(),
      strategy: document.getElementById('td-strategy').value.trim(),
      risks: document.getElementById('td-risks').value.trim(),
      notes: document.getElementById('td-notes').value.trim(),
    });
    showToast('Teams & notes saved');
  } catch(e) { showToast('Error: '+e.message, 'error'); }
};

// ─── BID FORM ────────────────────────────────────────────────
window.openBidModal = function(bidId = null) {
  App.editingBidId = bidId;
  const bid = bidId ? App.bids.find(b => b.id === bidId) : null;
  document.querySelector('#modal-bid-form .modal-title').textContent = bid ? `Edit: ${bid.name}` : 'New Bid';
  const depts = ['MEP','Structure','Architecture','Civil','Electrical','Mechanical','IT/ICT','Sustainability','Project Management','Cost Management','Planning','Environmental'];
  const checked = bid?.departments || [];

  document.getElementById('bid-form-body').innerHTML = `
    <div class="form-section">📋 Basic Information</div>
    <div class="form-group">
      <label class="form-label">Bid / Project Name <span style="color:var(--red-500)">*</span></label>
      <input class="form-control" id="bf-name" value="${bid?.name||''}" placeholder="Full project name">
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Reference Number</label>
        <input class="form-control" id="bf-ref" value="${bid?.refNumber||''}" placeholder="e.g. DAH-2025-001">
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-control" id="bf-status">
          ${[['prep','In Preparation'],['active','Active'],['submitted','Submitted'],['won','Won'],['lost','Lost'],['paused','On Hold']].map(([v,l])=>`<option value="${v}" ${bid?.status===v?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Client / Owner</label>
        <input class="form-control" id="bf-client" value="${bid?.client||''}" placeholder="Client organization">
      </div>
      <div class="form-group">
        <label class="form-label">Region</label>
        <select class="form-control" id="bf-region">
          ${['MEA','GCC','Middle East','Levant','North Africa','East Africa','West Africa','South Asia','Europe','Other'].map(r=>`<option value="${r}" ${bid?.region===r?'selected':''}>${r}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Bid Type</label>
        <select class="form-control" id="bf-type">
          ${['Technical Proposal','Cost Proposal','EOI','Prequalification','Full Tender','Design Competition','Framework Agreement','Other'].map(t=>`<option value="${t}" ${bid?.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Submission Deadline</label>
        <input class="form-control" type="date" id="bf-date" value="${bid?.submissionDate||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Bid Lead</label>
        <input class="form-control" id="bf-lead" value="${bid?.lead||''}" placeholder="Person managing this bid">
      </div>
      <div class="form-group">
        <label class="form-label">Prequalification</label>
        <select class="form-control" id="bf-preq">
          ${['N/A','Not Started','In Progress','Submitted','Approved','Rejected'].map(s=>`<option value="${s}" ${bid?.prequalStatus===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-section">💰 Financials</div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Estimated Value</label>
        <input class="form-control" type="number" id="bf-value" value="${bid?.value||''}" placeholder="Contract value">
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <select class="form-control" id="bf-currency">
          ${['USD','EUR','GBP','AED','SAR','EGP','LBP','JOD','KWD','QAR','OMR','BHD','MAD'].map(c=>`<option value="${c}" ${bid?.currency===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Internal Cost Estimate</label>
        <input class="form-control" type="number" id="bf-cost" value="${bid?.costEstimate||''}" placeholder="Our cost to deliver">
      </div>
      <div class="form-group">
        <label class="form-label">Target Margin %</label>
        <input class="form-control" type="number" id="bf-margin" value="${bid?.margin||''}" placeholder="e.g. 25">
      </div>
    </div>

    <div class="form-section">🏗️ Departments</div>
    <div class="form-group">
      <label class="form-label">Departments Involved <span class="form-label-optional">(click to select)</span></label>
      <div class="chip-group">
        ${depts.map(d=>`<span class="chip ${checked.includes(d)?'selected':''}" onclick="this.classList.toggle('selected')" data-dept="${d}">${d}</span>`).join('')}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Scope / Description</label>
      <textarea class="form-control" id="bf-desc">${bid?.description||''}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Internal Notes</label>
      <textarea class="form-control" id="bf-notes">${bid?.notes||''}</textarea>
    </div>
  `;
  openModal('modal-bid-form');
};

window.saveBid = async function() {
  const name = document.getElementById('bf-name').value.trim();
  if (!name) { showToast('Bid name is required', 'error'); return; }
  const departments = [...document.querySelectorAll('#bid-form-body .chip.selected')].map(el => el.dataset.dept);
  try {
    const data = {
      name,
      refNumber: document.getElementById('bf-ref').value.trim(),
      status: document.getElementById('bf-status').value,
      client: document.getElementById('bf-client').value.trim(),
      region: document.getElementById('bf-region').value,
      type: document.getElementById('bf-type').value,
      submissionDate: document.getElementById('bf-date').value||null,
      lead: document.getElementById('bf-lead').value.trim(),
      prequalStatus: document.getElementById('bf-preq').value,
      value: parseFloat(document.getElementById('bf-value').value)||null,
      currency: document.getElementById('bf-currency').value,
      costEstimate: parseFloat(document.getElementById('bf-cost').value)||null,
      margin: parseFloat(document.getElementById('bf-margin').value)||null,
      departments,
      description: document.getElementById('bf-desc').value.trim(),
      notes: document.getElementById('bf-notes').value.trim(),
    };
    if (App.editingBidId) { await updateBid(App.editingBidId, data); showToast('Bid updated'); }
    else { await addBid(data); showToast('Bid created'); }
    closeModal('modal-bid-form');
  } catch(e) { showToast('Error: '+e.message, 'error'); }
};

// ─── TASK FORM ───────────────────────────────────────────────
window.openTaskModal = function(kStatus='todo', bId='') {
  App.editingTaskId = null;
  document.querySelector('#modal-task-form .modal-title').textContent = 'New Task';
  buildTaskForm(null, kStatus, bId);
  openModal('modal-task-form');
};

window.editTask = function(id) {
  App.editingTaskId = id;
  const t = App.tasks.find(t => t.id === id);
  document.querySelector('#modal-task-form .modal-title').textContent = 'Edit Task';
  buildTaskForm(t);
  openModal('modal-task-form');
};

function buildTaskForm(task, kStatus='todo', bId='') {
  document.getElementById('task-form-body').innerHTML = `
    <div class="form-group">
      <label class="form-label">Task Title <span style="color:var(--red-500)">*</span></label>
      <input class="form-control" id="tf-title" value="${task?.title||''}" placeholder="Describe the task clearly">
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Related Bid</label>
        <select class="form-control" id="tf-bid">
          <option value="">— General Task —</option>
          ${App.bids.map(b=>`<option value="${b.id}" ${(task?.bidId||bId)===b.id?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-control" id="tf-priority">
          <option value="low" ${task?.priority==='low'?'selected':''}>🟢 Low</option>
          <option value="medium" ${(!task||task?.priority==='medium')?'selected':''}>🟡 Medium</option>
          <option value="high" ${task?.priority==='high'?'selected':''}>🔴 High</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Due Date</label>
        <input class="form-control" type="date" id="tf-due" value="${task?.dueDate||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Board Column</label>
        <select class="form-control" id="tf-kanban">
          <option value="todo" ${(task?.kanbanStatus||kStatus)==='todo'?'selected':''}>📋 To Do</option>
          <option value="in-progress" ${(task?.kanbanStatus||kStatus)==='in-progress'?'selected':''}>⚡ In Progress</option>
          <option value="review" ${(task?.kanbanStatus||kStatus)==='review'?'selected':''}>🔍 In Review</option>
          <option value="done" ${(task?.kanbanStatus||kStatus)==='done'?'selected':''}>✅ Done</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Assigned To</label>
        <input class="form-control" id="tf-assignee" value="${task?.assignee||''}" placeholder="Team member name">
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-control" id="tf-category">
          ${['Technical Writing','Cost Estimation','Drawings & Design','Review & QC','Submission','Meeting','Research','Compliance Check','Prequalification','Client Communication','Other'].map(c=>`<option value="${c}" ${task?.category===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes <span class="form-label-optional">(optional)</span></label>
      <textarea class="form-control" id="tf-desc">${task?.description||''}</textarea>
    </div>
  `;
}

window.saveTask = async function() {
  const title = document.getElementById('tf-title').value.trim();
  if (!title) { showToast('Task title is required', 'error'); return; }
  const k = document.getElementById('tf-kanban').value;
  try {
    const data = { title, bidId: document.getElementById('tf-bid').value||null, priority: document.getElementById('tf-priority').value, dueDate: document.getElementById('tf-due').value||null, kanbanStatus: k, status: k==='done'?'done':'pending', assignee: document.getElementById('tf-assignee').value.trim(), category: document.getElementById('tf-category').value, description: document.getElementById('tf-desc').value.trim() };
    if (App.editingTaskId) { await updateTask(App.editingTaskId, data); showToast('Task updated'); }
    else { await addTask(data); showToast('Task added'); }
    closeModal('modal-task-form');
  } catch(e) { showToast('Error: '+e.message, 'error'); }
};

// ─── CONTACTS ────────────────────────────────────────────────
function renderContacts() {
  const s = (document.getElementById('contacts-search')?.value||'').toLowerCase();
  const list = App.contacts.filter(c => !s || `${c.name}${c.company}${c.role}`.toLowerCase().includes(s));
  document.getElementById('contacts-tbody').innerHTML = list.length ? list.map(c => `<tr>
    <td><div class="fw-600" style="color:var(--grey-900)">${c.name}</div><div class="text-sm text-muted">${c.email||''}</div></td>
    <td>${c.role||'—'}</td>
    <td>${c.company||'—'}</td>
    <td><span class="badge badge-blue text-xs">${c.department||'—'}</span></td>
    <td class="text-mono text-sm">${c.phone||'—'}</td>
    <td><div class="flex-center gap-8"><button class="btn btn-secondary btn-sm" onclick="window.editContact('${c.id}')">✏️ Edit</button><button class="btn btn-danger btn-sm" onclick="window.removeContact('${c.id}')">🗑</button></div></td>
  </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">No contacts yet</div></div></td></tr>`;
}

window.openContactModal = function() {
  App.editingContactId = null;
  document.querySelector('#modal-contact-form .modal-title').textContent = 'Add Contact';
  buildContactForm(null);
  openModal('modal-contact-form');
};

window.editContact = function(id) {
  App.editingContactId = id;
  const c = App.contacts.find(c => c.id === id);
  document.querySelector('#modal-contact-form .modal-title').textContent = 'Edit Contact';
  buildContactForm(c);
  openModal('modal-contact-form');
};

function buildContactForm(c) {
  document.getElementById('contact-form-body').innerHTML = `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Full Name <span style="color:var(--red-500)">*</span></label>
        <input class="form-control" id="cf-name" value="${c?.name||''}" placeholder="Full name">
      </div>
      <div class="form-group">
        <label class="form-label">Role / Title</label>
        <input class="form-control" id="cf-role" value="${c?.role||''}" placeholder="e.g. Project Director">
      </div>
      <div class="form-group">
        <label class="form-label">Company</label>
        <input class="form-control" id="cf-company" value="${c?.company||''}" placeholder="Company name">
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-control" id="cf-dept">
          ${['Client','Sub-consultant','Government / Authority','Contractor','MEP','Structure','Architecture','Internal Team','Other'].map(d=>`<option value="${d}" ${c?.department===d?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-control" type="email" id="cf-email" value="${c?.email||''}" placeholder="email@example.com">
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input class="form-control" id="cf-phone" value="${c?.phone||''}" placeholder="+1 234 567 890">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Location</label>
      <input class="form-control" id="cf-location" value="${c?.location||''}" placeholder="e.g. Dubai, UAE">
    </div>
    <div class="form-group">
      <label class="form-label">Notes <span class="form-label-optional">(optional)</span></label>
      <textarea class="form-control" id="cf-notes">${c?.notes||''}</textarea>
    </div>`;
}

window.saveContact = async function() {
  const name = document.getElementById('cf-name').value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }
  try {
    const data = { name, role: document.getElementById('cf-role').value.trim(), company: document.getElementById('cf-company').value.trim(), department: document.getElementById('cf-dept').value, email: document.getElementById('cf-email').value.trim(), phone: document.getElementById('cf-phone').value.trim(), location: document.getElementById('cf-location').value.trim(), notes: document.getElementById('cf-notes').value.trim() };
    if (App.editingContactId) { await updateContact(App.editingContactId, data); showToast('Contact updated'); }
    else { await addContact(data); showToast('Contact added'); }
    closeModal('modal-contact-form');
  } catch(e) { showToast('Error: '+e.message, 'error'); }
};

window.removeContact = async function(id) {
  if (confirm('Remove this contact?')) { await deleteContact(id); showToast('Contact removed'); }
};

// ─── DOCUMENTS ───────────────────────────────────────────────
function renderDocuments() {
  const fBid = document.getElementById('docs-bid-filter')?.value || 'all';
  const drop = document.getElementById('docs-bid-filter');
  if (drop && !drop.dataset.pop) {
    App.bids.forEach(b => { const o=document.createElement('option'); o.value=b.id; o.textContent=b.name; drop.appendChild(o); });
    drop.dataset.pop = '1';
  }
  const list = fBid === 'all' ? App.documents : App.documents.filter(d => d.bidId === fBid);
  const icon = n => { const e=(n||'').split('.').pop()?.toLowerCase(); return {pdf:'📄',docx:'📝',doc:'📝',xlsx:'📊',xls:'📊',pptx:'📊'}[e]||'📎'; };
  document.getElementById('docs-tbody').innerHTML = list.length ? list.map(d => {
    const bid = App.bids.find(b => b.id === d.bidId);
    return `<tr>
      <td style="font-size:20px">${icon(d.fileName)}</td>
      <td><div class="fw-600" style="color:var(--grey-900)">${d.title||d.fileName}</div><div class="text-xs text-muted text-mono">${d.fileName||''}</div></td>
      <td>${bid?`<span class="badge badge-blue text-xs">${bid.name}</span>`:'—'}</td>
      <td><span class="badge badge-grey text-xs">${d.category||'General'}</span></td>
      <td class="text-sm text-muted">${d.notes||''}</td>
      <td><div class="flex-center gap-8">${d.url?`<a href="${d.url}" target="_blank" class="btn btn-secondary btn-sm">🔗 Open</a>`:''}<button class="btn btn-danger btn-sm" onclick="window.removeDoc('${d.id}')">🗑</button></div></td>
    </tr>`;
  }).join('') : `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">No documents yet</div></div></td></tr>`;
}

window.openDocModal = function() {
  document.getElementById('doc-form-body').innerHTML = `
    <div class="form-group">
      <label class="form-label">Document Title <span style="color:var(--red-500)">*</span></label>
      <input class="form-control" id="df-title" placeholder="e.g. Technical Proposal v3">
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Related Bid</label>
        <select class="form-control" id="df-bid">
          <option value="">— General —</option>
          ${App.bids.map(b=>`<option value="${b.id}">${b.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-control" id="df-cat">
          ${['Technical Proposal','Cost Proposal','Drawings','Prequalification','Submission Package','Reference','Template','Contract','Correspondence','Other'].map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">File Name</label>
      <input class="form-control" id="df-filename" placeholder="e.g. DAH_TechProposal_v2.pdf">
    </div>
    <div class="form-group">
      <label class="form-label">Link / URL <span class="form-label-optional">(SharePoint, Drive, Dropbox…)</span></label>
      <input class="form-control" id="df-url" placeholder="https://...">
    </div>
    <div class="form-group">
      <label class="form-label">Notes <span class="form-label-optional">(optional)</span></label>
      <textarea class="form-control" id="df-notes"></textarea>
    </div>`;
  openModal('modal-doc-form');
};

window.saveDocument = async function() {
  const title = document.getElementById('df-title').value.trim();
  if (!title) { showToast('Title required', 'error'); return; }
  try {
    await addDocument({ title, bidId: document.getElementById('df-bid').value||null, category: document.getElementById('df-cat').value, fileName: document.getElementById('df-filename').value.trim(), url: document.getElementById('df-url').value.trim(), notes: document.getElementById('df-notes').value.trim() });
    showToast('Document added');
    closeModal('modal-doc-form');
  } catch(e) { showToast('Error: '+e.message, 'error'); }
};

window.removeDoc = async function(id) {
  if (confirm('Remove this document?')) { await deleteDocument(id); showToast('Document removed'); }
};

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.page); });
  });

  document.addEventListener('input', e => {
    const id = e.target.id;
    if (id === 'bids-search') renderBids();
    if (id === 'tasks-search') renderTasks();
    if (id === 'contacts-search') renderContacts();
  });

  document.addEventListener('change', e => {
    const id = e.target.id;
    if (id === 'bids-filter') renderBids();
    if (['tasks-bid-filter','tasks-priority-filter','tasks-status-filter'].includes(id)) renderTasks();
    if (id === 'kanban-bid-filter') renderKanban();
    if (id === 'docs-bid-filter') renderDocuments();
  });

  const updateDate = () => {
    const el = document.getElementById('topbar-date');
    if (el) el.textContent = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  };
  updateDate();

  setTimeout(() => { document.getElementById('loading-screen')?.remove(); }, 1000);

  initListeners();
  navigate('dashboard');
});
