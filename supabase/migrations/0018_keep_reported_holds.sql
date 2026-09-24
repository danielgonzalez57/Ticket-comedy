-- =============================================================
-- 0018 — Don't resell the seats of an order whose payment was
-- already reported.
--
-- Checkout now reports the payment in the same submit (0016), so
-- almost every order sits in 'reported' until the admin confirms it.
-- Its seats stay 'held' with the original 20-minute hold_expires_at,
-- and create_pending_order_by_qty (0014) treated any expired hold as
-- free — so if the admin took more than 20 minutes to confirm, the
-- next buyer got those seats and the customer who had already paid
-- ended up with SEATS_LOST. release_expired_holds already skipped
-- reported orders (0002/0005); this makes the checkout agree with it.
--
-- Same function as 0014 except for the seat filter.
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

  -- Claim the next p_quantity sellable seats, in arrival order
  -- (row/col), skipping whatever a concurrent buyer already locked.
  select array_agg(id order by row_index, col_index), coalesce(sum(price), 0)
    into v_seat_ids, v_total_usd
  from (
    select id, row_index, col_index, price
    from seats
    where show_id = p_show_id
      and status <> 'sold'
      and status <> 'disabled'
      and (
        status <> 'held'
        or (
          (hold_expires_at is null or hold_expires_at < now())
          and not exists (
            select 1 from orders o
            where o.id = seats.held_by_order_id
              and o.status = 'reported'
          )
        )
      )
    order by row_index, col_index
    limit p_quantity
    for update skip locked
  ) t;

  if v_seat_ids is null or array_length(v_seat_ids, 1) < p_quantity then
    raise exception 'SOLD_OUT';
  end if;

  v_expires_at := now() + make_interval(mins => p_hold_minutes);

  -- Insert the order BEFORE stamping seats.held_by_order_id, same
  -- ordering requirement as create_pending_order (see
  -- migrations/0011_fix_create_pending_order_fk_order.sql).
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

-- Same lockdown as every other order-mutating RPC (migrations 0012 +
-- 0013): only the service-role client (lib/supabase/admin.ts) calls
-- this, never anon/authenticated directly.
revoke execute on function create_pending_order_by_qty(uuid, int, text, text, text, text, int) from public, anon, authenticated;
