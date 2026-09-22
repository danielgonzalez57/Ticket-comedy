import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Brand />
        <div className="flex items-center gap-3">
          <Link
            href="/mis-entradas"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Mis entradas
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
