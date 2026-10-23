# AGS WEBWORKS — Full Deployment Guide (GitHub → Vercel + Supabase)

**For Windows users working in VS Code with the PowerShell terminal.**
Every command below is copy-paste ready. Follow the parts in order.

---

## Why your last deploy failed (read this first)

Vercel is only the "web server" — it has **no database inside it**. The app
needs a PostgreSQL database reached through a `DATABASE_URL` connection
string. When that variable is missing (or the database has no tables yet),
the site opens but every login/action fails.

Also, a `.env` file committed to GitHub does **nothing** on Vercel — Vercel
only reads environment variables from **Project Settings → Environment
Variables**.

The fix (this guide):

1. Create a **free PostgreSQL database on Supabase** (2 minutes)
2. Put its connection string in a local `.env` and run **one command** that
   creates all tables + your 3 user accounts
3. Push the fixed code to GitHub
4. Import the repo into **Vercel**, add the environment variables, deploy

---

## Why your accounts (sharjeel / gufran / addan) never appeared in Supabase

This answers: *"why weren't my previous accounts added to Supabase?"*

The app always writes to **wherever `DATABASE_URL` points** — nothing else,
never anywhere else. Before you put a Supabase connection string in that
variable, the app quietly used a **local database on your own PC** (a small
PostgreSQL bundled inside the project for offline development). So:

- The accounts **were** created — sign-in even worked — but they went into
  that PC-local database. Supabase stayed empty because the app was **never
  connected to it**. Supabase does not sync by itself; it is just an empty
  database until the app is pointed at it.
- In other words: the same app can have completely different data depending
  on which `DATABASE_URL` it was given. Your old accounts still exist only
  in the PC-local database; they were never "uploaded" anywhere.

**You never create tables or accounts by hand in Supabase.** There is no
SQL to copy, no Table Editor clicking. One command does everything:

```powershell
npm run db:push
```

Run once with a Supabase `DATABASE_URL` in your `.env`, it:

1. Creates all 22 tables with the exact structure the app expects
2. Seeds your team accounts (`sharjeel`, `gufran`, `addan` — initially
   username = password) plus subscription plans and system settings
3. Is **idempotent** — safe to re-run any time; it never deletes data,
   never duplicates accounts, and repairs missing pieces

The old PC-local accounts are not "transferred" — the seed re-creates them
fresh inside Supabase. That is fine for accounts. If you ever have **real
business data** (clients, orders, invoices) sitting in a PC-local database
that you need moved into Supabase, ask for the migration procedure first —
do not just re-run the seed and assume old data appears.

---

## PART 0 — One-time installs on your PC

Open **VS Code → Terminal → PowerShell** and check what you already have:

```powershell
node -v
```

- If you see `v20.x` or `v22.x` → perfect, continue.
- If you see an error → install Node.js LTS from <https://nodejs.org>
  (click the big LTS button, next-next-finish), then **close and reopen
  VS Code** and check `node -v` again.

Also make sure Git is installed:

```powershell
git --version
```

If missing → install from <https://git-scm.com/download/win> (default
options are fine), reopen VS Code.

---

## PART 1 — Create the free database (Supabase)

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub.
2. Click **New project**.
3. Fill in:
   - **Name**: `ags-webworks` (anything you like)
   - **Database Password**: make up a strong password and **WRITE IT DOWN
     somewhere safe** (you cannot view it later!)
   - **Region**: pick the one closest to you (e.g. `West EU / Frankfurt`)
4. Click **Create new project** and wait ~2 minutes while it builds.

### Get your connection string

1. When the project is ready, click the **Connect** button (top right).
2. Find the **Session pooler** connection string — it looks like:

   ```
   postgresql://postgres.abcdefghijklmnop:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
   ```

3. Copy it to Notepad and replace `[YOUR-PASSWORD]` with the database
   password you wrote down in step 3.
4. Add `?sslmode=require` to the **end** of the string. Final result looks
   like:

   ```
   postgresql://postgres.abcdefghijklmnop:MyPassw0rd123@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require
   ```

Keep this string — you will use it 2 times (local `.env` + Vercel).

---

## PART 2 — Set up the project on your PC

In VS Code → PowerShell:

