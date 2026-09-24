// Hand-written types mirroring supabase/schema.sql.
// Kept in sync manually (small schema, no codegen step).

export type ShowStatus = "draft" | "published" | "finished";
export type SeatStatus = "available" | "held" | "sold" | "disabled";
export type OrderStatus =
  | "pending"
  | "reported"
  | "verified"
  | "rejected"
  | "expired"
  | "cancelled";
export type PaymentMethod =
  | "pago_movil"
  | "binance"
  | "zelle"
  | "transferencia"
  | "efectivo";

export type Show = {
  id: string;
  name: string;
  description: string | null;
  venue: string;
  date: string;
  comedians: string[];
  poster_url: string | null;
  banner_url: string | null;
  grid_rows: number;
  grid_cols: number;
  base_price: number;
  // Exchange rate (Bs per USD) fixed for this show's sales, and when
  // it was set. Never read at render/verification time for an
  // existing order — orders snapshot their own copy.
  tasa: number;
  tasa_fecha: string;
  status: ShowStatus;
  created_at: string;
}

// shows_public view (migration 0006): adds base_price_bs, computed
// in the DB by usd_to_bs() — never recompute `base_price * tasa` in
// TypeScript. Use this type/view for any public-facing show display.
export type ShowWithBs = Show & { base_price_bs: number };

export type Seat = {
  id: string;
  show_id: string;
  label: string;
  row_index: number;
  col_index: number;
  price: number;
  zone: string | null;
  status: SeatStatus;
  hold_expires_at: string | null;
  held_by_order_id: string | null;
  created_at: string;
}

// seats_public view (migration 0006): adds price_bs, computed in the
// DB by usd_to_bs() from the seat's own show's tasa.
export type SeatWithBs = Seat & { price_bs: number };

export type Order = {
  id: string;
  show_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  cedula: string | null;
  binance_email: string | null;
  seat_ids: string[];

  // Currency snapshot copied from the show at creation time.
  total_usd: number;
  tasa: number;
  tasa_fecha: string;
  monto_bs: number;

  payment_method: PaymentMethod | null;
  payment_ref: string | null;
  banco_emisor: string | null;
  monto_reportado: number | null;
  fecha_pago: string | null;
  // Object path within the `receipts` bucket, NOT a URL — see
  // migration 0005. Generate a short-lived signed URL on demand.
  receipt_path: string | null;
  needs_review: boolean;
  needs_review_of: string | null;

  status: OrderStatus;
  expires_at: string | null;
  reported_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  rejected_reason: string | null;

  qr_token: string;
  used_at: string | null;
  validated_by: string | null;
  admin_note: string | null;
  created_at: string;
}

type InsertOf<T> = Partial<T>;

export type Database = {
  public: {
    Tables: {
      shows: { Row: Show; Insert: InsertOf<Show>; Update: InsertOf<Show>; Relationships: [] };
      seats: { Row: Seat; Insert: InsertOf<Seat>; Update: InsertOf<Seat>; Relationships: [] };
      orders: { Row: Order; Insert: InsertOf<Order>; Update: InsertOf<Order>; Relationships: [] };
    };
    Views: {
      shows_public: { Row: ShowWithBs; Relationships: [] };
      seats_public: { Row: SeatWithBs; Relationships: [] };
    };
    Functions: {
      usd_to_bs: { Args: { p_usd: number; p_tasa: number }; Returns: number };
      payment_matches: {
        Args: { p_reportado: number | null; p_esperado: number | null };
        Returns: boolean;
      };
      create_pending_order: {
        Args: {
          p_show_id: string;
          p_seat_ids: string[];
          p_name: string;
          p_email: string;
          p_phone: string;
          p_payment_method: string;
          p_hold_minutes?: number;
        };
        Returns: Order;
      };
      create_pending_order_by_qty: {
        Args: {
          p_show_id: string;
          p_quantity: number;
          p_name: string;
          p_email: string;
          p_phone: string;
          p_payment_method: string;
          p_hold_minutes?: number;
        };
        Returns: Order;
      };
      report_payment: {
        Args: {
          p_order_id: string;
          p_customer_email: string;
          p_banco_emisor: string;
          p_payment_ref: string;
          p_cedula: string | null;
          p_monto_reportado: number | null;
          p_fecha_pago: string;
          p_receipt_path?: string | null;
        };
        Returns: Order;
      };
      verify_payment_atomic: {
        Args: { p_order_id: string; p_verified_by: string };
        Returns: Order;
      };
      reject_payment_atomic: {
        Args: { p_order_id: string; p_verified_by: string; p_reason: string };
        Returns: Order;
      };
      reassign_order_seats: {
        Args: {
          p_order_id: string;
          p_new_seat_ids: string[];
          p_note?: string | null;
        };
        Returns: Order;
      };
      resolve_payment_reference_conflict: {
        Args: {
          p_order_id: string;
          p_keep_this: boolean;
          p_note?: string | null;
        };
        Returns: Order;
      };
      find_order_by_code: {
        Args: { p_code: string };
        Returns: Order | null;
      };
      release_expired_holds: {
        Args: Record<string, never>;
        Returns: { seats_released: number; orders_expired: number };
      };
      check_rate_limit: {
        Args: { p_key: string; p_max_count: number; p_window_seconds: number };
        Returns: boolean;
      };
      purge_rate_limit_hits: { Args: Record<string, never>; Returns: number };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
