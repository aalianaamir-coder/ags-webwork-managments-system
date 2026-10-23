// AGS WEBWORKS — API integration & security test suite
// Runs against an ISOLATED test database (ags_test on the local embedded
// PostgreSQL) and a dedicated server instance. Never touches the working
// database.
//
// Prerequisites (handled by tests/run-api-tests.sh):
//   - production standalone build at .build-test/standalone/server.js
//
// Environment expected:
//   TEST_PORT          (default 3999)
//   TEST_DATABASE_URL  (default postgresql://ags:ags@127.0.0.1:5433/ags_test)
//   SCHEDULER_KEY      (default test-scheduler-key)
//   Bun runtime: `bun test tests/api.test.ts`

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn, type ChildProcess, execFileSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

const PORT = Number(process.env.TEST_PORT || 3999);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(import.meta.dir, "..");
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || "postgresql://ags:ags@127.0.0.1:5433/ags_test";
const SCHEDULER_KEY = process.env.SCHEDULER_KEY || "test-scheduler-key";
const SERVER_JS = path.join(ROOT, ".build-test", "standalone", "server.js");

// Fixed test-only credentials (clearly non-production; test DB is disposable)
const TEST_USERS = {
  admin: { username: "sharjeel", password: "Test-Admin-Password-2026", role: "ADMIN" },
  dev: { username: "gufran", password: "Test-Dev-Password-2026", role: "DEVELOPER" },
  acct: { username: "addan", password: "Test-Acct-Password-2026", role: "ACCOUNTANT" },
  superadmin: { username: "aalian", password: "Test-Owner-Password-2026", role: "SUPERADMIN" },
} as const;

// scrypt hashing identical to src/lib/auth.ts (cannot import it here — next/headers)
import { randomBytes, scryptSync } from "crypto";
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

// ---------- tiny cookie-jar HTTP client ----------
class Jar {
  cookie = "";
  absorb(res: Response) {
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
  }
}
async function call(
  jar: Jar | null,
  method: string,
  p: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ res: Response; data: any }> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (jar?.cookie) headers.cookie = jar.cookie;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${p}`, { method, headers, body: payload, redirect: "manual" });
  if (jar) jar.absorb(res);
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
  return { res, data };
}

// ---------- shared state across the sequential workflow ----------
const admin = new Jar();
const dev = new Jar();
const acct = new Jar();
const owner = new Jar();
let server: ChildProcess | null = null;
let clientId = "";
let orderId = "";
let invoiceId = "";
let uploadedFileId = "";
let devUserId = "";
let acctUserId = "";
let superUserId = "";
let resetCode = "";

// 1×1 transparent PNG
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
// fake "executable" payload (MZ header) that claims to be image/png
const FAKE_EXE = Buffer.concat([Buffer.from("MZ\u0000\u0002"), Buffer.alloc(64, 0x41)]);

beforeAll(async () => {
  // 1. Local embedded PostgreSQL + fresh isolated test database
  const localPg = await import("../scripts/local-pg.mjs");
  await localPg.ensure();
  const testDbName = new URL(TEST_DB_URL).pathname.replace(/^\//, "");
  process.env.DATABASE_URL = TEST_DB_URL;
  {
    // Recreate the test database from scratch (DROP ... WITH (FORCE) kills
    // any leftover connections from a previous run).
    const { default: Embedded } = await import("embedded-postgres");
    const pg = new Embedded({
      databaseDir: path.join(ROOT, "db-pg-data"),
      user: localPg.PG.user,
      password: localPg.PG.password,
      port: localPg.PG.port,
      persistent: true,
    });
    const client = pg.getPgClient("postgres", localPg.PG.host);
    await client.connect();
    await client.query(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE)`).catch(() => {});
    await client.query(`CREATE DATABASE "${testDbName}"`);
    await client.end();
  }
  execFileSync("bunx", ["prisma", "db", "push", "--skip-generate"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // 2. Seed the three role accounts with fixed test passwords + settings
  const { PrismaClient } = await import("@prisma/client");
  const seedDb = new PrismaClient();
  try {
    await seedDb.businessSettings.create({
      data: {
        companyName: "AGS WEBWORKS (TEST)",
        vatEnabled: false,
        vatRate: 0,
        schedulerEnabled: true,
      },
    });
    for (const u of Object.values(TEST_USERS)) {
      const base = {
        username: u.username,
        email: `${u.username}@test.local`,
        name: u.username.charAt(0).toUpperCase() + u.username.slice(1),
        role: u.role,
        jobTitle: "Test",
        passwordHash: hashPassword(u.password),
        mustChangePassword: false,
      };
      const created = await seedDb.user.create({
        data: { ...base, hidden: u.role === "SUPERADMIN" },
      });
      if (u.role === "DEVELOPER") devUserId = created.id;
      if (u.role === "ACCOUNTANT") acctUserId = created.id;
      if (u.role === "SUPERADMIN") superUserId = created.id;
    }
  } finally {
    await seedDb.$disconnect();
  }

  // 3. Boot the production standalone server against the test DB
  if (!existsSync(SERVER_JS))
    throw new Error(`Standalone build missing at ${SERVER_JS} — run the build first (tests/run-api-tests.sh)`);

  // Pre-flight: refuse to run if a stale process is already listening on the
  // port (an orphaned server from a previous run would serve a dead database
  // and every session test would fail mysteriously).
  try {
    const probe = await fetch(`http://127.0.0.1:${PORT}/api/auth/me`, { signal: AbortSignal.timeout(1500) });
    throw new Error(
      `Port ${PORT} is already in use (HTTP ${probe.status}). Kill the stale server first: pkill -f "standalone/server.js"`,
    );
  } catch (e) {
    if ((e as Error).message.includes("already in use")) throw e;
    // connection refused = port free, continue
  }

  server = spawn("bun", [SERVER_JS], {
    cwd: path.dirname(SERVER_JS),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: TEST_DB_URL,
      SCHEDULER_KEY,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Always persist server output for post-failure diagnosis
  const { appendFileSync } = await import("fs");
  const srvLog = (label: string, d: unknown) => {
    try { appendFileSync("/tmp/test-server-output.log", `[${label}] ${String(d)}`); } catch {}
  };
  server.stdout!.on("data", (d) => srvLog("out", d));
  server.stderr!.on("data", (d) => srvLog("err", d));

  // Wait for readiness
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const r = await fetch(`${BASE}/api/auth/me`, { method: "GET" });
      if (r.status === 401 || r.status === 200) break;
    } catch {}
    if (Date.now() > deadline) throw new Error("Test server did not start within 30s");
    await new Promise((r) => setTimeout(r, 400));
  }
}, 120_000);

