/**
 * UFC FOSS Club — Minimal Candidate Responses Viewer
 * Pure Vanilla JS, Zero Dependencies, Zero Gradients
 */

// Application State
const state = {
  candidates: [],
  filtered: [],
  query: ''
};

document.addEventListener('DOMContentLoaded', () => {
  initData();
  bindEvents();
});

/**
 * Load Initial Responses
 */
function initData() {
  if (window.INITIAL_RESPONSES && Array.isArray(window.INITIAL_RESPONSES) && window.INITIAL_RESPONSES.length > 0) {
    state.candidates = window.INITIAL_RESPONSES;
    state.filtered = [...state.candidates];
    render();
    updateCount();
  } else {
    // Attempt local fetch if hosted
    fetch('UFC FOSS Recruitment Form (Responses) - Form responses 1.csv')
      .then(res => res.text())
      .then(csv => {
        loadCSV(csv);
      })
      .catch(() => {
        render();
        updateCount();
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
      filter();
      showToast(`Loaded ${parsed.length} candidate responses`);
    }
  } catch (err) {
    showToast('Failed to parse CSV file');
  }
}

/**
 * Normalize URLs
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

/**
 * HTML Escaping & Search Highlighting
 */
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
 * Filter Candidates based on Search Query
 */
function filter() {
  const q = state.query.toLowerCase().trim();

  if (!q) {
    state.filtered = [...state.candidates];
  } else {
    state.filtered = state.candidates.filter(c => {
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

      return allText.includes(q);
    });
  }

  render();
  updateCount();
}

/**
 * Render Candidate Cards & Actual Responses
 */
function render() {
  const container = document.getElementById('cards-container');
  const emptyState = document.getElementById('empty-state');
  const q = state.query.trim();

  if (state.filtered.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  container.innerHTML = state.filtered.map(c => {
    const isContributor = (c.contributed || '').toLowerCase().startsWith('yes');
    const githubUrl = cleanUrl(c.github);
    const linkedinUrl = cleanUrl(c.linkedin);

    const cleanDigits = (c.phone || '').replace(/[^0-9]/g, '');
    const waPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;

    return `
      <article class="entry">
        <div class="entry-head">
          <h2 class="name">${highlight(c.name, q)}</h2>
          ${c.timestamp ? `<span class="time">${escapeHtml(c.timestamp)}</span>` : ''}
        </div>

        <div class="tags">
          ${c.branch ? `<span class="tag-badge tag-branch">${highlight(c.branch, q)}</span>` : ''}
          ${c.year ? `<span class="tag-badge tag-year">${highlight(c.year, q)}</span>` : ''}
          ${c.rollNo ? `<span class="tag-badge tag-roll" data-roll="${escapeHtml(c.rollNo)}" title="Click to copy roll number">Roll: ${highlight(c.rollNo, q)}</span>` : ''}
          <span class="tag-badge ${isContributor ? 'tag-contrib' : 'tag-learn'}">${isContributor ? 'Contributor' : 'Eager to learn'}</span>
        </div>

        <div class="links">
          ${c.phone ? `<a href="https://wa.me/${waPhone}" target="_blank" rel="noopener noreferrer" class="link-wa">WhatsApp: ${highlight(c.phone, q)} ↗</a>` : ''}
          ${c.email ? `<a href="mailto:${escapeHtml(c.email)}">${highlight(c.email, q)}</a>` : ''}
          ${githubUrl ? `<a href="${githubUrl}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>` : ''}
          ${linkedinUrl ? `<a href="${linkedinUrl}" target="_blank" rel="noopener noreferrer">Portfolio ↗</a>` : ''}
        </div>

        <div class="fields">
          ${c.domains ? `
            <div class="field">
              <div class="field-label">Sub-teams interested in</div>
              <div class="field-text">${highlight(c.domains, q)}</div>
            </div>
          ` : ''}

          ${c.techStack ? `
            <div class="field">
              <div class="field-label">Tech stack</div>
              <div class="field-text mono">${highlight(c.techStack, q)}</div>
            </div>
          ` : ''}

          ${isContributor && c.contributions ? `
            <div class="field">
              <div class="field-label">Open source contributions</div>
              <div class="field-text">${highlight(c.contributions, q)}</div>
            </div>
          ` : ''}

          ${!isContributor && c.admiredTool ? `
            <div class="field">
              <div class="field-label">Admired open source tool</div>
              <div class="field-text">${highlight(c.admiredTool, q)}</div>
            </div>
          ` : ''}

          ${c.fossMeaning ? `
            <div class="field">
              <div class="field-label">What FOSS means to them</div>
              <div class="field-text">${highlight(c.fossMeaning, q)}</div>
            </div>
          ` : ''}

          ${c.whyJoin ? `
            <div class="field">
              <div class="field-label">Why join UFC FOSS</div>
              <div class="field-text">${highlight(c.whyJoin, q)}</div>
            </div>
          ` : ''}

          ${c.otherInfo ? `
            <div class="field">
              <div class="field-label">Anything else</div>
              <div class="field-text">${highlight(c.otherInfo, q)}</div>
            </div>
          ` : ''}
        </div>
      </article>
    `;
  }).join('');
}

/**
 * Update Results Count
 */
function updateCount() {
  const countEl = document.getElementById('results-count');
  const badgeEl = document.getElementById('count-badge');
  const total = state.candidates.length;
  const count = state.filtered.length;

  badgeEl.textContent = `${total}`;

  if (state.query.trim()) {
    countEl.textContent = `${count} of ${total} match "${state.query.trim()}"`;
  } else {
    countEl.textContent = `Showing all ${count} candidates`;
  }
}

/**
 * Toast helper
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

  // Live search as user types
  searchInput.addEventListener('input', (e) => {
    state.query = e.target.value;
    if (state.query) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
    filter();
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.query = '';
    clearBtn.classList.add('hidden');
    searchInput.focus();
    filter();
  });

  // Roll number click to copy
  container.addEventListener('click', (e) => {
    const rollBadge = e.target.closest('.tag-roll');
    if (rollBadge) {
      const roll = rollBadge.getAttribute('data-roll');
      if (roll) {
        navigator.clipboard.writeText(roll).then(() => {
          showToast(`Copied #${roll}`);
        });
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
