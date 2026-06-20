-- Admin-Policies für community_reports + Content-Tabellen
-- Voraussetzung: community_reports_rls.sql bereits ausgeführt
-- Im Supabase SQL Editor ausführen

-- Hilfsfunktion: Admin-E-Mails (an ALLOWED_ADMINS in maintenanceAccess.js anpassen)
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

-- ─── Content-Tabellen: Admin darf bei Approve patchen ───
drop policy if exists "game_trophies_admin_update" on public.game_trophies;
drop policy if exists "game_chapters_admin_update" on public.game_chapters;
drop policy if exists "game_guides_admin_update" on public.game_guides;
drop policy if exists "game_bosses_admin_update" on public.game_bosses;

create policy "game_trophies_admin_update" on public.game_trophies
  for update to authenticated
  using (public.is_trophybase_admin())
  with check (public.is_trophybase_admin());

create policy "game_chapters_admin_update" on public.game_chapters
  for update to authenticated
  using (public.is_trophybase_admin())
  with check (public.is_trophybase_admin());

create policy "game_guides_admin_update" on public.game_guides
  for update to authenticated
  using (public.is_trophybase_admin())
  with check (public.is_trophybase_admin());

create policy "game_bosses_admin_update" on public.game_bosses
  for update to authenticated
  using (public.is_trophybase_admin())
  with check (public.is_trophybase_admin());
