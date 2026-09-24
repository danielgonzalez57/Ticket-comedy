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

// Seats are assigned first-come-first-served (see
// migrations/0014_fcfs_seat_assignment.sql), so the admin only picks a
// capacity. Seats are still laid out in fixed-width rows because the
// assignment order and the seat editor both rely on row/col indexes.
export const SEATS_PER_ROW = 10;
export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 1000;

export function gridForCapacity(capacity: number) {
  return {
    rows: Math.ceil(capacity / SEATS_PER_ROW),
    cols: Math.min(capacity, SEATS_PER_ROW),
  };
}

// Generates exactly `capacity` seats for a freshly created show; the
// last row is partial when capacity isn't a multiple of SEATS_PER_ROW.
export function generateSeats(
  showId: string,
  capacity: number,
  basePrice: number,
): Array<Pick<Seat, "show_id" | "label" | "row_index" | "col_index" | "price" | "zone" | "status">> {
  const seats = [];
  for (let i = 0; i < capacity; i++) {
    const r = Math.floor(i / SEATS_PER_ROW);
    const c = i % SEATS_PER_ROW;
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
  return seats;
}
