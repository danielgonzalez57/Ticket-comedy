"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import {
  Armchair,
  CalendarClock,
  ImagePlus,
  Info,
  Loader2,
  Minus,
  Plus,
  Ticket,
} from "lucide-react";
import type { ShowFormState } from "@/app/admin/(panel)/shows/actions";
import type { Show } from "@/lib/database.types";
import { MAX_SEATS_PER_ORDER } from "@/lib/constants";
import {
  formatMoney,
  formatTasaInput,
  parseDecimal,
  toDatetimeLocal,
} from "@/lib/format";
import { MAX_CAPACITY, MIN_CAPACITY } from "@/lib/seats";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImagePicker } from "@/components/admin/image-picker";

type Props = {
  action: (state: ShowFormState, formData: FormData) => Promise<ShowFormState>;
  show?: Show;
  // Existing seat count — only meaningful when editing.
  seatCount?: number;
  submitLabel: string;
};

const CAPACITY_PRESETS = [50, 100, 150, 200, 300];
const DEFAULT_CAPACITY = 100;

const noSpinner =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function clampCapacity(n: number) {
  return Math.max(MIN_CAPACITY, Math.min(MAX_CAPACITY, Math.round(n)));
}

function SubmitButton({ label, pending }: { label: string; pending: boolean }) {
  return (
    <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" /> Guardando…
        </>
      ) : (
        label
      )}
    </Button>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-accent-ink" />
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ShowForm({ action, show, seatCount, submitLabel }: Props) {
  const isEdit = Boolean(show);
  const [state, formAction, pending] = useActionState<
    ShowFormState,
    FormData
  >(action, { error: null });
  // Kept as text so the field can be cleared while typing; clamped on blur.
  const [capacityText, setCapacityText] = useState(String(DEFAULT_CAPACITY));
  const [priceText, setPriceText] = useState(String(show?.base_price ?? 10));
  const formRef = useRef<HTMLFormElement>(null);
  const confirmTasaRef = useRef<HTMLInputElement>(null);

  const capacity = isEdit ? (seatCount ?? 0) : Number(capacityText) || 0;
  const price = Number(priceText);
  const maxRevenue = Number.isFinite(price) ? capacity * price : 0;

  function stepCapacity(delta: number) {
    setCapacityText(String(clampCapacity((Number(capacityText) || 0) + delta)));
  }

  function confirmTasaChange() {
    if (confirmTasaRef.current) confirmTasaRef.current.value = "true";
    formRef.current?.requestSubmit();
  }

  // Dispatched by hand instead of via <form action>: React resets a
  // form after an action submit, which would wipe everything the admin
  // typed whenever the server answers with a validation error.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    // The tasa confirmation applies to this one submit only.
    if (confirmTasaRef.current) confirmTasaRef.current.value = "false";
    startTransition(() => formAction(data));
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="grid items-start gap-6 lg:grid-cols-[1fr_340px]"
    >
      <input
        type="hidden"
        name="confirm_tasa_change"
        ref={confirmTasaRef}
        defaultValue="false"
      />

      <div className="space-y-6">
        <Section icon={CalendarClock} title="Información del show">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del show</Label>
            <Input
              id="name"
              name="name"
              defaultValue={show?.name}
              placeholder="Ej. Noche de stand-up"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="venue">Lugar</Label>
              <Input
                id="venue"
                name="venue"
                defaultValue={show?.venue}
                placeholder="Ej. Teatro Chacao"
                required
              />
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
              placeholder="De qué va el show, duración, restricciones de edad…"
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
        </Section>

        <Section icon={Ticket} title="Precio">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="base_price">Precio por entrada (USD)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="base_price"
                  name="base_price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={priceText}
                  onChange={(e) => setPriceText(e.target.value)}
                  className="pl-6"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tasa">Tasa (Bs por USD)</Label>
              {/* Text, not type="number": a number input shows the
                  browser's locale separator and can drop "840,67". */}
              <Input
                id="tasa"
                name="tasa"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                pattern="\d{1,3}(\.\d{3})*(,\d{1,4})?|\d+([.,]\d{1,4})?"
                title="Número con hasta 4 decimales, por ejemplo 840,67"
                defaultValue={show ? formatTasaInput(show.tasa) : undefined}
                onBlur={(e) => {
                  const n = parseDecimal(e.target.value);
                  if (Number.isFinite(n)) e.target.value = formatTasaInput(n);
                }}
                placeholder="Ej. 840,67"
                className="tabular-nums"
                required
              />
            </div>
          </div>
          {show && (
            <p className="text-xs text-muted-foreground">
              Las órdenes ya creadas conservan la tasa con la que se generaron,
              aunque cambies esto.
            </p>
          )}
        </Section>

        <Section icon={ImagePlus} title="Imágenes">
          <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ImagePicker
              name="poster"
              label="Cartel"
              hint="Cartelera · 4:5"
              aspectClass="aspect-4/5"
              maxWidth={1080}
              maxHeight={1350}
              currentUrl={show?.poster_url}
            />
            <ImagePicker
              name="banner"
              label="Banner"
              hint="Detalle del show · 16:9"
              aspectClass="aspect-video"
              maxWidth={1920}
              maxHeight={1080}
              currentUrl={show?.banner_url}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Si no subes un banner, el detalle del show usa el cartel.
          </p>
        </Section>
      </div>

      <div className="space-y-4 lg:sticky lg:top-6">
        <Section icon={Armchair} title="Capacidad">
          {isEdit ? (
            <div className="space-y-2">
              <p className="font-heading text-4xl font-semibold tabular-nums">
                {capacity}
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  asientos
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                La capacidad no se puede cambiar después de crear el show. Para
                bloquear asientos usa la pestaña Asientos.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="capacity">Cantidad de asientos</Label>
                <div className="flex items-stretch overflow-hidden rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
                  <button
                    type="button"
                    onClick={() => stepCapacity(-10)}
                    disabled={capacity <= MIN_CAPACITY}
                    aria-label="Restar 10 asientos"
                    className="flex w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    <Minus className="size-4" />
                  </button>
                  <input
                    id="capacity"
                    name="capacity"
                    type="number"
                    inputMode="numeric"
                    min={MIN_CAPACITY}
                    max={MAX_CAPACITY}
                    step={1}
                    value={capacityText}
                    onChange={(e) => setCapacityText(e.target.value)}
                    onBlur={() =>
                      capacityText !== "" &&
                      setCapacityText(
                        String(clampCapacity(Number(capacityText))),
                      )
                    }
                    required
                    className={cn(
                      "h-14 w-full min-w-0 bg-transparent text-center font-heading text-3xl font-semibold tabular-nums outline-none",
                      noSpinner,
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => stepCapacity(10)}
                    disabled={capacity >= MAX_CAPACITY}
                    aria-label="Sumar 10 asientos"
                    className="flex w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {CAPACITY_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCapacityText(String(n))}
                    aria-pressed={capacity === n}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors",
                      capacity === n
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input text-muted-foreground hover:border-ring hover:text-foreground",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <p className="flex gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                <Info className="mt-px size-3.5 shrink-0" />
                Los asientos se asignan solos en orden de llegada, hasta{" "}
                {MAX_SEATS_PER_ORDER} por compra.
              </p>
            </div>
          )}

          <dl className="space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Precio por entrada</dt>
              <dd className="tabular-nums">
                {formatMoney(Number.isFinite(price) ? price : 0)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Recaudación máxima</dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(maxRevenue)}
              </dd>
            </div>
          </dl>
        </Section>

        {!isEdit && (
          <p className="px-1 text-xs text-muted-foreground">
            El show se publica al crearlo. Puedes despublicarlo luego desde su
            página.
          </p>
        )}

        {state.error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}

        {state.tasaWarning && (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
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

        <SubmitButton label={submitLabel} pending={pending} />
      </div>
    </form>
  );
}
