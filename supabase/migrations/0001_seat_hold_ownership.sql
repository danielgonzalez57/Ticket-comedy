-- =============================================================
-- 0001 — Seat hold ownership (Fase 0, bug 0.1)
--
-- confirmPayment marked an order's seats "sold" without checking
-- that they were still held BY THAT ORDER. Holds are released
-- lazily, so a customer who reports payment late could have their
-- seats re-held/sold to someone else in the meantime; the admin
-- confirming the stale order would then silently double-sell them.
--
-- Fix: seats now record *which* order currently holds them
-- (held_by_order_id). confirm_payment_atomic() locks the order and
-- its seats and refuses to sell any seat that isn't still held by
-- that same order, raising 'SEATS_LOST: <labels>' instead.
--
-- The FOR UPDATE lock, the server-side price calculation and the
-- availability check inside create_pending_order are untouched —
-- this migration only adds the extra column assignment needed to
-- stamp seats with their owning order.
-- =============================================================

alter table seats
  add column if not exists held_by_order_id uuid references orders(id) on delete set null;

create index if not exists seats_held_by_order_id_idx on seats(held_by_order_id);

-- Backfill: any seats/orders written before this migration — via the
-- seed script (scripts/seed.mjs inserts orders/seats directly, not
-- through create_pending_order) or any other pre-existing data —
-- predate this column and would otherwise have held_by_order_id
-- null. That matters for two reasons: (1) confirm_payment_atomic
-- would treat a legitimately-held seat as lost, and (2) once
-- migration 0002 ships, release_expired_holds() treats a null
-- held_by_order_id as "no owner, safe to free", which would release
-- these seats' holds on its very first run even though their orders
-- are still legitimately pending. This UPDATE is a no-op on a fresh
-- database with no rows yet, and idempotent on rerun (it only
-- touches rows where held_by_order_id is still null).
update seats s
   set held_by_order_id = o.id
  from orders o
 where s.id = any(o.seat_ids)
   and s.held_by_order_id is null
   and (
     (s.status = 'held' and o.status = 'pending')
     or (s.status = 'sold' and o.status = 'paid')
   );

create or replace function create_pending_order(
  p_show_id uuid,
  p_seat_ids uuid[],
  p_name text,
  p_email text,
  p_phone text,
  p_payment_method text,
  p_payment_ref text,
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
  v_total numeric(10,2);
  v_sellable int;
  v_requested int;
begin
  v_requested := (select count(distinct x) from unnest(p_seat_ids) x);

  if v_requested is null or v_requested < 1 then
    raise exception 'NO_SEATS';
  end if;
  if v_requested > 4 then
    raise exception 'MAX_4_SEATS';
  end if;

  if not exists (select 1 from shows where id = p_show_id and status = 'published') then
    raise exception 'SHOW_NOT_AVAILABLE';
  end if;

  -- Lock the requested seat rows to avoid races.
  perform 1 from seats where id = any(p_seat_ids) for update;

  -- A seat is sellable if it belongs to the show and is available
  -- or an expired hold.
  select count(*), coalesce(sum(price), 0)
    into v_sellable, v_total
  from seats
  where id = any(p_seat_ids)
    and show_id = p_show_id
    and status <> 'sold'
    and status <> 'disabled'
    and (status <> 'held' or hold_expires_at is null or hold_expires_at < now());

  if v_sellable <> v_requested then
    raise exception 'SEAT_UNAVAILABLE';
  end if;

  -- Hold the seats, stamping which order now owns the hold.
  update seats
     set status = 'held',
         hold_expires_at = now() + make_interval(mins => p_hold_minutes),
         held_by_order_id = v_order_id
   where id = any(p_seat_ids);

  -- Create the pending order with a pre-generated id so it matches
  -- the held_by_order_id stamped above.
  insert into orders (
    id, show_id, customer_name, customer_email, customer_phone,
    seat_ids, total, payment_method, payment_ref, status
  ) values (
    v_order_id, p_show_id, p_name, p_email, p_phone,
    p_seat_ids, v_total, p_payment_method, p_payment_ref, 'pending'
  )
  returning * into v_order;

  return v_order;
end;
$$;

-- =============================================================
-- confirm_payment_atomic — the only supported way to mark an order
-- paid. Locks the order and its seats and classifies each seat into
-- exactly one of three states:
--   1. held by (or already sold as part of) this exact order → fine.
--   2. status = 'available' (nobody's claim on it right now — either
--      never held, or its hold expired and was released, lazily or
--      by the cron) → fine, this order reclaims it. A hold expiring
--      does NOT mean this order loses the seat; it only means the
--      seat became free for anyone to take, and in this case nobody
--      did.
--   3. held by or sold to a *different* order, or disabled → this is
--      the only real conflict. Only seats in this bucket go into the
--      'SEATS_LOST: <labels>' error.
-- Only then does it flip the qualifying seats to 'sold' and the
-- order to 'paid'.
-- =============================================================
create or replace function confirm_payment_atomic(p_order_id uuid)
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

  if v_order.status = 'cancelled' then
    raise exception 'ORDER_CANCELLED';
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
     set status = 'paid'
   where id = p_order_id
   returning * into v_order;

  return v_order;
end;
$$;
