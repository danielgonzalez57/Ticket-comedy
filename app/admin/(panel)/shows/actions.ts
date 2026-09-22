"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSeats } from "@/lib/seats";
import { uploadPoster as uploadPosterFile } from "@/lib/storage";
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

async function uploadPoster(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  return uploadPosterFile(createAdminClient(), file);
}

type ShowFields = {
  name: string;
  description: string | null;
  venue: string;
  date: string;
  comedians: string[];
  base_price: number;
  tasa: number;
  status: ShowStatus;
};

function readShowFields(formData: FormData): ShowFields {
  const name = String(formData.get("name") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "").trim();
  const basePrice = Number(formData.get("base_price"));
  const tasa = Number(formData.get("tasa"));
  const status = String(formData.get("status") ?? "draft") as ShowStatus;

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
    status: ["draft", "published", "finished"].includes(status)
      ? status
      : "draft",
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
    const rows = Math.max(1, Math.min(26, Number(formData.get("grid_rows")) || 5));
    const cols = Math.max(1, Math.min(40, Number(formData.get("grid_cols")) || 10));

    const posterUrl = await uploadPoster(formData.get("poster") as File | null);

    const { data: show, error } = await admin
      .from("shows")
      .insert({
        ...fields,
        tasa_fecha: new Date().toISOString(),
        poster_url: posterUrl,
        grid_rows: rows,
        grid_cols: cols,
      })
      .select()
      .single();

    if (error || !show) {
      return {
        error: error ? translateShowError(error.message) : "No se pudo crear el show.",
      };
    }

    const seats = generateSeats(show.id, rows, cols, fields.base_price);
    const { error: seatErr } = await admin.from("seats").insert(seats);
    if (seatErr) {
      await admin.from("shows").delete().eq("id", show.id);
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
    const posterUrl = await uploadPoster(formData.get("poster") as File | null);

    // tasa_fecha only moves when the rate itself actually changes —
    // editing venue/description shouldn't touch it.
    const { data: existing } = await admin
      .from("shows")
      .select("tasa")
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

    const { error } = await admin
      .from("shows")
      .update({
        ...fields,
        ...(tasaChanged ? { tasa_fecha: new Date().toISOString() } : {}),
        ...(posterUrl ? { poster_url: posterUrl } : {}),
      })
      .eq("id", showId);

    if (error) return { error: translateShowError(error.message) };
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
  const { error } = await admin.from("shows").delete().eq("id", showId);
  if (error) throw new Error(error.message);
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
