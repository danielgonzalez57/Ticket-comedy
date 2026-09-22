"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { HOLD_MINUTES, MAX_SEATS_PER_ORDER } from "@/lib/constants";
import type { PaymentMethod } from "@/lib/database.types";

export type CheckoutState = { error: string | null };

const VALID_METHODS: PaymentMethod[] = [
  "pago_movil",
  "zelle",
  "transferencia",
  "efectivo",
];

const ERROR_MESSAGES: Record<string, string> = {
  NO_SEATS: "Elige al menos una entrada.",
  MAX_4_SEATS: `Máximo ${MAX_SEATS_PER_ORDER} entradas por orden.`,
  SHOW_NOT_AVAILABLE: "Este show ya no está disponible.",
  SOLD_OUT:
    "Ya no quedan suficientes entradas disponibles. Elige menos o vuelve a la cartelera.",
};

// Step 1 of 2 (Fase 3): only reserves the entradas — no payment
// reference required here. Step 2 (reportPayment, on /orders/[id])
// is where banco/referencia/monto/fecha/comprobante get collected,
// once the customer has actually paid. See
// supabase/migrations/0005_order_lifecycle.sql for why creating an
// order and reporting a payment are separate RPCs.
//
// Seats are no longer picked by the customer — create_pending_order_by_qty
// (migration 0014) assigns the next available ones itself, in arrival
// order, atomically.
export async function createOrder(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  // Rate limited by IP (Fase 2): without this, a script can loop
  // create_pending_order_by_qty calls to hold every seat of a show.
  // Fails OPEN — a broken limiter shouldn't be able to halt sales (see
  // lib/rate-limit.ts).
  const ip = await getClientIp();
  const ipOk = await checkRateLimit(`create_order:ip:${ip}`, 8, 60, "open");
  if (!ipOk) {
    return { error: "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo." };
  }

  const showId = String(formData.get("show_id") ?? "");
  const quantity = Math.trunc(Number(formData.get("quantity")));
  const name = String(formData.get("customer_name") ?? "").trim();
  const email = String(formData.get("customer_email") ?? "").trim();
  const phone = String(formData.get("customer_phone") ?? "").trim();
  const method = String(formData.get("payment_method") ?? "") as PaymentMethod;

  if (!showId || !Number.isFinite(quantity) || quantity < 1) {
    return { error: "Cantidad de entradas inválida." };
  }
  if (quantity > MAX_SEATS_PER_ORDER) {
    return { error: ERROR_MESSAGES.MAX_4_SEATS };
  }
  if (!name) return { error: "Ingresa tu nombre." };
  if (name.length > 100) return { error: "El nombre es demasiado largo." };
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return { error: "Ingresa un correo válido." };
  }
  if (!phone) return { error: "Ingresa tu teléfono." };
  if (phone.length > 30) return { error: "El teléfono es demasiado largo." };
  if (!VALID_METHODS.includes(method)) {
    return { error: "Elige un método de pago." };
  }

  const admin = createAdminClient();
  const { data: order, error } = await admin.rpc("create_pending_order_by_qty", {
    p_show_id: showId,
    p_quantity: quantity,
    p_name: name,
    p_email: email,
    p_phone: phone,
    p_payment_method: method,
    p_hold_minutes: HOLD_MINUTES,
  });

  if (error || !order) {
    const code = error?.message
      ? Object.keys(ERROR_MESSAGES).find((k) => error.message.includes(k))
      : undefined;
    return {
      error: code
        ? ERROR_MESSAGES[code]
        : "No se pudo registrar tu orden. Intenta de nuevo.",
    };
  }

  redirect(`/orders/${order.id}`);
}
