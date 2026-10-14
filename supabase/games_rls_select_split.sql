-- =============================================================================
-- games SELECT-Policies splitten (Index auf guide_de fuer Anon)
-- Einmal in der Supabase-SQL-Konsole ausfuehren.
-- =============================================================================
--
-- IST: Eine Policy mit
--        tb_is_admin() OR status->>'guide_de' = 'PUBLISHED'
--      Postgres kann den Index games_guide_de_idx / games_status_guide_de_idx
--      oft nicht nutzen → Seq-Scan fuer Gaeste → Timeouts auf der Startseite.
--
-- SOLL: Zwei Policies (werden ORd):
--   1) published: nur der Index-Ausdruck, fuer anon + authenticated
--   2) admin: tb_is_admin(), nur authenticated
--
-- Danach: Startseite hart neu laden (Chrome: Strg+Shift+R).

drop policy if exists games_select on public.games;
drop policy if exists games_select_published on public.games;
drop policy if exists games_select_admin on public.games;

create policy games_select_published
  on public.games
  for select
  to anon, authenticated
  using (coalesce(status ->> 'guide_de', '') = 'PUBLISHED');

create policy games_select_admin
  on public.games
  for select
  to authenticated
  using (public.tb_is_admin());
