-- =============================================================================
-- game_achievements.is_unachievable entfernen. Die Flagge heißt is_online.
-- Einmal in der Supabase-SQL-Konsole. Schreibt nichts, solange der
-- Schreib-Block auskommentiert ist.
-- =============================================================================

-- Noch true in der alten Spalte, aber nicht in is_online.
select count(*) as nur_altes_flag
from public.game_achievements
where is_unachievable is true
  and is_online is not true;

-- ---------------------------------------------------------------------------
-- Schreiben (nach der Vorschau entkommentieren)
-- ---------------------------------------------------------------------------

-- update public.game_achievements
-- set is_online = true
-- where is_unachievable is true
--   and is_online is not true;
--
-- alter table public.game_achievements
--   drop column is_unachievable;
