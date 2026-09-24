"use client";

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
          <Input
            id="banco_emisor"
            name="banco_emisor"
            list="ve-banks"
            autoComplete="off"
            placeholder="Ej: Banesco"
            value={values.banco}
            onChange={set("banco")}
            required
          />
          <datalist id="ve-banks">
            {VE_BANKS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
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
