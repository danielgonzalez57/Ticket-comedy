"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  CameraOff,
  Flashlight,
  FlashlightOff,
  Keyboard,
  Loader2,
  ScanLine,
} from "lucide-react";
import {
  validateTicket,
  type ValidateResult,
} from "@/app/admin/(panel)/validate/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Phase = "starting" | "scanning" | "checking" | "result" | "error";
type Html5Qrcode = import("html5-qrcode").Html5Qrcode;

const READER_ID = "qr-reader";

// html5-qrcode's Html5QrcodeScannerState values (not imported eagerly so
// the library stays out of the initial bundle).
const STATE_SCANNING = 2;
const STATE_PAUSED = 3;

// Short buzz on phones that support it — feedback without looking.
function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

// Camera stays on for the whole visit to this page: between scans it's
// only paused, so "Escanear otra" resumes instantly instead of
// re-negotiating the camera. Speed comes from decoding QR only (the
// library tries every barcode format by default) and from the native
// BarcodeDetector on phones that have one (Android Chrome).
export function QrScanner() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // Guards against double decodes and overlapping start/stop calls.
  const busyRef = useRef(false);
  const unmountedRef = useRef(false);
  // Camera start/stop calls run one after another — overlapping them
  // (StrictMode's double mount, a quick "Reintentar") makes
  // html5-qrcode throw "already scanning" / "not started".
  const cameraOpRef = useRef<Promise<void>>(Promise.resolve());
  function queueCameraOp(op: () => Promise<void>) {
    cameraOpRef.current = cameraOpRef.current.then(op, op);
    return cameraOpRef.current;
  }
  const [phase, setPhase] = useState<Phase>("starting");
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [manual, setManual] = useState("");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOnState] = useState(false);
  // Mirrored in a ref: the decode callback is registered once at camera
  // start, so it would otherwise see a stale torchOn.
  const torchOnRef = useRef(false);
  function setTorchOn(on: boolean) {
    torchOnRef.current = on;
    setTorchOnState(on);
  }

  function startCamera() {
    setPhase("starting");
    return queueCameraOp(startCameraNow);
  }

  function stopCamera() {
    return queueCameraOp(stopCameraNow);
  }

  async function startCameraNow() {
    if (unmountedRef.current) return;
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      if (unmountedRef.current) return;
      const scanner =
        scannerRef.current ??
        new Html5Qrcode(READER_ID, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          useBarCodeDetectorIfSupported: true,
        });
      scannerRef.current = scanner;

      const state = scanner.getState();
      if (state === STATE_PAUSED) {
        scanner.resume();
      } else if (state !== STATE_SCANNING) {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 15, aspectRatio: 1, disableFlip: true },
          (decoded) => void check(decoded),
          () => {},
        );
      }
      if (unmountedRef.current) {
        await stopCameraNow();
        return;
      }
      busyRef.current = false;
      setPhase("scanning");
      try {
        setTorchSupported(
          scanner.getRunningTrackCameraCapabilities().torchFeature().isSupported(),
        );
      } catch {
        setTorchSupported(false);
      }
    } catch {
      if (!unmountedRef.current) setPhase("error");
    }
  }

  async function stopCameraNow() {
    const s = scannerRef.current;
    if (!s) return;
    try {
      const state = s.getState();
      if (state === STATE_SCANNING || state === STATE_PAUSED) await s.stop();
      s.clear();
    } catch {
      /* already stopped */
    }
  }

  function pauseCamera() {
    const s = scannerRef.current;
    if (torchOnRef.current) {
      setTorchOn(false);
      try {
        s?.getRunningTrackCameraCapabilities().torchFeature().apply(false).catch(() => {});
      } catch {
        /* camera already gone */
      }
    }
    try {
      if (s?.getState() === STATE_SCANNING) s.pause(true);
    } catch {
      /* not running */
    }
  }

  async function toggleTorch() {
    const s = scannerRef.current;
    if (!s) return;
    const next = !torchOnRef.current;
    try {
      await s.getRunningTrackCameraCapabilities().torchFeature().apply(next);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  async function check(raw: string) {
    const value = raw.trim();
    if (busyRef.current || !value) return;
    busyRef.current = true;
    pauseCamera();
    vibrate(40);
    setPhase("checking");
    let res: ValidateResult;
    try {
      res = await validateTicket(value);
    } catch {
      res = { status: "invalid" };
    }
    if (unmountedRef.current) return;
    vibrate(res.status === "valid" ? 80 : [120, 80, 120]);
    setResult(res);
    setPhase("result");
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    void check(manual);
  }

  function scanAgain() {
    busyRef.current = false;
    setResult(null);
    setManual("");
    void startCamera();
  }

  useEffect(() => {
    unmountedRef.current = false;
    void startCamera();
    return () => {
      unmountedRef.current = true;
      void stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showingResult = phase === "result" && result !== null;

  return (
    <div className="mx-auto max-w-md">
      {showingResult && <ResultCard result={result} onScanAgain={scanAgain} />}

      {/* Kept mounted while a result shows (only hidden): the scanner is
          bound to READER_ID and resumes in place. */}
      <div className={cn("space-y-5", showingResult && "hidden")}>
        <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-black shadow-2xl ring-1 ring-foreground/10">
          {/* html5-qrcode forces position:relative inline on READER_ID,
              hence the absolute wrapper. Its own shading/pause overlays
              are hidden; the viewfinder below replaces them. */}
          <div className="absolute inset-0">
            <div
              id={READER_ID}
              className="h-full w-full [&_video]:h-full! [&_video]:w-full! [&_video]:object-cover [&>div]:hidden!"
            />
          </div>

          {phase !== "error" && (
            <div className="pointer-events-none absolute inset-0">
              {/* Dimmed surround with a clear rounded window. */}
              <div className="absolute inset-[12%] rounded-[1.75rem] shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
              <div className="absolute inset-[12%]">
                {[
                  "top-0 left-0 border-t-4 border-l-4 rounded-tl-[1.75rem]",
                  "top-0 right-0 border-t-4 border-r-4 rounded-tr-[1.75rem]",
                  "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[1.75rem]",
                  "bottom-0 right-0 border-b-4 border-r-4 rounded-br-[1.75rem]",
                ].map((c) => (
                  <span
                    key={c}
                    className={cn(
                      "absolute size-12 border-white transition-colors duration-200",
                      phase === "checking" && "border-primary",
                      c,
                    )}
                  />
                ))}
                {phase === "scanning" && (
                  <span className="tc-scanline absolute inset-x-4 h-0.5 rounded-full bg-linear-to-r from-transparent via-primary to-transparent shadow-[0_0_12px_2px_rgba(59,130,246,0.7)]" />
                )}
              </div>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-4 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-md">
              {phase === "starting" && (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Abriendo cámara…
                </>
              )}
              {phase === "scanning" && (
                <>
                  <ScanLine className="size-3.5" /> Apunta al código QR
                </>
              )}
              {phase === "checking" && (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Verificando…
                </>
              )}
              {phase === "error" && (
                <>
                  <CameraOff className="size-3.5" /> Cámara no disponible
                </>
              )}
            </span>
          </div>

          {torchSupported && phase === "scanning" && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label={torchOn ? "Apagar linterna" : "Encender linterna"}
              aria-pressed={torchOn}
              className={cn(
                "absolute top-4 right-4 flex size-11 items-center justify-center rounded-full backdrop-blur-md transition-colors",
                torchOn ? "bg-white text-black" : "bg-black/50 text-white hover:bg-black/70",
              )}
            >
              {torchOn ? <Flashlight className="size-5" /> : <FlashlightOff className="size-5" />}
            </button>
          )}

          {phase === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center text-white">
              <CameraOff className="size-10 text-white/60" />
              <p className="text-sm text-white/80">
                No se pudo abrir la cámara. Revisa el permiso del navegador o
                escribe el código abajo.
              </p>
              <Button size="sm" variant="secondary" onClick={() => void startCamera()}>
                Reintentar
              </Button>
            </div>
          )}
        </div>

        <form onSubmit={submitManual} className="space-y-2">
          <label
            htmlFor="manual-code"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
          >
            <Keyboard className="size-3.5" /> ¿No lee el QR? Escribe el código de la orden
          </label>
          <div className="flex gap-2">
            <Input
              id="manual-code"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ej. BE746DC8"
              autoCapitalize="characters"
              autoComplete="off"
              className="h-10 font-mono"
            />
            <Button
              type="submit"
              className="h-10"
              disabled={!manual.trim() || phase === "checking"}
            >
              Validar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const CONFIG: Record<
  ValidateResult["status"],
  { label: string; hint: string; className: string; icon: typeof CheckCircle2 }
> = {
  valid: {
    label: "Entrada válida",
    hint: "Puede pasar",
    className: "bg-success text-success-foreground",
    icon: CheckCircle2,
  },
  used: {
    label: "Ya fue utilizada",
    hint: "Esta entrada ya se escaneó antes",
    className: "bg-amber-500 text-black",
    icon: AlertTriangle,
  },
  not_paid: {
    label: "Pago pendiente",
    hint: "El pago no está confirmado — no puede pasar",
    className: "bg-primary text-primary-foreground",
    icon: Clock,
  },
  cancelled: {
    label: "Orden cancelada",
    hint: "No puede pasar",
    className: "bg-destructive text-white",
    icon: XCircle,
  },
  invalid: {
    label: "Entrada no encontrada",
    hint: "El código no corresponde a ninguna entrada",
    className: "bg-destructive text-white",
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
  const hasDetails = result.customerName || result.showName;

  return (
    <div className="tc-rise space-y-4">
      <div className={cn("rounded-3xl p-8 text-center shadow-xl", cfg.className)}>
        <Icon className="mx-auto size-16" strokeWidth={2.25} />
        <p className="mt-4 font-heading text-2xl font-bold">{cfg.label}</p>
        <p className="mt-1 text-sm opacity-85">{cfg.hint}</p>
      </div>

      {hasDetails && (
        <dl className="divide-y divide-border rounded-2xl border border-border bg-card text-sm">
          {result.customerName && (
            <div className="flex justify-between gap-4 p-4">
              <dt className="text-muted-foreground">Cliente</dt>
              <dd className="text-right font-medium">{result.customerName}</dd>
            </div>
          )}
          {result.showName && (
            <div className="flex justify-between gap-4 p-4">
              <dt className="text-muted-foreground">Show</dt>
              <dd className="text-right">{result.showName}</dd>
            </div>
          )}
          {result.seats && (
            <div className="flex justify-between gap-4 p-4">
              <dt className="text-muted-foreground">Asiento(s)</dt>
              <dd className="text-right font-semibold">{result.seats}</dd>
            </div>
          )}
          {result.code && (
            <div className="flex justify-between gap-4 p-4">
              <dt className="text-muted-foreground">Orden</dt>
              <dd className="font-mono">#{result.code}</dd>
            </div>
          )}
        </dl>
      )}

      <Button size="lg" className="h-12 w-full text-base" onClick={onScanAgain} autoFocus>
        <ScanLine className="size-5" /> Escanear otra
      </Button>
    </div>
  );
}
