-- =============================================================
-- 0021 — Per-show "La entrada incluye una birra" flag.
--
-- The perk line on the show card used to be hard-coded for every
-- show; now the admin ticks it per show. Off by default, so existing
-- shows stop advertising it until someone turns it back on.
--
-- shows_public is `select s.*, ...` and needs recreating to pick up
-- the new column — same drop/create as 0017.
-- =============================================================
alter table shows
  add column if not exists includes_beer boolean not null default false;

drop view if exists shows_public;
create view shows_public as
select s.*, usd_to_bs(s.base_price, s.tasa) as base_price_bs
from shows s;
alter view shows_public set (security_invoker = true);
grant select on shows_public to anon, authenticated;
grant select on shows_public to service_role;
