-- =============================================================
-- 0007 — Ticket validation audit (Fase 2)
--
-- validateTicket() already does the atomic first-use check
-- (UPDATE ... WHERE used_at IS NULL) correctly and untouched — this
-- only adds a column to record WHICH admin scanned the ticket.
-- requireUser() already has the user at the point that update runs;
-- it was just being discarded.
-- =============================================================

alter table orders add column if not exists validated_by uuid references auth.users(id) on delete set null;
