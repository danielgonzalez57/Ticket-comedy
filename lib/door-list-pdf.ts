import "server-only";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { PAYMENT_METHOD_LABELS, SHOW_TIMEZONE } from "@/lib/constants";
import { formatBs, formatDate, formatMoney } from "@/lib/format";
import { orderCode } from "@/lib/whatsapp";
import type { Order, Show } from "@/lib/database.types";

// Printable door list ("lista de acceso"): every order of the selected
// show(s) with who bought, how many tickets, what they paid and the
// order code, so the door has a paper/PDF backup if QR scanning fails
// or there's no signal. Built with pdf-lib's standard fonts — no font
// files to ship — which means text must stay within WinAnsi (see clean()).

export type DoorListRow = { order: Order; seatLabels: string[] };
export type DoorListGroup = { show: Show | null; rows: DoorListRow[] };

export type DoorListInput = {
  title: string;
  subtitle: string;
  statusLabel: string;
  groups: DoorListGroup[];
  logoPng: Uint8Array | null;
  generatedAt: Date;
};

// A4 landscape — the table needs the width.
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const M = 32;
const CONTENT_W = PAGE_W - M * 2;
const FOOTER_H = 34;

const C = {
  ink: hex("#16130f"),
  muted: hex("#6f6a60"),
  faint: hex("#a39d91"),
  line: hex("#e7e1d4"),
  stripe: hex("#faf7f0"),
  card: hex("#f4eedf"),
  night: hex("#0b0b0c"),
  nightText: hex("#c9c4b8"),
  white: rgb(1, 1, 1),
  blue: hex("#1840a0"),
  yellow: hex("#fdb827"),
  orange: hex("#f0500f"),
  green: hex("#15803d"),
};

type Col = { key: ColKey; label: string; w: number; align?: "right" };
type ColKey =
  | "check"
  | "client"
  | "cedula"
  | "phone"
  | "tickets"
  | "paid"
  | "method"
  | "date"
  | "code";

const FIXED_COLS: Col[] = [
  { key: "check", label: "", w: 26 },
  { key: "client", label: "Cliente", w: 172 },
  { key: "cedula", label: "Cédula", w: 74 },
  { key: "phone", label: "Teléfono", w: 84 },
  { key: "tickets", label: "Entradas", w: 104 },
  { key: "paid", label: "Pagado", w: 96 },
  { key: "method", label: "Pago", w: 94 },
  { key: "date", label: "Compra", w: 64 },
];
const COLS: Col[] = [
  ...FIXED_COLS,
  {
    key: "code",
    label: "ID orden",
    w: CONTENT_W - FIXED_COLS.reduce((sum, c) => sum + c.w, 0),
  },
];
const CELL_PAD_X = 6;
const CELL_PAD_Y = 7;

type Line = { text: string; font: PDFFont; size: number; color: RGB };

function hex(value: string): RGB {
  const n = parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// The standard PDF fonts only encode WinAnsi. Anything outside it
// (emoji, narrow no-break spaces from Intl, other scripts) would make
// pdf-lib throw, so map what we can to a close Latin-1 equivalent
// and drop the rest.
const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
function clean(value: string): string {
  return value
    .replace(/[\s   ]+/g, " ")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, (ch) => {
      if (WINANSI_EXTRA.includes(ch)) return ch;
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      return /^[\x20-\x7e\xa0-\xff]+$/.test(base) ? base : "";
    })
    .trim();
}