afterAll(async () => {
  if (server) {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 800));
    server.kill("SIGKILL");
  }
});

// ============================= TESTS =============================

describe("server & security headers", () => {
  test("login page responds with nosniff + frame-deny", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  }, 20_000);
});

describe("authentication", () => {
  test("wrong password is rejected uniformly", async () => {
    const { res } = await call(null, "POST", "/api/auth/login", {
      username: "sharjeel",
      password: "definitely-wrong",
    });
    expect(res.status).toBe(401);
  });

  test("unauthenticated /api/auth/me returns no user (session probe)", async () => {
    const { res, data } = await call(null, "GET", "/api/auth/me");
    expect(res.status).toBe(200); // probe endpoint; 200 + user:null when signed out
    expect(data.user).toBeNull();
  });

  test("all three roles can sign in", async () => {
    for (const [jar, u] of [
      [admin, TEST_USERS.admin],
      [dev, TEST_USERS.dev],
      [acct, TEST_USERS.acct],
    ] as const) {
      const { res, data } = await call(null, "POST", "/api/auth/login", {
        username: u.username,
        password: u.password,
      });
      expect(res.status).toBe(200);
      expect(data.user.role).toBe(u.role);
      jar.absorb(res);
      expect(jar.cookie).toContain("ags_session=");
    }
  });

  test("session cookie carries to /api/auth/me", async () => {
    const { res, data } = await call(admin, "GET", "/api/auth/me");
    expect(res.status).toBe(200);
    expect(data.user.username).toBe("sharjeel");
  });

  test("login brute-force is rate limited (429)", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const { res } = await call(null, "POST", "/api/auth/login", {
        username: "ratelimit-probe",
        password: "x".repeat(9),
      });
      last = res.status;
    }
    expect(last).toBe(429);
  }, 30_000);
});

describe("permission boundaries (server-enforced)", () => {
  test("developer cannot read payments", async () => {
    const { res } = await call(dev, "GET", "/api/payments");
    expect(res.status).toBe(403);
  });

  test("developer cannot read invoices", async () => {
    const { res } = await call(dev, "GET", "/api/invoices");
    expect(res.status).toBe(403);
  });

  test("developer cannot manage the team", async () => {
    const { res } = await call(dev, "POST", "/api/team", {
      name: "Sneaky Admin",
      username: "sneakyadmin",
      role: "ADMIN",
    });
    expect(res.status).toBe(403);
  });

  test("developer cannot read the audit log", async () => {
    const { res } = await call(dev, "GET", "/api/activity");
    expect(res.status).toBe(403);
  });

  test("accountant cannot approve expenses", async () => {
    const { res } = await call(acct, "POST", "/api/expenses/nonexistent/approve", {
      decision: "Approved",
    });
    expect(res.status).toBe(403);
  });

  test("developer cannot read another team member's attendance", async () => {
    const { res } = await call(dev, "GET", `/api/attendance?userId=${acctUserId}`);
    expect([403, 404]).toContain(res.status);
  });
});

