-- Indizes fuer die Sitemap.
-- Einmal in der Supabase-SQL-Konsole ausfuehren.
--
-- sitemap-<lang>.xml filtert nur status->>'guide_<lang>' = 'PUBLISHED'.
-- Bisher hat jede Sitemap alle 14 Sprachen mit ODER verknuepft. Dafuer
-- existiert nur ein Index (guide_de), der Plan wird ein Seq-Scan und
-- Postgres bricht mit "canceling statement due to statement timeout" ab.
--
-- guide_de ist schon als games_status_guide_de_idx angelegt.

create index if not exists games_status_guide_ja_idx
  on public.games ((status ->> 'guide_ja'));

create index if not exists games_status_guide_en_idx
  on public.games ((status ->> 'guide_en'));

create index if not exists games_status_guide_fr_idx
  on public.games ((status ->> 'guide_fr'));

create index if not exists games_status_guide_es_idx
  on public.games ((status ->> 'guide_es'));

create index if not exists games_status_guide_it_idx
  on public.games ((status ->> 'guide_it'));

create index if not exists games_status_guide_nl_idx
  on public.games ((status ->> 'guide_nl'));

create index if not exists games_status_guide_pt_idx
  on public.games ((status ->> 'guide_pt'));

create index if not exists games_status_guide_ru_idx
  on public.games ((status ->> 'guide_ru'));

create index if not exists games_status_guide_ko_idx
  on public.games ((status ->> 'guide_ko'));

create index if not exists games_status_guide_zh_hant_idx
  on public.games ((status ->> 'guide_zh-hant'));

create index if not exists games_status_guide_zh_hans_idx
  on public.games ((status ->> 'guide_zh-hans'));

create index if not exists games_status_guide_fi_idx
  on public.games ((status ->> 'guide_fi'));

create index if not exists games_status_guide_sv_idx
  on public.games ((status ->> 'guide_sv'));
