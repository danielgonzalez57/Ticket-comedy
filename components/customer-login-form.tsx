"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Mail,
  MailCheck,
  RotateCw,
  Ticket,
} from "lucide-react";
import {
  sendLoginCode,
  verifyLoginCode,
  type SendCodeState,
  type VerifyCodeState,
} from "@/app/(public)/mis-entradas/actions";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function SubmitButton({
  label,
  pendingLabel,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      className="group h-11 w-full text-sm font-semibold"
      disabled={pending || disabled}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> {pendingLabel}
        </>
      ) : (
        <>
          {label}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </Button>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 font-medium text-foreground transition-colors hover:text-accent-ink disabled:opacity-60"
    >
      <RotateCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} />
      {pending ? "Reenviando…" : "Reenviar código"}
    </button>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
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
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [code, setCode] = useState("");
  const [resent, setResent] = useState(false);

  // Advance to step 2 whenever a send succeeds (derived during render
  // from the new action state, not in an effect). "Usar otro correo"
  // can still go back to step 1 — this only fires on a NEW state.
  const [lastSendState, setLastSendState] = useState(sendState);
  if (sendState !== lastSendState) {
    setLastSendState(sendState);
    if (sendState.sent) {
      if (step === "code") setResent(true);
      setStep("code");
      setCode("");
    }
  }

  const emailValid = EMAIL_RE.test(email.trim());
  const emailError =
    emailTouched && email.trim() !== "" && !emailValid
      ? "Ese correo no tiene un formato válido."
      : null;

  if (step === "code") {
    return (
      <AuthCard
        icon={MailCheck}
        title="Revisa tu correo"
        description={
          <>
            Enviamos un código a{" "}
            <span className="font-medium text-foreground">{sendState.email}</span>.
            Puede tardar un minuto.
          </>
        }
        footer={
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setResent(false);
            }}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Usar otro correo
          </button>
        }
      >
        <form action={verifyAction} className="space-y-5">
          <input type="hidden" name="email" value={sendState.email} />
          <div className="space-y-2">
            <Label htmlFor="code">Código de acceso</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              aria-invalid={Boolean(verifyState.error) || undefined}
              className="h-14 text-center font-mono text-2xl font-semibold tracking-[0.5em] placeholder:tracking-[0.5em]"
              autoFocus
            />
          </div>

          {verifyState.error && <ErrorBanner>{verifyState.error}</ErrorBanner>}
          {sendState.error && <ErrorBanner>{sendState.error}</ErrorBanner>}

          <SubmitButton
            label="Ver mis entradas"
            pendingLabel="Verificando…"
            disabled={code.length < 6}
          />
        </form>

        <form
          action={sendAction}
          className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
        >
          <input type="hidden" name="email" value={sendState.email} />
          {resent ? <span>Te enviamos un código nuevo.</span> : <span>¿No te llegó?</span>}
          <ResendButton />
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={Ticket}
      title="Mis entradas"
      description="Ingresa el correo con el que compraste y te enviamos un código para entrar. Sin contraseñas."
    >
      <form action={sendAction} noValidate className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="tucorreo@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              aria-invalid={Boolean(emailError || sendState.error) || undefined}
              aria-describedby={emailError ? "email-error" : undefined}
              className="h-11 pl-10"
            />
          </div>
          {emailError && (
            <p id="email-error" className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5 shrink-0" />
              {emailError}
            </p>
          )}
        </div>

        {sendState.error && <ErrorBanner>{sendState.error}</ErrorBanner>}

        <SubmitButton
          label="Enviarme el código"
          pendingLabel="Enviando…"
          disabled={!emailValid}
        />
      </form>
    </AuthCard>
  );
}
