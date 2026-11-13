-- =============================================================================
-- Indie- & Easy-Platin-Publisher-Definitionen
-- Ergänzt quickwin_publisher_defs, um echte Indies und Easy-Platin-Publisher
-- sauber von reiner Shovelware zu trennen und den spiel_typ vorzugeben.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tabelle
-- ---------------------------------------------------------------------------
create table if not exists public.indie_publisher_defs (
  match_key text primary key,
  publisher text not null,
  default_spiel_typ text not null default 'easy_platin',
  category text,
  published boolean not null default true,
  sort_pos integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.indie_publisher_defs is
  'Definitionen fuer Indie- und Easy-Platin-Publisher zur automatischen/halbautomatischen Steuerung von games.spiel_typ.';

comment on column public.indie_publisher_defs.match_key is
  'Normalisierter Vergleichsschluessel (Kleinbuchstaben, nur a-z0-9).';

comment on column public.indie_publisher_defs.publisher is
  'Anzeigename des Publishers / Studios.';

comment on column public.indie_publisher_defs.default_spiel_typ is
  'Ziel-Spieltyp in der games-Tabelle (z.B. easy_platin, Standard).';

comment on column public.indie_publisher_defs.category is
  'Kurzbeschreibung des Genres / Portfolios (z.B. POWGI Rätsel, Retro Indie, Mobile Port).';

create index if not exists indie_publisher_defs_lookup_idx
  on public.indie_publisher_defs (match_key, default_spiel_typ);

-- ---------------------------------------------------------------------------
-- 2) RLS (wie quickwin_publisher_defs)
-- ---------------------------------------------------------------------------
alter table public.indie_publisher_defs enable row level security;

drop policy if exists indie_publisher_defs_select on public.indie_publisher_defs;
create policy indie_publisher_defs_select
  on public.indie_publisher_defs
  for select
  to anon, authenticated
  using (true);

drop policy if exists indie_publisher_defs_admin_write on public.indie_publisher_defs;
create policy indie_publisher_defs_admin_write
  on public.indie_publisher_defs
  for all
  to authenticated
  using (public.tb_is_admin())
  with check (public.tb_is_admin());

