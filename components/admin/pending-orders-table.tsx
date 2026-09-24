"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { OrderStatusBadge } from "@/components/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDualMoney, formatShortDate } from "@/lib/format";
import { orderCode } from "@/lib/whatsapp";
import type { PendingOrderRow } from "@/lib/queries";

const ALL = "__all__";
const STATUS_ITEMS = [
  { value: ALL, label: "Todos los estados" },
  { value: "pending", label: "Pendiente" },
  { value: "reported", label: "Pago reportado" },
];

export function PendingOrdersTable({ orders }: { orders: PendingOrderRow[] }) {
  const router = useRouter();
  const [show, setShow] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [query, setQuery] = useState("");

  const showOptions = useMemo(
    () => [...new Set(orders.map((o) => o.showName))].sort(),
    [orders],
  );
  const showItems = useMemo(
    () => [
      { value: ALL, label: "Todos los shows" },
      ...showOptions.map((s) => ({ value: s, label: s })),
    ],
    [showOptions],
  );

  const q = query.trim().toLowerCase();
  const filtered = orders.filter(
    (o) =>
      (show === ALL || o.showName === show) &&
      (status === ALL || o.status === status) &&
      (!q ||
        o.customerName.toLowerCase().includes(q) ||
        o.showName.toLowerCase().includes(q) ||
        (o.paymentRef ?? "").toLowerCase().includes(q) ||
        orderCode(o.id).toLowerCase().includes(q)),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente, referencia..."
            className="h-9 w-full rounded-lg border border-input bg-card pl-8 sm:w-56 pr-3 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:border-foreground/20"
          />
        </div>
        <Select items={STATUS_ITEMS} value={status} onValueChange={(v) => setStatus(v ?? ALL)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ITEMS.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={showItems} value={show} onValueChange={(v) => setShow(v ?? ALL)}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Todos los shows" />
          </SelectTrigger>
          <SelectContent>
            {showItems.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No hay órdenes por atender.
        </p>
      ) : (
        <>
        {/* Phones: one tappable card per order instead of a 6-column table. */}
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border md:hidden">
          {filtered.map((o) => (
            <li key={o.id}>
              <Link
                href={`/admin/orders/${o.id}`}
                className="block space-y-2 p-4 transition-colors active:bg-secondary/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{o.customerName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.showName}
                    </p>
                  </div>
                  <OrderStatusBadge status={o.status} />
                </div>
                <div className="flex items-end justify-between gap-3 text-xs text-muted-foreground">
                  <span className="font-mono">
                    #{orderCode(o.id)}
                    {o.paymentRef && <> · ref {o.paymentRef}</>}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-medium text-foreground tabular-nums">
                      {formatDualMoney(o.totalUsd, o.montoBs)}
                    </span>
                    {formatShortDate(o.createdAt)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-normal">Cliente</th>
                <th className="px-4 py-2.5 font-normal">Show</th>
                <th className="px-4 py-2.5 font-normal">Referencia</th>
                <th className="px-4 py-2.5 text-right font-normal">Monto</th>
                <th className="px-4 py-2.5 font-normal">Estado</th>
                <th className="px-4 py-2.5 text-right font-normal">Llegó</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => router.push(`/admin/orders/${o.id}`)}
                  className="cursor-pointer transition-colors hover:bg-secondary/40"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{o.customerName}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      #{orderCode(o.id)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {o.showName}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {o.paymentRef ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatDualMoney(o.totalUsd, o.montoBs)}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {formatShortDate(o.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
