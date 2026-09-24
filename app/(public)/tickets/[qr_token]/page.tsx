import Image from "next/image";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle, AlertTriangle } from "lucide-react";
import { getOrderByToken } from "@/lib/queries";
import { qrDataUrl } from "@/lib/qr";
import { formatDate, formatShortDate } from "@/lib/format";
import { orderCode } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ qr_token: string }>;
}) {
  const { qr_token } = await params;
  const detail = await getOrderByToken(qr_token);
  if (!detail) notFound();

  const { order, show, seats } = detail;
  const paid = order.status === "verified";
  const used = Boolean(order.used_at);
  const qr = paid ? await qrDataUrl(order.qr_token) : null;

  return (
    <div className="mx-auto max-w-sm space-y-5">
      <Banner status={order.status} used={used} usedAt={order.used_at} />

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {qr && (
          <div className="flex justify-center bg-white p-6">
            <Image
              src={qr}
              alt="Código QR de la entrada"
              width={240}
              height={240}
              unoptimized
            />
          </div>
        )}
        <div className="space-y-3 p-5">
          {show && (
            <div className="space-y-0.5">
              <p className="text-lg font-semibold">{show.name}</p>
              <p className="text-sm capitalize text-muted-foreground">
                {formatDate(show.date)}
              </p>
              <p className="text-sm text-muted-foreground">{show.venue}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
            <Field label="A nombre de" value={order.customer_name} />
            <Field label="Código" value={orderCode(order.id)} mono />
            <Field label="Entradas" value={String(seats.length)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono font-medium" : "font-medium"}>{value}</p>
    </div>
  );
}

function Banner({
  status,
  used,
  usedAt,
}: {
  status: string;
  used: boolean;
  usedAt: string | null;
}) {
  if (status !== "verified") {
    const cancelled = status === "cancelled" || status === "rejected" || status === "expired";
    return (
      <div
        className={`flex items-center gap-3 rounded-xl border p-4 ${
          cancelled
            ? "border-destructive/30 bg-destructive/10"
            : "border-primary/30 bg-primary/10"
        }`}
      >
        {cancelled ? (
          <XCircle className="size-6 text-destructive" />
        ) : (
          <Clock className="size-6 text-primary" />
        )}
        <p className="text-sm font-medium">
          {cancelled
            ? "Entrada cancelada — no válida."
            : "Pago pendiente — entrada aún no válida."}
        </p>
      </div>
    );
  }
  if (used) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <AlertTriangle className="size-6 text-amber-400" />
        <div>
          <p className="text-sm font-medium text-amber-400">Entrada ya utilizada</p>
          {usedAt && (
            <p className="text-xs text-muted-foreground">
              Escaneada el {formatShortDate(usedAt)}
            </p>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4">
      <CheckCircle2 className="size-6 text-success" />
      <p className="text-sm font-medium text-success">Entrada válida</p>
    </div>
  );
}
