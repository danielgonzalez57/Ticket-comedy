import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const RECEIPTS_BUCKET = "receipts";
const POSTERS_BUCKET = "posters";

// Generous for a screenshot/photo of a receipt, small enough to bound
// abuse (see Fase 2 correction: reportPayment's rate limit alone
// isn't a size/volume cap).
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

// Hard ceiling on receipts per order, independent of the time-window
// rate limit — otherwise a customer (or a script) could still
// accumulate an unbounded number of uploads over many separate
// 10-minute windows.
const MAX_RECEIPTS_PER_ORDER = 5;

// Recognized receipt types, matched by magic bytes — never by the
// client-supplied `file.type`/Content-Type or the filename extension,
// both of which are attacker-controlled and prove nothing about the
// actual file content.
const SIGNATURES: { mime: string; ext: string; matches: (b: Uint8Array) => boolean }[] = [
  {
    mime: "image/jpeg",
    ext: "jpg",
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/png",
    ext: "png",
    matches: (b) =>
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: "image/webp",
    ext: "webp",
    matches: (b) =>
      // "RIFF"....."WEBP"
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    mime: "application/pdf",
    ext: "pdf",
    // "%PDF-"
    matches: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d,
  },
];

async function sniffType(
  file: File,
  allowed: typeof SIGNATURES,
): Promise<{ mime: string; ext: string } | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return allowed.find((sig) => sig.matches(head)) ?? null;
}

// Receipts additionally accept PDF; posters are image-only (no PDF,
// and deliberately no SVG — an SVG can carry an embedded <script>,
// which would execute for anyone whose browser opens this public,
// unauthenticated bucket URL directly).
const IMAGE_SIGNATURES = SIGNATURES.filter((s) => s.mime.startsWith("image/"));

// Uploads a payment receipt to the private `receipts` bucket (see
// supabase/migrations/0005_order_lifecycle.sql) and returns the
// object PATH, not a URL — the bucket has no public/anon access, so
// a URL wouldn't resolve anyway. Viewing a receipt means generating
// a short-lived signed URL from this path at display time (Fase 3).
export async function uploadReceipt(
  admin: SupabaseClient<Database>,
  orderId: string,
  file: File,
): Promise<string> {
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new Error(
      `El comprobante no puede pesar más de ${MAX_RECEIPT_BYTES / (1024 * 1024)} MB.`,
    );
  }

  const type = await sniffType(file, SIGNATURES);
  if (!type) {
    throw new Error("El comprobante debe ser una imagen (JPEG, PNG, WEBP) o un PDF.");
  }

  const { data: existing, error: listError } = await admin.storage
    .from(RECEIPTS_BUCKET)
    .list(orderId);
  if (listError) {
    throw new Error(`No se pudo verificar los comprobantes existentes: ${listError.message}`);
  }
  if ((existing?.length ?? 0) >= MAX_RECEIPTS_PER_ORDER) {
    throw new Error(
      "Ya se alcanzó el máximo de comprobantes para esta orden. Contacta al admin.",
    );
  }

  const path = `${orderId}/${crypto.randomUUID()}.${type.ext}`;
  const { error } = await admin.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, file, { contentType: type.mime, upsert: false });
  if (error) {
    throw new Error(`No se pudo subir el comprobante: ${error.message}`);
  }
  return path;
}

// Max size for a show poster — generous for a phone photo, small
// enough to bound abuse.
const MAX_POSTER_BYTES = 10 * 1024 * 1024;

// Uploads a show poster to the public `posters` bucket and returns
// its public URL. Same magic-byte sniffing as uploadReceipt — never
// trust the client-supplied File.type or filename extension for
// either the validation or the stored Content-Type. This matters more
// here than for receipts: this bucket is public and unauthenticated,
// so anything actually stored under an image content-type is directly
// servable to anyone with the URL.
export async function uploadPoster(
  admin: SupabaseClient<Database>,
  file: File,
): Promise<string> {
  if (file.size > MAX_POSTER_BYTES) {
    throw new Error(
      `El cartel no puede pesar más de ${MAX_POSTER_BYTES / (1024 * 1024)} MB.`,
    );
  }

  const type = await sniffType(file, IMAGE_SIGNATURES);
  if (!type) {
    throw new Error("El cartel debe ser una imagen (JPEG, PNG o WEBP).");
  }

  const path = `${crypto.randomUUID()}.${type.ext}`;
  const { error } = await admin.storage
    .from(POSTERS_BUCKET)
    .upload(path, file, { contentType: type.mime, upsert: false });
  if (error) {
    throw new Error(`No se pudo subir el cartel: ${error.message}`);
  }
  const { data } = admin.storage.from(POSTERS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Short-lived signed URL for the admin panel to view a receipt
// (Fase 3). Never store this — it expires — always generate it fresh
// from receipt_path at display time.
export async function getReceiptSignedUrl(
  admin: SupabaseClient<Database>,
  path: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) {
    console.error("[storage] failed to sign receipt URL:", error.message);
    return null;
  }
  return data.signedUrl;
}