function fit(text: string, font: PDFFont, size: number, max: number): string {
  const t = clean(text);
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  let cut = t;
  while (cut && font.widthOfTextAtSize(`${cut}…`, size) > max) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

function wrap(
  text: string,
  font: PDFFont,
  size: number,
  max: number,
  maxLines: number,
): string[] {
  const words = clean(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < words.length; i++) {
    const next = current ? `${current} ${words[i]}` : words[i];
    if (font.widthOfTextAtSize(next, size) <= max || !current) {
      current = next;
      continue;
    }
    if (lines.length === maxLines - 1) {
      return [...lines, fit(`${current} ${words.slice(i).join(" ")}`, font, size, max)];
    }
    lines.push(current);
    current = words[i];
  }
  if (current) lines.push(fit(current, font, size, max));
  return lines;
}

function roundedRect(
  page: PDFPage,
  x: number,
  top: number,
  w: number,
  h: number,
  r: number,
  opts: { color?: RGB; borderColor?: RGB; borderWidth?: number },
) {
  const path =
    `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} ` +
    `H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(path, { x, y: top, ...opts });
}

const dateFmt = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: SHOW_TIMEZONE,
});
const timeFmt = new Intl.DateTimeFormat("es-VE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: SHOW_TIMEZONE,
});

export async function buildDoorListPdf(input: DoorListInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(clean(`Lista de acceso · ${input.title}`));
  doc.setAuthor("Pinto & Aparte");
  doc.setCreator("Pinto & Aparte · Ticket Comedy");
  doc.setCreationDate(input.generatedAt);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.CourierBold);

  let logo: PDFImage | null = null;
  if (input.logoPng) {
    try {
      logo = await doc.embedPng(input.logoPng);
    } catch {
      logo = null; // a bad/unreachable logo shouldn't block the list
    }
  }

  const generated = `${dateFmt.format(input.generatedAt)} ${timeFmt.format(input.generatedAt)}`;
  const text = (
    page: PDFPage,
    value: string,
    x: number,
    y: number,
    font: PDFFont,
    size: number,
    color: RGB,
  ) => page.drawText(clean(value), { x, y, font, size, color });
  const textRight = (
    page: PDFPage,
    value: string,
    right: number,
    y: number,
    font: PDFFont,
    size: number,
    color: RGB,
  ) => {
    const v = clean(value);
    page.drawText(v, { x: right - font.widthOfTextAtSize(v, size), y, font, size, color });
  };

  const brandStripe = (page: PDFPage, y: number, h: number) => {
    const third = PAGE_W / 3;
    page.drawRectangle({ x: 0, y, width: third, height: h, color: C.orange });
    page.drawRectangle({ x: third, y, width: third, height: h, color: C.yellow });
    page.drawRectangle({ x: third * 2, y, width: PAGE_W - third * 2, height: h, color: C.blue });
  };

  // ---- First page: hero header + summary ----------------------------
  let page = doc.addPage([PAGE_W, PAGE_H]);
  const BAND_H = 124;
  page.drawRectangle({ x: 0, y: PAGE_H - BAND_H, width: PAGE_W, height: BAND_H, color: C.night });
  brandStripe(page, PAGE_H - BAND_H - 4, 4);

  let textX = M;
  if (logo) {
    const size = 100;
    const scale = Math.min(size / logo.width, size / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, { x: M - 6, y: PAGE_H - BAND_H / 2 - h / 2, width: w, height: h });
    textX = M - 6 + w + 18;
  }

  const rightCol = 190;
  const titleMax = PAGE_W - M - rightCol - textX - 16;
  text(page, "LISTA DE ACCESO  ·  RESPALDO EN PUERTA", textX, PAGE_H - 44, bold, 8.5, C.yellow);
  page.drawText(fit(input.title, bold, 24, titleMax), {
    x: textX,
    y: PAGE_H - 74,
    font: bold,
    size: 24,
    color: C.white,
  });
  page.drawText(fit(input.subtitle, regular, 10, titleMax), {
    x: textX,
    y: PAGE_H - 94,
    font: regular,
    size: 10,
    color: C.nightText,
  });

  const right = PAGE_W - M;
  textRight(page, "GENERADO", right, PAGE_H - 44, bold, 7, C.faint);
  textRight(page, generated, right, PAGE_H - 57, regular, 9.5, C.white);
  textRight(page, "ESTADO", right, PAGE_H - 76, bold, 7, C.faint);
  textRight(page, input.statusLabel, right, PAGE_H - 89, regular, 9.5, C.white);

  // Summary cards
  const allRows = input.groups.flatMap((g) => g.rows);
  const totalTickets = allRows.reduce((s, r) => s + r.order.seat_ids.length, 0);
  const totalUsd = allRows.reduce((s, r) => s + Number(r.order.total_usd), 0);
  const totalBs = allRows.reduce((s, r) => s + Number(r.order.monto_bs), 0);
  const cards: { label: string; value: string; accent: RGB }[] = [
    { label: "ÓRDENES", value: String(allRows.length), accent: C.blue },
    { label: "ENTRADAS", value: String(totalTickets), accent: C.orange },
    { label: "TOTAL USD", value: formatMoney(totalUsd), accent: C.yellow },
    { label: "TOTAL BS", value: formatBs(totalBs), accent: C.green },
  ];
  const gap = 12;
  const cardW = (CONTENT_W - gap * (cards.length - 1)) / cards.length;
  const cardH = 54;
  const cardTop = PAGE_H - BAND_H - 4 - 18;
  cards.forEach((card, i) => {
    const x = M + i * (cardW + gap);
    roundedRect(page, x, cardTop, cardW, cardH, 10, { color: C.card });
    page.drawRectangle({ x: x + 14, y: cardTop - 22, width: 6, height: 6, color: card.accent });
    text(page, card.label, x + 26, cardTop - 21, bold, 7.5, C.muted);
    page.drawText(fit(card.value, bold, 17, cardW - 28), {
      x: x + 14,
      y: cardTop - 43,
      font: bold,
      size: 17,
      color: C.ink,
    });
  });

  let y = cardTop - cardH - 22;

  // ---- Table helpers -------------------------------------------------
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    brandStripe(page, PAGE_H - 4, 4);
    text(page, "LISTA DE ACCESO", M, PAGE_H - 30, bold, 7.5, C.muted);
    page.drawText(fit(input.title, bold, 12, CONTENT_W - 200), {
      x: M,
      y: PAGE_H - 46,
      font: bold,
      size: 12,
      color: C.ink,
    });
    textRight(page, input.statusLabel, PAGE_W - M, PAGE_H - 46, regular, 9, C.muted);
    y = PAGE_H - 64;
  };

  const drawTableHeader = () => {
    const h = 20;
    roundedRect(page, M, y, CONTENT_W, h, 6, { color: C.blue });
    let x = M;
    for (const col of COLS) {
      if (col.label) {
        text(page, col.label.toUpperCase(), x + CELL_PAD_X, y - 13, bold, 7, C.white);
      }
      x += col.w;
    }
    y -= h;
  };

  const drawSectionHeading = (group: DoorListGroup, continued: boolean) => {
    const tickets = group.rows.reduce((s, r) => s + r.order.seat_ids.length, 0);
    const name = group.show?.name ?? "Show eliminado";
    const meta = group.show
      ? [formatDate(group.show.date), group.show.venue].filter(Boolean).join("  ·  ")
      : "";
    const summary = `${group.rows.length} ${group.rows.length === 1 ? "orden" : "órdenes"}  ·  ${tickets} ${tickets === 1 ? "entrada" : "entradas"}`;
    const summaryW = bold.widthOfTextAtSize(summary, 9);
    page.drawText(fit(`${name}${continued ? " (cont.)" : ""}`, bold, 13, CONTENT_W - summaryW - 24), {
      x: M,
      y: y - 13,
      font: bold,
      size: 13,
      color: C.ink,
    });
    textRight(page, summary, PAGE_W - M, y - 12, bold, 9, C.blue);
    if (meta) {
      page.drawText(fit(meta.charAt(0).toUpperCase() + meta.slice(1), regular, 9, CONTENT_W), {
        x: M,
        y: y - 27,
        font: regular,
        size: 9,
        color: C.muted,
      });
    }
    y -= meta ? 36 : 22;
  };

  const cellLines = (row: DoorListRow, col: Col): Line[] => {
    const o = row.order;
    const inner = col.w - CELL_PAD_X * 2;
    const primary = (v: string, font = bold, size = 8.5): Line => ({
      text: fit(v, font, size, inner),
      font,
      size,
      color: C.ink,
    });
    const secondary = (v: string): Line => ({
      text: fit(v, regular, 7, inner),
      font: regular,
      size: 7,
      color: C.muted,
    });
    switch (col.key) {
      case "check":
        return [];
      case "client":
        return [primary(o.customer_name), secondary(o.customer_email)];
      case "cedula":
        return [primary(o.cedula || "—", regular)];
      case "phone":
        return [primary(o.customer_phone || "—", regular)];
      case "tickets": {
        const n = o.seat_ids.length;
        const seats = row.seatLabels.length
          ? wrap(row.seatLabels.join(", "), regular, 7, inner, 3).map((t) => ({
              text: t,
              font: regular,
              size: 7,
              color: C.muted,
            }))
          : [];
        return [primary(`${n} ${n === 1 ? "entrada" : "entradas"}`), ...seats];
      }
      case "paid":
        return [primary(formatMoney(o.total_usd)), secondary(formatBs(o.monto_bs))];
      case "method": {
        const label = o.payment_method ? PAYMENT_METHOD_LABELS[o.payment_method] : "—";
        return [
          primary(label, regular),
          ...(o.payment_ref ? [secondary(`Ref. ${o.payment_ref}`)] : []),
        ];
      }
      case "date": {
        const d = new Date(o.created_at);
        return [primary(dateFmt.format(d), regular), secondary(timeFmt.format(d))];
      }
      case "code":
        return [primary(`#${orderCode(o.id)}`, mono, 8.5)];
    }
  };

  const lineGap = (l: Line) => l.size * 1.35;

  // ---- Body -----------------------------------------------------------
  if (allRows.length === 0) {
    roundedRect(page, M, y, CONTENT_W, 80, 10, { borderColor: C.line, borderWidth: 1 });
    const msg = "No hay órdenes para estos filtros.";
    text(
      page,
      msg,
      M + CONTENT_W / 2 - regular.widthOfTextAtSize(msg, 11) / 2,
      y - 44,
      regular,
      11,
      C.muted,
    );
  }

  for (const group of input.groups) {
    if (group.rows.length === 0) continue;
    // Keep the heading together with the table header and a first row.
    if (y - 36 - 20 - 40 < M + FOOTER_H) newPage();
    drawSectionHeading(group, false);
    drawTableHeader();

    group.rows.forEach((row, index) => {
      const cells = COLS.map((col) => cellLines(row, col));
      const contentH = Math.max(...cells.map((lines) => lines.reduce((s, l) => s + lineGap(l), 0)));
      const rowH = Math.max(32, contentH + CELL_PAD_Y * 2 - 2);

      if (y - rowH < M + FOOTER_H) {
        newPage();
        drawSectionHeading(group, true);
        drawTableHeader();
      }

      if (index % 2 === 1) {
        page.drawRectangle({ x: M, y: y - rowH, width: CONTENT_W, height: rowH, color: C.stripe });
      }
      page.drawLine({
        start: { x: M, y: y - rowH },
        end: { x: M + CONTENT_W, y: y - rowH },
        thickness: 0.6,
        color: C.line,
      });

      let x = M;
      COLS.forEach((col, ci) => {
        if (col.key === "check") {
          const box = 11;
          const bx = x + (col.w - box) / 2;
          const top = y - CELL_PAD_Y - 1;
          if (row.order.used_at) {
            roundedRect(page, bx, top, box, box, 2.5, { color: C.green });
            page.drawLine({ start: { x: bx + 2.6, y: top - 5.8 }, end: { x: bx + 4.7, y: top - 8 }, thickness: 1.4, color: C.white });
            page.drawLine({ start: { x: bx + 4.7, y: top - 8 }, end: { x: bx + 8.6, y: top - 3.2 }, thickness: 1.4, color: C.white });
          } else {
            roundedRect(page, bx, top, box, box, 2.5, { borderColor: C.faint, borderWidth: 1 });
          }
        } else {
          let cursor = y - CELL_PAD_Y;
          for (const line of cells[ci]) {
            page.drawText(line.text, {
              x: x + CELL_PAD_X,
              y: cursor - line.size * 0.9,
              font: line.font,
              size: line.size,
              color: line.color,
            });
            cursor -= lineGap(line);
          }
        }
        x += col.w;
      });

      y -= rowH;
    });

    y -= 22;
  }

  // ---- Footer on every page (needs the final page count) -------------
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: M, y: M + 6 },
      end: { x: PAGE_W - M, y: M + 6 },
      thickness: 0.6,
      color: C.line,
    });
    text(
      p,
      `Pinto & Aparte  ·  Lista de acceso  ·  Generado ${generated}  ·  Documento interno: contiene datos personales`,
      M,
      M - 6,
      regular,
      7,
      C.faint,
    );
    textRight(p, `Página ${i + 1} de ${pages.length}`, PAGE_W - M, M - 6, bold, 7, C.muted);
  });

  return doc.save();
}
