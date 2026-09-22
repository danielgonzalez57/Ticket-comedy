import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Mail, Phone } from "lucide-react";
import { getCustomerOrders } from "@/lib/queries";
import { OrderStatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatDualMoney, formatShortDate } from "@/lib/format";
import { orderCode, whatsappUrl, normalizeVePhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ email: string }>;
}) {
  const { email } = await params;
  const decoded = decodeURIComponent(email);
  const { orders, showName } = await getCustomerOrders(decoded);

  if (orders.length === 0) notFound();

  const latest = orders[0];
  const totalPaid = orders
    .filter((o) => o.status === "verified")
    .reduce((sum, o) => sum + (Number(o.total_usd) || 0), 0);
  const paidCount = orders.filter((o) => o.status === "verified").length;
  const wa = whatsappUrl(
    normalizeVePhone(latest.customer_phone),
    `Hola ${latest.customer_name}, te escribimos de Pinto & Aparte.`,
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/clientes"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Clientes
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {latest.customer_name}
        </h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              Compras
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">{orders.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              Pagadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">{paidCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              Total pagado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums text-success">
              {formatMoney(totalPaid)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Mail className="size-4" /> {latest.customer_email}
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <Phone className="size-4" /> {latest.customer_phone}
        </span>
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-2 rounded-md bg-success px-3 py-1.5 text-xs font-medium text-success-foreground"
        >
          <MessageCircle className="size-3.5" /> WhatsApp
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Orden</TableHead>
              <TableHead>Show</TableHead>
              <TableHead className="text-right">Asientos</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="font-mono text-xs hover:underline"
                  >
                    #{orderCode(o.id)}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {showName[o.show_id] ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {o.seat_ids.length}
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
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
