"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Camera,
} from "lucide-react";
import {
  validateTicket,
  type ValidateResult,
} from "@/app/admin/(panel)/validate/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Phase = "scanning" | "checking" | "result";

const READER_ID = "qr-reader";

export function QrScanner() {
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const lockRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("scanning");
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  async function stopCamera() {
    const s = scannerRef.current;
    if (!s) return;
    try {
      await s.stop();
      await s.clear();
    } catch {
      /* already stopped */
    }
  }

  async function startCamera() {
    setCamError(null);
    lockRef.current = false;
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode(READER_ID);
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => handleDecoded(decoded),
        () => {},
      );
    } catch {
      setCamError(
        "No se pudo acceder a la cámara. Usa el código manual abajo.",
      );
    }
  }

  async function handleDecoded(value: string) {
    if (lockRef.current) return;
    lockRef.current = true;
    setPhase("checking");
    await stopCamera();
    const res = await validateTicket(value);
    setResult(res);
    setPhase("result");
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manual.trim() || lockRef.current) return;
    lockRef.current = true;
    setPhase("checking");
    await stopCamera();
    const res = await validateTicket(manual.trim());
    setResult(res);
    setPhase("result");
  }

  async function scanAgain() {
    setResult(null);
    setManual("");
    setPhase("scanning");
    await startCamera();
  }

  useEffect(() => {
    startCamera();
    return () => {
      void stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className={cn(phase === "scanning" ? "block" : "hidden")}>
        <div
          id={READER_ID}
          className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border border-border bg-black"
        />
        {camError && (
          <p className="mt-2 text-sm text-destructive">{camError}</p>
        )}
        <form onSubmit={submitManual} className="mt-4 flex gap-2">
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="O ingresa el código corto (ej. BE746DC8) o el token"
          />
          <Button type="submit" variant="secondary">
            Validar
          </Button>
        </form>
      </div>

      {phase === "checking" && (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Camera className="size-5 animate-pulse" /> Verificando…
        </div>
      )}

      {phase === "result" && result && (
        <ResultCard result={result} onScanAgain={scanAgain} />
      )}
    </div>
  );
}

const CONFIG: Record<
  ValidateResult["status"],
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  valid: {
    label: "Entrada válida",
    className: "border-success/40 bg-success/10 text-success",
    icon: CheckCircle2,
  },
  used: {
    label: "Ya fue utilizada",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    icon: AlertTriangle,
  },
  not_paid: {
    label: "Pago pendiente — no válida",
    className: "border-primary/40 bg-primary/10 text-primary",
    icon: Clock,
  },
  cancelled: {
    label: "Orden cancelada — no válida",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: XCircle,
  },
  invalid: {
    label: "Entrada no encontrada",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: XCircle,
  },
};

function ResultCard({
  result,
  onScanAgain,
}: {
  result: ValidateResult;
  onScanAgain: () => void;
}) {
  const cfg = CONFIG[result.status];
  const Icon = cfg.icon;
  return (
    <div className="space-y-4">
      <div className={cn("rounded-xl border p-6 text-center", cfg.className)}>
        <Icon className="mx-auto size-12" />
        <p className="mt-3 text-lg font-semibold">{cfg.label}</p>
      </div>

      {(result.customerName || result.showName) && (
        <div className="space-y-1 rounded-xl border border-border bg-card p-4 text-sm">
          {result.showName && (
            <p className="font-medium">{result.showName}</p>
          )}
          {result.customerName && (
            <p className="text-muted-foreground">{result.customerName}</p>
          )}
          {result.seats && (
            <p className="text-muted-foreground">Asiento(s): {result.seats}</p>
          )}
          {result.code && (
            <p className="font-mono text-xs text-muted-foreground">
              #{result.code}
            </p>
          )}
        </div>
      )}

      <Button className="w-full" onClick={onScanAgain}>
        Escanear otra
      </Button>
    </div>
  );
}
