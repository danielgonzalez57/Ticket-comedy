import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { qrPngBuffer, ticketUrl } from "@/lib/qr";
import { sendTicketEmail } from "@/lib/email";
import { whatsappUrl, normalizeVePhone, orderCode } from "@/lib/whatsapp";
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
// returns a prefilled WhatsApp link.
//
// Shared by the admin's "Confirmar pago" (verifiedBy = the admin) and
// the automatic Binance check (verifiedBy = null, i.e. the system).
// Callers are responsible for authorization.
export async function verifyOrder(
  orderId: string,
  verifiedBy: string | null,
): Promise<ConfirmResult> {
  const admin = createAdminClient();

  const { data: confirmed, error: confirmErr } = await admin.rpc(
    "verify_payment_atomic",
    { p_order_id: orderId, p_verified_by: verifiedBy },
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
  revalidatePath(`/orders/${orderId}`);

  return { ok: true, emailSent, whatsappUrl: wa };
}
