import Link from "next/link";
import { Ticket, LogOut } from "lucide-react";
import { signOutCustomer } from "@/app/(public)/mis-entradas/actions";
import { OrderStatusBadge } from "@/components/status-badge";
import { formatDate, formatShortDate, formatDualMoney } from "@/lib/format";
import { orderCode } from "@/lib/whatsapp";
import type { MyOrder } from "@/lib/queries";

export function MyTicketsList({
  email,
  orders,
}: {
  email: string;
  orders: MyOrder[];
}) {
  const unredeemed = orders
    .filter((o) => o.order.status === "verified" && !o.order.used_at)
    .sort(
      (a, b) =>
        new Date(a.show?.date ?? 0).getTime() -
        new Date(b.show?.date ?? 0).getTime(),
    );
  const rest = orders.filter(
    (o) => !(o.order.status === "verified" && !o.order.used_at),
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Mis entradas</h1>
          <p className="mt-1 text-sm text-muted-foreground">{email}</p>
        </div>
        <form action={signOutCustomer}>
          <button
            type="submit"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            Salir
          </button>
        </form>
      </div>

      {orders.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Todavía no tienes órdenes con este correo.
        </p>
      )}

      {unredeemed.length > 0 && (
        <Section title="Por usar">
          {unredeemed.map(({ order, show, seats }) => (
            <Link
              key={order.id}
              href={`/tickets/${order.qr_token}`}
              className="flex items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Ticket className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {show?.name ?? "Show"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {show ? formatDate(show.date) : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {seats.length} {seats.length === 1 ? "entrada" : "entradas"}
                </p>
              </div>
              <OrderStatusBadge status={order.status} />
            </Link>
          ))}
        </Section>
      )}

      {rest.length > 0 && (
        <Section title="Historial">
          {rest.map(({ order, show, seats }) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/40"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {show?.name ?? "Show"}
                </p>
                <p className="text-xs text-muted-foreground">
                  #{orderCode(order.id)} · {formatShortDate(order.created_at)}
                  {seats.length > 0 &&
                    ` · ${seats.length} ${seats.length === 1 ? "entrada" : "entradas"}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDualMoney(order.total_usd, order.monto_bs)}
                  {order.status === "verified" && order.used_at
                    ? ` · Usada el ${formatShortDate(order.used_at)}`
                    : ""}
                </p>
              </div>
              <OrderStatusBadge status={order.status} />
            </Link>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
