-- =============================================================================
-- game_wiedervorlage
-- Temporaere Admin-Merkliste. Einmal in der Supabase-SQL-Konsole ausfuehren.
--
-- Kein Fremdschluessel auf games: DELETE in dieser Tabelle bleibt hier.
-- Eine geloeschte Zeile entfernt das Spiel nicht und loest keine Folge-Deletes aus.
-- =============================================================================

create table if not exists public.game_wiedervorlage (
  id uuid primary key,
  platform_game_id jsonb,
  spieltitel jsonb,
  freitext text
);

do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'game_wiedervorlage'
      and c.contype = 'f'
  loop
    execute format('alter table public.game_wiedervorlage drop constraint %I', con.conname);
  end loop;
end $$;

comment on table public.game_wiedervorlage is
  'Temporaere Wiedervorlage. Kopie von games.id, platform_game_id und spieltitel plus Freitext. Kein Fremdschluessel.';

alter table public.game_wiedervorlage enable row level security;

drop policy if exists game_wiedervorlage_admin on public.game_wiedervorlage;
create policy game_wiedervorlage_admin
  on public.game_wiedervorlage
  for all
  to authenticated
  using (public.tb_is_admin())
  with check (public.tb_is_admin());

revoke all on public.game_wiedervorlage from anon;
grant select, insert, update, delete on public.game_wiedervorlage to authenticated;
