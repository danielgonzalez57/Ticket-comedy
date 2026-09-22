-- =============================================================
-- 0008 — Rate limiting (Fase 2)
--
-- createOrder can be scripted to hold every seat of a show; report
-- Payment can be hammered per-IP or per-order. This app runs
-- serverless (Vercel), so an in-memory counter wouldn't persist
-- across invocations/instances — the counter has to live somewhere
-- shared, and Postgres (already required infra) is the simplest
-- option that doesn't add a new dependency (Redis/Upstash etc).
--
-- Fixed-window counter, not sliding — good enough for throttling
-- abuse, not trying to be a precise rate limiter. RLS is enabled
-- with no policies (deny-by-default, same pattern as the `receipts`
-- bucket): only the SECURITY DEFINER function below can touch this
-- table, regardless of caller.
-- =============================================================

create table if not exists rate_limit_hits (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_hits_key_created_idx
  on rate_limit_hits (key, created_at);

alter table rate_limit_hits enable row level security;

-- =============================================================
-- check_rate_limit — records a hit for `p_key` and returns false if
-- that key has already hit `p_max_count` within the last
-- `p_window_seconds` (fixed window: the count is of hits strictly
-- newer than now() - window, so it slides forward one check at a
-- time rather than resetting on a clock boundary). Old rows are
-- swept probabilistically (~1% of calls) instead of on every call,
-- since an unconditional DELETE per check would scale badly.
-- =============================================================
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
  if random() < 0.01 then
    delete from rate_limit_hits where created_at < now() - interval '1 day';
  end if;

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
