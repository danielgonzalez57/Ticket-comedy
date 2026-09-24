-- =============================================================
-- 0017 — Separate banner image for the show detail page.
--
-- poster_url stays the medium card image on the home/cartelera;
-- banner_url is the wide image at the top of /shows/[id] (falls back
-- to poster_url when a show has no banner).
--
-- shows_public is `select s.*, ...`, and Postgres expands `*` when a
-- view is created — the new column only shows up in the view once it
-- is recreated. `create or replace` can't insert a column before
-- base_price_bs, so drop and create it again (same definition,
-- options and grants as 0006).
-- =============================================================
alter table shows add column if not exists banner_url text;

drop view if exists shows_public;
create view shows_public as
select s.*, usd_to_bs(s.base_price, s.tasa) as base_price_bs
from shows s;
alter view shows_public set (security_invoker = true);
grant select on shows_public to anon, authenticated;
