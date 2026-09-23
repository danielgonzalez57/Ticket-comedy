"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// NEXT_PUBLIC_PAYMENT_INFO is free text, conventionally "Label: value
// | Label: value | ...". Split on that convention so each field gets
// its own copy button (mobile customers need to paste bank/phone/CI
// separately into their banking app) — fall back to one big copy
// button over the raw string if it doesn't match.
function parseFields(raw: string): { label: string; value: string }[] | null {
  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
  const fields = parts.map((part) => {
    const idx = part.indexOf(":");
    if (idx < 0) return null;
    return { label: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim() };
  });
  if (fields.some((f) => f === null) || fields.length === 0) return null;
  return fields as { label: string; value: string }[];
}

function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copiado");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copiar ${value}`}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function PaymentInfoFields({ raw }: { raw: string }) {
  const fields = parseFields(raw);

  if (!fields) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
        <span>{raw}</span>
        <CopyButton value={raw} />
      </p>
    );
  }

  return (
    <div className="mt-1 space-y-1 text-muted-foreground">
      {fields.map((field) => (
        <div key={field.label} className="flex items-center justify-between gap-2">
          <span>
            {field.label}: <span className="text-foreground">{field.value}</span>
          </span>
          <CopyButton value={field.value} />
        </div>
      ))}
    </div>
  );
}
