import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle, MessageCircle } from "lucide-react";
import { getOrderDetail } from "@/lib/queries";
import { ReportPaymentForm } from "@/components/report-payment-form";
import { PaymentInfoFields } from "@/components/payment-info-fields";
import { formatDualMoney, formatDate } from "@/lib/format";
import {
  paymentInfo,
  whatsappAdmin,
  PAYMENT_METHOD_LABELS,
  BANK_RECONCILED_METHODS,
} from "@/lib/constants";
import { whatsappUrl, orderCode } from "@/lib/whatsapp";
import type { OrderStatus } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const AWAITING_PAYMENT: OrderStatus[] = ["pending", "reported"];

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();

  const { order, show, seats } = detail;
  const code = orderCode(order.id);
  const admin = whatsappAdmin();
  const contactUrl = admin
    ? whatsappUrl(
        admin,
        `Hola, hice una orden en Pinto & Aparte. Código: ${code}. Acabo de pagar (${
          order.payment_method ? PAYMENT_METHOD_LABELS[order.payment_method] : ""
        }${order.payment_ref ? `, ref ${order.payment_ref}` : ""}).`,
      )
    : null;

  return (
    <div className="space-y-6">
      <StatusBanner status={order.status} />

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Código de orden
            </p>
            <p className="font-mono text-lg font-semibold">{code}</p>
          </div>
          <p className="text-right text-lg font-semibold tabular-nums">
            {formatDualMoney(order.total_usd, order.monto_bs)}
          </p>
        </div>

        {show && (
          <div className="mt-4 space-y-0.5 border-t border-border pt-4 text-sm">
            <p className="font-medium">{show.name}</p>
            <p className="capitalize text-muted-foreground">
              {formatDate(show.date)}
            </p>
            <p className="text-muted-foreground">{show.venue}</p>
          </div>
        )}

        <div className="mt-4 border-t border-border pt-4 text-sm">
          <p className="text-muted-foreground">
            Asientos:{" "}
            <span className="text-foreground">
              {seats.map((s) => s.label).join(", ")}
            </span>
          </p>
          <p className="text-muted-foreground">
            A nombre de <span className="text-foreground">{order.customer_name}</span>
          </p>
        </div>
      </div>

      {AWAITING_PAYMENT.includes(order.status) && (
        <>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <p className="font-medium">Completa tu pago</p>
            <PaymentInfoFields raw={paymentInfo()} />
            {order.payment_ref && (
              <p className="mt-2 text-xs text-muted-foreground">
                Referencia registrada:{" "}
                <span className="font-mono">{order.payment_ref}</span>
              </p>
            )}
          </div>

          {order.status === "pending" &&
          order.payment_method &&
          BANK_RECONCILED_METHODS.includes(order.payment_method) ? (
            <ReportPaymentForm orderId={order.id} />
          ) : (
            contactUrl && (
              <a
                href={contactUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-md bg-success px-4 py-2.5 text-sm font-medium text-success-foreground"
              >
                <MessageCircle className="size-4" />
                Avisar al admin por WhatsApp
              </a>
            )
          )}
          <p className="text-center text-xs text-muted-foreground">
            Guarda este enlace. Aquí verás cuando tu pago sea confirmado.
          </p>
        </>
      )}

      {order.status === "verified" && (
        <Link
          href={`/tickets/${order.qr_token}`}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Ver mi entrada
        </Link>
      )}

      {order.status === "rejected" && order.rejected_reason && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-center text-sm text-muted-foreground">
          Motivo: {order.rejected_reason}
        </p>
      )}
    </div>
  );
}

function StatusBanner({ status }: { status: OrderStatus }) {
  if (status === "verified") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4">
        <CheckCircle2 className="size-6 text-success" />
        <div>
          <p className="font-medium text-success">Pago confirmado</p>
          <p className="text-sm text-muted-foreground">
            Tu entrada está lista. ¡Nos vemos en el show!
          </p>
        </div>
      </div>
    );
  }
  if (status === "cancelled" || status === "rejected" || status === "expired") {
    const copy = {
      cancelled: "Esta orden fue cancelada. Si crees que es un error, contacta al admin.",
      rejected: "No pudimos verificar tu pago para esta orden.",
      expired: "Esta reserva venció antes de completar el pago.",
    }[status];
    return (
      <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
        <XCircle className="size-6 text-destructive" />
        <div>
          <p className="font-medium text-destructive">
            {status === "cancelled" ? "Orden cancelada" : status === "rejected" ? "Pago rechazado" : "Reserva vencida"}
          </p>
          <p className="text-sm text-muted-foreground">{copy}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
      <Clock className="size-6 text-primary" />
      <div>
        <p className="font-medium text-primary">
          {status === "reported" ? "Pago reportado" : "Reserva pendiente de pago"}
        </p>
        <p className="text-sm text-muted-foreground">
          {status === "reported"
            ? "Recibimos los datos de tu pago. Espera la confirmación del admin."
            : "Realiza el pago y espera la confirmación del admin."}
        </p>
      </div>
    </div>
  );
}
