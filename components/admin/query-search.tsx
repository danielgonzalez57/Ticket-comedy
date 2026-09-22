"use client";

import { useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

type Props = {
  param?: string;
  placeholder?: string;
  className?: string;
};

// Keyed on the URL value so external navigation (back/forward, another
// filter resetting the query string) resets the input without an
// effect-driven setState.
export function QuerySearch({ param = "q", placeholder, className }: Props) {
  const searchParams = useSearchParams();
  const urlValue = searchParams.get(param) ?? "";
  return (
    <QuerySearchInput
      key={urlValue}
      initial={urlValue}
      param={param}
      placeholder={placeholder}
      className={className}
    />
  );
}

function QuerySearchInput({
  initial,
  param,
  placeholder = "Buscar...",
  className,
}: Props & { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  function onChange(next: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.trim()) params.set(param!, next.trim());
      else params.delete(param!);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    }, 350);
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        defaultValue={initial}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-56 rounded-lg border border-input bg-transparent pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      />
    </div>
  );
}
