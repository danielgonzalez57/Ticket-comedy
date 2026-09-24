import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { updateShow } from "@/app/admin/(panel)/shows/actions";
import { ShowForm } from "@/components/admin/show-form";
import { SeatEditor } from "@/components/admin/seat-editor";
import { ShowActions } from "@/components/admin/show-actions";
import { ShowStatusBadge } from "@/components/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Seat, Show } from "@/lib/database.types";
import { formatTasa } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EditShowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: show }, { data: seats }] = await Promise.all([
    supabase.from("shows").select("*").eq("id", id).single(),
    supabase
      .from("seats")
      .select("*")
      .eq("show_id", id)
      .order("row_index", { ascending: true })
      .order("col_index", { ascending: true }),
  ]);

  if (!show) notFound();

  const typedShow = show as Show;
  const seatList = (seats ?? []) as Seat[];
  const sold = seatList.filter((s) => s.status === "sold").length;
  const disabled = seatList.filter((s) => s.status === "disabled").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {typedShow.name}
            </h1>
            <ShowStatusBadge status={typedShow.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {seatList.length} asientos · {sold} vendidos · {disabled}{" "}
            deshabilitados
          </p>
        </div>
        <div className="flex items-center gap-3">
          {typedShow.status === "published" && (
            <Link
              href={`/shows/${typedShow.id}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              Ver público <ExternalLink className="size-3.5" />
            </Link>
          )}
        </div>
      </div>

      {typedShow.tasa <= 1 && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="size-5 shrink-0" />
          <p>
            Este show tiene una tasa placeholder ({formatTasa(typedShow.tasa)} Bs/USD) de la
            migración inicial, no una tasa real. No se puede publicar hasta que
            la corrijas abajo — la base de datos lo rechaza igual si lo intentas.
          </p>
        </div>
      )}

      <ShowActions showId={typedShow.id} status={typedShow.status} />

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Detalles</TabsTrigger>
          <TabsTrigger value="seats">Asientos</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-4">
          <ShowForm
            action={updateShow.bind(null, typedShow.id)}
            show={typedShow}
            seatCount={seatList.length}
            submitLabel="Guardar cambios"
          />
        </TabsContent>
        <TabsContent value="seats" className="pt-4">
          <SeatEditor seats={seatList} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
