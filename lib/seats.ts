import type { Seat, SeatStatus } from "@/lib/database.types";

// Row label: 0 -> A, 25 -> Z, 26 -> AA, ...
export function rowLabel(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

export function seatLabel(rowIndex: number, colIndex: number): string {
  return `${rowLabel(rowIndex)}${colIndex + 1}`;
}

// A held seat whose hold has expired should be treated as available
// when rendering the public grid ("lazy" release on read).
export function effectiveStatus(seat: {
  status: SeatStatus;
  hold_expires_at: string | null;
}): SeatStatus {
  if (
    seat.status === "held" &&
    seat.hold_expires_at &&
    new Date(seat.hold_expires_at).getTime() < Date.now()
  ) {
    return "available";
  }
  return seat.status;
}

export function isSelectable(seat: Pick<Seat, "status" | "hold_expires_at">) {
  return effectiveStatus(seat) === "available";
}

// Generates the seat rows for a freshly created show.
export function generateSeats(
  showId: string,
  rows: number,
  cols: number,
  basePrice: number,
): Array<Pick<Seat, "show_id" | "label" | "row_index" | "col_index" | "price" | "zone" | "status">> {
  const seats = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      seats.push({
        show_id: showId,
        label: seatLabel(r, c),
        row_index: r,
        col_index: c,
        price: basePrice,
        zone: "general",
        status: "available" as SeatStatus,
      });
    }
  }
  return seats;
}
