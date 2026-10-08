-- =============================================================================
-- game_guides.local_id entfernen. Der Zeilenschlüssel ist trophy_id.
-- Einmal in der Supabase-SQL-Konsole, VOR dem nächsten Guide-Upload.
-- =============================================================================
--
-- local_id war nur der alte Name derselben Nummer. Bosse hatten ein
-- künstliches Präfix „B_". Das wird beim Übernehmen abgeschnitten.
-- Steht trophy_id schon, bleibt der Wert.
--
-- Zuerst die Vorschau. Den Schreib-Block erst ausführen, wenn die
-- Dubletten-Abfrage leer ist.

-- ---------------------------------------------------------------------------
-- 1) Vorschau: was würde trophy_id aus local_id übernehmen?
-- ---------------------------------------------------------------------------

select count(*) as ohne_trophy_id
from public.game_guides
where coalesce(btrim(trophy_id), '') = ''
  and coalesce(btrim(local_id::text), '') <> '';

-- Dubletten nach dem Übernehmen. Diese Liste muss leer sein,
-- sonst scheitert der Unique-Schlüssel.
select
  game_id,
  regexp_replace(coalesce(nullif(btrim(trophy_id), ''), local_id::text), '^B_', '') as trophy_id,
  count(*) as zeilen
from public.game_guides
group by 1, 2
having count(*) > 1
limit 40;

-- ---------------------------------------------------------------------------
-- 2) Schreiben (nach leerer Dubletten-Liste entkommentieren)
-- ---------------------------------------------------------------------------

-- begin;

-- update public.game_guides
-- set trophy_id = regexp_replace(local_id::text, '^B_', '')
-- where coalesce(btrim(trophy_id), '') = ''
--   and coalesce(btrim(local_id::text), '') <> '';
--
-- do $$
-- declare
--   cname text;
-- begin
--   select con.conname
--     into cname
--   from pg_constraint con
--   join pg_attribute att
--     on att.attrelid = con.conrelid
--    and att.attnum = any (con.conkey)
--   where con.conrelid = 'public.game_guides'::regclass
--     and con.contype in ('u', 'p')
--     and att.attname = 'local_id'
--   limit 1;
--
--   if cname is not null then
--     execute format('alter table public.game_guides drop constraint %I', cname);
--   end if;
-- end $$;
--
-- alter table public.game_guides
--   drop constraint if exists game_guides_game_id_trophy_id_key;
--
-- alter table public.game_guides
--   add constraint game_guides_game_id_trophy_id_key unique (game_id, trophy_id);
--
-- alter table public.game_guides
--   drop column local_id;
--
-- commit;
