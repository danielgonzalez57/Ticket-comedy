"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createOrder,
  type CheckoutState,
} from "@/app/(public)/shows/[id]/checkout/actions";
import { PAYMENT_METHODS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Reservando…" : "Reservar entradas"}
    </Button>
  );
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

// Step 1 of 2 (Fase 3): only reserves the seats. Payment reference,
// bank, amount, date and receipt are reported in step 2, once the
// order exists — see ReportPaymentForm on /orders/[id]. Splitting
// these means a customer never has to invent a reference before
// they've actually paid.
export function CheckoutForm({
  showId,
  quantity,
}: {
  showId: string;
  quantity: number;
}) {
  const [state, formAction] = useActionState<CheckoutState, FormData>(
    createOrder,
    { error: null },
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="show_id" value={showId} />
      <input type="hidden" name="quantity" value={quantity} />

      <div className="space-y-2">
        <Label htmlFor="customer_name">Nombre completo</Label>
        <Input id="customer_name" name="customer_name" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="customer_email">Correo</Label>
          <Input
            id="customer_email"
            name="customer_email"
            type="email"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer_phone">WhatsApp / Teléfono</Label>
          <Input
            id="customer_phone"
            name="customer_phone"
            type="tel"
            placeholder="0412-1234567"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="payment_method">Método de pago</Label>
        <select
          id="payment_method"
          name="payment_method"
          className={selectClass}
          defaultValue=""
          required
        >
          <option value="" disabled>
            Selecciona…
          </option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <SubmitButton />
      <p className="text-center text-xs text-muted-foreground">
        Tus entradas quedan reservadas por 20 minutos. En la siguiente
        pantalla verás cómo pagar y reportar tu comprobante.
      </p>
    </form>
  );
}
