import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createStubClient } from "@/lib/supabase/stub";

// Service-role client. BYPASSES RLS — use only in trusted server code
// (server actions / route handlers). Never import this into a client
// component. Each call returns a fresh stateless client (no cookies).
export function createAdminClient() {
  if (!isSupabaseConfigured()) return createStubClient();
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
