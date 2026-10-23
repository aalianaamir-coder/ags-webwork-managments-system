# AGS WEBWORKS Management System — Client Handover Guide

Version 2.1.0 · Prepared for delivery · All setup steps verified on a clean checkout

---

## 1. What the client receives

A clean **source-code package** containing:

| Included | Excluded on purpose |
|---|---|
| Full application source (`src/`, `prisma/`, `public/` brand assets) | `CREDENTIALS.txt` — the client generates their own credentials at setup |
| `README.md` (administrator manual: modules, security, deployment) | Any database file (`db/custom.db`) — no business data leaves your office |
| This handover guide | `.env` with real values (only `.env.example` with placeholders) |
| `prisma/demo-data.ts` — optional clearly-fake demo dataset | Uploaded files, avatars, logs, backups, git history |
| Automated test suite (`tests/`) | |

The application stack: Next.js 16 (App Router) + TypeScript, Prisma ORM + **PostgreSQL** (local dev uses a bundled embedded PostgreSQL — zero config), Tailwind CSS 4 + shadcn/ui, custom secure session auth. Runs on Vercel with zero code changes. No paid third-party services are required to run it (see §8).

## 2. First setup (15 minutes)

Prerequisites: **Node.js 20+** (or Bun 1.1+). The database is PostgreSQL — for local evaluation an embedded PostgreSQL starts automatically; for production use Supabase or any managed Postgres (just set `DATABASE_URL`).

```bash
# 1. Install dependencies
npm install             # or: bun install

# 2. Create the database schema + the three accounts
#    (embedded PostgreSQL starts automatically when DATABASE_URL is not set;
#     for Supabase: DATABASE_URL="postgresql://..." npm run db:push)
npm run db:push

# 3. Start
npm run dev            # development, http://localhost:3000
# production:
npm run build && npm run start
```

> Always start via the package scripts (`npm run dev` / `npm run build` / `npm run start`) — they run Next under Node and work on Windows PowerShell, macOS and Linux alike.

The seed creates three accounts (administrator / developer / accountant roles). **Initial passwords equal the usernames** (sharjeel / gufran / addan) per the owner's policy — rotate to strong passwords before real use: `npx tsx prisma/reset-passwords.ts --strong` (forces first-login change, writes `CREDENTIALS.txt`).

**Optional demo data:** `npm run db:demo` populates a *fresh* database with three clearly-fictional `[DEMO]`-tagged clients, an order, invoice, payments, a maintenance subscription and a ticket — useful for training sessions. Remove with `npm run db:demo-remove`. It refuses to run on a database that already has real clients.

## 3. Password & account policy (tell the client)

- Initial passwords equal the usernames by default; rotate with `npx tsx prisma/reset-passwords.ts --strong` for production use.
- Passwords are stored as scrypt hashes — they can never be recovered, only reset.
- An administrator issues one-time reset codes from *Team Members* (valid 30 minutes, single use).
- All sessions are invalidated when a password changes.
- Login attempts are rate-limited (10 per 15 minutes per username); reset-code guessing is limited to 6 per 15 minutes.

### 3b. Emergency access (owner-only feature — MUST be disabled for client deliveries)

If the `EMERGENCY_PASSWORD` environment variable is set, that single value signs in to any active account, even after personal password changes. It exists so the owner can never be locked out. Properties: value lives only in the environment (never in source/UI/API responses), timing-safe comparison, rate limits apply, and every use is logged in the activity log as **“EMERGENCY ACCESS used”**. The delivered package ships with it **unset (disabled)** — leave it unset for clients, and never commit the value to git.

## 4. Go-live checklist

1. **Database:** PostgreSQL (Supabase recommended — free tier is enough). Set `DATABASE_URL` (pooler URL for Vercel, direct URL for one-off `db:push`), run `npm run db:push` — schema + 3 accounts are created automatically. **The schema is already PostgreSQL; no provider switch is needed.**
2. **Hosting:** Vercel works with zero code changes (import repo → set env vars → deploy; `vercel.json` registers the scheduler cron). A VPS also works (`npm run build && npm run start` behind Nginx/Caddy).
3. **HTTPS:** automatic on Vercel; on VPS serve behind Nginx/Caddy with TLS. Cookies become `secure` when `NODE_ENV=production`; HSTS is already sent.
4. **Scheduler:** set `SCHEDULER_KEY` (e.g. `openssl rand -hex 32`); on Vercel also set `CRON_SECRET` to the same value so the built-in cron is authorized.
5. **Backups:** schedule daily database backups (Supabase has automatic backups; README §9) and verify a restore once before go-live.
6. **Monitoring:** watch the server logs and check *Team → Activity log* inside the app for a full audit trail.
7. **Run the test suite once on the production build:** `npm run test` (uses an isolated test database — safe anytime).

## 5. Where things live

| Concern | Location |
|---|---|
| Roles & permissions matrix | `src/lib/permissions.ts` |
| Session & password logic | `src/lib/auth.ts` |
| Upload content validation | `src/lib/file-validation.ts` |
| Recurring-invoice scheduler | `src/app/api/maintenance/scheduler/run/route.ts` |
| Business settings (VAT, currency, invoice footer) | *Settings* in the app (CEO account) |
| Private file storage | **inside the database** (`FileRecord.data`) — serverless-safe, access-controlled, never inside `/public` |
| Uploaded profile pictures | **inside the database** (`User.avatarData`) — served only to signed-in members |
| Emergency access (optional) | `EMERGENCY_PASSWORD` environment variable (see §3b) |
| Local dev database | embedded PostgreSQL, data in `db-pg-data/` (gitignored) |

## 6. Rollback

The system is stateless apart from the database: to roll back a deployment, restore the previous build directory and the database backup taken before the upgrade. Schema changes go through Prisma — keep `prisma/migrations/` in version control once you adopt `migrate` workflows.

## 7. Support expectations

All 13 modules were verified end-to-end and the API suite (34 tests) passes on the delivered build. If the client modifies the code, `npm run lint`, `npx tsc --noEmit` and `npm run test` are the quality gates to re-run before shipping changes.

## 8. Third-party software & paid services

All runtime dependencies are open-source (MIT/Apache-ISC style licenses — Next.js, React, Prisma, Tailwind, shadcn/ui, Recharts, jsPDF, html2canvas-pro, etc.). **No paid services are required.** Optional paid infrastructure the client may *choose*: managed PostgreSQL (e.g. Supabase Pro), VPS hosting, domain & TLS. The app itself has no license keys, phone-home code or usage limits.
