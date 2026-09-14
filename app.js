/**
 * UFC FOSS Club — Recruitment Responses Dashboard
 * Real-Time Multi-Device Cloud Sync via Firebase Firestore + Offline Local Fallback
 * Live Google Sheet / Form Response Importer + Light/Dark Theme Switcher
 * Horizontal Tiles, Select/Reject Decision Engine, Detail Modal Popup, Interviewer Notes & CSV Export
 */

// Firebase Configuration (Project: ufc-recruitment-2026, Region: asia-south1)
const firebaseConfig = {
  apiKey: "AIzaSyAjV2EkLn-qp3WW_gTUj_cFR8Eqc8h7SIY",
  authDomain: "ufc-recruitment-2026.firebaseapp.com",
  projectId: "ufc-recruitment-2026",
  storageBucket: "ufc-recruitment-2026.firebasestorage.app",
  messagingSenderId: "650383969929",
  appId: "1:650383969929:web:fd74fe5a733061978d8058"
};

let db = null;

// Application State
const state = {
  candidates: [], // Combined candidate list displayed in UI
  excelCandidates: [], // Loaded from Google Sheet / CSV / initial data
  walkinCandidates: [], // Synced live from Firebase Cloud Firestore & local backup
  filtered: [],
  query: '',
  filterStatus: 'ALL', // 'ALL' | 'SELECTED' | 'REJECTED' | 'PENDING'
  decisions: {}, // { [key]: 'selected' | 'rejected' }
  reviewers: {}, // { [key]: reviewerName }
  notes: {}, // { [key]: candidateNote }
  noteAuthors: {}, // { [key]: noteAuthorName }
  reviewerName: 'Reviewer',
  sheetUrl: '',
  currentModalIndex: -1
};

/**
 * Merge Walk-in candidates and Excel/Google Sheet candidates into unified list
 * Walk-in candidates take top priority and appear at the top
 */
function mergeCandidates() {
  const map = new Map();

  // 1. Walk-in candidates
  state.walkinCandidates.forEach(c => {
    const key = c.rollNo ? c.rollNo.toString().trim().toLowerCase() : String(c.id);
    if (key && !map.has(key)) {
      map.set(key, c);
    }
  });

  // 2. Google Sheet / Excel candidates
  state.excelCandidates.forEach(c => {
    const key = c.rollNo ? c.rollNo.toString().trim().toLowerCase() : String(c.id);
    if (key && !map.has(key)) {
      map.set(key, c);
    }
  });

  state.candidates = Array.from(map.values());
  applyFilters();
  updateCounts();
}

document.addEventListener('DOMContentLoaded', () => {
  loadLocalState();
  initSecurityGate();
  initData();
  bindEvents();
  initFirebase();
});

/**
 * --------------------------------------------------------------------------
 * Coordinator Security Gate (Passcode protection for recruitment portal)
 * --------------------------------------------------------------------------
 */
function initSecurityGate() {
  const overlay = document.getElementById('portal-lock-overlay');
  const form = document.getElementById('portal-lock-form');
  const input = document.getElementById('portal-passcode-input');
  const errorEl = document.getElementById('portal-lock-error');
  const lockBtn = document.getElementById('portal-lock-btn');

  if (!overlay) return;

  const isUnlocked = sessionStorage.getItem('ufc_portal_unlocked') === 'true';
  if (!isUnlocked) {
    overlay.classList.remove('hidden');
    if (input) setTimeout(() => input.focus(), 150);
  } else {
    overlay.classList.add('hidden');
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = input ? input.value.trim() : '';
      if (!code) return;

      if (errorEl) errorEl.classList.add('hidden');

      const unlockBtn = document.getElementById('portal-unlock-btn');
      if (unlockBtn) {
        unlockBtn.disabled = true;
        unlockBtn.textContent = 'Verifying…';
      }

      let authenticated = false;

      // 1. Try server verification against .env PORTAL_PASSWORD
      try {
        const res = await fetch('/api/verify-portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode: code })
        });
        const data = await res.json();
        if (res.ok && data.valid) {
          authenticated = true;
        } else if (res.status === 403) {
          authenticated = false;
        }
      } catch (err) {
        // Fallback for standalone/static usage without server.js
        if (code === 'UFC_RECRUIT_2026' || code === 'UFC_WALKIN_2026') {
          authenticated = true;
        }
      }

      if (unlockBtn) {
        unlockBtn.disabled = false;
        unlockBtn.textContent = 'Unlock Recruitment Portal →';
      }

      if (authenticated) {
        sessionStorage.setItem('ufc_portal_unlocked', 'true');
        overlay.classList.add('hidden');
        showToast('Access granted! Welcome to UFC Recruitment Portal.');
        if (input) input.value = '';
      } else {
        if (errorEl) {
          errorEl.textContent = 'Incorrect passcode. Please check your .env file or ask lead coordinator.';
          errorEl.classList.remove('hidden');
        }
        if (input) {
          input.focus();
          input.select();
        }
      }
    });
  }

  if (lockBtn) {
    lockBtn.addEventListener('click', () => {
      sessionStorage.removeItem('ufc_portal_unlocked');
      overlay.classList.remove('hidden');
      if (input) {
        input.value = '';
        input.focus();
      }
      showToast('Dashboard locked 🔒');
    });
  }
}

/**
 * --------------------------------------------------------------------------
 * Firebase & Cloud Sync Management
 * --------------------------------------------------------------------------
 */
