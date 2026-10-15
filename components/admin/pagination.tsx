import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PAGE_SIZE = 20;

// Reads ?page= and clamps it to the available pages.
export function parsePage(raw: string | undefined, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const n = Number.parseInt(raw ?? "1", 10);
  const page = Number.isFinite(n) ? Math.min(Math.max(n, 1), totalPages) : 1;
  return { page, totalPages, from: (page - 1) * PAGE_SIZE };
}

// URL-driven pager: keeps the current filters and only swaps ?page=.
export function Pagination({
  pathname,
  params,
  page,
  totalPages,
  total,
}: {
  pathname: string;
  params: Record<string, string | undefined>;
  page: number;
  totalPages: number;
  total: number;
}) {
  if (totalPages <= 1) return null;

  function href(target: number) {
    const sp = new URLSearchParams(
      Object.entries(params).filter(
        (e): e is [string, string] => Boolean(e[1]) && e[0] !== "page",
      ),
    );
    if (target > 1) sp.set("page", String(target));
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  const navClass = buttonVariants({ variant: "outline", size: "sm" });

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="tabular-nums text-muted-foreground">
        {first}–{last} de {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={navClass}>
            <ChevronLeft />
            Anterior
          </Link>
        ) : (
          <span className={cn(navClass, "pointer-events-none opacity-50")}>
            <ChevronLeft />
            Anterior
          </span>
        )}
        <span className="tabular-nums text-muted-foreground">
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={href(page + 1)} className={navClass}>
            Siguiente
            <ChevronRight />
          </Link>
        ) : (
          <span className={cn(navClass, "pointer-events-none opacity-50")}>
            Siguiente
            <ChevronRight />
          </span>
        )}
      </div>
    </nav>
  );
}
