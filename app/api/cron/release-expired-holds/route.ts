import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Invoked by Vercel Cron (see vercel.json) — release_expired_holds()
// existed since Fase 0 but nothing called it until now. Vercel signs
// cron requests with `Authorization: Bearer ${CRON_SECRET}`; reject
// anything else so this endpoint can't be used to spam DB writes.
//
// release_expired_holds() already released holds AND expired their
// 'pending' orders atomically in one transaction (migration 0005) —
// it just used to discard the orders-expired count, so this endpoint
// could only ever report one of the two numbers it changed. Fixed in
// migration 0009 to return both. Also purges old rate_limit_hits
// rows here (migration 0009) — an unrelated concern to the hold/order
// cleanup, so it's a second RPC call rather than forced into the same
// transaction, but run from the same schedule so the table doesn't
// grow unbounded.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();

  const [holdsResult, purgeResult] = await Promise.all([
    admin.rpc("release_expired_holds"),
    admin.rpc("purge_rate_limit_hits"),
  ]);

  if (holdsResult.error) {
    console.error("[cron] release_expired_holds failed:", holdsResult.error.message);
    return NextResponse.json({ error: holdsResult.error.message }, { status: 500 });
  }
  if (purgeResult.error) {
    // Non-fatal: the hold/order cleanup above already succeeded and
    // matters far more than sweeping old rate-limit rows a bit late.
    console.error("[cron] purge_rate_limit_hits failed:", purgeResult.error.message);
  }

  return NextResponse.json({
    seatsReleased: holdsResult.data?.seats_released ?? 0,
    ordersExpired: holdsResult.data?.orders_expired ?? 0,
    rateLimitRowsPurged: purgeResult.data ?? 0,
  });
}
