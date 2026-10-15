"use server";

import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrderDetail } from "@/lib/queries";
import type { Order } from "@/lib/database.types";

export type ValidateStatus =
  | "valid"
  | "used"
  | "not_paid"
  | "cancelled"
  | "wrong_date"
  | "invalid"
  // Lookup/network failure: says nothing about the ticket itself, so
  // the door must retry instead of turning someone away.
  | "error";

export type ValidateResult = {
  status: ValidateStatus;
  customerName?: string;
  showName?: string;
  showDate?: string;
  seats?: string;
  code?: string;
  usedAt?: string | null;
};

// A ticket counts as "for today" within this window around the show
// start — wide enough for early arrivals and late shows past midnight.
const SHOW_WINDOW_MS = 12 * 60 * 60 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Accepts either a raw qr_token or the full ticket URL.
function extractToken(raw: string): string {
  const trimmed = raw.trim();
  const marker = "/tickets/";
  const idx = trimmed.indexOf(marker);
  if (idx >= 0) {
    return trimmed.slice(idx + marker.length).split(/[/?#]/)[0];
  }
  return trimmed;
}

// The short "Código: XXXXXXXX" shown in the confirmation email/
// WhatsApp message (orderCode() — always the first 8 hex chars of the
// order id, no dashes). A qr_token is a full uuid (36 chars, with
// dashes), so length alone tells the two apart.
const SHORT_CODE_RE = /^[0-9a-f]{6,8}$/i;

class LookupError extends Error {}

// Order id for a scanned/typed value, null when nothing matches.
// Throws LookupError when the database couldn't answer — a failed
// query must never read as "ticket not found".
async function findOrderId(token: string): Promise<string | null> {
  const admin = createAdminClient();

  if (UUID_RE.test(token)) {
    const { data, error } = await admin
      .from("orders")
      .select("id")
      .eq("qr_token", token)
      .maybeSingle();
    if (error) throw new LookupError(error.message);
    if (data) return data.id;
  }

  // Fallback for when the QR itself can't be scanned (bad light, dead
  // camera, blurry screenshot): let the admin type the short order
  // code instead, via find_order_by_code (migration 0015).
  if (SHORT_CODE_RE.test(token)) {
    const { data, error } = await admin.rpc("find_order_by_code", {
      p_code: token,
    });
    if (error) throw new LookupError(error.message);
    // A miss comes back as a composite row with every field null
    // (plpgsql `return null` on a table-typed function), not a bare
    // null — check the id itself, not just object truthiness.
    if (data?.id) return (data as Order).id;
  }

  return null;
}

export async function validateTicket(
  raw: string,
  // Set by the door after a wrong_date warning: admit anyway.
  opts: { ignoreDate?: boolean } = {},
): Promise<ValidateResult> {
  const user = await requireUser();
  const token = extractToken(raw);
  if (!token) return { status: "invalid" };

  let orderId: string | null;
  try {
    orderId = await findOrderId(token);
  } catch {
    return { status: "error" };
  }
  if (!orderId) return { status: "invalid" };

  const detail = await getOrderDetail(orderId);
  if (!detail) return { status: "error" };

  const { order, show, seats } = detail;
  const base = {
    customerName: order.customer_name,
    showName: show?.name,
    showDate: show?.date,
    seats: String(seats.length || order.seat_ids.length),
    code: order.id.slice(0, 8).toUpperCase(),
  };

  if (order.status === "cancelled" || order.status === "rejected" || order.status === "expired") {
    return { status: "cancelled", ...base };
  }
  if (order.status !== "verified") return { status: "not_paid", ...base };

  // Already scanned: say so before the date check, so a re-scan of a
  // used ticket never offers "admit anyway".
  if (order.used_at) return { status: "used", ...base, usedAt: order.used_at };

  if (
    !opts.ignoreDate &&
    show &&
    Math.abs(Date.now() - new Date(show.date).getTime()) > SHOW_WINDOW_MS
  ) {
    return { status: "wrong_date", ...base };
  }

  // Atomic first-use: only the update that flips a null used_at wins.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .update({ used_at: new Date().toISOString(), validated_by: user.id })
    .eq("id", order.id)
    .is("used_at", null)
    .select("id");

  if (error) return { status: "error", ...base };
  if (data && data.length > 0) return { status: "valid", ...base };

  // Lost the race to another door phone: report when it was used.
  const { data: fresh } = await admin
    .from("orders")
    .select("used_at")
    .eq("id", order.id)
    .maybeSingle();
  return { status: "used", ...base, usedAt: fresh?.used_at ?? null };
}
