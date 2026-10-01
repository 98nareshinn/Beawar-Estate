# Beawar Estate

Fresh React + TypeScript frontend, Node.js + TypeScript API, and SQLite SQL database for a responsive Beawar property portal. The ZIP root deliberately contains only `frontend/`, `backend/` and `.env`.

## Run locally in VS Code

Install Node.js 24 LTS, extract the ZIP, open the extracted folder in VS Code, and run these commands in the integrated terminal:

```powershell
npm ci --prefix frontend
npm ci --prefix backend
npm run dev:all --prefix backend
```

Open `http://localhost:5173`. The launcher starts the API and Vite frontend together. Stop it with Ctrl+C. If PowerShell blocks `npm`, run the same commands with `npm.cmd`.

For two terminals, run `npm run dev` in `backend/` and `npm run dev` in `frontend/`.

## First login and permissions

The bootstrap head-admin email is `head@beawarestate.local`. Its initial password is stored only in the root `.env` as `ADMIN_PASSWORD`; do not publish that file. `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD` are used only when the database is created for the first time.

Public navigation never shows Agents, Approvals or Head admin. After login the API and UI apply the same role checks:

- **Member:** browse approved properties, save favourites, book services, message the assigned professional, and create/track own submissions.
- **Agent:** member access plus assigned-property contacts and work updates; cannot approve.
- **Approver:** only the approval decisions granted to that account; private documents remain hidden.
- **Admin:** review private documents, manage assigned agents, and use only the content/service permissions granted by Head admin.
- **Head admin:** account creation, role/permission assignment, branding/policy settings, approvals, services and content.

Head admin creates website accounts (not Gmail/Outlook mailboxes) with email, password, mobile, role and explicit permissions. Accounts can be deactivated and their sessions are revoked when permissions change. There is no public Agents directory.

## What is included

- Hindi-first light theme with English and dark-mode switches; responsive desktop, tablet and mobile layouts.
- Dashboard with Buy/Rent/All controls, locality filters, min/max price, min/max square feet, property subtype, bedrooms, amenities, availability, saved properties, compact animated cards, photos and a list/map view.
- Every new or edited property requires latitude and longitude. Approved records appear as exact-coordinate Leaflet pins; the detail panel includes all uploaded photos, address, type, sale/rent purpose, assigned-agent contact and a directions link. Existing records without coordinates are truthfully shown without a fabricated pin.
- My Submissions with private documents/photos, status, approver history for the owner, correction requests and exact map location capture (manual map pin or browser location permission).
- Notification bell with unread count, first-open popup, read-all controls and private links back to the relevant conversation.
- My Chat for property requests and service bookings: threaded replies, visit-request quick action, call/SMS shortcuts, assigned-agent/provider conversations and permission-checked access. Replies create notifications for the other participant/team member.
- Services marketplace for plumbers, electricians, architects and carpenters. Authorized staff add real professionals with their real rates and contact details; no providers, ratings or contacts are invented. Public users filter by category, budget/standard/premium tier and computed completed-job ratings, then book a date/time, call/SMS the listed contact, and message through the booking.
- Booking ledger with request/confirm/in-progress/completed/cancelled status, quotes, cash/UPI/bank payment or refund records, receipt references, duplicate/overpayment checks, and one customer review after a completed job. It is an offline record only; no money is collected by this app.
- News & Updates fetches live Beawar (PIN 305908) and India headlines from configured HTTPS RSS feeds. Set `GNEWS_API_KEY` for GNews search; otherwise Google News RSS defaults are used. The server validates links, caches feeds for ten minutes, shows stale-cache status during outages, and keeps only headline/source/date/original-link metadata. Head admin may also publish local announcements.
- SQLite persistence, hashed sessions/passwords, parameterized SQL, same-origin mutation checks, upload validation, rate limits and audit events.

## Data, demo records and backup

`SEED_DEMO=true` in `.env` creates six clearly labelled illustrative property records on the first launch. Their photographs, prices and addresses are examples, not verified Beawar listings. No fictional providers or news items are seeded. Set `SEED_DEMO=false` before the first launch for an empty property database. Existing demo rows are not removed by changing the flag later.

The SQLite database is `backend/data/estate.sqlite`; protected uploads are in `backend/uploads/`. Stop the server and copy both folders together, including any SQLite WAL files, before making a backup. Existing data, credentials and uploads are intentionally excluded from the delivered ZIP.

## Build and verify

```powershell
npm run build --prefix frontend
npm run typecheck --prefix backend
npm test --prefix backend
```

The delivery was checked with 12 backend integration tests covering public/private visibility, coordinate validation and publication, permissions, assignment privacy, service providers, booking ownership, messages, state transitions, ledger safeguards, reviews, RSS parsing, caching and stale-news fallback. The frontend build passed TypeScript and Vite production compilation.

## Important configuration

Keep the supplied `.env` private. Useful optional variables are `GNEWS_API_KEY`, `NEWS_BEAWAR_RSS_URL`, `NEWS_INDIA_RSS_URL`, `DATA_DIR`, `UPLOAD_DIR`, `APP_ORIGIN` and `ADDITIONAL_ORIGINS`. RSS overrides must be HTTPS outside test mode. The default map uses OpenStreetMap tiles with visible attribution; keep attribution and follow the tile-use policy. This app does not bulk-download or prefetch map tiles.

Google profile photos are available only when you configure your own Google Identity Services client (`GOOGLE_CLIENT_ID`) and authorized localhost origin. Normal email/password login works without Google. No real Android/iOS native app is included; the website is responsive and can be opened from a phone on the same LAN.

## Where to edit

| Path | Purpose |
| --- | --- |
| `frontend/src/explorer.tsx` | Dashboard filters, cards, detail panel and map/list view |
| `frontend/src/maps.tsx` | Leaflet map, exact pin selection and location picker |
| `frontend/src/marketplace.tsx` | Service directory, bookings, messages and ledger |
| `frontend/src/news-hub.tsx` | Live feeds and head-admin announcements |
| `frontend/src/forms.tsx` | Login, property and submission forms |
| `frontend/src/experience.css` | Responsive theme, compact controls and animation |
| `backend/src/server.ts` | HTTP API and authorization |
| `backend/src/marketplace.ts` | Providers, bookings, payments and reviews |
| `backend/src/news-feed.ts` | RSS/GNews fetching, validation and cache |
| `backend/sql/schema.sql` | SQLite relational schema |
| `.env` | Local credentials, ports, data paths and optional feeds |

Photo credits and font licenses are in `frontend/ASSET-CREDITS.md`.
