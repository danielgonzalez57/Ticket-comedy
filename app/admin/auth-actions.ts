"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export type AuthState = { error: string | null };

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

  if (!email || !password) {
    return { error: "Ingresa tu correo y contraseña." };
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
    return { error: "Demasiados intentos. Espera unos minutos e intenta de nuevo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Credenciales inválidas." };
  }

  revalidatePath("/admin", "layout");
  redirect(redirectTo.startsWith("/admin") ? redirectTo : "/admin");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
