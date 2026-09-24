"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import {
  reportPaymentAction,
  type ReportPaymentResult,
} from "@/app/(public)/orders/[id]/actions";
import type { PaymentMethod } from "@/lib/database.types";
import { normalizeCedula, validatePaymentReport } from "@/lib/payment-report";
import {
  EMPTY_PAYMENT_FIELDS,
  PaymentDataFields,
} from "@/components/payment-data-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton({ missing }: { missing: string | null }) {
  const { pending } = useFormStatus();
  return (
    <div className="space-y-2">
      <Button
        type="submit"
        className="h-10 w-full"
        disabled={pending || missing !== null}
      >
        {pending ? "Enviando…" : "Reportar pago"}
      </Button>
      {missing && !pending && (
        <p className="text-center text-xs text-muted-foreground">{missing}</p>
      )}
    </div>
  );
}

// Retry path for reporting a payment: checkout normally reports it
// together with the order (see createOrder), so this only shows on
// /orders/[id] while an order is still 'pending' — e.g. that first
// report failed. The submit button stays disabled until the required
// data is in; the server re-checks it.
export function ReportPaymentForm({
  orderId,
  method,
}: {
  orderId: string;
  method: PaymentMethod;
}) {
  const router = useRouter();
  const action = reportPaymentAction.bind(null, orderId);
  const [state, formAction] = useActionState<ReportPaymentResult, FormData>(
    action,
    { ok: false },
  );
  const [email, setEmail] = useState("");
  const [cedula, setCedula] = useState("");
  const [payment, setPayment] = useState(EMPTY_PAYMENT_FIELDS);

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

  let missing: string | null = null;
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
    missing = "Ingresa el correo con el que apartaste.";
  } else if (!normalizeCedula(cedula)) {
    missing = "Ingresa una cédula válida (ej: V-12345678).";
  } else {
    const checked = validatePaymentReport(method, payment);
    if ("error" in checked) missing = checked.error;
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-border bg-card p-5"
    >
      <div>
        <h2 className="text-sm font-medium">Reporta tu pago</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Completa esto después de pagar, con los datos exactos del
          comprobante.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="verify_email">Correo con el que apartaste</Label>
        <Input
          id="verify_email"
          name="verify_email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Lo pedimos de nuevo para confirmar que esta orden es tuya.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cedula">Cédula</Label>
        <Input
          id="cedula"
          name="cedula"
          placeholder="V-12345678"
          value={cedula}
          onChange={(e) => setCedula(e.target.value)}
          required
        />
      </div>

      <PaymentDataFields method={method} values={payment} onChange={setPayment} />

      {state.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <SubmitButton missing={missing} />
    </form>
  );
}
