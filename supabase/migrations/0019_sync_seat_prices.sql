-- =============================================================
-- 0019 — Changing a show's price also changes its seats' price.
--
-- The checkout shows (and charges) shows.base_price, but
-- create_pending_order_by_qty computes the order total from
-- sum(seats.price). Seats get their price once, when the show is
-- created, and editing the show only updated shows.base_price — so
-- after a price change (10 -> 7) customers paid the new price while
-- their orders kept asking for the old one, and the admin panel
-- flagged every payment as "el monto no coincide".
--
-- Sold seats keep the price they were sold at.
-- =============================================================
create or replace function sync_seat_prices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update seats
     set price = new.base_price
   where show_id = new.id
     and status <> 'sold';
  return new;
end;
$$;

revoke execute on function sync_seat_prices() from public, anon, authenticated;

drop trigger if exists shows_sync_seat_prices on shows;
create trigger shows_sync_seat_prices
  after update of base_price on shows
  for each row
  when (old.base_price is distinct from new.base_price)
  execute function sync_seat_prices();

-- Backfill: seats of shows whose price was already edited.
update seats s
   set price = sh.base_price
  from shows sh
 where s.show_id = sh.id
   and s.status <> 'sold'
   and s.price <> sh.base_price;

-- Open orders created at the stale seat price: reprice them to what
-- the checkout showed, at the order's own tasa. Skipped when the
-- customer already reported a Bs amount that doesn't match the new
-- price (e.g. someone who reserved and paid before the change).
update orders o
   set total_usd = cardinality(o.seat_ids) * sh.base_price,
       monto_bs = usd_to_bs(cardinality(o.seat_ids) * sh.base_price, o.tasa),
       admin_note = concat_ws(E'\n', nullif(o.admin_note, ''),
         'Precio corregido al del show (USD ' || o.total_usd || ' -> '
         || cardinality(o.seat_ids) * sh.base_price || ')')
  from shows sh
 where o.show_id = sh.id
   and o.status in ('pending', 'reported')
   and o.total_usd <> cardinality(o.seat_ids) * sh.base_price
   and (
     o.monto_reportado is null
     or payment_matches(
          o.monto_reportado,
          usd_to_bs(cardinality(o.seat_ids) * sh.base_price, o.tasa)
        )
   );
