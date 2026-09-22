import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Use in admin server components / actions to guarantee a signed-in
// *admin*. Redirects to the login page otherwise.
//
// Checking is_admin() here (not just getUser()) matters now that
// customers can also hold a real Supabase Auth session (the "Mis
// entradas" email-code login) — without it, a logged-in customer
// would pass this check too, and every admin server action's only
// real protection would be proxy.ts's path-based middleware gate
// (see app/admin/(panel)/layout.tsx's comment: mutations rely on
// requireUser() precisely *because* that middleware coverage isn't
// meant to be the sole enforcement point). is_admin() is
// security definer and re-reads the admin_users allowlist server-side
// on every call, so this can't be spoofed via a stale cookie or a
// client-supplied claim.
export async function requireUser() {
  // Design mode: let the admin UI render without auth.
  if (!isSupabaseConfigured()) {
    return { id: "design-mode" } as { id: string };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/admin/login");

  return user;
}
