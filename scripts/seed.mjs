// Seed de datos de ejemplo para Ticket Comedy.
// Uso:  node scripts/seed.mjs
// Lee las llaves de .env.local y usa la service role key (bypassa RLS).

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

const rowLabel = (i) => {
  let label = "";
  let n = i;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
};

const daysFromNow = (d) => {
  const date = new Date();
  date.setDate(date.getDate() + d);
  date.setHours(20, 30, 0, 0);
  return date.toISOString();
};

const SHOWS = [
  {
    name: "Noche de Risa",
    description:
      "Los mejores comediantes de la ciudad en una noche de stand-up sin filtros. Risa garantizada o te devolvemos las ganas de llorar.",
    venue: "Teatro Bar — Las Mercedes, Caracas",
    date: daysFromNow(7),
    comedians: ["Led Varela", "Nanutria", "Jelambie", "Jean"],
    base_price: 15,
    tasa: 200,
    grid_rows: 6,
    grid_cols: 10,
    status: "published",
  },
  {
    name: "Open Mic Valencia",
    description:
      "Micrófono abierto: comediantes nuevos probando material fresco. Entrada económica, cervezas frías.",
    venue: "La Cuadra Café — Valencia",
    date: daysFromNow(14),
    comedians: ["María Laura Pinto", "Ernesto Pinto", "Calvo Roots", "Carluis Medina"],
    base_price: 10,
    tasa: 200,
    grid_rows: 5,
    grid_cols: 8,
    status: "published",
  },
  {
    name: "Especial de Fin de Año",
    description: "El show más grande del año. Line-up por confirmar.",
    venue: "Centro Cultural BOD — Caracas",
    date: daysFromNow(40),
    comedians: [
      "Led Varela",
      "Nanutria",
      "Jelambie",
      "María Laura Pinto",
      "Ernesto Pinto",
      "Jean",
      "Calvo Roots",
      "Carluis Medina",
    ],
    base_price: 25,
    tasa: 205,
    grid_rows: 8,
    grid_cols: 12,
    status: "draft",
  },
];

const CUSTOMERS = [
  { name: "María Pérez", email: "maria.perez@example.com", phone: "0412-1112233" },
  { name: "José Díaz", email: "jose.diaz@example.com", phone: "0414-2223344" },
  { name: "Luisa Gómez", email: "luisa.gomez@example.com", phone: "0424-3334455" },
  { name: "Carlos Rivas", email: "carlos.rivas@example.com", phone: "0416-4445566" },
  { name: "Andrea Mora", email: "andrea.mora@example.com", phone: "0426-5556677" },
];

const METHODS = ["pago_movil", "zelle", "transferencia"];

async function cleanup() {
  const names = SHOWS.map((s) => s.name);
  const { data: existing } = await supabase
    .from("shows")
    .select("id")
    .in("name", names);
  const ids = (existing ?? []).map((s) => s.id);
  if (ids.length) {
    await supabase.from("orders").delete().in("show_id", ids);
    await supabase.from("shows").delete().in("id", ids); // cascades seats
    console.log(`Limpiados ${ids.length} show(s) previos del seed.`);
  }
}

async function seed() {
  await cleanup();

  // Global across all shows, not reset per show — otherwise two
  // shows' orders both get payment_ref "100001" with the same
  // hardcoded banco_emisor, colliding on
  // orders_payment_ref_unique_idx (see
  // migrations/0003_payment_reference_integrity.sql).
  let ci = 0;

  for (const show of SHOWS) {
    const { data: inserted, error } = await supabase
      .from("shows")
      .insert({ ...show, tasa_fecha: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    console.log(`✓ Show: ${inserted.name}`);

    // Seats
    const seats = [];
    for (let r = 0; r < show.grid_rows; r++) {
      for (let c = 0; c < show.grid_cols; c++) {
        seats.push({
          show_id: inserted.id,
          label: `${rowLabel(r)}${c + 1}`,
          row_index: r,
          col_index: c,
          price: show.base_price,
          zone: "general",
          status: "available",
        });
      }
    }
    const { data: insertedSeats, error: seatErr } = await supabase
      .from("seats")
      .insert(seats)
      .select();
    if (seatErr) throw seatErr;

    if (show.status !== "published") continue;

    // Orders: spread a few across statuses on the first rows.
    const pool = [...insertedSeats].sort(
      (a, b) => a.row_index - b.row_index || a.col_index - b.col_index,
    );
    let cursor = 0;
    const take = (n) => pool.slice(cursor, (cursor += n));

    const plan = [
      { status: "verified", count: 2 },
      { status: "verified", count: 3 },
      { status: "verified", count: 1 },
      { status: "pending", count: 2 },
      { status: "reported", count: 1 },
      { status: "cancelled", count: 2 },
    ];

    for (const p of plan) {
      const picked = take(p.count);
      if (picked.length === 0) continue;
      const customer = CUSTOMERS[ci % CUSTOMERS.length];
      ci++;
      const totalUsd = picked.reduce((s, seat) => s + Number(seat.price), 0);
      const montoBs = Math.round(totalUsd * show.tasa * 100) / 100;
      const holdExpiresAt = new Date(Date.now() + 15 * 60000).toISOString();

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          show_id: inserted.id,
          customer_name: customer.name,
          customer_email: customer.email,
          customer_phone: customer.phone,
          seat_ids: picked.map((s) => s.id),
          total_usd: totalUsd,
          tasa: show.tasa,
          tasa_fecha: inserted.tasa_fecha,
          monto_bs: montoBs,
          payment_method: METHODS[ci % METHODS.length],
          // 6-8 digits: orders.orders_payment_ref_format check
          // constraint (see migrations/0003_payment_reference_integrity.sql).
          payment_ref: ["reported", "verified"].includes(p.status)
            ? String(100000 + ci)
            : null,
          banco_emisor: ["reported", "verified"].includes(p.status)
            ? "Banesco"
            : null,
          monto_reportado: ["reported", "verified"].includes(p.status)
            ? montoBs
            : null,
          fecha_pago: ["reported", "verified"].includes(p.status)
            ? new Date().toISOString().slice(0, 10)
            : null,
          status: p.status,
          expires_at: p.status === "pending" ? holdExpiresAt : null,
          reported_at: p.status === "reported" ? new Date().toISOString() : null,
          verified_at: p.status === "verified" ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (orderErr) throw orderErr;

      // Reflect seat state, stamping held_by_order_id like
      // create_pending_order/verify_payment_atomic would (this script
      // inserts directly and bypasses those RPCs — see
      // migrations/0001_seat_hold_ownership.sql for why that column
      // matters).
      if (p.status === "verified") {
        await supabase
          .from("seats")
          .update({ status: "sold", held_by_order_id: order.id })
          .in("id", picked.map((s) => s.id));
      } else if (p.status === "pending" || p.status === "reported") {
        await supabase
          .from("seats")
          .update({
            status: "held",
            hold_expires_at: holdExpiresAt,
            held_by_order_id: order.id,
          })
          .in("id", picked.map((s) => s.id));
      }
    }
    console.log(`  ↳ ${plan.length} órdenes creadas`);
  }

  console.log("\n✅ Seed completo.");
}

seed().catch((e) => {
  console.error("Error en seed:", e);
  process.exit(1);
});
