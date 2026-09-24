"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export type AuthState = {
  error: string | null;
  // Which inputs to flag. Wrong credentials flags both on purpose —
  // saying which one was wrong would confirm whether an admin email
  // exists.
  fields?: ("email" | "password")[];
  // Echoed back so the email survives a failed attempt.
  email?: string;
};

// Rate limited by IP AND by email, both "closed" (fail = block) —
// this is the admin password login, the single highest-value target
// in the app for a brute-force attempt. Supabase's own GoTrue has
// some internal throttling, but that's not something this app
// controls or can verify is configured, so it isn't relied on alone.
export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirect") ?? "/admin");

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { error: "Ingresa un correo válido.", fields: ["email"], email };
  }
  if (!password) {
    return { error: "Ingresa tu contraseña.", fields: ["password"], email };
  }

  const ip = await getClientIp();
  const allowedByIp = await checkRateLimit(`admin-login-ip:${ip}`, 10, 600, "closed");
  const allowedByEmail = await checkRateLimit(
    `admin-login-email:${email.toLowerCase()}`,
    5,
    600,
    "closed",
  );
  if (!allowedByIp || !allowedByEmail) {
    return {
      error: "Demasiados intentos. Espera unos minutos e intenta de nuevo.",
      email,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "invalid_credentials" || error.status === 400) {
      return {
        error: "Correo o contraseña incorrectos.",
        fields: ["email", "password"],
        email,
      };
    }
    return { error: "No pudimos iniciar sesión. Intenta de nuevo.", email };
  }

  revalidatePath("/admin", "layout");
  redirect(redirectTo.startsWith("/admin") ? redirectTo : "/admin");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
