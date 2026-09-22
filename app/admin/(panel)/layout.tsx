import { AdminSidebar, AdminTopbar } from "@/components/admin/admin-nav";
import { getAdminEmail } from "@/lib/admin-session";

export const metadata = { title: "Admin · Pinto & Aparte" };

// No auth check here on purpose: proxy.ts's matcher ("/admin",
// "/admin/:path*") already covers every route this layout wraps, and
// already validates session + is_admin() on every request before it
// ever reaches here. Re-checking with requireUser() (a second
// getUser() round trip to Supabase Auth) on every single page
// navigation was pure redundant latency — mutations still call
// requireUser() themselves in their own server actions, where it's
// not redundant. getAdminEmail() below is display-only and reads the
// same signed cache cookie proxy.ts already writes — no extra round
// trip either.
export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const email = await getAdminEmail();

  return (
    <div className="flex min-h-screen">
      <AdminSidebar userEmail={email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar userEmail={email} />
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
