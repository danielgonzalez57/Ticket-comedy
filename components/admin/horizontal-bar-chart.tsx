"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

export function HorizontalBarChart({
  data,
  emptyLabel = "Todavía no hay datos.",
  formatValue = formatMoney,
}: {
  data: { label: string; value: number }[];
  emptyLabel?: string;
  formatValue?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const pct = Math.max(2, (d.value / max) * 100);
        const isHover = hover === i;
        return (
          <div
            key={d.label}
            className="cursor-default"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-foreground/80">{d.label}</span>
              <span
                className={`shrink-0 tabular-nums transition-colors ${
                  isHover ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {formatValue(d.value)}
              </span>
            </div>
            <div className="h-[6px] w-full overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${pct}%`,
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
