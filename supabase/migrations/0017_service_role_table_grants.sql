-- =============================================================
-- 0017 — Explicit table/RPC grants for anon, authenticated and
-- service_role.
--
-- Older Supabase projects — and any project created with
-- "Automatically expose new tables" left ON — grant
-- anon/authenticated/service_role blanket access to the public schema
-- automatically at provisioning time, so none of this was ever needed
-- by hand: every RLS policy in this schema was written assuming the
-- GRANT layer is wide open and RLS is the only real gate (the
-- standard Supabase model). A project created with that option OFF
-- does not get any of it for free — BYPASSRLS skips policies but not
-- GRANT checks, and the RPC lockdown in migrations 0012/0013 (revoking
-- EXECUTE from the PUBLIC pseudo-role) strips the only path
-- service_role otherwise had to those functions. Without this:
-- anon/authenticated get a bare "permission denied for table shows"
-- on the public site itself (shows_public is security_invoker, so it
-- re-checks grants on the base table as the calling role), and
-- lib/supabase/admin.ts (createAdminClient) gets the same on every
-- table/RPC call below. Grant explicitly rather than depend on
-- whatever a given project happened to provision with — RLS still
-- does the actual per-row enforcement.
-- =============================================================
grant usage on schema public to anon, authenticated, service_role;
grant select on shows, seats to anon;
grant select, insert, update, delete on shows, seats, orders to authenticated;
grant all on shows, seats, orders, admin_users, rate_limit_hits to service_role;
grant select on shows_public, seats_public to service_role;
grant execute on function create_pending_order(uuid, uuid[], text, text, text, text, int) to service_role;
grant execute on function create_pending_order_by_qty(uuid, int, text, text, text, text, int) to service_role;
grant execute on function report_payment(uuid, text, text, text, text, numeric, date, text) to service_role;
grant execute on function verify_payment_atomic(uuid, uuid) to service_role;
grant execute on function reject_payment_atomic(uuid, uuid, text) to service_role;
grant execute on function reassign_order_seats(uuid, uuid[], text) to service_role;
grant execute on function resolve_payment_reference_conflict(uuid, boolean, text) to service_role;
grant execute on function release_expired_holds() to service_role;
grant execute on function purge_rate_limit_hits() to service_role;
grant execute on function check_rate_limit(text, int, int) to service_role;
grant execute on function find_order_by_code(text) to service_role;
