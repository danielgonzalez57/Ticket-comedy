"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import {
  reportPaymentAction,
  type ReportPaymentResult,
} from "@/app/(public)/orders/[id]/actions";
import { VE_BANKS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Enviando…" : "Reportar pago"}
    </Button>
  );
}

// Step 2 of 2 (Fase 3): collects the reference/bank/amount/date and
// an optional receipt once the customer has actually paid. Rendered
// on /orders/[id] only while the order is 'pending' and its payment
// method needs reconciliation — see BANK_RECONCILED_METHODS.
export function ReportPaymentForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const action = reportPaymentAction.bind(null, orderId);
  const [state, formAction] = useActionState<ReportPaymentResult, FormData>(
    action,
    { ok: false },
  );

  // Sync the rest of the page (status banner, "Completa tu pago"
  // block) with the new 'reported' status — reportPayment's own
  // revalidatePath only invalidates the cache, it doesn't re-render
  // this already-mounted page on its own.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (state.ok) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
        <div>
          <p className="font-medium text-success">¡Pago reportado!</p>
          <p className="mt-1 text-muted-foreground">
            Espera la confirmación del admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-border bg-card p-5"
    >
      <div>
        <h2 className="text-sm font-medium">Reporta tu pago</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Completa esto después de transferir, con los datos exactos del
          comprobante.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="verify_email">Correo con el que reservaste</Label>
        <Input id="verify_email" name="verify_email" type="email" required />
        <p className="text-xs text-muted-foreground">
          Lo pedimos de nuevo para confirmar que esta orden es tuya.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="banco_emisor">Banco emisor</Label>
          <Input id="banco_emisor" name="banco_emisor" list="ve-banks" required />
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
            pattern="[0-9]{6,8}"
            placeholder="Ej: 12345678"
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
            type="number"
            step="0.01"
            min="0"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fecha_pago">Fecha del pago</Label>
          <Input id="fecha_pago" name="fecha_pago" type="date" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cedula">Cédula</Label>
        <Input id="cedula" name="cedula" placeholder="V-12345678" />
        <p className="text-xs text-muted-foreground">
          La usamos para ayudarte a recuperar tu entrada si pierdes este
          enlace.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="comprobante">Captura del comprobante (opcional)</Label>
        <Input
          id="comprobante"
          name="comprobante"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
        />
      </div>

      {state.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
