import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createStubClient } from "@/lib/supabase/stub";

// Browser (client component) Supabase client using the anon key.
export function createClient() {
  if (!isSupabaseConfigured()) return createStubClient();
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
