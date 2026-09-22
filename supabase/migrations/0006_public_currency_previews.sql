-- =============================================================
-- 0006 — Public Bs previews without client-side calculation (Fase 1
-- correction)
--
-- Before an order exists there's no monto_bs row to read, but public
-- pages (show listing, show detail, seat picker, pre-order checkout
-- summary) still need to show a Bs figure next to every USD price.
-- The previous implementation reimplemented usd_to_bs() in
-- TypeScript (bsFromUsd()) to compute that preview — exactly the
-- duplicated-rounding hazard called out in migration 0004: Postgres
-- numeric round() and JS floating-point math don't always agree
-- (e.g. (1.005).toFixed(2) === "1.00"), so a customer could see one
-- Bs figure while a different one gets stored the moment an order is
-- created, and payment_matches() would start flagging false
-- mismatches once Fase 3 wires it up.
--
-- Fix: two views recompute a PER-UNIT Bs amount with usd_to_bs()
-- itself, so PostgREST returns it as a plain selectable column and
-- no app code ever multiplies by a rate.
--
-- IMPORTANT — these views are for single-row display only
-- (show.base_price_bs, one seat's price_bs). Do NOT sum price_bs
-- across multiple seats to get a multi-seat total: create_pending_order
-- computes monto_bs as usd_to_bs(sum(price), tasa) — round AFTER
-- summing — while sum(price_bs) would be sum(round(price_i, tasa))
-- — round-per-item BEFORE summing. These two are not the same value
-- once rounding is involved (they can differ by a few cents once
-- several seats are selected), and the whole point of this migration
-- is that there is exactly one way to compute a Bs total, matching
-- what the order will actually store. Any multi-seat total (the
-- seat-picker's running total, the pre-order checkout summary) must
-- call usd_to_bs(sum_of_usd_prices, tasa) directly — client-side via
-- supabase.rpc('usd_to_bs', ...) for the interactive seat picker,
-- server-side for the checkout page — never by adding price_bs
-- values together. See components/seat-picker.tsx and
-- app/(public)/shows/[id]/checkout/page.tsx.
--
-- `security_invoker = true` makes each view run with the CALLING
-- role's own permissions rather than the view owner's, so the
-- existing RLS policies on shows/seats (anon can only read published
-- shows / their seats) still apply exactly as if querying the base
-- tables directly. That also means anon/authenticated need an
-- explicit SELECT grant on the views themselves — security_invoker
-- does not imply one, and the views wouldn't be reachable via
-- PostgREST otherwise.
-- =============================================================

create or replace view shows_public as
select s.*, usd_to_bs(s.base_price, s.tasa) as base_price_bs
from shows s;
alter view shows_public set (security_invoker = true);
grant select on shows_public to anon, authenticated;

create or replace view seats_public as
select st.*, usd_to_bs(st.price, sh.tasa) as price_bs
from seats st
join shows sh on sh.id = st.show_id;
alter view seats_public set (security_invoker = true);
grant select on seats_public to anon, authenticated;

-- usd_to_bs() itself is now called directly from the browser (the
-- seat picker's live running total — see comment above), not just
-- from server-side RPCs. Postgres grants EXECUTE on new functions to
-- PUBLIC by default, but that default can be (and on some hardened
-- setups is) revoked project-wide, so grant it explicitly rather
-- than rely on an assumption that would fail silently in production
-- while working in a fresh local dev database.
grant execute on function usd_to_bs(numeric, numeric) to anon, authenticated;
