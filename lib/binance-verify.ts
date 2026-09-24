import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { findBinancePayment, type BinanceCheck } from "@/lib/binance";
import { verifyOrder, type ConfirmResult } from "@/lib/confirm-order";

export type AutoVerifyResult = {
  check: BinanceCheck | { status: "skipped"; reason: string };
  confirm?: ConfirmResult;
};

// Confirms a reported Binance order on its own when its Binance Pay
// order ID shows up in the receiving account's history as USDT for at
// least the order total. Anything else (not found yet, wrong amount,
// Binance unreachable) leaves the order 'reported' for the admin —
// this never rejects.
export async function autoVerifyBinanceOrder(orderId: string): Promise<AutoVerifyResult> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, status, payment_method, payment_ref, total_usd, created_at, needs_review, admin_note")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { check: { status: "skipped", reason: "Orden no encontrada." } };
  if (order.payment_method !== "binance") {
    return { check: { status: "skipped", reason: "No es un pago por Binance." } };
  }
  if (order.status !== "reported") {
    return { check: { status: "skipped", reason: "La orden no está en 'pago reportado'." } };
  }
  if (order.needs_review) {
    return { check: { status: "skipped", reason: "La orden tiene un conflicto de referencia." } };
  }
  if (!order.payment_ref) {
    return { check: { status: "skipped", reason: "La orden no tiene Order ID." } };
  }

  const check = await findBinancePayment({
    reference: order.payment_ref,
    expectedUsd: Number(order.total_usd),
    orderCreatedAt: order.created_at,
  });
  if (check.status !== "match") return { check };

  const confirm = await verifyOrder(orderId, null);
  if (confirm.ok && !order.admin_note) {
    await admin
      .from("orders")
      .update({
        admin_note: `Confirmado automáticamente: Binance Pay ${check.transactionId} · ${check.amount.toFixed(2)} ${check.currency}`,
      })
      .eq("id", orderId);
  }
  return { check, confirm };
}

// Human-readable outcome for the admin panel.
export function describeAutoVerify(result: AutoVerifyResult): { ok: boolean; message: string } {
  const { check, confirm } = result;
  switch (check.status) {
    case "match":
      return confirm?.ok
        ? {
            ok: true,
            message: `Pago encontrado en Binance (${check.amount.toFixed(2)} ${check.currency}). Entrada confirmada${confirm.emailSent ? " y correo enviado" : ""}.`,
          }
        : { ok: false, message: confirm?.error ?? "El pago está en Binance pero no se pudo confirmar la orden." };
    case "not_found":
      return {
        ok: false,
        message: "Ese Order ID todavía no aparece en el historial de Binance Pay. Revisa de nuevo en unos minutos o verifica a mano.",
      };
    case "amount_mismatch":
      return {
        ok: false,
        message: `El pago existe pero no cuadra: ${Number.isFinite(check.amount) ? check.amount.toFixed(2) : "?"} ${check.currency || ""}. Revísalo a mano.`,
      };
    case "not_configured":
      return { ok: false, message: "Faltan BINANCE_API_KEY y BINANCE_API_SECRET en Vercel." };
    case "region_blocked":
      return {
        ok: false,
        message: "Binance rechazó la conexión por la región del servidor. Cambia la región de las funciones en Vercel (ver README).",
      };
    case "error":
      return { ok: false, message: `No se pudo consultar Binance (${check.message}). Intenta de nuevo.` };
    case "skipped":
      return { ok: false, message: check.reason };
  }
}
