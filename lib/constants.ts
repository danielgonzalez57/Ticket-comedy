import type { PaymentMethod } from "@/lib/database.types";

export const HOLD_MINUTES = 20;
export const MAX_SEATS_PER_ORDER = 4;

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "pago_movil", label: "Pago Móvil" },
  { value: "zelle", label: "Zelle" },
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo", label: "Efectivo" },
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> =
  Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])) as Record<
    PaymentMethod,
    string
  >;

// Methods reconciled by hand against a bank statement — these are the
// only ones that go through the pending -> reported step (report a
// reference, amount, date) before an admin can verify them. Single
// source of truth for this in the app layer; the DB encodes the same
// set independently inside verify_payment_atomic (MUST_REPORT_FIRST).
export const BANK_RECONCILED_METHODS: PaymentMethod[] = [
  "pago_movil",
  "transferencia",
];

export const SHOW_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  published: "Publicado",
  finished: "Finalizado",
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  reported: "Pago reportado",
  verified: "Verificada",
  rejected: "Rechazada",
  expired: "Vencida",
  cancelled: "Cancelada",
};

// Common Venezuelan banks for Pago Móvil / transferencia. banco_emisor
// is free text in the DB, so this is just an <datalist> of suggestions.
export const VE_BANKS = [
  "Banesco",
  "Banco de Venezuela",
  "Banco Mercantil",
  "BBVA Provincial",
  "Bancaribe",
  "Banco Nacional de Crédito (BNC)",
  "Banplus",
  "Banco Exterior",
  "Bancamiga",
  "100% Banco",
  "Banco Plaza",
  "Banco Activo",
  "Mi Banco",
];

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

export function paymentInfo(): string {
  return (
    process.env.NEXT_PUBLIC_PAYMENT_INFO ||
    "Configura NEXT_PUBLIC_PAYMENT_INFO con tus datos de pago."
  );
}

export function whatsappAdmin(): string {
  return process.env.NEXT_PUBLIC_WHATSAPP_ADMIN || "";
}

// Bump this when the uploaded asset at brand/logo-caras-email.png
// changes — Gmail's image proxy (and browsers) cache by exact URL, so
// without a cache-busting query param a re-uploaded file keeps
// serving the old cached image to anyone who already opened a
// previous email.
const BRAND_EMAIL_LOGO_VERSION = 3;

// Public URL of the email header mark (uploaded once to the `posters`
// bucket at brand/logo-caras-email.png — same public, no-RLS bucket
// show posters already use; source file checked in at
// public/logo-caras-email.png: the original white lettering as-is,
// plus a soft drop shadow — see git history for how). Built from the Supabase
// project URL rather than hardcoded so it keeps working if the
// project ever moves. Referenced as a normal <img src> in emails (not
// a cid attachment): Vercel serverless functions don't reliably have
// the `public/` folder on disk at runtime, and Gmail renders external
// HTTPS images by default anyway.
export function brandEmailLogoUrl(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return supabaseUrl
    ? `${supabaseUrl}/storage/v1/object/public/posters/brand/logo-caras-email.png?v=${BRAND_EMAIL_LOGO_VERSION}`
    : "";
}
