import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYMENT_METHOD_LABELS, siteUrl } from "@/lib/constants";
import { formatBs, formatDate, formatMoney } from "@/lib/format";
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
    const [{ data: show }, { data: amountMatches }] = await Promise.all([
      admin.from("shows").select("name, date").eq("id", order.show_id).maybeSingle(),
      order.monto_reportado != null
        ? admin.rpc("payment_matches", {
            p_reportado: order.monto_reportado,
            p_esperado: order.monto_bs,
          })
        : Promise.resolve({ data: null }),
    ]);
    const showInfo = show as { name: string; date: string } | null;

    const qty = order.seat_ids.length;
    const isBinance = order.payment_method === "binance";
    const method = [
      order.payment_method ? PAYMENT_METHOD_LABELS[order.payment_method] : "—",
      !isBinance && order.banco_emisor ? order.banco_emisor : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const amount = isBinance
      ? `${formatMoney(order.total_usd)} USDT`
      : `${formatBs(order.monto_reportado ?? order.monto_bs)} <i>(${formatMoney(order.total_usd)})</i>`;
    const orderUrl = `${siteUrl()}/admin/orders/${order.id}`;

    const lines = [
      `🎉 <b>¡NUEVA VENTA!</b>`,
      ``,
      showInfo ? `🎭 <b>${escapeHtml(showInfo.name)}</b>` : null,
      showInfo ? `📅 ${escapeHtml(capitalize(formatDate(showInfo.date)))}` : null,
      ``,
      `👤 ${escapeHtml(order.customer_name)}`,
      `📱 ${escapeHtml(order.customer_phone)}`,
      `🎟️ ${qty} ${qty === 1 ? "entrada" : "entradas"}`,
      ``,
      `💳 ${escapeHtml(method)}`,
      `💰 <b>${amount}</b>`,
      order.payment_ref ? `🔢 Ref <code>${escapeHtml(order.payment_ref)}</code>` : null,
      amountMatches === false
        ? `⚠️ <b>El monto no coincide con el esperado (${formatBs(order.monto_bs)})</b>`
        : null,
      ``,
      `🧾 Orden <code>#${orderCode(order.id)}</code>`,
    ];
    const text = lines.filter((l) => l !== null).join("\n");

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        // Telegram only accepts https links on buttons (not localhost).
        ...(orderUrl.startsWith("https://")
          ? {
              reply_markup: {
                inline_keyboard: [[{ text: "Ver orden en el admin", url: orderUrl }]],
              },
            }
          : {}),
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
