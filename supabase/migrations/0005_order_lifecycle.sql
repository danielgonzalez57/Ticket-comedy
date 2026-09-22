-- =============================================================
-- 0005 — Order lifecycle: reported/verified/rejected, order-level
-- expiry, private receipts bucket, and splitting order creation
-- from payment reporting (Fase 1).
-- =============================================================

-- ---------- New columns -----------------------------------------
alter table orders add column if not exists expires_at timestamptz;
alter table orders add column if not exists reported_at timestamptz;
alter table orders add column if not exists verified_at timestamptz;
alter table orders add column if not exists verified_by uuid references auth.users(id) on delete set null;
alter table orders add column if not exists rejected_reason text;
alter table orders add column if not exists cedula text;
-- Object path within the `receipts` bucket (e.g. "<order_id>.jpg"),
-- NOT a URL. Signed URLs expire, so one is generated server-side
-- on demand from this path whenever the admin panel needs to show
-- the receipt — never stored.
alter table orders add column if not exists receipt_path text;

-- Existing 'held' seats already have hold_expires_at (per-seat) from
-- before this migration; mirror it onto the order so expiry logic
-- can key off orders.expires_at going forward without joining seats.
update orders o
   set expires_at = (
     select max(s.hold_expires_at) from seats s
      where s.held_by_order_id = o.id and s.status = 'held'
   )
 where o.status = 'pending' and o.expires_at is null;

-- ---------- Status: paid -> verified, widen the enum -------------
-- `paid` is renamed to `verified` (not kept alongside it) now that
-- `reported` sits between `pending` and it — an order can be
-- "reported" (customer says they paid) without being verified yet,
-- so keeping the old, narrower name would be misleading.
update orders set status = 'verified' where status = 'paid';

alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('pending', 'reported', 'verified', 'rejected', 'expired', 'cancelled'));

-- ---------- Private receipts bucket ------------------------------
-- Unlike `posters` (public, anyone can read), receipts are financial
-- documents: no bucket-level RLS policy is added at all, which under
-- Supabase Storage's default-deny means anon/authenticated get zero
-- access. Only the service role (used server-side, bypasses RLS)
-- can read or write. The admin panel must never link a receipt's
-- public URL — it has none — only a short-lived signed URL generated
-- server-side per view, from receipt_path (see lib/ once Fase 3
-- wires up the viewer).
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- ---------- release_expired_holds: also close out the order -------
-- Builds on the 0.2 fix (still whitelists status = 'pending'). Now
-- that 'expired' exists as a real status, a pending order whose
-- deadline passed and that no longer holds any seat is marked
-- expired too, instead of being left orphaned in 'pending' forever.
create or replace function release_expired_holds()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
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
  get diagnostics v_count = row_count;

  update orders o
     set status = 'expired'
   where o.status = 'pending'
     and o.expires_at is not null
     and o.expires_at < now()
     and not exists (
       select 1 from seats s
       where s.held_by_order_id = o.id and s.status = 'held'
     );

  return v_count;
end;
$$;

-- =============================================================
-- create_pending_order — simplified back to just reserving seats.
-- Payment/reference fields are no longer accepted here; reporting a
-- payment is report_payment()'s job, so checkout doesn't need to
-- know the reference before the customer has actually paid. Also now
-- snapshots the show's currency (tasa/tasa_fecha/monto_bs) onto the
-- order — see migration 0004. The FOR UPDATE lock, price calculation
-- and availability check are unchanged from Fase 0.1.
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

  -- Hold the seats, stamping which order now owns the hold.
  update seats
     set status = 'held',
         hold_expires_at = v_expires_at,
         held_by_order_id = v_order_id
   where id = any(p_seat_ids);

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

  return v_order;
end;
$$;

-- =============================================================
-- report_payment — moves pending -> reported. This is where the
-- (banco_emisor, payment_ref) collision handling now lives (moved
-- out of create_pending_order, per the split above): don't
-- hard-reject a colliding reference, accept it flagged for review
-- instead — see migrations/0003_payment_reference_integrity.sql for
-- the full rationale, which is unchanged, only relocated.
-- =============================================================
create or replace function report_payment(
  p_order_id uuid,
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
-- verify_payment_atomic — replaces confirm_payment_atomic (renamed
-- to match the 'verified' status). Accepts orders in 'pending' or
-- 'reported', but only lets a 'pending' order skip straight to
-- verified when its payment_method has no reconciliation step at all
-- (efectivo/zelle). A pago_movil/transferencia order must go through
-- report_payment first — letting it verify straight from 'pending'
-- would silently bypass the (banco_emisor, payment_ref) unique index
-- entirely, since that index (and the needs_review collision check)
-- only ever runs inside report_payment. The seat-loss / needs_review
-- logic is unchanged from Fase 0 (0001) and 0003.
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

  -- Lost = not mine AND not free.
  select string_agg(label, ', ' order by label)
    into v_lost_labels
  from seats
  where id = any(v_order.seat_ids)
    and held_by_order_id is distinct from p_order_id
    and status <> 'available';

  if v_lost_labels is not null then
    raise exception 'SEATS_LOST: %', v_lost_labels;
  end if;

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
-- reject_payment_atomic — new. Requires a reason (persisted, never
-- silently rejected), releases any seats this order still holds, and
-- records who acted and when in the same verified_at/verified_by
-- columns used by verify (they mean "who resolved this order", not
-- literally "who verified it").
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
-- show, instead of leaving it stuck in 'pending'/'reported' forever.
--
-- Price handling: the customer already transferred a fixed Bs amount
-- for the original seats. A cheaper replacement is allowed (the
-- difference is only recorded as an admin_note — there's no
-- credit-balance model to formally track it yet); a pricier one is
-- refused outright (PRICE_INCREASE) rather than silently under
-- billing. The new monto_bs is computed with usd_to_bs() using this
-- ORDER's own frozen tasa (v_order.tasa) — never the show's current
-- rate — for the same reason orders snapshot tasa in the first
-- place (see migration 0004).
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

drop function if exists confirm_payment_atomic(uuid);
