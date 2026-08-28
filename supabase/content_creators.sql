-- Kein Schema-Change an games nötig.
-- Spiel → Creator liegt bereits in public.game_creator_map
--   (game_id, creator_id, content_type z. B. VIDEO).
-- Stammdaten: public.content_creators (channel_name, youtube_url).
--
-- Nur ausführen, falls die Game-Seite den Creator nicht lädt
-- (RLS blockiert SELECT für anon/authenticated):

alter table public.content_creators enable row level security;
alter table public.game_creator_map enable row level security;

drop policy if exists content_creators_public_read on public.content_creators;
create policy content_creators_public_read
  on public.content_creators
  for select
  using (true);

drop policy if exists game_creator_map_public_read on public.game_creator_map;
create policy game_creator_map_public_read
  on public.game_creator_map
  for select
  using (true);
