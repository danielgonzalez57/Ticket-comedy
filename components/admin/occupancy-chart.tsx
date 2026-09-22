"use client";

import { useState } from "react";

export function OccupancyChart({
  data,
}: {
  data: { show: string; sold: number; total: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Todavía no hay asientos configurados.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const pct = d.total > 0 ? d.sold / d.total : 0;
        const isHover = hover === i;
        return (
          <div
            key={d.show}
            className="cursor-default"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-foreground/80">{d.show}</span>
              <span
                className={`shrink-0 tabular-nums transition-colors ${
                  isHover ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {d.sold}/{d.total} · {Math.round(pct * 100)}%
              </span>
            </div>
            <div className="flex h-[6px] w-full gap-0.5 overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${Math.max(pct * 100, d.sold > 0 ? 2 : 0)}%`,
                  opacity: isHover ? 1 : 0.85,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
