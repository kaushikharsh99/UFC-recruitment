require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const PORTAL_PASSWORD = process.env.PORTAL_PASSWORD || process.env.WALKIN_ACCESS_CODE || 'UFC_RECRUIT_2026';

const WALKIN_DATA_FILE = path.join(__dirname, 'walkin_responses.json');

app.use(express.json());
app.use(express.static(__dirname));

// Ensure walkin_responses.json exists
if (!fs.existsSync(WALKIN_DATA_FILE)) {
  fs.writeFileSync(WALKIN_DATA_FILE, JSON.stringify([], null, 2));
}

// Serve main reviewer dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Dedicated open endpoints for Walk-in Registration
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/walkin', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

// API: Verify coordinator passcode for main recruitment portal
app.post('/api/verify-portal', (req, res) => {
  const { passcode } = req.body || {};
  if (!passcode || String(passcode).trim() !== String(PORTAL_PASSWORD).trim()) {
    return res.status(403).json({ valid: false, error: 'Incorrect coordinator passcode. Access denied.' });
  }
  return res.json({ valid: true });
});

// API: Submit walk-in candidate registration (Open access for students)
app.post('/api/register', (req, res) => {
  const { candidate } = req.body || {};

  if (!candidate || !candidate.name || !candidate.rollNo) {
    return res.status(400).json({ success: false, error: 'Missing required candidate information (Name and Roll No).' });
  }

  try {
    let responses = [];
    if (fs.existsSync(WALKIN_DATA_FILE)) {
      const raw = fs.readFileSync(WALKIN_DATA_FILE, 'utf-8');
      responses = JSON.parse(raw || '[]');
    }

    const newEntry = {
      ...candidate,
      id: `walkin_${candidate.rollNo.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      isWalkin: true,
      timestamp: candidate.timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      createdAt: new Date().toISOString()
    };

    // Prevent duplicate entries by roll number
    const existingIndex = responses.findIndex(r => r.rollNo === candidate.rollNo);
    if (existingIndex >= 0) {
      responses[existingIndex] = newEntry;
    } else {
      responses.push(newEntry);
    }

    fs.writeFileSync(WALKIN_DATA_FILE, JSON.stringify(responses, null, 2));

    // Also mirror to Firebase Cloud Firestore via REST
    try {
      const apiKey = 'AIzaSyAmYv7uMn6hArUvTYN2i8jq8KK68s_dHzQ';
      const projectId = 'ufc-recruitment-live';
      const fields = {};
      for (const [k, v] of Object.entries(newEntry)) {
        if (typeof v === 'boolean') fields[k] = { booleanValue: v };
        else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
        else fields[k] = { stringValue: String(v || '') };
      }
      fields.createdAt = { timestampValue: new Date().toISOString() };
      fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/walkin_responses/${newEntry.id}?key=${apiKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      }).catch(cloudErr => console.warn('Cloud walk-in mirror notice:', cloudErr));
    } catch (e) {}

    return res.json({ success: true, candidate: newEntry });
  } catch (err) {
    console.error('Error saving walk-in response:', err);
    return res.status(500).json({ success: false, error: 'Failed to record registration' });
  }
});

// API: Get walk-in responses
app.get('/api/walkin-candidates', (req, res) => {
  try {
    if (fs.existsSync(WALKIN_DATA_FILE)) {
      const raw = fs.readFileSync(WALKIN_DATA_FILE, 'utf-8');
      const data = JSON.parse(raw || '[]');
      return res.json({ candidates: data });
    }
    return res.json({ candidates: [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read walk-in data' });
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 UFC FOSS Recruitment Server live at: http://localhost:${PORT}`);
  console.log(`🔒 Reviewer Portal (Protected): http://localhost:${PORT}/`);
  console.log(`📝 Walk-in Form (Open):         http://localhost:${PORT}/register`);
  console.log(`🔑 Coordinator Password:        Configured via .env (PORTAL_PASSWORD)`);
  console.log(`======================================================\n`);
});
