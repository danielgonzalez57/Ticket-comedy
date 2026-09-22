"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  setShowStatus,
  deleteShow,
} from "@/app/admin/(panel)/shows/actions";
import { Button } from "@/components/ui/button";
import type { ShowStatus } from "@/lib/database.types";

export function ShowActions({
  showId,
  status,
}: {
  showId: string;
  status: ShowStatus;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function changeStatus(next: ShowStatus) {
    startTransition(async () => {
      try {
        await setShowStatus(showId, next);
        toast.success("Estado actualizado.");
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "No se pudo actualizar el estado.",
        );
      }
    });
  }

  function remove() {
    if (!confirm("¿Eliminar este show y todos sus asientos? Esta acción no se puede deshacer.")) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteShow(showId);
      } catch {
        toast.error("No se pudo eliminar el show.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "published" && (
        <Button
          size="sm"
          onClick={() => changeStatus("published")}
          disabled={pending}
        >
          Publicar
        </Button>
      )}
      {status === "published" && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => changeStatus("draft")}
          disabled={pending}
        >
          Despublicar
        </Button>
      )}
      {status !== "finished" && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => changeStatus("finished")}
          disabled={pending}
        >
          Marcar finalizado
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={remove}
        disabled={pending}
      >
        Eliminar
      </Button>
    </div>
  );
}
