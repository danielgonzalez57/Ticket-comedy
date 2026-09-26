"use client";

import { useFormStatus } from "react-dom";
import { Loader2, LogOut } from "lucide-react";
import { signOutCustomer } from "@/app/(public)/mis-entradas/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <LogOut className="size-3.5" />
      )}
      {pending ? "Saliendo…" : "Salir"}
    </button>
  );
}

export function CustomerSignOutButton() {
  return (
    <form action={signOutCustomer}>
      <SubmitButton />
    </form>
  );
}
