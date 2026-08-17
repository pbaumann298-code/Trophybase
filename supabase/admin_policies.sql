-- Admin-Policies für community_reports + Content-Tabellen
-- Stand: i18n-Schema (lokalisierte Inhalte als JSONB auf den Haupttabellen,
-- keine *_translations-Tabellen mehr)
-- Voraussetzung: community_reports_rls.sql bereits ausgeführt
-- Im Supabase SQL Editor ausführen

create or replace function public.is_trophybase_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') in (
      'master@trophybase.app'
    ),
    false
  );
$$;

-- ─── community_reports: Admin liest & bearbeitet alle ───
drop policy if exists "community_reports_admin_select" on public.community_reports;
drop policy if exists "community_reports_admin_update" on public.community_reports;

create policy "community_reports_admin_select" on public.community_reports
  for select to authenticated
  using (public.is_trophybase_admin());

create policy "community_reports_admin_update" on public.community_reports
  for update to authenticated
  using (public.is_trophybase_admin())
  with check (public.is_trophybase_admin());

-- ─── Content-Tabellen (QA-Admin + Community-Report Approve) ───
-- games:            spieltitel / cover_url / beschreibung (JSONB) + Struktur
-- game_achievements: trophy_name / trophy_desc / guide_tip / icon_url (JSONB)
-- game_guides:       item_name / chronological_group / category_group (JSONB)
drop policy if exists "games_admin_update" on public.games;
drop policy if exists "game_achievements_admin_update" on public.game_achievements;
drop policy if exists "game_guides_admin_update" on public.game_guides;

create policy "games_admin_update" on public.games
  for update to authenticated
  using (public.is_trophybase_admin())
  with check (public.is_trophybase_admin());

create policy "game_achievements_admin_update" on public.game_achievements
  for update to authenticated
  using (public.is_trophybase_admin())
  with check (public.is_trophybase_admin());

create policy "game_guides_admin_update" on public.game_guides
  for update to authenticated
  using (public.is_trophybase_admin())
  with check (public.is_trophybase_admin());

-- ─── Aufräumen: Policies der abgelösten Tabellen ───
-- (Nur nötig, solange die Alt-Tabellen noch existieren.)
do $$
declare
  legacy_table text;
begin
  foreach legacy_table in array array[
    'game_trophies',
    'game_chapters',
    'game_bosses',
    'game_translations',
    'game_achievement_translations',
    'game_chapter_translations',
    'game_guide_translations',
    'game_boss_translations'
  ]
  loop
    if exists (
      select 1 from pg_tables
      where schemaname = 'public' and tablename = legacy_table
    ) then
      execute format(
        'drop policy if exists %I on public.%I',
        legacy_table || '_admin_update',
        legacy_table
      );
    end if;
  end loop;
end
$$;
