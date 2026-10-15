import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { brandEmailLogoUrl, ORDER_STATUS_LABELS } from "@/lib/constants";
import { buildDoorListPdf, type DoorListGroup } from "@/lib/door-list-pdf";
import { formatDate } from "@/lib/format";
import type { Order, Show } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const VALID_STATUSES: Order["status"][] = [
  "pending",
  "reported",
  "verified",
  "rejected",
  "expired",
  "cancelled",
];

// PostgREST caps every response (1000 rows by default), so page
// through anything that can grow past that.
const PAGE = 1000;
async function fetchAll<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

// Same white-lettering mark the emails use (made for dark
// backgrounds, which is what the PDF header is). Fetched rather than
// read from disk: Vercel functions don't reliably have public/ on
// disk. Falls back to this deployment's own copy; no logo at all just
// renders the header without it.
async function loadLogo(request: NextRequest): Promise<Uint8Array | null> {
  const candidates = [
    brandEmailLogoUrl(),
    new URL("/logo-caras-email.png", request.url).toString(),
  ].filter(Boolean);
  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok && res.headers.get("content-type")?.includes("png")) {
        return new Uint8Array(await res.arrayBuffer());
      }
    } catch {
      // try the next one
    }
  }
  return null;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Door list for the orders currently filtered in /admin/orders. With
// no status filter it lists only verified (paid) orders — that's what
// the door needs; an explicit status filter is respected as-is.
export async function GET(request: NextRequest) {
  // proxy.ts already gates /admin, but this returns customer PII, so
  // check again here rather than rely on the path matcher alone.
  await requireUser();

  const params = request.nextUrl.searchParams;
  const rawStatus = params.get("status");
  const status: Order["status"] =
    rawStatus && VALID_STATUSES.includes(rawStatus as Order["status"])
      ? (rawStatus as Order["status"])
      : "verified";
  const showId = params.get("show");
  const q = params.get("q");

  const supabase = await createClient();

  const ordersQuery = (from: number, to: number) => {
    let query = supabase
      .from("orders")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (showId) query = query.eq("show_id", showId);
    if (q) {
      const like = `%${q.replace(/[,()%]/g, "")}%`;
      query = query.or(
        `customer_name.ilike.${like},customer_email.ilike.${like},payment_ref.ilike.${like}`,
      );
    }
    return query;
  };

  const [orders, showsResult, logoPng] = await Promise.all([
    fetchAll<Order>(ordersQuery),
    supabase.from("shows").select("*"),
    loadLogo(request),
  ]);
  if (showsResult.error) throw new Error(showsResult.error.message);
  const shows = (showsResult.data ?? []) as Show[];
  const showById = new Map(shows.map((s) => [s.id, s]));

  const showIds = [...new Set(orders.map((o) => o.show_id))];
  const seats = showIds.length
    ? await fetchAll<{ id: string; label: string }>((from, to) =>
        supabase
          .from("seats")
          .select("id,label")
          .in("show_id", showIds)
          .order("id", { ascending: true })
          .range(from, to),
      )
    : [];
  const seatLabel = new Map(seats.map((s) => [s.id, s.label]));

  const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
  const groups: DoorListGroup[] = showIds
    .map((id) => ({
      show: showById.get(id) ?? null,
      rows: orders
        .filter((o) => o.show_id === id)
        .sort((a, b) => collator.compare(a.customer_name, b.customer_name))
        .map((order) => ({
          order,
          seatLabels: order.seat_ids
            .map((sid) => seatLabel.get(sid))
            .filter((l): l is string => Boolean(l))
            .sort(collator.compare),
        })),
    }))
    .sort((a, b) => (a.show?.date ?? "").localeCompare(b.show?.date ?? ""));

  const selectedShow = showId ? showById.get(showId) ?? null : null;
  const title = selectedShow?.name ?? (groups.length === 1 && groups[0].show ? groups[0].show.name : "Todos los shows");
  const single = selectedShow ?? (groups.length === 1 ? groups[0].show : null);
  const subtitle = single
    ? [formatDate(single.date), single.venue].filter(Boolean).join("  ·  ")
    : `${groups.length} ${groups.length === 1 ? "show" : "shows"}`;
  const subtitleText =
    (subtitle.charAt(0).toUpperCase() + subtitle.slice(1)) + (q ? `  ·  Búsqueda: "${q}"` : "");

  const generatedAt = new Date();
  const pdf = await buildDoorListPdf({
    title,
    subtitle: subtitleText,
    statusLabel: ORDER_STATUS_LABELS[status] ?? status,
    groups,
    logoPng,
    generatedAt,
  });

  const day = generatedAt.toISOString().slice(0, 10);
  const filename = `lista-acceso-${slugify(title) || "shows"}-${day}.pdf`;

  return new Response(new Uint8Array(pdf).buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
