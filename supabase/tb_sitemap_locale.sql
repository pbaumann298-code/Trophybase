-- Sitemap-RPC: eine Sprache, fester Timeout, schlanke Spalten.
-- Stand: Migration sitemap_locale_limit_10000 (10/2026) – identisch mit der Live-DB.
-- Zusammen mit games_sitemap_locale_idx.sql fuer schnelle Plaene.
--
-- Ohne Index wuerde PostgREST oft an statement_timeout (oft 8s) scheitern.
-- Die Funktion setzt lokal 30s, filtert guide_<lang> = PUBLISHED und schliesst
-- noindex-Spiele sowie Quickwin / easy_platin / Servertot / Unlesbar aus.
-- server/sitemap.js ruft sie per supabase.rpc('tb_sitemap_locale', ...) auf.

create or replace function public.tb_sitemap_locale(
  p_locale text,
  p_limit integer default 10000
)
returns table (
  slug text,
  hardware text,
  spiel_typ text,
  is_indexable boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
set statement_timeout = '30s'
as $$
declare
  lang text := lower(trim(both from coalesce(p_locale, '')));
  status_key text;
  row_cap integer := least(greatest(coalesce(p_limit, 10000), 1), 10000);
begin
  if lang = '' or lang !~ '^[a-z]{2}(-[a-z]+)?$' then
    return;
  end if;

  status_key := 'guide_' || lang;

  return query
  select
    g.slug::text,
    g.hardware::text,
    g.spiel_typ::text,
    coalesce(g.is_indexable, true)::boolean,
    g.created_at::timestamptz
  from public.games g
  where g.slug is not null
    and btrim(g.slug) <> ''
    and g.status ->> status_key = 'PUBLISHED'
    and coalesce(g.is_indexable, true) = true
    and coalesce(g.spiel_typ, '') not in ('Quickwin', 'easy_platin', 'Servertot', 'Unlesbar')
  order by g.created_at desc nulls last
  limit row_cap;
end;
$$;

revoke all on function public.tb_sitemap_locale(text, integer) from public;
grant execute on function public.tb_sitemap_locale(text, integer) to anon, authenticated;

-- explain analyze select * from public.tb_sitemap_locale('en');
-- explain analyze select * from public.tb_sitemap_locale('en', 1);