function initFirebase() {
  try {
    if (typeof firebase !== 'undefined') {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.firestore();

      // Enable offline multi-tab persistence
      db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
        console.warn('Firestore persistence notice:', err.code);
      });

      initFirestoreSync();
    } else {
      updateSyncIndicator('offline', 'Offline (Local Only)');
    }
  } catch (err) {
    console.error('Firebase initialization error:', err);
    updateSyncIndicator('offline', 'Offline (Local Only)');
  }
}

function initFirestoreSync() {
  if (!db) return;
  updateSyncIndicator('syncing', 'Connecting…');

  db.collection('decisions').onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const key = change.doc.id;
      const data = change.doc.data();

      if (change.type === 'removed') {
        delete state.decisions[key];
        delete state.reviewers[key];
        delete state.notes[key];
        delete state.noteAuthors[key];
      } else if (data) {
        if (data.decision !== undefined) {
          state.decisions[key] = data.decision;
          if (data.candidateId) state.decisions[data.candidateId] = data.decision;
        }
        if (data.reviewer) {
          state.reviewers[key] = data.reviewer;
          if (data.candidateId) state.reviewers[data.candidateId] = data.reviewer;
        }
        if (data.note !== undefined) {
          state.notes[key] = data.note;
          if (data.candidateId) state.notes[data.candidateId] = data.note;
        }
        if (data.noteAuthor) {
          state.noteAuthors[key] = data.noteAuthor;
          if (data.candidateId) state.noteAuthors[data.candidateId] = data.noteAuthor;
        }
      }
    });

    // Mirror to local cache for instant zero-latency loading on reload
    saveLocalState();
    updateCounts();
    applyFilters();

    // If modal is open, refresh its decision status badge and notes (if not actively editing)
    if (state.currentModalIndex >= 0 && state.filtered[state.currentModalIndex]) {
      const active = state.filtered[state.currentModalIndex];
      updateModalDecisionState(active);

      const noteInput = document.getElementById('modal-note-input');
      const noteAuthorEl = document.getElementById('modal-note-author');
      if (noteInput && document.activeElement !== noteInput) {
        noteInput.value = getCandidateNote(active);
        const author = getCandidateNoteAuthor(active);
        if (noteAuthorEl) noteAuthorEl.textContent = author && noteInput.value.trim() ? `(by ${author})` : '';
      }
    }

    updateSyncIndicator('synced', 'Live Cloud Sync');
  }, (error) => {
    console.error('Firestore listener error:', error);
    updateSyncIndicator('error', 'Cloud Disconnected');
  });

  // Real-time listener for Walk-in applicants registered via /register
  db.collection('walkin_responses').onSnapshot((snapshot) => {
    const list = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!data) return;
      list.push({
        id: doc.id,
        timestamp: data.timestamp || '',
        email: data.email || '',
        name: data.name || 'Walk-in Applicant',
        phone: data.phone || '',
        rollNo: data.rollNo || '',
        branch: data.branch || '',
        year: data.year || '',
        github: data.github || '',
        linkedin: data.linkedin || '',
        fossMeaning: data.fossMeaning || '',
        contributed: data.contributed || '',
        contributions: data.contributions || '',
        admiredTool: data.admiredTool || '',
        domains: data.domains || '',
        techStack: data.techStack || '',
        whyJoin: data.whyJoin || '',
        otherInfo: data.otherInfo || '',
        isWalkin: true
      });
    });

    // Notify for any new submissions that arrive during active session
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const d = change.doc.data();
        if (d && d.name && state.walkinCandidates.length > 0) {
          showToast(`🔔 New Walk-in: ${d.name} (${d.branch || 'Registered'})`);
        }
      }
    });

    state.walkinCandidates = list;
    mergeCandidates();
  }, (err) => {
    console.warn('Walk-in listener notice:', err);
  });
}

function updateSyncIndicator(status, text) {
  const badge = document.getElementById('sync-status-badge');
  const label = document.getElementById('sync-status-text');
  if (!badge || !label) return;

  badge.className = `sync-status-badge ${status}`;
  label.textContent = text;
}

/**
 * --------------------------------------------------------------------------
 * Local State Cache (Instant load on browser restart)
 * --------------------------------------------------------------------------
 */
function loadLocalState() {
  try {
    const rawDecisions = localStorage.getItem('ufc_recruitment_decisions');
    if (rawDecisions) state.decisions = JSON.parse(rawDecisions);

    const rawReviewers = localStorage.getItem('ufc_recruitment_reviewers');
    if (rawReviewers) state.reviewers = JSON.parse(rawReviewers);

    const rawNotes = localStorage.getItem('ufc_recruitment_notes');
    if (rawNotes) state.notes = JSON.parse(rawNotes);

    const rawNoteAuthors = localStorage.getItem('ufc_recruitment_note_authors');
    if (rawNoteAuthors) state.noteAuthors = JSON.parse(rawNoteAuthors);

    const savedTab = localStorage.getItem('ufc_recruitment_tab');
    if (savedTab && ['ALL', 'SELECTED', 'REJECTED', 'PENDING'].includes(savedTab)) {
      state.filterStatus = savedTab;
    }
    const savedReviewer = localStorage.getItem('ufc_reviewer_name');
    if (savedReviewer && savedReviewer.trim()) {
      state.reviewerName = savedReviewer.trim();
    }
    const savedSheetUrl = localStorage.getItem('ufc_sheet_url');
    if (savedSheetUrl) {
      state.sheetUrl = savedSheetUrl;
    }
  } catch (e) {
    console.error('Error loading localStorage cache:', e);
  }
}