grant select on public.indie_publisher_defs to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Seed der Indie- & Easy-Platin-Publisher
-- ---------------------------------------------------------------------------
insert into public.indie_publisher_defs (match_key, publisher, default_spiel_typ, category, sort_pos, notes)
values
  -- Klassische Easy-Platin-Größen (vollwertige Retro-/Pixel-Indies mit schneller Platin)
  ('ratalaikagames', 'Ratalaika Games', 'easy_platin', 'Easy Platin / Retro Ports', 10, 'Bekanntester Easy-Platin-Publisher, echte Retro-Indie-Ports'),
  ('eastasiasoft', 'EastAsiaSoft', 'easy_platin', 'Easy Platin / Shmups & Indies', 20, 'Hongkong-Publisher für Shmups, RPGs und leichte Indies'),
  ('sometimesyou', 'Sometimes You', 'easy_platin', 'Easy Platin / Budget Indies', 30, 'Osteuropäischer Publisher für atmosphärische kleine Indies & Puzzles'),
  ('chilidoginteractive', 'ChiliDog Interactive', 'easy_platin', 'Retro Arcade Indies', 40, 'Kleine Arcade-Spiele mit integrierten Cheat-Codes für Platin'),
  ('lightup', 'lightUP', 'easy_platin', 'Pixel Platformer', 50, 'Klassische 2D-Pixel-Plattformer'),
  ('hamstercorporation', 'Hamster Corporation', 'easy_platin', 'Arcade Archives', 60, 'Offizielle Arcade-Klassiker-Reihe mit Standard 100%-Listen'),
  ('artifexmundi', 'Artifex Mundi', 'easy_platin', 'Wimmelbild / Hidden Object', 70, 'Polnischer Marktführer für Wimmelbild-Abenteuer (Enigmatis etc.)'),
  ('walesinteractive', 'Wales Interactive', 'easy_platin', 'FMV / Story Adventure', 80, 'Interaktive Filme und Narrative Adventures mit leichten Platins'),
  ('kemco', 'KEMCO', 'easy_platin', 'Retro JRPGs', 90, 'Klassische 16-Bit JRPGs im SNES-Stil'),

  -- Rätsel-, Puzzle- & Denkspiel-Studios (Keine Shovelware!)
  ('lightwoodgames', 'Lightwood Games', 'easy_platin', 'POWGI Wort- & Zahlenrätsel', 100, 'Entwickler der POWGI-Reihe (Word Search, Pic-a-Pix, Kreuzworträtsel)'),

  -- Echte Indie-Studios & Portierer (Easy Platin)
  ('jandusoft', 'JanduSoft', 'easy_platin', 'Indie 3D & Adventure', 110, 'Spanisches Studio für 3D-Plattformer, Horror (Evil Inside) und Partygames'),
  ('qubicgames', 'QubicGames', 'easy_platin', 'Mobile-to-Console Casual Ports', 120, 'Konsolen-Ports etablierter Mobile-Hits (Hole.io, Paper.io 2, Voodoo)'),
  ('entwicklerx', 'EntwicklerX', 'easy_platin', 'Classic Casual Indie', 130, 'Deutsches Indie-Studio (Balance Blox, Perry Pig Jump)'),
  ('penguinpopgames', 'Penguin Pop Games', 'easy_platin', 'Puzzle & Arcade Indie', 140, 'Kleine Logik- und Retro-Spiele'),
  ('revulogames', 'Revulo Games', 'easy_platin', 'Casual Sports', 150, 'Minigolf und einfache Sportspiele'),
  ('woblyware', 'Woblyware', 'easy_platin', 'Pixel Action Indie', 160, 'Entwickler von Random Heroes, Devious Dungeon'),
  ('zoocorporation', 'Zoo Corporation', 'easy_platin', 'Arcade & Waifu Games', 170, 'Japanischer Arcade / Waifu Games Publisher (Pretty Girls, Beat Souls)'),
  ('greenlavastudios', 'Green Lava Studios', 'easy_platin', 'Meme & Parody Indies', 180, 'My Name is Mayo, Mr Massagy'),
  ('varagtp', 'VaragtP', 'easy_platin', 'Casual Indie Clicker', 190, 'Plantera Reihe'),

  -- Reine Indie-Publisher (Standard)
  ('esdigitalgames', 'ESDigital Games', 'Standard', 'Curated Indie Games', 200, 'Seriöser Publisher für vollwertige Indies (AWAKEN, Steel Seed)'),
  ('grabthegames', 'GrabTheGames', 'Standard', 'Curated Indie Games', 210, 'Etablierter Publisher auf Steam/Konsole'),
  ('blazingplanetstudio', 'Blazing Planet Studio', 'Standard', 'Curated Indie Games', 220, 'Kleine Story-Indies'),
  ('10tonsltd', '10tons Ltd', 'Standard', 'Curated Indie Games', 230, 'Finnisches Indie-Studio (Crimsonland, Tesla vs Lovecraft, Dysmantle)'),
  ('mommysbestgames', 'Mommy''s Best Games', 'Standard', 'Action Indie', 240, 'Pig Eat Ball, Shoot 1UP, Explosionade'),
  ('ripstone', 'Ripstone', 'Standard', 'Indie & Chess', 250, 'Pure Chess, Stick it to the Man, Chess Ultra'),
  ('risingstargames', 'Rising Star Games', 'Standard', 'Curated Indie / Heritage', 260, '88 Heroes, Deadly Premonition, RICO'),
  ('invictusgamesltd', 'Invictus Games Ltd.', 'Standard', 'Vehicle Simulation', 270, 'Dustoff Heli Rescue Reihe'),
  ('playwaysa', 'PlayWay S.A.', 'Standard', 'Simulation & Tycoon', 280, 'Polnischer Simulator-Publisher (Car Mechanic, House Cleaner etc.)'),
  ('dotemu', 'Dotemu', 'Standard', 'Retro Revival', 290, 'Pang Adventures, TMNT Shredders Revenge, Streets of Rage 4'),
  ('atari', 'Atari', 'Standard', 'Heritage / Recharged', 300, 'Atari Recharged Reihe, Pong Quest, qomp 2'),
  ('hoodedhorse', 'Hooded Horse', 'Standard', 'Tactics & Strategy', 310, 'Shadow Gambit, Against the Storm, Battle Brothers'),
  ('pmstudiosinc', 'PM Studios, Inc.', 'Standard', 'Indie Publisher', 320, 'Hoa, Ikai, Lets School, Table Flip Simulator')
on conflict (match_key) do update set
  publisher = excluded.publisher,
  default_spiel_typ = excluded.default_spiel_typ,
  category = excluded.category,
  notes = excluded.notes,
  sort_pos = excluded.sort_pos,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 4) Hilfsfunktion: Erkennt spiel_typ idiotensicher aus Publisher/Entwickler
-- ---------------------------------------------------------------------------
create or replace function public.tb_resolve_publisher_spiel_typ(p_raw_name text)
returns text
language plpgsql
stable
as $$
declare
  v_key text;
  v_typ text;
begin
  if p_raw_name is null or btrim(p_raw_name) = '' then
    return null;
  end if;

  v_key := lower(regexp_replace(btrim(p_raw_name), '[^a-zA-Z0-9]+', '', 'g'));
  if v_key = '' then
    return null;
  end if;

  -- 1. Priorität: Indie- & Easy-Platin-Publisher
  select default_spiel_typ into v_typ
  from public.indie_publisher_defs
  where match_key = v_key and published = true;

  if v_typ is not null then
    return v_typ;
  end if;

  -- 2. Priorität: Bestätigte Shovelware-Quickwin-Publisher
  if exists (
    select 1
    from public.quickwin_publisher_defs
    where match_key = v_key and published = true
  ) then
    return 'Quickwin';
  end if;

  return null;
end;
$$;
