// ============================================================
//  app.js — Bid Command v2 — Full Rewrite with All Fixes
// ============================================================

import {
  addBid, updateBid, deleteBid, listenBids,
  addTask, updateTask, deleteTask, listenTasks,
  addContact, updateContact, deleteContact, listenContacts,
  addDocument, deleteDocument, listenDocuments
} from './firebase.js';

// ─── STATE ─────────────────────────────────────────────────
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

// ─── UTILS ─────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(24px)'; }, 3000);
  setTimeout(() => t.remove(), 3400);
}

function formatCurrency(v, cur = 'USD') {
  if (!v && v !== 0) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v);
  } catch { return `${cur} ${Number(v).toLocaleString()}`; }
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((new Date(dateStr) - now) / 86400000);
}

function deadlineClass(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return '';
  if (d < 0) return 'deadline-urgent';
  if (d <= 7) return 'deadline-urgent';
  if (d <= 14) return 'deadline-soon';
  return 'deadline-ok';
}

function fmtDeadline(dateStr) {
  if (!dateStr) return '—';
  const d = daysUntil(dateStr);
  if (d === 0) return '🔥 Due Today';
  if (d < 0)  return `⚠️ ${Math.abs(d)}d overdue`;
  if (d === 1) return '⏰ Tomorrow';
  if (d <= 7)  return `⏰ In ${d} days`;
  return dateStr;
}

function statusTag(status) {
  const map = {
    active:    '<span class="bid-tag tag-active">Active</span>',
    prep:      '<span class="bid-tag tag-prep">In Preparation</span>',
    submitted: '<span class="bid-tag tag-submit">Submitted</span>',
    won:       '<span class="bid-tag tag-won">✓ Won</span>',
    lost:      '<span class="bid-tag tag-lost">Lost</span>',
    paused:    '<span class="bid-tag tag-paused">On Hold</span>',
  };
  return map[status] || '';
}

function statusDot(status) {
  return `<span class="status-dot dot-${status}"></span>`;
}

function bidProgress(bid) {
  const tasks = App.tasks.filter(t => t.bidId === bid.id);
  if (!tasks.length) return 0;
  return Math.round(tasks.filter(t => t.status === 'done').length / tasks.length * 100);
}

function circleProgress(pct, color = '#2563a8') {
  const r = 28, circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return `<div class="circle-progress">
    <svg width="70" height="70" viewBox="0 0 70 70">
      <circle class="bg" cx="35" cy="35" r="${r}"/>
      <circle class="fill" cx="35" cy="35" r="${r}" stroke="${color}"
        stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
    </svg>
    <div class="label">${pct}%</div>
  </div>`;
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
window.closeModal = closeModal;

// ─── NAVIGATION ────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(el => el.classList.add('active'));
  App.activePage = page;
  const titles = {
    dashboard: 'Dashboard', bids: 'Bids & Tenders', kanban: 'Kanban Board',
    tasks: 'Task Management', contacts: 'Contacts', documents: 'Documents'
  };
  document.getElementById('topbar-title').textContent = titles[page] || '';
  window.scrollTo(0, 0);
  renderPage(page);
}

function renderPage(p) {
  if (p === 'dashboard')  renderDashboard();
  if (p === 'bids')       renderBids();
  if (p === 'kanban')     renderKanban();
  if (p === 'tasks')      renderTasks();
  if (p === 'contacts')   renderContacts();
  if (p === 'documents')  renderDocuments();
}

// ─── FIREBASE LISTENERS ─────────────────────────────────────
function initListeners() {
  App.unsubscribers.forEach(u => u());
  App.unsubscribers = [
    listenBids(bids => {
      App.bids = bids;
      updateBadges();
      renderPage(App.activePage);
      // Refresh open bid detail if one is open
      if (App.openDetailBidId) refreshBidDetail(App.openDetailBidId);
    }),
    listenTasks(tasks => {
      App.tasks = tasks;
      updateBadges();
      renderPage(App.activePage);
      if (App.openDetailBidId) refreshBidDetail(App.openDetailBidId);
    }),
    listenContacts(contacts => {
      App.contacts = contacts;
      if (App.activePage === 'contacts') renderContacts();
    }),
    listenDocuments(docs => {
      App.documents = docs;
      if (App.activePage === 'documents') renderDocuments();
    })
  ];
}

function updateBadges() {
  const active = App.bids.filter(b => b.status === 'active' || b.status === 'prep').length;
  const pending = App.tasks.filter(t => t.status !== 'done').length;
  const urgent = App.bids.filter(b => {
    const d = daysUntil(b.submissionDate);
    return d !== null && d >= 0 && d <= 7 && b.status !== 'won' && b.status !== 'lost';
  }).length;
  document.querySelectorAll('[data-badge="bids"]').forEach(el => { el.textContent = active || ''; el.style.display = active ? '' : 'none'; });
  document.querySelectorAll('[data-badge="tasks"]').forEach(el => { el.textContent = pending || ''; el.style.display = pending ? '' : 'none'; });
  document.querySelectorAll('[data-badge="urgent"]').forEach(el => { el.textContent = urgent || ''; el.style.display = urgent ? '' : 'none'; el.className = 'nav-badge urgent'; });
}

