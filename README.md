# ReachCT Lab — v2.0

> **Isolated test environment** for developing and validating new ReachCT features before they go to the company's live tool.

---

## What's Different From Production

| | Production | Lab |
|---|---|---|
| **Frontend routing** | `useState` page switching | React Router (real URLs) |
| **Hosting** | Netlify | Cloudflare Pages (unlimited deploys) |
| **Auth** | None | Google OAuth + JWT |
| **User dashboards** | ❌ | ✅ Personal databases + spreadsheet view |
| **Database** | Shared only | Shared + per-user databases |

---

## Project Structure

```
lab/
├── backend/
│   ├── api.py            # FastAPI — scraper + auth + user database endpoints
│   ├── reachct.py        # Playwright Google Maps scraper
│   ├── database.py       # PostgreSQL — companies, users, user_databases
│   ├── auth.py           # Google OAuth token verification + JWT
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx                    # Routes
│   │   ├── styles.js                  # API URL, company types, global CSS
│   │   ├── context/
│   │   │   └── AuthContext.jsx        # Login / logout / token storage
│   │   ├── components/
│   │   │   ├── icons.jsx              # SVG icons + ReachCT logo
│   │   │   └── shared.jsx             # InnerHeader + ResultsTable
│   │   └── pages/
│   │       ├── Landing.jsx            # Home — shows My Dashboard if signed in
│   │       ├── LoginPage.jsx          # Google sign-in
│   │       ├── SearchPage.jsx         # Google Maps scraper
│   │       ├── DatabasePage.jsx       # Pull from shared DB
│   │       ├── InfoPage.jsx           # How to use
│   │       ├── AdminPage.jsx          # Job control panel
│   │       ├── DashboardPage.jsx      # User's personal databases
│   │       └── SpreadsheetPage.jsx    # Editable spreadsheet + modals
├── Dockerfile
├── .gitignore
└── README.md
```

---

## Database Schema

```sql
users                       -- Google OAuth accounts
user_databases              -- Named databases per user (e.g. "IT Companies Germany")
user_database_collaborators -- Shared access (editor / viewer)
user_database_entries       -- Rows with flexible JSONB columns
companies                   -- Shared scraped contacts
searches                    -- Search history log
```

---

## Routes

| Path | Page |
|---|---|
| `/` | Landing |
| `/login` | Google sign-in |
| `/search` | New search |
| `/database` | Pull from shared DB |
| `/info` | How to use |
| `/admin` | Admin panel |
| `/dashboard` | My databases |
| `/dashboard/db/:id` | Spreadsheet view |

---

## Setup

### 1. Backend — Railway (new project, separate from production)

1. Create a **new Railway project**
2. Add a **PostgreSQL** service — copy the internal `DATABASE_URL`
3. Connect this repo to Railway
4. Set environment variables:

```
DATABASE_URL     = postgresql://... (from Railway PostgreSQL)
GOOGLE_CLIENT_ID = your-client-id.apps.googleusercontent.com
JWT_SECRET       = any-long-random-string (openssl rand -hex 32)
```

5. Generate a public domain — note the URL

### 2. Frontend — Cloudflare Pages

1. Push this repo to a new GitHub repository
2. In Cloudflare Pages: **Create project → Connect to Git**
3. Build settings:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `frontend`
4. Deploy — Cloudflare auto-deploys on every push, no limits

### 3. Connect frontend to backend

In `frontend/src/styles.js`:

```js
export const API = "https://your-lab-backend.up.railway.app";
```

Commit and push — Cloudflare redeploys automatically.

---

## Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
playwright install chromium
uvicorn api:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev   # http://localhost:5173
```

---

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `DATABASE_URL` | Railway | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | Railway + `styles.js` | Google OAuth client ID |
| `JWT_SECRET` | Railway | Secret key for signing JWTs |

---

## Features

### Shared (same as production)
- Google Maps scraper with queue system
- Shared PostgreSQL company database
- Pull from database with filters
- Excel export + copy to clipboard
- Admin panel at `/admin`

### New in Lab
- **Google OAuth** — sign in with Google, auto-creates account
- **My Dashboard** — personal named databases per user
- **Spreadsheet view** — editable grid with custom columns
- **Pull into database** — multi-select filters (multiple cities, types, countries)
- **Upload spreadsheet** — Excel/CSV → pandas standardisation → shared DB
- **Search into database** — scrape directly into a user database
- **Collaborators** — share databases by email (editor or viewer role)

---

## Pending Features

- [ ] Hybrid pull/scrape (check searches table before scraping gap)
- [ ] Claude API integration for AI-powered outreach drafting
- [ ] URL list scraper (paste URLs → scrape emails directly)