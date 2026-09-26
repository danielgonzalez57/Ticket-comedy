"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  LayoutDashboard,
  Ticket,
  Receipt,
  BarChart3,
  Users,
  ScanLine,
  LogOut,
  Loader2,
  Menu,
  X,
} from "lucide-react";
import { signOut } from "@/app/admin/auth-actions";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/shows", label: "Shows", icon: Ticket },
  { href: "/admin/orders", label: "Órdenes", icon: Receipt },
  { href: "/admin/reporte", label: "Reporte", icon: BarChart3 },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/validate", label: "Validar QR", icon: ScanLine },
];

function isActive(pathname: string, item: (typeof items)[number]) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

function NavLinks({
  onNavigate,
  large = false,
}: {
  onNavigate?: () => void;
  large?: boolean;
}) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 whitespace-nowrap rounded-lg border-l-2 px-3 text-sm transition-colors",
              large ? "py-3 text-base" : "py-2",
              active
                ? "border-highlight bg-secondary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <Icon className={cn(large ? "size-5" : "size-4", active && "text-highlight")} />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function SignOutSubmitButton({ large }: { large: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 text-sm text-highlight transition-colors hover:bg-secondary/60 disabled:pointer-events-none disabled:opacity-60",
        large ? "py-3 text-base" : "py-2",
      )}
    >
      {pending ? (
        <Loader2 className={cn("animate-spin", large ? "size-5" : "size-4")} />
      ) : (
        <LogOut className={large ? "size-5" : "size-4"} />
      )}
      {pending ? "Saliendo…" : "Salir"}
    </button>
  );
}

function SignOutButton({ large = false }: { large?: boolean }) {
  return (
    <form action={signOut}>
      <SignOutSubmitButton large={large} />
    </form>
  );
}

// Desktop: fixed-height sidebar that stays put while the page scrolls.
export function AdminSidebar({ userEmail }: { userEmail: string | null }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border md:flex">
      <div className="flex h-20 items-center justify-between px-4">
        <Brand href="/admin" size="md" />
        <ThemeToggle />
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        <NavLinks />
      </nav>
      <div className="space-y-2 border-t border-border p-3">
        {userEmail && (
          <p className="truncate px-3 text-xs text-highlight" title={userEmail}>
            {userEmail}
          </p>
        )}
        <SignOutButton />
      </div>
    </aside>
  );
}

// Mobile: compact sticky header — menu button and brand. The menu
// opens a slide-in drawer with every section; the QR scanner also has
// a prominent card on the dashboard.
export function AdminTopbar({ userEmail }: { userEmail: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl md:hidden">
      <div className="flex h-16 items-center justify-between gap-2 px-2">
        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitive.Trigger
            aria-label="Abrir menú"
            className="inline-flex size-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-secondary"
          >
            <Menu className="size-5" />
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
            <DialogPrimitive.Popup className="fixed inset-y-0 left-0 z-50 flex w-[82vw] max-w-xs flex-col border-r border-border bg-background shadow-2xl outline-none transition-transform duration-300 ease-out data-ending-style:-translate-x-full data-starting-style:-translate-x-full">
              <DialogPrimitive.Title className="sr-only">Menú</DialogPrimitive.Title>
              <div className="flex h-16 items-center justify-between border-b border-border px-4">
                <Brand href="/admin" size="default" />
                <DialogPrimitive.Close
                  aria-label="Cerrar menú"
                  className="inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-5" />
                </DialogPrimitive.Close>
              </div>
              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
                <NavLinks large onNavigate={() => setOpen(false)} />
              </nav>
              <div className="space-y-1 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  {userEmail ? (
                    <p className="truncate text-xs text-highlight" title={userEmail}>
                      {userEmail}
                    </p>
                  ) : (
                    <span />
                  )}
                  <ThemeToggle />
                </div>
                <SignOutButton large />
              </div>
            </DialogPrimitive.Popup>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        <Brand href="/admin" size="default" className="[&_img]:h-14" />

        {/* Same width as the menu button, so the brand stays centred. */}
        <span aria-hidden className="size-10" />
      </div>
    </header>
  );
}
