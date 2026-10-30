-- Stütze für die Intranet-Queues „D-Freigabe (Radar)“ und „Servertot-Prüfung“
-- (src/components/intranet/IntranetRadarAndServertot.jsx).
-- Unveröffentlicht = published_locales = '[]' (Spalte ist nie NULL, siehe tb_sync_publishing_columns_trigger).
-- Angewendet als Migration `games_unpublished_queue_idx` (10/2026).
create index if not exists games_unpublished_queue_idx
  on public.games (guide_typ, id)
  where published_locales = '[]'::jsonb;

create index if not exists games_unpublished_by_id_idx
  on public.games (id)
  where published_locales = '[]'::jsonb;

create index if not exists games_servertot_candidates_idx
  on public.games (id)
  where (spiel_typ ilike '%Servertot%' or total_online_trophies > 0);

create index if not exists games_servertot_unpub_queue_idx
  on public.games (id)
  where (
    published_locales = '[]'::jsonb
    and (spiel_typ ilike '%Servertot%' or total_online_trophies > 0)
  );

create index if not exists games_d_freigabe_candidates_idx
  on public.games (id)
  where (
    published_locales = '[]'::jsonb
    and lower(coalesce(status->>'refinement', '')) = 'veredelt'
    and guide_typ in ('C', 'D')
  );

