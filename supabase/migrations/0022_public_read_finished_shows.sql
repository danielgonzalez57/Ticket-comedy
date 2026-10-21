-- =============================================================
-- 0022 — Finished shows stay visible on the public site.
--
-- The home page lists past shows ("Shows anteriores") and their
-- detail page stays reachable, read-only. Buying is still impossible:
-- create_pending_order / create_pending_order_by_qty only accept
-- status = 'published', and seats stay readable for published shows
-- only. Drafts remain hidden.
-- =============================================================
drop policy if exists "public read published shows" on shows;
create policy "public read published shows" on shows
  for select using (status in ('published', 'finished'));
