import { Brand } from "@/components/brand";
import { SiteHeader } from "@/components/site-header";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 text-center sm:px-6">
          <Brand size="lg" />
          <p className="max-w-sm text-xs text-muted-foreground">
            Boletos para shows de stand-up en Venezuela. Pago móvil · Binance.
          </p>
          <div className="h-px w-16 bg-gradient-to-r from-primary via-highlight to-primary opacity-70" />
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
            © {new Date().getFullYear()} · Pinto &amp; Aparte — derechos
            reservados (los chistes también)
          </p>
        </div>
      </footer>
    </div>
  );
}