describe("client → order → invoice → payment workflow (persistence)", () => {
  test("admin creates a client", async () => {
    const { res, data } = await call(admin, "POST", "/api/clients", {
      businessName: "Test Client Co.",
      contactPerson: "Test Person",
      city: "Dammam",
      quotedPrice: 7000,
      agreedPrice: 7000,
      status: "Won",
    });
    expect(res.status).toBe(201);
    expect(data.client.clientCode).toMatch(/^CL-\d{4}$/);
    clientId = data.client.id;
  });

  test("client search finds the created client", async () => {
    const { res, data } = await call(admin, "GET", "/api/clients?q=Test Client");
    expect(res.status).toBe(200);
    expect(data.clients.some((c: any) => c.id === clientId)).toBe(true);
  });

  test("developer cannot create clients", async () => {
    const { res } = await call(dev, "POST", "/api/clients", {
      businessName: "Dev Client",
    });
    expect(res.status).toBe(403);
  });

  test("admin creates an order linked to the client and assigns the developer", async () => {
    const { res, data } = await call(admin, "POST", "/api/orders", {
      clientId,
      serviceType: "Business Website Development",
      description: "Integration test order",
      agreedPrice: 7000,
      developerId: devUserId,
      priority: "High",
    });
    expect(res.status).toBe(201);
    expect(data.order.orderCode).toMatch(/^AGS-ORD-\d{4}$/);
    orderId = data.order.id;
  });

  test("order status transition is recorded in history", async () => {
    const { res } = await call(admin, "PUT", `/api/orders/${orderId}`, {
      status: "Delivered",
      statusNote: "Delivered to client",
    });
    expect(res.status).toBe(200);
    const { data } = await call(admin, "GET", `/api/orders/${orderId}`);
    expect(data.order.status).toBe("Delivered");
    expect(data.order.revisions.length).toBeGreaterThanOrEqual(1);
    expect(data.order.deliveredAt).toBeTruthy();
  });

  test("developer cannot set a business status (e.g. Payment Completed)", async () => {
    const { res } = await call(dev, "PUT", `/api/orders/${orderId}`, {
      status: "Payment Completed",
    });
    expect(res.status).toBe(403);
  });

  test("accountant creates an invoice with server-computed totals", async () => {
    const { res, data } = await call(acct, "POST", "/api/invoices", {
      clientId,
      orderId,
      items: [
        { description: "Website design", quantity: 1, unitPrice: 1000 },
        { description: "Development pages", quantity: 3, unitPrice: 2000 },
      ],
    });
    expect(res.status).toBe(201);
    expect(data.invoice.subtotal).toBe(7000);
    expect(data.invoice.total).toBe(7000);
    expect(data.invoice.items.length).toBe(2);
    invoiceId = data.invoice.id;
  });

  test("partial payment marks invoice Partially Paid", async () => {
    const { res } = await call(acct, "POST", "/api/payments", {
      clientId,
      orderId,
      invoiceId,
      amount: 3500,
      method: "Bank Transfer",
      reference: "TEST-TRF-1",
    });
    expect(res.status).toBe(201);
    const { data } = await call(acct, "GET", `/api/invoices/${invoiceId}`);
    expect(data.invoice.status).toBe("Partially Paid");
    expect(data.invoice.amountPaid).toBe(3500);
  });

  test("full payment marks invoice Paid and order Payment Completed", async () => {
    const { res } = await call(acct, "POST", "/api/payments", {
      clientId,
      orderId,
      invoiceId,
      amount: 3500,
      method: "Bank Transfer",
      reference: "TEST-TRF-2",
    });
    expect(res.status).toBe(201);
    const inv = await call(acct, "GET", `/api/invoices/${invoiceId}`);
    expect(inv.data.invoice.status).toBe("Paid");
    expect(inv.data.invoice.amountPaid).toBe(7000);
    const ord = await call(admin, "GET", `/api/orders/${orderId}`);
    expect(ord.data.order.status).toBe("Payment Completed");
  });

  test("expense requires CEO approval", async () => {
    const created = await call(acct, "POST", "/api/expenses", {
      category: "Hosting & Domain",
      description: "Test hosting",
      amount: 320,
      vendor: "TestHost",
    });
    expect(created.res.status).toBe(201);
    const expenseId = created.data.expense.id;

    const rejected = await call(acct, "POST", `/api/expenses/${expenseId}/approve`, {
      decision: "Approved",
    });
    expect(rejected.res.status).toBe(403);

    const approved = await call(admin, "POST", `/api/expenses/${expenseId}/approve`, {
      decision: "Approved",
    });
    expect(approved.res.status).toBe(200);
    expect(approved.data.expense.status).toBe("Approved");
  });
});

