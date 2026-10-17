-- =============================================================================
-- NOTFALL: Admin/Login-Timeouts beheben
-- Sofort in der Supabase-SQL-Konsole ausfuehren.
-- =============================================================================
-- Die Policies „jeder Eingeloggte sieht alle Spiele/Trophäen“ zerstoeren den
-- guide_de-Index. Danach: games_authenticated_trophies_read.sql fuer die RPCs.

drop policy if exists games_select_authenticated on public.games;
drop policy if exists game_achievements_select_authenticated on public.game_achievements;