```powershell
cd $HOME\Desktop
Expand-Archive "$HOME\Downloads\ags-webworks-management-system-v2.2.0.zip" -DestinationPath ags-system
cd ags-system
```

(If your browser saved the ZIP elsewhere, adjust the path. If the ZIP has a
nested folder inside, `cd` into it so you can see `package.json`.)

### Create the `.env` file

```powershell
notepad .env
```

(In Notepad) paste this one line — with **your** connection string:

```
DATABASE_URL=postgresql://postgres.abcdefghijklmnop:MyPassw0rd123@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require
```

Save and close (`Ctrl+S`, `Alt+F4`).

### Install and initialize the database

```powershell
npm install
npm run db:push
```

`npm run db:push` connects to your Supabase database, creates **all 26
tables**, and seeds the accounts (sharjeel / gufran / addan). You should
see:

```
==> prisma db push
...
==> seeding (idempotent — ensures accounts, plans & settings exist)
...
==> Database ready. Default sign-in: username = password (sharjeel / gufran / addan).
```

> **Already deployed before?** If your Supabase database already has data,
> `npm run db:push` is still safe — it only adds missing tables/columns and
> missing accounts. Existing data and passwords are never overwritten. Run
> it once after upgrading so the new system accounts exist, then **Redeploy**
> on Vercel.

> ⚠️ If you see `P1001: Can't reach database server` → the connection string
> or password is wrong. Re-check PART 1. If you see `npm not recognized` →
> PART 0 was not completed.

### (Optional) test it locally

```powershell
npm run dev
```

Open <http://localhost:3000> and sign in with `sharjeel` / `sharjeel`.
Stop it with `Ctrl+C` when done.

---

## PART 3 — Push the fixed code to GitHub

The repo `aalianaamir-coder/ags-webwork-managments-system` must be REPLACED
with this fixed code. Do it from a clean folder:

```powershell
cd $HOME\Desktop

# 1. Download your current repo (just to keep it connected to GitHub)
git clone https://github.com/aalianaamir-coder/ags-webwork-managments-system.git ags-repo
cd ags-repo

# 2. Delete ALL old files (the .git folder is kept — it links to GitHub)
Get-ChildItem -Force -Exclude .git | Remove-Item -Recurse -Force

# 3. Copy the NEW files from the ZIP into this folder
#    (adjust the path if you extracted somewhere else)
Expand-Archive "$HOME\Downloads\ags-webworks-management-system-v2.2.0.zip" -DestinationPath "$HOME\Desktop\ags-new" -Force
Copy-Item -Recurse -Force "$HOME\Desktop\ags-new\*" .

# 4. Commit and push (replaces everything on GitHub)
git add -A
git commit -m "v2.2.0 — hidden admin oversight, npm + Supabase, cross-platform scripts"
git push origin main --force
```

The first push may open a GitHub login window — sign in and allow.

> `--force` makes GitHub match your local folder exactly (removes stale old
> files, including the useless `.env` that was committed before).
>
> ⚠️ `.env` is in `.gitignore`, so your `.env` is never pushed — the database
> password stays private on your PC. (You only need `.env` locally for
> `npm run db:push` — Vercel gets its own copy from PART 4.)

Check <https://github.com/aalianaamir-coder/ags-webwork-managments-system> —
the file list should now show `DEPLOY-VERCEL.md` and `package-lock.json`, and
**no** `.env` and **no** `bun.lock`.

---

## PART 4 — Deploy on Vercel

1. Go to <https://vercel.com> → **Sign Up / Continue with GitHub** (use the
   Sign in with GitHub option).
2. Click **Add New… → Project**.
3. You should see `ags-webwork-managments-system` in the list — click
   **Import** next to it.
   (If you don't see it: click **Adjust GitHub App Permissions** and grant
   access.)
4. Vercel auto-detects **Next.js** — leave every build setting as-is.
5. Open **Environment Variables** and add these (one by one):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | your full connection string ending in `?sslmode=require` (same one from PART 1) |
   | `SCHEDULER_KEY` | any long random text, e.g. `ags-sched-x7K9pQ2mVb42Lz` |
   | `CRON_SECRET` | **exactly the same value** as `SCHEDULER_KEY` |
   | `EMERGENCY_PASSWORD` *(optional)* | your emergency password — private, never share |

   For each one: type the Name, paste the Value, leave Environment set to
   *All / Production + Preview + Development*, click **Add**.

