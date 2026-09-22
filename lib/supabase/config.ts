// True only when real Supabase credentials are present. While false, the
// app runs in "design mode": clients are stubbed so every page renders
// with empty data instead of crashing on missing/placeholder env vars.
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
      key &&
      url.startsWith("http") &&
      !url.includes("placeholder") &&
      key.length > 20,
  );
}
