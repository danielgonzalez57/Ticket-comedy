-- =============================================================
-- 0020 — Customers can buy up to 10 tickets per order (was 4).
--
-- Must match MAX_SEATS_PER_ORDER in lib/constants.ts. The error code
-- is renamed MAX_4_SEATS -> MAX_SEATS since the number is no longer
-- part of it.
--
-- create_pending_order_by_qty is the same as 0018 and
-- reassign_order_seats the same as 0005, except for the limit.
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
  if p_quantity > 10 then
    raise exception 'MAX_SEATS';
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
  if v_requested > 10 then
    raise exception 'MAX_SEATS';
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

-- create or replace keeps the existing grants (0012/0013/0017); these
-- are repeated so the lockdown doesn't depend on that.
revoke execute on function create_pending_order_by_qty(uuid, int, text, text, text, text, int) from public, anon, authenticated;
revoke execute on function reassign_order_seats(uuid, uuid[], text) from public, anon, authenticated;
grant execute on function create_pending_order_by_qty(uuid, int, text, text, text, text, int) to service_role;
grant execute on function reassign_order_seats(uuid, uuid[], text) to service_role;
