"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resolvePaymentConflict } from "@/app/admin/(panel)/orders/actions";
import { Button } from "@/components/ui/button";

export function ResolveConflictActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function resolve(keepThis: boolean) {
    const note =
      typeof window !== "undefined"
        ? window.prompt(
            keepThis
              ? "¿Cómo verificaste que esta orden es la correcta? (opcional, queda en la nota interna)"
              : "¿Por qué esta referencia está mal? (opcional, queda en la nota interna)",
          )
        : null;
    startTransition(async () => {
      const res = await resolvePaymentConflict(orderId, keepThis, note ?? undefined);
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo resolver el conflicto.");
        return;
      }
      toast.success("Conflicto resuelto.");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => resolve(true)}
      >
        Esta orden es la correcta
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => resolve(false)}
      >
        Esta referencia está mal
      </Button>
    </div>
  );
}