// ─── DASHBOARD ─────────────────────────────────────────────
function renderDashboard() {
  const { bids, tasks } = App;
  const activeBids   = bids.filter(b => ['active','prep'].includes(b.status));
  const wonBids      = bids.filter(b => b.status === 'won');
  const pendingTasks = tasks.filter(t => t.status !== 'done');
  const overdue      = tasks.filter(t => t.status !== 'done' && t.dueDate && daysUntil(t.dueDate) < 0);
  const totalValue   = wonBids.reduce((s, b) => s + (parseFloat(b.value) || 0), 0);
  const decided      = bids.filter(b => b.status === 'won' || b.status === 'lost');
  const winRate      = decided.length ? Math.round(wonBids.length / decided.length * 100) : 0;
  const urgentBids   = bids.filter(b => {
    const d = daysUntil(b.submissionDate);
    return d !== null && d >= 0 && d <= 14 && !['won','lost','submitted'].includes(b.status);
  }).sort((a,b) => daysUntil(a.submissionDate) - daysUntil(b.submissionDate));

  // Stats
  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-card gold">
      <span class="stat-card-icon">📁</span>
      <span class="stat-label">Active Bids</span>
      <div class="stat-value">${activeBids.length}</div>
      <div class="stat-sub">${bids.length} bids total in system</div>
    </div>
    <div class="stat-card blue">
      <span class="stat-card-icon">✅</span>
      <span class="stat-label">Pending Tasks</span>
      <div class="stat-value">${pendingTasks.length}</div>
      <div class="stat-sub">${overdue.length > 0 ? `<span class="text-red">${overdue.length} overdue</span>` : 'All on track'}</div>
    </div>
    <div class="stat-card green">
      <span class="stat-card-icon">🏆</span>
      <span class="stat-label">Win Rate</span>
      <div class="stat-value">${winRate}%</div>
      <div class="stat-sub">${wonBids.length} won out of ${decided.length} decided</div>
    </div>
    <div class="stat-card teal">
      <span class="stat-card-icon">💰</span>
      <span class="stat-label">Won Contract Value</span>
      <div class="stat-value" style="font-size:26px">${formatCurrency(totalValue)}</div>
      <div class="stat-sub">Secured to date</div>
    </div>
    <div class="stat-card red">
      <span class="stat-card-icon">⏰</span>
      <span class="stat-label">Due Within 14 Days</span>
      <div class="stat-value">${urgentBids.length}</div>
      <div class="stat-sub">Bids needing attention</div>
    </div>
  `;

  // Urgent deadlines
  const urgentEl = document.getElementById('dash-urgent');
  if (!urgentBids.length) {
    urgentEl.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><h3>No urgent deadlines</h3><p>No bids due within the next 14 days</p></div>`;
  } else {
    urgentEl.innerHTML = urgentBids.map(b => {
      const days = daysUntil(b.submissionDate);
      const pct  = bidProgress(b);
      const color = days <= 3 ? '#dc2626' : days <= 7 ? '#d97706' : '#2563a8';
      return `<div class="bid-card" onclick="window.openBidDetail('${b.id}')" style="border-color:${days<=7?'#fecaca':'var(--border)'}">
        <div class="bid-card-top">
          <div style="flex:1">
            <span class="bid-ref">${b.refNumber || 'REF —'}</span>
            <div class="bid-name">${b.name}</div>
            <div class="bid-client">🏢 ${b.client || 'Client TBC'}</div>
          </div>
          ${circleProgress(pct, color)}
        </div>
        <div class="bid-meta">${statusTag(b.status)}
          <span class="bid-tag ${days<=3?'tag-lost':days<=7?'tag-prep':'tag-active'}">
            ${days === 0 ? '🔥 Due Today' : `${days}d remaining`}
          </span>
        </div>
        <div class="progress-wrap">
          <div class="progress-label"><span>Task completion</span><span>${pct}%</span></div>
          <div class="progress-bar"><div class="progress-fill ${days<=7?'red':'gold'}" style="width:${pct}%"></div></div>
        </div>
      </div>`;
    }).join('');
  }

  // Bid pipeline summary
  const statuses = [
    { key:'prep',      label:'In Preparation' },
    { key:'active',    label:'Active' },
    { key:'submitted', label:'Submitted' },
    { key:'won',       label:'Won' },
    { key:'lost',      label:'Lost' },
    { key:'paused',    label:'On Hold' },
  ];
  document.getElementById('dash-pipeline').innerHTML = statuses.map(s => {
    const count = bids.filter(b => b.status === s.key).length;
    const val   = bids.filter(b => b.status === s.key).reduce((sum, b) => sum + (parseFloat(b.value)||0), 0);
    return `<div class="fin-row">
      <span class="fin-label">${statusDot(s.key)} ${s.label}</span>
      <div style="display:flex;align-items:center;gap:16px">
        ${val ? `<span style="font-size:12px;color:var(--text-muted);font-family:var(--mono)">${formatCurrency(val)}</span>` : ''}
        <span class="fin-value">${count} bid${count!==1?'s':''}</span>
      </div>
    </div>`;
  }).join('');

  // Upcoming tasks
  const upcoming = tasks.filter(t => t.status !== 'done')
    .sort((a,b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1; if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    }).slice(0, 8);

  document.getElementById('dash-tasks').innerHTML = upcoming.length
    ? `<div class="task-list">${upcoming.map(t => taskHTML(t, false)).join('')}</div>`
    : `<div class="empty-state" style="padding:32px"><div class="empty-icon">📋</div><h3>No pending tasks</h3></div>`;
}

