import Link from "next/link";
import { ArrowRight, Coins, QrCode, Smartphone, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ShowCard } from "@/components/show-card";
import { TypewriterHero } from "@/components/typewriter-hero";
import type { ShowWithBs } from "@/lib/database.types";
import type { Metadata } from "next";
import { SITE_DESCRIPTION, siteUrl } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Tells Google who the site belongs to, including the "Pinto y Aparte"
// spelling people type instead of the ampersand.
const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "PerformingGroup",
  name: "Pinto & Aparte",
  alternateName: ["Pinto y Aparte", "Pinto Aparte"],
  description: SITE_DESCRIPTION,
  member: [
    { "@type": "Person", name: "Ernesto Pinto" },
    { "@type": "Person", name: "María Laura Pinto" },
  ],
  url: siteUrl(),
  logo: `${siteUrl()}/logo.png`,
};

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
      />
      {/* Hero */}
      <section className="tc-rise space-y-5 pt-2 sm:pt-8">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <span className="h-px w-8 bg-primary" />
          Stand-up · Pinto &amp; Aparte
        </p>
        <TypewriterHero />
        <p className="max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
          <span className="block">
            <span className="font-semibold text-foreground">2 hermanos, 2 sueños:</span>{" "}
            hacerte reír con su show de stand-up comedy… El otro es ganar
          </span>
          <span className="mt-1 block">
            <span className="whitespace-nowrap font-semibold text-foreground">$1.000.000.000</span>,
            pero vamos por parte.
          </span>
        </p>
        <div className="flex flex-col gap-3 pt-1 sm:flex-row">
          <a
            href="#cartelera"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Ticket className="size-5" />
            Ver cartelera
          </a>
          <Link
            href="/mis-entradas"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border px-6 text-base font-medium transition-colors hover:border-primary/50 hover:text-accent-ink"
          >
            Mis entradas
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-sm text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <Smartphone className="size-4 text-accent-ink" /> Pago Móvil
          </li>
          <li className="flex items-center gap-1.5">
            <Coins className="size-4 text-accent-ink" /> Binance
          </li>
          <li className="flex items-center gap-1.5">
            <QrCode className="size-4 text-accent-ink" /> Entrada con QR
          </li>
        </ul>
      </section>

      {/* Shows */}
      <section id="cartelera" className="scroll-mt-20 space-y-5">
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
