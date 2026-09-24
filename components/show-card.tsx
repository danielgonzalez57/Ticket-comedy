import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Ticket } from "lucide-react";
import type { ShowWithBs } from "@/lib/database.types";
import { formatMoney, formatBs } from "@/lib/format";

function dateParts(value: string) {
  const d = new Date(value);
  return {
    day: new Intl.DateTimeFormat("es-VE", { day: "2-digit" }).format(d),
    month: new Intl.DateTimeFormat("es-VE", { month: "short" })
      .format(d)
      .replace(".", "")
      .toUpperCase(),
  };
}

export function ShowCard({ show }: { show: ShowWithBs }) {
  const { day, month } = dateParts(show.date);

  return (
    <Link
      href={`/shows/${show.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_0_40px_-12px_rgba(59,130,246,0.3)] active:scale-[0.985] active:duration-100"
    >
      {/* Poster — framed inside the card and shown in full colour; only
          a short neutral shade at the very bottom, same in both themes. */}
      <div className="relative m-2 mb-0 aspect-4/5 overflow-hidden rounded-xl bg-secondary shadow-md ring-1 ring-black/5 dark:ring-white/10">
        {show.poster_url ? (
          <Image
            src={show.poster_url}
            alt={show.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/40">
            <Ticket className="size-10" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/5 bg-linear-to-t from-black/30 to-transparent" />

        {/* Date stamp */}
        <div className="absolute left-2.5 top-2.5 flex flex-col items-center rounded-lg bg-background/95 px-2.5 py-1 shadow-lg ring-1 ring-black/5 backdrop-blur dark:ring-white/10">
          <span className="font-heading text-lg font-extrabold leading-none text-highlight">
            {day}
          </span>
          <span className="text-[10px] font-medium tracking-wider text-muted-foreground">
            {month}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1 px-4 pb-2 pt-3">
        <h3 className="font-heading text-lg font-bold uppercase leading-tight tracking-tight">
          {show.name}
        </h3>
        <p className="text-sm text-muted-foreground">{show.venue}</p>
        {show.comedians.length > 0 && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/70">
            {show.comedians.join(" · ")}
          </p>
        )}
      </div>

      {/* Ticket-stub footer */}
      <div className="tc-perf h-3.5 w-full opacity-60" />
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        {/* Wraps as whole pieces on narrow phones: the Bs amount drops to
            its own line instead of breaking mid-number. */}
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="whitespace-nowrap">
            <span className="text-muted-foreground">Desde </span>
            <span className="font-heading font-bold text-foreground">
              {formatMoney(show.base_price)}
            </span>
          </span>
          <span className="whitespace-nowrap text-muted-foreground">
            ({formatBs(show.base_price_bs)})
          </span>
        </span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-300 group-hover:rotate-45">
          <ArrowUpRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}
