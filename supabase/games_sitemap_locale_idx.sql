-- Indizes fuer die Sitemap.
-- Einmal in der Supabase-SQL-Konsole ausfuehren.
--
-- sitemap-<lang>.xml filtert nur status->>'guide_<lang>' = 'PUBLISHED'.
-- Ohne Index (besonders guide_en) wird die Abfrage zum Seq-Scan und
-- endet mit: canceling statement due to statement timeout → HTTP 500.
-- Bing/Google sehen das, sobald der Vercel-Cache abgelaufen ist.
--
-- Partielle Indizes: nur PUBLISHED-Zeilen, klein und schnell.
-- guide_de kann schon als games_status_guide_de_idx existieren.

create index if not exists games_status_guide_ja_pub_idx
  on public.games ((status ->> 'guide_ja'))
  where (status ->> 'guide_ja') = 'PUBLISHED';

create index if not exists games_status_guide_en_pub_idx
  on public.games ((status ->> 'guide_en'))
  where (status ->> 'guide_en') = 'PUBLISHED';

create index if not exists games_status_guide_fr_pub_idx
  on public.games ((status ->> 'guide_fr'))
  where (status ->> 'guide_fr') = 'PUBLISHED';

create index if not exists games_status_guide_es_pub_idx
  on public.games ((status ->> 'guide_es'))
  where (status ->> 'guide_es') = 'PUBLISHED';

create index if not exists games_status_guide_de_pub_idx
  on public.games ((status ->> 'guide_de'))
  where (status ->> 'guide_de') = 'PUBLISHED';

create index if not exists games_status_guide_it_pub_idx
  on public.games ((status ->> 'guide_it'))
  where (status ->> 'guide_it') = 'PUBLISHED';

create index if not exists games_status_guide_nl_pub_idx
  on public.games ((status ->> 'guide_nl'))
  where (status ->> 'guide_nl') = 'PUBLISHED';

create index if not exists games_status_guide_pt_pub_idx
  on public.games ((status ->> 'guide_pt'))
  where (status ->> 'guide_pt') = 'PUBLISHED';

create index if not exists games_status_guide_pl_pub_idx
  on public.games ((status ->> 'guide_pl'))
  where (status ->> 'guide_pl') = 'PUBLISHED';

create index if not exists games_status_guide_ru_pub_idx
  on public.games ((status ->> 'guide_ru'))
  where (status ->> 'guide_ru') = 'PUBLISHED';

create index if not exists games_status_guide_ko_pub_idx
  on public.games ((status ->> 'guide_ko'))
  where (status ->> 'guide_ko') = 'PUBLISHED';

create index if not exists games_status_guide_zh_hant_pub_idx
  on public.games ((status ->> 'guide_zh-hant'))
  where (status ->> 'guide_zh-hant') = 'PUBLISHED';

create index if not exists games_status_guide_zh_hans_pub_idx
  on public.games ((status ->> 'guide_zh-hans'))
  where (status ->> 'guide_zh-hans') = 'PUBLISHED';

create index if not exists games_status_guide_fi_pub_idx
  on public.games ((status ->> 'guide_fi'))
  where (status ->> 'guide_fi') = 'PUBLISHED';

create index if not exists games_status_guide_sv_pub_idx
  on public.games ((status ->> 'guide_sv'))
  where (status ->> 'guide_sv') = 'PUBLISHED';

-- Schnellcheck nach dem Anlegen:
-- explain analyze
-- select slug from public.games
-- where status ->> 'guide_en' = 'PUBLISHED' and slug is not null
-- limit 5000;
