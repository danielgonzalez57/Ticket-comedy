"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { MAX_SEATS_PER_ORDER } from "@/lib/constants";
import { formatMoney, formatBs } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

// Small "people buying right now" signal — not real activity data (we
// don't track concurrent viewers), just a stable-looking hint so the
// public page doesn't expose the real sold/available count. Deterministic
// per show + a 15-minute time bucket, so it doesn't flicker to a
// different number on every reload — it just drifts slowly like a real
// count would.
function fakeBuyersNow(showId: string): number {
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  const input = `${showId}:${bucket}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return 1 + (hash % 4); // 1–4
}

// Replaces the old interactive seat map: seats are no longer chosen,
// they're assigned automatically in arrival order (see
// create_pending_order_by_qty, supabase/migrations/0014). The buyer
// only picks how many.
export function SeatQuantityPicker({
  showId,
  basePrice,
  tasa,
  available,
}: {
  showId: string;
  basePrice: number;
  tasa: number;
  available: number;
}) {
  const router = useRouter();
  const max = Math.max(0, Math.min(MAX_SEATS_PER_ORDER, available));
  const [qty, setQty] = useState(max > 0 ? 1 : 0);
  const [submitting, setSubmitting] = useState(false);
  const [totalBs, setTotalBs] = useState(0);
  const buyersNow = useMemo(() => fakeBuyersNow(showId), [showId]);

  const total = qty * basePrice;

  // Same reasoning as the old seat picker: round AFTER summing via
  // the DB's usd_to_bs(), not a client-side reimplementation. See
  // supabase/migrations/0006_public_currency_previews.sql.
  useEffect(() => {
    if (total === 0) {
      setTotalBs(0);
      return;
    }
    let cancelled = false;
    createClient()
      .rpc("usd_to_bs", { p_usd: total, p_tasa: tasa })
      .then(({ data }) => {
        if (!cancelled && typeof data === "number") setTotalBs(data);
      });
    return () => {
      cancelled = true;
    };
  }, [total, tasa]);

  function reserve() {
    if (qty === 0) return;
    setSubmitting(true);
    router.push(`/shows/${showId}/checkout?qty=${qty}`);
  }

  if (max === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <p className="font-heading text-lg uppercase text-muted-foreground">
          Agotado
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Ya no quedan entradas disponibles para este show.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Las entradas se asignan por orden de llegada.
      </p>
      <p className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-500">
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        {buyersNow} {buyersNow === 1 ? "persona está comprando" : "personas están comprando"} ahora
      </p>

      <div className="flex items-center gap-4">
        <div className="flex items-center rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
            className="flex size-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            aria-label="Menos entradas"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-10 text-center font-heading text-lg font-bold tabular-nums">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(max, q + 1))}
            disabled={qty >= max}
            className="flex size-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            aria-label="Más entradas"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <span className="text-xs text-muted-foreground">
          Máximo {max} por orden
        </span>
      </div>

      <div className="sticky bottom-3 z-10 rounded-xl border border-border bg-background/90 px-4 py-3 shadow-lg backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">
              {qty} entrada(s)
            </p>
            <p className="font-heading text-2xl font-extrabold tabular-nums">
              {formatMoney(total)}
            </p>
            <p className="text-xs text-muted-foreground">{formatBs(totalBs)}</p>
          </div>
          <Button
            size="lg"
            onClick={reserve}
            disabled={qty === 0 || submitting}
            className="font-semibold"
          >
            {submitting ? "Cargando…" : "Reservar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
