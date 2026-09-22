import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { Order, Seat, Show } from "@/lib/database.types";

export type OrderDetail = {
  order: Order;
  show: Show | null;
  seats: Seat[];
};

// Fetches an order with its show and seats using the service role
// (orders are never exposed to anon clients via RLS). Server-only.
export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();
  if (!order) return null;

  const [{ data: show }, { data: seats }] = await Promise.all([
    admin.from("shows").select("*").eq("id", order.show_id).single(),
    admin
      .from("seats")
      .select("*")
      .in("id", order.seat_ids.length ? order.seat_ids : ["x"])
      .order("row_index", { ascending: true })
      .order("col_index", { ascending: true }),
  ]);

  return {
    order: order as Order,
    show: (show as Show) ?? null,
    seats: (seats ?? []) as Seat[],
  };
}

export async function getOrderByToken(token: string): Promise<OrderDetail | null> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("*")
    .eq("qr_token", token)
    .single();
  if (!order) return null;
  return getOrderDetail((order as Order).id);
}

// ---------- Sales report -------------------------------------

export type PerShowReport = {
  show: Show;
  totalSeats: number;
  soldSeats: number;
  occupancy: number; // 0..1
  confirmedRevenue: number;
  pendingRevenue: number;
  paidOrders: number;
};

export type SalesOverview = {
  confirmedRevenue: number;
  pendingRevenue: number;
  paidOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  soldSeats: number;
  totalSeats: number;
  avgOrderValue: number;
};

export type SalesReport = {
  overview: SalesOverview;
  perShow: PerShowReport[];
  orders: Order[];
  showName: Record<string, string>;
  revenueByMonth: { month: string; revenue: number }[];
  paymentMethodBreakdown: { method: string; revenue: number }[];
};

const REVENUE_TREND_MONTHS = 6;

