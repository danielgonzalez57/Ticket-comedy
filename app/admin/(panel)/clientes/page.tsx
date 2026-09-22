import Link from "next/link";
import { getCustomers } from "@/lib/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const customers = await getCustomers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-sm text-muted-foreground">
          {customers.length} cliente(s) que han comprado o reservado.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead className="text-right">Compras</TableHead>
              <TableHead className="text-right">Pagadas</TableHead>
              <TableHead className="text-right">Total pagado</TableHead>
              <TableHead className="text-right">Última</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Aún no hay clientes.
                </TableCell>
              </TableRow>
            ) : (
              customers.map((c) => (
                <TableRow key={c.email}>
                  <TableCell>
                    <Link
                      href={`/admin/clientes/${encodeURIComponent(c.email)}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <div>{c.email}</div>
                    <div className="text-xs">{c.phone}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.ordersCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.paidCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-success">
                    {formatMoney(c.totalPaid)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatShortDate(c.lastPurchase)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
