"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { setSeatStatus } from "@/app/admin/(panel)/shows/actions";
import type { Seat, SeatStatus } from "@/lib/database.types";
import { rowLabel } from "@/lib/seats";
import { cn } from "@/lib/utils";

export function SeatEditor({ seats }: { seats: Seat[] }) {
  const [local, setLocal] = useState<Record<string, SeatStatus>>(() =>
    Object.fromEntries(seats.map((s) => [s.id, s.status])),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const rows = new Map<number, Seat[]>();
  for (const seat of seats) {
    const arr = rows.get(seat.row_index) ?? [];
    arr.push(seat);
    rows.set(seat.row_index, arr);
  }
  const sortedRows = [...rows.entries()].sort((a, b) => a[0] - b[0]);

  function toggle(seat: Seat) {
    const current = local[seat.id];
    if (current === "sold" || current === "held") return;
    const next: SeatStatus = current === "disabled" ? "available" : "disabled";
    setLocal((s) => ({ ...s, [seat.id]: next }));
    setPendingId(seat.id);
    startTransition(async () => {
      try {
        await setSeatStatus(seat.id, next);
      } catch {
        // Revert on failure.
        setLocal((s) => ({ ...s, [seat.id]: current }));
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Toca un asiento para deshabilitarlo o volverlo a habilitar. Los asientos
        vendidos o en reserva no se pueden modificar.
      </p>

      <div className="mx-auto w-2/3 max-w-xs rounded bg-secondary py-1 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
        Escenario
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="inline-flex flex-col gap-1.5">
          {sortedRows.map(([rowIndex, rowSeats]) => (
            <div key={rowIndex} className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-right text-[10px] text-muted-foreground">
                {rowLabel(rowIndex)}
              </span>
              {rowSeats
                .sort((a, b) => a.col_index - b.col_index)
                .map((seat) => {
                  const status = local[seat.id];
                  const locked = status === "sold" || status === "held";
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      onClick={() => toggle(seat)}
                      disabled={locked || pendingId === seat.id}
                      title={`${seat.label} · ${status}`}
                      className={cn(
                        "relative flex size-6 shrink-0 items-center justify-center rounded-[4px] text-[8px] transition-colors",
                        status === "available" &&
                          "bg-seat-available hover:ring-1 hover:ring-primary/60",
                        status === "disabled" &&
                          "bg-seat-sold text-muted-foreground",
                        status === "sold" && "bg-seat-sold opacity-60",
                        status === "held" && "bg-seat-hold",
                        pendingId === seat.id && "opacity-50",
                      )}
                    >
                      {status === "disabled" ? (
                        <X className="size-3" />
                      ) : (
                        seat.col_index + 1
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  const items = [
    { label: "Disponible", className: "bg-seat-available" },
    { label: "Reservado", className: "bg-seat-hold" },
    { label: "Vendido", className: "bg-seat-sold opacity-60" },
    { label: "Deshabilitado", className: "bg-seat-sold" },
  ];
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded-[3px]", i.className)} />
          {i.label}
        </div>
      ))}
    </div>
  );
}
