import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, FileText } from "lucide-react";
import { getOrderDetail } from "@/lib/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReceiptSignedUrl } from "@/lib/storage";
import { OrderActions } from "@/components/admin/order-actions";
import { ResolveConflictActions } from "@/components/admin/resolve-conflict-actions";
import { OrderStatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import {
  formatDualMoney,
  formatBs,
  formatDate,
  formatShortDate,
  formatDateOnly,
} from "@/lib/format";
import { orderCode } from "@/lib/whatsapp";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();

  const { order, show, seats } = detail;
  const conflict = order.needs_review_of
    ? await getOrderDetail(order.needs_review_of)
    : null;

  const admin = createAdminClient();
  const [{ data: amountMatches }, receiptUrl] = await Promise.all([
    order.monto_reportado != null
      ? admin.rpc("payment_matches", {
          p_reportado: order.monto_reportado,
          p_esperado: order.monto_bs,
        })
      : Promise.resolve({ data: null }),
    order.receipt_path ? getReceiptSignedUrl(admin, order.receipt_path) : Promise.resolve(null),
  ]);
  const amountMismatch = amountMatches === false;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Orden #{orderCode(order.id)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatShortDate(order.created_at)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {order.needs_review && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-medium">
              Requiere revisión: referencia de pago duplicada.
            </p>
            <p className="mt-1 text-destructive/90">
              Esta orden usa el mismo banco y referencia que{" "}
              {conflict ? (
                <Link
                  href={`/admin/orders/${conflict.order.id}`}
                  className="underline underline-offset-2"
                >
                  la orden #{orderCode(conflict.order.id)} de{" "}
                  {conflict.order.customer_name}
                </Link>
              ) : (
                "otra orden"
              )}
              . Verifica con ambos clientes cuál pago corresponde a cuál
              antes de confirmar cualquiera de las dos.
            </p>
            <ResolveConflictActions orderId={order.id} />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-2 text-sm font-medium">Cliente</h2>
        <Row label="Nombre" value={order.customer_name} />
        <Row label="Correo" value={order.customer_email} />
        <Row label="Teléfono" value={order.customer_phone} />
        <Row label="Cédula" value={order.cedula || "—"} />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-2 text-sm font-medium">Compra</h2>
        {show && (
          <>
            <Row
              label="Show"
              value={
                <Link
                  href={`/admin/shows/${show.id}`}
                  className="text-primary hover:underline"
                >
                  {show.name}
                </Link>
              }
            />
            <Row label="Fecha" value={<span className="capitalize">{formatDate(show.date)}</span>} />
          </>
        )}
        <Row label="Asientos" value={seats.map((s) => s.label).join(", ")} />
        <Row
          label="Método"
          value={
            order.payment_method
              ? PAYMENT_METHOD_LABELS[order.payment_method]
              : "—"
          }
        />
        <Row label="Referencia" value={order.payment_ref || "—"} />
        <Row label="Banco emisor" value={order.banco_emisor || "—"} />
        <Row
          label="Monto reportado"
          value={
            order.monto_reportado != null ? (
              <span className={cn(amountMismatch && "font-medium text-destructive")}>
                {formatBs(order.monto_reportado)}
                {amountMismatch && " ⚠"}
              </span>
            ) : (
              "—"
            )
          }
        />
        {amountMismatch && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            El monto reportado no coincide con lo esperado (
            {formatBs(order.monto_bs)}) más allá de la tolerancia. Verifica el
            comprobante antes de confirmar.
          </p>
        )}
        <Row
          label="Fecha de pago"
          value={order.fecha_pago ? formatDateOnly(order.fecha_pago) : "—"}
        />
        <Row
          label="Comprobante"
          value={
            receiptUrl ? (
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <FileText className="size-3.5" />
                Ver comprobante
              </a>
            ) : (
              "—"
            )
          }
        />
        <Row
          label={`Tasa (${formatDateOnly(order.tasa_fecha.slice(0, 10))})`}
          value={`${order.tasa} Bs/USD`}
        />
        <div className="mt-2 flex justify-between border-t border-border pt-3 font-medium">
          <span>Total</span>
          <span className="tabular-nums">
            {formatDualMoney(order.total_usd, order.monto_bs)}
          </span>
        </div>
        {order.status === "rejected" && order.rejected_reason && (
          <p className="mt-3 text-xs text-destructive">
            Motivo del rechazo: {order.rejected_reason}
          </p>
        )}
        {order.used_at && (
          <p className="mt-3 text-xs text-success">
            Entrada escaneada el {formatShortDate(order.used_at)}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <OrderActions
          orderId={order.id}
          status={order.status}
          note={order.admin_note}
        />
      </div>
    </div>
  );
}
