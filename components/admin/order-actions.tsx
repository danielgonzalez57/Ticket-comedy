"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Coins, MessageCircle, Mail } from "lucide-react";
import {
  confirmPayment,
  rejectPayment,
  reassignOrderSeats,
  cancelOrder,
  checkBinancePayment,
  saveAdminNote,
} from "@/app/admin/(panel)/orders/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { OrderStatus } from "@/lib/database.types";

const ACTIONABLE: OrderStatus[] = ["pending", "reported"];

export function OrderActions({
  orderId,
  status,
  note,
  awaitingReport = false,
  canCheckBinance = false,
}: {
  orderId: string;
  status: OrderStatus;
  note: string | null;
  // Pending order whose method needs a reported reference first —
  // confirming it would only fail (MUST_REPORT_FIRST), so don't offer it.
  awaitingReport?: boolean;
  // Reported Binance order — offer the Pay-history lookup.
  canCheckBinance?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [seatsLost, setSeatsLost] = useState(false);
  const [reassignSeats, setReassignSeats] = useState("");

  const actionable = ACTIONABLE.includes(status);

  function checkBinance() {
    startTransition(async () => {
      const res = await checkBinancePayment(orderId);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message, { duration: 8000 });
      router.refresh();
    });
  }

  function confirm() {
    startTransition(async () => {
      const res = await confirmPayment(orderId);
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo confirmar.");
        setSeatsLost(Boolean(res.seatsLost));
        return;
      }
      setSeatsLost(false);
      setWhatsapp(res.whatsappUrl ?? null);
      setEmailSent(res.emailSent ?? false);
      toast.success(
        res.emailSent ? "Pago confirmado y correo enviado." : "Pago confirmado.",
      );
      router.refresh();
    });
  }

  function reject() {
    const reason =
      typeof window !== "undefined"
        ? window.prompt("Motivo del rechazo (obligatorio, se lo compartimos al cliente):")
        : null;
    if (!reason || !reason.trim()) return;
    startTransition(async () => {
      const res = await rejectPayment(orderId, reason.trim());
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo rechazar.");
        return;
      }
      setSeatsLost(false);
      setWhatsapp(res.whatsappUrl ?? null);
      setEmailSent(res.emailSent ?? false);
      toast.success(
        res.emailSent ? "Orden rechazada y correo enviado." : "Orden rechazada.",
      );
      router.refresh();
    });
  }

  function reassign() {
    if (!reassignSeats.trim()) return;
    startTransition(async () => {
      const res = await reassignOrderSeats(orderId, reassignSeats);
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo reasignar.");
        return;
      }
      setSeatsLost(false);
      setReassignSeats("");
      toast.success("Asientos reasignados. Ya puedes confirmar el pago.");
      router.refresh();
    });
  }

  function cancel() {
    if (!confirm_("¿Cancelar esta orden? Se liberarán los asientos en reserva."))
      return;
    startTransition(async () => {
      const res = await cancelOrder(orderId);
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo cancelar.");
        return;
      }
      toast.success("Orden cancelada.");
      router.refresh();
    });
  }

  function saveNote(formData: FormData) {
    const value = String(formData.get("admin_note") ?? "");
    startTransition(async () => {
      await saveAdminNote(orderId, value);
      toast.success("Nota guardada.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {actionable && (
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          {canCheckBinance && status === "reported" && (
            <Button variant="secondary" onClick={checkBinance} disabled={pending}>
              <Coins className="size-4" />
              Verificar con Binance
            </Button>
          )}
          <Button onClick={confirm} disabled={pending || awaitingReport}>
            <CheckCircle2 className="size-4" />
            Confirmar pago
          </Button>
          <Button
            variant="destructive"
            onClick={reject}
            disabled={pending}
          >
            Rechazar
          </Button>
          <Button
            variant="ghost"
            onClick={cancel}
            disabled={pending}
            className="text-destructive hover:text-destructive"
          >
            Cancelar orden
          </Button>
        </div>
      )}

      {actionable && awaitingReport && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          El cliente todavía no reportó la referencia de su pago. Podrás
          confirmarla cuando la reporte, o cancelarla si no va a pagar.
        </p>
      )}

      {seatsLost && (
        <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <Label htmlFor="reassign_seats" className="text-xs">
            Reasignar a otro(s) asiento(s) del mismo show (ej: A1, A2)
          </Label>
          <div className="flex gap-2">
            <Input
              id="reassign_seats"
              value={reassignSeats}
              onChange={(e) => setReassignSeats(e.target.value)}
              placeholder="A1, A2"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending || !reassignSeats.trim()}
              onClick={reassign}
            >
              Reasignar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Solo acepta asientos del mismo precio o más baratos que los
            originales. Si no hay reemplazo posible, rechaza la orden arriba.
          </p>
        </div>
      )}

      {status === "verified" && !whatsapp && (
        <Button variant="secondary" onClick={confirm} disabled={pending}>
          <Mail className="size-4" />
          Reenviar correo / generar WhatsApp
        </Button>
      )}

      {emailSent === false && (
        <p className="text-xs text-muted-foreground">
          El correo no se envió (revisa RESEND_API_KEY). Puedes avisar por WhatsApp.
        </p>
      )}

      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-success px-4 py-2 text-sm font-medium text-success-foreground"
        >
          <MessageCircle className="size-4" />
          Enviar mensaje por WhatsApp
        </a>
      )}

      <form action={saveNote} className="space-y-2 pt-2">
        <Label htmlFor="admin_note">Nota interna</Label>
        <Textarea
          id="admin_note"
          name="admin_note"
          rows={2}
          defaultValue={note ?? ""}
          placeholder="Notas para el equipo (no visible al cliente)"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          Guardar nota
        </Button>
      </form>
    </div>
  );
}

// Local alias so the inner name doesn't shadow the `confirm` handler above.
function confirm_(message: string): boolean {
  return typeof window !== "undefined" ? window.confirm(message) : true;
}
