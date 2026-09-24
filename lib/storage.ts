import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Customers no longer upload payment receipts (the reference number is
// enough, and it keeps the free-tier storage clean). The bucket stays
// only so receipts uploaded before that can still be viewed by the
// admin — see getReceiptSignedUrl.
const RECEIPTS_BUCKET = "receipts";
const POSTERS_BUCKET = "posters";

// Recognized image types, matched by magic bytes — never by the
// client-supplied `file.type`/Content-Type or the filename extension,
// both of which are attacker-controlled and prove nothing about the
// actual file content. Deliberately no SVG — an SVG can carry an
// embedded <script>, which would execute for anyone whose browser
// opens this public, unauthenticated bucket URL directly.
const IMAGE_SIGNATURES: { mime: string; ext: string; matches: (b: Uint8Array) => boolean }[] = [
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
];

async function sniffImageType(file: File) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return IMAGE_SIGNATURES.find((sig) => sig.matches(head)) ?? null;
}

// Max size for a show image — generous for a phone photo, small
// enough to bound abuse.
const MAX_POSTER_BYTES = 10 * 1024 * 1024;

// Uploads a show image (card poster or detail banner) to the public
// `posters` bucket and returns its public URL. This bucket is public
// and unauthenticated, so anything stored under an image content-type
// is directly servable to anyone with the URL — hence the magic-byte
// check. `label` only shapes the error messages ("el cartel").
export async function uploadPoster(
  admin: SupabaseClient<Database>,
  file: File,
  label = "el cartel",
): Promise<string> {
  if (file.size > MAX_POSTER_BYTES) {
    throw new Error(
      `${capitalize(label)} no puede pesar más de ${MAX_POSTER_BYTES / (1024 * 1024)} MB.`,
    );
  }

  const type = await sniffImageType(file);
  if (!type) {
    throw new Error(`${capitalize(label)} debe ser una imagen (JPEG, PNG o WEBP).`);
  }

  const path = `${crypto.randomUUID()}.${type.ext}`;
  const { error } = await admin.storage
    .from(POSTERS_BUCKET)
    .upload(path, file, { contentType: type.mime, upsert: false });
  if (error) {
    throw new Error(`No se pudo subir ${label}: ${error.message}`);
  }
  const { data } = admin.storage.from(POSTERS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Removes an image previously returned by uploadPoster, so replacing a
// poster/banner doesn't leave the old file taking up storage. Best
// effort: a failure here only leaves an orphan file behind.
export async function deletePoster(
  admin: SupabaseClient<Database>,
  publicUrl: string | null | undefined,
): Promise<void> {
  if (!publicUrl) return;
  const marker = `/${POSTERS_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return;
  const path = decodeURIComponent(publicUrl.slice(idx + marker.length));
  const { error } = await admin.storage.from(POSTERS_BUCKET).remove([path]);
  if (error) console.error("[storage] failed to delete old poster:", error.message);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
