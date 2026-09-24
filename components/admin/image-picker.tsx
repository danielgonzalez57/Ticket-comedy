"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Vercel rejects request bodies over 4.5 MB, and the show form can
// carry two images — so each one is shrunk in the browser before it's
// submitted. Also keeps the (free-tier) storage bucket small.
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

async function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
}

// Scales the image down to fit maxWidth×maxHeight and re-encodes it as
// WEBP (JPEG where the browser can't encode WEBP, e.g. older Safari).
async function compressImage(file: File, maxWidth: number, maxHeight: number) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let blob = await encode(canvas, "image/webp", 0.85);
  if (!blob || blob.type !== "image/webp") {
    blob = await encode(canvas, "image/jpeg", 0.85);
  }
  if (!blob) throw new Error("encode failed");
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const base = file.name.replace(/\.[^.]+$/, "") || "imagen";
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// File input with a live preview at the exact aspect ratio the image
// is displayed at, so the admin sees the crop before saving. Shows the
// currently saved image (currentUrl) until a new file is picked.
export function ImagePicker({
  name,
  label,
  hint,
  aspectClass,
  maxWidth,
  maxHeight,
  currentUrl,
}: {
  name: string;
  label: string;
  hint: string;
  // Tailwind aspect utility matching where the image is shown.
  aspectClass: string;
  // Largest size worth storing for where the image is shown.
  maxWidth: number;
  maxHeight: number;
  currentUrl?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    setError(null);
    if (!file) {
      clear();
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      clear();
      setError("Usa una imagen JPG, PNG o WEBP.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      clear();
      setError("La imagen es demasiado pesada (máx. 25 MB).");
      return;
    }

    setProcessing(true);
    try {
      const compressed = await compressImage(file, maxWidth, maxHeight);
      const final = compressed.size < file.size ? compressed : file;
      if (final.size > MAX_OUTPUT_BYTES) {
        clear();
        setError("No se pudo reducir la imagen lo suficiente. Prueba con otra.");
        return;
      }
      // Swap the picked file for the smaller one, so that's what the
      // form actually submits.
      const dt = new DataTransfer();
      dt.items.add(final);
      input.files = dt.files;
      setPreview(URL.createObjectURL(final));
      setFileInfo(`${file.name} · ${formatSize(final.size)}`);
    } catch {
      clear();
      setError("No se pudo leer la imagen. Prueba con otra.");
    } finally {
      setProcessing(false);
    }
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setFileInfo(null);
  }

  const shown = preview ?? currentUrl ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      <input
        ref={inputRef}
        id={name}
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onChange}
        className="sr-only"
      />

      <div
        className={cn(
          "group relative w-full overflow-hidden rounded-xl border bg-muted/40",
          shown ? "border-border" : "border-dashed border-input",
          aspectClass,
        )}
      >
        {shown ? (
          <>
            <Image
              src={shown}
              alt={`Vista previa: ${label}`}
              fill
              sizes="(max-width: 1024px) 100vw, 480px"
              unoptimized={Boolean(preview)}
              className="object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-linear-to-t from-black/70 to-transparent p-3 pt-8">
              <span className="truncate text-xs text-white/85">
                {fileInfo ?? "Imagen actual"}
              </span>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-white/25"
                >
                  <RefreshCw className="size-3" /> Cambiar
                </button>
                {preview && (
                  <button
                    type="button"
                    onClick={clear}
                    aria-label="Quitar imagen nueva"
                    className="inline-flex items-center rounded-md bg-white/15 p-1 text-white backdrop-blur transition-colors hover:bg-white/25"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <label
            htmlFor={name}
            className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 p-4 text-center transition-colors hover:bg-muted"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-background text-muted-foreground shadow-xs transition-colors group-hover:text-foreground">
              <ImagePlus className="size-5" />
            </span>
            <span className="text-sm font-medium">Subir imagen</span>
            <span className="text-xs text-muted-foreground">
              JPG, PNG o WEBP · se optimiza al subir
            </span>
          </label>
        )}

        {processing && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm backdrop-blur-sm">
            <Loader2 className="size-4 animate-spin" /> Optimizando…
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
