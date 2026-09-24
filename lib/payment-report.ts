import type { PaymentMethod } from "@/lib/database.types";
import { parseDecimal } from "@/lib/format";

// Payment data a customer reports (reference, bank, amount, date).
// Shared by the browser — to keep the submit button disabled until
// it's complete — and the server actions, which re-check it, so both
// sides always agree on what "complete" means.

export const BINANCE_BANK = "Binance";

// Mirrors orders_payment_ref_format (migrations 0003 and 0016).
export const REF_PATTERNS: Record<"pago_movil" | "binance", RegExp> = {
  pago_movil: /^[0-9]{6,8}$/,
  binance: /^[0-9]{6,32}$/,
};

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export type PaymentReportFields = {
  // Pago Móvil
  banco: string;
  monto: string;
  fecha: string;
  // Pago Móvil reference or Binance Pay order ID
  referencia: string;
  // Binance (optional)
  binanceEmail: string;
};

export type PaymentReportInput = PaymentReportFields & {
  cedula: string | null;
};

// Reads the payment inputs from a submitted form — the checkout form
// and ReportPaymentForm use the same input names.
export function readPaymentFields(formData: FormData): PaymentReportInput {
  return {
    banco: String(formData.get("banco_emisor") ?? ""),
    referencia: String(formData.get("payment_ref") ?? ""),
    monto: String(formData.get("monto_reportado") ?? ""),
    fecha: String(formData.get("fecha_pago") ?? ""),
    binanceEmail: String(formData.get("binance_email") ?? ""),
    cedula: String(formData.get("cedula") ?? "").trim() || null,
  };
}

export type ParsedPaymentReport = {
  banco: string;
  referencia: string;
  // null for Binance: the amount is the order's USD total and there's
  // no Bs figure to reconcile against monto_bs.
  monto: number | null;
  fecha: string;
  binanceEmail: string | null;
};

function isoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Venezuelan cédula/RIF: optional V/E/J/P/G prefix and 6-9 digits;
// dots, dashes and spaces are ignored ("V-12.345.678" is fine).
export function normalizeCedula(raw: string): string | null {
  const s = raw.replace(/[\s.-]/g, "").toUpperCase();
  const m = /^([VEJPG])?(\d{6,9})$/.exec(s);
  if (!m) return null;
  return `${m[1] ?? "V"}-${m[2]}`;
}

// Returns the first problem as a message for the customer, or the
// cleaned-up values when everything is there.
export function validatePaymentReport(
  method: PaymentMethod | "" | null,
  fields: PaymentReportFields,
): { error: string } | { value: ParsedPaymentReport } {
  const referencia = fields.referencia.trim();

  if (method === "binance") {
    if (!REF_PATTERNS.binance.test(referencia)) {
      return { error: "Ingresa el Order ID de Binance Pay (solo números)." };
    }
    const binanceEmail = fields.binanceEmail.trim();
    if (binanceEmail && !EMAIL_PATTERN.test(binanceEmail)) {
      return { error: "El correo de Binance no es válido." };
    }
    return {
      value: {
        banco: BINANCE_BANK,
        referencia,
        monto: null,
        // Binance Pay is instant — the payment date is today.
        fecha: isoDate(new Date()),
        binanceEmail: binanceEmail || null,
      },
    };
  }

  if (method !== "pago_movil" && method !== "transferencia") {
    return { error: "Elige un método de pago." };
  }

  if (!fields.banco.trim()) return { error: "Indica el banco emisor." };
  if (!REF_PATTERNS.pago_movil.test(referencia)) {
    return { error: "Ingresa los últimos 6 a 8 dígitos de la referencia." };
  }
  const monto = parseDecimal(fields.monto);
  if (!Number.isFinite(monto) || monto <= 0) {
    return { error: "Ingresa el monto en bolívares que transferiste." };
  }
  const fecha = fields.fecha.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) {
    return { error: "Ingresa la fecha del pago." };
  }
  // String compare works for YYYY-MM-DD. One day of slack so a
  // customer ahead of the server's timezone isn't rejected.
  if (fecha > isoDate(new Date(Date.now() + 86_400_000))) {
    return { error: "La fecha del pago no puede ser futura." };
  }

  return {
    value: {
      banco: fields.banco.trim(),
      referencia,
      monto,
      fecha,
      binanceEmail: null,
    },
  };
}
