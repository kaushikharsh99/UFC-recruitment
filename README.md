# UFC FOSS Club — Recruitment Responses Dashboard (2026)

A sleek, lightweight, dark-themed dashboard to view, search, filter, and shortlist responses from the Google Forms recruitment drive. Built purely with standard **HTML5**, **CSS3**, and **Vanilla JavaScript** — zero dependencies, zero build steps, and works offline.

---

## ✨ Features

- **Pure Black & Electric Green Theme**: Built with pitch black (`#000000`) backgrounds and vibrant electric green (`#00ff66`) accents. Zero blue or slate tones.
- **Preloaded Data**: Instantly loads the 75 applicant responses already provided in the CSV.
- **Smart CSV Importer**: 
  - Click **"Import CSV"** or simply **drag & drop** any new Google Forms `.csv` export directly onto the webpage to update responses instantly.
  - Custom RFC-4180 parser handles quotes, line breaks, commas, and adapts to Google Forms headers automatically.
- **Instant Search Bar**:
  - Search in real-time by **Candidate Name**, **Roll Number**, **Email**, **Phone**, **Branch**, **Tech Stack**, **Domains**, or keywords in their answers.
  - Press `/` anywhere on the page to focus the search bar immediately.
- **Multi-dimensional Filters & Sorting**:
  - Filter by **Branch** (AI-DS, AI-ML, IIOT, AR).
  - Filter by **Year** (1st Year, 2nd Year, 3rd Year).
  - Filter by **Domain / Sub-team** (Technical, UI/UX, Social Media & Marketing, Events, Technical Writing).
  - Filter by **Prior Open Source Experience** (Contributed vs Eager to learn).
  - Sort by Submission Date (Newest/Oldest), Name (A-Z), or Roll Number.
- **Rich Candidate Cards**:
  - Color-coded badges for Branch, Year, and FOSS Experience.
  - Monospace Roll Number with 1-click clipboard copy.
  - Quick action links for Email (`mailto:`), WhatsApp direct chat (`wa.me`), GitHub profile, and LinkedIn.
  - Tech stack pills and project excerpts.
  - **Star / Shortlist toggle** saved to `localStorage`.
- **Comprehensive Detail Modal**:
  - Click "View Details" on any card to view their full application responses (essays, FOSS philosophy, project contributions, why they want to join).
  - Keyboard navigation: use `Left Arrow` / `Right Arrow` to switch between applicants quickly, and `Esc` to close.
  - 1-click **"Copy Details"** button to copy a formatted summary of any applicant to the clipboard.
- **Export Filtered Data**:
  - Export current search results or shortlisted candidates back to CSV anytime with 1 click.

---

## 🚀 How to Run

### Option 1: Direct Double Click (No Server Needed)
Simply double-click [`index.html`](file:///home/harsh/coding/UFC/website-1/index.html) to open it in any web browser (Chrome, Firefox, Edge, Safari, Brave). All responses and icons load locally.

### Option 2: Local HTTP Server
If you prefer running a local server:

```bash
# Python 3
python3 -m http.server 3000
```
Then visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📂 Project Structure

```text
website-1/
├── index.html              # Main dashboard application HTML
├── style.css               # Pitch Black + Electric Green styles
├── app.js                  # Search, filter, CSV parser, modal & shortlisting logic
├── data.js                 # Preloaded candidate responses from the CSV
├── UFC FOSS Recruitment... # Original raw CSV data export
└── README.md               # Documentation
```
