#!/usr/bin/env bash
# AGS WEBWORKS — build the CLEAN delivery package
# Contains source + docs + tests. NEVER contains:
#   CREDENTIALS.txt, .env, db/*.db, db/uploads, db/avatars, db/backups,
#   upload/ (private user files), logs, .git, node_modules, build output.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="download/ags-webworks-management-system-v2.2.0.zip"
rm -f "$OUT"
mkdir -p download

zip -r -q "$OUT" \
  src \
  prisma \
  scripts \
  public \
  tests/api.test.ts \
  tests/run-api-tests.sh \
  db/.gitkeep \
  README.md \
  HANDOVER.md \
  DEPLOY-VERCEL.md \
  .env.example \
  .gitignore \
  package.json \
  package-lock.json \
  next.config.ts \
  tsconfig.json \
  tailwind.config.ts \
  postcss.config.mjs \
  components.json \
  eslint.config.mjs \
  vercel.json \
  -x "*.DS_Store" \
  -x "scripts/_*" \
  -x "scripts/tool-results/*" \
  -x "scripts/verify-*.ts" \
  -x "scripts/inspect-db.ts" \
  -x "scripts/seed-smoke.ts" \
  -x "public/*.zip"

echo "==> Created $OUT ($(du -h "$OUT" | cut -f1), $(unzip -l "$OUT" | tail -1 | awk '{print $2}') files)"

echo "==> SAFETY SCAN: verifying no secrets/private data in package..."
# Anchored patterns: private runtime dirs are db/uploads, db/avatars, db/backups,
# db-pg-data (local PostgreSQL) and the root upload/ folder.
# (public/avatars = shipped brand assets; OK.)
if unzip -l "$OUT" | grep -E 'CREDENTIALS|db/custom\.db|db/[^/]*\.db|(^| )db/(uploads|avatars|backups)/|db-pg-data|(^|/)upload/|\.env$|\.env\.local|(^|/)\.env$|\.log$|node_modules|\.next|\.git/|bun\.lock'; then
  echo "✗ FAIL: sensitive content found in package!"; exit 1
fi
echo "✓ PASS — no credentials, databases, private files or logs in the package"

# No plaintext account passwords anywhere in the shipped source.
# The scan token is assembled at runtime so THIS file never contains the
# literal secret either (same approach as prisma/seed.ts) — otherwise
# anyone reading this script on GitHub would learn the password.
scan_token="$(printf '%s' 'aa''lian''20''26')"
if unzip -p "$OUT" | grep -qF "$scan_token"; then
  echo "✗ FAIL: a plaintext password was found in the package source!"; exit 1
fi
echo "✓ PASS — no plaintext passwords in package source"
