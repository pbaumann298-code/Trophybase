-- =============================================================================
-- Creator hängt am Guide, nicht mehr am Spiel
-- Einmal in der Supabase-SQL-Konsole.
-- =============================================================================
--
-- Bisher lag die Zuordnung in public.game_creator_map (game_id → creator_id).
-- Wird ein Guide aus game_guides gelöscht, blieb die Zeile am Spiel hängen und
-- tauchte beim nächsten Upload als veralteter Creator wieder auf.
--
-- Neu: public.game_guides.creator_id → public.content_creators(id).
-- Die Stammdaten-Tabelle heißt content_creators, nicht creators.
-- game_creator_map wird danach entfernt.
--
-- PostgREST-Join danach:
--   game_guides(creator_id, content_creators(id, channel_name, youtube_url))
-- Für „welche Spiele hat dieser Creator“ ohne jede Guide-Zeile zu laden:
--   public.game_guide_creators (distinct game_id, creator_id)

-- ---------------------------------------------------------------------------
-- 1) Spalte
-- ---------------------------------------------------------------------------

alter table public.game_guides
  add column if not exists creator_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.game_guides'::regclass
      and contype = 'f'
      and conname = 'game_guides_creator_id_fkey'
  ) then
    alter table public.game_guides
      add constraint game_guides_creator_id_fkey
      foreign key (creator_id)
      references public.content_creators(id)
      on delete set null;
  end if;
end $$;

comment on column public.game_guides.creator_id is
  'Video-Creator dieses Guides. Ersetzt public.game_creator_map.';

create index if not exists game_guides_creator_id_idx
  on public.game_guides (creator_id);

-- ---------------------------------------------------------------------------
-- 2) Backfill aus game_creator_map
--    Mehrere Map-Zeilen pro Spiel: VIDEO gewinnt, sonst die kleinste UUID.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.game_creator_map') is null then
    return;
  end if;

  update public.game_guides g
  set creator_id = picked.creator_id
  from (
    select distinct on (m.game_id)
      m.game_id,
      m.creator_id
    from public.game_creator_map m
    where m.game_id is not null
      and m.creator_id is not null
    order by
      m.game_id,
      case when upper(coalesce(m.content_type, '')) = 'VIDEO' then 0 else 1 end,
      m.creator_id
  ) picked
  where g.game_id = picked.game_id
    and g.creator_id is distinct from picked.creator_id;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Fremdschlüssel und Trigger der Map entfernen, dann die Tabelle
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  if to_regclass('public.game_creator_map') is null then
    return;
  end if;

  for r in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.game_creator_map'::regclass
      and con.contype = 'f'
  loop
    execute format('alter table public.game_creator_map drop constraint %I', r.conname);
  end loop;

  for r in
    select con.conname, con.conrelid::regclass as rel
    from pg_constraint con
    where con.confrelid = 'public.game_creator_map'::regclass
      and con.contype = 'f'
  loop
    execute format('alter table %s drop constraint %I', r.rel, r.conname);
  end loop;

  for r in
    select tg.tgname
    from pg_trigger tg
    where tg.tgrelid = 'public.game_creator_map'::regclass
      and not tg.tgisinternal
  loop
    execute format('drop trigger %I on public.game_creator_map', r.tgname);
  end loop;
end $$;

drop table if exists public.game_creator_map;

-- ---------------------------------------------------------------------------
-- 4) Schlanke Sicht: ein Paar pro Spiel und Creator
--    security_invoker: dieselbe RLS wie game_guides (Admin oder freigegeben).
-- ---------------------------------------------------------------------------

create or replace view public.game_guide_creators
with (security_invoker = true) as
select distinct game_id, creator_id
from public.game_guides
where creator_id is not null;

comment on view public.game_guide_creators is
  'Distinct Spiel ↔ Creator aus game_guides.creator_id. Ersetzt game_creator_map.';

grant select on public.game_guide_creators to anon, authenticated, service_role;
