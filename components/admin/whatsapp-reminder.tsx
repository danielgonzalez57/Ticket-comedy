"use client";

import { useSyncExternalStore } from "react";
import { Check, MessageCircle, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { whatsappUrl } from "@/lib/whatsapp";
import { fillReminder, firstName } from "@/lib/reminder";

export type ReminderRecipient = {
  phone: string; // normalized, 58...
  rawPhone: string; // as the customer typed it
  name: string;
  tickets: number;
  valid: boolean;
};

// Progress lives in this browser only (localStorage): it's a
// convenience so the admin knows who's left, not a delivery record —
// wa.me can't tell us whether the message was actually sent.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Fallback when storage is blocked, so the page still works for the
// current visit.
const memory = new Map<string, string | null>();

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string | null) {
  memory.set(key, value);
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode / blocked storage: progress just won't persist.
  }
  listeners.forEach((l) => l());
}

// Raw string snapshot (stable between renders); null on the server so
// the first client render matches the server markup.
function useStored(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
}

function parseList(raw: string | null): string[] {
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function WhatsappReminder({
  showId,
  defaultMessage,
  recipients,
}: {
  showId: string;
  defaultMessage: string;
  recipients: ReminderRecipient[];
}) {
  const sentKey = `wa-reminder-sent:${showId}`;
  const msgKey = `wa-reminder-msg:${showId}`;

  const message = useStored(msgKey) ?? defaultMessage;
  const sent = parseList(useStored(sentKey));

  function updateMessage(value: string) {
    writeRaw(msgKey, value === defaultMessage ? null : value);
  }

  function markSent(phone: string) {
    if (sent.includes(phone)) return;
    writeRaw(sentKey, JSON.stringify([...sent, phone]));
  }

  function send(r: ReminderRecipient) {
    const text = fillReminder(message, r.name);
    window.open(whatsappUrl(r.phone, text), "_blank", "noopener");
    markSent(r.phone);
  }

  function reset() {
    if (!confirm("¿Marcar a todos como pendientes otra vez?")) return;
    writeRaw(sentKey, null);
  }

  const sendable = recipients.filter((r) => r.valid);
  const sentSet = new Set(sent);
  const doneCount = sendable.filter((r) => sentSet.has(r.phone)).length;
  const next = sendable.find((r) => !sentSet.has(r.phone));

  if (recipients.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Este show todavía no tiene órdenes verificadas.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="wa-message">Mensaje</Label>
          {message !== defaultMessage && (
            <button
              type="button"
              onClick={() => updateMessage(defaultMessage)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Restaurar original
            </button>
          )}
        </div>
        <Textarea
          id="wa-message"
          value={message}
          onChange={(e) => updateMessage(e.target.value)}
          rows={12}
        />
        <p className="text-xs text-muted-foreground">
          <code className="font-mono">{"{nombre}"}</code> se reemplaza por el
          primer nombre de cada persona.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
        <div>
          <p className="font-medium tabular-nums">
            {doneCount} / {sendable.length} enviados
          </p>
          <p className="text-xs text-muted-foreground">
            Cada clic abre WhatsApp con el mensaje listo; solo dale enviar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {doneCount > 0 && (
            <Button variant="outline" size="lg" onClick={reset}>
              <RotateCcw />
              Reiniciar
            </Button>
          )}
          <Button size="lg" onClick={() => next && send(next)} disabled={!next}>
            <Send />
            {next ? `Enviar a ${firstName(next.name)}` : "Todos enviados"}
          </Button>
        </div>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border">
        {recipients.map((r) => {
          const done = sentSet.has(r.phone);
          return (
            <div
              key={r.phone}
              className={cn(
                "flex items-center justify-between gap-3 p-4",
                done && "bg-secondary/30",
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {r.name}
                  {done && (
                    <Check className="ml-1.5 inline size-4 text-emerald-500" />
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.valid ? `+${r.phone}` : `${r.rawPhone} · número inválido`}{" "}
                  · {r.tickets} entrada(s)
                </p>
              </div>
              <Button
                size="sm"
                variant={done ? "ghost" : "outline"}
                onClick={() => send(r)}
                disabled={!r.valid}
                className="shrink-0"
              >
                <MessageCircle />
                {done ? "Reenviar" : "Enviar"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
