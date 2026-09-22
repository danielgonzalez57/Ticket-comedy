"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { sendLoginCodeEmail } from "@/lib/email";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export type SendCodeState = { error: string | null; sent: boolean; email: string };

// Step 1: generates a one-time code via the Auth admin API (does NOT
// send Supabase's own built-in email — generateLink only mints the
// token) and emails it ourselves through Resend, in the same branded
// template as the rest of the app. See sendLoginCodeEmail.
//
// Rate limited by IP AND by email, both "closed" (fail = block): this
// sends an email per call, so a broken limiter should not turn into
// free spam capacity (same reasoning as reportPayment — see
// lib/rate-limit.ts).
export async function sendLoginCode(
  _prev: SendCodeState,
  formData: FormData,
): Promise<SendCodeState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!EMAIL_RE.test(email)) {
    return { error: "Ingresa un correo válido.", sent: false, email };
  }

  const ip = await getClientIp();
  const allowedByIp = await checkRateLimit(`login-ip:${ip}`, 5, 600, "closed");
  const allowedByEmail = await checkRateLimit(
    `login-email:${email.toLowerCase()}`,
    3,
    600,
    "closed",
  );
  if (!allowedByIp || !allowedByEmail) {
    return {
      error: "Demasiados intentos. Espera unos minutos e intenta de nuevo.",
      sent: false,
      email,
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const code = data?.properties?.email_otp;
  if (error || !code) {
    return { error: "No pudimos generar tu código. Intenta de nuevo.", sent: false, email };
  }

  const emailSent = await sendLoginCodeEmail({ email, code });
  if (!emailSent) {
    return { error: "No pudimos enviar el código. Intenta de nuevo.", sent: false, email };
  }

  return { error: null, sent: true, email };
}

export type VerifyCodeState = { error: string | null };

// Step 2: verifies the code the customer typed in and, on success,
// sets the session cookie (via the request-scoped server client) —
// same mechanism the admin login uses, just for a customer session
// instead. Rate limited separately from sendLoginCode (this is what
// stops someone from brute-forcing the code itself, not just spamming
// sends).
export async function verifyLoginCode(
  _prev: VerifyCodeState,
  formData: FormData,
): Promise<VerifyCodeState> {
  const email = String(formData.get("email") ?? "").trim();
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");

  if (!EMAIL_RE.test(email)) return { error: "Correo inválido." };
  if (!code) return { error: "Ingresa el código que te enviamos." };

  const ip = await getClientIp();
  const allowedByIp = await checkRateLimit(`login-verify-ip:${ip}`, 10, 600, "closed");
  const allowedByEmail = await checkRateLimit(
    `login-verify-email:${email.toLowerCase()}`,
    8,
    600,
    "closed",
  );
  if (!allowedByIp || !allowedByEmail) {
    return { error: "Demasiados intentos. Espera unos minutos e intenta de nuevo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) {
    return { error: "Código incorrecto o vencido. Pide uno nuevo." };
  }

  redirect("/mis-entradas");
}

export async function signOutCustomer() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
