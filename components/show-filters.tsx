"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

const fieldClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50";

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
      <select
        value={comediante}
        onChange={(e) => update("comediante", e.target.value)}
        className={fieldClass}
        aria-label="Filtrar por comediante"
      >
        <option value="">Comediante</option>
        {comedians.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        value={venue}
        onChange={(e) => update("venue", e.target.value)}
        className={fieldClass}
        aria-label="Filtrar por lugar"
      >
        <option value="">Lugar</option>
        {venues.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <input
        type="date"
        value={from}
        onChange={(e) => update("from", e.target.value)}
        className={fieldClass}
        aria-label="Desde"
      />
      <input
        type="date"
        value={to}
        onChange={(e) => update("to", e.target.value)}
        className={fieldClass}
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