// ─── BIDS PAGE ──────────────────────────────────────────────
function renderBids() {
  const search = (document.getElementById('bids-search')?.value || '').toLowerCase();
  const filter = document.getElementById('bids-filter')?.value || 'all';
  let list = App.bids;
  if (filter !== 'all') list = list.filter(b => b.status === filter);
  if (search) list = list.filter(b =>
    (b.name||'').toLowerCase().includes(search) ||
    (b.client||'').toLowerCase().includes(search) ||
    (b.refNumber||'').toLowerCase().includes(search)
  );

  const grid = document.getElementById('bids-grid');
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">📁</div><h3>No Bids Found</h3>
      <p>Add your first bid using the button above, or adjust your filters.</p>
      <button class="btn btn-primary" onclick="window.openBidModal()" style="margin-top:16px">+ Add New Bid</button>
    </div>`; return;
  }

  grid.innerHTML = list.map(b => {
    const pct   = bidProgress(b);
    const tasks = App.tasks.filter(t => t.bidId === b.id);
    const done  = tasks.filter(t => t.status === 'done').length;
    const days  = daysUntil(b.submissionDate);
    const depts = (b.departments||[]).map(d => `<span class="dept-chip active">${d}</span>`).join('');
    return `<div class="bid-card" onclick="window.openBidDetail('${b.id}')">
      <div class="bid-card-top">
        <div style="flex:1;min-width:0">
          <span class="bid-ref">${b.refNumber||'—'} · ${b.region||'MEA'}</span>
          <div class="bid-name">${b.name}</div>
          <div class="bid-client">🏢 ${b.client||'Client TBC'}</div>
        </div>
        ${circleProgress(pct)}
      </div>
      <div class="bid-meta">
        ${statusTag(b.status)}
        ${b.type ? `<span class="bid-tag tag-paused">${b.type}</span>` : ''}
      </div>
      ${depts ? `<div class="dept-chips">${depts}</div>` : ''}
      <div class="divider" style="margin:14px 0 12px"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div>
          <div class="stat-label" style="font-size:10px">Deadline</div>
          <div class="text-sm bold ${deadlineClass(b.submissionDate)}" style="font-family:var(--mono)">${b.submissionDate||'—'}</div>
        </div>
        <div>
          <div class="stat-label" style="font-size:10px">Value</div>
          <div class="text-sm bold text-gold" style="font-family:var(--mono)">${b.value ? formatCurrency(b.value, b.currency||'USD') : '—'}</div>
        </div>
        <div>
          <div class="stat-label" style="font-size:10px">Tasks</div>
          <div class="text-sm bold" style="font-family:var(--mono)">${done}/${tasks.length} done</div>
        </div>
      </div>
      <div class="progress-wrap">
        <div class="progress-label"><span>Overall completion</span><span>${pct}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
    </div>`;
  }).join('');
}

// ─── TASKS PAGE ─────────────────────────────────────────────
function renderTasks() {
  const search = (document.getElementById('tasks-search')?.value||'').toLowerCase();
  const fBid   = document.getElementById('tasks-bid-filter')?.value||'all';
  const fPri   = document.getElementById('tasks-priority-filter')?.value||'all';
  const fStat  = document.getElementById('tasks-status-filter')?.value||'pending';

  // Populate bid dropdown once
  const bidDrop = document.getElementById('tasks-bid-filter');
  if (bidDrop && !bidDrop.dataset.populated) {
    App.bids.forEach(b => {
      const o = document.createElement('option');
      o.value = b.id; o.textContent = b.name;
      bidDrop.appendChild(o);
    });
    bidDrop.dataset.populated = '1';
  }

  let list = App.tasks;
  if (fBid !== 'all')    list = list.filter(t => t.bidId === fBid);
  if (fPri !== 'all')    list = list.filter(t => t.priority === fPri);
  if (fStat === 'pending') list = list.filter(t => t.status !== 'done');
  if (fStat === 'done')    list = list.filter(t => t.status === 'done');
  if (search) list = list.filter(t => (t.title||'').toLowerCase().includes(search) || (t.description||'').toLowerCase().includes(search));

  list.sort((a,b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1; if (!b.dueDate) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  // Stats bar
  const total = App.tasks.length;
  const done  = App.tasks.filter(t => t.status === 'done').length;
  const pct   = total ? Math.round(done/total*100) : 0;
  document.getElementById('tasks-stats').innerHTML = `
    <div class="card mb-24">
      <div style="display:flex;align-items:center;gap:28px;flex-wrap:wrap">
        ${circleProgress(pct, '#16a34a')}
        <div>
          <div class="stat-label">Overall Completion</div>
          <div class="stat-value">${pct}%</div>
          <div class="stat-sub">${done} of ${total} tasks completed</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:28px;flex-wrap:wrap">
          <div style="text-align:center">
            <div class="stat-label">High Priority</div>
            <div class="text-red bold" style="font-size:30px;font-family:var(--head)">${App.tasks.filter(t=>t.priority==='high'&&t.status!=='done').length}</div>
          </div>
          <div style="text-align:center">
            <div class="stat-label">Overdue</div>
            <div class="text-red bold" style="font-size:30px;font-family:var(--head)">${App.tasks.filter(t=>t.status!=='done'&&t.dueDate&&daysUntil(t.dueDate)<0).length}</div>
          </div>
          <div style="text-align:center">
            <div class="stat-label">Due This Week</div>
            <div class="text-gold bold" style="font-size:30px;font-family:var(--head)">${App.tasks.filter(t=>t.status!=='done'&&t.dueDate&&daysUntil(t.dueDate)>=0&&daysUntil(t.dueDate)<=7).length}</div>
          </div>
        </div>
      </div>
    </div>`;

  const el = document.getElementById('tasks-list');
  el.innerHTML = list.length
    ? `<div class="task-list">${list.map(t => taskHTML(t, true)).join('')}</div>`
    : `<div class="empty-state"><div class="empty-icon">✅</div><h3>No tasks found</h3><p>Try changing your filters or add a new task.</p></div>`;
}

function taskHTML(task, showActions = false) {
  const bid  = App.bids.find(b => b.id === task.bidId);
  const days = daysUntil(task.dueDate);
  const isDone = task.status === 'done';
  return `<div class="task-item priority-${task.priority||'medium'} ${isDone?'done':''}">
    <div class="task-check ${isDone?'checked':''}" onclick="window.toggleTask('${task.id}')"></div>
    <div class="task-body">
      <div class="task-title">${task.title}</div>
      ${bid ? `<div class="task-bid-tag">📁 ${bid.name}</div>` : ''}
      ${task.assignee ? `<div class="task-desc">👤 ${task.assignee}${task.category?' · '+task.category:''}</div>` : ''}
      ${task.description ? `<div class="task-desc">${task.description}</div>` : ''}
    </div>
    <div class="task-right">
      ${task.dueDate ? `<div class="task-due ${isDone?'':deadlineClass(task.dueDate)}">${isDone?task.dueDate:fmtDeadline(task.dueDate)}</div>` : ''}
      <span class="bid-tag ${task.priority==='high'?'tag-lost':task.priority==='medium'?'tag-prep':'tag-active'} text-xs">${task.priority||'med'}</span>
      ${showActions ? `<div class="task-actions">
        <button class="btn btn-outline btn-xs btn-icon" onclick="event.stopPropagation();window.editTask('${task.id}')" title="Edit">✏️</button>
        <button class="btn btn-danger btn-xs btn-icon" onclick="event.stopPropagation();window.removeTask('${task.id}')" title="Delete">🗑️</button>
      </div>` : ''}
    </div>
  </div>`;
}

window.toggleTask = async function(id) {
  const t = App.tasks.find(t => t.id === id);
  if (!t) return;
  const done = t.status !== 'done';
  await updateTask(id, { status: done?'done':'pending', kanbanStatus: done?'done':'todo' });
  showToast(done ? 'Task marked complete ✓' : 'Task reopened');
};

window.removeTask = async function(id) {
  const t = App.tasks.find(t => t.id === id);
  if (!confirm(`Delete task "${t?.title}"?`)) return;
  await deleteTask(id);
  showToast('Task deleted');
};

// ─── KANBAN ─────────────────────────────────────────────────
function renderKanban() {
  const fBid = document.getElementById('kanban-bid-filter')?.value || 'all';

  const kDrop = document.getElementById('kanban-bid-filter');
  if (kDrop && !kDrop.dataset.populated) {
    App.bids.forEach(b => { const o=document.createElement('option'); o.value=b.id; o.textContent=b.name; kDrop.appendChild(o); });
    kDrop.dataset.populated = '1';
  }

  let tasks = fBid === 'all' ? App.tasks : App.tasks.filter(t => t.bidId === fBid);

  const cols = [
    { key:'todo',        label:'📋 To Do',      color:'var(--text-bright)' },
    { key:'in-progress', label:'⚡ In Progress', color:'var(--blue)' },
    { key:'review',      label:'🔍 In Review',   color:'var(--amber)' },
    { key:'done',        label:'✅ Done',         color:'var(--green)' },
  ];

  document.getElementById('kanban-board').innerHTML = cols.map(col => {
    const items = tasks.filter(t => (t.kanbanStatus||(t.status==='done'?'done':'todo')) === col.key);
    return `<div class="kanban-col">
      <div class="kanban-col-header">
        <span class="kanban-col-title" style="color:${col.color}">${col.label}</span>
        <span class="kanban-count">${items.length}</span>
      </div>
      <div class="kanban-items" data-col="${col.key}"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="window.onKanbanDrop(event,'${col.key}')">
        ${items.map(t => kanbanCard(t)).join('')}
        <button class="btn btn-outline btn-sm w-full" style="margin-top:4px"
          onclick="window.openTaskModal('${col.key}','${fBid!=='all'?fBid:''}')">+ Add Card</button>
      </div>
    </div>`;
  }).join('');
}

function kanbanCard(t) {
  const bid  = App.bids.find(b => b.id === t.bidId);
  const days = daysUntil(t.dueDate);
  return `<div class="kanban-card" draggable="true" data-task-id="${t.id}"
    ondragstart="window.onKanbanDragStart(event,'${t.id}')"
    ondragend="event.target.classList.remove('dragging')">
    ${bid?`<div class="kanban-card-bid">📁 ${bid.name}</div>`:''}
    <div class="kanban-card-title">${t.title}</div>
    ${t.assignee ? `<div style="font-size:12px;color:var(--text-light)">👤 ${t.assignee}</div>` : ''}
    <div class="kanban-card-footer">
      <span class="bid-tag text-xs ${t.priority==='high'?'tag-lost':t.priority==='medium'?'tag-prep':'tag-active'}">${t.priority||'med'}</span>
      <div style="display:flex;align-items:center;gap:6px">
        ${t.dueDate ? `<span class="text-xs ${deadlineClass(t.dueDate)}" style="font-family:var(--mono)">${days!==null&&days<=1?fmtDeadline(t.dueDate):t.dueDate}</span>` : ''}
        <button class="btn btn-ghost btn-xs" onclick="window.editTask('${t.id}')">✏️</button>
        <button class="btn btn-ghost btn-xs" onclick="window.removeTask('${t.id}')">🗑️</button>
      </div>
    </div>
  </div>`;
}

window.onKanbanDragStart = function(e, id) {
  App.dragItem = id;
  setTimeout(() => e.target.classList.add('dragging'), 0);
};

window.onKanbanDrop = async function(e, col) {
  e.preventDefault();
  document.querySelectorAll('.kanban-items').forEach(el => el.classList.remove('drag-over'));
  if (!App.dragItem) return;
  await updateTask(App.dragItem, { kanbanStatus: col, status: col==='done'?'done':'pending' });
  App.dragItem = null;
  showToast('Card moved');
};

// ─── BID DETAIL MODAL ───────────────────────────────────────
window.openBidDetail = function(bidId) {
  App.openDetailBidId = bidId;
  renderBidDetail(bidId);
  openModal('modal-bid-detail');
};

function refreshBidDetail(bidId) {
  if (document.getElementById('modal-bid-detail')?.classList.contains('open')) {
    renderBidDetail(bidId);
  }
}

function renderBidDetail(bidId) {
  const bid = App.bids.find(b => b.id === bidId);
  if (!bid) return;
  const tasks = App.tasks.filter(t => t.bidId === bidId);
  const pct   = bidProgress(bid);
  const days  = daysUntil(bid.submissionDate);

  document.querySelector('#modal-bid-detail .modal-title').textContent = bid.name;

  // Deadline alert
  let alert = '';
  if (days !== null && days >= 0 && days <= 7 && !['won','lost'].includes(bid.status)) {
    alert = `<div class="alert ${days<=3?'alert-danger':'alert-warning'}">⏰ Submission deadline in <strong>${days === 0 ? 'TODAY' : days + ' days'}</strong> — ${bid.submissionDate}</div>`;
  } else if (days !== null && days < 0 && !['won','lost','submitted'].includes(bid.status)) {
    alert = `<div class="alert alert-danger">⚠️ Deadline passed ${Math.abs(days)} days ago!</div>`;
  }

  document.getElementById('bid-detail-body').innerHTML = `
    ${alert}
    <div class="tabs">
      <button class="tab-btn active" onclick="window.switchBidTab(this,'overview')">📋 Overview</button>
      <button class="tab-btn" onclick="window.switchBidTab(this,'tasks')">✅ Tasks (${tasks.length})</button>
      <button class="tab-btn" onclick="window.switchBidTab(this,'financials')">💰 Financials</button>
      <button class="tab-btn" onclick="window.switchBidTab(this,'departments')">🏗️ Teams & Notes</button>
    </div>

    <!-- OVERVIEW TAB -->
    <div id="bid-tab-overview">
      <div class="info-grid mb-20">
        <div class="info-item">
          <span class="info-item-label">Reference Number</span>
          <div class="info-item-value" style="font-family:var(--mono)">${bid.refNumber||'—'}</div>
        </div>
        <div class="info-item">
          <span class="info-item-label">Current Status</span>
          <div>${statusTag(bid.status)}</div>
        </div>
        <div class="info-item">
          <span class="info-item-label">Client / Owner</span>
          <div class="info-item-value">🏢 ${bid.client||'—'}</div>
        </div>
        <div class="info-item">
          <span class="info-item-label">Region</span>
          <div class="info-item-value">${bid.region||'—'}</div>
        </div>
        <div class="info-item">
          <span class="info-item-label">Submission Deadline</span>
          <div class="info-item-value ${deadlineClass(bid.submissionDate)}">${bid.submissionDate ? `📅 ${bid.submissionDate}` : '—'}</div>
        </div>
        <div class="info-item">
          <span class="info-item-label">Bid Type</span>
          <div class="info-item-value">${bid.type||'—'}</div>
        </div>
        <div class="info-item">
          <span class="info-item-label">Bid Lead</span>
          <div class="info-item-value">👤 ${bid.lead||'—'}</div>
        </div>
        <div class="info-item">
          <span class="info-item-label">Contract Value</span>
          <div class="info-item-value text-gold">${bid.value ? formatCurrency(bid.value, bid.currency||'USD') : '—'}</div>
        </div>
      </div>

      ${bid.description ? `<div class="mb-20">
        <div class="card-title">📄 Scope & Description</div>
        <div style="font-size:15px;line-height:1.8;color:var(--text)">${bid.description}</div>
      </div>` : ''}

      <div class="card" style="margin-bottom:20px">
        <div class="card-title">📊 Progress</div>
        <div style="display:flex;align-items:center;gap:24px">
          ${circleProgress(pct)}
          <div style="flex:1">
            <div class="progress-bar" style="height:10px;margin-bottom:8px"><div class="progress-fill" style="width:${pct}%"></div></div>
            <div class="text-light text-sm">${tasks.filter(t=>t.status==='done').length} of ${tasks.length} tasks completed</div>
          </div>
        </div>
      </div>
    </div>

    <!-- TASKS TAB -->
    <div id="bid-tab-tasks" style="display:none">
      <div class="section-header">
        <div class="section-title">Tasks for this Bid</div>
        <button class="btn btn-primary" onclick="window.openTaskModal('todo','${bidId}')">+ Add Task</button>
      </div>
      <div id="bid-tasks-list">
        ${tasks.length
          ? `<div class="task-list">${tasks.map(t => taskHTML(t, true)).join('')}</div>`
          : `<div class="empty-state" style="padding:40px"><div class="empty-icon">📋</div><h3>No tasks yet</h3><p>Add tasks to track progress on this bid.</p><button class="btn btn-primary" onclick="window.openTaskModal('todo','${bidId}')" style="margin-top:12px">+ Add First Task</button></div>`
        }
      </div>
    </div>

    <!-- FINANCIALS TAB — FULLY EDITABLE -->
    <div id="bid-tab-financials" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div class="section-title">Financial Details</div>
        <button class="btn btn-gold" onclick="window.saveFinancials('${bidId}')">💾 Save Financials</button>
      </div>
      <div class="card mb-16">
        <div class="form-section-title">💰 Contract & Value</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Estimated Contract Value</label>
            <input class="form-input" id="fin-value" type="number" value="${bid.value||''}" placeholder="e.g. 5000000">
          </div>
          <div class="form-group">
            <label class="form-label">Currency</label>
            <select class="form-select" id="fin-currency">
              ${['USD','EUR','GBP','AED','SAR','EGP','LBP','JOD','KWD','QAR','OMR','BHD','MAD'].map(c=>`<option value="${c}" ${bid.currency===c?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cost Estimate / Budget</label>
            <input class="form-input" id="fin-cost" type="number" value="${bid.costEstimate||''}" placeholder="Our internal cost">
          </div>
          <div class="form-group">
            <label class="form-label">Target Margin %</label>
            <input class="form-input" id="fin-margin" type="number" value="${bid.margin||''}" placeholder="e.g. 25">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Payment Terms</label>
            <input class="form-input" id="fin-payment" value="${bid.paymentTerms||''}" placeholder="e.g. 30/60/10 milestone payments">
          </div>
          <div class="form-group">
            <label class="form-label">Bond / Guarantee Required</label>
            <input class="form-input" id="fin-bond" value="${bid.bond||''}" placeholder="e.g. 5% performance bond">
          </div>
        </div>
      </div>
      <div class="card mb-16">
        <div class="form-section-title">📊 Financial Summary</div>
        <div class="fin-row">
          <span class="fin-label">Contract Value</span>
          <span class="fin-value positive">${bid.value ? formatCurrency(bid.value, bid.currency||'USD') : '—'}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Internal Cost</span>
          <span class="fin-value">${bid.costEstimate ? formatCurrency(bid.costEstimate, bid.currency||'USD') : '—'}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Gross Profit</span>
          <span class="fin-value ${bid.value && bid.costEstimate && bid.value > bid.costEstimate ? 'positive' : 'negative'}">
            ${bid.value && bid.costEstimate ? formatCurrency(bid.value - bid.costEstimate, bid.currency||'USD') : '—'}
          </span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Margin %</span>
          <span class="fin-value ${(bid.margin||0) >= 20 ? 'positive' : 'warning'}">${bid.margin ? bid.margin + '%' : '—'}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Payment Terms</span>
          <span class="fin-value">${bid.paymentTerms||'—'}</span>
        </div>
        <div class="fin-row">
          <span class="fin-label">Bond / Guarantee</span>
          <span class="fin-value">${bid.bond||'—'}</span>
        </div>
      </div>
      <div class="card">
        <div class="form-section-title">📝 Financial Notes</div>
        <div class="form-group">
          <textarea class="form-textarea" id="fin-notes" placeholder="Any notes about pricing strategy, assumptions, risks...">${bid.financialNotes||''}</textarea>
        </div>
      </div>
    </div>

    <!-- TEAMS & NOTES TAB -->
    <div id="bid-tab-departments" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div class="section-title">Teams, Departments & Notes</div>
        <button class="btn btn-gold" onclick="window.saveTeamsNotes('${bidId}')">💾 Save Changes</button>
      </div>
      <div class="card mb-16">
        <div class="form-section-title">🏗️ Departments Involved</div>
        <div class="dept-chips" id="detail-depts" style="margin-top:4px">
          ${['MEP','Structure','Architecture','Civil','Electrical','Mechanical','IT/ICT','Sustainability','Project Management','Cost Management','Planning','Environmental'].map(d =>
            `<span class="dept-chip ${(bid.departments||[]).includes(d)?'active':''}" onclick="this.classList.toggle('active')" data-dept="${d}">${d}</span>`
          ).join('')}
        </div>
      </div>
      <div class="card mb-16">
        <div class="form-section-title">👥 Key People</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Bid Lead / Manager</label>
            <input class="form-input" id="td-lead" value="${bid.lead||''}" placeholder="Name of bid manager">
          </div>
          <div class="form-group">
            <label class="form-label">Technical Lead</label>
            <input class="form-input" id="td-tech" value="${bid.technicalLead||''}" placeholder="Technical discipline lead">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Sub-consultants / Partners</label>
            <input class="form-input" id="td-subs" value="${bid.subConsultants||''}" placeholder="Any sub-consultants involved">
          </div>
          <div class="form-group">
            <label class="form-label">Client Contact Person</label>
            <input class="form-input" id="td-contact" value="${bid.clientContact||''}" placeholder="Client's point of contact">
          </div>
        </div>
      </div>
      <div class="card mb-16">
        <div class="form-section-title">📋 Prequalification & Requirements</div>
        <div class="form-group">
          <label class="form-label">Prequalification Status</label>
          <select class="form-select" id="td-preq">
            ${['N/A','Not Started','In Progress','Submitted','Approved','Rejected'].map(s=>`<option value="${s}" ${bid.prequalStatus===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Special Requirements / Compliance</label>
          <textarea class="form-textarea" id="td-reqs" placeholder="ISO certifications, local content, JV requirements...">${bid.requirements||''}</textarea>
        </div>
      </div>
      <div class="card">
        <div class="form-section-title">📝 Internal Strategy & Notes</div>
        <div class="form-group">
          <label class="form-label">Win Strategy</label>
          <textarea class="form-textarea" id="td-strategy" placeholder="What is our competitive advantage? Why should we win this bid?">${bid.strategy||''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Risks & Concerns</label>
          <textarea class="form-textarea" id="td-risks" placeholder="Known risks, red flags, or concerns about this bid...">${bid.risks||''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">General Notes</label>
          <textarea class="form-textarea" id="td-notes" placeholder="Anything else to keep track of...">${bid.notes||''}</textarea>
        </div>
      </div>
    </div>
  `;

  // Wire up buttons
  document.getElementById('bid-detail-edit-btn').onclick = () => { closeModal('modal-bid-detail'); window.openBidModal(bidId); };
  document.getElementById('bid-detail-delete-btn').onclick = () => {
    if (confirm(`Delete bid "${bid.name}"? All associated tasks will remain but unlinked.`)) {
      deleteBid(bidId).then(() => { closeModal('modal-bid-detail'); App.openDetailBidId = null; showToast('Bid deleted'); });
    }
  };
}

window.switchBidTab = function(btn, tab) {
  document.querySelectorAll('#bid-detail-body .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['overview','tasks','financials','departments'].forEach(t => {
    const el = document.getElementById(`bid-tab-${t}`);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
};

// Save financials inline
window.saveFinancials = async function(bidId) {
  const data = {
    value: parseFloat(document.getElementById('fin-value').value)||null,
    currency: document.getElementById('fin-currency').value,
    costEstimate: parseFloat(document.getElementById('fin-cost').value)||null,
    margin: parseFloat(document.getElementById('fin-margin').value)||null,
    paymentTerms: document.getElementById('fin-payment').value.trim(),
    bond: document.getElementById('fin-bond').value.trim(),
    financialNotes: document.getElementById('fin-notes').value.trim(),
  };
  try {
    await updateBid(bidId, data);
    showToast('Financials saved successfully ✓');
  } catch(e) { showToast('Error saving: '+e.message, 'error'); }
};

// Save teams & notes inline
window.saveTeamsNotes = async function(bidId) {
  const departments = [...document.querySelectorAll('#detail-depts .dept-chip.active')].map(el => el.dataset.dept);
  const data = {
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
  };
  try {
    await updateBid(bidId, data);
    showToast('Teams & notes saved ✓');
  } catch(e) { showToast('Error: '+e.message, 'error'); }
};

// ─── BID FORM MODAL ─────────────────────────────────────────
window.openBidModal = function(bidId = null) {
  App.editingBidId = bidId;
  const bid = bidId ? App.bids.find(b => b.id === bidId) : null;
  document.querySelector('#modal-bid-form .modal-title').textContent = bid ? `Edit: ${bid.name}` : 'Add New Bid';

  const depts = ['MEP','Structure','Architecture','Civil','Electrical','Mechanical','IT/ICT','Sustainability','Project Management','Cost Management','Planning','Environmental'];
  const checked = bid?.departments || [];

  document.getElementById('bid-form-body').innerHTML = `
    <div class="form-section-title">📋 Basic Information</div>
    <div class="form-group">
      <label class="form-label">Bid / Project Name <span style="color:var(--red)">*</span></label>
      <input class="form-input" id="bf-name" value="${bid?.name||''}" placeholder="Full project name">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Reference Number</label>
        <input class="form-input" id="bf-ref" value="${bid?.refNumber||''}" placeholder="e.g. DAH-2025-001">
      </div>
      <div class="form-group">
        <label class="form-label">Status <span style="color:var(--red)">*</span></label>
        <select class="form-select" id="bf-status">
          ${[['prep','In Preparation'],['active','Active'],['submitted','Submitted'],['won','Won'],['lost','Lost'],['paused','On Hold']].map(([v,l])=>`<option value="${v}" ${bid?.status===v?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Client / Owner</label>
        <input class="form-input" id="bf-client" value="${bid?.client||''}" placeholder="Client organization name">
      </div>
      <div class="form-group">
        <label class="form-label">Region</label>
        <select class="form-select" id="bf-region">
          ${['MEA','GCC','Middle East','Levant','North Africa','East Africa','West Africa','South Asia','Europe','Other'].map(r=>`<option value="${r}" ${bid?.region===r?'selected':''}>${r}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Bid Type</label>
        <select class="form-select" id="bf-type">
          ${['Technical Proposal','Cost Proposal','EOI','Prequalification','Full Tender','Design Competition','Framework Agreement','Other'].map(t=>`<option value="${t}" ${bid?.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Submission Deadline</label>
        <input class="form-input" type="date" id="bf-date" value="${bid?.submissionDate||''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Bid Lead</label>
        <input class="form-input" id="bf-lead" value="${bid?.lead||''}" placeholder="Person managing this bid">
      </div>
      <div class="form-group">
        <label class="form-label">Prequalification Status</label>
        <select class="form-select" id="bf-preq">
          ${['N/A','Not Started','In Progress','Submitted','Approved','Rejected'].map(s=>`<option value="${s}" ${bid?.prequalStatus===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-section-title">💰 Financials</div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Estimated Value</label>
        <input class="form-input" type="number" id="bf-value" value="${bid?.value||''}" placeholder="Contract value">
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <select class="form-select" id="bf-currency">
          ${['USD','EUR','GBP','AED','SAR','EGP','LBP','JOD','KWD','QAR','OMR','BHD','MAD'].map(c=>`<option value="${c}" ${bid?.currency===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Internal Cost Estimate</label>
        <input class="form-input" type="number" id="bf-cost" value="${bid?.costEstimate||''}" placeholder="Our cost to deliver">
      </div>
      <div class="form-group">
        <label class="form-label">Target Margin %</label>
        <input class="form-input" type="number" id="bf-margin" value="${bid?.margin||''}" placeholder="e.g. 25">
      </div>
    </div>

    <div class="form-section-title">🏗️ Departments & Scope</div>
    <div class="form-group">
      <label class="form-label">Departments Involved <span class="form-label-hint">(click to select)</span></label>
      <div class="dept-chips" style="margin-top:6px">
        ${depts.map(d=>`<span class="dept-chip ${checked.includes(d)?'active':''}" onclick="this.classList.toggle('active')" data-dept="${d}">${d}</span>`).join('')}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Scope / Description</label>
      <textarea class="form-textarea" id="bf-desc">${bid?.description||''}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Internal Notes</label>
      <textarea class="form-textarea" id="bf-notes">${bid?.notes||''}</textarea>
    </div>
  `;
  openModal('modal-bid-form');
};

window.saveBid = async function() {
  const name = document.getElementById('bf-name').value.trim();
  if (!name) { showToast('Bid name is required', 'error'); return; }
  const departments = [...document.querySelectorAll('#bid-form-body .dept-chip.active')].map(el => el.dataset.dept);
  const data = {
    name,
    refNumber: document.getElementById('bf-ref').value.trim(),
    status: document.getElementById('bf-status').value,
    client: document.getElementById('bf-client').value.trim(),
    region: document.getElementById('bf-region').value,
    type: document.getElementById('bf-type').value,
    submissionDate: document.getElementById('bf-date').value || null,
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
  try {
    if (App.editingBidId) { await updateBid(App.editingBidId, data); showToast('Bid updated ✓'); }
    else { await addBid(data); showToast('Bid created ✓'); }
    closeModal('modal-bid-form');
  } catch(e) { showToast('Error: '+e.message, 'error'); }
};

// ─── TASK MODAL ─────────────────────────────────────────────
window.openTaskModal = function(kanbanStatus='todo', bidId='') {
  App.editingTaskId = null;
  document.querySelector('#modal-task-form .modal-title').textContent = 'Add New Task';
  buildTaskForm(null, kanbanStatus, bidId);
  openModal('modal-task-form');
};

window.editTask = function(id) {
  App.editingTaskId = id;
  const t = App.tasks.find(t => t.id === id);
  if (!t) return;
  document.querySelector('#modal-task-form .modal-title').textContent = 'Edit Task';
  buildTaskForm(t);
  openModal('modal-task-form');
};

function buildTaskForm(task, kStatus='todo', bId='') {
  document.getElementById('task-form-body').innerHTML = `
    <div class="form-group">
      <label class="form-label">Task Title <span style="color:var(--red)">*</span></label>
      <input class="form-input" id="tf-title" value="${task?.title||''}" placeholder="Describe the task clearly">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Related Bid</label>
        <select class="form-select" id="tf-bid">
          <option value="">— General / No Bid —</option>
          ${App.bids.map(b=>`<option value="${b.id}" ${(task?.bidId||bId)===b.id?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-select" id="tf-priority">
          <option value="low" ${task?.priority==='low'?'selected':''}>🟢 Low</option>
          <option value="medium" ${(!task||task?.priority==='medium')?'selected':''}>🟡 Medium</option>
          <option value="high" ${task?.priority==='high'?'selected':''}>🔴 High</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Due Date</label>
        <input class="form-input" type="date" id="tf-due" value="${task?.dueDate||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Board Column</label>
        <select class="form-select" id="tf-kanban">
          <option value="todo" ${(task?.kanbanStatus||kStatus)==='todo'?'selected':''}>📋 To Do</option>
          <option value="in-progress" ${(task?.kanbanStatus||kStatus)==='in-progress'?'selected':''}>⚡ In Progress</option>
          <option value="review" ${(task?.kanbanStatus||kStatus)==='review'?'selected':''}>🔍 In Review</option>
          <option value="done" ${(task?.kanbanStatus||kStatus)==='done'?'selected':''}>✅ Done</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Assigned To</label>
        <input class="form-input" id="tf-assignee" value="${task?.assignee||''}" placeholder="Team member name">
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" id="tf-category">
          ${['Technical Writing','Cost Estimation','Drawings & Design','Review & QC','Submission','Coordination Meeting','Research','Compliance Check','Prequalification','Client Communication','Other'].map(c=>`<option value="${c}" ${task?.category===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notes / Description</label>
      <textarea class="form-textarea" id="tf-desc">${task?.description||''}</textarea>
    </div>
  `;
}

window.saveTask = async function() {
  const title = document.getElementById('tf-title').value.trim();
  if (!title) { showToast('Task title is required', 'error'); return; }
  const k = document.getElementById('tf-kanban').value;
  const data = {
    title,
    bidId: document.getElementById('tf-bid').value || null,
    priority: document.getElementById('tf-priority').value,
    dueDate: document.getElementById('tf-due').value || null,
    kanbanStatus: k,
    status: k === 'done' ? 'done' : 'pending',
    assignee: document.getElementById('tf-assignee').value.trim(),
    category: document.getElementById('tf-category').value,
    description: document.getElementById('tf-desc').value.trim(),
  };
  try {
    if (App.editingTaskId) { await updateTask(App.editingTaskId, data); showToast('Task updated ✓'); }
    else { await addTask(data); showToast('Task added ✓'); }
    closeModal('modal-task-form');
  } catch(e) { showToast('Error: '+e.message, 'error'); }
};

// ─── CONTACTS ───────────────────────────────────────────────
function renderContacts() {
  const s = (document.getElementById('contacts-search')?.value||'').toLowerCase();
  const list = App.contacts.filter(c =>
    !s || (c.name||'').toLowerCase().includes(s) || (c.company||'').toLowerCase().includes(s) || (c.role||'').toLowerCase().includes(s)
  );
  const tb = document.getElementById('contacts-tbody');
  tb.innerHTML = list.length ? list.map(c => `<tr>
    <td>
      <div style="font-weight:600;color:var(--text-bright);font-size:15px">${c.name}</div>
      <div class="text-sm text-light">${c.email||''}</div>
    </td>
    <td>${c.role||'—'}</td>
    <td>${c.company||'—'}</td>
    <td><span class="bid-tag tag-active text-xs">${c.department||'—'}</span></td>
    <td class="text-sm" style="font-family:var(--mono)">${c.phone||'—'}</td>
    <td>
      <div style="display:flex;gap:6px">
        <button class="btn btn-outline btn-sm" onclick="window.editContact('${c.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="window.removeContact('${c.id}')">🗑️</button>
      </div>
    </td>
  </tr>`).join('')
  : `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👥</div><h3>No contacts yet</h3><p>Add clients, consultants and team members.</p></div></td></tr>`;
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
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Full Name <span style="color:var(--red)">*</span></label>
        <input class="form-input" id="cf-name" value="${c?.name||''}" placeholder="Full name">
      </div>
      <div class="form-group">
        <label class="form-label">Job Title / Role</label>
        <input class="form-input" id="cf-role" value="${c?.role||''}" placeholder="e.g. Project Director">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Company / Organization</label>
        <input class="form-input" id="cf-company" value="${c?.company||''}" placeholder="Company name">
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" id="cf-dept">
          ${['Client','Sub-consultant','Government / Authority','Contractor','MEP','Structure','Architecture','Internal Team','Other'].map(d=>`<option value="${d}" ${c?.department===d?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" type="email" id="cf-email" value="${c?.email||''}" placeholder="email@example.com">
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input class="form-input" id="cf-phone" value="${c?.phone||''}" placeholder="+1 234 567 890">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Country / Location</label>
      <input class="form-input" id="cf-location" value="${c?.location||''}" placeholder="e.g. Dubai, UAE">
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="cf-notes" placeholder="How do you know them? What bids are they involved in?">${c?.notes||''}</textarea>
    </div>
  `;
}

window.saveContact = async function() {
  const name = document.getElementById('cf-name').value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }
  const data = {
    name,
    role: document.getElementById('cf-role').value.trim(),
    company: document.getElementById('cf-company').value.trim(),
    department: document.getElementById('cf-dept').value,
    email: document.getElementById('cf-email').value.trim(),
    phone: document.getElementById('cf-phone').value.trim(),
    location: document.getElementById('cf-location').value.trim(),
    notes: document.getElementById('cf-notes').value.trim(),
  };
  try {
    if (App.editingContactId) { await updateContact(App.editingContactId, data); showToast('Contact updated ✓'); }
    else { await addContact(data); showToast('Contact added ✓'); }
    closeModal('modal-contact-form');
  } catch(e) { showToast('Error: '+e.message, 'error'); }
};

window.removeContact = async function(id) {
  const c = App.contacts.find(c => c.id === id);
  if (confirm(`Remove contact "${c?.name}"?`)) { await deleteContact(id); showToast('Contact removed'); }
};

// ─── DOCUMENTS ──────────────────────────────────────────────
function renderDocuments() {
  const fBid = document.getElementById('docs-bid-filter')?.value || 'all';
  const dDrop = document.getElementById('docs-bid-filter');
  if (dDrop && !dDrop.dataset.populated) {
    App.bids.forEach(b => { const o=document.createElement('option'); o.value=b.id; o.textContent=b.name; dDrop.appendChild(o); });
    dDrop.dataset.populated = '1';
  }

  const list = fBid === 'all' ? App.documents : App.documents.filter(d => d.bidId === fBid);
  const tb   = document.getElementById('docs-tbody');
  const icon = n => { const e=(n||'').split('.').pop()?.toLowerCase(); return e==='pdf'?'📄':e==='docx'||e==='doc'?'📝':e==='xlsx'||e==='xls'?'📊':e==='pptx'?'📊':'📎'; };
  tb.innerHTML = list.length ? list.map(d => {
    const bid = App.bids.find(b => b.id === d.bidId);
    return `<tr>
      <td style="font-size:22px;width:44px">${icon(d.fileName)}</td>
      <td>
        <div style="font-weight:600;color:var(--text-bright)">${d.title||d.fileName}</div>
        <div class="text-xs text-light" style="font-family:var(--mono)">${d.fileName||''}</div>
      </td>
      <td>${bid?`<span class="bid-tag tag-active text-xs">${bid.name}</span>`:'—'}</td>
      <td><span class="bid-tag tag-paused text-xs">${d.category||'General'}</span></td>
      <td class="text-sm text-light">${d.notes||''}</td>
      <td>
        <div style="display:flex;gap:6px">
          ${d.url?`<a href="${d.url}" target="_blank" class="btn btn-outline btn-sm">🔗 Open</a>`:''}
          <button class="btn btn-danger btn-sm" onclick="window.removeDoc('${d.id}')">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('')
  : `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📄</div><h3>No documents yet</h3><p>Add links to your documents on SharePoint, Google Drive, etc.</p></div></td></tr>`;
}

window.openDocModal = function() {
  document.getElementById('doc-form-body').innerHTML = `
    <div class="form-group">
      <label class="form-label">Document Title <span style="color:var(--red)">*</span></label>
      <input class="form-input" id="df-title" placeholder="e.g. Technical Proposal v3">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Related Bid</label>
        <select class="form-select" id="df-bid">
          <option value="">— General —</option>
          ${App.bids.map(b=>`<option value="${b.id}">${b.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" id="df-cat">
          ${['Technical Proposal','Cost Proposal','Drawings','Prequalification','Submission Package','Reference Document','Template','Contract','Correspondence','Other'].map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">File Name</label>
      <input class="form-input" id="df-filename" placeholder="e.g. DAH_TechProposal_v2.pdf">
    </div>
    <div class="form-group">
      <label class="form-label">Link / URL <span class="form-label-hint">(SharePoint, Drive, Dropbox...)</span></label>
      <input class="form-input" id="df-url" placeholder="https://...">
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="df-notes" placeholder="Version notes, status, who it belongs to..."></textarea>
    </div>
  `;
  openModal('modal-doc-form');
};

window.saveDocument = async function() {
  const title = document.getElementById('df-title').value.trim();
  if (!title) { showToast('Title required', 'error'); return; }
  try {
    await addDocument({ title, bidId: document.getElementById('df-bid').value||null, category: document.getElementById('df-cat').value, fileName: document.getElementById('df-filename').value.trim(), url: document.getElementById('df-url').value.trim(), notes: document.getElementById('df-notes').value.trim() });
    showToast('Document added ✓');
    closeModal('modal-doc-form');
  } catch(e) { showToast('Error: '+e.message, 'error'); }
};

window.removeDoc = async function(id) {
  if (confirm('Remove this document?')) { await deleteDocument(id); showToast('Document removed'); }
};

// ─── INIT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Nav clicks
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.page); });
  });

  // Live search/filter events
  document.addEventListener('input', e => {
    const id = e.target.id;
    if (['bids-search'].includes(id)) renderBids();
    if (['tasks-search'].includes(id)) renderTasks();
    if (id === 'contacts-search') renderContacts();
  });
  document.addEventListener('change', e => {
    const id = e.target.id;
    if (id === 'bids-filter') renderBids();
    if (['tasks-bid-filter','tasks-priority-filter','tasks-status-filter'].includes(id)) renderTasks();
    if (id === 'kanban-bid-filter') renderKanban();
    if (id === 'docs-bid-filter') renderDocuments();
  });

  // Clock
  const updateClock = () => {
    const el = document.getElementById('topbar-date');
    if (el) el.textContent = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  };
  updateClock();

  // Close loading
  setTimeout(() => { const l=document.getElementById('loading-overlay'); if(l) l.style.display='none'; }, 1400);

  // Start Firebase
  initListeners();
  navigate('dashboard');
});
