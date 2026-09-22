"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Ticket,
  Receipt,
  BarChart3,
  Users,
  ScanLine,
  LogOut,
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
  { href: "/admin/validate", label: "Validar", icon: ScanLine },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-md border-l-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-highlight bg-secondary text-foreground"
                : "border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", active && "text-highlight")} />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function AdminSidebar({ userEmail }: { userEmail: string | null }) {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border md:flex">
      <div className="flex h-20 items-center justify-between px-4">
        <Brand href="/admin" size="md" />
        <ThemeToggle />
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        <NavLinks />
      </nav>
      <div className="space-y-2 border-t border-border p-3">
        {userEmail && (
          <p className="truncate px-3 text-xs text-muted-foreground" title={userEmail}>
            {userEmail}
          </p>
        )}
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          >
            <LogOut className="size-4" />
            Salir
          </button>
        </form>
      </div>
    </aside>
  );
}

export function AdminTopbar({ userEmail }: { userEmail: string | null }) {
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur md:hidden">
      <div className="flex h-20 items-center justify-between px-4">
        <Brand href="/admin" size="md" />
        <div className="flex items-center gap-3">
          {userEmail && (
            <p className="max-w-28 truncate text-xs text-muted-foreground" title={userEmail}>
              {userEmail}
            </p>
          )}
          <ThemeToggle />
          <form action={signOut}>
            <button
              type="submit"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Salir"
            >
              <LogOut className="size-5" />
            </button>
          </form>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
        <NavLinks />
      </nav>
    </div>
  );
}
