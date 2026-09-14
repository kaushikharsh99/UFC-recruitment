/**
 * UFC FOSS Club — Recruitment Responses Dashboard
 * Horizontal Tiles, Select/Reject Decision Engine, Detail Modal Popup & CSV Export
 */

// Application State
const state = {
  candidates: [],
  filtered: [],
  query: '',
  filterStatus: 'ALL', // 'ALL' | 'SELECTED' | 'REJECTED' | 'PENDING'
  decisions: {}, // { [candidateId]: 'selected' | 'rejected' }
  currentModalIndex: -1
};

document.addEventListener('DOMContentLoaded', () => {
  loadSavedDecisions();
  initData();
  bindEvents();
});

/**
 * Load & Save Decisions from localStorage
 */
function loadSavedDecisions() {
  try {
    const raw = localStorage.getItem('ufc_recruitment_decisions');
    if (raw) {
      state.decisions = JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to load decisions from localStorage:', e);
    state.decisions = {};
  }
}

function saveDecisions() {
  try {
    localStorage.setItem('ufc_recruitment_decisions', JSON.stringify(state.decisions));
  } catch (e) {
    console.error('Failed to save decisions to localStorage:', e);
  }
}

/**
 * Update a candidate's decision: 'selected' | 'rejected' | null
 */
function setCandidateDecision(candidateId, decision) {
  candidateId = Number(candidateId);
  const current = state.decisions[candidateId];

  if (current === decision) {
    // Toggle off back to pending
    delete state.decisions[candidateId];
    showToast('Decision cleared (Pending)');
  } else {
    state.decisions[candidateId] = decision;
    showToast(decision === 'selected' ? 'Candidate Selected ✓' : 'Candidate Rejected ✕');
  }

  saveDecisions();
  updateCounts();
  applyFilters();

  // If modal is currently viewing this candidate, update modal buttons and badge
  if (state.currentModalIndex >= 0 && state.filtered[state.currentModalIndex]) {
    const activeCandidate = state.filtered[state.currentModalIndex];
    if (activeCandidate.id === candidateId) {
      updateModalDecisionState(activeCandidate);
    }
  }
}

/**
 * Load Initial Responses
 */
function initData() {
  if (window.INITIAL_RESPONSES && Array.isArray(window.INITIAL_RESPONSES) && window.INITIAL_RESPONSES.length > 0) {
    state.candidates = window.INITIAL_RESPONSES;
    applyFilters();
    updateCounts();
  } else {
    fetch('UFC FOSS Recruitment Form (Responses) - Form responses 1.csv')
      .then(res => res.text())
      .then(csv => {
        loadCSV(csv);
      })
      .catch(() => {
        applyFilters();
        updateCounts();
      });
  }
}

/**
 * RFC-4180 Compliant CSV Parser
 */
function parseCSV(text) {
  const rows = [];
  let row = [''];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"' && inQuotes && next === '"') {
      row[row.length - 1] += '"';
      i++;
    } else if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      rows.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    rows.push(row);
  }
  return rows;
}

/**
 * Map CSV to Candidates
 */
function mapCSV(rows) {
  if (rows.length < 2) return [];
  const header = rows[0].map(h => (h || '').toLowerCase().trim());

  const map = {
    timestamp: 0,
    email: 1,
    name: 2,
    phone: 3,
    rollNo: 4,
    branch: 5,
    year: 6,
    github: 7,
    linkedin: 8,
    fossMeaning: 9,
    contributed: 10,
    contributions: 11,
    admiredTool: 12,
    domains: 13,
    techStack: 14,
    whyJoin: 15,
    otherInfo: 16
  };

  header.forEach((h, idx) => {
    if (h.includes('timestamp') || h.includes('time')) map.timestamp = idx;
    else if (h.includes('email')) map.email = idx;
    else if (h.includes('name') || idx === 2) map.name = idx;
    if (h.includes('whatsapp') || h.includes('contact') || h.includes('phone')) {
      if (!h.includes('group')) map.phone = idx;
    }
    if (h.includes('roll') || h.includes('enrollment')) map.rollNo = idx;
    if (h.includes('branch')) map.branch = idx;
    if (h.includes('year')) map.year = idx;
    if (h.includes('github') || h.includes('gitlab')) map.github = idx;
    if (h.includes('linkedin') || h.includes('portfolio')) map.linkedin = idx;
    if (h.includes('foss') || h.includes('mean to you')) map.fossMeaning = idx;
    if (h.includes('contributed to an open-source') || (h.includes('contributed') && !h.includes('which'))) map.contributed = idx;
    if (h.includes('which organizations') || h.includes('if yes')) map.contributions = idx;
    if (h.includes('which open-source software') || h.includes('if no') || h.includes('admire')) map.admiredTool = idx;
    if (h.includes('sub-team') || h.includes('domain')) map.domains = idx;
    if (h.includes('tech stack') || h.includes('tools are you')) map.techStack = idx;
    if (h.includes('why do you want to join') || h.includes('hope to achieve')) map.whyJoin = idx;
    if (h.includes('anything else')) map.otherInfo = idx;
  });

  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => !c.trim())) continue;
    const val = (idx) => (idx !== undefined && r[idx] ? r[idx].trim() : '');

    list.push({
      id: i,
      timestamp: val(map.timestamp),
      email: val(map.email),
      name: val(map.name) || `Applicant #${i}`,
      phone: val(map.phone),
      rollNo: val(map.rollNo),
      branch: val(map.branch),
      year: val(map.year),
      github: val(map.github),
      linkedin: val(map.linkedin),
      fossMeaning: val(map.fossMeaning),
      contributed: val(map.contributed),
      contributions: val(map.contributions),
      admiredTool: val(map.admiredTool),
      domains: val(map.domains),
      techStack: val(map.techStack),
      whyJoin: val(map.whyJoin),
      otherInfo: val(map.otherInfo)
    });
  }
  return list;
}

