"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { QuerySelect } from "@/components/query-select";

const dateClass =
  "h-9 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-sm sm:flex-none text-foreground shadow-xs outline-none transition-colors hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:border-foreground/20 dark:hover:bg-input/50";

export function ShowFilters({
  comedians,
  venues,
}: {
  comedians: string[];
  venues: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const comediante = searchParams.get("comediante") ?? "";
  const venue = searchParams.get("venue") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const hasFilters = Boolean(comediante || venue || from || to);

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <QuerySelect
        param="comediante"
        placeholder="Todos los comediantes"
        options={comedians.map((c) => ({ value: c, label: c }))}
        className="w-full sm:w-52"
      />
      <QuerySelect
        param="venue"
        placeholder="Todos los lugares"
        options={venues.map((v) => ({ value: v, label: v }))}
        className="w-full sm:w-48"
      />

      <input
        type="date"
        value={from}
        onChange={(e) => update("from", e.target.value)}
        className={dateClass}
        aria-label="Desde"
      />
      <input
        type="date"
        value={to}
        onChange={(e) => update("to", e.target.value)}
        className={dateClass}
        aria-label="Hasta"
      />

      {hasFilters && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" /> Limpiar
        </button>
      )}
    </div>
  );
}
