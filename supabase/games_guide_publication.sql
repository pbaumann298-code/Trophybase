-- Guide-Freigabe: Admin darf games.status schreiben
--
-- games.status ist die gemeinsame JSONB-Statusmappe der ganzen Pipeline, nicht
-- nur der Guides. Real vorkommende Schluessel (Stand der Pruefung):
--
--   {"igdb": "COMPLETED", "guides": "HAS_VIDEO", "overall": "ACTIVE",
--    "guide_de": "FERTIG", "trophies": "PROCESSED", "discovery": "DISCOVERED",
--    "online_mode": "OFFLINE", "refinement": "VEREDELT"}
--
-- Die redaktionelle Freigabe haengt ausschliesslich an guide_de:
--   FERTIG    = von der Pipeline hochgeladen, noch nicht freigegeben
--   PUBLISHED = fuer normale Besucher sichtbar (nur ueber die Website gesetzt)
--
-- Deshalb wird nie die ganze Spalte ueberschrieben, sondern immer nur dieser
-- eine Schluessel gemerged - sonst gehen overall/trophies/igdb verloren.
--
-- Das Frontend zeigt die Guide-Reiter ausschliesslich bei guide_de = PUBLISHED;
-- Admins sehen sie zusaetzlich als Vorschau. EN/ES haengen vorerst am selben
-- Schalter, eigene guide_en / guide_es kommen spaeter.
--
-- Ausgangslage bei der Einrichtung (geprueft):
--   1460 Spiele mit guide_de = FERTIG, 0 mit guide_de = PUBLISHED
--   davon 1263 Quickwins (spiel_typ = 'Quickwin'), 197 andere
--   Quickwins insgesamt: 1265 (2 davon ohne Guide-Inhalt)
--
-- ENTSCHEIDUNG:
--   * Die 1263 Quickwins MIT Guide-Inhalt gehen einmalig gesammelt online
--     (Schritt 5), sind aber nicht indexierbar - auffindbar nur ueber die
--     Website-Suche.
--   * Die restlichen 197 bleiben offline und werden einzeln ueber die Website
--     freigegeben, damit keine halbleeren Seiten online stehen.
--
-- Reihenfolge: Schritt 4 (Slug-Trigger) MUSS vor Schritt 5 laufen, sonst
-- bekommen die 1263 Quickwins keinen Slug.

-- ---------------------------------------------------------------------------
-- SCHRITT 1: Ist-Zustand pruefen (nur lesen)
-- ---------------------------------------------------------------------------

-- Laeuft auf games ueberhaupt RLS? Wenn relrowsecurity = false, ist die Tabelle
-- offen und Schritt 2 ist nicht noetig. NICHT einfach RLS aktivieren - das wuerde
-- ohne passende SELECT-Policy alle Lesezugriffe der Website abschneiden.
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where oid = 'public.games'::regclass;

-- Welche Policies existieren heute auf games?
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'games'
order by policyname;

-- ---------------------------------------------------------------------------
-- SCHRITT 2: Admin-Erkennung + UPDATE-Policy
-- Nur ausfuehren, wenn Schritt 1 relrowsecurity = true gemeldet hat.
-- ---------------------------------------------------------------------------

-- Admin-Liste an einer Stelle. Muss mit ALLOWED_ADMINS in
-- src/lib/maintenanceAccess.js uebereinstimmen.
create or replace function public.tb_is_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in ('master@trophybase.app');
$$;

comment on function public.tb_is_admin is
  'Redaktioneller Vollzugriff. Spiegelt ALLOWED_ADMINS im Frontend.';

drop policy if exists games_admin_update on public.games;
create policy games_admin_update
  on public.games
  for update
  to authenticated
  using (public.tb_is_admin())
  with check (public.tb_is_admin());

-- ---------------------------------------------------------------------------
-- SCHRITT 3: Redaktionelle Uebersicht
-- ---------------------------------------------------------------------------

-- Wie viele Spiele haengen in welchem Zustand?
select
  coalesce(status ->> 'guide_de', '(kein Wert)') as status_de,
  count(*) as spiele
