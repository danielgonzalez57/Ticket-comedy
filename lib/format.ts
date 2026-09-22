// Formatting helpers (prices are defined in USD; orders also carry a
// frozen Bs amount — see the currency model in
// supabase/migrations/0004_currency_model.sql — and Spanish dates).

export function formatMoney(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

// Bs has no ISO currency formatting worth using here (VES Intl
// support is inconsistent); a plain "Bs." prefix matches what
// customers see on their own bank apps.
export function formatBs(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return `Bs. ${new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0)}`;
}

// USD and Bs shown together — the currency model requires every
// public/admin view to show both.
export function formatDualMoney(usd: number | string, bs: number | string): string {
  return `${formatMoney(usd)} (${formatBs(bs)})`;
}

// NOTE: there is deliberately no client-side USD -> Bs conversion
// helper here. A previous version of this file had one (bsFromUsd)
// for pre-order previews, computing `usd * tasa` in JS — but Postgres
// numeric round() and JS floating-point rounding don't always agree
// (e.g. (1.005).toFixed(2) === "1.00"), so a preview could show a
// different Bs figure than what gets stored the moment an order is
// created. Every Bs amount, including pre-order previews, must come
// from a column the database already computed with usd_to_bs() —
// either orders.monto_bs, or base_price_bs/price_bs from the
// shows_public/seats_public views (see migration 0006).

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// Formats a date-only value ("YYYY-MM-DD", e.g. orders.fecha_pago) as
// DD/MM/YYYY without going through the Date object — parsing a plain
// date string with `new Date()` treats it as UTC midnight, which can
// shift it a day in either direction once rendered in a local zone.
export function formatDateOnly(value: string): string {
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export function formatShortDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// Builds a value usable in <input type="datetime-local"> from an ISO
// string, in the browser's local time.
export function toDatetimeLocal(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
