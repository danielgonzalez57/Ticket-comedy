"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_CAPACITY,
  MIN_CAPACITY,
  generateSeats,
  gridForCapacity,
} from "@/lib/seats";
import { deletePoster, uploadPoster } from "@/lib/storage";
import { parseDecimal } from "@/lib/format";
import type { SeatStatus, ShowStatus } from "@/lib/database.types";

function parseComedians(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((c) => c.trim())
    .filter(Boolean);
}

// Translates the shows_no_placeholder_tasa_when_published CHECK
// violation (see supabase/migrations/0004_currency_model.sql) into a
// message an admin can act on — never let the raw Postgres text
// reach the panel.
function translateShowError(message: string): string {
  if (message.includes("shows_no_placeholder_tasa_when_published")) {
    return "No se puede publicar: la tasa sigue en el valor placeholder. Corrígela primero.";
  }
  return message;
}

// Uploads the card poster ("poster") and detail banner ("banner")
// picked in the show form; either is null when no new file was chosen.
// Both uploads settle before returning, so a failure in one can clean
// up the other instead of leaving an orphan file in storage.
async function uploadShowImages(
  formData: FormData,
): Promise<{ posterUrl: string | null; bannerUrl: string | null }> {
  const admin = createAdminClient();
  const pick = (key: string) => {
    const f = formData.get(key);
    return f instanceof File && f.size > 0 ? f : null;
  };
  const poster = pick("poster");
  const banner = pick("banner");
  const [posterRes, bannerRes] = await Promise.allSettled([
    poster ? uploadPoster(admin, poster, "el cartel") : null,
    banner ? uploadPoster(admin, banner, "el banner") : null,
  ]);
  if (posterRes.status === "rejected" || bannerRes.status === "rejected") {
    await Promise.all([
      posterRes.status === "fulfilled" && deletePoster(admin, posterRes.value),
      bannerRes.status === "fulfilled" && deletePoster(admin, bannerRes.value),
    ]);
    const failed = posterRes.status === "rejected" ? posterRes : bannerRes;
    throw (failed as PromiseRejectedResult).reason;
  }
  return { posterUrl: posterRes.value, bannerUrl: bannerRes.value };
}

type ShowFields = {
  name: string;
  description: string | null;
  venue: string;
  date: string;
  comedians: string[];
  base_price: number;
  tasa: number;
};

function readShowFields(formData: FormData): ShowFields {
  const name = String(formData.get("name") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "").trim();
  const basePrice = Number(formData.get("base_price"));
  // Admins type the rate with a decimal comma ("840,67"); rounded to
  // the 4 decimals shows.tasa stores so the "tasa changed" check below
  // compares like with like.
  const tasa =
    Math.round(parseDecimal(String(formData.get("tasa") ?? "")) * 10_000) /
    10_000;

  if (!name) throw new Error("El nombre es obligatorio.");
  if (!venue) throw new Error("El venue es obligatorio.");
  if (!dateRaw) throw new Error("La fecha es obligatoria.");
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new Error("El precio base no es válido.");
  }
  if (!Number.isFinite(tasa) || tasa <= 0) {
    throw new Error("La tasa (Bs por USD) no es válida.");
  }

  return {
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    venue,
    date: new Date(dateRaw).toISOString(),
    comedians: parseComedians(String(formData.get("comedians") ?? "")),
    base_price: basePrice,
    tasa,
  };
}

export type ShowFormState = {
  error: string | null;
  // Set when the admin changed tasa on a show that has orders still
  // open (not expired/cancelled) — those orders already snapshot
  // their own tasa (see migrations/0004_currency_model.sql), so this
  // doesn't retroactively change what anyone owes; it's an awareness
  // check so the admin isn't surprised that a batch of customers are
  // still transferring against the old rate. The form re-submits with
  // confirm_tasa_change=true to proceed.
  tasaWarning?: { openOrders: number } | null;
};