export async function getSalesReport(): Promise<SalesReport> {
  const admin = createAdminClient();
  const [{ data: orderData }, { data: showData }, { data: seatData }] =
    await Promise.all([
      admin.from("orders").select("*").order("created_at", { ascending: false }),
      admin.from("shows").select("*").order("date", { ascending: false }),
      admin.from("seats").select("show_id,status"),
    ]);

  const orders = (orderData ?? []) as Order[];
  const shows = (showData ?? []) as Show[];
  const seats = (seatData ?? []) as Pick<Seat, "show_id" | "status">[];

  const showName: Record<string, string> = {};
  for (const s of shows) showName[s.id] = s.name;

  // Seat tallies per show.
  const seatTotals = new Map<string, number>();
  const seatSold = new Map<string, number>();
  for (const seat of seats) {
    seatTotals.set(seat.show_id, (seatTotals.get(seat.show_id) ?? 0) + 1);
    if (seat.status === "sold") {
      seatSold.set(seat.show_id, (seatSold.get(seat.show_id) ?? 0) + 1);
    }
  }

  // Revenue per show from orders.
  const confirmed = new Map<string, number>();
  const pending = new Map<string, number>();
  const paidCount = new Map<string, number>();
  const overview: SalesOverview = {
    confirmedRevenue: 0,
    pendingRevenue: 0,
    paidOrders: 0,
    pendingOrders: 0,
    cancelledOrders: 0,
    soldSeats: 0,
    totalSeats: seats.length,
    avgOrderValue: 0,
  };

  for (const o of orders) {
    const total = Number(o.total_usd) || 0;
    if (o.status === "verified") {
      confirmed.set(o.show_id, (confirmed.get(o.show_id) ?? 0) + total);
      paidCount.set(o.show_id, (paidCount.get(o.show_id) ?? 0) + 1);
      overview.confirmedRevenue += total;
      overview.paidOrders += 1;
    } else if (o.status === "pending" || o.status === "reported") {
      pending.set(o.show_id, (pending.get(o.show_id) ?? 0) + total);
      overview.pendingRevenue += total;
      overview.pendingOrders += 1;
    } else if (o.status === "cancelled") {
      overview.cancelledOrders += 1;
    }
  }
  overview.soldSeats = [...seatSold.values()].reduce((a, b) => a + b, 0);
  overview.avgOrderValue =
    overview.paidOrders > 0
      ? overview.confirmedRevenue / overview.paidOrders
      : 0;

  // Revenue by month, oldest to newest, for the last REVENUE_TREND_MONTHS.
  const monthBuckets = new Map<string, number>();
  const now = new Date();
  for (let i = REVENUE_TREND_MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthBuckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
  }
  const methodRevenue = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "verified") continue;
    const total = Number(o.total_usd) || 0;
    if (o.verified_at) {
      const key = o.verified_at.slice(0, 7);
      if (monthBuckets.has(key)) {
        monthBuckets.set(key, (monthBuckets.get(key) ?? 0) + total);
      }
    }
    const method = o.payment_method
      ? (PAYMENT_METHOD_LABELS[o.payment_method] ?? o.payment_method)
      : "Sin especificar";
    methodRevenue.set(method, (methodRevenue.get(method) ?? 0) + total);
  }
  const revenueByMonth = [...monthBuckets.entries()].map(([month, revenue]) => ({
    month: monthLabel(month),
    revenue,
  }));
  const paymentMethodBreakdown = [...methodRevenue.entries()]
    .map(([method, revenue]) => ({ method, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const perShow: PerShowReport[] = shows.map((show) => {
    const totalSeats = seatTotals.get(show.id) ?? 0;
    const soldSeats = seatSold.get(show.id) ?? 0;
    return {
      show,
      totalSeats,
      soldSeats,
      occupancy: totalSeats > 0 ? soldSeats / totalSeats : 0,
      confirmedRevenue: confirmed.get(show.id) ?? 0,
      pendingRevenue: pending.get(show.id) ?? 0,
      paidOrders: paidCount.get(show.id) ?? 0,
    };
  });

  return {
    overview,
    perShow,
    orders,
    showName,
    revenueByMonth,
    paymentMethodBreakdown,
  };
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  const label = new Intl.DateTimeFormat("es-VE", { month: "short" }).format(d);
  return label.replace(".", "");
}

// ---------- Admin dashboard -----------------------------------

export type PendingOrderRow = {
  id: string;
  customerName: string;
  showId: string;
  showName: string;
  totalUsd: number;
  montoBs: number;
  paymentRef: string | null;
  status: Order["status"];
  createdAt: string;
};

export type DashboardData = {
  pendingOrders: PendingOrderRow[];
  revenueByShow: { show: string; revenue: number }[];
  occupancyByShow: { show: string; sold: number; total: number }[];
  revenueTrend: { date: string; revenue: number }[];
};

const NEEDS_ATTENTION: Order["status"][] = ["pending", "reported"];
const REVENUE_TREND_DAYS = 14;
const TOP_SHOWS = 6;

export async function getDashboardData(): Promise<DashboardData> {
  const admin = createAdminClient();
  const [{ data: orderData }, { data: showData }, { data: seatData }] =
    await Promise.all([
      admin.from("orders").select("*").order("created_at", { ascending: false }),
      admin.from("shows").select("*"),
      admin.from("seats").select("show_id,status"),
    ]);

  const orders = (orderData ?? []) as Order[];
  const shows = (showData ?? []) as Show[];
  const seats = (seatData ?? []) as Pick<Seat, "show_id" | "status">[];
  const showName = new Map(shows.map((s) => [s.id, s.name]));

  const pendingOrders: PendingOrderRow[] = orders
    .filter((o) => NEEDS_ATTENTION.includes(o.status))
    .map((o) => ({
      id: o.id,
      customerName: o.customer_name,
      showId: o.show_id,
      showName: showName.get(o.show_id) ?? "—",
      totalUsd: Number(o.total_usd) || 0,
      montoBs: Number(o.monto_bs) || 0,
      paymentRef: o.payment_ref,
      status: o.status,
      createdAt: o.created_at,
    }));

  const revenueMap = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "verified") continue;
    revenueMap.set(
      o.show_id,
      (revenueMap.get(o.show_id) ?? 0) + (Number(o.total_usd) || 0),
    );
  }
  const revenueByShow = [...revenueMap.entries()]
    .map(([showId, revenue]) => ({ show: showName.get(showId) ?? "—", revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, TOP_SHOWS);

  const totalMap = new Map<string, number>();
  const soldMap = new Map<string, number>();
  for (const s of seats) {
    totalMap.set(s.show_id, (totalMap.get(s.show_id) ?? 0) + 1);
    if (s.status === "sold") {
      soldMap.set(s.show_id, (soldMap.get(s.show_id) ?? 0) + 1);
    }
  }
  const occupancyByShow = shows
    .filter((s) => (totalMap.get(s.id) ?? 0) > 0)
    .map((s) => ({
      show: s.name,
      sold: soldMap.get(s.id) ?? 0,
      total: totalMap.get(s.id) ?? 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_SHOWS);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = new Map<string, number>();
  for (let i = REVENUE_TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const o of orders) {
    if (o.status !== "verified" || !o.verified_at) continue;
    const key = o.verified_at.slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + (Number(o.total_usd) || 0));
    }
  }
  const revenueTrend = [...buckets.entries()].map(([date, revenue]) => ({
    date,
    revenue,
  }));

  return { pendingOrders, revenueByShow, occupancyByShow, revenueTrend };
}

// ---------- Customers (derived from orders) ------------------

export type CustomerSummary = {
  name: string;
  email: string;
  phone: string;
  ordersCount: number;
  paidCount: number;
  cancelledCount: number;
  totalPaid: number;
  lastPurchase: string;
};

export async function getCustomers(): Promise<CustomerSummary[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });
  const orders = (data ?? []) as Order[];

  const map = new Map<string, CustomerSummary>();
  for (const o of orders) {
    const key = o.customer_email.trim().toLowerCase();
    const existing = map.get(key);
    const total = Number(o.total_usd) || 0;
    if (!existing) {
      map.set(key, {
        name: o.customer_name,
        email: o.customer_email,
        phone: o.customer_phone,
        ordersCount: 1,
        paidCount: o.status === "verified" ? 1 : 0,
        cancelledCount: o.status === "cancelled" ? 1 : 0,
        totalPaid: o.status === "verified" ? total : 0,
        lastPurchase: o.created_at,
      });
    } else {
      existing.ordersCount += 1;
      if (o.status === "verified") {
        existing.paidCount += 1;
        existing.totalPaid += total;
      }
      if (o.status === "cancelled") existing.cancelledCount += 1;
      // orders are newest-first, so the first seen name/phone is latest.
    }
  }

  return [...map.values()].sort(
    (a, b) =>
      new Date(b.lastPurchase).getTime() - new Date(a.lastPurchase).getTime(),
  );
}

