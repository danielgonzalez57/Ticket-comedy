-- =============================================================
-- 0017 — Explicit service_role grants (tables + RPC functions).
--
-- Older Supabase projects grant service_role blanket access to the
-- public schema automatically at provisioning time, so this was never
-- needed. Projects created with "Automatically expose new tables" off
-- don't get that for free — BYPASSRLS skips policies but not GRANT
-- checks, and the RPC lockdown in migrations 0012/0013 (revoking
-- EXECUTE from the PUBLIC pseudo-role) strips the only path
-- service_role otherwise had to those functions on such a project.
-- Without this, lib/supabase/admin.ts (createAdminClient) gets a bare
-- "permission denied" on every table and RPC call below. Grant
-- explicitly rather than depend on whatever a given project happened
-- to provision with.
-- =============================================================
grant usage on schema public to service_role;
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