describe("file upload security (content-based validation)", () => {
  test("executable disguised as PNG is rejected", async () => {
    const fd = new FormData();
    fd.append("file", new File([FAKE_EXE], "malware.png", { type: "image/png" }));
    fd.append("category", "Project Document");
    const { res, data } = await call(acct, "POST", "/api/files", fd);
    expect(res.status).toBe(415);
    expect(String(data.error)).toContain("rejected");
  });

  test("missing content-type is rejected (no allowlist bypass)", async () => {
    const fd = new FormData();
    fd.append("file", new File([FAKE_EXE], "novirus.png", { type: "" }));
    const { res } = await call(acct, "POST", "/api/files", fd);
    expect(res.status).toBe(415);
  });

  test("genuine PNG uploads and downloads with nosniff", async () => {
    const fd = new FormData();
    fd.append("file", new File([PNG_1PX], "pixel.png", { type: "image/png" }));
    fd.append("clientId", clientId);
    const { res, data } = await call(acct, "POST", "/api/files", fd);
    expect(res.status).toBe(201);
    expect(data.file.mimeType).toBe("image/png");
    uploadedFileId = data.file.id;

    const dl = await call(acct, "GET", `/api/files/${uploadedFileId}/download`);
    expect(dl.res.status).toBe(200);
    expect(dl.res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(dl.res.headers.get("content-type")).toBe("image/png");
  });

  test("developer without assignment cannot download the file", async () => {
    const { res } = await call(dev, "GET", `/api/files/${uploadedFileId}/download`);
    expect(res.status).toBe(403);
  });

  test("downloading a nonexistent file is 404", async () => {
    const { res } = await call(acct, "GET", "/api/files/does-not-exist/download");
    expect(res.status).toBe(404);
  });
});

describe("attendance", () => {
  test("check-in, duplicate guard, check-out", async () => {
    const in1 = await call(dev, "POST", "/api/attendance/check-in");
    expect([200, 201]).toContain(in1.res.status);
    expect(["PRESENT", "LATE"]).toContain(in1.data.record.status);

    const dup = await call(dev, "POST", "/api/attendance/check-in");
    expect(dup.res.status).toBe(409);

    const out = await call(dev, "POST", "/api/attendance/check-out");
    expect(out.res.status).toBe(200);
  });
});

describe("team management", () => {
  test("admin creates a member with one-time password", async () => {
    const { res, data } = await call(admin, "POST", "/api/team", {
      name: "Test Member",
      username: "testmember",
      role: "DEVELOPER",
    });
    expect(res.status).toBe(201);
    expect(typeof data.tempPassword).toBe("string");

    const login = await call(null, "POST", "/api/auth/login", {
      username: "testmember",
      password: data.tempPassword,
    });
    expect(login.res.status).toBe(200);
    expect(login.data.user.mustChangePassword).toBe(true);
  });
});

describe("password reset codes", () => {
  test("admin generates a code; wrong code rejected; correct code works; code is single-use", async () => {
    const gen = await call(admin, "POST", "/api/auth/reset-password", {
      action: "generate",
      userId: acctUserId,
    });
    expect(gen.res.status).toBe(200);
    resetCode = gen.data.code;
    expect(resetCode).toMatch(/^[A-F0-9]{10}$/);

    const wrong = await call(null, "POST", "/api/auth/reset-password", {
      action: "confirm",
      username: "addan",
      code: "AAAAABBBBB",
      newPassword: "NewPassword-2026",
    });
    expect(wrong.res.status).toBe(400);

    const right = await call(null, "POST", "/api/auth/reset-password", {
      action: "confirm",
      username: "addan",
      code: resetCode,
      newPassword: "NewPassword-2026",
    });
    expect(right.res.status).toBe(200);

    // single-use: same code cannot be used again
    const reuse = await call(null, "POST", "/api/auth/reset-password", {
      action: "confirm",
      username: "addan",
      code: resetCode,
      newPassword: "Another-Password-2026",
    });
    expect(reuse.res.status).toBe(400);

    // new password works
    const relogin = await call(null, "POST", "/api/auth/login", {
      username: "addan",
      password: "NewPassword-2026",
    });
    expect(relogin.res.status).toBe(200);
  });
});

describe("hidden oversight account (SUPERADMIN)", () => {
  test("admin does not see the hidden account in the team list", async () => {
    const { res, data } = await call(admin, "GET", "/api/team");
    expect(res.status).toBe(200);
    const names = data.users.map((u: any) => u.username);
    expect(names).not.toContain("aalian");
    expect(names).toContain("sharjeel");
  });

  test("hidden account can sign in and sees itself in the team list", async () => {
    const login = await call(owner, "POST", "/api/auth/login", {
      username: "aalian",
      password: "Test-Owner-Password-2026",
    });
    expect(login.res.status).toBe(200);
    expect(login.data.user.role).toBe("SUPERADMIN");

    const { res, data } = await call(owner, "GET", "/api/team");
    expect(res.status).toBe(200);
    const names = data.users.map((u: any) => u.username);
    expect(names).toContain("aalian");
    expect(data.canManage).toBe(true);
  });

  test("hidden account activity is filtered from the admin's activity feed", async () => {
    // owner performs an action that is logged (sign-in already was)
    const { res, data } = await call(admin, "GET", "/api/activity?limit=100");
    expect(res.status).toBe(200);
    const summaries = data.logs.map((l: any) => String(l.summary)).join(" | ");
    expect(summaries).not.toContain("aalian");
    expect(summaries).not.toContain("Aalian");
    // owner sees own activity
    const own = await call(owner, "GET", "/api/activity?limit=100");
    expect(own.res.status).toBe(200);
    expect(String(own.data.logs[0].summary)).toContain("Aalian");
  });

  test("hidden account is absent from attendance members", async () => {
    const { res, data } = await call(admin, "GET", "/api/attendance");
    expect(res.status).toBe(200);
    const ids = data.members.map((m: any) => m.id);
    expect(ids).not.toContain(superUserId);
  });

  test("oversight role can directly set any member's password", async () => {
    const set = await call(owner, "POST", "/api/auth/reset-password", {
      action: "admin-set",
      userId: devUserId,
      newPassword: "Owner-Set-Pwd-2026",
    });
    expect(set.res.status).toBe(200);
    // new password works — and restore the dev session for later tests
    const relogin = await call(dev, "POST", "/api/auth/login", {
      username: "gufran",
      password: "Owner-Set-Pwd-2026",
    });
    expect(relogin.res.status).toBe(200);
  });

  test("admin cannot use admin-set (oversight only)", async () => {
    const set = await call(admin, "POST", "/api/auth/reset-password", {
      action: "admin-set",
      userId: devUserId,
      newPassword: "Admin-Set-Pwd-2026",
    });
    expect(set.res.status).toBe(403);
  });

  test("admin cannot modify or generate codes for the hidden account", async () => {
    const edit = await call(admin, "PUT", "/api/team", {
      userId: superUserId,
      jobTitle: "Hacked",
    });
    expect(edit.res.status).toBe(404);
    const code = await call(admin, "POST", "/api/auth/reset-password", {
      action: "generate",
      userId: superUserId,
    });
    expect(code.res.status).toBe(404);
  });

  test("oversight role can generate a reset code for members", async () => {
    const gen = await call(owner, "POST", "/api/auth/reset-password", {
      action: "generate",
      userId: acctUserId,
    });
    expect(gen.res.status).toBe(200);
    expect(String(gen.data.code)).toMatch(/^[A-F0-9]{10}$/);
  });
});

describe("maintenance scheduler", () => {
  test("developer session cannot trigger the scheduler", async () => {
    const { res } = await call(dev, "POST", "/api/maintenance/scheduler/run");
    expect(res.status).toBe(403);
  });

  test("scheduler key header authorizes cron invocation", async () => {
    const { res, data } = await call(null, "POST", "/api/maintenance/scheduler/run", undefined, {
      "x-scheduler-key": SCHEDULER_KEY,
    });
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
  });

  test("wrong scheduler key is rejected", async () => {
    const { res } = await call(null, "POST", "/api/maintenance/scheduler/run", undefined, {
      "x-scheduler-key": "wrong-key",
    });
    expect(res.status).toBe(401);
  });
});

describe("error hygiene", () => {
  test("API 404s return JSON error objects", async () => {
    const { res, data } = await call(admin, "GET", "/api/orders/nonexistent-id");
    expect(res.status).toBe(404);
    expect(typeof data.error).toBe("string");
    expect(String(data.error)).not.toContain("Prisma");
    expect(String(data.error)).not.toContain("at ");
  });
});
