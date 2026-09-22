"use server";

import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrderByToken, getOrderDetail } from "@/lib/queries";
import type { Order } from "@/lib/database.types";

export type ValidateStatus =
  | "valid"
  | "used"
  | "not_paid"
  | "cancelled"
  | "invalid";

export type ValidateResult = {
  status: ValidateStatus;
  customerName?: string;
  showName?: string;
  seats?: string;
  code?: string;
  usedAt?: string | null;
};

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

export async function validateTicket(raw: string): Promise<ValidateResult> {
  const user = await requireUser();
  const token = extractToken(raw);
  if (!token) return { status: "invalid" };

  let detail = await getOrderByToken(token);

  // Fallback for when the QR itself can't be scanned (bad light, dead
  // camera, blurry screenshot): let the admin type the short order
  // code instead, via find_order_by_code (migration 0015).
  if (!detail && SHORT_CODE_RE.test(token)) {
    const admin = createAdminClient();
    const { data: byCode } = await admin.rpc("find_order_by_code", {
      p_code: token,
    });
    // A miss comes back as a composite row with every field null
    // (plpgsql `return null` on a table-typed function), not a bare
    // null — check the id itself, not just object truthiness.
    if (byCode?.id) detail = await getOrderDetail((byCode as Order).id);
  }

  if (!detail) return { status: "invalid" };

  const { order, show, seats } = detail;
  const base = {
    customerName: order.customer_name,
    showName: show?.name,
    seats: seats.map((s) => s.label).join(", "),
    code: order.id.slice(0, 8).toUpperCase(),
  };

  if (order.status === "cancelled" || order.status === "rejected" || order.status === "expired") {
    return { status: "cancelled", ...base };
  }
  if (order.status !== "verified") return { status: "not_paid", ...base };

  // Atomic first-use: only the update that flips a null used_at wins.
  const admin = createAdminClient();
  const { data } = await admin
    .from("orders")
    .update({ used_at: new Date().toISOString(), validated_by: user.id })
    .eq("id", order.id)
    .is("used_at", null)
    .select("id");

  if (data && data.length > 0) {
    return { status: "valid", ...base };
  }
  return { status: "used", ...base, usedAt: order.used_at };
}
