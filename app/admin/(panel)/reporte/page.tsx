import Link from "next/link";
import { getSalesReport } from "@/lib/queries";
import { OrderStatusBadge } from "@/components/status-badge";
import { QuerySelect } from "@/components/query-select";
import { QuerySearch } from "@/components/admin/query-search";
import { HorizontalBarChart } from "@/components/admin/horizontal-bar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatDualMoney, formatShortDate } from "@/lib/format";
import { orderCode } from "@/lib/whatsapp";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pendientes" },
  { value: "reported", label: "Pago reportado" },
  { value: "verified", label: "Verificadas" },
  { value: "rejected", label: "Rechazadas" },
  { value: "expired", label: "Vencidas" },
  { value: "cancelled", label: "Canceladas" },
];

export default async function ReportePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; show?: string; q?: string }>;
}) {
  const { status, show, q } = await searchParams;
  const { overview, perShow, orders, showName, revenueByMonth, paymentMethodBreakdown } =
    await getSalesReport();

  const query = q?.trim().toLowerCase();
  const filtered = orders.filter(
    (o) =>
      (!status || o.status === status) &&
      (!show || o.show_id === show) &&
      (!query ||
        o.customer_name.toLowerCase().includes(query) ||
        o.customer_email.toLowerCase().includes(query) ||
        (o.payment_ref ?? "").toLowerCase().includes(query)),
  );

  const overallOccupancy =
    overview.totalSeats > 0 ? overview.soldSeats / overview.totalSeats : 0;

  const stats = [
    {
      label: "Ingresos confirmados",
      value: formatMoney(overview.confirmedRevenue),
      accent: "text-success",
    },
    {
      label: "Por cobrar (pendiente)",
      value: formatMoney(overview.pendingRevenue),
      accent: "text-primary",
    },
    { label: "Ticket promedio", value: formatMoney(overview.avgOrderValue) },
    {
      label: "Ocupación general",
      value: `${Math.round(overallOccupancy * 100)}%`,
    },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold tracking-tight">Reporte de ventas</h1>

      {/* Overview */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-normal text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`break-words text-lg font-semibold tabular-nums sm:text-xl ${s.accent ?? ""}`}>
                {s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Ingresos por mes</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={revenueByMonth.map((r) => ({ label: r.month, value: r.revenue }))}
              emptyLabel="Todavía no hay ventas confirmadas."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Métodos de pago</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={paymentMethodBreakdown.map((r) => ({
                label: r.method,
                value: r.revenue,
              }))}
              emptyLabel="Todavía no hay pagos confirmados."
            />
          </CardContent>
        </Card>
      </div>

      {/* Per-show summary */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Por show</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Show</TableHead>
                <TableHead className="text-right">Vendidos</TableHead>
                <TableHead className="text-right">Ocupación</TableHead>
                <TableHead className="text-right">Confirmado</TableHead>
                <TableHead className="text-right">Pendiente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perShow.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Sin shows todavía.
                  </TableCell>
                </TableRow>
              ) : (
                perShow.map((r) => (
                  <TableRow key={r.show.id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/shows/${r.show.id}`} className="hover:underline">
                        {r.show.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.soldSeats}/{r.totalSeats}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Math.round(r.occupancy * 100)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {formatMoney(r.confirmedRevenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatMoney(r.pendingRevenue)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Detailed per-order table */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Detalle de ventas ({filtered.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            <QuerySearch placeholder="Buscar cliente, referencia..." />
            <QuerySelect
              param="status"
              placeholder="Todos los estados"
              options={STATUS_OPTIONS}
            />
            <QuerySelect
              param="show"
              placeholder="Todos los shows"
              options={perShow.map((r) => ({ value: r.show.id, label: r.show.name }))}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Show</TableHead>
                <TableHead>Asientos</TableHead>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No hay ventas que coincidan.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
                        {o.customer_name}
                      </Link>
                      <span className="ml-1 font-mono text-xs text-muted-foreground">
                        #{orderCode(o.id)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {showName[o.show_id] ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{o.seat_ids.length}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {o.payment_method ? PAYMENT_METHOD_LABELS[o.payment_method] : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDualMoney(o.total_usd, o.monto_bs)}
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatShortDate(o.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