from public.games
where status ? 'guide_de'
   or status ? 'guides'
group by 1
order by spiele desc;

-- Die Arbeitsliste: offene Freigaben OHNE die Quickwins, denn die gehen in
-- Schritt 5 gesammelt online. Das sind die Spiele, die einzeln dran sind.
select
  id,
  spieltitel ->> 'de' as titel,
  hardware,
  spiel_typ,
  status ->> 'guide_de' as status_de
from public.games
where coalesce(status ->> 'guide_de', '') <> 'PUBLISHED'
  and coalesce(spiel_typ, '') <> 'Quickwin'
  and exists (
    select 1
    from public.game_guides g
    where g.game_id = public.games.id
  )
order by titel;

-- ---------------------------------------------------------------------------
-- SCHRITT 4: Slug entsteht bei der Freigabe
-- Vor Schritt 5 ausfuehren.
-- ---------------------------------------------------------------------------

-- Warum hier und nicht per Backfill ueber alle 19.803 Zeilen: ein Slug ist eine
-- oeffentliche URL. Sie soll erst existieren, wenn die Seite auch existiert.
--
-- Die Slug-Regeln liegen schon in games_slug.sql (tb_slugify, tb_hardware_slug,
-- tb_title_for_slug). Der dortige Trigger games_assign_slug feuert aber nur bei
-- update of spieltitel/hardware/release_jahr/slug - eine Freigabe schreibt nur
-- status und wuerde ihn daher nie ausloesen.

-- Kollisionsfreien Slug-Kandidaten bauen. Ausgelagert, damit Freigabe-Trigger
-- und der bestehende games_assign_slug dieselbe Logik benutzen.
--
-- WICHTIG: platform_game_id ist JSONB (Array aller NPWR-IDs dieses Spiels),
-- nicht Text. In games_slug.sql wird es als Text behandelt - deshalb laeuft der
-- dritte Kollisionsfall dort auf einen Typfehler und es kam zu
-- "duplicate key value violates unique constraint games_hardware_slug_idx".
-- Hier wird das erste Array-Element korrekt per #>> '{0}' gelesen.
create or replace function public.tb_next_game_slug(p_game public.games)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  hw text;
  base text;
  candidate text;
  clash boolean;
  suffix text;
