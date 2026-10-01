"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import type { PaymentMethod } from "@/lib/database.types";
import { VE_BANKS } from "@/lib/constants";
import type { PaymentReportFields } from "@/lib/payment-report";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const EMPTY_PAYMENT_FIELDS: PaymentReportFields = {
  banco: "",
  referencia: "",
  monto: "",
  fecha: "",
  binanceEmail: "",
};

function Optional() {
  return <span className="font-normal text-muted-foreground">(opcional)</span>;
}

// The payment data inputs for one method. Controlled, so the parent
// form can validate with validatePaymentReport and keep its submit
// button disabled until everything required is filled in.
export function PaymentDataFields({
  method,
  values,
  onChange,
}: {
  method: PaymentMethod;
  values: PaymentReportFields;
  onChange: (next: PaymentReportFields) => void;
}) {
  const set =
    (key: keyof PaymentReportFields) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...values, [key]: e.target.value });

  if (method === "binance") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="payment_ref">Order ID</Label>
          <Input
            id="payment_ref"
            name="payment_ref"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{6,32}"
            placeholder="Ej: 312345678901234567"
            value={values.referencia}
            onChange={set("referencia")}
            className="font-mono"
            required
          />
          <p className="text-xs text-muted-foreground">
            Está en el detalle del pago dentro de Binance Pay.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="binance_email">
            Correo de tu Binance <Optional />
          </Label>
          <Input
            id="binance_email"
            name="binance_email"
            type="email"
            placeholder="tucorreo@gmail.com"
            value={values.binanceEmail}
            onChange={set("binanceEmail")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="banco_emisor">Banco emisor</Label>
          {/* Free-text input with suggestions. Not a native <datalist>:
              browsers draw that popup in their own theme, so it stayed
              dark when the app was in light mode. */}
          <Autocomplete.Root
            items={VE_BANKS}
            value={values.banco}
            onValueChange={(banco) => onChange({ ...values, banco })}
            openOnInputClick
          >
            <Autocomplete.Input
              render={<Input />}
              id="banco_emisor"
              name="banco_emisor"
              autoComplete="off"
              placeholder="Ej: Banesco"
              required
            />
            <Autocomplete.Portal>
              <Autocomplete.Positioner
                sideOffset={4}
                className="isolate z-50"
              >
                <Autocomplete.Popup className="max-h-[min(var(--available-height),18rem)] w-(--anchor-width) overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg shadow-black/5 data-empty:hidden dark:shadow-black/50">
                  <Autocomplete.List>
                    {(bank: string) => (
                      <Autocomplete.Item
                        key={bank}
                        value={bank}
                        className="cursor-pointer rounded-lg px-2.5 py-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                      >
                        {bank}
                      </Autocomplete.Item>
                    )}
                  </Autocomplete.List>
                </Autocomplete.Popup>
              </Autocomplete.Positioner>
            </Autocomplete.Portal>
          </Autocomplete.Root>
        </div>
        <div className="space-y-2">
          <Label htmlFor="payment_ref">Referencia (últimos 6-8 díg.)</Label>
          <Input
            id="payment_ref"
            name="payment_ref"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{6,8}"
            maxLength={8}
            placeholder="Ej: 12345678"
            value={values.referencia}
            onChange={set("referencia")}
            className="font-mono"
            required
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="monto_reportado">Monto transferido (Bs)</Label>
          <Input
            id="monto_reportado"
            name="monto_reportado"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ej: 8406,70"
            value={values.monto}
            onChange={set("monto")}
            className="tabular-nums"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fecha_pago">Fecha del pago</Label>
          <Input
            id="fecha_pago"
            name="fecha_pago"
            type="date"
            value={values.fecha}
            onChange={set("fecha")}
            required
          />
        </div>
      </div>
    </div>
  );
}
