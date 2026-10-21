// AGS WEBWORKS — shared server helpers: audit logging, notifications, ID codes

import { db } from "@/lib/db";

// ---------- Audit log ----------

export async function logActivity(opts: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  details?: unknown;
}) {
  await db.activityLog.create({
    data: {
      userId: opts.userId ?? null,
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId ?? null,
      summary: opts.summary,
      details: opts.details ? JSON.stringify(opts.details, null, 2) : null,
    },
  });
}

// ---------- Notifications ----------

export async function notify(opts: {
  userId: string;
  title: string;
  body?: string;
  type?: string;
  link?: string;
}) {
  await db.notification.create({
    data: {
      userId: opts.userId,
      title: opts.title,
      body: opts.body,
      type: opts.type ?? "info",
      link: opts.link,
    },
  });
}

export async function notifyRole(
  role: string,
  opts: { title: string; body?: string; type?: string; link?: string },
) {
  const users = await db.user.findMany({
    where: { role, isActive: true },
    select: { id: true },
  });
  for (const u of users) await notify({ userId: u.id, ...opts });
}

// ---------- Sequential business codes (CL-0001, AGS-ORD-0001, ...) ----------
//
// Codes are derived from the HIGHEST existing sequence number for the prefix
// (not from row counts) so that deleting a record never causes a collision,
// and creation retries on the unique constraint to stay safe under races.

type CodeEntity =
  | "client"
  | "order"
  | "task"
  | "payment"
  | "invoice"
  | "expense"
  | "msub"
  | "minvoice"
  | "ticket";

const CODE_TABLE: Record<
  CodeEntity,
  { prefix: string; yearly: boolean; column: string; table: string }
> = {
  client: {
    prefix: "CL",
    yearly: false,
    column: "clientCode",
    table: "Client",
  },
  order: {
    prefix: "AGS-ORD",
    yearly: false,
    column: "orderCode",
    table: "Order",
  },
  task: { prefix: "TASK", yearly: false, column: "taskCode", table: "Task" },
  payment: {
    prefix: "PAY",
    yearly: false,
    column: "paymentCode",
    table: "Payment",
  },
  invoice: {
    prefix: "INV",
    yearly: true,
    column: "invoiceCode",
    table: "Invoice",
  },
  expense: {
    prefix: "EXP",
    yearly: false,
    column: "expenseCode",
    table: "Expense",
  },
  msub: {
    prefix: "MSUB",
    yearly: false,
    column: "subscriptionCode",
    table: "MaintenanceSubscription",
  },
  minvoice: {
    prefix: "MNT",
    yearly: true,
    column: "invoiceCode",
    table: "MaintenanceInvoice",
  },
  ticket: {
    prefix: "MT",
    yearly: false,
    column: "ticketCode",
    table: "MaintenanceTicket",
  },
};

function seqOf(code: string, prefix: string): number {
  // "AGS-ORD-0007" -> 7 ; "INV-2026-0004" -> 4 ; unparsable -> 0
  if (!code.startsWith(prefix + "-")) return 0;
  const tail = code.slice(prefix.length + 1);
  const parts = tail.split("-");
  const n = Number.parseInt(parts[parts.length - 1] ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

async function nextCode(entity: CodeEntity): Promise<string> {
  const spec = CODE_TABLE[entity];
   
  const model = (db as any)[spec.table];
  if (!model) throw new Error(`Unknown code table ${spec.table}`);
  const rows = await model.findMany({ select: { [spec.column]: true } });
  const year = new Date().getFullYear();
  let max = 0;
  for (const r of rows) {
    const code: string = r[spec.column] ?? "";
    // Yearly codes (INV-2026-0004) sequence within the current year's suffix space;
    // non-yearly codes (CL-0001) sequence across the whole prefix.
    const n = spec.yearly
      ? seqOf(code, `${spec.prefix}-${year}`)
      : seqOf(code, spec.prefix);
    if (n > max) max = n;
  }
  const seq = String(max + 1).padStart(4, "0");
  return spec.yearly
    ? `${spec.prefix}-${year}-${seq}`
    : `${spec.prefix}-${seq}`;
}

/** Generate the next sequential business code for an entity (collision-free after deletions). */
export async function generateCode(entity: CodeEntity): Promise<string> {
  return nextCode(entity);
}

/**
 * Wrap a create operation with duplicate-code retry: if a concurrent request grabbed
 * the same code (unique constraint P2002 on the code column), regenerate and retry.
 */
export async function withCodeRetry<T>(
  entity: CodeEntity,
  codeField: string,
  create: (code: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = await generateCode(entity);
    try {
      return await create(code);
    } catch (err) {
       
      const prismaErr = err as any;
      const target = prismaErr?.meta?.target;
      const hitCodeField =
        prismaErr?.code === "P2002" &&
        (typeof target === "string"
          ? target.toLowerCase().includes(codeField.toLowerCase())
          : Array.isArray(target) &&
            target.some(
              (t) => String(t).toLowerCase() === codeField.toLowerCase(),
            ));
      if (hitCodeField && attempt < 5) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Code generation retry exhausted");
}

// ---------- Date helpers (Asia/Riyadh aware on the client, UTC-safe on server) ----------

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Handle months with fewer days than the original billing day (e.g. Jan 31 -> Feb 28)
  if (d.getDate() < day) d.setDate(0);
  return d;
}

export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

// ---------- Asia/Riyadh (UTC+3, no DST) helpers for attendance ----------

export const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** "YYYY-MM-DD" for the current moment in Asia/Riyadh. */
export function riyadhToday(): string {
  return new Date(Date.now() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** Minutes since local midnight in Asia/Riyadh for the given instant. */
export function riyadhMinutesOfDay(d: Date = new Date()): number {
  const t = new Date(d.getTime() + RIYADH_OFFSET_MS);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

/** Add whole days to a "YYYY-MM-DD" string, returning "YYYY-MM-DD". */
export function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const ATTENDANCE_STATUSES = [
  "PRESENT",
  "LATE",
  "ABSENT",
  "LEAVE",
  "HALF_DAY",
] as const;

// ---------- Validation ----------

export function parseFloatSafe(
  v: unknown,
  fallback: number | null = null,
): number | null {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function parseDateSafe(v: unknown): Date | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Like parseDateSafe, but a date-only value ("YYYY-MM-DD") is treated as the END
 * of that day (23:59:59.999) so range filters include records created that day.
 * Date-only strings parse as UTC midnight, which would otherwise exclude the
 * whole final day of a range.
 */
export function parseDateEndOfDaySafe(v: unknown): Date | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
    return new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1);
  }
  return d;
}

export function sanitize(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
