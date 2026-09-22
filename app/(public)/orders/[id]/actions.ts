"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { uploadReceipt } from "@/lib/storage";

export type ReportPaymentResult = { ok: boolean; error?: string };

export type ReportPaymentInput = {
  email: string;
  banco: string;
  referencia: string;
  cedula?: string | null;
  monto: number;
  fecha: string;
  comprobante?: File | null;
};

// Reports a payment for a pending order (pending -> reported) — step
// 2 of the two-step checkout (see ReportPaymentForm / reportPaymentAction
// below for the actual <form> wiring).
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
  const banco = input.banco.trim();
  const referencia = input.referencia.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { ok: false, error: "Ingresa el correo con el que reservaste." };
  }
  if (!banco) return { ok: false, error: "Selecciona el banco emisor." };
  if (!/^[0-9]{6,8}$/.test(referencia)) {
    return { ok: false, error: "Ingresa los últimos 6 a 8 dígitos de la referencia." };
  }
  if (!Number.isFinite(input.monto) || input.monto <= 0) {
    return { ok: false, error: "Ingresa el monto en bolívares que transferiste." };
  }
  if (!input.fecha || Number.isNaN(Date.parse(input.fecha))) {
    return { ok: false, error: "Ingresa la fecha del pago." };
  }

  const admin = createAdminClient();

  let receiptPath: string | null = null;
  if (input.comprobante && input.comprobante.size > 0) {
    try {
      receiptPath = await uploadReceipt(admin, orderId, input.comprobante);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "No se pudo subir el comprobante." };
    }
  }

  const { error } = await admin.rpc("report_payment", {
    p_order_id: orderId,
    p_customer_email: email,
    p_banco_emisor: banco,
    p_payment_ref: referencia,
    p_cedula: input.cedula?.trim() || null,
    p_monto_reportado: input.monto,
    p_fecha_pago: input.fecha,
    p_receipt_path: receiptPath,
  });

  if (error) {
    if (error.code === "23514") {
      return { ok: false, error: "La referencia debe tener entre 6 y 8 dígitos." };
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
  const comprobante = formData.get("comprobante");
  return reportPayment(orderId, {
    email: String(formData.get("verify_email") ?? ""),
    banco: String(formData.get("banco_emisor") ?? ""),
    referencia: String(formData.get("payment_ref") ?? ""),
    cedula: String(formData.get("cedula") ?? "").trim() || null,
    monto: Number(formData.get("monto_reportado")),
    fecha: String(formData.get("fecha_pago") ?? ""),
    comprobante: comprobante instanceof File && comprobante.size > 0 ? comprobante : null,
  });
}
