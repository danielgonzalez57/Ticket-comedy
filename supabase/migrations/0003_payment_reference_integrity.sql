-- =============================================================
-- 0003 — Payment reference integrity (Fase 0, bug 0.3)
--
-- A 4-digit reference is not enough entropy to deduplicate Pago
-- Móvil transfers: with only 10,000 possible values, the birthday
-- bound puts a 50% collision chance around ~120 orders — well
-- inside a single show's sales. A UNIQUE(banco_emisor, payment_ref)
-- built on that field would start rejecting legitimate payments
-- almost immediately.
--
-- Fix: capture the last 6-8 digits of the reference plus the issuing
-- bank, and make (banco_emisor, payment_ref) unique among "live"
-- orders. Note this is NOT unique on (..., monto_reportado,
-- fecha_pago) — an earlier draft of this migration included those,
-- reasoning that bank+ref+amount+date together identify a
-- transaction. That reasoning only held when the reference was 4
-- digits and needed help disambiguating. With 6-8 digits the
-- reference alone is the bank's own identifier for the transaction,
-- and monto_reportado / fecha_pago are customer-entered free text:
-- including them in the unique tuple would let anyone reuse an
-- already-claimed reference just by fat-fingering the amount by a
-- cent, defeating the whole point of this migration.
--
-- A same (banco_emisor, payment_ref) collision is not necessarily
-- fraud, though — bank references can legitimately coincide by the
-- bank's own error, or a customer can mistype someone else's
-- reference. So a collision does not hard-reject the second order;
-- it is accepted with needs_review = true and needs_review_of
-- pointing at the order it collided with, so an admin resolves the
-- ambiguity by hand before either one is confirmed paid. The partial
-- unique index excludes needs_review rows, since two flagged orders
-- are expected to (temporarily) share a reference.
-- =============================================================

alter table orders
  add column if not exists banco_emisor text,
  add column if not exists monto_reportado numeric(12,2),
  add column if not exists fecha_pago date,
  add column if not exists needs_review boolean not null default false,
  add column if not exists needs_review_of uuid references orders(id);

-- Added NOT VALID: this applies the check to every new INSERT/UPDATE
-- immediately without scanning (or failing the migration over)
-- existing rows. If you know this environment has no legacy 4-digit
-- payment_ref values (e.g. a fresh database), you can additionally
-- run, once, outside of this file:
--   alter table orders validate constraint orders_payment_ref_format;
-- If legacy 4-digit references DO exist, decide deliberately what to
-- do with them first — a 4-digit value can't be machine-upgraded to
-- 6-8 digits, since the missing digits were never captured. One
-- reviewed-by-hand option that preserves the original value for
-- audit purposes while satisfying the new constraint:
--   update orders
--      set admin_note = coalesce(admin_note || E'\n', '')
--            || 'ref. legacy (4 díg.): ' || payment_ref,
--          payment_ref = null
--    where payment_ref is not null
--      and payment_ref !~ '^[0-9]{6,8}$';
alter table orders
  drop constraint if exists orders_payment_ref_format;
alter table orders
  add constraint orders_payment_ref_format
  check (payment_ref is null or payment_ref ~ '^[0-9]{6,8}$')
  not valid;

-- Partial unique index: only orders that are still a live, undisputed
-- claim on a bank reference need to be unique on it. Excluded:
--   - cancelled / rejected / expired orders (dead, reference is free)
--   - needs_review orders (already known to share a reference with
--     another live order; forcing uniqueness here would just move
--     the exception-handling in create_pending_order into a retry
--     loop instead of a single clean insert)
--
-- CAUTION when applying to a database that already has order data:
-- CREATE UNIQUE INDEX has no NOT VALID equivalent — if two live,
-- non-needs_review orders already share (banco_emisor, payment_ref),
-- this statement fails outright. Check first with:
--   select banco_emisor, payment_ref, count(*)
--     from orders
--    where payment_ref is not null
--      and needs_review = false
--      and status not in ('cancelled', 'rejected', 'expired')
--    group by 1, 2 having count(*) > 1;
-- and resolve any hits (e.g. flip the extras to needs_review = true
-- with needs_review_of pointing at the one you keep) before retrying.
drop index if exists orders_payment_ref_unique_idx;
create unique index orders_payment_ref_unique_idx
  on orders (banco_emisor, payment_ref)
  where payment_ref is not null
    and needs_review = false
    and status not in ('cancelled', 'rejected', 'expired');

