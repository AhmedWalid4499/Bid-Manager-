// ============================================================
//  app.js — Bid Command Main Application
// ============================================================

import {
  addBid, updateBid, deleteBid, listenBids,
  addTask, updateTask, deleteTask, listenTasks,
  addContact, updateContact, deleteContact, listenContacts,
  addDocument, getDocuments, deleteDocument, listenDocuments
} from './firebase.js';

// ─── GLOBAL STATE ──────────────────────────────────────────
window.App = {
  bids: [],
  tasks: [],
  contacts: [],
  documents: [],
  activePage: 'dashboard',
  filters: { bidStatus: 'all', search: '' },
  dragItem: null,
  editingBidId: null,
  editingTaskId: null,
  editingContactId: null,
  unsubscribers: []
};

// ─── UTILITY ───────────────────────────────────────────────
export function showToast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✓' : '✗'}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

export function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatCurrency(v, cur = 'USD') {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v);
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const d   = new Date(dateStr);
  return Math.round((d - now) / 86400000);
}

export function deadlineClass(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return '';
  if (d < 0)  return 'deadline-urgent';
  if (d <= 7) return 'deadline-urgent';
  if (d <= 14) return 'deadline-soon';
  return 'deadline-ok';
}

export function getStatusTag(status) {
  const map = {
    active:   '<span class="bid-tag tag-active">Active</span>',
    prep:     '<span class="bid-tag tag-prep">In Prep</span>',
    submitted:'<span class="bid-tag tag-submit">Submitted</span>',
    won:      '<span class="bid-tag tag-won">Won</span>',
    lost:     '<span class="bid-tag tag-lost">Lost</span>',
    paused:   '<span class="bid-tag tag-paused">On Hold</span>',
  };
  return map[status] || '';
}

export function getStatusDot(status) {
  return `<span class="status-dot dot-${status}"></span>`;
}

export function circleProgress(pct, color = '#4a8de0') {
  const r = 26; const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return `
    <div class="circle-progress">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle class="bg" cx="32" cy="32" r="${r}"/>
        <circle class="fill" cx="32" cy="32" r="${r}"
          stroke="${color}"
          stroke-dasharray="${circ}"
          stroke-dashoffset="${offset}"/>
      </svg>
      <div class="label">${pct}%</div>
    </div>`;
}

// Compute bid completion %
export function bidProgress(bid) {
  const tasks = App.tasks.filter(t => t.bidId === bid.id);
  if (!tasks.length) return 0;
  const done = tasks.filter(t => t.status === 'done').length;
  return Math.round((done / tasks.length) * 100);
}

// ─── NAVIGATION ────────────────────────────────────────────
export function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(el => el.classList.add('active'));
  App.activePage = page;
  window.scrollTo(0,0);
  // Re-render active page
  renderPage(page);
}

function renderPage(page) {
  if (page === 'dashboard')   renderDashboard();
  if (page === 'bids')        renderBids();
  if (page === 'tasks')       renderTasks();
  if (page === 'kanban')      renderKanban();
  if (page === 'contacts')    renderContacts();
  if (page === 'documents')   renderDocumentsPage();
}

// ─── LIVE DATA LISTENERS ────────────────────────────────────
export function initListeners() {
  App.unsubscribers.forEach(u => u());
  App.unsubscribers = [];

  App.unsubscribers.push(
    listenBids(bids => {
      App.bids = bids;
      updateNavBadges();
      renderPage(App.activePage);
    }),
    listenTasks(tasks => {
      App.tasks = tasks;
      updateNavBadges();
      renderPage(App.activePage);
    }),
    listenContacts(contacts => {
      App.contacts = contacts;
      renderPage(App.activePage);
    }),
    listenDocuments(docs => {
      App.documents = docs;
      renderPage(App.activePage);
    })
  );
}

function updateNavBadges() {
  const activeBids = App.bids.filter(b => b.status === 'active' || b.status === 'prep').length;
  const pendingTasks = App.tasks.filter(t => t.status !== 'done').length;
  const urgentDeadlines = App.bids.filter(b => {
    const d = daysUntil(b.submissionDate);
    return d !== null && d >= 0 && d <= 7;
  }).length;
  document.querySelectorAll('[data-badge="bids"]').forEach(el => el.textContent = activeBids || '');
  document.querySelectorAll('[data-badge="tasks"]').forEach(el => el.textContent = pendingTasks || '');
  document.querySelectorAll('[data-badge="deadlines"]').forEach(el => {
    el.textContent = urgentDeadlines || '';
    el.style.background = urgentDeadlines ? 'var(--red)' : '';
  });
}