begin
  hw := public.tb_hardware_slug(p_game.hardware);
  if hw is null then
    return null;
  end if;

  base := public.tb_slugify(public.tb_title_for_slug(p_game.spieltitel));
  if base is null then
    return null;
  end if;

  candidate := base;

  select exists (
    select 1 from public.games g
    where g.id is distinct from p_game.id
      and g.slug = candidate
      and public.tb_hardware_slug(g.hardware) = hw
  ) into clash;

  -- Zweiter Versuch: Jahr anhaengen (Remaster / Deluxe auf derselben Konsole).
  if clash and p_game.release_jahr is not null then
    candidate := base || '-' || p_game.release_jahr::text;
    select exists (
      select 1 from public.games g
      where g.id is distinct from p_game.id
        and g.slug = candidate
        and public.tb_hardware_slug(g.hardware) = hw
    ) into clash;
  end if;

  -- Letzter Versuch: NPWR-ID, sonst die UUID. Die ist garantiert eindeutig.
  if clash then
    suffix := lower(regexp_replace(
      coalesce(nullif(btrim(p_game.platform_game_id #>> '{0}'), ''), p_game.id::text),
      '[^a-z0-9]+', '-', 'g'
    ));
    suffix := regexp_replace(suffix, '^-+|-+$', '', 'g');
    candidate := base || '-' || suffix;
  end if;

  return candidate;
end;
$$;

comment on function public.tb_next_game_slug is
  'Kollisionsfreier Slug-Kandidat fuer eine games-Zeile. Liest platform_game_id korrekt als JSONB-Array.';

create or replace function public.tb_slug_on_publish()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Bestehende Slugs sind unveraenderlich: eine URL, die schon im Index steht,
  -- darf nicht kippen.
  if new.slug is not null and btrim(new.slug) <> '' then
    return new;
  end if;

  if upper(coalesce(new.status ->> 'guide_de', '')) <> 'PUBLISHED' then
    return new;
  end if;

  new.slug := public.tb_next_game_slug(new);
  return new;
end;
$$;

drop trigger if exists games_slug_on_publish on public.games;
create trigger games_slug_on_publish
  before update of status
  on public.games
  for each row
  execute procedure public.tb_slug_on_publish();

-- ACHTUNG, sonst ist die ganze Kopplung wirkungslos:
-- games_slug.sql hat den Trigger games_assign_slug angelegt. Der feuert BEFORE
-- INSERT und vergibt jedem neu eingelieferten Spiel sofort einen Slug - also
-- auch den ~18.000 Katalogzeilen ohne Guide. Solange er existiert, entsteht der
-- Slug NICHT erst bei der Freigabe.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.games'::regclass
  and not tgisinternal
order by tgname;

-- Empfehlung: den alten Trigger entfernen, damit ausschliesslich die Freigabe
-- Slugs erzeugt. tb_slugify / tb_hardware_slug / tb_title_for_slug bleiben
-- erhalten - tb_next_game_slug baut darauf auf.
--
-- drop trigger if exists games_assign_slug on public.games;

-- ---------------------------------------------------------------------------
-- SCHRITT 5: Startfreigabe der Quickwins (einmalig)
-- ---------------------------------------------------------------------------

-- Quickwins gehen online, aber nicht in den Suchindex. is_indexable = false
-- wertet das Frontend zu <meta name="robots" content="noindex, follow"> aus;
-- ueber die Website-Suche bleiben sie normal auffindbar.
update public.games
set is_indexable = false
where spiel_typ = 'Quickwin'
  and is_indexable is distinct from false;

-- Freigabe nur fuer Quickwins, die wirklich Guide-Zeilen haben. Die 2 ohne
-- Inhalt bleiben bewusst draussen - sonst waere es eine leere Seite.
-- jsonb_set mit create_missing = true legt guide_de an, falls es fehlt, und
-- laesst alle anderen Schluessel (overall, trophies, igdb, ...) unberuehrt.
update public.games
set status = jsonb_set(
      coalesce(status, '{}'::jsonb),
      '{guide_de}',
      '"PUBLISHED"'::jsonb,
      true
    )
where spiel_typ = 'Quickwin'
  and coalesce(status ->> 'guide_de', '') <> 'PUBLISHED'
  and exists (
    select 1 from public.game_guides g where g.game_id = public.games.id
  );

-- Kontrolle: sollte 1263 freigegebene Quickwins mit Slug zeigen.
select
  count(*) filter (where status ->> 'guide_de' = 'PUBLISHED') as freigegeben,
  count(*) filter (where status ->> 'guide_de' = 'PUBLISHED' and slug is null) as ohne_slug,
  count(*) filter (where is_indexable) as indexierbar
from public.games
where spiel_typ = 'Quickwin';

-- ---------------------------------------------------------------------------
-- SCHRITT 6: Notbremse - NICHT im Normalbetrieb ausfuehren.
-- ---------------------------------------------------------------------------

-- Alles auf Deutsch freigeben, wo ueberhaupt Guide-Zeilen existieren. Bleibt
-- auskommentiert: ausserhalb der Quickwins wird einzeln ueber die Website
-- freigegeben (siehe ENTSCHEIDUNG oben).
--
-- update public.games
-- set status = jsonb_set(
--       coalesce(status, '{}'::jsonb),
--       '{guide_de}',
--       '"PUBLISHED"'::jsonb,
--       true
--     )
-- where exists (
--   select 1 from public.game_guides g where g.game_id = public.games.id
-- );

-- Eine einzelne Freigabe zuruecknehmen (Spiel wieder offline):
--
-- update public.games
-- set status = jsonb_set(status, '{guide_de}', '"FERTIG"'::jsonb, true)
-- where id = '00000000-0000-0000-0000-000000000000';
