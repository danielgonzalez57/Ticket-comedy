-- =============================================================
-- 0015 — Manual fallback for the door scanner using the short order
-- code (the 8-char "Código: XXXXXXXX" shown in the confirmation
-- email/WhatsApp message — see lib/whatsapp.ts:orderCode, always
-- order.id.slice(0,8).toUpperCase()).
--
-- Until now /admin/validate's manual box only accepted the full
-- qr_token (or a ticket URL containing it) — typing the short code
-- from the email did nothing useful. This lets the admin fall back to
-- that short code when the QR can't be scanned (bad light, camera
-- issue, screenshot too blurry to decode) without having to go dig up
-- the order by hand.
--
-- Matches on a prefix of the order id's text form (the first 8 hex
-- chars of a uuid are exactly what orderCode() takes — same segment,
-- before the first dash). Requires an EXACT single match: with only 6
-- chars of entropy this is effectively collision-free at this app's
-- scale, but if it somehow isn't unique, refuse rather than guess —
-- this gates door entry, not a cosmetic lookup.
-- =============================================================
create or replace function find_order_by_code(p_code text)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
  v_count int;
  v_code text := lower(btrim(p_code));
begin
  if v_code is null or length(v_code) < 6 or length(v_code) > 8 then
    return null;
  end if;

  select count(*) into v_count
  from orders
  where id::text like v_code || '%';

  if v_count <> 1 then
    return null;
  end if;

  select * into v_order
  from orders
  where id::text like v_code || '%';

  return v_order;
end;
$$;

-- Same lockdown as every other order-reading/mutating RPC (migrations
-- 0012 + 0013): only the service-role client calls this.
revoke execute on function find_order_by_code(text) from public, anon, authenticated;