function saveLocalState() {
  try {
    localStorage.setItem('ufc_recruitment_decisions', JSON.stringify(state.decisions));
    localStorage.setItem('ufc_recruitment_reviewers', JSON.stringify(state.reviewers));
    localStorage.setItem('ufc_recruitment_notes', JSON.stringify(state.notes));
    localStorage.setItem('ufc_recruitment_note_authors', JSON.stringify(state.noteAuthors));
    localStorage.setItem('ufc_recruitment_tab', state.filterStatus);
    localStorage.setItem('ufc_reviewer_name', state.reviewerName);
    localStorage.setItem('ufc_sheet_url', state.sheetUrl);
  } catch (e) {
    console.error('Error saving localStorage cache:', e);
  }
}

/**
 * --------------------------------------------------------------------------
 * Candidate Key, Decision & Notes Resolvers
 * --------------------------------------------------------------------------
 */
function getCandidateKey(c) {
  if (!c) return null;
  if (c.rollNo && c.rollNo.trim()) {
    const clean = c.rollNo.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `roll_${clean}`;
  }
  if (c.email && c.email.trim()) {
    const cleanEmail = c.email.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `email_${cleanEmail}`;
  }
  return `id_${c.id}`;
}

function getCandidateDecision(c) {
  if (!c) return 'pending';
  const key = getCandidateKey(c);
  if (key && state.decisions[key]) return state.decisions[key];
  if (c.rollNo) {
    const rollKey = `roll_${c.rollNo.toString().trim().toLowerCase()}`;
    if (state.decisions[rollKey]) return state.decisions[rollKey];
  }
  if (state.decisions[c.id]) return state.decisions[c.id];
  if (state.decisions[String(c.id)]) return state.decisions[String(c.id)];
  return 'pending';
}

function getCandidateReviewer(c) {
  if (!c) return '';
  const key = getCandidateKey(c);
  if (key && state.reviewers[key]) return state.reviewers[key];
  if (c.rollNo) {
    const rollKey = `roll_${c.rollNo.toString().trim().toLowerCase()}`;
    if (state.reviewers[rollKey]) return state.reviewers[rollKey];
  }
  if (state.reviewers[c.id]) return state.reviewers[c.id];
  if (state.reviewers[String(c.id)]) return state.reviewers[String(c.id)];
  return '';
}

function getCandidateNote(c) {
  if (!c) return '';
  const key = getCandidateKey(c);
  if (key && state.notes[key] !== undefined) return state.notes[key];
  if (c.rollNo) {
    const rollKey = `roll_${c.rollNo.toString().trim().toLowerCase()}`;
    if (state.notes[rollKey] !== undefined) return state.notes[rollKey];
  }
  if (state.notes[c.id] !== undefined) return state.notes[c.id];
  if (state.notes[String(c.id)] !== undefined) return state.notes[String(c.id)];
  return '';
}

function getCandidateNoteAuthor(c) {
  if (!c) return '';
  const key = getCandidateKey(c);
  if (key && state.noteAuthors[key]) return state.noteAuthors[key];
  if (c.rollNo) {
    const rollKey = `roll_${c.rollNo.toString().trim().toLowerCase()}`;
    if (state.noteAuthors[rollKey]) return state.noteAuthors[rollKey];
  }
  if (state.noteAuthors[c.id]) return state.noteAuthors[c.id];
  if (state.noteAuthors[String(c.id)]) return state.noteAuthors[String(c.id)];
  return '';
}

/**
 * Update candidate decision: 'selected' | 'rejected' | toggle to pending
 * Synchronizes to Cloud Firestore and mirrors to local cache
 */
