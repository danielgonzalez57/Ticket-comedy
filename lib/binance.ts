import "server-only";
import { createHmac } from "node:crypto";

// Reads the Binance Pay history of the account payments go to, via the
// regular Binance API ("Pay Trade History", GET /sapi/v1/pay/transactions).
// Needs a READ-ONLY API key of that account in BINANCE_API_KEY /
// BINANCE_API_SECRET — never NEXT_PUBLIC_, never trading/withdrawal
// permissions. Everything here fails soft: any problem returns a
// status the caller treats as "leave it for manual review", so Binance
// being slow or down can never block a sale.

const BASE_URL = "https://api.binance.com";
const TIMEOUT_MS = 6000;
// The customer pays before reserving, so the payment can predate the
// order. Reusing one payment for two orders is prevented separately by
// the (banco_emisor, payment_ref) unique index — see migration 0003.
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const AMOUNT_TOLERANCE = 0.005;
const ACCEPTED_CURRENCIES = new Set(["USDT"]);

export type BinanceCheck =
  | { status: "match"; transactionId: string; amount: number; currency: string }
  | { status: "not_found" }
  | { status: "amount_mismatch"; amount: number; currency: string }
  | { status: "not_configured" }
  // Binance refuses requests from some server locations (e.g. the US).
  | { status: "region_blocked" }
  | { status: "error"; message: string };

type PayTransaction = {
  transactionId?: string | number;
  orderId?: string | number;
  transactionTime?: number;
  amount?: string;
  currency?: string;
};

export function binanceConfigured(): boolean {
  return Boolean(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET);
}

async function fetchPayTransactions(
  startTime: number,
  endTime: number,
): Promise<{ ok: true; data: PayTransaction[] } | { ok: false; check: BinanceCheck }> {
  const key = process.env.BINANCE_API_KEY;
  const secret = process.env.BINANCE_API_SECRET;
  if (!key || !secret) return { ok: false, check: { status: "not_configured" } };

  const query = new URLSearchParams({
    startTime: String(startTime),
    endTime: String(endTime),
    limit: "100",
    recvWindow: "10000",
    timestamp: String(Date.now()),
  }).toString();
  const signature = createHmac("sha256", secret).update(query).digest("hex");

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/sapi/v1/pay/transactions?${query}&signature=${signature}`, {
      headers: { "X-MBX-APIKEY": key },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return {
      ok: false,
      check: { status: "error", message: e instanceof Error ? e.message : "network error" },
    };
  }

  if (res.status === 451 || res.status === 403) {
    return { ok: false, check: { status: "region_blocked" } };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[binance] pay/transactions failed:", res.status, body.slice(0, 300));
    return { ok: false, check: { status: "error", message: `HTTP ${res.status}` } };
  }

  const json = (await res.json().catch(() => null)) as { data?: PayTransaction[] } | null;
  return { ok: true, data: Array.isArray(json?.data) ? json.data : [] };
}

// Looks for the customer's Binance Pay order ID among payments RECEIVED
// in the lookback window and checks currency and amount.
export async function findBinancePayment(params: {
  reference: string;
  expectedUsd: number;
  orderCreatedAt: string;
}): Promise<BinanceCheck> {
  const reference = params.reference.trim();
  if (!reference) return { status: "not_found" };

  const createdAt = Date.parse(params.orderCreatedAt);
  const endTime = Date.now();
  const startTime = (Number.isFinite(createdAt) ? createdAt : endTime) - LOOKBACK_MS;

  const result = await fetchPayTransactions(startTime, endTime);
  if (!result.ok) return result.check;

  const tx = result.data.find(
    (t) => String(t.transactionId ?? "") === reference || String(t.orderId ?? "") === reference,
  );
  if (!tx) return { status: "not_found" };

  const amount = Number(tx.amount);
  const currency = String(tx.currency ?? "").toUpperCase();
  // Negative amounts are payments this account SENT, not received.
  if (!Number.isFinite(amount) || amount <= 0 || !ACCEPTED_CURRENCIES.has(currency)) {
    return { status: "amount_mismatch", amount, currency };
  }
  if (amount + AMOUNT_TOLERANCE < params.expectedUsd) {
    return { status: "amount_mismatch", amount, currency };
  }
  return { status: "match", transactionId: String(tx.transactionId ?? reference), amount, currency };
}
