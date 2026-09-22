import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ShowStatusBadge } from "@/components/status-badge";
import { formatShortDate } from "@/lib/format";
import { formatMoney } from "@/lib/format";
import type { Show } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export default async function ShowsListPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shows")
    .select("*")
    .order("date", { ascending: false });

  const shows = (data ?? []) as Show[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Shows</h1>
        <Link
          href="/admin/shows/new"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Nuevo show
        </Link>
      </div>

      {shows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Aún no has creado ningún show.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {shows.map((show) => (
            <Link
              key={show.id}
              href={`/admin/shows/${show.id}`}
              className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-secondary/40"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{show.name}</p>
                <p className="text-xs text-muted-foreground">
                  {show.venue} · {formatShortDate(show.date)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <span className="tabular-nums text-muted-foreground">
                  {formatMoney(show.base_price)}
                </span>
                <ShowStatusBadge status={show.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
