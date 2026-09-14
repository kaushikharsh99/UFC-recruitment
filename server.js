require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ACCESS_CODE = process.env.WALKIN_ACCESS_CODE || 'UFC_WALKIN_2026';

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

// Dedicated endpoints for Walk-in Registration
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/walkin', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

// API: Verify access passcode
app.post('/api/verify-code', (req, res) => {
  const { accessCode } = req.body || {};
  if (!accessCode || String(accessCode).trim() !== String(ACCESS_CODE).trim()) {
    return res.status(403).json({ valid: false, error: 'Invalid access passcode. Please ask the UFC team.' });
  }
  return res.json({ valid: true });
});

// API: Submit walk-in candidate registration
app.post('/api/register', (req, res) => {
  const { accessCode, candidate } = req.body || {};

  if (!accessCode || String(accessCode).trim() !== String(ACCESS_CODE).trim()) {
    return res.status(403).json({ success: false, error: 'Unauthorized: Invalid registration passcode.' });
  }

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
      id: `walkin_${Date.now()}`,
      isWalkin: true,
      timestamp: candidate.timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      createdAt: new Date().toISOString()
    };

    responses.push(newEntry);
    fs.writeFileSync(WALKIN_DATA_FILE, JSON.stringify(responses, null, 2));

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
  console.log(`📋 Reviewer Dashboard:      http://localhost:${PORT}/`);
  console.log(`📝 Walk-in Registration:   http://localhost:${PORT}/register`);
  console.log(`🔒 Walk-in Passcode:       Configured via .env (WALKIN_ACCESS_CODE)`);
  console.log(`======================================================\n`);
});
