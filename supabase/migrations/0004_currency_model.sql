-- =============================================================
-- 0004 — Currency model (Fase 1)
--
-- Prices are defined in USD; the exchange rate is fixed when a show
-- is created and stays fixed for the life of that show's sales.
-- Every order snapshots the rate (and the resulting Bs amount) at
-- the moment it's created — never re-read from the show later, in
-- render or in verification — so that if an admin edits a show's
-- rate while it has open (pending/reported) orders, those orders
-- keep the amount the customer actually transferred against.
--
-- Rounding: USD -> Bs conversion happens in exactly one place,
-- usd_to_bs(), using round-half-up to 2 decimals (Postgres's numeric
-- round() already rounds positive values half-away-from-zero, i.e.
-- half-up for currency amounts, which are always positive here).
-- This is not just an implementation detail: NO OTHER LAYER may
-- reimplement this conversion, including a client-side "preview"
-- before an order exists (Postgres numeric round() and JS floating
-- point round differently — e.g. (1.005).toFixed(2) === "1.00").
-- Any Bs amount shown anywhere — before or after an order exists —
-- must come from calling this function or reading a column it
-- already populated, never from `usd * tasa` computed in TypeScript.
-- See migration 0006 for how public pages get a pre-order preview
-- without violating this.
-- =============================================================

create or replace function usd_to_bs(p_usd numeric, p_tasa numeric)
returns numeric(14,2)
language sql
immutable
as $$
  select round(p_usd * p_tasa, 2)
$$;

-- Tolerance for comparing a customer-reported Bs amount against the
-- order's own monto_bs. A few cents of slack absorbs display/rounding
-- noise (e.g. the bank app truncating instead of rounding) without
-- opening the door to real mismatches. Not yet called from anywhere —
-- Fase 3 wires this into the admin panel's mismatch highlight.
create or replace function payment_matches(p_reportado numeric, p_esperado numeric)
returns boolean
language sql
immutable
as $$
  select p_reportado is not null
    and p_esperado is not null
    and abs(p_reportado - p_esperado) <= 0.02
$$;

-- ---------- shows.tasa -----------------------------------------
-- Added nullable + backfilled + then set NOT NULL, rather than
-- NOT NULL DEFAULT <value>, on purpose: a permanent default would
-- let a future INSERT silently create a show with a nonsense rate
-- if the app ever forgot to pass one. After this migration, creating
-- a show without an explicit tasa fails loudly instead.
--
-- Existing shows (seed data or anything created before this
-- migration) get a placeholder tasa = 1 — there is no historical
-- rate to recover. A placeholder rate must never be sellable: any
-- show that was 'published' gets forced back to 'draft' in the same
-- statement, and shows_no_placeholder_tasa_when_published below makes
-- it a hard DB error to publish (or re-publish) a show while
-- tasa <= 1, from any code path — not just the admin form.
alter table shows add column if not exists tasa numeric(12,4);
alter table shows add column if not exists tasa_fecha timestamptz;
update shows
   set tasa = 1,
       tasa_fecha = now(),
       status = case when status = 'published' then 'draft' else status end
 where tasa is null;
alter table shows alter column tasa set not null;
alter table shows alter column tasa_fecha set not null;

alter table shows drop constraint if exists shows_no_placeholder_tasa_when_published;
alter table shows add constraint shows_no_placeholder_tasa_when_published
  check (status <> 'published' or tasa > 1);

-- ---------- orders currency snapshot -----------------------------
-- `total` is renamed to `total_usd` (not `precio_usd` — that read as
-- a per-seat unit price, which is what shows.base_price/seats.price
-- already mean; this is the order's sum, same as `total` was).
alter table orders rename column total to total_usd;

alter table orders add column if not exists tasa numeric(12,4);
alter table orders add column if not exists tasa_fecha timestamptz;
alter table orders add column if not exists monto_bs numeric(14,2);

-- Backfill existing orders the same way as shows: tasa = 1 is a
-- placeholder with no historical meaning. These are all pre-existing
-- (seed or otherwise pre-migration) orders; genuinely open legacy
-- orders would need their tasa corrected by hand for monto_bs to be
-- meaningful — see the shows.tasa comment above for the same caveat.
update orders
   set tasa = 1,
       tasa_fecha = now(),
       monto_bs = usd_to_bs(total_usd, 1)
 where tasa is null;

alter table orders alter column tasa set not null;
alter table orders alter column tasa_fecha set not null;
alter table orders alter column monto_bs set not null;
