import { timingSafeEqual } from "crypto";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  ADMIN_CACHE_COOKIE,
  ADMIN_CACHE_TTL_MS,
  signAdminCache,
  encodeAdminCache,
} from "@/lib/admin-cache-cookie";

// Next.js 16 "proxy" convention (formerly middleware): refreshes the
// Supabase session and guards the /admin area.

// Hard cap on an admin session's age, regardless of activity — Supabase's
// refresh token would otherwise keep a session alive indefinitely just
// from normal use. After this many ms since the actual sign-in (not the
// last token refresh), force a real login again.
const ADMIN_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// is_admin() is an RPC — a second network round trip to Supabase on
// top of getUser()'s. Since it only changes when someone edits the
// admin_users allowlist, cache a positive result (plus the email, so
// the admin UI can show who's logged in without a third round trip)
// in a short-lived signed cookie so most navigations only pay for
// getUser(). Signed with the service-role key (server-only secret) so
// it can't be forged by sending an arbitrary cookie value.
function readAdminCache(
  request: NextRequest,
  userId: string,
): boolean {
  const raw = request.cookies.get(ADMIN_CACHE_COOKIE)?.value;
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 4) return false;
  const [uid, emailB64, exp, sig] = parts;
  if (uid !== userId) return false;
  if (Date.now() > Number(exp)) return false;
  const expected = signAdminCache(`${uid}.${emailB64}.${exp}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

function writeAdminCache(
  request: NextRequest,
  response: NextResponse,
  userId: string,
  email: string,
) {
  const value = encodeAdminCache(userId, email);
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: ADMIN_CACHE_TTL_MS / 1000,
    path: "/admin",
  };
  // Set on both so it's readable immediately by the Server Components
  // rendering this same request/response, not just on the next one.
  request.cookies.set(ADMIN_CACHE_COOKIE, value);
  response.cookies.set(ADMIN_CACHE_COOKIE, value, options);
}

export async function proxy(request: NextRequest) {
  // Design mode (no Supabase credentials): skip auth entirely so every
  // page is browsable.
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: refreshes the session. Do not run code between
  // createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Now that customers can also log in (magic link, for "Mis
  // entradas"), a session alone no longer means admin — every
  // authenticated user must be checked against the admin_users
  // allowlist via is_admin() (see migrations/0012). Without this,
  // any logged-in customer would pass straight into /admin.
  let isAdmin = false;
  if (user) {
    const signedInAt = user.last_sign_in_at
      ? new Date(user.last_sign_in_at).getTime()
      : 0;
    const sessionTooOld = Date.now() - signedInAt > ADMIN_SESSION_MAX_AGE_MS;

    if (sessionTooOld) {
      // Revokes the refresh token server-side and clears the session
      // cookies via the setAll callback above — falls through to the
      // redirect-to-login below since isAdmin stays false.
      await supabase.auth.signOut();
      response.cookies.delete(ADMIN_CACHE_COOKIE);
    } else if (readAdminCache(request, user.id)) {
      isAdmin = true;
    } else {
      const { data } = await supabase.rpc("is_admin");
      isAdmin = data === true;
      if (isAdmin && user.email) {
        writeAdminCache(request, response, user.id, user.email);
      }
    }
  }

  const { pathname } = request.nextUrl;
  const isAdminArea =
    pathname.startsWith("/admin") && pathname !== "/admin/login";

  if (isAdminArea && !isAdmin) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/admin/login" && isAdmin) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Only the admin area uses auth, so the session check / Supabase round
  // trip runs there — public pages skip the proxy entirely and load fast.
  matcher: ["/admin", "/admin/:path*"],
};
