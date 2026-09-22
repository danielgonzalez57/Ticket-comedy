import "server-only";
import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { ADMIN_CACHE_COOKIE, signAdminCache } from "@/lib/admin-cache-cookie";

// Reads the admin email out of the signed cache cookie proxy.ts already
// sets (see lib/admin-cache-cookie.ts) — display-only, zero extra
// network round trips. Falls back to null if the cookie is missing,
// expired, or fails signature verification; callers should treat that
// as "unknown", not as "not an admin" (proxy.ts already gates access).
export async function getAdminEmail(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(ADMIN_CACHE_COOKIE)?.value;
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [uid, emailB64, exp, sig] = parts;
  if (Date.now() > Number(exp)) return null;

  const expected = signAdminCache(`${uid}.${emailB64}.${exp}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return Buffer.from(emailB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
}
