import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WhatsappReminder, type ReminderRecipient } from "@/components/admin/whatsapp-reminder";
import { formatClockTime, formatDate } from "@/lib/format";
import { siteUrl } from "@/lib/constants";
import { normalizeVePhone } from "@/lib/whatsapp";
import type { Order, Show } from "@/lib/database.types";

export const dynamic = "force-dynamic";

// Doors open this long before the show starts.
const DOORS_BEFORE_MINUTES = 30;

export default async function ReminderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: show }, { data: orderData }] = await Promise.all([
    supabase.from("shows").select("*").eq("id", id).single(),
    supabase
      .from("orders")
      .select("id, customer_name, customer_phone, seat_ids")
      .eq("show_id", id)
      .eq("status", "verified")
      .order("created_at", { ascending: true }),
  ]);

  if (!show) notFound();
  const typedShow = show as Show;
  const orders = (orderData ?? []) as Pick<
    Order,
    "id" | "customer_name" | "customer_phone" | "seat_ids"
  >[];

  // One message per phone number, even if that person bought in
  // several orders.
  const byPhone = new Map<string, ReminderRecipient>();
  for (const o of orders) {
    const phone = normalizeVePhone(o.customer_phone);
    const existing = byPhone.get(phone);
    if (existing) {
      existing.tickets += o.seat_ids.length;
    } else {
      byPhone.set(phone, {
        phone,
        rawPhone: o.customer_phone,
        name: o.customer_name.trim(),
        tickets: o.seat_ids.length,
        // 58 + 10-digit national number.
        valid: /^58\d{10}$/.test(phone),
      });
    }
  }
  const recipients = [...byPhone.values()];

  const start = new Date(typedShow.date);
  const doors = new Date(start.getTime() - DOORS_BEFORE_MINUTES * 60_000);
  const site = siteUrl().replace(/^https?:\/\//, "").replace(/^www\./, "");

  const defaultMessage = `¡Hola {nombre}! 🧡 Te recordamos que ¡HOY es el show de Pinto y Aparte!

🎫 Tus entradas: Revisa tu correo o entra en ${site} en la sección de Entradas para tenerlas a la mano.

⏰ Horarios de hoy:
Apertura de puertas: ${formatClockTime(doors)}
Inicio del show: ${formatClockTime(start)}

🍹 Trata de ser puntual para que disfrutes de tu bebida de cortesía al llegar.

¡Nos vemos esta noche! ✨`;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href={`/admin/shows/${typedShow.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {typedShow.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Recordatorio por WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {formatDate(typedShow.date)} · {recipients.length} persona(s) con
          entradas verificadas
        </p>
      </div>

      <WhatsappReminder
        showId={typedShow.id}
        defaultMessage={defaultMessage}
        recipients={recipients}
      />
    </div>
  );
}
