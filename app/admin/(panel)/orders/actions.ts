"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { qrPngBuffer } from "@/lib/qr";
import { sendTicketEmail, sendRejectionEmail } from "@/lib/email";
import { whatsappUrl, normalizeVePhone, orderCode } from "@/lib/whatsapp";
import { ticketUrl } from "@/lib/qr";
import { formatDate } from "@/lib/format";
import type { Order, Seat, Show } from "@/lib/database.types";

export type ConfirmResult = {
  ok: boolean;
  error?: string;
  emailSent?: boolean;
  whatsappUrl?: string;
  seatsLost?: boolean;
};

function seatsLostMessage(msg: string): string | null {
  const lost = msg.match(/SEATS_LOST:\s*(.+)/)?.[1]?.trim();
  if (!lost) return null;
  return `No se pudo confirmar: el/los asiento(s) ${lost} ya no están reservados para esta orden (probablemente se revendieron por vencimiento del hold). Reasígnale otro asiento o recházala abajo.`;
}

// Verifies a pending/reported order: atomically checks its seats are
// still held by this order (via verify_payment_atomic — see
// supabase/migrations/0001_seat_hold_ownership.sql and 0005), marks
// them sold and the order verified, sends the ticket email, and
// returns a prefilled WhatsApp link for the admin.
export async function confirmPayment(orderId: string): Promise<ConfirmResult> {
  const user = await requireUser();
  const admin = createAdminClient();

  const { data: confirmed, error: confirmErr } = await admin.rpc(
    "verify_payment_atomic",
    { p_order_id: orderId, p_verified_by: user.id },
  );

  if (confirmErr || !confirmed) {
    const msg = confirmErr?.message ?? "";
    const lostMessage = seatsLostMessage(msg);
    if (lostMessage) return { ok: false, error: lostMessage, seatsLost: true };
    if (msg.includes("ORDER_CANCELLED")) {
      return { ok: false, error: "La orden está cancelada." };
    }
    if (msg.includes("ORDER_REJECTED")) {
      return { ok: false, error: "La orden fue rechazada." };
    }
    if (msg.includes("ORDER_EXPIRED")) {
      return { ok: false, error: "La orden venció." };
    }
    if (msg.includes("ORDER_NOT_FOUND")) {
      return { ok: false, error: "No se encontró la orden." };
    }
    if (msg.includes("MUST_REPORT_FIRST")) {
      return {
        ok: false,
        error:
          "Este método de pago requiere conciliación: la orden debe pasar por 'reportado' (con banco y referencia) antes de poder confirmarse.",
      };
    }
    if (msg.includes("NEEDS_REVIEW")) {
      return {
        ok: false,
        error:
          "Esta orden tiene un conflicto de referencia sin resolver. Resuélvelo (abajo) antes de confirmar el pago.",
      };
    }
    return { ok: false, error: "No se pudo confirmar el pago." };
  }

  const order = confirmed as Order;

  // Load show + seats for the email / message.
  const [{ data: show }, { data: seats }] = await Promise.all([
    admin.from("shows").select("*").eq("id", order.show_id).single(),
    admin.from("seats").select("*").in("id", order.seat_ids),
  ]);

  let emailSent = false;
  if (show) {
    const qrPng = await qrPngBuffer(order.qr_token);
    emailSent = await sendTicketEmail({
      order,
      show: show as Show,
      seats: (seats ?? []) as Seat[],
      qrPng,
    });
  }

  const seatLabels = ((seats ?? []) as Seat[]).map((s) => s.label).join(", ");
  const message = show
    ? `¡Hola ${order.customer_name}! Tu pago para *${(show as Show).name}* fue confirmado ✅\n\n` +
      `📅 ${formatDate((show as Show).date)}\n📍 ${(show as Show).venue}\n` +
      `🎟️ Asiento(s): ${seatLabels}\nCódigo: ${orderCode(order.id)}\n\n` +
      `Tu entrada: ${ticketUrl(order.qr_token)}`
    : `¡Hola ${order.customer_name}! Tu pago fue confirmado. Tu entrada: ${ticketUrl(order.qr_token)}`;

  const wa = whatsappUrl(normalizeVePhone(order.customer_phone), message);

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");

  return { ok: true, emailSent, whatsappUrl: wa };
}

