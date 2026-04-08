# BID COMMAND — Dar Al-Handasah Bid Management System

A professional bid management web application for tracking tenders, proposals, tasks, contacts and documents.

## 📁 File Structure

```
bid-manager/
├── index.html          ← Main application (open this in browser)
├── css/
│   └── style.css       ← All styles (Blueprint Engineering theme)
└── js/
    ├── firebase.js     ← Firebase database service
    └── app.js          ← Main application logic
```

## 🚀 How to Use

### Option 1: Direct (Recommended)
Simply open `index.html` in a modern browser (Chrome, Edge, Firefox).
The app uses Firebase as backend — no server needed.

### Option 2: Local Server (if CORS issues)
```bash
# Python
python -m http.server 8080

# Node.js
npx serve .
```
Then open `http://localhost:8080`

## ✨ Features

### Dashboard
- KPI stats: active bids, pending tasks, win rate, contract value
- Urgent deadline cards with countdown timers
- Bid pipeline overview by status
- Quick access to pending tasks

### Bids & Tenders
- Add/edit/delete bids with full details
- Fields: reference, client, region, type, submission date, value, currency, departments, description, notes
- Status tracking: In Prep → Active → Submitted → Won/Lost/On Hold
- Progress percentage auto-calculated from tasks
- Filter by status, search by name/client/reference

### Kanban Board
- 4 columns: To Do, In Progress, In Review, Done
- Drag & drop cards between columns
- Filter by bid
- Add cards directly to columns

### Task Management
- Full task list with filters
- Priority levels (High/Medium/Low) with color coding
- Due date tracking with overdue indicators
- Checkbox completion
- Filter by bid, priority, status

### Contacts
- Stakeholder directory (clients, consultants, sub-consultants, government)
- Fields: name, role, company, department, email, phone, notes

### Documents
- Document registry with links to SharePoint/Drive
- Category tagging, bid association
- Supports any file type via URL linking

## 🗄️ Firebase Collections

| Collection  | Purpose                        |
|-------------|--------------------------------|
| `bids`      | All bid/tender records         |
| `tasks`     | Tasks linked to bids           |
| `contacts`  | Stakeholder contacts           |
| `documents` | Document metadata & links      |

## 🔧 Firebase Firestore Rules (Recommended)

Set these rules in Firebase Console → Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // Change to auth-based for production
    }
  }
}
```

## 🎨 Theme
Dark navy blueprint engineering aesthetic with gold accents.
Fonts: Barlow Condensed (headers) + Barlow (body) + Share Tech Mono (data)