export async function createShow(
  _prev: ShowFormState,
  formData: FormData,
): Promise<ShowFormState> {
  await requireUser();
  const admin = createAdminClient();

  let newId: string;
  try {
    const fields = readShowFields(formData);
    const capacity = Number(formData.get("capacity"));
    if (
      !Number.isInteger(capacity) ||
      capacity < MIN_CAPACITY ||
      capacity > MAX_CAPACITY
    ) {
      throw new Error(
        `La cantidad de asientos debe ser un número entero entre ${MIN_CAPACITY} y ${MAX_CAPACITY}.`,
      );
    }
    const { rows, cols } = gridForCapacity(capacity);
    // Mirrors shows_no_placeholder_tasa_when_published — a new show is
    // published straight away, so fail here with a readable message.
    if (fields.tasa <= 1) {
      throw new Error("La tasa debe ser mayor a 1 Bs por USD para publicar el show.");
    }

    const { posterUrl, bannerUrl } = await uploadShowImages(formData);
    const discardImages = () =>
      Promise.all([
        deletePoster(admin, posterUrl),
        deletePoster(admin, bannerUrl),
      ]);

    const { data: show, error } = await admin
      .from("shows")
      .insert({
        ...fields,
        // Creating a show publishes it; unpublishing/finishing is done
        // afterwards from ShowActions on the detail page.
        status: "published",
        tasa_fecha: new Date().toISOString(),
        poster_url: posterUrl,
        banner_url: bannerUrl,
        grid_rows: rows,
        grid_cols: cols,
      })
      .select()
      .single();

    if (error || !show) {
      await discardImages();
      return {
        error: error ? translateShowError(error.message) : "No se pudo crear el show.",
      };
    }

    const seats = generateSeats(show.id, capacity, fields.base_price);
    const { error: seatErr } = await admin.from("seats").insert(seats);
    if (seatErr) {
      await admin.from("shows").delete().eq("id", show.id);
      await discardImages();
      return { error: `No se pudieron generar los asientos: ${seatErr.message}` };
    }
    newId = show.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado." };
  }

  revalidatePath("/admin/shows");
  redirect(`/admin/shows/${newId}`);
}

export async function updateShow(
  showId: string,
  _prev: ShowFormState,
  formData: FormData,
): Promise<ShowFormState> {
  await requireUser();
  const admin = createAdminClient();

  try {
    const fields = readShowFields(formData);

    // tasa_fecha only moves when the rate itself actually changes —
    // editing venue/description shouldn't touch it.
    const { data: existing } = await admin
      .from("shows")
      .select("tasa, poster_url, banner_url")
      .eq("id", showId)
      .single();
    const tasaChanged = existing && Number(existing.tasa) !== fields.tasa;

    const confirmed = formData.get("confirm_tasa_change") === "true";
    if (tasaChanged && !confirmed) {
      const { count } = await admin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("show_id", showId)
        .not("status", "in", "(expired,cancelled)");
      if (count && count > 0) {
        return { error: null, tasaWarning: { openOrders: count } };
      }
    }

    // Uploaded only after the tasa confirmation round-trip above, so
    // that round-trip doesn't upload the same images twice.
    const { posterUrl, bannerUrl } = await uploadShowImages(formData);

    const { error } = await admin
      .from("shows")
      .update({
        ...fields,
        ...(tasaChanged ? { tasa_fecha: new Date().toISOString() } : {}),
        ...(posterUrl ? { poster_url: posterUrl } : {}),
        ...(bannerUrl ? { banner_url: bannerUrl } : {}),
      })
      .eq("id", showId);

    if (error) {
      await Promise.all([
        deletePoster(admin, posterUrl),
        deletePoster(admin, bannerUrl),
      ]);
      return { error: translateShowError(error.message) };
    }

    // The replaced images are no longer referenced — free the space.
    await Promise.all([
      posterUrl && deletePoster(admin, existing?.poster_url),
      bannerUrl && deletePoster(admin, existing?.banner_url),
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado." };
  }

  revalidatePath("/admin/shows");
  revalidatePath(`/admin/shows/${showId}`);
  redirect(`/admin/shows/${showId}`);
}

export async function setShowStatus(showId: string, status: ShowStatus) {
  await requireUser();
  const admin = createAdminClient();
  const { error } = await admin
    .from("shows")
    .update({ status })
    .eq("id", showId);
  if (error) throw new Error(translateShowError(error.message));
  revalidatePath("/admin/shows");
  revalidatePath(`/admin/shows/${showId}`);
}

export async function deleteShow(showId: string) {
  await requireUser();
  const admin = createAdminClient();
  const { data: show } = await admin
    .from("shows")
    .select("poster_url, banner_url")
    .eq("id", showId)
    .maybeSingle();
  const { error } = await admin.from("shows").delete().eq("id", showId);
  if (error) throw new Error(error.message);
  await Promise.all([
    deletePoster(admin, show?.poster_url),
    deletePoster(admin, show?.banner_url),
  ]);
  revalidatePath("/admin/shows");
  redirect("/admin/shows");
}

// Toggle a single seat between available/disabled from the editor grid.
export async function setSeatStatus(seatId: string, status: SeatStatus) {
  await requireUser();
  const admin = createAdminClient();
  const { data: seat, error } = await admin
    .from("seats")
    .update({ status })
    .eq("id", seatId)
    .select("show_id")
    .single();
  if (error) throw new Error(error.message);
  if (seat) revalidatePath(`/admin/shows/${seat.show_id}`);
}
