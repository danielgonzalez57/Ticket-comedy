-- =============================================================
-- 0002 — Don't expire holds for orders awaiting admin verification
-- (Fase 0, bug 0.2)
--
-- release_expired_holds() only checked seats.hold_expires_at, never
-- the owning order's status. A customer who already paid and is
-- waiting on the admin to confirm could lose their seat to expiry
-- mid-review — unacceptable once payment was made.
--
-- Fix: only release a hold when the order that owns it is still
-- 'pending' (or the seat has no owning order, e.g. legacy rows from
-- before 0001). Fase 1 will introduce the 'reported' status for
-- orders whose payment was submitted but not yet verified; because
-- this function keys off "status = 'pending'" rather than "status
-- <> 'paid'/'cancelled'", reported orders will already be protected
-- from expiry once that status exists, with no further change here.
-- =============================================================
create or replace function release_expired_holds()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
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
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
