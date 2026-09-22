import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ShowCard } from "@/components/show-card";
import { TypewriterHero } from "@/components/typewriter-hero";
import type { ShowWithBs } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const FEATURED_COUNT = 6;

export default async function HomePage() {
  const supabase = await createClient();
  const { data: shows } = await supabase
    .from("shows_public")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const list = (shows ?? []) as ShowWithBs[];
  const featured = list.slice(0, FEATURED_COUNT);

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="tc-rise space-y-2 pt-4 sm:pt-8">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <span className="h-px w-8 bg-primary" />
          Pinto &amp; Aparte
        </p>
        <TypewriterHero />
        <p className="max-w-md text-base text-muted-foreground">
          Escoge tu show, pica el puesto en el mapa y asegura tu boleto en
          minutos — así de fácil. Pagas con Pago Móvil o Binance, sin vueltas
          ni excusas.
        </p>
      </section>

      {/* Shows */}
      <section className="space-y-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-2xl font-bold uppercase tracking-tight">
            En cartelera
          </h2>
        </div>

        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <p className="font-heading text-lg uppercase text-muted-foreground">
              No hay shows disponibles
            </p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              Vuelve pronto — se vienen cosas buenas.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((show, i) => (
                <div
                  key={show.id}
                  className="tc-rise"
                  style={{ animationDelay: `${0.05 * (i + 1)}s` }}
                >
                  <ShowCard show={show} />
                </div>
              ))}
            </div>
            {list.length > FEATURED_COUNT && (
              <div className="flex justify-center pt-2">
                <Link
                  href="/shows"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50 hover:text-primary"
                >
                  Ver todos los shows
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