6. Click **Deploy** and wait 3–5 minutes.
7. When it says **Congratulations**, click **Visit** → your login page.

---

## PART 5 — Verify it works

On your Vercel URL:

1. Sign in: `sharjeel` / `sharjeel` → dashboard loads ✓
2. Clients → **+ New Client** → create one ✓
3. Orders → create an order for that client ✓
4. Invoices → generate → **Download PDF** ✓

If all four pass, the system is live. 🎉

### See it with your own eyes inside Supabase (recommended)

Your tables and accounts are real rows in Supabase — you can look at them
any time, and later inspect data directly without opening the app:

1. Open your Supabase project → left sidebar **Table Editor**
2. You will see the full table list: `User`, `Client`, `Order`, `Invoice`,
   `Payment`, `Task`, … (about 22 tables)
3. Click **User** → you'll see your team sign-in accounts

Or run SQL — left sidebar **SQL Editor** → **New query** → paste → **Run**:

```sql
-- 1. All sign-in accounts and their state
SELECT username, name, role, "isActive", "mustChangePassword"
FROM "User"
ORDER BY "createdAt";

-- 2. Confirm every table was created (expect 22)
SELECT COUNT(*) AS tables_created
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- 3. Cross-check business data (all zero on day one — they grow as you use the app)
SELECT
  (SELECT COUNT(*) FROM "Client")  AS clients,
  (SELECT COUNT(*) FROM "Order")    AS orders,
  (SELECT COUNT(*) FROM "Invoice")  AS invoices;
```

> Keep the double quotes exactly as shown — table/column names are
> case-sensitive (`"User"`, `"isActive"`), and lowercase versions will error.

> **Passwords are never visible** in Supabase — not in Table Editor, not via
> SQL. Only salted hashes are stored. To change a password use the app
> (Team page or Forgot password), never edit the table by hand.

---

## Troubleshooting

| Symptom | Cause & Fix |
|---|---|
| Login page opens but sign-in shows *"Database is not configured"* | `DATABASE_URL` missing in Vercel → PART 4 step 5, then **Deployments → ⋯ → Redeploy** |
| `P1001 can't reach database server` | Wrong password or string. Re-copy from Supabase → Connect → Session pooler; replace `[YOUR-PASSWORD]`; add `?sslmode=require` |
| `P2021 table does not exist` | Tables never created → run `npm run db:push` from PART 2 on your PC |
| Supabase dashboard looks empty (no tables / no users) | The app was never pointed at Supabase, or `db:push` was never run against it → redo PART 1 (connection string) + PART 2 step `npm run db:push`, then verify with the SQL in PART 5 |
| Sign-in says invalid username or password | Initial passwords are username = password (`sharjeel/sharjeel`, `gufran/gufran`, `addan/addan`). If forgotten: use **Forgot password** on the sign-in page (an ADMIN gets a reset PIN), or an ADMIN resets it from the Team page. Never type a password into Supabase directly |
| Build fails on Vercel with a red error | Open the build log — usually a missing env var. Fix, then Redeploy |
| `npm not recognized` in PowerShell | Install Node.js LTS (PART 0) and reopen VS Code |
| `git push` rejected without `--force` | Old history differs — use the `--force` command from PART 3 |
| Vercel Cron / maintenance invoices | Needs `SCHEDULER_KEY` **and** `CRON_SECRET` set to the same value |
| Local `npm install` warns about `embedded-postgres` | Harmless — it's optional and only used for offline local dev. Supabase is your database. |

---

## Daily use

- **Your app**: `https://your-project.vercel.app` (bookmark it)
- Sign in: `sharjeel` / `gufran` / `addan` (username = password)
- Every `git push` to GitHub auto-deploys the change to Vercel
- Database data lives in Supabase — it persists forever, even between
  deploys

## Before handing the system to a client

1. Rotate all account passwords to strong random ones (forces a change at
   next sign-in):
   ```powershell
   npx tsx prisma/reset-passwords.ts --strong
   ```
   (Passwords are printed to `CREDENTIALS.txt`.)
2. Remove `EMERGENCY_PASSWORD` from Vercel env vars if you don't want it.
3. Remove `SCHEDULER_KEY` knowledge from anyone who shouldn't have it.