// Rejects a pending/reported order with a mandatory reason (via
// reject_payment_atomic — supabase/migrations/0005_order_lifecycle.sql).
// Releases any seats the order still holds, and auto-sends a
// rejection email with the reason (Fase 2: previously only
// confirmation was auto-notified) in addition to the manual WhatsApp
// link the admin can also send.
export async function rejectPayment(
  orderId: string,
  reason: string,
): Promise<ConfirmResult> {
  const user = await requireUser();
  const admin = createAdminClient();

  const { data: rejected, error: rejectErr } = await admin.rpc(
    "reject_payment_atomic",
    { p_order_id: orderId, p_verified_by: user.id, p_reason: reason },
  );

  if (rejectErr || !rejected) {
    const msg = rejectErr?.message ?? "";
    if (msg.includes("REASON_REQUIRED")) {
      return { ok: false, error: "El motivo del rechazo es obligatorio." };
    }
    if (msg.includes("INVALID_STATUS")) {
      return { ok: false, error: "Esta orden ya no se puede rechazar." };
    }
    if (msg.includes("ORDER_NOT_FOUND")) {
      return { ok: false, error: "No se encontró la orden." };
    }
    return { ok: false, error: "No se pudo rechazar la orden." };
  }

  const order = rejected as Order;
  const { data: show } = await admin
    .from("shows")
    .select("*")
    .eq("id", order.show_id)
    .single();

  const emailSent = await sendRejectionEmail({
    order,
    show: (show as Show) ?? null,
    reason,
  });

  const message =
    `Hola ${order.customer_name}, sobre tu orden ${orderCode(order.id)} en Pinto & Aparte: ` +
    `no pudimos verificar tu pago (${reason}). Escríbenos si crees que es un error.`;
  const wa = whatsappUrl(normalizeVePhone(order.customer_phone), message);

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");

  return { ok: true, emailSent, whatsappUrl: wa };
}

// Moves a SEATS_LOST order onto a different, currently-available set
// of seats on the same show (via reassign_order_seats). Seats are
// given as labels (e.g. "A1, A2") since the admin panel doesn't have
// an interactive seat picker yet — resolved to ids here.
export async function reassignOrderSeats(
  orderId: string,
  seatLabelsRaw: string,
  note?: string,
): Promise<ConfirmResult> {
  await requireUser();
  const admin = createAdminClient();

  const labels = seatLabelsRaw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (labels.length === 0) {
    return { ok: false, error: "Indica al menos un asiento (ej: A1, A2)." };
  }

  const { data: orderRow } = await admin
    .from("orders")
    .select("show_id")
    .eq("id", orderId)
    .single();
  if (!orderRow) return { ok: false, error: "No se encontró la orden." };

  const { data: seats } = await admin
    .from("seats")
    .select("id, label")
    .eq("show_id", orderRow.show_id)
    .in("label", labels);

  const found = (seats ?? []) as Pick<Seat, "id" | "label">[];
  const missing = labels.filter(
    (l) => !found.some((s) => s.label.toUpperCase() === l),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Asiento(s) no encontrados en este show: ${missing.join(", ")}.`,
    };
  }

  const { error } = await admin.rpc("reassign_order_seats", {
    p_order_id: orderId,
    p_new_seat_ids: found.map((s) => s.id),
    p_note: note?.trim() || null,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("SEAT_UNAVAILABLE")) {
      return { ok: false, error: "Uno o más de esos asientos ya no están libres." };
    }
    if (msg.includes("PRICE_INCREASE")) {
      return {
        ok: false,
        error:
          "Esos asientos cuestan más que los originales; no se puede reasignar sin un pago adicional.",
      };
    }
    if (msg.includes("MAX_4_SEATS")) {
      return { ok: false, error: "Máximo 4 asientos por orden." };
    }
    if (msg.includes("INVALID_STATUS")) {
      return { ok: false, error: "Esta orden ya no se puede reasignar." };
    }
    return { ok: false, error: "No se pudo reasignar los asientos." };
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return { ok: true };
}

export async function cancelOrder(orderId: string): Promise<ConfirmResult> {
  await requireUser();
  const admin = createAdminClient();

  const { data: orderRow } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (!orderRow) return { ok: false, error: "No se encontró la orden." };
  const order = orderRow as Order;

  // Release any held seats that still belong to this order (not ones
  // that already moved on to a different order after this hold
  // expired — same held_by_order_id guard as verify_payment_atomic).
  await admin
    .from("seats")
    .update({ status: "available", hold_expires_at: null, held_by_order_id: null })
    .in("id", order.seat_ids)
    .eq("status", "held")
    .eq("held_by_order_id", orderId);

  const { error } = await admin
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId);
  if (error) return { ok: false, error: "No se pudo cancelar la orden." };

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return { ok: true };
}

export async function saveAdminNote(orderId: string, note: string) {
  await requireUser();
  const admin = createAdminClient();
  await admin
    .from("orders")
    .update({ admin_note: note.trim() || null })
    .eq("id", orderId);
  revalidatePath(`/admin/orders/${orderId}`);
}

// Resolves a needs_review reference collision via
// resolve_payment_reference_conflict (see
// supabase/migrations/0003_payment_reference_integrity.sql). This is
// the only supported way to clear needs_review — it always leaves at
// most one live order holding the reference, so it can't itself
// raise a raw unique_violation.
export async function resolvePaymentConflict(
  orderId: string,
  keepThis: boolean,
  note?: string,
): Promise<ConfirmResult> {
  await requireUser();
  const admin = createAdminClient();

  const { error } = await admin.rpc("resolve_payment_reference_conflict", {
    p_order_id: orderId,
    p_keep_this: keepThis,
    p_note: note?.trim() || null,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("NOT_FLAGGED")) {
      return { ok: false, error: "Esta orden no tiene un conflicto pendiente." };
    }
    if (msg.includes("ORDER_NOT_FOUND")) {
      return { ok: false, error: "No se encontró la orden." };
    }
    return { ok: false, error: "No se pudo resolver el conflicto." };
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return { ok: true };
}
