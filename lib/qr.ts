import "server-only";
import QRCode from "qrcode";
import { siteUrl } from "@/lib/constants";

export function ticketUrl(token: string): string {
  return `${siteUrl()}/tickets/${token}`;
}

const OPTS = {
  margin: 1,
  width: 512,
  color: { dark: "#0a0a0a", light: "#ffffff" },
} as const;

// Data URL (PNG) — safe to embed directly in <img> on web pages.
export async function qrDataUrl(token: string): Promise<string> {
  return QRCode.toDataURL(ticketUrl(token), OPTS);
}

// PNG buffer — used as an inline (cid) email image.
export async function qrPngBuffer(token: string): Promise<Buffer> {
  return QRCode.toBuffer(ticketUrl(token), { ...OPTS, type: "png" });
}
