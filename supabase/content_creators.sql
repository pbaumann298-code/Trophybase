-- Stammdaten: public.content_creators (channel_name, youtube_url).
-- Spiel → Creator steht auf public.game_guides.creator_id
-- (Migration: game_guides_creator_id.sql). game_creator_map gibt es nicht mehr.
--
-- Nur ausführen, falls die Game-Seite den Creator nicht lädt
-- (RLS blockiert SELECT für anon/authenticated):

alter table public.content_creators enable row level security;

drop policy if exists content_creators_public_read on public.content_creators;
create policy content_creators_public_read
  on public.content_creators
  for select
  using (true);