// ─── DASHBOARD ─────────────────────────────────────────────
function renderDashboard() {
  const { bids, tasks } = App;
  const activeBids = bids.filter(b => b.status === 'active' || b.status === 'prep');
  const wonBids    = bids.filter(b => b.status === 'won');
  const pendingTasks = tasks.filter(t => t.status !== 'done');
  const overdueTasks = tasks.filter(t => t.status !== 'done' && t.dueDate && daysUntil(t.dueDate) < 0);
  const totalValue   = wonBids.reduce((s, b) => s + (parseFloat(b.value) || 0), 0);
  const urgentBids   = bids.filter(b => {
    const d = daysUntil(b.submissionDate);
    return d !== null && d >= 0 && d <= 14 && b.status !== 'submitted' && b.status !== 'won' && b.status !== 'lost';
  }).sort((a, b) => daysUntil(a.submissionDate) - daysUntil(b.submissionDate));

  const winRate = bids.filter(b => b.status === 'won' || b.status === 'lost').length
    ? Math.round(wonBids.length / bids.filter(b => b.status === 'won' || b.status === 'lost').length * 100) : 0;

  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-card gold">
      <div class="stat-label">Active Bids</div>
      <div class="stat-value">${activeBids.length}</div>
      <div class="stat-sub">${bids.length} total bids</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-label">Pending Tasks</div>
      <div class="stat-value">${pendingTasks.length}</div>
      <div class="stat-sub">${overdueTasks.length > 0 ? `<span class="text-red">${overdueTasks.length} overdue</span>` : 'All on track'}</div>
    </div>
    <div class="stat-card green">
      <div class="stat-label">Win Rate</div>
      <div class="stat-value">${winRate}%</div>
      <div class="stat-sub">${wonBids.length} won of ${bids.filter(b=>b.status==='won'||b.status==='lost').length} decided</div>
    </div>
    <div class="stat-card cyan">
      <div class="stat-label">Contract Value Won</div>
      <div class="stat-value" style="font-size:22px;">${formatCurrency(totalValue)}</div>
      <div class="stat-sub">Secured contracts</div>
    </div>
    <div class="stat-card red">
      <div class="stat-label">Urgent Deadlines</div>
      <div class="stat-value">${urgentBids.length}</div>
      <div class="stat-sub">Within 14 days</div>
    </div>
  `;

  // Urgent bids
  const urgentEl = document.getElementById('dash-urgent');
  if (!urgentBids.length) {
    urgentEl.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><h3>No Urgent Deadlines</h3><p>No bids due within the next 14 days</p></div>`;
  } else {
    urgentEl.innerHTML = urgentBids.map(b => {
      const days = daysUntil(b.submissionDate);
      const pct  = bidProgress(b);
      return `
      <div class="bid-card card-gold" onclick="window.openBidDetail('${b.id}')">
        <div class="bid-card-header">
          <div>
            <div class="bid-ref">${b.refNumber || 'REF—'}</div>
            <div class="bid-name">${b.name}</div>
          </div>
          ${circleProgress(pct, days <= 7 ? '#e05555' : '#d4a742')}
        </div>
        <div class="bid-client">🏢 ${b.client || 'Client TBC'}</div>
        <div class="flex-center gap-8 mb-8">
          ${getStatusTag(b.status)}
          <span class="bid-tag ${days <= 3 ? 'tag-lost' : days <= 7 ? 'tag-prep' : 'tag-active'}"
            style="font-size:11px; font-weight:700;">
            ${days === 0 ? '🔥 DUE TODAY' : days < 0 ? `${Math.abs(days)}d OVERDUE` : `${days}d left`}
          </span>
        </div>
        <div class="progress-wrap">
          <div class="progress-label"><span>Progress</span><span>${pct}%</span></div>
          <div class="progress-bar"><div class="progress-fill ${days <= 7 ? '' : 'gold'}" style="width:${pct}%"></div></div>
        </div>
      </div>`;
    }).join('');
  }

  // Recent tasks
  const recentTasks = tasks.filter(t => t.status !== 'done').slice(0, 6);
  const tasksEl = document.getElementById('dash-tasks');
  if (!recentTasks.length) {
    tasksEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><h3>No Pending Tasks</h3></div>`;
  } else {
    tasksEl.innerHTML = `<div class="task-list">${recentTasks.map(t => taskItemHTML(t)).join('')}</div>`;
  }

  // Bid pipeline by status
  const statuses = ['prep','active','submitted','won','lost','paused'];
  const pipeEl = document.getElementById('dash-pipeline');
  pipeEl.innerHTML = statuses.map(s => {
    const count = bids.filter(b => b.status === s).length;
    return `
    <div class="fin-row">
      <span class="fin-label">${getStatusDot(s)} ${s.charAt(0).toUpperCase()+s.slice(1)}</span>
      <span class="fin-value">${count} bid${count !== 1 ? 's' : ''}</span>
    </div>`;
  }).join('');
}

// ─── BIDS PAGE ──────────────────────────────────────────────
function renderBids() {
  const search = (document.getElementById('bids-search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('bids-filter')?.value || 'all';

  let filtered = App.bids;
  if (statusFilter !== 'all') filtered = filtered.filter(b => b.status === statusFilter);
  if (search) filtered = filtered.filter(b =>
    b.name?.toLowerCase().includes(search) ||
    b.client?.toLowerCase().includes(search) ||
    b.refNumber?.toLowerCase().includes(search)
  );

  const grid = document.getElementById('bids-grid');
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">📁</div>
      <h3>No Bids Found</h3>
      <p>Add your first bid or adjust filters</p>
      <button class="btn btn-primary" onclick="window.openBidModal()" style="margin-top:12px">+ Add Bid</button>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(b => {
    const pct   = bidProgress(b);
    const tasks = App.tasks.filter(t => t.bidId === b.id);
    const depts = (b.departments || []).map(d =>
      `<span class="dept-chip active">${d}</span>`).join('');
    return `
    <div class="bid-card" onclick="window.openBidDetail('${b.id}')">
      <div class="bid-card-header">
        <div style="flex:1">
          <div class="bid-ref">${b.refNumber || '—'} · ${b.region || 'MEA'}</div>
          <div class="bid-name">${b.name}</div>
          <div class="bid-client">🏢 ${b.client || 'Client TBC'}</div>
        </div>
        ${circleProgress(pct)}
      </div>
      <div class="bid-meta">
        ${getStatusTag(b.status)}
        ${b.type ? `<span class="bid-tag tag-paused">${b.type}</span>` : ''}
      </div>
      ${depts ? `<div class="dept-chips">${depts}</div>` : ''}
      <div class="flex-center gap-16 mb-16" style="margin-top:14px; flex-wrap:wrap">
        <div>
          <div class="text-mono" style="font-size:10px; color:var(--text-muted)">SUBMISSION</div>
          <div class="text-mono ${deadlineClass(b.submissionDate)}" style="font-size:12px;">
            ${b.submissionDate ? b.submissionDate : '—'}
          </div>
        </div>
        <div>
          <div class="text-mono" style="font-size:10px; color:var(--text-muted)">VALUE</div>
          <div class="text-mono" style="font-size:12px; color:var(--gold)">
            ${b.value ? formatCurrency(b.value, b.currency || 'USD') : '—'}
          </div>
        </div>
        <div>
          <div class="text-mono" style="font-size:10px; color:var(--text-muted)">TASKS</div>
          <div class="text-mono" style="font-size:12px;">${tasks.filter(t=>t.status==='done').length}/${tasks.length}</div>
        </div>
      </div>
      <div class="progress-wrap">
        <div class="progress-label"><span>Completion</span><span>${pct}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
    </div>`;
  }).join('');
}

// ─── TASKS PAGE ─────────────────────────────────────────────
function renderTasks() {
  const filterBid = document.getElementById('tasks-bid-filter')?.value || 'all';
  const filterPri = document.getElementById('tasks-priority-filter')?.value || 'all';
  const filterStatus = document.getElementById('tasks-status-filter')?.value || 'pending';
  const search = (document.getElementById('tasks-search')?.value || '').toLowerCase();

  let filtered = App.tasks;
  if (filterBid !== 'all') filtered = filtered.filter(t => t.bidId === filterBid);
  if (filterPri !== 'all') filtered = filtered.filter(t => t.priority === filterPri);
  if (filterStatus === 'pending') filtered = filtered.filter(t => t.status !== 'done');
  if (filterStatus === 'done')    filtered = filtered.filter(t => t.status === 'done');
  if (search) filtered = filtered.filter(t => t.title?.toLowerCase().includes(search) || t.description?.toLowerCase().includes(search));

  // Sort: overdue first, then by due date
  filtered.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  // Populate bid filter options
  const bidFilter = document.getElementById('tasks-bid-filter');
  if (bidFilter && !bidFilter.dataset.populated) {
    App.bids.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id; opt.textContent = b.name;
      bidFilter.appendChild(opt);
    });
    bidFilter.dataset.populated = '1';
  }

  const list = document.getElementById('tasks-list');
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><h3>No Tasks Found</h3></div>`;
    return;
  }
  list.innerHTML = `<div class="task-list">${filtered.map(t => taskItemHTML(t, true)).join('')}</div>`;

  // Stats
  const total = App.tasks.length;
  const done  = App.tasks.filter(t => t.status === 'done').length;
  const pct   = total ? Math.round(done/total*100) : 0;
  const statsEl = document.getElementById('tasks-stats');
  if (statsEl) statsEl.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <div class="flex-center gap-16" style="flex-wrap:wrap">
        <div>${circleProgress(pct, '#3ecf8e')}</div>
        <div>
          <div class="stat-label">Overall Task Completion</div>
          <div class="stat-value">${pct}%</div>
          <div class="stat-sub">${done} of ${total} tasks completed</div>
        </div>
        <div class="flex-center gap-16" style="margin-left:auto; flex-wrap:wrap">
          <div style="text-align:center"><div class="stat-label">High Priority</div><div class="text-red text-mono" style="font-size:22px;font-weight:bold">${App.tasks.filter(t=>t.priority==='high'&&t.status!=='done').length}</div></div>
          <div style="text-align:center"><div class="stat-label">Overdue</div><div class="text-red text-mono" style="font-size:22px;font-weight:bold">${App.tasks.filter(t=>t.status!=='done'&&t.dueDate&&daysUntil(t.dueDate)<0).length}</div></div>
          <div style="text-align:center"><div class="stat-label">Due This Week</div><div class="text-gold text-mono" style="font-size:22px;font-weight:bold">${App.tasks.filter(t=>t.status!=='done'&&t.dueDate&&daysUntil(t.dueDate)>=0&&daysUntil(t.dueDate)<=7).length}</div></div>
        </div>
      </div>
    </div>`;
}

export function taskItemHTML(task, showActions = false) {
  const bid = App.bids.find(b => b.id === task.bidId);
  const isDone = task.status === 'done';
  const days = daysUntil(task.dueDate);
  const dueClass = isDone ? '' : deadlineClass(task.dueDate);
  return `
  <div class="task-item priority-${task.priority || 'medium'} ${isDone ? 'done' : ''}" data-task-id="${task.id}">
    <div class="task-check ${isDone ? 'checked' : ''}" onclick="window.toggleTask('${task.id}')"></div>
    <div style="flex:1">
      <div class="task-title">${task.title}</div>
      ${bid ? `<div class="task-bid-tag">📁 ${bid.name}</div>` : ''}
      ${task.description ? `<div style="font-size:11px;color:var(--text-muted);margin-top:3px">${task.description}</div>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
      ${task.dueDate ? `<div class="task-due ${dueClass}">${days === 0 ? 'Today' : days < 0 ? `${Math.abs(days)}d ago` : days === 1 ? 'Tomorrow' : task.dueDate}</div>` : ''}
      <div style="display:flex;gap:6px">
        <span class="bid-tag ${task.priority === 'high' ? 'tag-lost' : task.priority === 'medium' ? 'tag-prep' : 'tag-active'}">${task.priority || 'med'}</span>
        ${showActions ? `
          <button class="btn btn-outline btn-sm btn-icon" onclick="event.stopPropagation();window.editTask('${task.id}')" title="Edit">✏️</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="event.stopPropagation();window.deleteTaskConfirm('${task.id}')" title="Delete">🗑️</button>
        ` : ''}
      </div>
    </div>
  </div>`;
}

