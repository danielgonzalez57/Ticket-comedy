"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Coins, Smartphone } from "lucide-react";
import {
  createOrder,
  type CheckoutState,
} from "@/app/(public)/shows/[id]/checkout/actions";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { normalizeCedula, validatePaymentReport } from "@/lib/payment-report";
import { cn } from "@/lib/utils";
import {
  EMPTY_PAYMENT_FIELDS,
  PaymentDataFields,
} from "@/components/payment-data-fields";
import { PaymentInfoFields } from "@/components/payment-info-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CheckoutMethod = "pago_movil" | "binance";

type Props = {
  showId: string;
  quantity: number;
  // Already formatted on the server — Bs amounts must come from the DB
  // (see the note in lib/format.ts), never be computed here.
  totalUsdLabel: string;
  totalBsLabel: string;
  tasaLabel: string;
  pagoMovilInfo: string;
  binanceInfo: string;
};

function SubmitButton({ missing }: { missing: string | null }) {
  const { pending } = useFormStatus();
  return (
    <div className="space-y-2">
      <Button
        type="submit"
        size="lg"
        className="h-11 w-full text-base"
        disabled={pending || missing !== null}
      >
        {pending ? "Apartando…" : "Apartar entradas"}
      </Button>
      {missing && !pending && (
        <p className="text-center text-xs text-muted-foreground">{missing}</p>
      )}
    </div>
  );
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 text-sm font-semibold">
      <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
        {n}
      </span>
      {children}
    </h2>
  );
}

function MethodCard({
  selected,
  onSelect,
  icon: Icon,
  title,
  amount,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  amount: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-start gap-3 rounded-xl border bg-card p-4 text-left transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:border-foreground/25",
      )}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-lg transition-colors",
          selected
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground tabular-nums">
          {amount}
        </span>
      </span>
      <span
        className={cn(
          "absolute top-3 right-3 flex size-5 items-center justify-center rounded-full border transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input",
        )}
      >
        {selected && <Check className="size-3" />}
      </span>
    </button>
  );
}

// One page: customer data, payment method (two cards) and, for the
// chosen method, where to pay and the payment data form. Reserving
// also reports the payment (see createOrder); the button stays
// disabled until everything required is filled in, and the server
// runs the same checks again.
export function CheckoutForm({
  showId,
  quantity,
  totalUsdLabel,
  totalBsLabel,
  tasaLabel,
  pagoMovilInfo,
  binanceInfo,
}: Props) {
  const [state, formAction] = useActionState<CheckoutState, FormData>(
    createOrder,
    { error: null },
  );
  const [customer, setCustomer] = useState({
    name: "",
    cedula: "",
    phone: "",
    email: "",
  });
  const [method, setMethod] = useState<CheckoutMethod | null>(null);
  const [payment, setPayment] = useState(EMPTY_PAYMENT_FIELDS);

  const setField =
    (key: keyof typeof customer) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setCustomer((c) => ({ ...c, [key]: e.target.value }));

  function selectMethod(next: CheckoutMethod) {
    if (next === method) return;
    setMethod(next);
    // Each method has its own reference format — start clean.
    setPayment(EMPTY_PAYMENT_FIELDS);
  }

  let missing: string | null = null;
  if (!customer.name.trim()) missing = "Ingresa tu nombre.";
  else if (!normalizeCedula(customer.cedula))
    missing = "Ingresa una cédula válida (ej: V-12345678).";
  else if (!customer.phone.trim()) missing = "Ingresa tu teléfono.";
  else if (!/^\S+@\S+\.\S+$/.test(customer.email.trim()))
    missing = "Ingresa un correo válido.";
  else if (!method) missing = "Elige cómo vas a pagar.";
  else {
    const checked = validatePaymentReport(method, payment);
    if ("error" in checked) missing = checked.error;
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="show_id" value={showId} />
      <input type="hidden" name="quantity" value={quantity} />
      <input type="hidden" name="payment_method" value={method ?? ""} />

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <StepTitle n={1}>Tus datos</StepTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customer_name">Nombre completo</Label>
            <Input
              id="customer_name"
              name="customer_name"
              autoComplete="name"
              value={customer.name}
              onChange={setField("name")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cedula">Cédula</Label>
            <Input
              id="cedula"
              name="cedula"
              placeholder="V-12345678"
              value={customer.cedula}
              onChange={setField("cedula")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer_phone">WhatsApp / Teléfono</Label>
            <Input
              id="customer_phone"
              name="customer_phone"
              type="tel"
              autoComplete="tel"
              placeholder="0412-1234567"
              value={customer.phone}
              onChange={setField("phone")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer_email">Correo</Label>
            <Input
              id="customer_email"
              name="customer_email"
              type="email"
              autoComplete="email"
              value={customer.email}
              onChange={setField("email")}
              required
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <StepTitle n={2}>¿Cómo vas a pagar?</StepTitle>
        <div
          role="radiogroup"
          aria-label="Método de pago"
          className="grid grid-cols-2 gap-3"
        >
          <MethodCard
            selected={method === "pago_movil"}
            onSelect={() => selectMethod("pago_movil")}
            icon={Smartphone}
            title={PAYMENT_METHOD_LABELS.pago_movil}
            amount={totalBsLabel}
          />
          <MethodCard
            selected={method === "binance"}
            onSelect={() => selectMethod("binance")}
            icon={Coins}
            title={PAYMENT_METHOD_LABELS.binance}
            amount={`${totalUsdLabel} en USDT`}
          />
        </div>

        {method && (
          <div key={method} className="tc-rise space-y-5 pt-1">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
              <p className="font-medium">
                {method === "binance"
                  ? "Envía tu pago por Binance Pay"
                  : "Haz tu Pago Móvil a"}
              </p>
              <PaymentInfoFields
                raw={method === "binance" ? binanceInfo : pagoMovilInfo}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {method === "binance" ? (
                  <>
                    Monto exacto:{" "}
                    <span className="font-medium text-foreground">
                      {totalUsdLabel} en USDT
                    </span>
                  </>
                ) : (
                  <>
                    Monto exacto:{" "}
                    <span className="font-medium text-foreground">
                      {totalBsLabel}
                    </span>{" "}
                    (tasa {tasaLabel} Bs/USD)
                  </>
                )}
              </p>
            </div>

            <div className="space-y-4">
              <p className="text-sm font-medium">
                Después de pagar, completa con los datos de tu comprobante:
              </p>
              <PaymentDataFields
                method={method}
                values={payment}
                onChange={setPayment}
              />
            </div>
          </div>
        )}
      </section>

      {state.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <SubmitButton missing={missing} />
      <p className="text-center text-xs text-muted-foreground">
        El admin revisa tu pago y te envía tu entrada por correo.
      </p>
    </form>
  );
}
