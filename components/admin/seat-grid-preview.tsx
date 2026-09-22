import { rowLabel } from "@/lib/seats";

// Non-interactive visual preview of an empty grid (used in the show form).
export function SeatGridPreview({ rows, cols }: { rows: number; cols: number }) {
  const safeRows = Math.max(0, Math.min(26, rows || 0));
  const safeCols = Math.max(0, Math.min(40, cols || 0));

  return (
    <div className="space-y-2">
      <div className="mx-auto w-3/4 rounded bg-secondary py-1 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
        Escenario
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          {Array.from({ length: safeRows }).map((_, r) => (
            <div key={r} className="flex items-center gap-1">
              <span className="w-4 shrink-0 text-right text-[9px] text-muted-foreground">
                {rowLabel(r)}
              </span>
              {Array.from({ length: safeCols }).map((_, c) => (
                <div
                  key={c}
                  className="size-3.5 shrink-0 rounded-[3px] bg-seat-available"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
