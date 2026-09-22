// Crea una orden de prueba (2 entradas, verified) para un cliente
// específico. Inserta directo (bypassa create_pending_order, que
// tiene un bug de FK pendiente — ver migrations/0011).
// Uso:  node scripts/seed-test-order.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SHOW_ID = "1b39cdb4-b8bb-4042-b329-a5b13c468c48"; // Noche de Risa
const SEAT_IDS = [
  "4459c99c-646f-4934-8972-4779d53403ab", // A10
  "bac93b8e-e83f-46d5-9ce2-872c20cf30d7", // B1
];

const CUSTOMER = {
  name: "Daniel",
  email: "danielsrkt@gmail.com",
  phone: "28082907",
  cedula: "28082907",
};

async function main() {
  const { data: show, error: showErr } = await supabase
    .from("shows")
    .select("tasa")
    .eq("id", SHOW_ID)
    .single();
  if (showErr) throw showErr;

  const totalUsd = 30; // 2 x $15
  const montoBs = Math.round(totalUsd * show.tasa * 100) / 100;
  const nowIso = new Date().toISOString();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      show_id: SHOW_ID,
      customer_name: CUSTOMER.name,
      customer_email: CUSTOMER.email,
      customer_phone: CUSTOMER.phone,
      cedula: CUSTOMER.cedula,
      seat_ids: SEAT_IDS,
      total_usd: totalUsd,
      tasa: show.tasa,
      tasa_fecha: nowIso,
      monto_bs: montoBs,
      payment_method: "pago_movil",
      payment_ref: "100099",
      banco_emisor: "Banesco",
      monto_reportado: montoBs,
      fecha_pago: nowIso.slice(0, 10),
      status: "verified",
      reported_at: nowIso,
      verified_at: nowIso,
    })
    .select()
    .single();
  if (orderErr) throw orderErr;

  const { error: seatErr } = await supabase
    .from("seats")
    .update({ status: "sold", held_by_order_id: order.id, hold_expires_at: null })
    .in("id", SEAT_IDS);
  if (seatErr) throw seatErr;

  console.log("Orden creada:", order.id);
  console.log("URL:", `${env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/orders/${order.id}`);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
