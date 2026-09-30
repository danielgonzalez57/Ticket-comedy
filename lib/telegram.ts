import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYMENT_METHOD_LABELS, siteUrl } from "@/lib/constants";
import { formatBs, formatMoney } from "@/lib/format";
import { orderCode } from "@/lib/whatsapp";
import type { Order } from "@/lib/database.types";

// Pings the admins' Telegram chat when a customer reports a payment.
// Needs TELEGRAM_BOT_TOKEN (from @BotFather) and TELEGRAM_CHAT_ID (a
// person or a group the bot is in). Fails soft: a missing config or a
// Telegram outage only logs — it must never affect a sale.

const TIMEOUT_MS = 5000;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notifyNewSale(orderId: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    const admin = createAdminClient();
    const { data } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (!data) return;
    const order = data as Order;
    const { data: show } = await admin
      .from("shows")
      .select("name")
      .eq("id", order.show_id)
      .maybeSingle();
    const showName = (show as { name: string } | null)?.name;

    const qty = order.seat_ids.length;
    const method = order.payment_method ? PAYMENT_METHOD_LABELS[order.payment_method] : "—";
    const amount =
      order.payment_method === "binance"
        ? `${formatMoney(order.total_usd)} en USDT`
        : `${formatBs(order.monto_reportado ?? order.monto_bs)} (${formatMoney(order.total_usd)})`;

    const text = [
      `🎟️ <b>Nueva venta</b>${showName ? ` — ${escapeHtml(showName)}` : ""}`,
      `${escapeHtml(order.customer_name)} · ${qty} ${qty === 1 ? "entrada" : "entradas"} · ${escapeHtml(method)}`,
      `${amount}${order.payment_ref ? ` · Ref ${escapeHtml(order.payment_ref)}` : ""}`,
      `Orden #${orderCode(order.id)}: ${siteUrl()}/admin/orders/${order.id}`,
    ].join("\n");

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[telegram] sendMessage failed:", res.status, body.slice(0, 300));
    }
  } catch (e) {
    console.error("[telegram] notify failed:", e);
  }
}
