-- =============================================================
-- 0011 — Fix create_pending_order: FK violation on every call
--
-- create_pending_order updated seats.held_by_order_id = v_order_id
-- BEFORE inserting the orders row with that id. seats.held_by_order_id
-- references orders(id) with a plain (NOT DEFERRABLE, INITIALLY
-- IMMEDIATE) foreign key — see migrations/0001_seat_hold_ownership.sql
-- — so Postgres checks the reference right after the UPDATE statement
-- runs, while the orders row doesn't exist yet, and raises 23503.
-- This means the function has never actually been able to complete a
-- single call; only found by exercising the real RPC end-to-end
-- instead of reading the code. Fix: insert the order first (v_order_id
-- is already generated client-side via gen_random_uuid(), so the
-- insert doesn't depend on the seats update happening first), then
-- stamp the seats. No behavior change otherwise — the availability
-- check and FOR UPDATE lock still run before any mutation.
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
  -- referenced row must exist first.
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
