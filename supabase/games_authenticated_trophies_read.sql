-- =============================================================================
-- Angemeldete User: Spiele + Trophäen lesen (ohne Guide-Reiter)
-- Einmal in der Supabase-SQL-Konsole ausfuehren.
-- =============================================================================
--
-- Zweck: Suche „inkl. nur Trophäen“ – Katalogeintraege in der DB, auch ohne
--   PUBLISHED-Guide. Die UI zeigt nur die Trophäenliste (ohne Tipps/Reiter).
-- Anon / Googlebot bleibt bei PUBLISHED. game_guides bleibt unveraendert
--   (nur Admin oder published) – Walkthrough/Sammelobjekte/Bosse nicht oeffnen.
--
-- Nach dem Ausfuehren: Website hart neu laden.

drop policy if exists games_select_authenticated on public.games;
create policy games_select_authenticated
  on public.games
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists game_achievements_select_authenticated on public.game_achievements;
create policy game_achievements_select_authenticated
  on public.game_achievements
  for select
  to authenticated
  using (auth.uid() is not null);

comment on policy games_select_authenticated on public.games is
  'Jeder eingeloggte User darf Spielezeilen lesen (Trophäen-Katalog).';

comment on policy game_achievements_select_authenticated on public.game_achievements is
  'Jeder eingeloggte User darf Trophäenzeilen lesen; Tipps blendet die UI aus.';