export async function getCustomerOrders(
  email: string,
): Promise<{ orders: Order[]; showName: Record<string, string> }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("orders")
    .select("*")
    .ilike("customer_email", email)
    .order("created_at", { ascending: false });
  const orders = (data ?? []) as Order[];

  const { data: showData } = await admin.from("shows").select("id,name");
  const showName: Record<string, string> = {};
  for (const s of (showData ?? []) as Pick<Show, "id" | "name">[]) {
    showName[s.id] = s.name;
  }
  return { orders, showName };
}

// ---------- "Mis entradas" (logged-in customer) ---------------

export type MyOrder = { order: Order; show: Show | null; seats: Seat[] };

// Uses the session-bound client (anon key + the customer's own Auth
// cookie), NOT the service role — access here is enforced by RLS
// ("customer read own orders/shows/seats", migration 0012), matched
// against the email on the caller's own Supabase Auth session. A
// customer can only ever get their own rows back, by construction,
// regardless of what this function does with the result.
export async function getMyOrders(): Promise<MyOrder[]> {
  const supabase = await createClient();

  const { data: orderData } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });
  const orders = (orderData ?? []) as Order[];
  if (orders.length === 0) return [];

  const showIds = [...new Set(orders.map((o) => o.show_id))];
  const orderIds = orders.map((o) => o.id);

  const [{ data: showData }, { data: seatData }] = await Promise.all([
    supabase.from("shows").select("*").in("id", showIds),
    supabase.from("seats").select("*").in("held_by_order_id", orderIds),
  ]);
  const showById = new Map(((showData ?? []) as Show[]).map((s) => [s.id, s]));
  const seatsByOrder = new Map<string, Seat[]>();
  for (const seat of (seatData ?? []) as Seat[]) {
    if (!seat.held_by_order_id) continue;
    const list = seatsByOrder.get(seat.held_by_order_id) ?? [];
    list.push(seat);
    seatsByOrder.set(seat.held_by_order_id, list);
  }

  return orders.map((order) => ({
    order,
    show: showById.get(order.show_id) ?? null,
    seats: (seatsByOrder.get(order.id) ?? []).sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
  }));
}
