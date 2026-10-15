// Builds a click-to-chat link. `phone` must be digits in international
// format (e.g. 58412XXXXXXX). Uses api.whatsapp.com/send rather than
// wa.me: wa.me's redirect mangles emoji outside the BMP (🧡 🎫 🍹 ...)
// into "�" in the prefilled text.
export function whatsappUrl(phone: string, text: string): string {
  const clean = phone.replace(/\D/g, "");
  return `https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(text)}`;
}

// Normalizes a Venezuelan phone number to international format (58...).
// Accepts inputs like "0412-1234567", "412 1234567", "+58 412 1234567".
export function normalizeVePhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("58")) return digits;
  if (digits.startsWith("0")) digits = digits.slice(1);
  return `58${digits}`;
}

// Order code shown to customers (short, human-friendly).
export function orderCode(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
