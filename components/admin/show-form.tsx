"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import type { ShowFormState } from "@/app/admin/(panel)/shows/actions";
import type { Show } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SeatGridPreview } from "@/components/admin/seat-grid-preview";
import { toDatetimeLocal } from "@/lib/format";

type Props = {
  action: (state: ShowFormState, formData: FormData) => Promise<ShowFormState>;
  show?: Show;
  submitLabel: string;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : label}
    </Button>
  );
}

const fieldClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ShowForm({ action, show, submitLabel }: Props) {
  const isEdit = Boolean(show);
  const [state, formAction] = useActionState<ShowFormState, FormData>(action, {
    error: null,
  });
  const [rows, setRows] = useState(show?.grid_rows ?? 5);
  const [cols, setCols] = useState(show?.grid_cols ?? 10);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmTasaRef = useRef<HTMLInputElement>(null);

  function confirmTasaChange() {
    if (confirmTasaRef.current) confirmTasaRef.current.value = "true";
    formRef.current?.requestSubmit();
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-6 lg:grid-cols-[1fr_320px]"
    >
      <input type="hidden" name="confirm_tasa_change" ref={confirmTasaRef} defaultValue="false" />
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nombre del show</Label>
          <Input id="name" name="name" defaultValue={show?.name} required />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="venue">Venue</Label>
            <Input id="venue" name="venue" defaultValue={show?.venue} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Fecha y hora</Label>
            <Input
              id="date"
              name="date"
              type="datetime-local"
              defaultValue={show ? toDatetimeLocal(show.date) : undefined}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={show?.description ?? ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="comedians">Comediantes</Label>
          <Textarea
            id="comedians"
            name="comedians"
            rows={2}
            placeholder="Uno por línea o separados por coma"
            defaultValue={show?.comedians.join("\n")}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="base_price">Precio base (USD)</Label>
            <Input
              id="base_price"
              name="base_price"
              type="number"
              min={0}
              step="0.01"
              defaultValue={show?.base_price ?? 10}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tasa">Tasa (Bs por USD)</Label>
            <Input
              id="tasa"
              name="tasa"
              type="number"
              min={0.0001}
              step="0.0001"
              defaultValue={show?.tasa}
              required
            />
            {show && (
              <p className="text-xs text-muted-foreground">
                Las órdenes ya creadas conservan la tasa con la que se
                generaron, aunque cambies esto.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Estado</Label>
            <select
              id="status"
              name="status"
              defaultValue={show?.status ?? "draft"}
              className={fieldClass}
            >
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="finished">Finalizado</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="poster">Cartel (imagen)</Label>
          <Input id="poster" name="poster" type="file" accept="image/*" />
          {show?.poster_url && (
            <div className="relative mt-2 aspect-[16/10] w-40 overflow-hidden rounded-md border border-border">
              <Image
                src={show.poster_url}
                alt="Cartel actual"
                fill
                sizes="160px"
                className="object-cover"
              />
            </div>
          )}
        </div>

        {state.error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}

        {state.tasaWarning && (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="text-amber-600 dark:text-amber-400">
              Hay {state.tasaWarning.openOrders} orden(es) abierta(s) (no
              vencidas/canceladas) para este show. Cada una ya guarda su propia
              tasa congelada, así que esto no les cambia el monto — pero esos
              clientes siguen transfiriendo según la tasa anterior mientras
              esta se actualiza para las ventas nuevas.
            </p>
            <Button type="button" size="sm" onClick={confirmTasaChange}>
              Entendido, cambiar la tasa de todas formas
            </Button>
          </div>
        )}

        <SubmitButton label={submitLabel} />
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="grid_rows">Filas</Label>
            <Input
              id="grid_rows"
              name="grid_rows"
              type="number"
              min={1}
              max={26}
              value={rows}
              onChange={(e) => setRows(Number(e.target.value))}
              disabled={isEdit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grid_cols">Columnas</Label>
            <Input
              id="grid_cols"
              name="grid_cols"
              type="number"
              min={1}
              max={40}
              value={cols}
              onChange={(e) => setCols(Number(e.target.value))}
              disabled={isEdit}
            />
          </div>
        </div>
        {isEdit && (
          <p className="text-xs text-muted-foreground">
            El tamaño del grid no se puede cambiar después de crear el show.
            Deshabilita asientos individuales desde el detalle.
          </p>
        )}
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="mb-3 text-xs text-muted-foreground">
            Vista previa ({rows}×{cols} = {rows * cols} asientos)
          </p>
          <SeatGridPreview rows={rows} cols={cols} />
        </div>
      </div>
    </form>
  );
}
