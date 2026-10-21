# AGS WEBWORKS — Business Management & Order Tracking System

A complete, secure, production-ready internal management system for **AGS WEBWORKS** (Dammam & Al Khobar, Saudi Arabia) — clients, orders, projects, tasks, payments, invoices, expenses, team permissions, monthly website maintenance subscriptions with recurring billing, reports and analytics.

**Made by Aaliyan Aamir**

---

## 1. What's Inside

| Module | Capabilities |
|---|---|
| **Dashboard** | Personalized per role — CEO overview (revenue, profit, team workload, deadlines), Developer workspace (assigned projects, tasks, reviews), Accountant cockpit (payments, overdue invoices, billing) |
| **Clients Database** | Full CRUD, auto IDs (CL-0001), duplicate detection by phone/email/website, lead pipeline statuses, search & filters, CSV export, communication history |
| **Orders & Projects** | Auto IDs (AGS-ORD-0001), 12-stage workflow (skippable), Kanban board with drag & drop, table view, deadline calendar, preview/live/repo links, revision history, comments, developer-scoped updates |
| **Attendance** | GitHub-style contribution heatmap (12 months), self check-in / check-out (Asia/Riyadh, auto LATE after 09:30), worked-hours tracking with live timer, present/late/absent/leave/half-day statuses, current & longest streaks, team overview (CEO & accountant), manual marking + audit (CEO only) |
| **Tasks & Assignments** | Assignment to team members, priorities, deadlines, overdue highlighting, comments, statuses |
| **Payments & Invoices** | Payments in/out (received + refunds), methods (bank, cash, Mada, Apple Pay, STC Pay), auto balance calculation, invoices with VAT support, PDF download + print with AGS branding and the account holder's avatar |
| **Expenses & Profit** | Categories, CEO approval workflow, net profit = revenue − approved expenses |
| **Website Maintenance** | Value/Pro/Custom packages (CEO-editable prices & limits), subscriptions with lifecycle (activate/pause/resume/renew/upgrade/downgrade/cancel), **recurring monthly invoicing with duplicate prevention**, support tickets with monthly allowance tracking, MRR analytics |
| **Team & Security** | 3 role accounts + **admin can create new member accounts** (one-time temporary password shown once, forced change at first sign-in), scrypt password hashing, DB-backed sessions, login & reset **rate limiting**, server-side permission matrix, forced first-login password change, admin-issued reset codes, **uploadable profile pictures** (JPG/PNG/WebP ≤ 2 MB, admin can change any member's), full activity audit log |
| **Files** | Private storage (never in /public), access-controlled downloads, linked to clients/orders |
| **Reports** | Sales, revenue vs expenses, profit, orders by status, on-time delivery, lead funnel & conversion, revenue by service, workload, maintenance MRR — all with date ranges + CSV export |
| **Extras** | **Three themes — Dark (charcoal professional, default), Morning (warm sunrise) and Light (clean neutral)** with per-device persistence, English + Arabic (RTL) UI, SAR currency, Asia/Riyadh timezone, subtle WebGL shader login, interactive creator page with games, responsive mobile design, minimalist professional design system |

## 2. The Three Accounts

Accounts are created by the seed script (`prisma/seed.ts`) — **never hardcoded in the frontend**. Per the owner's policy (v2.1), each account's **initial password equals its username** (e.g. `sharjeel` / `sharjeel`) so the team can sign in immediately; passwords are documented in `CREDENTIALS.txt` (chmod 600). For client handover, rotate to strong passwords: `bunx tsx prisma/reset-passwords.ts --strong` (forces first-login change).

| Member | Username | Role | Access |
|---|---|---|---|
| Sharjeel | `sharjeel` | ADMIN — CEO & Marketing | Everything: all modules, settings, team management, expense approvals, package pricing |
| Gufran | `gufran` | DEVELOPER — Web Developer | Assigned orders/projects only, dev-stage status updates, website links, tasks, assigned maintenance tickets, files. **No financial data, no settings, no user management** |
| Addan | `addan` | ACCOUNTANT — Order Coordinator | Orders & coordination, payments, invoices, expenses (create), maintenance billing & invoices, reports. **No user management, no admin settings** |

### 2b. Emergency access (owner-controlled, optional)

If the `EMERGENCY_PASSWORD` environment variable is set, that single password signs in to **any active account** — even after personal password changes — so the owner can never be locked out. The value lives only in the environment (never in source code, never in the UI, never returned by any API), comparison is timing-safe, normal rate limits still apply, and every use is recorded in the activity log as **“EMERGENCY ACCESS used”**. Disable it (leave unset) before handing the system to a client — the clean delivery package ships with it disabled.

## 3. Tech Stack & What To Connect

- **Framework:** Next.js 16 (App Router) + TypeScript
- **UI:** Tailwind CSS 4, shadcn/ui, Framer Motion, Recharts, raw WebGL shaders
- **Database (ORM):** Prisma + **PostgreSQL** (works with the bundled local dev PostgreSQL, Supabase, or any hosted Postgres — just set `DATABASE_URL`)
- **Auth:** Custom secure sessions (scrypt hashes + httpOnly cookies + server-side lookups)
- **PDF:** html2canvas-pro + jsPDF (loaded on demand)
- **Performance:** every view is code-split and lazy-loaded; the initial bundle contains only the shell + dashboard

**Database connection:** the app talks to the database through Prisma using the `DATABASE_URL` environment variable.

- **Local dev:** zero configuration — if `DATABASE_URL` is missing (or points at a legacy sqlite file), an **embedded PostgreSQL** starts automatically on `127.0.0.1:5433` (data in `db-pg-data/`, gitignored). `bun run dev` / `bun run db:push` handle everything.
- **Production:** PostgreSQL or Supabase — set `DATABASE_URL` (see §6 and §7). On Vercel, add it in the project settings; no code changes needed.

No other external services are required. Uploaded files and profile pictures are stored **inside the database** (private, access-controlled, and serverless-safe — they survive Vercel redeploys where the filesystem is read-only). Business files are limited to 4 MB and avatars to 2 MB.

## 4. Environment Variables

`.env` (dev — copy from `.env.example`):

```env
# Optional locally — when missing, the bundled embedded PostgreSQL is used
# automatically (zero-config dev). For Supabase, paste your connection string.
# DATABASE_URL=postgresql://...
```

Production example (PostgreSQL / Supabase — see §6 for the exact Supabase URLs):

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/postgres?pgbouncer=true&connection_limit=1"
NODE_ENV=production
SCHEDULER_KEY="<long-random-string>"   # also set as CRON_SECRET on Vercel
EMERGENCY_PASSWORD="<owner-only>"     # optional — see §2b; DISABLE for client handover
```

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string (Supabase pooler URL on Vercel). When missing locally, the embedded dev PostgreSQL is used automatically |
| `NODE_ENV` | prod | Set to `production` → secure cookies over HTTPS |
| `SCHEDULER_KEY` | recommended | Secret for the recurring-invoice cron endpoint. Accepts `x-scheduler-key` header or `Authorization: Bearer` (Vercel Cron). Generate with `openssl rand -hex 32`. Also set as `CRON_SECRET` in Vercel |
| `EMERGENCY_PASSWORD` | optional | Owner break-glass password — signs in to any active account; audited in the activity log. See §2b |

Never expose `DATABASE_URL`, `SCHEDULER_KEY` or any secrets to the client — all sensitive operations run in server-side API routes.

## 5. Run Locally

```bash
bun install          # or npm install
bun run db:push      # start embedded PostgreSQL (if needed) + create schema + seed the 3 accounts
bun run dev          # http://localhost:3000
```

> `db:push` is a full self-healing setup: it starts the local embedded PostgreSQL when needed, pushes the schema, and seeds the 3 accounts + plans + settings **only when the database is empty** (existing data is never overwritten). Sign in with username = password (sharjeel / gufran / addan) or your emergency password if set.

> Always start the dev server through the package script (`bun run dev` / `npm run dev`). Do **not** execute the Next binary directly with Bun (e.g. `bun next dev` or `bun node_modules/next/dist/bin/next dev`) — Bun-as-runtime + Turbopack cannot resolve the generated Prisma client and every API route will 500. The package scripts run Next under Node, which is fully supported.

Useful scripts:

```bash
bun run lint                          # ESLint
bun run test                          # production build + 34 automated API tests (isolated DB)
bun run db:push                       # push schema changes
bun run db:seed                       # idempotent seed (existing accounts are kept)
bun run db:demo                       # OPTIONAL: insert clearly-fake demo data (fresh DB only)
bun run db:demo-remove                # remove demo data
bunx tsx prisma/reset-passwords.ts    # regenerate all 3 passwords (writes CREDENTIALS.txt)
bunx tsx prisma/cleanup.ts            # wipe business data + restore seeded credentials
```

> **Safe seeding of a test database:** `CREDENTIALS_FILE=tests/creds.txt DATABASE_URL="postgresql://127.0.0.1:5433/ags_test" bunx tsx prisma/seed.ts` — the credentials file path is overridable so testing never overwrites the real one.

## 6. Supabase (PostgreSQL) Setup

The schema is already PostgreSQL — no code changes are needed, only a connection string.

1. Create a project at [supabase.com](https://supabase.com) (free plan is enough).
2. In **Project Settings → Database → Connection string** you will find two URLs:
   - **Transaction pooler** (port `6543`, has `?pgbouncer=true&connection_limit=1`) — use this as the runtime `DATABASE_URL` (Vercel, serverless-safe).
   - **Direct connection** (port `5432`) — use this for one-off commands from your machine (`db:push`, `db:seed`).
3. Initialize and seed from your machine (creates all tables + the 3 accounts + plans + settings):
   ```bash
   DATABASE_URL="postgresql://postgres.REF:PASSWORD@db.REF.supabase.co:5432/postgres" bun run db:push
   ```
4. That's it — the same app now runs anywhere with the pooler URL.

## 7. Deployment

**Option A — Vercel (zero code changes):**

1. Push this project to a GitHub repo (the clean delivery package is ready to push).
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. Add Environment Variables (Production + Preview):
   - `DATABASE_URL` = the Supabase **Transaction pooler** URL (port 6543)
   - `SCHEDULER_KEY` = a long random string (`openssl rand -hex 32`)
   - `CRON_SECRET` = the **same value** as `SCHEDULER_KEY` (authorizes the built-in Vercel Cron)
   - `EMERGENCY_PASSWORD` = your owner break-glass password (optional, see §2b)
4. Deploy. `vercel.json` already registers a daily cron for the maintenance scheduler (see below).
5. Sign in at `https://<your-project>.vercel.app` — username = password, or the emergency password.

Notes for Vercel:
- The build script runs `prisma generate` automatically — no manual steps.
- Uploaded files & avatars live in the database, so they survive redeploys.
- Vercel's free (Hobby) plan allows cron jobs **once per day only**; the registered schedule is daily at 00:00 UTC. On the Pro plan you can raise it to every 5 minutes (`*/5 * * * *`), or point any external cron (e.g. cron-job.org) at `POST /api/maintenance/scheduler/run` with the `x-scheduler-key` header.
- Request bodies are capped at ~4.5 MB by Vercel — business file uploads are limited to 4 MB accordingly.

**Option B — VPS (recommended for full cron control):**

```bash
git clone <your-repo> && cd ags-management
bun install
# configure .env with PostgreSQL + NODE_ENV=production
bun run db:push                  # creates schema (seeds if empty)
bun run build && bun run start   # serves on port 3000 behind Nginx/Caddy
```

**The recurring invoice scheduler — how to activate true 24/7 automation:**

Inside the app, maintenance invoices generate automatically whenever a CEO or accountant is signed in (the app pings `/api/maintenance/scheduler/run` every 5 minutes — idempotent, duplicate-safe), plus there is a manual **Run recurring scheduler** button in *Maintenance → Invoices*.

For full automation independent of anyone being logged in, set `SCHEDULER_KEY` and use either:

- **Vercel Cron** (already registered in `vercel.json`): set `CRON_SECRET` = `SCHEDULER_KEY` in the project env. Vercel calls `GET /api/maintenance/scheduler/run` with `Authorization: Bearer` daily (every 5 min on Pro).
- **Server cron** (VPS):

```cron
# generate due maintenance invoices + flag overdue ones, every day at 03:00
0 3 * * * curl -s -X POST http://localhost:3000/api/maintenance/scheduler/run -H "x-scheduler-key: $SCHEDULER_KEY"
```

The endpoint accepts **any** of: a valid `x-scheduler-key` header, `Authorization: Bearer <SCHEDULER_KEY>` (Vercel Cron), or a signed-in ADMIN/ACCOUNTANT session (the in-app trigger). Without either, it returns 401. If you also want to restrict it at the reverse-proxy level:

```nginx
location /api/maintenance/scheduler/run {
    allow 127.0.0.1;   # cron only
    deny all;
    proxy_pass http://localhost:3000;
}
```

The scheduler:
- generates one invoice per active subscription per billing period (**DB unique constraint prevents duplicates forever**),
- handles months shorter than the billing day (Jan 31 → Feb 28),
- marks invoices/subscriptions overdue and notifies Sharjeel & Addan,
- records failures in the activity log for authorized retries.

## 8. Security Model

- Passwords: scrypt (64-byte derived key + per-user salt), never logged, never sent to the client.
- Brute-force protection: login and password-reset attempts are rate-limited per IP + username (10 sign-in attempts / 15 min; 6 reset attempts / 15 min) with clear 429 responses.
- Business codes (CL-0001, AGS-ORD-0001, …) are generated from the highest existing sequence — deleting records can never cause duplicate-code failures — and creation retries automatically under concurrency.
- Sessions: opaque 256-bit tokens; only SHA-256 hashes stored in the DB; httpOnly/SameSite cookies; 7-day expiry; invalidated on password change.
- Authorization: every API route calls `requirePermission()` — the UI hides pages, but the **server** enforces the role matrix (developers get 403 on financial endpoints even if they craft requests).
- Files: stored outside `/public`; downloads go through an access-checked API route with server-side path containment and `X-Content-Type-Options: nosniff`.
- **Upload content validation:** file contents are verified by magic-byte signatures (`src/lib/file-validation.ts`) — the client-declared MIME type is never trusted. A renamed executable claiming to be `image/png` is rejected with 415, as is any file with a missing/unknown type.
- **Security headers** on every response: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`, HSTS (serve behind HTTPS in production).
- **Error hygiene:** unexpected server errors return a generic JSON message — stack traces, Prisma internals and file paths are logged server-side only, never sent to the client.
- Password reset codes: 10-char random, 30-minute expiry, **single-use**, constant-time comparison, rate-limited (6 attempts / 15 min / IP+username).
- Expired sessions are swept from the database automatically (on login and on every scheduler pass).
- Audit: every create/update/delete/approval/login is written to `activity_logs` with user, action, entity and timestamp (visible to the CEO in Team → Activity log).
- Clients with business history are archived instead of deleted; orders with payments cannot be deleted.
- Report date ranges are inclusive of the final day (an end date of "today" includes records created today).

## 8b. Adding Team Members

*Team Members → Add member* (CEO only): enter name, username, optional email, role and job title. A strong **temporary password is generated and shown exactly once** — copy it and share it with the new member over a secure channel. Their first sign-in forces a password change. Username/email uniqueness is validated server-side, and the account creation is audit-logged. The CEO can also change roles/job titles, deactivate accounts (never the last active admin), and issue one-time password reset codes from the same screen.

## 9. Database Backup & Recovery

- **SQLite:** `sqlite3 db/custom.db ".backup backup-$(date +%F).db"` (cron daily).
- **PostgreSQL/Supabase:** `pg_dump $DATABASE_URL > backup.sql` or enable Supabase automated daily backups (Pro plan) / Point-in-time recovery.
- Restore: stop the app, replace the DB (or `psql < backup.sql`), start the app. Prisma schema is defined in code, so any clean database can be re-initialized with `db:push` + seed.

## 10. Project Structure

```
prisma/schema.prisma       # 26 tables: users, sessions, clients, orders, tasks,
                           # attendance_records, payments, invoices, expenses, files,
                           # comments, notifications, activity_logs, business_settings,
                           # maintenance_plans/subscriptions/invoices/payments/
                           # tickets/activity_logs
prisma/seed.ts             # secure account + package seeding
prisma/reset-passwords.ts  # regenerate the 3 account passwords
prisma/cleanup.ts          # test-data wipe + credential restore
src/lib/                   # auth, permissions matrix, helpers, i18n, store
src/app/api/               # ~40 secured API routes
src/app/page.tsx           # SPA entry (login → password change → app shell)
src/app/globals.css        # design system — Dark / Morning / Light theme tokens
src/components/app/        # shell, login, invoice document, WebGL background
src/components/app/views/  # 14 module views incl. attendance & creator page
db/uploads/                # private file storage
db/avatars/                # uploaded profile pictures (private, API-served)
CREDENTIALS.txt            # initial credentials (safe-delete after first logins)
```

## 11. Arabic / RTL

Toggle the globe icon in the top bar. The whole layout mirrors (sidebar, paddings, dropdowns), navigation and key labels switch to Arabic. English remains the default; add more strings in `src/lib/i18n.ts`.

## 12. Attendance Module Details

- **Check-in / check-out:** every team member checks themselves in from *Workspace → Attendance*. Times are stored in UTC and displayed in Asia/Riyadh. Checking in after **09:30** is automatically flagged **LATE**. Check-out computes the worked hours for the day (a live timer shows progress before check-out).
- **Heatmap:** the last 12 months render as a GitHub-style contribution grid — green shades by hours worked, plus distinct colors for Late, Half day, Leave and Absent. Hover any cell for the date, status and hours.
- **Team overview (CEO & accountant):** today's status of every member plus month-to-date present/late/absent counts. The CEO can select any member to view their heatmap and **manually mark** any past day (Present / Late / Half day / Leave / Absent) with a note — every manual mark is written to the audit log.
- **Permissions:** developers see only their own records; accountants get the team view read-only; only the CEO can mark/edit. Enforced server-side on every route.

## 13. Profile Pictures

Each member can upload their own photo in *Settings → My profile* (hover the avatar → camera, or *Upload new*). The CEO can change any member's picture from *Team Members*. Rules: JPG/PNG/WebP, max 2 MB, stored privately in `db/avatars/` (never in `/public`), served through the authenticated route `/api/avatars/<userId>`. *Reset* returns to the default illustrated avatar. Uploads and resets are audit-logged.

## 14. Verification Status (quality gates)

- `tsc --noEmit` — **0 errors** (strict; `ignoreBuildErrors` is OFF so type errors fail the build)
- `eslint` — **0 errors, 0 warnings**
- Production build (`next build`) — **verified**, standalone output boots, serves the login page, authenticates, and returns live data from the database
- **Automated API test suite — 34 tests / 83 assertions, all passing** (`bun run test`): authentication & rate limiting, all six permission boundaries, the full client → order → invoice → payment workflow with persistence checks, expense approval, content-based upload security, cross-user file access denial, attendance duplicate guard, team creation, single-use reset codes, scheduler key auth, and JSON error hygiene. Runs against an isolated test database — the working database is never touched.
- All 13 modules browser-tested end-to-end (create/edit/persist, role restrictions 401/403, rate limiting, PDF/CSV exports, mobile 390 px, Arabic RTL)

## 15. Credential Rotation & Delivery Hygiene

If credentials were ever exposed (leaked file, shared ZIP, laptop compromise), rotate them:

```bash
bunx tsx prisma/reset-passwords.ts   # new random passwords → CREDENTIALS.txt
                                     # destroys ALL sessions, forces first-login change
```

The clean delivery package intentionally contains **no** `CREDENTIALS.txt`, **no** database file, **no** uploaded files and **no** logs — the client generates their own credentials on first setup (`bun run db:push` + `bun run db:seed`).

Never commit secrets: `.gitignore` excludes `CREDENTIALS.txt`, `.env`, `db/` databases & runtime storage, `upload/`, logs and backups. `.env.example` documents every variable with placeholder values only.

## 16. Sanitized Demo Data (optional)

For client demos you can populate a **fresh** database with clearly-fictional records (three `[DEMO]`-tagged clients with an order, invoice, payments, an expense awaiting approval, a maintenance subscription with a paid invoice and an open ticket):

```bash
bun run db:demo           # insert demo data (refuses if real clients exist)
bun run db:demo-remove    # remove exactly the [DEMO]-tagged records
```

All names, phones, e-mails and domains are fake (`example.com`, `+966 5X 000 00XX`). The script refuses to run when the database already contains real client data.

## 17. Client Handover

See **HANDOVER.md** for the step-by-step handover checklist (first setup, password policy, backups, scheduler activation, go-live).
