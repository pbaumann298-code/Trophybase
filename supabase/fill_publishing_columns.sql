-- =============================================================================
-- publishing_status und published_locales aus status.guide_* füllen.
-- status bleibt stehen. Intranet, Slug-Trigger und Sitemap lesen weiter dort.
-- Einmal in der Supabase-SQL-Konsole ausführen.
-- =============================================================================
--
-- publishing_status: { "de": "PUBLISHED", "en": "PUBLISHED" }
-- published_locales: ["de", "en"]
-- Nur Sprachen mit dem Wert PUBLISHED. FERTIG und die übrigen Pipeline-Keys
-- bleiben ausschließlich in status.

-- Vorschau
select
  count(*) as spiele,
  count(*) filter (where status ->> 'guide_en' = 'PUBLISHED') as mit_en,
  count(*) filter (where status ->> 'guide_es' = 'PUBLISHED') as mit_es
from public.games g
where exists (
  select 1
  from jsonb_each_text(g.status) e
  where starts_with(e.key, 'guide_')
    and upper(e.value) = 'PUBLISHED'
);

update public.games g
set
  publishing_status = langs.publishing_status,
  published_locales = langs.published_locales
from (
  select
    id,
    coalesce(
      (
        select jsonb_object_agg(substring(e.key from 7), 'PUBLISHED')
        from jsonb_each_text(status) e
        where starts_with(e.key, 'guide_')
          and upper(e.value) = 'PUBLISHED'
      ),
      '{}'::jsonb
    ) as publishing_status,
    coalesce(
      (
        select jsonb_agg(substring(e.key from 7) order by substring(e.key from 7))
        from jsonb_each_text(status) e
        where starts_with(e.key, 'guide_')
          and upper(e.value) = 'PUBLISHED'
      ),
      '[]'::jsonb
    ) as published_locales
  from public.games
  where exists (
    select 1
    from jsonb_each_text(status) e
    where starts_with(e.key, 'guide_')
      and upper(e.value) = 'PUBLISHED'
  )
) langs
where g.id = langs.id;
