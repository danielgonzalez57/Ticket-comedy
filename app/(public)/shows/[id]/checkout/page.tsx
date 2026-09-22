import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CheckoutForm } from "@/components/checkout-form";
import { effectiveStatus } from "@/lib/seats";
import { formatMoney, formatBs } from "@/lib/format";
import { paymentInfo, MAX_SEATS_PER_ORDER } from "@/lib/constants";
import type { SeatWithBs, ShowWithBs } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ qty?: string }>;
}) {
  const { id } = await params;
  const { qty: qtyParam } = await searchParams;
  const qty = Math.min(
    MAX_SEATS_PER_ORDER,
    Math.max(1, Math.trunc(Number(qtyParam) || 0)),
  );

  const supabase = await createClient();
  const { data: show } = await supabase
    .from("shows_public")
    .select("*")
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (!show) notFound();
  const typedShow = show as ShowWithBs;

  // Seats aren't chosen anymore — they're assigned automatically in
  // arrival order when the order is created (see
  // create_pending_order_by_qty, supabase/migrations/0014). Here we
  // only need to know whether there's still enough inventory left for
  // this quantity.
  const { data: seatsData } = await supabase
    .from("seats_public")
    .select("*")
    .eq("show_id", id);
  const seats = (seatsData ?? []) as SeatWithBs[];
  const available = seats.filter((s) => effectiveStatus(s) === "available").length;
  const enoughAvailable = qtyParam != null && qty > 0 && available >= qty;

  const total = qty * Number(typedShow.base_price);

  // The total in Bs must be usd_to_bs(sum(price), tasa) — rounding
  // AFTER summing, exactly like create_pending_order_by_qty computes
  // monto_bs. See supabase/migrations/0006_public_currency_previews.sql.
  // This is the exact amount the "Transfiere exactamente" instruction
  // below quotes, so it has to be bit-for-bit what the order will store.
  const { data: totalBsData } = await supabase.rpc("usd_to_bs", {
    p_usd: total,
    p_tasa: typedShow.tasa,
  });
  const totalBs = totalBsData ?? 0;

  if (!enoughAvailable) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Entradas no disponibles</h1>
        <p className="text-sm text-muted-foreground">
          Tu selección expiró o ya no quedan suficientes entradas disponibles.
          Por favor vuelve al show e intenta de nuevo.
        </p>
        <Link
          href={`/shows/${id}`}
          className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Volver al show
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Confirmar reserva</h1>
        <p className="text-sm text-muted-foreground">{typedShow.name}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-medium">Tu selección</h2>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {qty} entrada{qty > 1 ? "s" : ""}
          </span>
          <span className="tabular-nums">{formatMoney(typedShow.base_price)} c/u</span>
        </div>
        <div className="mt-3 flex justify-between border-t border-border pt-3 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(total)}</span>
        </div>
        <div className="flex justify-end">
          <span className="text-xs text-muted-foreground">
            {formatBs(totalBs)}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">Datos para tu pago</p>
            <p className="text-muted-foreground">{paymentInfo()}</p>
            <p className="text-xs text-muted-foreground/80">
              Transfiere exactamente {formatBs(totalBs)}{" "}
              (tasa {typedShow.tasa} Bs/USD).
            </p>
            <p className="text-xs text-muted-foreground/80">
              Realiza el pago e indica la referencia abajo. El admin confirmará
              tu entrada manualmente.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <CheckoutForm showId={typedShow.id} quantity={qty} />
      </div>
    </div>
  );
}
