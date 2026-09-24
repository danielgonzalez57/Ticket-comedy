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

// An amount the way a payment app wants it pasted: no currency sign, no
// thousands separators, 2 decimals. Venezuelan bank apps take a
// decimal comma ("8406,70"); Binance takes a dot ("12.00"). Formatting
// only — the number itself must already come from the DB.
export function pasteableAmount(
  value: number | string,
  decimalMark: "," | "." = ",",
): string {
  const n = typeof value === "string" ? Number(value) : value;
  const fixed = (Number.isFinite(n) ? n : 0).toFixed(2);
  return decimalMark === "," ? fixed.replace(".", ",") : fixed;
}

// Exchange rate as Venezuelans write it: 840.67 -> "840,67",
// 1234.5 -> "1.234,50". Up to 4 decimals (shows.tasa is numeric(12,4)).
export function formatTasa(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number.isFinite(n) ? n : 0);
}

// Same as formatTasa but without thousands separators, for prefilling
// an editable input: 1234.5 -> "1234,50".
export function formatTasaInput(value: number | string): string {
  return formatTasa(value).replace(/\./g, "");
}

// Parses a decimal typed with either separator: "840,67", "840.67",
// "1.234,56" and "1234,56" all work. With both separators present the
// last one is the decimal mark. Returns NaN for anything else.
export function parseDecimal(raw: string): number {
  let s = raw.trim().replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalMark = lastComma > lastDot ? "," : ".";
    const thousands = decimalMark === "," ? "." : ",";
    s = s.split(thousands).join("").replace(decimalMark, ".");
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");
  }
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
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
