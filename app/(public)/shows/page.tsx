import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ShowCard } from "@/components/show-card";
import { ShowFilters } from "@/components/show-filters";
import type { ShowWithBs } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export default async function AllShowsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { comediante, venue, from, to } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("shows_public")
    .select("*")
    .eq("status", "published")
    .order("date", { ascending: true });

  if (typeof comediante === "string" && comediante) {
    query = query.contains("comedians", [comediante]);
  }
  if (typeof venue === "string" && venue) {
    query = query.eq("venue", venue);
  }
  if (typeof from === "string" && from) {
    query = query.gte("date", from);
  }
  if (typeof to === "string" && to) {
    query = query.lte("date", to);
  }

  const [{ data: shows }, { data: allShows }] = await Promise.all([
    query,
    supabase
      .from("shows_public")
      .select("venue, comedians")
      .eq("status", "published"),
  ]);

  const list = (shows ?? []) as ShowWithBs[];
  const comedianOptions = [
    ...new Set((allShows ?? []).flatMap((s) => s.comedians).filter(Boolean)),
  ].sort();
  const venueOptions = [
    ...new Set((allShows ?? []).map((s) => s.venue).filter(Boolean)),
  ].sort();

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Cartelera
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-bold uppercase tracking-tight">
          Todos los shows
        </h1>
        <ShowFilters comedians={comedianOptions} venues={venueOptions} />
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="font-heading text-lg uppercase text-muted-foreground">
            No hay shows con esos filtros
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Probá cambiando o limpiando los filtros.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
        </div>
      )}
    </div>
  );
}
