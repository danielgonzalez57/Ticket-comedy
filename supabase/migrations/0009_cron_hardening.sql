-- =============================================================
-- 0009 — Cron hardening (Fase 2 correction)
--
-- release_expired_holds() already released holds AND expired their
-- 'pending' orders atomically, in one function/transaction, since
-- migration 0005 — reported orders were (and still are) never
-- touched regardless of expires_at. That part was already correct.
--
-- The actual gap: the function only ever returned the seats-released
-- count via a plain `returns int`, so the orders-expired count was
-- computed and used internally but silently discarded — the cron
-- endpoint had no way to report it. Redefined with OUT parameters so
-- PostgREST returns both as a single JSON object
-- ({ seats_released, orders_expired }) instead of a bare number.
--
-- CREATE OR REPLACE cannot change a function's return type (plain
-- int -> a record via OUT params), so the old one has to be dropped
-- first — this isn't specific to any one database, it happens on any
-- environment that already has the "returns int" version from
-- migrations 0001/0002/0005 (or the very first schema.sql).
-- =============================================================
drop function if exists release_expired_holds();

create or replace function release_expired_holds(
  out seats_released int,
  out orders_expired int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update seats s
     set status = 'available', hold_expires_at = null, held_by_order_id = null
   where s.status = 'held'
     and s.hold_expires_at is not null
     and s.hold_expires_at < now()
     and (
       s.held_by_order_id is null
       or exists (
         select 1 from orders o
         where o.id = s.held_by_order_id
           and o.status = 'pending'
       )
     );
  get diagnostics seats_released = row_count;

  -- Only 'pending' orders ever expire by time — a 'reported' order
  -- (customer already transferred, awaiting verification) is never
  -- expired here no matter how old its expires_at is. This is the
  -- exact seats-released query's own 'pending' guard, kept in sync in
  -- the same statement/transaction: an order can't end up 'expired'
  -- while it still holds a seat, or have its seat freed while it's
  -- left dangling in 'pending' forever.
  update orders o
     set status = 'expired'
   where o.status = 'pending'
     and o.expires_at is not null
     and o.expires_at < now()
     and not exists (
       select 1 from seats s
       where s.held_by_order_id = o.id and s.status = 'held'
     );
  get diagnostics orders_expired = row_count;
end;
$$;

-- =============================================================
-- purge_rate_limit_hits — explicit, deterministic cleanup for the
-- table backing check_rate_limit. Previously check_rate_limit swept
-- old rows itself on ~1% of calls, which only ran (or didn't) based
-- on how often it happened to be invoked — no guaranteed cadence,
-- and a maintenance task shouldn't be a side effect of a hot path.
-- Called from the same cron as release_expired_holds instead.
-- =============================================================
create or replace function purge_rate_limit_hits()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from rate_limit_hits where created_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function check_rate_limit(
  p_key text,
  p_max_count int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from rate_limit_hits
  where key = p_key
    and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max_count then
    return false;
  end if;

  insert into rate_limit_hits (key) values (p_key);
  return true;
end;
$$;
