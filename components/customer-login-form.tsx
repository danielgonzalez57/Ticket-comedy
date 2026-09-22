"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Mail, ShieldCheck } from "lucide-react";
import {
  sendLoginCode,
  verifyLoginCode,
  type SendCodeState,
  type VerifyCodeState,
} from "@/app/(public)/mis-entradas/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton({ pendingLabel, label }: { pendingLabel: string; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

// Two-step passwordless login: (1) request a one-time code by email,
// (2) type that code in to open a session — see
// app/(public)/mis-entradas/actions.ts for how the code itself is
// minted and emailed (Resend, not Supabase's default auth email).
export function CustomerLoginForm() {
  const [sendState, sendAction] = useActionState<SendCodeState, FormData>(sendLoginCode, {
    error: null,
    sent: false,
    email: "",
  });
  const [verifyState, verifyAction] = useActionState<VerifyCodeState, FormData>(
    verifyLoginCode,
    { error: null },
  );
  const [step, setStep] = useState<"email" | "code">("email");

  // Advance to step 2 once a code was actually sent. A plain effect
  // (not driven from inside the form's own action) so "Usar otro
  // correo" can freely move back to step 1 without a stale sendState
  // immediately bouncing it forward again.
  useEffect(() => {
    if (sendState.sent) setStep("code");
  }, [sendState.sent, sendState.email]);

  if (step === "code") {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <Mail className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium">Revisa tu correo</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Te enviamos un código a <span className="text-foreground">{sendState.email}</span>.
              Escríbelo abajo.
            </p>
          </div>
        </div>

        <form action={verifyAction} className="space-y-3">
          <input type="hidden" name="email" value={sendState.email} />
          <div className="space-y-2">
            <Label htmlFor="code">Código</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="0000 0000"
              className="text-center font-mono text-lg tracking-[0.2em]"
              autoFocus
              required
            />
          </div>

          {verifyState.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {verifyState.error}
            </p>
          )}

          <SubmitButton pendingLabel="Verificando…" label="Entrar" />
        </form>

        <button
          type="button"
          onClick={() => setStep("email")}
          className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Usar otro correo o pedir un código nuevo
        </button>
      </div>
    );
  }

  return (
    <form action={sendAction} className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="tucorreo@ejemplo.com"
          defaultValue={sendState.email}
          required
        />
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          El mismo correo que usaste al comprar. Sin contraseña — te mandamos un código.
        </p>
      </div>

      {sendState.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {sendState.error}
        </p>
      )}

      <SubmitButton pendingLabel="Enviando…" label="Enviarme el código" />
    </form>
  );
}