// ─── KANBAN ─────────────────────────────────────────────────
function renderKanban() {
  const filterBid = document.getElementById('kanban-bid-filter')?.value || 'all';
  let tasks = App.tasks;
  if (filterBid !== 'all') tasks = tasks.filter(t => t.bidId === filterBid);

  const cols = [
    { key: 'todo',        label: 'To Do',        color: 'var(--text-muted)' },
    { key: 'in-progress', label: 'In Progress',   color: 'var(--blue-light)' },
    { key: 'review',      label: 'In Review',     color: 'var(--gold)' },
    { key: 'done',        label: 'Done',          color: 'var(--green)' },
  ];

  const board = document.getElementById('kanban-board');
  board.innerHTML = cols.map(col => {
    const colTasks = tasks.filter(t => (t.kanbanStatus || (t.status === 'done' ? 'done' : 'todo')) === col.key);
    return `
    <div class="kanban-col">
      <div class="kanban-col-header">
        <span class="kanban-col-title" style="color:${col.color}">${col.label}</span>
        <span class="kanban-count">${colTasks.length}</span>
      </div>
      <div class="kanban-items" data-col="${col.key}"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="window.onKanbanDrop(event,'${col.key}')">
        ${colTasks.map(t => kanbanCardHTML(t)).join('')}
        <div style="height:60px;display:flex;align-items:center;justify-content:center">
          <button class="btn btn-outline btn-sm" onclick="window.openTaskModal('${col.key}','${filterBid !== 'all' ? filterBid : ''}')">+ Add Card</button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Populate kanban bid filter
  const bidFilter = document.getElementById('kanban-bid-filter');
  if (bidFilter && !bidFilter.dataset.populated) {
    App.bids.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id; opt.textContent = b.name;
      bidFilter.appendChild(opt);
    });
    bidFilter.dataset.populated = '1';
  }
}

function kanbanCardHTML(task) {
  const bid = App.bids.find(b => b.id === task.bidId);
  const days = daysUntil(task.dueDate);
  return `
  <div class="kanban-card" draggable="true" data-task-id="${task.id}"
    ondragstart="window.onKanbanDragStart(event,'${task.id}')"
    ondragend="event.target.classList.remove('dragging')">
    <div class="kanban-card-bid">${bid ? `📁 ${bid.name}` : ''}</div>
    <div class="kanban-card-title">${task.title}</div>
    <div class="kanban-card-meta">
      <span class="bid-tag ${task.priority === 'high' ? 'tag-lost' : task.priority === 'medium' ? 'tag-prep' : 'tag-active'}">${task.priority || 'med'}</span>
      ${task.dueDate ? `<span class="${deadlineClass(task.dueDate)}">${days !== null && days <= 0 ? (days === 0 ? 'Today' : `${Math.abs(days)}d ago`) : task.dueDate}</span>` : ''}
    </div>
    <div style="display:flex;gap:4px;margin-top:8px">
      <button class="btn btn-outline btn-sm" onclick="window.editTask('${task.id}')">✏️</button>
      <button class="btn btn-danger btn-sm" onclick="window.deleteTaskConfirm('${task.id}')">🗑️</button>
    </div>
  </div>`;
}

// ─── CONTACTS PAGE ──────────────────────────────────────────
function renderContacts() {
  const search = (document.getElementById('contacts-search')?.value || '').toLowerCase();
  let filtered = App.contacts;
  if (search) filtered = filtered.filter(c =>
    c.name?.toLowerCase().includes(search) || c.company?.toLowerCase().includes(search) || c.role?.toLowerCase().includes(search)
  );

  const tbody = document.getElementById('contacts-tbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👥</div><h3>No Contacts</h3></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(c => `
  <tr>
    <td>
      <div style="font-weight:600;color:var(--text-bright)">${c.name}</div>
      <div style="font-size:11px;color:var(--text-muted)">${c.email || ''}</div>
    </td>
    <td><span style="font-size:12px">${c.role || '—'}</span></td>
    <td>${c.company || '—'}</td>
    <td><span class="bid-tag tag-active" style="font-size:10px">${c.department || '—'}</span></td>
    <td class="text-mono" style="font-size:11px">${c.phone || '—'}</td>
    <td>
      <div style="display:flex;gap:6px">
        <button class="btn btn-outline btn-sm" onclick="window.editContact('${c.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="window.deleteContactConfirm('${c.id}')">🗑️</button>
      </div>
    </td>
  </tr>`).join('');
}

// ─── DOCUMENTS PAGE ─────────────────────────────────────────
function renderDocumentsPage() {
  const filterBid = document.getElementById('docs-bid-filter')?.value || 'all';
  let filtered = App.documents;
  if (filterBid !== 'all') filtered = filtered.filter(d => d.bidId === filterBid);

  const bidFilter = document.getElementById('docs-bid-filter');
  if (bidFilter && !bidFilter.dataset.populated) {
    App.bids.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id; opt.textContent = b.name;
      bidFilter.appendChild(opt);
    });
    bidFilter.dataset.populated = '1';
  }

  const tbody = document.getElementById('docs-tbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📄</div><h3>No Documents</h3></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(d => {
    const bid = App.bids.find(b => b.id === d.bidId);
    const icons = { pdf:'📄', doc:'📝', xls:'📊', img:'🖼️', other:'📎' };
    const ext = (d.fileName || '').split('.').pop()?.toLowerCase();
    const icon = icons[ext === 'pdf' ? 'pdf' : ext === 'docx' || ext === 'doc' ? 'doc' : ext === 'xlsx' ? 'xls' : 'other'] || '📎';
    return `
    <tr>
      <td><span style="font-size:20px">${icon}</span></td>
      <td>
        <div style="font-weight:600">${d.title || d.fileName}</div>
        <div style="font-size:11px;color:var(--text-muted)">${d.fileName || ''}</div>
      </td>
      <td>${bid ? `<span class="bid-tag tag-active" style="font-size:10px">${bid.name}</span>` : '—'}</td>
      <td><span class="bid-tag tag-paused" style="font-size:10px">${d.category || 'General'}</span></td>
      <td>
        <div style="display:flex;gap:6px">
          ${d.url ? `<a href="${d.url}" target="_blank" class="btn btn-outline btn-sm">🔗 Open</a>` : ''}
          <button class="btn btn-danger btn-sm" onclick="window.deleteDocConfirm('${d.id}')">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── BID DETAIL MODAL ───────────────────────────────────────
window.openBidDetail = function(bidId) {
  const bid = App.bids.find(b => b.id === bidId);
  if (!bid) return;
  const tasks = App.tasks.filter(t => t.bidId === bidId);
  const pct   = bidProgress(bid);
  const modal = document.getElementById('modal-bid-detail');

  modal.querySelector('.modal-title').textContent = bid.name;
  modal.querySelector('#bid-detail-body').innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" data-tab="overview" onclick="window.switchBidTab(this,'overview')">Overview</button>
      <button class="tab-btn" data-tab="tasks" onclick="window.switchBidTab(this,'tasks')">Tasks (${tasks.length})</button>
      <button class="tab-btn" data-tab="financials" onclick="window.switchBidTab(this,'financials')">Financials</button>
      <button class="tab-btn" data-tab="departments" onclick="window.switchBidTab(this,'departments')">Departments</button>
    </div>
    <div id="bid-tab-overview">
      <div class="grid-2 mb-16">
        <div class="card">
          <div class="stat-label">Reference</div>
          <div class="text-bright text-mono">${bid.refNumber || '—'}</div>
        </div>
        <div class="card">
          <div class="stat-label">Status</div>
          <div>${getStatusTag(bid.status)}</div>
        </div>
        <div class="card">
          <div class="stat-label">Client</div>
          <div class="text-bright">${bid.client || '—'}</div>
        </div>
        <div class="card">
          <div class="stat-label">Region</div>
          <div class="text-bright">${bid.region || '—'}</div>
        </div>
        <div class="card">
          <div class="stat-label">Submission Date</div>
          <div class="text-bright ${deadlineClass(bid.submissionDate)}">${bid.submissionDate || '—'}</div>
        </div>
        <div class="card">
          <div class="stat-label">Bid Type</div>
          <div class="text-bright">${bid.type || '—'}</div>
        </div>
      </div>
      ${bid.description ? `<div class="card mb-16"><div class="stat-label">Description / Scope</div><div style="margin-top:8px;font-size:13px;line-height:1.7">${bid.description}</div></div>` : ''}
      <div class="card">
        <div class="stat-label">Progress</div>
        <div class="flex-center gap-16" style="margin-top:10px">
          ${circleProgress(pct)}
          <div style="flex:1">
            <div class="progress-bar" style="height:8px"><div class="progress-fill" style="width:${pct}%"></div></div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:5px">${tasks.filter(t=>t.status==='done').length} of ${tasks.length} tasks complete</div>
          </div>
        </div>
      </div>
    </div>
    <div id="bid-tab-tasks" style="display:none">
      <div class="section-header">
        <span class="section-title">Tasks</span>
        <button class="btn btn-primary btn-sm" onclick="window.openTaskModal('todo','${bidId}')">+ Add Task</button>
      </div>
      <div class="task-list">${tasks.length ? tasks.map(t => taskItemHTML(t, true)).join('') : '<div class="empty-state"><p>No tasks yet</p></div>'}</div>
    </div>
    <div id="bid-tab-financials" style="display:none">
      <div class="card">
        <div class="fin-row"><span class="fin-label">Estimated Value</span><span class="fin-value positive">${formatCurrency(bid.value, bid.currency || 'USD')}</span></div>
        <div class="fin-row"><span class="fin-label">Currency</span><span class="fin-value">${bid.currency || 'USD'}</span></div>
        <div class="fin-row"><span class="fin-label">Cost Estimate</span><span class="fin-value">${formatCurrency(bid.costEstimate, bid.currency || 'USD')}</span></div>
        <div class="fin-row"><span class="fin-label">Margin %</span><span class="fin-value ${bid.margin >= 20 ? 'positive' : 'warning'}">${bid.margin ? bid.margin + '%' : '—'}</span></div>
        <div class="fin-row"><span class="fin-label">Payment Terms</span><span class="fin-value">${bid.paymentTerms || '—'}</span></div>
      </div>
    </div>
    <div id="bid-tab-departments" style="display:none">
      <div class="card">
        <div class="stat-label mb-8">Departments Involved</div>
        <div class="dept-chips">${(bid.departments || []).map(d => `<span class="dept-chip active">${d}</span>`).join('') || '<span style="color:var(--text-muted);font-size:13px">No departments specified</span>'}</div>
        ${bid.lead ? `<div class="fin-row" style="margin-top:16px"><span class="fin-label">Bid Lead</span><span class="fin-value">${bid.lead}</span></div>` : ''}
        ${bid.notes ? `<div style="margin-top:14px"><div class="stat-label">Notes</div><div style="font-size:13px;margin-top:6px;line-height:1.7;color:var(--text)">${bid.notes}</div></div>` : ''}
      </div>
    </div>
  `;

  document.getElementById('bid-detail-edit-btn').onclick = () => {
    closeModal('modal-bid-detail');
    window.editBid(bidId);
  };
  document.getElementById('bid-detail-delete-btn').onclick = () => {
    if (confirm(`Delete bid "${bid.name}"? This cannot be undone.`)) {
      deleteBid(bidId).then(() => {
        closeModal('modal-bid-detail');
        showToast('Bid deleted');
      });
    }
  };

  openModal('modal-bid-detail');
};

window.switchBidTab = function(btn, tab) {
  document.querySelectorAll('#bid-detail-body .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['overview','tasks','financials','departments'].forEach(t => {
    const el = document.getElementById(`bid-tab-${t}`);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
};

// ─── BID MODAL (ADD/EDIT) ───────────────────────────────────
window.openBidModal = function(bidId = null) {
  App.editingBidId = bidId;
  const bid = bidId ? App.bids.find(b => b.id === bidId) : null;
  const modal = document.getElementById('modal-bid-form');
  modal.querySelector('.modal-title').textContent = bid ? 'Edit Bid' : 'New Bid';

  const depts = ['MEP','Structure','Architecture','Civil','Electrical','Mechanical','IT/ICT','Sustainability','Project Management','Cost Management'];
  const checkedDepts = bid?.departments || [];

  modal.querySelector('#bid-form-body').innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Bid Name *</label>
        <input class="form-input" id="bf-name" value="${bid?.name || ''}" placeholder="Project name">
      </div>
      <div class="form-group">
        <label class="form-label">Reference Number</label>
        <input class="form-input" id="bf-ref" value="${bid?.refNumber || ''}" placeholder="e.g. DAH-2024-001">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Client</label>
        <input class="form-input" id="bf-client" value="${bid?.client || ''}" placeholder="Client organization">
      </div>
      <div class="form-group">
        <label class="form-label">Status *</label>
        <select class="form-select" id="bf-status">
          ${['prep','active','submitted','won','lost','paused'].map(s => `<option value="${s}" ${bid?.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Region</label>
        <select class="form-select" id="bf-region">
          ${['MEA','Middle East','North Africa','GCC','Levant','East Africa','West Africa','South Asia','Europe','Other'].map(r => `<option value="${r}" ${bid?.region===r?'selected':''}>${r}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Bid Type</label>
        <select class="form-select" id="bf-type">
          ${['Technical Proposal','Cost Proposal','EOI','Prequalification','Full Tender','Design Competition','Framework','Other'].map(t => `<option value="${t}" ${bid?.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Submission Date</label>
        <input class="form-input" type="date" id="bf-date" value="${bid?.submissionDate || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Bid Lead</label>
        <input class="form-input" id="bf-lead" value="${bid?.lead || ''}" placeholder="Lead person name">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Estimated Value</label>
        <input class="form-input" type="number" id="bf-value" value="${bid?.value || ''}" placeholder="0">
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <select class="form-select" id="bf-currency">
          ${['USD','EUR','GBP','AED','SAR','EGP','LBP','JOD','KWD','QAR','OMR','BHD','MAD'].map(c => `<option value="${c}" ${bid?.currency===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Cost Estimate</label>
        <input class="form-input" type="number" id="bf-cost" value="${bid?.costEstimate || ''}" placeholder="0">
      </div>
      <div class="form-group">
        <label class="form-label">Target Margin %</label>
        <input class="form-input" type="number" id="bf-margin" value="${bid?.margin || ''}" placeholder="e.g. 25">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Departments Involved</label>
      <div class="dept-chips" style="margin-top:4px">${depts.map(d => `
        <span class="dept-chip ${checkedDepts.includes(d)?'active':''}" onclick="this.classList.toggle('active')" data-dept="${d}">${d}</span>
      `).join('')}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Payment Terms</label>
      <input class="form-input" id="bf-payment" value="${bid?.paymentTerms || ''}" placeholder="e.g. 30-60-10">
    </div>
    <div class="form-group">
      <label class="form-label">Scope / Description</label>
      <textarea class="form-textarea" id="bf-desc">${bid?.description || ''}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Internal Notes</label>
      <textarea class="form-textarea" id="bf-notes">${bid?.notes || ''}</textarea>
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
    client: document.getElementById('bf-client').value.trim(),
    status: document.getElementById('bf-status').value,
    region: document.getElementById('bf-region').value,
    type: document.getElementById('bf-type').value,
    submissionDate: document.getElementById('bf-date').value,
    lead: document.getElementById('bf-lead').value.trim(),
    value: parseFloat(document.getElementById('bf-value').value) || null,
    currency: document.getElementById('bf-currency').value,
    costEstimate: parseFloat(document.getElementById('bf-cost').value) || null,
    margin: parseFloat(document.getElementById('bf-margin').value) || null,
    paymentTerms: document.getElementById('bf-payment').value.trim(),
    departments,
    description: document.getElementById('bf-desc').value.trim(),
    notes: document.getElementById('bf-notes').value.trim(),
  };

  try {
    if (App.editingBidId) {
      await updateBid(App.editingBidId, data);
      showToast('Bid updated successfully');
    } else {
      await addBid(data);
      showToast('Bid created successfully');
    }
    closeModal('modal-bid-form');
  } catch(e) {
    showToast('Error saving bid: ' + e.message, 'error');
  }
};

window.editBid = function(bidId) { window.openBidModal(bidId); };

// ─── TASK MODAL ─────────────────────────────────────────────
window.openTaskModal = function(kanbanStatus = 'todo', bidId = '') {
  App.editingTaskId = null;
  const modal = document.getElementById('modal-task-form');
  modal.querySelector('.modal-title').textContent = 'New Task';
  populateTaskForm(null, kanbanStatus, bidId);
  openModal('modal-task-form');
};

window.editTask = function(taskId) {
  App.editingTaskId = taskId;
  const task = App.tasks.find(t => t.id === taskId);
  if (!task) return;
  const modal = document.getElementById('modal-task-form');
  modal.querySelector('.modal-title').textContent = 'Edit Task';
  populateTaskForm(task);
  openModal('modal-task-form');
};

function populateTaskForm(task, kanbanStatus = 'todo', bidId = '') {
  const body = document.getElementById('task-form-body');
  body.innerHTML = `
    <div class="form-group">
      <label class="form-label">Task Title *</label>
      <input class="form-input" id="tf-title" value="${task?.title || ''}" placeholder="What needs to be done?">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Related Bid</label>
        <select class="form-select" id="tf-bid">
          <option value="">— General Task —</option>
          ${App.bids.map(b => `<option value="${b.id}" ${(task?.bidId||bidId)===b.id?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-select" id="tf-priority">
          <option value="low" ${task?.priority==='low'?'selected':''}>Low</option>
          <option value="medium" ${(!task||task?.priority==='medium')?'selected':''}>Medium</option>
          <option value="high" ${task?.priority==='high'?'selected':''}>High</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Due Date</label>
        <input class="form-input" type="date" id="tf-due" value="${task?.dueDate || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Board Status</label>
        <select class="form-select" id="tf-kanban">
          <option value="todo" ${(task?.kanbanStatus||kanbanStatus)==='todo'?'selected':''}>To Do</option>
          <option value="in-progress" ${(task?.kanbanStatus||kanbanStatus)==='in-progress'?'selected':''}>In Progress</option>
          <option value="review" ${(task?.kanbanStatus||kanbanStatus)==='review'?'selected':''}>In Review</option>
          <option value="done" ${(task?.kanbanStatus||kanbanStatus)==='done'?'selected':''}>Done</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Assigned To</label>
      <input class="form-input" id="tf-assignee" value="${task?.assignee || ''}" placeholder="Team member name">
    </div>
    <div class="form-group">
      <label class="form-label">Category</label>
      <select class="form-select" id="tf-category">
        ${['Technical Writing','Cost Estimation','Drawings','Review','Submission','Meeting','Research','Coordination','Compliance','Other'].map(c => `<option value="${c}" ${task?.category===c?'selected':''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Description / Notes</label>
      <textarea class="form-textarea" id="tf-desc">${task?.description || ''}</textarea>
    </div>
  `;
}

window.saveTask = async function() {
  const title = document.getElementById('tf-title').value.trim();
  if (!title) { showToast('Task title is required', 'error'); return; }
  const kanban = document.getElementById('tf-kanban').value;

  const data = {
    title,
    bidId: document.getElementById('tf-bid').value || null,
    priority: document.getElementById('tf-priority').value,
    dueDate: document.getElementById('tf-due').value || null,
    kanbanStatus: kanban,
    status: kanban === 'done' ? 'done' : 'pending',
    assignee: document.getElementById('tf-assignee').value.trim(),
    category: document.getElementById('tf-category').value,
    description: document.getElementById('tf-desc').value.trim(),
  };

  try {
    if (App.editingTaskId) {
      await updateTask(App.editingTaskId, data);
      showToast('Task updated');
    } else {
      await addTask(data);
      showToast('Task created');
    }
    closeModal('modal-task-form');
  } catch(e) {
    showToast('Error saving task: ' + e.message, 'error');
  }
};

window.toggleTask = async function(taskId) {
  const task = App.tasks.find(t => t.id === taskId);
  if (!task) return;
  const isDone = task.status === 'done';
  await updateTask(taskId, {
    status: isDone ? 'pending' : 'done',
    kanbanStatus: isDone ? 'todo' : 'done'
  });
};

window.deleteTaskConfirm = async function(taskId) {
  const task = App.tasks.find(t => t.id === taskId);
  if (confirm(`Delete task "${task?.title}"?`)) {
    await deleteTask(taskId);
    showToast('Task deleted');
  }
};

// ─── KANBAN DRAG & DROP ─────────────────────────────────────
window.onKanbanDragStart = function(event, taskId) {
  App.dragItem = taskId;
  event.dataTransfer.effectAllowed = 'move';
  setTimeout(() => event.target.classList.add('dragging'), 0);
};

window.onKanbanDrop = async function(event, newCol) {
  event.preventDefault();
  document.querySelectorAll('.kanban-items').forEach(el => el.classList.remove('drag-over'));
  if (!App.dragItem) return;
  await updateTask(App.dragItem, {
    kanbanStatus: newCol,
    status: newCol === 'done' ? 'done' : 'pending'
  });
  App.dragItem = null;
};

// ─── CONTACTS MODAL ─────────────────────────────────────────
window.openContactModal = function() {
  App.editingContactId = null;
  const modal = document.getElementById('modal-contact-form');
  modal.querySelector('.modal-title').textContent = 'New Contact';
  populateContactForm(null);
  openModal('modal-contact-form');
};

window.editContact = function(contactId) {
  App.editingContactId = contactId;
  const c = App.contacts.find(c => c.id === contactId);
  if (!c) return;
  const modal = document.getElementById('modal-contact-form');
  modal.querySelector('.modal-title').textContent = 'Edit Contact';
  populateContactForm(c);
  openModal('modal-contact-form');
};

function populateContactForm(c) {
  document.getElementById('contact-form-body').innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Full Name *</label>
        <input class="form-input" id="cf-name" value="${c?.name || ''}" placeholder="Name">
      </div>
      <div class="form-group">
        <label class="form-label">Role / Title</label>
        <input class="form-input" id="cf-role" value="${c?.role || ''}" placeholder="e.g. Project Director">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Company / Organization</label>
        <input class="form-input" id="cf-company" value="${c?.company || ''}" placeholder="Company name">
      </div>
      <div class="form-group">
        <label class="form-label">Department</label>
        <select class="form-select" id="cf-dept">
          ${['Client','MEP','Structure','Architecture','Sub-consultant','Government','Other'].map(d => `<option value="${d}" ${c?.department===d?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" type="email" id="cf-email" value="${c?.email || ''}" placeholder="email@example.com">
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input class="form-input" id="cf-phone" value="${c?.phone || ''}" placeholder="+1 234 567 890">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Related Bids</label>
      <input class="form-input" id="cf-bids" value="${c?.relatedBids || ''}" placeholder="Bid names (optional)">
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="cf-notes">${c?.notes || ''}</textarea>
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
    relatedBids: document.getElementById('cf-bids').value.trim(),
    notes: document.getElementById('cf-notes').value.trim(),
  };
  try {
    if (App.editingContactId) {
      await updateContact(App.editingContactId, data);
      showToast('Contact updated');
    } else {
      await addContact(data);
      showToast('Contact added');
    }
    closeModal('modal-contact-form');
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
};

window.deleteContactConfirm = async function(id) {
  if (confirm('Delete this contact?')) {
    await deleteContact(id);
    showToast('Contact deleted');
  }
};

// ─── DOCUMENT MODAL ─────────────────────────────────────────
window.openDocModal = function() {
  const modal = document.getElementById('modal-doc-form');
  modal.querySelector('#doc-form-body').innerHTML = `
    <div class="form-group">
      <label class="form-label">Document Title *</label>
      <input class="form-input" id="df-title" placeholder="Document title">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Related Bid</label>
        <select class="form-select" id="df-bid">
          <option value="">— General —</option>
          ${App.bids.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" id="df-category">
          ${['Technical Proposal','Cost Proposal','Drawings','Prequalification','Submission','Reference','Template','Contract','Other'].map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">File Name</label>
      <input class="form-input" id="df-filename" placeholder="e.g. Technical_Proposal_v2.pdf">
    </div>
    <div class="form-group">
      <label class="form-label">File URL / Link</label>
      <input class="form-input" id="df-url" placeholder="https://... (SharePoint, Drive, etc.)">
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="df-notes"></textarea>
    </div>
  `;
  openModal('modal-doc-form');
};

window.saveDocument = async function() {
  const title = document.getElementById('df-title').value.trim();
  if (!title) { showToast('Title is required', 'error'); return; }
  const data = {
    title,
    bidId: document.getElementById('df-bid').value || null,
    category: document.getElementById('df-category').value,
    fileName: document.getElementById('df-filename').value.trim(),
    url: document.getElementById('df-url').value.trim(),
    notes: document.getElementById('df-notes').value.trim(),
  };
  try {
    await addDocument(data);
    showToast('Document added');
    closeModal('modal-doc-form');
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
};

window.deleteDocConfirm = async function(id) {
  if (confirm('Remove this document?')) {
    await deleteDocument(id);
    showToast('Document removed');
  }
};

// ─── MODAL HELPERS ──────────────────────────────────────────
export function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

export function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

window.closeModal = closeModal;

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Navigation
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });

  // Hide loading
  setTimeout(() => {
    const loader = document.getElementById('loading-overlay');
    if (loader) loader.style.display = 'none';
  }, 1200);

  // Init Firebase listeners
  initListeners();

  // Start on dashboard
  navigate('dashboard');

  // Live search/filter handlers — delegated
  document.addEventListener('input', (e) => {
    const id = e.target.id;
    if (['bids-search','bids-filter'].includes(id)) renderBids();
    if (['tasks-search','tasks-bid-filter','tasks-priority-filter','tasks-status-filter'].includes(id)) renderTasks();
    if (id === 'contacts-search') renderContacts();
  });
  document.addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'bids-filter') renderBids();
    if (['tasks-bid-filter','tasks-priority-filter','tasks-status-filter'].includes(id)) renderTasks();
    if (id === 'kanban-bid-filter') renderKanban();
    if (id === 'docs-bid-filter') renderDocumentsPage();
  });

  // Current time
  function updateClock() {
    const el = document.getElementById('topbar-time');
    if (el) el.textContent = new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }
  updateClock();
  setInterval(updateClock, 1000);
});