-- =============================================================
-- create_pending_order — now accepts the reconciliation fields and
-- no longer hard-rejects a reference collision. It attempts the
-- normal insert; if the unique index above rejects it (someone else
-- holds a live, non-reviewed order with the same bank + reference),
-- it looks up that order and inserts this one flagged for review
-- instead of failing the checkout. The FOR UPDATE lock, price
-- calculation and availability check are unchanged from Fase 0.1.
-- =============================================================
create or replace function create_pending_order(
  p_show_id uuid,
  p_seat_ids uuid[],
  p_name text,
  p_email text,
  p_phone text,
  p_payment_method text,
  p_payment_ref text,
  p_hold_minutes int default 20,
  p_banco_emisor text default null,
  p_monto_reportado numeric default null,
  p_fecha_pago date default null
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
  v_conflict_id uuid;
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
  begin
    insert into orders (
      id, show_id, customer_name, customer_email, customer_phone,
      seat_ids, total, payment_method, payment_ref, status,
      banco_emisor, monto_reportado, fecha_pago
    ) values (
      v_order_id, p_show_id, p_name, p_email, p_phone,
      p_seat_ids, v_total, p_payment_method, p_payment_ref, 'pending',
      p_banco_emisor, p_monto_reportado, p_fecha_pago
    )
    returning * into v_order;
  exception when unique_violation then
    -- Another live order already claims this bank + reference. Don't
    -- hard-reject (the collision could be a legitimate bank mixup,
    -- not fraud) — accept this order too, flagged for manual review,
    -- pointing at the order it collides with.
    select id into v_conflict_id
    from orders
    where banco_emisor = p_banco_emisor
      and payment_ref = p_payment_ref
      and needs_review = false
      and status not in ('cancelled', 'rejected', 'expired')
    limit 1;

    insert into orders (
      id, show_id, customer_name, customer_email, customer_phone,
      seat_ids, total, payment_method, payment_ref, status,
      banco_emisor, monto_reportado, fecha_pago,
      needs_review, needs_review_of
    ) values (
      v_order_id, p_show_id, p_name, p_email, p_phone,
      p_seat_ids, v_total, p_payment_method, p_payment_ref, 'pending',
      p_banco_emisor, p_monto_reportado, p_fecha_pago,
      true, v_conflict_id
    )
    returning * into v_order;
  end;

  return v_order;
end;
$$;

-- =============================================================
-- confirm_payment_atomic — redefined to also refuse to confirm an
-- order that is still needs_review. Without this guard an admin
-- could click "Confirmar pago" on a flagged order before anyone
-- worked out which of the two colliding orders actually made the
-- bank transfer — exactly the mistake the flag exists to prevent.
-- The seat-loss logic (0.1) is unchanged from migration 0001.
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
     set status = 'paid'
   where id = p_order_id
   returning * into v_order;

  return v_order;
end;
$$;

-- =============================================================
-- resolve_payment_reference_conflict — the only supported way to
-- clear needs_review. It always operates on the flagged (duplicate)
-- side of a collision and always leaves the (banco_emisor,
-- payment_ref) tuple held by at most one live, non-flagged order —
-- so it can never itself trigger the unique_violation it exists to
-- avoid surfacing to the admin as a raw Postgres error:
--
--   p_keep_this = true  → this order's claim was correct; the order
--     it collided with (needs_review_of) has its own payment_ref
--     cleared instead (not cancelled — its seats/customer/total are
--     still valid, only its claim to *this* reference was wrong).
--   p_keep_this = false → this order's own claim was the mistake
--     (typo, wrong reference); its payment_ref is cleared and the
--     order it collided with is untouched.
--
-- Either way the customer will need to be asked to re-report the
-- correct reference if their order still needs one — that flow
-- lands with reportPayment in Fase 1/2.
--
-- Edge case: if three or more orders end up sharing one reference
-- (each pointing needs_review_of at the same original) and two of
-- them are resolved with p_keep_this = true concurrently, the second
-- one to commit would otherwise hit the same unique_violation this
-- function is meant to avoid. It's caught and turned into "stay
-- flagged, re-point at whoever won" instead of a raw error.
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