function loadCSV(csvText) {
  try {
    const rows = parseCSV(csvText);
    const parsed = mapCSV(rows);
    if (parsed.length > 0) {
      state.candidates = parsed;
      applyFilters();
      updateCounts();
      showToast(`Loaded ${parsed.length} candidate responses`);
    }
  } catch (err) {
    showToast('Failed to parse CSV file');
  }
}

/**
 * Clean and normalize URLs
 */
function cleanUrl(url) {
  if (!url) return '';
  let u = url.trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) {
    u = 'https://' + u;
  }
  return u;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function highlight(text, query) {
  if (!text) return '';
  if (!query) return escapeHtml(text);
  const esc = escapeHtml(text);
  const reg = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return esc.replace(reg, '<mark class="match">$1</mark>');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filter Candidates based on search query and status tab
 */
function applyFilters() {
  const q = state.query.toLowerCase().trim();
  const statusFilter = state.filterStatus;

  state.filtered = state.candidates.filter(c => {
    const status = state.decisions[c.id] || 'pending';

    // Status tab filter
    if (statusFilter === 'SELECTED' && status !== 'selected') return false;
    if (statusFilter === 'REJECTED' && status !== 'rejected') return false;
    if (statusFilter === 'PENDING' && status !== 'pending') return false;

    // Search query filter across all fields
    if (q) {
      const allText = [
        c.name,
        c.rollNo,
        c.branch,
        c.year,
        c.email,
        c.phone,
        c.domains,
        c.techStack,
        c.fossMeaning,
        c.contributions,
        c.admiredTool,
        c.whyJoin,
        c.otherInfo
      ].join(' ').toLowerCase();

      if (!allText.includes(q)) return false;
    }

    return true;
  });

  renderTiles();
  updateResultsLabel();
}

/**
 * Render Horizontal Tiles List
 */
function renderTiles() {
  const container = document.getElementById('cards-container');
  const emptyState = document.getElementById('empty-state');
  const q = state.query.trim();

  if (state.filtered.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  container.innerHTML = state.filtered.map((c, index) => {
    const isContributor = (c.contributed || '').toLowerCase().startsWith('yes');
    const decision = state.decisions[c.id] || 'pending';

    const cleanDigits = (c.phone || '').replace(/[^0-9]/g, '');
    const waPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;

    // Tech stack preview (compact for scannability)
    const techPreview = c.techStack ? c.techStack.replace(/[\r\n]+/g, ' ').slice(0, 95) : 'None specified';

    let tileClass = 'tile';
    if (decision === 'selected') tileClass += ' is-selected';
    if (decision === 'rejected') tileClass += ' is-rejected';

    let statusBadgeHtml = '';
    if (decision === 'selected') {
      statusBadgeHtml = `<span class="badge-status badge-selected">Selected</span>`;
    } else if (decision === 'rejected') {
      statusBadgeHtml = `<span class="badge-status badge-rejected">Rejected</span>`;
    } else {
      statusBadgeHtml = `<span class="badge-status badge-pending">Pending</span>`;
    }

    return `
      <article class="${tileClass}" data-index="${index}" data-id="${c.id}">
        <!-- Top Row: Identity & Quick Actions -->
        <div class="tile-main-row">
          <div class="tile-identity">
            <h2 class="candidate-name">${highlight(c.name, q)}</h2>
            ${statusBadgeHtml}
            ${c.branch ? `<span class="badge badge-branch">${highlight(c.branch, q)}</span>` : ''}
            ${c.year ? `<span class="badge badge-year">${highlight(c.year, q)}</span>` : ''}
            ${c.rollNo ? `<span class="badge badge-roll tag-roll" data-roll="${escapeHtml(c.rollNo)}" title="Click to copy roll number">Roll: ${highlight(c.rollNo, q)}</span>` : ''}
            <span class="badge ${isContributor ? 'badge-contrib' : 'badge-learn'}">${isContributor ? 'Open Source Contributor' : 'Eager to learn'}</span>
          </div>

          <div class="tile-actions" onclick="event.stopPropagation()">
            ${c.phone ? `<a href="https://wa.me/${waPhone}" target="_blank" rel="noopener noreferrer" class="tile-link-wa">WhatsApp ↗</a>` : ''}
            <button class="btn-tile-reject ${decision === 'rejected' ? 'active' : ''}" data-decision="rejected" data-id="${c.id}" title="Reject candidate">
              ✕ Reject
            </button>
            <button class="btn-tile-select ${decision === 'selected' ? 'active' : ''}" data-decision="selected" data-id="${c.id}" title="Select candidate">
              ✓ Select
            </button>
          </div>
        </div>

        <!-- Secondary Row: Tech Stack & View Indicator -->
        <div class="tile-sub-row">
          <div class="tile-tech-preview">
            <strong>Tech Stack:</strong> ${highlight(techPreview, q)}${c.techStack && c.techStack.length > 95 ? '…' : ''}
          </div>
          <div class="tile-view-prompt">
            View Details &amp; Answers &rarr;
          </div>
        </div>
      </article>
    `;
  }).join('');
}

/**
 * Render Question Box Helper
 */
function renderField(question, value, query, isMono = false) {
  const val = (value || '').trim();
  const content = val 
    ? highlight(val, query) 
    : '<span class="unanswered">—</span>';
  return `
    <div class="field">
      <div class="field-label">${escapeHtml(question)}</div>
      <div class="field-text ${isMono ? 'mono' : ''} ${!val ? 'is-empty' : ''}">${content}</div>
    </div>
  `;
}

/**
 * Open Candidate Details in Modal Popup Window
 */
function openCandidateModal(index) {
  if (index < 0 || index >= state.filtered.length) return;

  state.currentModalIndex = index;
  const c = state.filtered[index];
  const isContributor = (c.contributed || '').toLowerCase().startsWith('yes');
  const q = state.query.trim();

  const githubUrl = cleanUrl(c.github);
  const linkedinUrl = cleanUrl(c.linkedin);
  const cleanDigits = (c.phone || '').replace(/[^0-9]/g, '');
  const waPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;

  // Header Elements
  document.getElementById('modal-name').textContent = c.name;
  document.getElementById('modal-counter').textContent = `${index + 1} / ${state.filtered.length}`;

  const tagsEl = document.getElementById('modal-tags');
  tagsEl.innerHTML = `
    ${c.branch ? `<span class="badge badge-branch">${escapeHtml(c.branch)}</span>` : ''}
    ${c.year ? `<span class="badge badge-year">${escapeHtml(c.year)}</span>` : ''}
    ${c.rollNo ? `<span class="badge badge-roll tag-roll" data-roll="${escapeHtml(c.rollNo)}" title="Click to copy">Roll: ${escapeHtml(c.rollNo)}</span>` : ''}
    <span class="badge ${isContributor ? 'badge-contrib' : 'badge-learn'}">${isContributor ? 'Open Source Contributor' : 'Eager to learn'}</span>
    ${c.timestamp ? `<span class="mono" style="font-size: 0.7rem; color: var(--ink-faint); margin-left: 0.4rem;">${escapeHtml(c.timestamp)}</span>` : ''}
  `;

  // Update Status Badge and Buttons
  updateModalDecisionState(c);

  // Quick Links
  const linksEl = document.getElementById('modal-links');
  linksEl.innerHTML = `
    ${c.phone ? `<a href="https://wa.me/${waPhone}" target="_blank" rel="noopener noreferrer" class="link-wa">WhatsApp (${escapeHtml(c.phone)}) ↗</a>` : '<span class="unanswered">No Phone</span>'}
    ${c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : '<span class="unanswered">No Email</span>'}
    ${githubUrl ? `<a href="${githubUrl}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>` : '<span class="unanswered">No GitHub</span>'}
    ${linkedinUrl ? `<a href="${linkedinUrl}" target="_blank" rel="noopener noreferrer">Portfolio ↗</a>` : '<span class="unanswered">No Portfolio</span>'}
  `;

  // All 8 Actual Questions
  const fieldsEl = document.getElementById('modal-fields');
  fieldsEl.innerHTML = `
    ${renderField('Have you ever contributed to an open-source project?', c.contributed, q)}
    ${renderField('Which sub-teams/domains are you most interested in joining?', c.domains, q)}
    ${renderField('What tech stack or tools are you familiar with?', c.techStack, q, true)}
    ${renderField('If YES: Which organizations/repositories have you contributed to?', c.contributions, q)}
    ${renderField('If NO: Which open-source software, library, or tool do you admire the most, and why?', c.admiredTool, q)}
    ${renderField('What does Open Source (FOSS) mean to you, and what are your thoughts on its culture?', c.fossMeaning, q)}
    ${renderField('Why do you want to join UFC FOSS, and what do you hope to achieve here?', c.whyJoin, q)}
    ${renderField("Anything else you'd like to share with us?", c.otherInfo, q)}
  `;

  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) {
    backdrop.classList.remove('hidden');
    if (typeof backdrop.focus === 'function') backdrop.focus();
  }
}

/**
 * Update decision state in modal
 */
function updateModalDecisionState(candidate) {
  const decision = state.decisions[candidate.id] || 'pending';
  const badgeEl = document.getElementById('modal-status-badge');
  const rejectBtn = document.getElementById('modal-reject-btn');
  const selectBtn = document.getElementById('modal-select-btn');

  // Badge
  badgeEl.className = 'badge-status';
  if (decision === 'selected') {
    badgeEl.classList.add('badge-selected');
    badgeEl.textContent = 'Selected';
  } else if (decision === 'rejected') {
    badgeEl.classList.add('badge-rejected');
    badgeEl.textContent = 'Rejected';
  } else {
    badgeEl.classList.add('badge-pending');
    badgeEl.textContent = 'Pending';
  }

  // Buttons active states
  rejectBtn.classList.toggle('active', decision === 'rejected');
  selectBtn.classList.toggle('active', decision === 'selected');
}

/**
 * Close Modal
 */
function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  state.currentModalIndex = -1;
}

/**
 * Update UI counts and tabs tallies
 */
function updateCounts() {
  const total = state.candidates.length;
  let selected = 0;
  let rejected = 0;

  state.candidates.forEach(c => {
    const status = state.decisions[c.id];
    if (status === 'selected') selected++;
    else if (status === 'rejected') rejected++;
  });

  const pending = total - selected - rejected;

  document.getElementById('count-all').textContent = total;
  document.getElementById('count-selected').textContent = selected;
  document.getElementById('count-rejected').textContent = rejected;
  document.getElementById('count-pending').textContent = pending;
  document.getElementById('export-count').textContent = selected;
}

function updateResultsLabel() {
  const countEl = document.getElementById('results-count');
  const count = state.filtered.length;
  const total = state.candidates.length;

  let filterLabel = '';
  if (state.filterStatus === 'SELECTED') filterLabel = 'selected ';
  else if (state.filterStatus === 'REJECTED') filterLabel = 'rejected ';
  else if (state.filterStatus === 'PENDING') filterLabel = 'pending ';

  if (state.query.trim()) {
    countEl.textContent = `Found ${count} ${filterLabel}candidates matching "${state.query.trim()}"`;
  } else {
    countEl.textContent = `Showing ${count} of ${total} ${filterLabel}candidates`;
  }
}

/**
 * Export Selected Candidates to CSV
 */
function exportSelectedToCSV() {
  const selectedCandidates = state.candidates.filter(c => state.decisions[c.id] === 'selected');

  if (selectedCandidates.length === 0) {
    showToast('No candidates are marked as Selected yet.');
    return;
  }

  const headers = [
    'Name',
    'Roll Number',
    'Branch',
    'Year',
    'WhatsApp / Contact',
    'Email',
    'GitHub URL',
    'LinkedIn URL',
    'Sub-teams Interested',
    'Tech Stack',
    'Prior FOSS Contribution',
    'Contributions',
    'Admired FOSS Tool',
    'Why Join UFC FOSS',
    'Submission Timestamp'
  ];

  const escapeCSV = (field) => {
    if (field === null || field === undefined) return '""';
    const str = String(field).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvRows = [headers.map(escapeCSV).join(',')];

  selectedCandidates.forEach(c => {
    const row = [
      c.name,
      c.rollNo,
      c.branch,
      c.year,
      c.phone,
      c.email,
      c.github,
      c.linkedin,
      c.domains,
      c.techStack,
      c.contributed,
      c.contributions,
      c.admiredTool,
      c.whyJoin,
      c.timestamp
    ];
    csvRows.push(row.map(escapeCSV).join(','));
  });

  const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `ufc_foss_selected_candidates_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(`Exported ${selectedCandidates.length} selected candidates!`);
}

/**
 * Toast Helper
 */
let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2200);
}

