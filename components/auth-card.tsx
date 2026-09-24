import { cn } from "@/lib/utils";

// Shared frame for the admin login and the customer "Mis entradas"
// login: a single calm card with an icon badge, a clear title and one
// line of context, so both entry points feel like the same product.
export function AuthCard({
  icon: Icon,
  title,
  description,
  children,
  footer,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "tc-rise w-full rounded-2xl border border-border bg-card/80 p-6 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-8 dark:shadow-black/40",
        className,
      )}
    >
      <div className="mb-7 space-y-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-accent-ink ring-1 ring-primary/20">
          <Icon className="size-5" />
        </span>
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
      {footer && (
        <div className="mt-6 border-t border-border pt-5 text-center text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}
