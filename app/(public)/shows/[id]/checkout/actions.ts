"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  HOLD_MINUTES,
  MAX_SEATS_PER_ORDER,
  PAYMENT_METHODS,
} from "@/lib/constants";
import type { PaymentMethod } from "@/lib/database.types";
import {
  normalizeCedula,
  readPaymentFields,
  validatePaymentReport,
} from "@/lib/payment-report";
import { reportPayment } from "@/app/(public)/orders/[id]/actions";

export type CheckoutState = { error: string | null };

const VALID_METHODS: PaymentMethod[] = PAYMENT_METHODS.map((m) => m.value);

const ERROR_MESSAGES: Record<string, string> = {
  NO_SEATS: "Elige al menos una entrada.",
  MAX_4_SEATS: `Máximo ${MAX_SEATS_PER_ORDER} entradas por orden.`,
  SHOW_NOT_AVAILABLE: "Este show ya no está disponible.",
  SOLD_OUT:
    "Ya no quedan suficientes entradas disponibles. Elige menos o vuelve a la cartelera.",
};

// Reserves the entradas AND reports the payment in one submit: the
// customer pays first (the checkout page shows where), then fills in
// the reference/date (+ bank/Bs amount for Pago Móvil). Everything is
// validated before any seat is held, so no order reaches the admin
// without a reference. The DB still keeps these as two RPCs (see
// supabase/migrations/0005_order_lifecycle.sql); if the report step
// fails after the seats were held, the customer lands on
// /orders/[id], where ReportPaymentForm lets them retry.
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
  const payment = readPaymentFields(formData);
  if (!payment.cedula || !normalizeCedula(payment.cedula)) {
    return { error: "Ingresa una cédula válida (ej: V-12345678)." };
  }
  const checked = validatePaymentReport(method, payment);
  if ("error" in checked) return { error: checked.error };

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

  const reported = await reportPayment(order.id, { email, ...payment });
  redirect(
    reported.ok ? `/orders/${order.id}` : `/orders/${order.id}?reporte=fallido`,
  );
}
