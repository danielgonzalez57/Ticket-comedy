-- =============================================================
-- 0013 — Fix 0012: revoke didn't actually take effect
--
-- Verified live after applying 0012: anon.rpc('verify_payment_atomic',
-- ...) still succeeded. Root cause: 0012 only did
-- `revoke execute ... from public`, but Supabase provisions every new
-- project with explicit default privileges granting anon,
-- authenticated and service_role EXECUTE directly on functions in the
-- public schema (not just inherited through the PUBLIC pseudo-role).
-- Revoking from PUBLIC alone leaves those direct per-role grants
-- untouched. Fixed by revoking from anon and authenticated by name
-- too. service_role is left alone — the app's own calls all go
-- through it (lib/supabase/admin.ts) and it needs to keep working.
-- =============================================================
revoke execute on function create_pending_order(uuid, uuid[], text, text, text, text, int) from anon, authenticated;
revoke execute on function report_payment(uuid, text, text, text, text, numeric, date, text) from anon, authenticated;
revoke execute on function verify_payment_atomic(uuid, uuid) from anon, authenticated;
revoke execute on function reject_payment_atomic(uuid, uuid, text) from anon, authenticated;
revoke execute on function reassign_order_seats(uuid, uuid[], text) from anon, authenticated;
revoke execute on function resolve_payment_reference_conflict(uuid, boolean, text) from anon, authenticated;
revoke execute on function release_expired_holds() from anon, authenticated;
revoke execute on function purge_rate_limit_hits() from anon, authenticated;
revoke execute on function check_rate_limit(text, int, int) from anon, authenticated;
