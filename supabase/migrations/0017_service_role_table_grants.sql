-- =============================================================
-- 0017 — Explicit service_role table grants.
--
-- Older Supabase projects grant service_role blanket access to the
-- public schema automatically at provisioning time, so this was never
-- needed. Projects created with "Automatically expose new tables" off
-- don't get that for free — BYPASSRLS skips policies but not GRANT
-- checks, so lib/supabase/admin.ts (createAdminClient) gets a bare
-- "permission denied for table X" without this. Grant it explicitly
-- rather than depend on whatever a given project happened to
-- provision with.
-- =============================================================
grant usage on schema public to service_role;
grant all on shows, seats, orders, admin_users, rate_limit_hits to service_role;
grant select on shows_public, seats_public to service_role;
