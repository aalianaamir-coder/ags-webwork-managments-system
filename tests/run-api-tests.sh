#!/usr/bin/env bash
# AGS WEBWORKS — end-to-end API test runner
# Builds the production standalone bundle into .build-test (isolated from the
# dev server's .next) and runs the integration suite against an ISOLATED
# test database (tests/.tmp/test.db). The working database is never touched.
#
# Usage:
#   bash tests/run-api-tests.sh            # build (if needed) + run tests
#   SKIP_BUILD=1 bash tests/run-api-tests.sh   # reuse existing .build-test build
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .build-test/standalone/server.js || "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> Building production standalone bundle into .build-test (isolated)..."
  rm -rf .build-test
  NEXT_DIST_DIR=.build-test NODE_OPTIONS="--max-old-space-size=2048" \
    bun run node_modules/next/dist/bin/next build --webpack
  # Standalone server bakes distDir ".build-test" into server.js, so static
  # assets must sit at standalone/.build-test/static (NOT only .next/static).
  mkdir -p .build-test/standalone/.build-test
  cp -r .build-test/static .build-test/standalone/.build-test/static
  cp -r public .build-test/standalone/public
  echo "==> Build complete."
fi

echo "==> Running API integration tests against isolated test DB..."
TEST_PORT=3999 \
SCHEDULER_KEY=test-scheduler-key \
  bun test tests/api.test.ts

echo "==> All tests passed."
