import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// A no-network stand-in for the Supabase client used in "design mode"
// (no credentials configured). Every query resolves to empty data, so
// pages render their empty/placeholder states without crashing.
export function createStubClient(): SupabaseClient<Database> {
  // Chainable, thenable proxy: any method returns itself; awaiting it
  // yields an empty PostgREST-shaped result.
  const builder: unknown = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void) =>
          resolve({ data: null, error: null, count: 0 });
      }
      return () => builder;
    },
    apply: () => builder,
  });

  const client = {
    from: () => builder,
    rpc: () => builder,
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: { message: "Supabase no está configurado todavía." },
      }),
      signOut: async () => ({ error: null }),
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
  };

  return client as unknown as SupabaseClient<Database>;
}
