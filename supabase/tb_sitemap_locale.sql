-- Sitemap-RPC: eine Sprache, fester Timeout, schlanke Spalten.
-- Einmal in der Supabase-SQL-Konsole ausfuehren (zusammen mit
-- games_sitemap_locale_idx.sql fuer schnelle Plaene).
--
-- Ohne Index wuerde PostgREST oft an statement_timeout (oft 8s) scheitern.
-- Die Funktion setzt lokal 30s und filtert nur guide_<lang> = PUBLISHED.

drop function if exists public.tb_sitemap_locale(text);
drop function if exists public.tb_sitemap_locale(text, integer);

create or replace function public.tb_sitemap_locale(
  p_locale text,
  p_limit integer default 5000
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
  row_cap integer := least(greatest(coalesce(p_limit, 5000), 1), 5000);
begin
  if lang = '' or lang !~ '^[a-z]{2}(-[a-z]+)?$' then
    return;
  end if;

  status_key := 'guide_' || lang;

  return query
  select
    g.slug,
    g.hardware,
    g.spiel_typ,
    g.is_indexable,
    g.created_at
  from public.games g
  where g.slug is not null
    and g.status ->> status_key = 'PUBLISHED'
  order by g.created_at desc nulls last
  limit row_cap;
end;
$$;

revoke all on function public.tb_sitemap_locale(text, integer) from public;
grant execute on function public.tb_sitemap_locale(text, integer) to anon, authenticated;

-- explain analyze select * from public.tb_sitemap_locale('en');
-- explain analyze select * from public.tb_sitemap_locale('en', 1);
