// Day-of-show WhatsApp reminder, shared by the per-show bulk page and
// the button on each order.

import { formatClockTime } from "@/lib/format";
import { siteUrl } from "@/lib/constants";

// Doors open this long before the show starts.
const DOORS_BEFORE_MINUTES = 30;

// Message template; `{nombre}` is filled per recipient by fillReminder.
export function reminderTemplate(showDate: string): string {
  const start = new Date(showDate);
  const doors = new Date(start.getTime() - DOORS_BEFORE_MINUTES * 60_000);
  const site = siteUrl().replace(/^https?:\/\//, "").replace(/^www\./, "");

  return `¡Hola {nombre}! 🧡 Te recordamos que ¡HOY es el show de Pinto y Aparte!

🎫 Tus entradas: Revisa tu correo o entra en ${site} en la sección de Entradas para tenerlas a la mano.

⏰ Horarios de hoy:
Apertura de puertas: ${formatClockTime(doors)}
Inicio del show: ${formatClockTime(start)}

🍹 Trata de ser puntual para que disfrutes de tu bebida de cortesía al llegar.

¡Nos vemos esta noche! ✨`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export function fillReminder(template: string, name: string): string {
  return template
    .replaceAll("{nombre}", firstName(name))
    // "¡Hola !" when a name is missing.
    .replace("¡Hola !", "¡Hola!");
}