async function setCandidateDecision(candidateId, decision) {
  candidateId = Number(candidateId);
  const c = state.candidates.find(item => Number(item.id) === candidateId) || state.filtered.find(item => Number(item.id) === candidateId);
  if (!c) return;

  const key = getCandidateKey(c);
  const current = getCandidateDecision(c);
  const reviewer = (state.reviewerName || 'Reviewer').trim();

  if (current === decision) {
    // Toggle off back to pending
    delete state.decisions[key];
    delete state.decisions[candidateId];
    delete state.decisions[String(candidateId)];
    delete state.reviewers[key];
    delete state.reviewers[candidateId];

    showToast('Decision cleared (Pending)');
    saveLocalState();
    updateCounts();
    applyFilters();

    if (db) {
      updateSyncIndicator('syncing', 'Syncing…');
      db.collection('decisions').doc(key).set({
        decision: 'pending',
        reviewer: '',
        candidateId: candidateId,
        name: c.name || '',
        rollNo: c.rollNo || '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true })
        .then(() => updateSyncIndicator('synced', 'Live Cloud Sync'))
        .catch(err => {
          console.error('Firestore decision update error:', err);
          updateSyncIndicator('error', 'Cloud sync error');
        });
    }
  } else {
    state.decisions[key] = decision;
    state.decisions[candidateId] = decision;
    state.reviewers[key] = reviewer;
    state.reviewers[candidateId] = reviewer;

    showToast(decision === 'selected' ? `Selected by ${reviewer} ✓` : `Rejected by ${reviewer} ✕`);
    saveLocalState();
    updateCounts();
    applyFilters();

    if (db) {
      updateSyncIndicator('syncing', 'Syncing…');
      db.collection('decisions').doc(key).set({
        decision: decision,
        reviewer: reviewer,
        candidateId: candidateId,
        name: c.name || '',
        rollNo: c.rollNo || '',
        branch: c.branch || '',
        year: c.year || '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true })
        .then(() => updateSyncIndicator('synced', 'Live Cloud Sync'))
        .catch(err => {
          console.error('Firestore save error:', err);
          updateSyncIndicator('error', 'Cloud sync error');
        });
    }
  }

  // If modal is currently viewing this candidate, update its UI
  if (state.currentModalIndex >= 0 && state.filtered[state.currentModalIndex]) {
    const active = state.filtered[state.currentModalIndex];
    if (Number(active.id) === candidateId) {
      updateModalDecisionState(active);
    }
  }
}

/**
 * --------------------------------------------------------------------------
 * Feedback & Notes Auto-Save Handler
 * --------------------------------------------------------------------------
 */
let noteDebounceTimer = null;

function handleNoteInput(candidateId, noteText) {
  const statusEl = document.getElementById('modal-note-status');
  if (statusEl) {
    statusEl.className = 'note-save-status saving';
    statusEl.textContent = 'Saving…';
  }

  clearTimeout(noteDebounceTimer);
  noteDebounceTimer = setTimeout(() => {
    saveCandidateNote(candidateId, noteText);
  }, 400);
}

async function saveCandidateNote(candidateId, noteText) {
  clearTimeout(noteDebounceTimer);
  candidateId = Number(candidateId);
  const c = state.candidates.find(item => Number(item.id) === candidateId) || state.filtered.find(item => Number(item.id) === candidateId);
  if (!c) return;

  const key = getCandidateKey(c);
  const reviewer = (state.reviewerName || 'Reviewer').trim();

  state.notes[key] = noteText;
  state.notes[candidateId] = noteText;
  if (noteText.trim()) {
    state.noteAuthors[key] = reviewer;
    state.noteAuthors[candidateId] = reviewer;
  }

  saveLocalState();
  applyFilters(); // Updates note preview on candidate tile

  const statusEl = document.getElementById('modal-note-status');
  const authorEl = document.getElementById('modal-note-author');
  if (statusEl) {
    statusEl.className = 'note-save-status saved';
    statusEl.textContent = 'Saved ✓';
  }
  if (authorEl) {
    authorEl.textContent = noteText.trim() ? `(by ${reviewer})` : '';
  }

  if (db) {
    updateSyncIndicator('syncing', 'Syncing note…');
    db.collection('decisions').doc(key).set({
      note: noteText,
      noteAuthor: noteText.trim() ? reviewer : '',
      candidateId: candidateId,
      name: c.name || '',
      rollNo: c.rollNo || '',
      branch: c.branch || '',
      year: c.year || '',
      noteUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true })
      .then(() => updateSyncIndicator('synced', 'Live Cloud Sync'))
      .catch(err => {
        console.error('Firestore note save error:', err);
        updateSyncIndicator('error', 'Cloud sync error');
        if (statusEl) {
          statusEl.className = 'note-save-status';
          statusEl.textContent = 'Offline (cached)';
        }
      });
  }
}

/**
 * --------------------------------------------------------------------------
 * Google Sheets / Forms Live Synchronization
 * --------------------------------------------------------------------------
 */
function getGoogleSheetCSVUrl(url) {
  if (!url) return '';
  url = url.trim();
  if (url.includes('pub?output=csv') || url.includes('/pub?output=csv') || url.endsWith('.csv')) {
    return url;
  }
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
  }
  return url;
}

async function syncGoogleSheetResponses(forceModal = false) {
  if (forceModal || !state.sheetUrl) {
    openSheetModal();
    return;
  }

  const csvUrl = getGoogleSheetCSVUrl(state.sheetUrl);
  showToast('↻ Connecting to live Google Sheet responses…');

  const syncBtn = document.getElementById('sync-sheet-btn');
  if (syncBtn) syncBtn.textContent = '↻ Syncing…';

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Check that the sheet is shared or published`);
    }
    const csvText = await res.text();
    const rows = parseCSV(csvText);
    const parsed = mapCSV(rows);

    if (parsed.length > 0) {
      const oldCount = state.excelCandidates.length;
      state.excelCandidates = parsed;
      mergeCandidates();

      const newCount = Math.max(0, parsed.length - oldCount);
      showToast(newCount > 0 
        ? `Synced ${parsed.length} responses (${newCount} new candidates)! ✓` 
        : `Synced! All ${parsed.length} responses are up to date ✓`
      );
    } else {
      showToast('No candidate entries found in sheet');
    }
  } catch (err) {
    console.error('Google Sheet sync error:', err);
    showToast('Failed to fetch Google Sheet. Check URL or sharing settings.');
    openSheetModal();
  } finally {
    if (syncBtn) syncBtn.textContent = '↻ Sync Form';
  }
}

function openSheetModal() {
  const modal = document.getElementById('sheet-modal-backdrop');
  const input = document.getElementById('sheet-url-input');
  if (input && state.sheetUrl) {
    input.value = state.sheetUrl;
  }
  if (modal) {
    modal.classList.remove('hidden');
    if (input) input.focus();
  }
}

function closeSheetModal() {
  const modal = document.getElementById('sheet-modal-backdrop');
  if (modal) modal.classList.add('hidden');
}

/**
 * --------------------------------------------------------------------------
 * Initial Responses Loading
 * --------------------------------------------------------------------------
 */
function initData() {
  // Load local walk-in candidates backup from server if running
  fetch('/api/walkin-candidates')
    .then(res => res.json())
    .then(data => {
      if (data && Array.isArray(data.candidates) && data.candidates.length > 0) {
        data.candidates.forEach(wc => {
          const cleanRoll = (wc.rollNo || '').toString().trim().toLowerCase();
          if (!state.walkinCandidates.some(c => (c.rollNo || '').toString().trim().toLowerCase() === cleanRoll)) {
            state.walkinCandidates.push({ ...wc, isWalkin: true });
          }
        });
        mergeCandidates();
      }
    })
    .catch(() => {});

  if (state.sheetUrl) {
    // If live Google Sheet is connected, sync from live sheet
    syncGoogleSheetResponses(false);
  } else if (window.INITIAL_RESPONSES && Array.isArray(window.INITIAL_RESPONSES) && window.INITIAL_RESPONSES.length > 0) {
    state.excelCandidates = window.INITIAL_RESPONSES;
    mergeCandidates();
  } else {
    fetch('UFC FOSS Recruitment Form (Responses) - Form responses 1.csv')
      .then(res => res.text())
      .then(csv => {
        loadCSV(csv);
      })
      .catch(() => {
        mergeCandidates();
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
      state.excelCandidates = parsed;
      mergeCandidates();
      showToast(`Loaded ${parsed.length} candidate responses`);
    }
  } catch (err) {
    showToast('Failed to parse CSV file');
  }
}

/**
 * --------------------------------------------------------------------------
 * URL & Text Sanitization
 * --------------------------------------------------------------------------
 */
function cleanUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let cleaned = url.trim();
  const lower = cleaned.toLowerCase();
  if (
    !cleaned ||
    lower === 'no' ||
    lower === 'none' ||
    lower === '—' ||
    lower === '-' ||
    lower === 'na' ||
    lower === 'n/a' ||
    lower === 'nil' ||
    lower === 'null' ||
    lower === 'nothing' ||
    lower === 'not yet' ||
    lower === 'dont have' ||
    lower === "don't have"
  ) {
    return '';
  }
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = 'https://' + cleaned;
  }
  return cleaned;
}

function resolveCandidateLinks(c) {
  const cleanDigits = (c.phone || '').replace(/[^0-9]/g, '');
  const waPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;

  const email = (c.email || '').trim();
  const validEmail = email.includes('@') ? email : '';

  let githubUrl = cleanUrl(c.github);
  let linkedinUrl = '';
  let portfolioUrl = '';

  const rawSocial = (c.linkedin || '').trim();
  if (rawSocial) {
    const tokens = rawSocial.split(/[\s,;\n|]+/).map(t => cleanUrl(t)).filter(Boolean);
    tokens.forEach(url => {
      if (/linkedin\.com/i.test(url)) {
        if (!linkedinUrl) linkedinUrl = url;
      } else if (/github\.com/i.test(url) || /gitlab\.com/i.test(url)) {
        if (!githubUrl) githubUrl = url;
      } else {
        if (!portfolioUrl) portfolioUrl = url;
      }
    });

    if (!linkedinUrl && !portfolioUrl) {
      const single = cleanUrl(rawSocial);
      if (single) {
        if (/linkedin\.com/i.test(single)) {
          linkedinUrl = single;
        } else {
          portfolioUrl = single;
        }
      }
    }
  }

  return {
    phone: c.phone || '',
    waPhone: waPhone.length >= 10 ? waPhone : '',
    email: validEmail,
    githubUrl,
    linkedinUrl,
    portfolioUrl
  };
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
 * --------------------------------------------------------------------------
 * Filtering & List Rendering
 * --------------------------------------------------------------------------
 */
function applyFilters() {
  const q = state.query.toLowerCase().trim();
  const statusFilter = state.filterStatus;

  state.filtered = state.candidates.filter(c => {
    const status = getCandidateDecision(c);

    // Status tab filter
    if (statusFilter === 'SELECTED' && status !== 'selected') return false;
    if (statusFilter === 'REJECTED' && status !== 'rejected') return false;
    if (statusFilter === 'PENDING' && status !== 'pending') return false;

    // Search query filter across all fields including notes and feedback
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
        c.otherInfo,
        getCandidateNote(c),
        getCandidateNoteAuthor(c)
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
    const decision = getCandidateDecision(c);
    const reviewer = getCandidateReviewer(c);
    const note = getCandidateNote(c);
    const noteAuthor = getCandidateNoteAuthor(c);

    const cleanDigits = (c.phone || '').replace(/[^0-9]/g, '');
    const waPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;

    // Tech stack preview (compact for scannability)
    const techPreview = c.techStack ? c.techStack.replace(/[\r\n]+/g, ' ').slice(0, 85) : 'None specified';

    let tileClass = 'tile';
    if (decision === 'selected') tileClass += ' is-selected';
    if (decision === 'rejected') tileClass += ' is-rejected';

    let statusBadgeHtml = '';
    if (decision === 'selected') {
      statusBadgeHtml = `<span class="badge-status badge-selected">Selected</span>`;
      if (reviewer) {
        statusBadgeHtml += `<span class="reviewer-badge reviewer-selected" title="Selected by ${escapeHtml(reviewer)}">by ${escapeHtml(reviewer)}</span>`;
      }
    } else if (decision === 'rejected') {
      statusBadgeHtml = `<span class="badge-status badge-rejected">Rejected</span>`;
      if (reviewer) {
        statusBadgeHtml += `<span class="reviewer-badge reviewer-rejected" title="Rejected by ${escapeHtml(reviewer)}">by ${escapeHtml(reviewer)}</span>`;
      }
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
            ${c.isWalkin ? '<span class="badge badge-walkin">Walk-in</span>' : ''}
            <span class="badge ${isContributor ? 'badge-contrib' : 'badge-learn'}">${isContributor ? 'Open Source Contributor' : 'Eager to learn'}</span>
          </div>

          ${decision === 'pending' ? `
            <div class="tile-actions" onclick="event.stopPropagation()">
              <button class="btn-tile-reject" data-decision="rejected" data-id="${c.id}" title="Reject candidate">
                ✕ Reject
              </button>
              <button class="btn-tile-select" data-decision="selected" data-id="${c.id}" title="Select candidate">
                ✓ Select
              </button>
            </div>
          ` : ''}
        </div>

        <!-- Secondary Row: Tech Stack, Feedback Preview & View Indicator -->
        <div class="tile-sub-row">
          <div class="tile-tech-preview">
            <strong>Tech Stack:</strong> ${highlight(techPreview, q)}${c.techStack && c.techStack.length > 85 ? '…' : ''}
          </div>
          ${note ? `
            <div class="tile-note-preview" title="Note by ${escapeHtml(noteAuthor || 'Reviewer')}: ${escapeHtml(note)}">
              <span class="note-icon">📝</span>
              <span><strong>${escapeHtml(noteAuthor ? noteAuthor + ': ' : 'Note: ')}</strong>${highlight(note.length > 60 ? note.slice(0, 60) + '…' : note, q)}</span>
            </div>
          ` : ''}
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
 * --------------------------------------------------------------------------
 * Modal Details View
 * --------------------------------------------------------------------------
 */
function openCandidateModal(index) {
  if (index < 0 || index >= state.filtered.length) return;

  state.currentModalIndex = index;
  const c = state.filtered[index];
  const isContributor = (c.contributed || '').toLowerCase().startsWith('yes');
  const q = state.query.trim();

  const links = resolveCandidateLinks(c);

  // Header Elements
  document.getElementById('modal-name').textContent = c.name;
  document.getElementById('modal-counter').textContent = `${index + 1} / ${state.filtered.length}`;

  const tagsEl = document.getElementById('modal-tags');
  tagsEl.innerHTML = `
    ${c.branch ? `<span class="badge badge-branch">${escapeHtml(c.branch)}</span>` : ''}
    ${c.year ? `<span class="badge badge-year">${escapeHtml(c.year)}</span>` : ''}
    ${c.rollNo ? `<span class="badge badge-roll tag-roll" data-roll="${escapeHtml(c.rollNo)}" title="Click to copy">Roll: ${escapeHtml(c.rollNo)}</span>` : ''}
    ${c.isWalkin ? '<span class="badge badge-walkin">Walk-in</span>' : ''}
    <span class="badge ${isContributor ? 'badge-contrib' : 'badge-learn'}">${isContributor ? 'Open Source Contributor' : 'Eager to learn'}</span>
    ${c.timestamp ? `<span class="mono" style="font-size: 0.7rem; color: var(--ink-faint); margin-left: 0.4rem;">${escapeHtml(c.timestamp)}</span>` : ''}
  `;

  // Update Status Badge and Decision Buttons
  updateModalDecisionState(c);

  // Quick Links: Clean white and green aesthetic
  const linksEl = document.getElementById('modal-links');
  linksEl.innerHTML = `
    ${links.waPhone 
      ? `<a href="https://wa.me/${links.waPhone}" target="_blank" rel="noopener noreferrer" class="link-wa">WhatsApp (${escapeHtml(links.phone)}) ↗</a>` 
      : '<span class="link-empty">No WhatsApp</span>'}
    ${links.email 
      ? `<a href="mailto:${escapeHtml(links.email)}">${escapeHtml(links.email)} ↗</a>` 
      : '<span class="link-empty">No Email</span>'}
    ${links.githubUrl 
      ? `<a href="${links.githubUrl}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>` 
      : '<span class="link-empty">No GitHub</span>'}
    ${links.linkedinUrl 
      ? `<a href="${links.linkedinUrl}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` 
      : '<span class="link-empty">No LinkedIn</span>'}
    ${links.portfolioUrl 
      ? `<a href="${links.portfolioUrl}" target="_blank" rel="noopener noreferrer">Portfolio ↗</a>` 
      : '<span class="link-empty">No Portfolio</span>'}
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

  // Populate Interviewer Notes & Feedback (At bottom of modal)
  const noteInput = document.getElementById('modal-note-input');
  const noteAuthorEl = document.getElementById('modal-note-author');
  const noteStatusEl = document.getElementById('modal-note-status');
  if (noteInput) {
    noteInput.value = getCandidateNote(c);
    const author = getCandidateNoteAuthor(c);
    if (noteAuthorEl) {
      noteAuthorEl.textContent = author && noteInput.value.trim() ? `(by ${author})` : '';
    }
    if (noteStatusEl) {
      noteStatusEl.className = 'note-save-status saved';
      noteStatusEl.textContent = 'Saved';
    }
  }

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
  const decision = getCandidateDecision(candidate);
  const reviewer = getCandidateReviewer(candidate);
  const badgeEl = document.getElementById('modal-status-badge');
  const rejectBtn = document.getElementById('modal-reject-btn');
  const selectBtn = document.getElementById('modal-select-btn');

  if (!badgeEl) return;

  badgeEl.className = 'badge-status';
  if (decision === 'selected') {
    badgeEl.classList.add('badge-selected');
    badgeEl.textContent = reviewer ? `Selected (by ${reviewer})` : 'Selected';
  } else if (decision === 'rejected') {
    badgeEl.classList.add('badge-rejected');
    badgeEl.textContent = reviewer ? `Rejected (by ${reviewer})` : 'Rejected';
  } else {
    badgeEl.classList.add('badge-pending');
    badgeEl.textContent = 'Pending';
  }

  // Buttons active states
  if (rejectBtn) rejectBtn.classList.toggle('active', decision === 'rejected');
  if (selectBtn) selectBtn.classList.toggle('active', decision === 'selected');
}

function closeModal() {
  // Ensure any active note typing is flushed before closing
  if (state.currentModalIndex >= 0 && state.filtered[state.currentModalIndex]) {
    const active = state.filtered[state.currentModalIndex];
    const noteInput = document.getElementById('modal-note-input');
    if (noteInput && noteInput.value !== getCandidateNote(active)) {
      saveCandidateNote(active.id, noteInput.value);
    }
  }

  document.getElementById('modal-backdrop').classList.add('hidden');
  state.currentModalIndex = -1;
}

/**
 * --------------------------------------------------------------------------
 * Counters & Results Label
 * --------------------------------------------------------------------------
 */
function updateCounts() {
  const total = state.candidates.length;
  let selected = 0;
  let rejected = 0;

  state.candidates.forEach(c => {
    const status = getCandidateDecision(c);
    if (status === 'selected') selected++;
    else if (status === 'rejected') rejected++;
  });

  const pending = total - selected - rejected;

  const countAll = document.getElementById('count-all');
  const countSelected = document.getElementById('count-selected');
  const countRejected = document.getElementById('count-rejected');
  const countPending = document.getElementById('count-pending');
  const exportCount = document.getElementById('export-count');

  if (countAll) countAll.textContent = total;
  if (countSelected) countSelected.textContent = selected;
  if (countRejected) countRejected.textContent = rejected;
  if (countPending) countPending.textContent = pending;
  if (exportCount) exportCount.textContent = selected;

  const resetBtn = document.getElementById('reset-decisions-btn');
  if (resetBtn) {
    if (selected > 0 || rejected > 0) {
      resetBtn.classList.remove('hidden');
    } else {
      resetBtn.classList.add('hidden');
    }
  }
}

function updateResultsLabel() {
  const countEl = document.getElementById('results-count');
  if (!countEl) return;

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
 * --------------------------------------------------------------------------
 * Export Selected Candidates to CSV
 * --------------------------------------------------------------------------
 */
function exportSelectedToCSV() {
  const selectedCandidates = state.candidates.filter(c => getCandidateDecision(c) === 'selected');

  if (selectedCandidates.length === 0) {
    showToast('No candidates are marked as Selected yet.');
    return;
  }

  const headers = [
    'Name',
    'Roll Number',
    'Branch',
    'Year',
    'Decision',
    'Selected By (Reviewer)',
    'Interviewer Notes & Feedback',
    'Notes Author',
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
      'Selected',
      getCandidateReviewer(c) || 'Reviewer',
      getCandidateNote(c) || '',
      getCandidateNoteAuthor(c) || '',
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
 * --------------------------------------------------------------------------
 * Toast Helper
 * --------------------------------------------------------------------------
 */
let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2200);
}

/**
 * --------------------------------------------------------------------------
 * Event Listeners & Keyboard Shortcuts
 * --------------------------------------------------------------------------
 */
function bindEvents() {
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('clear-search');
  const container = document.getElementById('cards-container');
  const exportBtn = document.getElementById('export-selected-btn');
  const reviewerInput = document.getElementById('reviewer-name-input');
  const resetBtn = document.getElementById('reset-decisions-btn');
  const noteInput = document.getElementById('modal-note-input');
  const syncSheetBtn = document.getElementById('sync-sheet-btn');

  // Google Sheet Sync Button
  if (syncSheetBtn) {
    syncSheetBtn.addEventListener('click', (e) => {
      if (e.shiftKey) {
        openSheetModal();
      } else {
        syncGoogleSheetResponses(false);
      }
    });
  }

  // Google Sheet Connect Modal Controls
  const sheetModal = document.getElementById('sheet-modal-backdrop');
  const sheetModalClose = document.getElementById('sheet-modal-close');
  const sheetCancelBtn = document.getElementById('sheet-cancel-btn');
  const sheetSaveBtn = document.getElementById('sheet-save-btn');
  const sheetUrlInput = document.getElementById('sheet-url-input');

  if (sheetModalClose) sheetModalClose.addEventListener('click', closeSheetModal);
  if (sheetCancelBtn) sheetCancelBtn.addEventListener('click', closeSheetModal);

  if (sheetModal) {
    sheetModal.addEventListener('click', (e) => {
      if (e.target === sheetModal) closeSheetModal();
    });
  }

  if (sheetSaveBtn && sheetUrlInput) {
    sheetSaveBtn.addEventListener('click', () => {
      const url = sheetUrlInput.value.trim();
      if (!url) {
        showToast('Please enter your Google Sheet link');
        return;
      }
      state.sheetUrl = url;
      saveLocalState();
      closeSheetModal();
      syncGoogleSheetResponses(false);
    });
  }

  // Reviewer Name Input
  if (reviewerInput) {
    if (state.reviewerName && state.reviewerName !== 'Reviewer') {
      reviewerInput.value = state.reviewerName;
    }
    reviewerInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      state.reviewerName = val || 'Reviewer';
      saveLocalState();
    });
  }

  // Interviewer Notes & Feedback Input
  if (noteInput) {
    noteInput.addEventListener('input', (e) => {
      if (state.currentModalIndex >= 0 && state.filtered[state.currentModalIndex]) {
        const c = state.filtered[state.currentModalIndex];
        handleNoteInput(c.id, e.target.value);
      }
    });

    noteInput.addEventListener('blur', (e) => {
      if (state.currentModalIndex >= 0 && state.filtered[state.currentModalIndex]) {
        const c = state.filtered[state.currentModalIndex];
        saveCandidateNote(c.id, e.target.value);
      }
    });
  }

  // Search Input
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.query = e.target.value;
      if (state.query) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }
      applyFilters();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.query = '';
      clearBtn.classList.add('hidden');
      searchInput.focus();
      applyFilters();
    });
  }

  // Filter Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === state.filterStatus) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }

    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filterStatus = btn.getAttribute('data-tab');
      saveLocalState();
      applyFilters();
    });
  });

  // Reset Decisions & Notes (Cloud + Local)
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const ok = confirm('Are you sure you want to reset all decisions and notes from Cloud DB and local cache? This will clear records for all interviewers.');
      if (!ok) return;

      updateSyncIndicator('syncing', 'Resetting…');
      state.decisions = {};
      state.reviewers = {};
      state.notes = {};
      state.noteAuthors = {};
      saveLocalState();
      updateCounts();
      applyFilters();

      if (state.currentModalIndex >= 0 && state.filtered[state.currentModalIndex]) {
        updateModalDecisionState(state.filtered[state.currentModalIndex]);
        const nInput = document.getElementById('modal-note-input');
        if (nInput) nInput.value = '';
        const authorEl = document.getElementById('modal-note-author');
        if (authorEl) authorEl.textContent = '';
      }

      if (db) {
        try {
          const snapshot = await db.collection('decisions').get();
          const batch = db.batch();
          snapshot.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          updateSyncIndicator('synced', 'Live Cloud Sync');
          showToast('All candidate decisions and notes reset across cloud');
        } catch (err) {
          console.error('Reset error:', err);
          updateSyncIndicator('error', 'Reset failed on Cloud');
          showToast('Failed to reset cloud records');
        }
      } else {
        showToast('All decisions reset locally');
      }
    });
  }

  // Export Selected
  if (exportBtn) {
    exportBtn.addEventListener('click', exportSelectedToCSV);
  }

  // Tiles clicks: Select/Reject actions or Open Modal
  if (container) {
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
  }

  // Modal Controls
  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalCloseBtn = document.getElementById('modal-close');
  const modalPrevBtn = document.getElementById('modal-prev-btn');
  const modalNextBtn = document.getElementById('modal-next-btn');
  const modalSelectBtn = document.getElementById('modal-select-btn');
  const modalRejectBtn = document.getElementById('modal-reject-btn');

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);

  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        closeModal();
      }
    });
  }

  if (modalPrevBtn) {
    modalPrevBtn.addEventListener('click', () => {
      if (noteInput && state.currentModalIndex >= 0 && state.filtered[state.currentModalIndex]) {
        saveCandidateNote(state.filtered[state.currentModalIndex].id, noteInput.value);
      }
      if (state.currentModalIndex > 0) {
        openCandidateModal(state.currentModalIndex - 1);
      }
    });
  }

  if (modalNextBtn) {
    modalNextBtn.addEventListener('click', () => {
      if (noteInput && state.currentModalIndex >= 0 && state.filtered[state.currentModalIndex]) {
        saveCandidateNote(state.filtered[state.currentModalIndex].id, noteInput.value);
      }
      if (state.currentModalIndex < state.filtered.length - 1) {
        openCandidateModal(state.currentModalIndex + 1);
      }
    });
  }

  if (modalSelectBtn) {
    modalSelectBtn.addEventListener('click', () => {
      if (state.currentModalIndex >= 0 && state.filtered[state.currentModalIndex]) {
        const c = state.filtered[state.currentModalIndex];
        setCandidateDecision(c.id, 'selected');
      }
    });
  }

  if (modalRejectBtn) {
    modalRejectBtn.addEventListener('click', () => {
      if (state.currentModalIndex >= 0 && state.filtered[state.currentModalIndex]) {
        const c = state.filtered[state.currentModalIndex];
        setCandidateDecision(c.id, 'rejected');
      }
    });
  }

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    const isCandidateModalOpen = modalBackdrop && !modalBackdrop.classList.contains('hidden');
    const isSheetModalOpen = sheetModal && !sheetModal.classList.contains('hidden');

    if (isSheetModalOpen) {
      if (e.key === 'Escape') closeSheetModal();
      return;
    }

    if (isCandidateModalOpen) {
      if (document.activeElement === noteInput) {
        if (e.key === 'Escape') noteInput.blur();
        return;
      }

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
      if (e.key === '/' && document.activeElement !== searchInput && document.activeElement !== reviewerInput) {
        e.preventDefault();
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      } else if (e.key === 'Escape' && searchInput && searchInput.value) {
        searchInput.value = '';
        state.query = '';
        if (clearBtn) clearBtn.classList.add('hidden');
        applyFilters();
      }
    }
  });

  // File import
  if (fileInput) {
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
  }

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
