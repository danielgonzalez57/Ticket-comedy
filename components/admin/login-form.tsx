"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { signIn, type AuthState } from "@/app/admin/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function SubmitButton({ disabled }: { disabled: boolean }) {
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
          <Loader2 className="size-4 animate-spin" /> Entrando…
        </>
      ) : (
        <>
          Entrar
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </Button>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-center gap-1.5 text-xs text-destructive">
      <AlertCircle className="size-3.5 shrink-0" />
      {children}
    </p>
  );
}

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(signIn, {
    error: null,
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  // Server errors stay until the flagged field is edited again.
  const [editedSinceError, setEditedSinceError] = useState({
    email: false,
    password: false,
  });
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    setEditedSinceError({ email: false, password: false });
    if (state.email && !email) setEmail(state.email);
  }

  const emailFormatError =
    touched.email && email.trim() !== "" && !EMAIL_RE.test(email.trim())
      ? "Ese correo no tiene un formato válido."
      : null;
  const emailEmptyError =
    touched.email && email.trim() === "" ? "Ingresa tu correo." : null;
  const passwordEmptyError =
    touched.password && password === "" ? "Ingresa tu contraseña." : null;

  const serverFlags = (f: "email" | "password") =>
    Boolean(state.fields?.includes(f)) && !editedSinceError[f];
  const emailInvalid = Boolean(emailFormatError || emailEmptyError) || serverFlags("email");
  const passwordInvalid = Boolean(passwordEmptyError) || serverFlags("password");
  const showServerError =
    state.error !== null &&
    !(state.fields ?? []).every((f) => editedSinceError[f]);

  const canSubmit = EMAIL_RE.test(email.trim()) && password !== "";

  function detectCaps(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  }

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="redirect" value={redirectTo} />

      <div className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="admin@pintoyaparte.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEditedSinceError((s) => ({ ...s, email: true }));
            }}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            aria-invalid={emailInvalid || undefined}
            aria-describedby={emailFormatError || emailEmptyError ? "email-error" : undefined}
            className="h-11 pl-10"
            autoFocus
          />
        </div>
        {(emailFormatError || emailEmptyError) && (
          <FieldError id="email-error">{emailFormatError ?? emailEmptyError}</FieldError>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setEditedSinceError((s) => ({ ...s, password: true }));
            }}
            onBlur={() => {
              setTouched((t) => ({ ...t, password: true }));
              setCapsLock(false);
            }}
            onKeyDown={detectCaps}
            onKeyUp={detectCaps}
            aria-invalid={passwordInvalid || undefined}
            aria-describedby={passwordEmptyError ? "password-error" : undefined}
            className="h-11 pr-11 pl-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={showPassword}
            className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {passwordEmptyError && (
          <FieldError id="password-error">{passwordEmptyError}</FieldError>
        )}
        {capsLock && !passwordEmptyError && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Bloq Mayús está activado.
          </p>
        )}
      </div>

      <div
        role="alert"
        aria-live="polite"
        className={cn(
          "grid transition-all duration-200",
          showServerError ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          {state.error && (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {state.error}
            </p>
          )}
        </div>
      </div>

      <SubmitButton disabled={!canSubmit} />
    </form>
  );
}
