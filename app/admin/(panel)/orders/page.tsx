import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { OrderStatusBadge } from "@/components/status-badge";
import { QuerySelect } from "@/components/query-select";
import { QuerySearch } from "@/components/admin/query-search";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDualMoney, formatShortDate } from "@/lib/format";
import { orderCode } from "@/lib/whatsapp";
import type { Order, Show } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pendientes" },
  { value: "reported", label: "Pago reportado" },
  { value: "verified", label: "Verificadas" },
  { value: "rejected", label: "Rechazadas" },
  { value: "expired", label: "Vencidas" },
  { value: "cancelled", label: "Canceladas" },
];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; show?: string; q?: string }>;
}) {
  const { status, show, q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  const VALID_STATUSES: Order["status"][] = [
    "pending",
    "reported",
    "verified",
    "rejected",
    "expired",
    "cancelled",
  ];
  if (status && VALID_STATUSES.includes(status as Order["status"])) {
    query = query.eq("status", status as Order["status"]);
  }
  if (show) query = query.eq("show_id", show);
  if (q) {
    // Strip characters that would break PostgREST's or() filter syntax.
    const like = `%${q.replace(/[,()%]/g, "")}%`;
    query = query.or(
      `customer_name.ilike.${like},customer_email.ilike.${like},payment_ref.ilike.${like}`,
    );
  }

  const [{ data: orderData }, { data: showData }] = await Promise.all([
    query,
    supabase.from("shows").select("*").order("date", { ascending: false }),
  ]);

  const orders = (orderData ?? []) as Order[];
  const shows = (showData ?? []) as Show[];
  const showName = new Map(shows.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Órdenes</h1>

      <div className="flex flex-wrap gap-3">
        <QuerySearch placeholder="Buscar cliente, referencia..." />
        <QuerySelect
          param="status"
          placeholder="Todos los estados"
          options={STATUS_OPTIONS}
        />
        <QuerySelect
          param="show"
          placeholder="Todos los shows"
          options={shows.map((s) => ({ value: s.id, label: s.name }))}
        />
      </div>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No hay órdenes que coincidan.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/admin/orders/${o.id}`}
              className={cn(
                "flex flex-col gap-2 p-4 transition-colors hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                o.needs_review && "bg-destructive/5",
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {o.customer_name}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    #{orderCode(o.id)}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {showName.get(o.show_id) ?? "—"} · {o.seat_ids.length} asiento(s) ·{" "}
                  {formatShortDate(o.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm sm:gap-3">
                {o.needs_review && (
                  <Badge className="gap-1 border-transparent bg-destructive/15 text-destructive">
                    <AlertTriangle className="size-3" />
                    Revisar
                  </Badge>
                )}
                <span className="tabular-nums">
                  {formatDualMoney(o.total_usd, o.monto_bs)}
                </span>
                <OrderStatusBadge status={o.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
