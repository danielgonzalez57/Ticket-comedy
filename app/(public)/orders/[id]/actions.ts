"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  normalizeCedula,
  readPaymentFields,
  validatePaymentReport,
  type PaymentReportInput,
} from "@/lib/payment-report";

export type ReportPaymentResult = { ok: boolean; error?: string };

export type ReportPaymentInput = PaymentReportInput & { email: string };

// Reports a payment for a pending order (pending -> reported). Called
// by createOrder right after reserving (checkout collects the payment
// data up front) and by ReportPaymentForm on /orders/[id] as a retry
// if that first report didn't go through.
//
// Rate limited by IP (a script hammering this endpoint) AND by order
// (repeated retries against one order, e.g. probing references) —
// see supabase/migrations/0008_rate_limiting.sql. Both are generous
// enough for a customer fixing a typo a few times. Both fail CLOSED:
// this endpoint writes financial reconciliation data and uploads
// files to Storage, so if the limiter itself is broken the safer
// default is to refuse new reports rather than leave this
// unthrottled (see lib/rate-limit.ts for the createOrder contrast).
export async function reportPayment(
  orderId: string,
  input: ReportPaymentInput,
): Promise<ReportPaymentResult> {
  const ip = await getClientIp();

  const ipOk = await checkRateLimit(`report_payment:ip:${ip}`, 8, 600, "closed");
  if (!ipOk) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." };
  }
  const orderOk = await checkRateLimit(`report_payment:order:${orderId}`, 5, 600, "closed");
  if (!orderOk) {
    return {
      ok: false,
      error: "Demasiados intentos para esta orden. Espera unos minutos e inténtalo de nuevo.",
    };
  }

  const email = input.email.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { ok: false, error: "Ingresa el correo con el que reservaste." };
  }

  const admin = createAdminClient();

  // Which fields are required depends on the order's payment method —
  // read it from the order itself, never from the client.
  const { data: order } = await admin
    .from("orders")
    .select("payment_method")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "No se encontró la orden." };

  const checked = validatePaymentReport(order.payment_method, input);
  if ("error" in checked) return { ok: false, error: checked.error };
  const report = checked.value;

  const cedulaRaw = input.cedula?.trim() || null;
  const cedula = cedulaRaw ? normalizeCedula(cedulaRaw) : null;
  if (cedulaRaw && !cedula) {
    return { ok: false, error: "La cédula no es válida (ej: V-12345678)." };
  }

  const { error } = await admin.rpc("report_payment", {
    p_order_id: orderId,
    p_customer_email: email,
    p_banco_emisor: report.banco,
    p_payment_ref: report.referencia,
    p_cedula: cedula,
    p_monto_reportado: report.monto,
    p_fecha_pago: report.fecha,
  });

  if (error) {
    if (error.code === "23514") {
      return { ok: false, error: "El formato de la referencia no es válido." };
    }
    if (error.message.includes("OWNER_MISMATCH")) {
      return { ok: false, error: "El correo no coincide con el de esta orden." };
    }
    if (error.message.includes("ORDER_NOT_PENDING")) {
      return { ok: false, error: "Esta orden ya no está pendiente de reporte." };
    }
    if (error.message.includes("ORDER_NOT_FOUND")) {
      return { ok: false, error: "No se encontró la orden." };
    }
    return { ok: false, error: "No se pudo registrar el pago. Intenta de nuevo." };
  }

  // Not part of the report_payment RPC — best effort: the payment is
  // already reported, this is only a hint for finding it in Binance.
  if (report.binanceEmail) {
    await admin
      .from("orders")
      .update({ binance_email: report.binanceEmail })
      .eq("id", orderId);
  }

  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

// <form action={...}> wrapper around reportPayment for
// ReportPaymentForm (useActionState expects a (prevState, formData)
// action; orderId is bound in via .bind(null, orderId), same pattern
// as updateShow.bind(null, showId) in the admin show form).
export async function reportPaymentAction(
  orderId: string,
  _prev: ReportPaymentResult,
  formData: FormData,
): Promise<ReportPaymentResult> {
  return reportPayment(orderId, {
    email: String(formData.get("verify_email") ?? ""),
    ...readPaymentFields(formData),
  });
}
