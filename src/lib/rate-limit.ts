// AGS WEBWORKS — simple in-memory rate limiter (per process)
// Protects auth endpoints against brute-force attempts. Suitable for a small
// team server; for multi-instance deployments move this to shared storage.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Periodic sweep so the map never grows unbounded
const SWEEP_INTERVAL_MS = 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k);
  }
}

/**
 * Consume one token from the bucket identified by `key`.
 * @param key      stable identifier (e.g. "login:1.2.3.4:sharjeel")
 * @param limit    max attempts allowed inside the window
 * @param windowMs window length in milliseconds
 * @returns ok=false when the limit is exceeded, with retryAfterSec for the client
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number; remaining: number } {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0, remaining: limit - 1 };
  }
  if (b.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
      remaining: 0,
    };
  }
  b.count++;
  return { ok: true, retryAfterSec: 0, remaining: limit - b.count };
}

/** Best-effort client IP from proxy headers (this app sits behind a gateway). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
