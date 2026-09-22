-- =============================================================
-- 0012 — Lock down admin RPCs + stop treating "authenticated" as
-- "admin" (Fase: cuentas de cliente)
--
-- Found while wiring up customer magic-link login:
--
-- 1. Every sensitive RPC (verify_payment_atomic, reject_payment_atomic,
--    reassign_order_seats, resolve_payment_reference_conflict,
--    release_expired_holds, purge_rate_limit_hits, check_rate_limit,
--    create_pending_order, report_payment) is `security definer` with
--    no internal caller check, and Postgres grants EXECUTE on new
--    functions to PUBLIC by default. Confirmed live: calling
--    verify_payment_atomic with only the public anon key (no session
--    at all) succeeds. The app itself only ever calls these through
--    the service-role client (grep app/ for ".rpc(" — every call site
--    is lib/supabase/admin.ts), so revoking PUBLIC access breaks
--    nothing and closes a direct-to-Supabase bypass of the whole app.
--
-- 2. "admin all shows/seats/orders" policies are `to authenticated
--    using (true)` — correct only as long as the only rows in
--    auth.users are admins, which was true because there was no
--    customer login. Adding one breaks that assumption immediately:
--    the first customer to log in via magic link would get full
--    read/write on every order (every other customer's name, email,
--    cedula, payment reference) plus shows/seats, via the Supabase
--    REST API directly. Fixed by introducing a real admin_users
--    allowlist and an is_admin() check, backfilled with the one
--    existing account (today's only auth.users row, the admin).
-- =============================================================

revoke execute on function create_pending_order(uuid, uuid[], text, text, text, text, int) from public;
revoke execute on function report_payment(uuid, text, text, text, text, numeric, date, text) from public;
revoke execute on function verify_payment_atomic(uuid, uuid) from public;
revoke execute on function reject_payment_atomic(uuid, uuid, text) from public;
revoke execute on function reassign_order_seats(uuid, uuid[], text) from public;
revoke execute on function resolve_payment_reference_conflict(uuid, boolean, text) from public;
revoke execute on function release_expired_holds() from public;
revoke execute on function purge_rate_limit_hits() from public;
revoke execute on function check_rate_limit(text, int, int) from public;

-- service_role already has implicit full access to every function in
-- this schema via Supabase's default privileges — it needs no grant
-- here, and it's the only role the app ever uses to call these.

-- =============================================================
-- admin_users — the real admin allowlist. Locked down: nobody but
-- service_role can read or write it directly (no policy grants
-- anon/authenticated anything), so membership is only ever checked
-- through is_admin(), never queried directly by a client.
-- =============================================================
create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table admin_users enable row level security;

insert into admin_users (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;
grant execute on function is_admin() to authenticated;

drop policy if exists "admin all shows" on shows;
create policy "admin all shows" on shows
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "admin all seats" on seats;
create policy "admin all seats" on seats
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "admin all orders" on orders;
create policy "admin all orders" on orders
  for all to authenticated using (is_admin()) with check (is_admin());

-- A logged-in customer (not an admin) can read only their own orders,
-- matched by the email on their Supabase Auth session — never a
-- write, and never anyone else's row.
drop policy if exists "customer read own orders" on orders;
create policy "customer read own orders" on orders
  for select to authenticated
  using (lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- "Mis entradas" needs to keep showing past shows after they're
-- marked 'finished' (no longer covered by "public read published
-- shows"), and seat labels for those orders. Both scoped strictly to
-- shows/seats the customer actually has an order for — this does not
-- widen what a customer can see beyond their own purchase history.
drop policy if exists "customer read shows of own orders" on shows;
create policy "customer read shows of own orders" on shows
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.show_id = shows.id
        and lower(o.customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "customer read seats of own orders" on seats;
create policy "customer read seats of own orders" on seats
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = seats.held_by_order_id
        and lower(o.customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
