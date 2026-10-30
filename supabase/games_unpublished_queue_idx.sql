-- Stütze für die Intranet-Queues „D-Freigabe (Radar)“ und „Servertot-Prüfung“
-- (src/components/intranet/IntranetRadarAndServertot.jsx).
-- Unveröffentlicht = published_locales = '[]' (Spalte ist nie NULL, siehe tb_sync_publishing_columns_trigger).
-- Angewendet als Migration `games_unpublished_queue_idx` (10/2026).
create index if not exists games_unpublished_queue_idx
  on public.games (guide_typ, id)
  where published_locales = '[]'::jsonb;
