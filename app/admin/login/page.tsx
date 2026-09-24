import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/admin/login-form";
import { AuthCard } from "@/components/auth-card";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = { title: "Admin · Pinto & Aparte" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* Quiet backdrop: a soft azul glow over a faint dot grid. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />

      <header className="relative flex items-center justify-between px-4 py-4 sm:px-6">
        <Brand href="/" size="default" />
        <ThemeToggle />
      </header>

      <main className="relative flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <AuthCard
            icon={ShieldCheck}
            title="Panel de administración"
            description="Entra con tu cuenta de admin para gestionar shows y ventas."
            footer={
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> Volver a la cartelera
              </Link>
            }
          >
            <LoginForm redirectTo={redirect ?? "/admin"} />
          </AuthCard>
        </div>
      </main>
    </div>
  );
}