/**
 * Event Bindings
 */
function bindEvents() {
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('clear-search');
  const fileInput = document.getElementById('csv-file-input');
  const container = document.getElementById('cards-container');
  const exportBtn = document.getElementById('export-selected-btn');

  // Search input
  searchInput.addEventListener('input', (e) => {
    state.query = e.target.value;
    if (state.query) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
    applyFilters();
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.query = '';
    clearBtn.classList.add('hidden');
    searchInput.focus();
    applyFilters();
  });

  // Filter Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filterStatus = btn.getAttribute('data-tab');
      applyFilters();
    });
  });

  // Export Selected
  exportBtn.addEventListener('click', exportSelectedToCSV);

  // Tiles clicks: Select/Reject actions or Open Modal
  container.addEventListener('click', (e) => {
    // Quick Select / Reject Buttons on Tile
    const selectBtn = e.target.closest('.btn-tile-select');
    if (selectBtn) {
      const id = selectBtn.getAttribute('data-id');
      setCandidateDecision(id, 'selected');
      return;
    }

    const rejectBtn = e.target.closest('.btn-tile-reject');
    if (rejectBtn) {
      const id = rejectBtn.getAttribute('data-id');
      setCandidateDecision(id, 'rejected');
      return;
    }

    // Roll number copy
    const rollBadge = e.target.closest('.tag-roll');
    if (rollBadge) {
      e.stopPropagation();
      const roll = rollBadge.getAttribute('data-roll');
      if (roll) {
        navigator.clipboard.writeText(roll).then(() => {
          showToast(`Copied Roll: #${roll}`);
        });
      }
      return;
    }

    // Clicking anywhere on Tile opens the modal
    const tile = e.target.closest('.tile');
    if (tile && !e.target.closest('a')) {
      const index = parseInt(tile.getAttribute('data-index'), 10);
      openCandidateModal(index);
    }
  });

  // Modal Controls
  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalCloseBtn = document.getElementById('modal-close');
  const modalPrevBtn = document.getElementById('modal-prev-btn');
  const modalNextBtn = document.getElementById('modal-next-btn');
  const modalSelectBtn = document.getElementById('modal-select-btn');
  const modalRejectBtn = document.getElementById('modal-reject-btn');

  modalCloseBtn.addEventListener('click', closeModal);

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      closeModal();
    }
  });

  modalPrevBtn.addEventListener('click', () => {
    if (state.currentModalIndex > 0) {
      openCandidateModal(state.currentModalIndex - 1);
    }
  });

  modalNextBtn.addEventListener('click', () => {
    if (state.currentModalIndex < state.filtered.length - 1) {
      openCandidateModal(state.currentModalIndex + 1);
    }
  });

  modalSelectBtn.addEventListener('click', () => {
    if (state.currentModalIndex >= 0 && state.filtered[state.currentModalIndex]) {
      const c = state.filtered[state.currentModalIndex];
      setCandidateDecision(c.id, 'selected');
    }
  });

  modalRejectBtn.addEventListener('click', () => {
    if (state.currentModalIndex >= 0 && state.filtered[state.currentModalIndex]) {
      const c = state.filtered[state.currentModalIndex];
      setCandidateDecision(c.id, 'rejected');
    }
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    const isModalOpen = !modalBackdrop.classList.contains('hidden');

    if (isModalOpen) {
      if (e.key === 'Escape') {
        closeModal();
      } else if (e.key === 'ArrowLeft') {
        if (state.currentModalIndex > 0) {
          openCandidateModal(state.currentModalIndex - 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (state.currentModalIndex < state.filtered.length - 1) {
          openCandidateModal(state.currentModalIndex + 1);
        }
      }
    } else {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      } else if (e.key === 'Escape' && searchInput.value) {
        searchInput.value = '';
        state.query = '';
        clearBtn.classList.add('hidden');
        applyFilters();
      }
    }
  });

  // File import
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        loadCSV(evt.target.result);
      };
      reader.readAsText(file, 'utf-8');
    }
  });

  // Drag and drop CSV anywhere on page
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        loadCSV(evt.target.result);
      };
      reader.readAsText(file, 'utf-8');
    }
  });
}
