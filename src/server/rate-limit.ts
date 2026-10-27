// Fixed-window, in-memory rate limiter for public endpoints (ADR-012). Fine for one app instance, like
// the sign-in limit (ADR-009); it moves to the database or Redis if the app is scaled out.

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Counts one request for `key`; returns false once more than `limit` arrive within `windowMs`. */
export function allowRequest(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    }
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}
