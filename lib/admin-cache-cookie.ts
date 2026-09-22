import { createHmac } from "crypto";

// Shared between proxy.ts (writes/reads via NextRequest/NextResponse)
// and lib/admin-session.ts (reads via next/headers cookies()) so the
// admin-check cache cookie has one signing implementation.
export const ADMIN_CACHE_COOKIE = "tc_admin_ok";
export const ADMIN_CACHE_TTL_MS = 60_000;

export function signAdminCache(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function encodeAdminCache(userId: string, email: string) {
  const emailB64 = Buffer.from(email, "utf8").toString("base64url");
  const exp = Date.now() + ADMIN_CACHE_TTL_MS;
  const sig = signAdminCache(`${userId}.${emailB64}.${exp}`);
  return `${userId}.${emailB64}.${exp}.${sig}`;
}
