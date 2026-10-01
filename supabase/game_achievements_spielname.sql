-- =============================================================================
-- game_achievements.spielname (JSONB-Sprachmap)
-- Einmal in der Supabase-SQL-Konsole, BEVOR der Trophy-Crawler neu laeuft.
-- =============================================================================
--
-- Sony liefert den Packnamen in trophyGroups[].trophyGroupName (auch fuer
-- default = Hauptspiel). Der i18n-Crawler schreibt das hierhin, eine Map
-- wie trophy_name: {"de": "Die Schmiede", "en": "The Forge"}.
--
-- Alte Text-Spalte spielname wird, falls noch vorhanden, nach JSONB gewandelt.

do $$
declare
  col_type text;
begin
  select c.data_type
    into col_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'game_achievements'
    and c.column_name = 'spielname';

  if col_type is null then
    alter table public.game_achievements
      add column spielname jsonb not null default '{}'::jsonb;
  elsif col_type in ('text', 'character varying') then
    alter table public.game_achievements
      alter column spielname drop default;
    alter table public.game_achievements
      alter column spielname type jsonb
      using (
        case
          when spielname is null or btrim(spielname) = '' then '{}'::jsonb
          when left(btrim(spielname), 1) = '{' then spielname::jsonb
          else jsonb_build_object('de', spielname)
        end
      );
    alter table public.game_achievements
      alter column spielname set default '{}'::jsonb;
    alter table public.game_achievements
      alter column spielname set not null;
  end if;
end
$$;

comment on column public.game_achievements.spielname is
  'Lokalisiertes trophyGroupName (Hauptspiel + DLC). JSONB-Sprachmap.';
