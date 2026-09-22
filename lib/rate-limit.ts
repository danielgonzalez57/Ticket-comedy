import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Best-effort client IP for a server action. Vercel sets
// x-forwarded-for; falls back to x-real-ip, then "unknown" (which
// still rate-limits, just as one shared bucket for all such callers).
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

// Wraps check_rate_limit() (supabase/migrations/0008_rate_limiting.sql).
//
// `onFailure` decides what happens if the check itself can't run
// (e.g. the rate_limit_hits table is unreachable) — this is not a
// style knob, it's a real trade-off per call site:
//   - "open"   (allow through): appropriate for createOrder — a
//     broken limiter should not be able to take down checkout
//     entirely. It's a throttle, not the last line of defense against
//     overselling (that's the DB locks/atomic RPCs elsewhere).
//   - "closed" (block): appropriate for reportPayment — that endpoint
//     writes financial reconciliation data and uploads files to
//     Storage. If the limiter is down, refusing new reports for a
//     few minutes is a far smaller problem than leaving that endpoint
//     unthrottled.
export async function checkRateLimit(
  key: string,
  maxCount: number,
  windowSeconds: number,
  onFailure: "open" | "closed",
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_key: key,
    p_max_count: maxCount,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    const allow = onFailure === "open";
    console.error(
      `[rate-limit] check failed, failing ${onFailure} (${allow ? "allowing" : "blocking"}):`,
      error.message,
    );
    return allow;
  }
  return data === true;
}
