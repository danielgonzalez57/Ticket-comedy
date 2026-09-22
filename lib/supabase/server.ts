import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createStubClient } from "@/lib/supabase/stub";

// Server (RSC / route handler / server action) client using the anon
// key, wired to the request cookies so the admin auth session is read
// and refreshed. Subject to RLS.
export async function createClient() {
  if (!isSupabaseConfigured()) return createStubClient();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — safe to ignore,
            // the middleware refreshes the session.
          }
        },
      },
    },
  );
}
