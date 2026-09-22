-- =============================================================
-- Ticket Comedy — Database schema, RLS and helper functions
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- This file is the canonical "fresh install" snapshot. It is kept in
-- sync by hand with supabase/migrations/*.sql (which is what you run,
-- in order, against an existing database) — each numbered migration
-- explains the *why* behind a change; this file just reflects the
-- resulting state.
-- =============================================================

-- ---------- Tables -------------------------------------------

create table if not exists shows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  venue text not null,
  date timestamptz not null,
  comedians text[] not null default '{}',
  poster_url text,
  grid_rows int not null default 5,
  grid_cols int not null default 10,
  base_price numeric(10,2) not null,
  -- Exchange rate (Bs per USD), fixed for the life of this show's
  -- sales — see migrations/0004_currency_model.sql. No default on
  -- purpose: every show must be created with an explicit rate.
  tasa numeric(12,4) not null,
  tasa_fecha timestamptz not null,
  status text not null default 'draft', -- draft | published | finished
  created_at timestamptz default now(),
  -- A show can never go live with a placeholder/nonsense rate — see
  -- migrations/0004_currency_model.sql for why tasa <= 1 means
  -- "never set for real" in this app's context.
  constraint shows_no_placeholder_tasa_when_published
    check (status <> 'published' or tasa > 1)
);

create table if not exists seats (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references shows(id) on delete cascade,
  label text not null,           -- e.g. A1, B3, C10
  row_index int not null,
  col_index int not null,
  price numeric(10,2) not null,
  zone text default 'general',   -- general | vip | etc
  status text not null default 'available', -- available | held | sold | disabled
  hold_expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references shows(id),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  cedula text,
  seat_ids uuid[] not null,

  -- Currency snapshot, copied from the show at creation time and
  -- never re-read from it afterwards (see migration 0004).
  total_usd numeric(10,2) not null,
  tasa numeric(12,4) not null,
  tasa_fecha timestamptz not null,
  monto_bs numeric(14,2) not null,

  payment_method text,           -- pago_movil | zelle | transferencia | efectivo
  payment_ref text,
  banco_emisor text,
  monto_reportado numeric(12,2),
  fecha_pago date,
  -- Object path within the `receipts` bucket, NOT a URL — signed
  -- URLs expire, so one is generated server-side on demand from this
  -- path whenever it needs to be shown.
  receipt_path text,
  needs_review boolean not null default false,
  needs_review_of uuid references orders(id),

  -- pending -> reported -> verified, or -> rejected/expired/cancelled
  -- at various points. See migration 0005 for the full state machine.
  status text not null default 'pending'
    check (status in ('pending', 'reported', 'verified', 'rejected', 'expired', 'cancelled')),
  expires_at timestamptz,
  reported_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  rejected_reason text,
  -- Which admin scanned this ticket at the door (migration 0007).
  validated_by uuid references auth.users(id) on delete set null,

  qr_token text unique not null default gen_random_uuid()::text,
  used_at timestamptz,
  admin_note text,
  created_at timestamptz default now(),
  constraint orders_payment_ref_format
    check (payment_ref is null or payment_ref ~ '^[0-9]{6,8}$')
);

-- seats.held_by_order_id references orders, so it's added after both
-- tables exist rather than inlined in the seats table above.
alter table seats
  add column if not exists held_by_order_id uuid references orders(id) on delete set null;

-- ---------- Indexes ------------------------------------------

create index if not exists seats_show_id_idx on seats(show_id);
create index if not exists seats_status_idx on seats(status);
create index if not exists seats_held_by_order_id_idx on seats(held_by_order_id);
create index if not exists orders_show_id_idx on orders(show_id);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_created_at_idx on orders(created_at);
create index if not exists shows_status_idx on shows(status);

-- Partial unique index: a bank reference must be unique per issuing
-- bank among "live", non-flagged orders. monto_reportado/fecha_pago
-- are deliberately NOT part of the tuple — they're customer-entered
-- free text, so including them would let a duplicate reference
-- through by simply fat-fingering the amount by a cent (see
-- migrations/0003_payment_reference_integrity.sql for the full
-- rationale). needs_review rows are excluded on purpose: they're
-- already known to share a reference with another live order.
create unique index if not exists orders_payment_ref_unique_idx
  on orders (banco_emisor, payment_ref)
  where payment_ref is not null
    and needs_review = false
    and status not in ('cancelled', 'rejected', 'expired');

-- =============================================================
-- Row Level Security
-- =============================================================
alter table shows  enable row level security;
alter table seats  enable row level security;
alter table orders enable row level security;

-- --- Public (anon) read access -------------------------------

-- Anyone can read published shows.
drop policy if exists "public read published shows" on shows;
create policy "public read published shows" on shows
  for select using (status = 'published');

-- Anyone can read seats that belong to a published show.
drop policy if exists "public read seats of published shows" on seats;
create policy "public read seats of published shows" on seats
  for select using (
    exists (
      select 1 from shows s
      where s.id = seats.show_id and s.status = 'published'
    )
  );

-- --- Admin (authenticated + allowlisted) full access ----------
-- "authenticated" alone is NOT admin — see migration 0012. Once
-- customer accounts exist (magic-link login), every logged-in
-- customer is also `authenticated`; admin-ness is a real allowlist
-- (admin_users), checked via is_admin().

create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table admin_users enable row level security;

-- Fresh install: seeds the allowlist with whatever accounts already
-- exist at migration time (a no-op on a truly empty database).
insert into admin_users (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- security definer so it can read admin_users (locked down, no
-- policies grant it to anon/authenticated) regardless of the caller's
-- own RLS visibility. Only ever answers about the calling user.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;
grant execute on function is_admin() to authenticated;

drop policy if exists "admin all shows" on shows;
create policy "admin all shows" on shows
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "admin all seats" on seats;
create policy "admin all seats" on seats
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "admin all orders" on orders;
create policy "admin all orders" on orders
  for all to authenticated using (is_admin()) with check (is_admin());

-- A logged-in customer (not an admin) can read only their own
-- orders, matched by the email on their own Auth session — never a
-- write, never anyone else's row.
drop policy if exists "customer read own orders" on orders;
create policy "customer read own orders" on orders
  for select to authenticated
  using (lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- "Mis entradas" needs to keep showing past shows after they're
-- marked 'finished' (no longer covered by "public read published
-- shows"), and seat labels for those orders. Both scoped strictly to
-- shows/seats the customer actually has an order for.
drop policy if exists "customer read shows of own orders" on shows;
create policy "customer read shows of own orders" on shows
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.show_id = shows.id
        and lower(o.customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "customer read seats of own orders" on seats;
create policy "customer read seats of own orders" on seats
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = seats.held_by_order_id
        and lower(o.customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- Note: order creation, public order lookup, ticket validation and
-- payment confirmation all run server-side with the service role
-- key (which bypasses RLS), so anon has no direct access to orders.

-- =============================================================
-- Currency helpers (migration 0004)
-- =============================================================

-- USD -> Bs conversion happens in exactly one place. Postgres's
-- numeric round() rounds positive values half-away-from-zero (i.e.
-- half-up for currency amounts, which are always positive here).
create or replace function usd_to_bs(p_usd numeric, p_tasa numeric)
returns numeric(14,2)
language sql
immutable
as $$
  select round(p_usd * p_tasa, 2)
$$;

-- Tolerance for comparing a customer-reported Bs amount against the
-- order's own monto_bs (a few cents absorbs display/rounding noise).
-- Not yet called from anywhere — Fase 3 wires this into the admin
-- panel's mismatch highlight.
create or replace function payment_matches(p_reportado numeric, p_esperado numeric)
returns boolean
language sql
immutable
as $$
  select p_reportado is not null
    and p_esperado is not null
    and abs(p_reportado - p_esperado) <= 0.02
$$;

-- =============================================================
-- create_pending_order — atomic seat hold + order creation.
-- Computes the price from real seat prices (never trusts the
-- client), validates availability (treating expired holds as free),
-- enforces the 4-seat limit, snapshots the show's currency onto the
-- order, and returns the new order row. Invoked from the server via
-- RPC. Does NOT accept payment/reference fields — see
-- report_payment() below and migration 0005 for why creating an
-- order is separate from reporting a payment.
-- =============================================================
create or replace function create_pending_order(
  p_show_id uuid,
  p_seat_ids uuid[],
  p_name text,
  p_email text,
  p_phone text,
  p_payment_method text,
  p_hold_minutes int default 20
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_order orders;
  v_show shows;
  v_total_usd numeric(10,2);
  v_sellable int;
  v_requested int;
  v_expires_at timestamptz;
begin
  v_requested := (select count(distinct x) from unnest(p_seat_ids) x);

  if v_requested is null or v_requested < 1 then
    raise exception 'NO_SEATS';
  end if;
  if v_requested > 4 then
    raise exception 'MAX_4_SEATS';
  end if;

  select * into v_show from shows where id = p_show_id and status = 'published';
  if not found then
    raise exception 'SHOW_NOT_AVAILABLE';
  end if;

  -- Lock the requested seat rows to avoid races.
  perform 1 from seats where id = any(p_seat_ids) for update;

  -- A seat is sellable if it belongs to the show and is available
  -- or an expired hold.
  select count(*), coalesce(sum(price), 0)
    into v_sellable, v_total_usd
  from seats
  where id = any(p_seat_ids)
    and show_id = p_show_id
    and status <> 'sold'
    and status <> 'disabled'
    and (status <> 'held' or hold_expires_at is null or hold_expires_at < now());

  if v_sellable <> v_requested then
    raise exception 'SEAT_UNAVAILABLE';
  end if;

  v_expires_at := now() + make_interval(mins => p_hold_minutes);

  -- Insert the order BEFORE stamping seats.held_by_order_id — that
  -- column has a plain (non-deferrable) FK into orders(id), so the
  -- referenced row must exist first (see
  -- migrations/0011_fix_create_pending_order_fk_order.sql).
  insert into orders (
    id, show_id, customer_name, customer_email, customer_phone,
    seat_ids, total_usd, tasa, tasa_fecha, monto_bs,
    payment_method, status, expires_at
  ) values (
    v_order_id, p_show_id, p_name, p_email, p_phone,
    p_seat_ids, v_total_usd, v_show.tasa, v_show.tasa_fecha,
    usd_to_bs(v_total_usd, v_show.tasa),
    p_payment_method, 'pending', v_expires_at
  )
  returning * into v_order;

  -- Hold the seats, stamping which order now owns the hold (0.1 fix:
  -- lets verify_payment_atomic verify a seat wasn't re-held/sold to
  -- someone else before this order gets verified).
  update seats
     set status = 'held',
         hold_expires_at = v_expires_at,
         held_by_order_id = v_order_id
   where id = any(p_seat_ids);

  return v_order;
end;
$$;

-- =============================================================
-- create_pending_order_by_qty — atomic FCFS seat assignment
-- (migration 0014). The public no longer picks specific seats from a
-- map — they pick a quantity and this claims the next sellable seats
-- in row/col order itself, instead of trusting a client-supplied
-- seat_ids array like create_pending_order does. `for update skip
-- locked` on the seat selection is what makes this actually
-- first-come-first-served under concurrency: two buyers racing for
-- the same show each lock a *different* set of the next available
-- rows instead of blocking on (or double-booking) the same ones.
-- =============================================================
create or replace function create_pending_order_by_qty(
  p_show_id uuid,
  p_quantity int,
  p_name text,
  p_email text,
  p_phone text,
  p_payment_method text,
  p_hold_minutes int default 20
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_order orders;
  v_show shows;
  v_seat_ids uuid[];
  v_total_usd numeric(10,2);
  v_expires_at timestamptz;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'NO_SEATS';
  end if;
  if p_quantity > 4 then
    raise exception 'MAX_4_SEATS';
  end if;

  select * into v_show from shows where id = p_show_id and status = 'published';
  if not found then
    raise exception 'SHOW_NOT_AVAILABLE';
  end if;

  select array_agg(id order by row_index, col_index), coalesce(sum(price), 0)
    into v_seat_ids, v_total_usd
  from (
    select id, row_index, col_index, price
    from seats
    where show_id = p_show_id
      and status <> 'sold'
      and status <> 'disabled'
      and (status <> 'held' or hold_expires_at is null or hold_expires_at < now())
    order by row_index, col_index
    limit p_quantity
    for update skip locked
  ) t;

  if v_seat_ids is null or array_length(v_seat_ids, 1) < p_quantity then
    raise exception 'SOLD_OUT';
  end if;

  v_expires_at := now() + make_interval(mins => p_hold_minutes);

  insert into orders (
    id, show_id, customer_name, customer_email, customer_phone,
    seat_ids, total_usd, tasa, tasa_fecha, monto_bs,
    payment_method, status, expires_at
  ) values (
    v_order_id, p_show_id, p_name, p_email, p_phone,
    v_seat_ids, v_total_usd, v_show.tasa, v_show.tasa_fecha,
    usd_to_bs(v_total_usd, v_show.tasa),
    p_payment_method, 'pending', v_expires_at
  )
  returning * into v_order;

  update seats
     set status = 'held',
         hold_expires_at = v_expires_at,
         held_by_order_id = v_order_id
   where id = any(v_seat_ids);

  return v_order;
end;
$$;

-- =============================================================
-- report_payment — moves pending -> reported. Accepts a reference
-- collision without hard-rejecting it (bank references can
-- legitimately coincide) — see
-- migrations/0003_payment_reference_integrity.sql for the reasoning,
-- which lives here now that reference reporting is its own step.
--
-- Requires the customer's own email (case-insensitive match against
-- orders.customer_email) before doing anything else — /orders/[id]
-- is reachable by anyone with the order's UUID (no login in this
-- app), so without this check anyone holding that URL could burn a
-- bank reference against someone else's order. See migration 0010.
-- =============================================================
create or replace function report_payment(
  p_order_id uuid,
  p_customer_email text,
  p_banco_emisor text,
  p_payment_ref text,
  p_cedula text,
  p_monto_reportado numeric,
  p_fecha_pago date,
  p_receipt_path text default null
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
  v_conflict_id uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if lower(v_order.customer_email) <> lower(btrim(p_customer_email)) then
    raise exception 'OWNER_MISMATCH';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'ORDER_NOT_PENDING';
  end if;

  begin
    update orders
       set banco_emisor = p_banco_emisor,
           payment_ref = p_payment_ref,
           cedula = p_cedula,
           monto_reportado = p_monto_reportado,
           fecha_pago = p_fecha_pago,
           receipt_path = coalesce(p_receipt_path, receipt_path),
           status = 'reported',
           reported_at = now()
     where id = p_order_id
     returning * into v_order;
  exception when unique_violation then
    select id into v_conflict_id
    from orders
    where banco_emisor = p_banco_emisor
      and payment_ref = p_payment_ref
      and needs_review = false
      and status not in ('cancelled', 'rejected', 'expired')
    limit 1;

    update orders
       set banco_emisor = p_banco_emisor,
           payment_ref = p_payment_ref,
           cedula = p_cedula,
           monto_reportado = p_monto_reportado,
           fecha_pago = p_fecha_pago,
           receipt_path = coalesce(p_receipt_path, receipt_path),
           status = 'reported',
           reported_at = now(),
           needs_review = true,
           needs_review_of = v_conflict_id
     where id = p_order_id
     returning * into v_order;
  end;

  return v_order;
end;
$$;

-- =============================================================
-- verify_payment_atomic — the only supported way to mark an order
-- verified. Accepts orders in 'pending' or 'reported', but only lets
-- a 'pending' order skip straight to verified when its
-- payment_method has no reconciliation step at all (efectivo/zelle).
-- A pago_movil/transferencia order must go through report_payment
-- first — letting it verify straight from 'pending' would silently
-- bypass the (banco_emisor, payment_ref) unique index entirely,
-- since that index (and the needs_review collision check) only ever
-- runs inside report_payment. Classifies each seat into exactly one
-- of three states:
--   1. held by (or already sold as part of) this exact order → fine.
--   2. status = 'available' (no current claim — never held, or its
--      hold expired and nobody else took it) → fine, this order
--      reclaims it.
--   3. held by or sold to a *different* order, or disabled → the
--      only real conflict; only these seats go into 'SEATS_LOST'.
-- Also refuses an order still flagged needs_review — resolve the
-- reference collision first via resolve_payment_reference_conflict.
-- =============================================================
create or replace function verify_payment_atomic(p_order_id uuid, p_verified_by uuid)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
  v_lost_labels text;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.status = 'verified' then
    return v_order; -- idempotent re-confirm (e.g. resend email)
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'ORDER_CANCELLED';
  end if;
  if v_order.status = 'rejected' then
    raise exception 'ORDER_REJECTED';
  end if;
  if v_order.status = 'expired' then
    raise exception 'ORDER_EXPIRED';
  end if;

  if v_order.status = 'pending'
     and v_order.payment_method in ('pago_movil', 'transferencia') then
    raise exception 'MUST_REPORT_FIRST';
  end if;

  if v_order.needs_review then
    raise exception 'NEEDS_REVIEW';
  end if;

  -- Lock the seats before inspecting them.
  perform 1 from seats where id = any(v_order.seat_ids) for update;

  -- Lost = not mine AND not free. ('available' seats are free even
  -- if held_by_order_id is stale-null from a lazy/cron release.)
  select string_agg(label, ', ' order by label)
    into v_lost_labels
  from seats
  where id = any(v_order.seat_ids)
    and held_by_order_id is distinct from p_order_id
    and status <> 'available';

  if v_lost_labels is not null then
    raise exception 'SEATS_LOST: %', v_lost_labels;
  end if;

  -- Every remaining seat is either already this order's or free —
  -- claim it either way.
  update seats
     set status = 'sold', hold_expires_at = null, held_by_order_id = p_order_id
   where id = any(v_order.seat_ids);

  update orders
     set status = 'verified',
         verified_at = now(),
         verified_by = p_verified_by
   where id = p_order_id
   returning * into v_order;

  return v_order;
end;
$$;

-- =============================================================
-- reject_payment_atomic — requires a reason (always persisted),
-- releases any seats this order still holds, and records who acted
-- and when in verified_at/verified_by (those columns mean "who
-- resolved this order", not literally "who verified it").
-- =============================================================
create or replace function reject_payment_atomic(
  p_order_id uuid,
  p_verified_by uuid,
  p_reason text
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.status not in ('pending', 'reported') then
    raise exception 'INVALID_STATUS';
  end if;

  update seats
     set status = 'available', hold_expires_at = null, held_by_order_id = null
   where held_by_order_id = p_order_id
     and status = 'held';

  update orders
     set status = 'rejected',
         rejected_reason = p_reason,
         verified_at = now(),
         verified_by = p_verified_by
   where id = p_order_id
   returning * into v_order;

  return v_order;
end;
$$;

-- =============================================================
-- reassign_order_seats — resolves a SEATS_LOST conflict by moving an
-- order to a different, currently-sellable set of seats on the same
-- show. A cheaper replacement is allowed (the USD difference is only
-- recorded as an admin_note — there's no credit-balance model yet);
-- a pricier one is refused (PRICE_INCREASE) rather than silently
-- under-billing, since the customer already transferred a fixed Bs
-- amount for the original seats. monto_bs is recomputed with this
-- ORDER's own frozen tasa (never the show's current rate).
-- =============================================================
create or replace function reassign_order_seats(
  p_order_id uuid,
  p_new_seat_ids uuid[],
  p_note text default null
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
  v_requested int;
  v_sellable int;
  v_new_total_usd numeric(10,2);
  v_new_monto_bs numeric(14,2);
  v_old_seat_ids uuid[];
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.status not in ('pending', 'reported') then
    raise exception 'INVALID_STATUS';
  end if;

  v_requested := (select count(distinct x) from unnest(p_new_seat_ids) x);
  if v_requested is null or v_requested < 1 then
    raise exception 'NO_SEATS';
  end if;
  if v_requested > 4 then
    raise exception 'MAX_4_SEATS';
  end if;

  v_old_seat_ids := v_order.seat_ids;

  -- Lock old + new seats together to avoid races with a concurrent order.
  perform 1 from seats where id = any(v_old_seat_ids || p_new_seat_ids) for update;

  select count(*), coalesce(sum(price), 0)
    into v_sellable, v_new_total_usd
  from seats
  where id = any(p_new_seat_ids)
    and show_id = v_order.show_id
    and status <> 'sold'
    and status <> 'disabled'
    and (
      held_by_order_id = p_order_id
      or status <> 'held'
      or hold_expires_at is null
      or hold_expires_at < now()
    );

  if v_sellable <> v_requested then
    raise exception 'SEAT_UNAVAILABLE';
  end if;

  if v_new_total_usd > v_order.total_usd then
    raise exception 'PRICE_INCREASE';
  end if;
  v_new_monto_bs := usd_to_bs(v_new_total_usd, v_order.tasa);

  update seats
     set status = 'available', hold_expires_at = null, held_by_order_id = null
   where id = any(v_old_seat_ids)
     and held_by_order_id = p_order_id;

  update seats
     set status = 'held',
         hold_expires_at = coalesce(v_order.expires_at, now() + interval '20 minutes'),
         held_by_order_id = p_order_id
   where id = any(p_new_seat_ids);

  update orders
     set seat_ids = p_new_seat_ids,
         total_usd = v_new_total_usd,
         monto_bs = v_new_monto_bs,
         admin_note = coalesce(admin_note || E'\n', '')
           || 'Asientos reasignados (USD ' || v_order.total_usd || ' -> ' || v_new_total_usd || ')'
           || coalesce(': ' || nullif(btrim(p_note), ''), '')
   where id = p_order_id
   returning * into v_order;

  return v_order;
end;
$$;

-- =============================================================
-- resolve_payment_reference_conflict — the only supported way to
-- clear needs_review. Always operates on the flagged (duplicate)
-- side of a collision and always leaves (banco_emisor, payment_ref)
-- held by at most one live, non-flagged order, so it can't itself
-- trigger the unique_violation it exists to avoid surfacing as a raw
-- error. See migrations/0003_payment_reference_integrity.sql for the
-- full write-up, including the concurrent 3-way-collision edge case
-- handled by the inner exception block below.
-- =============================================================
create or replace function resolve_payment_reference_conflict(
  p_order_id uuid,
  p_keep_this boolean,
  p_note text default null
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
  v_suffix text := coalesce(': ' || nullif(btrim(p_note), ''), '');
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if not v_order.needs_review then
    raise exception 'NOT_FLAGGED';
  end if;

  if not p_keep_this then
    update orders
       set payment_ref = null,
           needs_review = false,
           admin_note = coalesce(admin_note || E'\n', '')
             || 'Referencia liberada (colisión resuelta a favor de la otra orden)' || v_suffix
     where id = p_order_id
     returning * into v_order;
    return v_order;
  end if;

  if v_order.needs_review_of is not null then
    update orders
       set payment_ref = null,
           admin_note = coalesce(admin_note || E'\n', '')
             || 'Referencia liberada (colisión resuelta a favor de otra orden)' || v_suffix
     where id = v_order.needs_review_of;
  end if;

  begin
    update orders
       set needs_review = false,
           admin_note = coalesce(admin_note || E'\n', '')
             || 'Colisión de referencia resuelta: esta orden la conserva' || v_suffix
     where id = p_order_id
     returning * into v_order;
  exception when unique_violation then
    -- A sibling duplicate (same reference, different order) resolved
    -- to "keep" first. Stay flagged and re-point at whoever now
    -- legitimately holds the reference instead of failing outright.
    select id into v_order.needs_review_of
    from orders
    where banco_emisor = v_order.banco_emisor
      and payment_ref = v_order.payment_ref
      and needs_review = false
      and status not in ('cancelled', 'rejected', 'expired')
    limit 1;

    update orders
       set needs_review_of = v_order.needs_review_of,
           admin_note = coalesce(admin_note || E'\n', '')
             || 'No se pudo liberar: otra orden ya retiene esta referencia. Requiere nueva revisión.'
     where id = p_order_id
     returning * into v_order;
  end;

  return v_order;
end;
$$;

-- =============================================================
-- release_expired_holds — releases holds whose owning order is still
-- 'pending' (0.2 fix: an order awaiting admin verification must not
-- lose its seats to expiry), and marks the order itself 'expired'
-- once its deadline passed and it no longer holds any seat, in the
-- same statement/transaction — an order can't end up 'expired' while
-- still holding a seat, or have its seat freed while left dangling
-- in 'pending' forever. Returns both counts (OUT params, so
-- PostgREST returns a single JSON object) so the cron endpoint that
-- calls this can report what it actually did — see migration 0009.
--
-- Dropped first: CREATE OR REPLACE cannot change a function's return
-- type (plain int -> a record via OUT params), which matters when
-- this file runs against a database that already has the original
-- "returns int" version (e.g. from before this schema existed).
-- =============================================================
drop function if exists release_expired_holds();

create or replace function release_expired_holds(
  out seats_released int,
  out orders_expired int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update seats s
     set status = 'available', hold_expires_at = null, held_by_order_id = null
   where s.status = 'held'
     and s.hold_expires_at is not null
     and s.hold_expires_at < now()
     and (
       s.held_by_order_id is null
       or exists (
         select 1 from orders o
         where o.id = s.held_by_order_id
           and o.status = 'pending'
       )
     );
  get diagnostics seats_released = row_count;

  -- Only 'pending' orders ever expire by time — 'reported' orders are
  -- never touched here no matter how old expires_at is.
  update orders o
     set status = 'expired'
   where o.status = 'pending'
     and o.expires_at is not null
     and o.expires_at < now()
     and not exists (
       select 1 from seats s
       where s.held_by_order_id = o.id and s.status = 'held'
     );
  get diagnostics orders_expired = row_count;
end;
$$;

-- =============================================================
-- find_order_by_code — manual fallback for the door scanner using
-- the short order code (migration 0015). Matches a prefix of the
-- order id's text form; requires an exact single match or refuses
-- (this gates door entry, not a cosmetic lookup).
-- =============================================================
create or replace function find_order_by_code(p_code text)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
  v_count int;
  v_code text := lower(btrim(p_code));
begin
  if v_code is null or length(v_code) < 6 or length(v_code) > 8 then
    return null;
  end if;

  select count(*) into v_count
  from orders
  where id::text like v_code || '%';

  if v_count <> 1 then
    return null;
  end if;

  select * into v_order
  from orders
  where id::text like v_code || '%';

  return v_order;
end;
$$;

revoke execute on function find_order_by_code(text) from public, anon, authenticated;

-- =============================================================
-- Storage — public bucket for show posters, private bucket for
-- payment receipts. Uploads to `posters` happen via the service role
-- (bypasses RLS); the public only needs read access. `receipts` gets
-- NO bucket policy at all: under Supabase Storage's default-deny,
-- that means anon/authenticated have zero access and only the
-- service role (server-side) can read or write. The admin panel must
-- never link a receipt's public URL — it has none — only a
-- short-lived signed URL generated server-side per view.
-- =============================================================
insert into storage.buckets (id, name, public)
values ('posters', 'posters', true)
on conflict (id) do nothing;

drop policy if exists "public read posters" on storage.objects;
create policy "public read posters" on storage.objects
  for select using (bucket_id = 'posters');

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- =============================================================
-- Public Bs-preview views (migration 0006). Public pages need a Bs
-- figure next to every USD price before an order exists (no monto_bs
-- row to read yet) — these views compute a PER-UNIT Bs amount with
-- usd_to_bs() itself so no app code ever reimplements `usd * tasa`
-- client-side.
--
-- These are for single-row display only. Do NOT sum base_price_bs/
-- price_bs across multiple seats for a total: create_pending_order
-- computes monto_bs as usd_to_bs(sum(price), tasa) — round AFTER
-- summing — while summing price_bs would be round-per-item BEFORE
-- summing, which is a different number once several seats are
-- selected. Any multi-seat total must call
-- usd_to_bs(sum_of_usd_prices, tasa) directly (client-side via
-- supabase.rpc for the interactive seat picker, server-side for the
-- checkout page) — see migrations/0006_public_currency_previews.sql.
--
-- security_invoker makes each view run with the calling role's own
-- permissions, so the RLS policies on shows/seats above still apply
-- exactly as if querying the base tables directly — but that also
-- means anon/authenticated need an explicit SELECT grant on the
-- views themselves (security_invoker does not imply one).
-- =============================================================
create or replace view shows_public as
select s.*, usd_to_bs(s.base_price, s.tasa) as base_price_bs
from shows s;
alter view shows_public set (security_invoker = true);
grant select on shows_public to anon, authenticated;

create or replace view seats_public as
select st.*, usd_to_bs(st.price, sh.tasa) as price_bs
from seats st
join shows sh on sh.id = st.show_id;
alter view seats_public set (security_invoker = true);
grant select on seats_public to anon, authenticated;

-- usd_to_bs() is now called directly from the browser too (the seat
-- picker's live running total). Postgres grants EXECUTE on new
-- functions to PUBLIC by default, but that can be revoked
-- project-wide on a hardened setup, so grant it explicitly rather
-- than assume — the alternative is a function that works against a
-- fresh local database and silently 404s/403s in production.
grant execute on function usd_to_bs(numeric, numeric) to anon, authenticated;

-- =============================================================
-- Rate limiting (migration 0008). Fixed-window counter backed by
-- Postgres (this app runs serverless, so an in-memory counter
-- wouldn't persist across invocations) — no new dependency. RLS
-- enabled with no policies: only the SECURITY DEFINER function below
-- can touch this table, same pattern as the `receipts` bucket.
-- =============================================================
create table if not exists rate_limit_hits (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_hits_key_created_idx
  on rate_limit_hits (key, created_at);

alter table rate_limit_hits enable row level security;

-- Records a hit for p_key and returns false if that key already hit
-- p_max_count within the last p_window_seconds. Cleanup of old rows
-- is a separate, deterministic function (purge_rate_limit_hits,
-- migration 0009) called by the cron — not a side effect here.
create or replace function check_rate_limit(
  p_key text,
  p_max_count int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from rate_limit_hits
  where key = p_key
    and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max_count then
    return false;
  end if;

  insert into rate_limit_hits (key) values (p_key);
  return true;
end;
$$;

-- Explicit, deterministic cleanup for rate_limit_hits — called by the
-- same cron as release_expired_holds (see migration 0009), not left
-- to a probabilistic sweep inside check_rate_limit's hot path.
create or replace function purge_rate_limit_hits()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from rate_limit_hits where created_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- =============================================================
-- RPC lockdown (migrations 0012 + 0013). Every function above is
-- `security definer` with no internal caller check. Confirmed live
-- that verify_payment_atomic was callable with just the public anon
-- key, no session at all — Supabase provisions every project with
-- explicit default privileges granting anon/authenticated EXECUTE
-- directly on public-schema functions (separate from, and not
-- removed by, revoking from the PUBLIC pseudo-role — 0012 revoked
-- only PUBLIC and didn't actually close the hole; 0013 revokes from
-- anon/authenticated by name too). The app only ever calls these
-- through the service-role client (lib/supabase/admin.ts), which
-- keeps working regardless of these revokes, so this only removes a
-- direct-to-Supabase bypass of the app — it changes no app behavior.
-- =============================================================
revoke execute on function create_pending_order(uuid, uuid[], text, text, text, text, int) from public, anon, authenticated;
revoke execute on function create_pending_order_by_qty(uuid, int, text, text, text, text, int) from public, anon, authenticated;
revoke execute on function report_payment(uuid, text, text, text, text, numeric, date, text) from public, anon, authenticated;
revoke execute on function verify_payment_atomic(uuid, uuid) from public, anon, authenticated;
revoke execute on function reject_payment_atomic(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function reassign_order_seats(uuid, uuid[], text) from public, anon, authenticated;
revoke execute on function resolve_payment_reference_conflict(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function release_expired_holds() from public, anon, authenticated;
revoke execute on function purge_rate_limit_hits() from public, anon, authenticated;
revoke execute on function check_rate_limit(text, int, int) from public, anon, authenticated;
