import "server-only";
import { Resend } from "resend";
import type { Order, Seat, Show } from "@/lib/database.types";
import { formatDate, formatDualMoney } from "@/lib/format";
import { orderCode } from "@/lib/whatsapp";
import { ticketUrl } from "@/lib/qr";
import { brandEmailLogoUrl, siteUrl } from "@/lib/constants";

type Args = {
  order: Order;
  show: Show;
  seats: Seat[];
  qrPng: Buffer;
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SF Mono',SFMono-Regular,Menlo,Consolas,monospace";

// Same palette as the app's dark theme (app/globals.css): azul is the
// dominant accent (CTA/links/eyebrows), naranja is a single sparing
// "spark" glyph inside azul copy — never the dominant colour.
const AZUL = "#3b82f6";
const NARANJA = "#f04000";
const CREAM = "#f5f2e9";

// Every one of these templates is built with raw string interpolation
// (not JSX, which would auto-escape) — order.customer_name and the
// admin's rejection `reason` are free text a customer/admin actually
// typed, so they have to be escaped before landing inside HTML here,
// or a name like `<img src=x onerror=...>` would execute as markup
// for anyone whose mail client renders it (most do).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Shared chrome for every email this app sends: dark canvas, wordmark,
// footer. `bodyHtml` is whatever goes between the wordmark and the
// footer — the ticket confirmation and the rejection notice only
// differ there.
//
// Explicit color-scheme meta tags so Gmail/Outlook/Apple Mail don't
// auto-invert this email under the recipient's own dark-mode setting
// — without them, some clients repaint a light canvas on top of a
// deliberately dark design (or vice versa), which is the same
// "light text vanishes against a now-light background" failure as
// the logo issue above, just applied to the whole email instead of
// one image.
function shell(bodyHtml: string): string {
  const logo = brandEmailLogoUrl();
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
</head>
<body style="margin:0;padding:0;background:#0b0b0c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0b0b0c" style="background:#0b0b0c;padding:36px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr>
          <td align="center" style="padding-bottom:20px;font-family:${FONT};">
            ${
              logo
                ? `<img src="${logo}" width="190" alt="Pinto &amp; Aparte" style="display:block;width:190px;height:auto;">`
                : `<span style="font-size:24px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${CREAM};">Pinto <span style="color:${NARANJA};">&amp;</span> Aparte</span>`
            }
          </td>
        </tr>
        ${bodyHtml}
        <tr>
          <td align="center" style="padding-top:32px;font-family:${FONT};">
            <p style="margin:0 0 6px;font-size:13px;color:#8a8a85;">
              ¿Perdiste este correo? Entra a
              <a href="${siteUrl()}/mis-entradas" style="color:${AZUL};text-decoration:none;">Mis entradas</a>
              con el mismo correo y ahí la recuperas.
            </p>
            <p style="margin:0;font-size:13px;color:#54534e;">Nos vemos en la puerta 🎤</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// Small key/value row inside the ticket stub.
function detailRow(label: string, value: string, mono = false): string {
  return `
  <tr>
    <td style="padding:6px 0;font-family:${FONT};font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#9a9484;">${label}</td>
    <td align="right" style="padding:6px 0;font-family:${mono ? MONO : FONT};font-size:14px;font-weight:600;color:#1a1712;">${value}</td>
  </tr>`;
}

const dashedDivider =
  '<tr><td style="padding:18px 0;"><div style="border-top:2px dashed #ddd4bd;"></div></td></tr>';

// Sends the confirmation email with the QR inline (cid). Returns false
// (without throwing) if Resend isn't configured or the send fails, so a
// confirmed payment is never blocked by email problems.
export async function sendTicketEmail({
  order,
  show,
  seats,
  qrPng,
}: Args): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set — skipping email.");
    return false;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM || "Pinto & Aparte <onboarding@resend.dev>";

  const body = `
        <tr>
          <td align="center" style="padding-bottom:26px;font-family:${FONT};">
            <p style="margin:0 0 8px;font-size:19px;line-height:1.4;font-weight:700;color:${CREAM};">
              ¡Sorpresa!!! No te estafamos.
            </p>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#b8b3a4;max-width:420px;">
              Ya que superamos juntos este ejercicio de confianza, estamos listos para verte el día del show.
              Vete con tu mejor pinta y disfruta de Pinto y Aparte.
            </p>
            <p style="margin:0;font-size:14px;line-height:1.55;font-style:italic;color:#b8b3a4;">
              Con amor: Ernesto, María Laura y Maluma baby
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#faf6ec;border-radius:18px;padding:28px 26px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0 0 4px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#1840a0;">
                    Pinto &amp; Aparte
                  </p>
                  <h1 style="margin:0 0 8px;font-family:${FONT};font-size:24px;line-height:1.2;font-weight:800;letter-spacing:-0.01em;color:#141210;">
                    ${escapeHtml(show.name)}
                  </h1>
                  <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.6;color:#6b6658;text-transform:capitalize;">
                    📅 ${formatDate(show.date)}
                  </p>
                  <p style="margin:2px 0 0;font-family:${FONT};font-size:14px;line-height:1.6;color:#6b6658;">
                    📍 ${escapeHtml(show.venue)}
                  </p>
                </td>
              </tr>
              ${dashedDivider}
              <tr>
                <td>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${detailRow("A nombre de", escapeHtml(order.customer_name))}
                    ${detailRow("Entradas", String(seats.length))}
                    ${detailRow("Total", formatDualMoney(order.total_usd, order.monto_bs))}
                    ${detailRow("Código", orderCode(order.id), true)}
                  </table>
                </td>
              </tr>
              ${dashedDivider}
              <tr>
                <td align="center">
                  <p style="margin:0 0 12px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#9a9484;">
                    Muestra este código en la entrada
                  </p>
                  <img src="cid:qrcode" alt="QR de tu entrada" width="200" height="200" style="display:block;background:#ffffff;border-radius:14px;padding:12px;border:1px solid #eee4cc;">
                  <a href="${ticketUrl(order.qr_token)}" style="display:inline-block;margin-top:18px;background:${NARANJA};color:#ffffff;font-family:${FONT};font-size:14px;font-weight:600;text-decoration:none;padding:11px 22px;border-radius:999px;">
                    Ver entrada en línea
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;

  try {
    const { error } = await resend.emails.send({
      from,
      to: order.customer_email,
      subject: `Tu entrada para ${show.name} está lista 🎟️`,
      html: shell(body),
      attachments: [
        {
          filename: "entrada.png",
          content: qrPng,
          contentId: "qrcode",
        },
      ],
    });
    if (error) {
      console.error("[email] Resend error:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send failed:", e);
    return false;
  }
}

// Sends the "Mis entradas" login code (see
// app/(public)/mis-entradas/actions.ts:sendLoginCode). The code
// itself comes from Supabase Auth's admin.generateLink(), which mints
// the token but never emails it — sending is entirely on us, so this
// gets the same branded template as everything else instead of
// Supabase's default auth email.
export async function sendLoginCodeEmail({
  email,
  code,
}: {
  email: string;
  code: string;
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set — skipping email.");
    return false;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM || "Pinto & Aparte <onboarding@resend.dev>";
  const spaced = code.length > 4 ? `${code.slice(0, 4)} ${code.slice(4)}` : code;

  const body = `
        <tr>
          <td align="center" style="padding-bottom:26px;font-family:${FONT};">
            <p style="margin:0 0 8px;font-size:19px;line-height:1.4;font-weight:700;color:${CREAM};">
              Tu código para entrar 👋
            </p>
            <p style="margin:0;font-size:15px;line-height:1.55;color:#b8b3a4;max-width:380px;">
              Cópialo y pégalo en la página para ver tus entradas. Es solo tuyo — no lo compartas.
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="background:#faf6ec;border-radius:18px;padding:30px 26px;">
            <p style="margin:0 0 10px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#9a9484;">
              Código de acceso
            </p>
            <p style="margin:0;font-family:${MONO};font-size:34px;font-weight:700;letter-spacing:0.08em;color:#141210;">
              ${spaced}
            </p>
            <p style="margin:14px 0 0;font-family:${FONT};font-size:12px;color:#9a9484;">
              Vence pronto — úsalo enseguida.
            </p>
          </td>
        </tr>`;

  try {
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: `${code} es tu código de acceso — Pinto & Aparte`,
      html: shell(body),
    });
    if (error) {
      console.error("[email] Resend error:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send failed:", e);
    return false;
  }
}

type RejectionArgs = {
  order: Order;
  show: Show | null;
  reason: string;
};

// Sends the rejection notice with the reason (Fase 2: today only
// confirmation was auto-notified). Same "never block the action on
// email failure" contract as sendTicketEmail — returns false instead
// of throwing.
export async function sendRejectionEmail({
  order,
  show,
  reason,
}: RejectionArgs): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set — skipping email.");
    return false;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM || "Pinto & Aparte <onboarding@resend.dev>";

  const body = `
        <tr>
          <td style="background:#faf6ec;border-radius:18px;padding:28px 26px;font-family:${FONT};">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${NARANJA};">
              No pudimos verificar tu pago
            </p>
            ${show ? `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;font-weight:800;color:#141210;">${escapeHtml(show.name)}</h1>` : ""}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${detailRow("Código", orderCode(order.id), true)}
            </table>
            ${dashedDivider}
            <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#4a4638;">
              <strong>Motivo:</strong> ${escapeHtml(reason)}
            </p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b6658;">
              Si crees que es un error, responde este correo o escríbenos por WhatsApp y lo
              revisamos contigo.
            </p>
          </td>
        </tr>`;

  try {
    const { error } = await resend.emails.send({
      from,
      to: order.customer_email,
      subject: "Tu orden no pudo verificarse",
      html: shell(body),
    });
    if (error) {
      console.error("[email] Resend error:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send failed:", e);
    return false;
  }
}
