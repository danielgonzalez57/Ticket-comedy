import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar, MapPin, ArrowLeft, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeatQuantityPicker } from "@/components/seat-quantity-picker";
import { effectiveStatus } from "@/lib/seats";
import { formatDate, formatMoney, formatBs } from "@/lib/format";
import type { SeatWithBs, ShowWithBs } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export default async function ShowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Independent of each other — run in parallel instead of paying two
  // sequential round trips before the page can render anything.
  const [{ data: show }, { data: seats }] = await Promise.all([
    supabase
      .from("shows_public")
      .select("*")
      .eq("id", id)
      .eq("status", "published")
      .single(),
    supabase
      .from("seats_public")
      .select("*")
      .eq("show_id", id)
      .order("row_index", { ascending: true })
      .order("col_index", { ascending: true }),
  ]);

  if (!show) notFound();
  const typedShow = show as ShowWithBs;
  const seatList = (seats ?? []) as SeatWithBs[];
  const available = seatList.filter((s) => effectiveStatus(s) === "available").length;

  return (
    <div className="space-y-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Cartelera
      </Link>

      {/* Hero */}
      <section className="tc-rise relative overflow-hidden rounded-2xl border border-border">
        <div className="relative aspect-4/5 w-full bg-secondary sm:aspect-video">
          {typedShow.poster_url ? (
            <Image
              src={typedShow.poster_url}
              alt={typedShow.name}
              fill
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="object-cover"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground/30">
              <Ticket className="size-16" />
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/70 to-transparent" />
        </div>

        <div className="absolute inset-x-0 bottom-0 space-y-3 p-5 sm:p-8">
          <h1 className="font-heading text-4xl font-extrabold uppercase leading-[0.9] tracking-tighter sm:text-6xl">
            {typedShow.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-2 capitalize">
              <Calendar className="size-4 text-primary" />{" "}
              {formatDate(typedShow.date)}
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="size-4 text-primary" /> {typedShow.venue}
            </span>
          </div>
        </div>
      </section>

      {/* Info */}
      {(typedShow.description || typedShow.comedians.length > 0) && (
        <section className="space-y-4">
          {typedShow.comedians.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {typedShow.comedians.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-foreground/80"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
          {typedShow.description && (
            <p className="max-w-2xl leading-relaxed text-foreground/85">
              {typedShow.description}
            </p>
          )}
        </section>
      )}

      {/* Ticket quantity */}
      <section className="space-y-5 rounded-2xl border border-border bg-card/60 p-5 sm:p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-xl font-bold uppercase tracking-tight">
            Compra tus entradas
          </h2>
          <span className="text-sm text-muted-foreground">
            Desde{" "}
            <span className="font-bold text-foreground">
              {formatMoney(typedShow.base_price)}
            </span>{" "}
            ({formatBs(typedShow.base_price_bs)})
          </span>
        </div>
        {seatList.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este show aún no tiene entradas configuradas.
          </p>
        ) : (
          <SeatQuantityPicker
            showId={typedShow.id}
            basePrice={typedShow.base_price}
            tasa={typedShow.tasa}
            available={available}
          />
        )}
      </section>
    </div>
  );
}
