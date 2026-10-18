import { SUPPORTED_LOCALES } from '../shared/countryLocaleMap.js';
import { GAME_STRUCT, GAME_TYPE } from '../src/lib/gameSchema.js';
import { hardwareToUrlSegment, buildPrettyGamePath } from '../src/lib/gameSlug.js';
import { GUIDE_PUBLICATION, guideStatusKey } from '../src/lib/guidePublication.js';
import { getPublicSupabase, publicOrigin } from './publicSupabase.js';
import { parseSitemapLocale } from './prettyPath.js';
import { escapeHtml } from './escapeHtml.js';

const SITEMAP_URL_CAP = 5000;
const SITEMAP_COLUMNS = [
  'slug',
  'hardware',
  GAME_STRUCT.gameType,
  GAME_STRUCT.isIndexable,
  GAME_STRUCT.createdAt,
].join(', ');

function xmlWrap(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

/**
 * Nur status->>guide_<lang> = PUBLISHED — damit der Ausdrucksindex greifen kann.
 * is_indexable und Servertot werden danach im JS gefiltert.
 */
function publishedGuideQuery(supabase, locale) {
  return supabase
    .from('games')
    .select(SITEMAP_COLUMNS)
    .not('slug', 'is', null)
    .filter(
      `${GAME_STRUCT.status}->>${guideStatusKey(locale)}`,
      'eq',
      GUIDE_PUBLICATION.PUBLISHED,
    );
}

function isSitemapRow(row) {
  if (!row?.slug || !hardwareToUrlSegment(row.hardware)) return false;
  if (row[GAME_STRUCT.isIndexable] === false) return false;
  if (row[GAME_STRUCT.gameType] === GAME_TYPE.SERVER_DEAD) return false;
  return true;
}

function isMissingSitemapRpc(error) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    message.includes('tb_sitemap_locale') ||
    message.includes('could not find the function')
  );
}

async function loadViaRpc(supabase, locale, limit = SITEMAP_URL_CAP) {
  const { data, error } = await supabase.rpc('tb_sitemap_locale', {
    p_locale: locale,
    p_limit: limit,
  });
  if (error) return { data: null, error };
  return { data: (data ?? []).filter(isSitemapRow), error: null };
}

async function loadViaTable(supabase, locale) {
  const { data, error } = await publishedGuideQuery(supabase, locale).limit(SITEMAP_URL_CAP);
  if (error) return { data: null, error };
  return { data: (data ?? []).filter(isSitemapRow), error: null };
}

async function loadIndexablePublishedGames(supabase, locale) {
  const rpc = await loadViaRpc(supabase, locale);
  if (!rpc.error) return rpc.data;
  if (!isMissingSitemapRpc(rpc.error)) throw rpc.error;

  const table = await loadViaTable(supabase, locale);
  if (table.error) throw table.error;
  return table.data;
}

/**
 * Sprachen nacheinander mit kleinem Limit prüfen.
 * Promise.all hat bei Timeout einer Sprache den ganzen Index auf 500 gesetzt.
 */
async function localesWithIndexableGames(supabase) {
  const found = [];
  for (const locale of SUPPORTED_LOCALES) {
    try {
      const rpc = await loadViaRpc(supabase, locale, 40);
      if (!rpc.error) {
        if (rpc.data.length > 0) found.push(locale);
        continue;
      }
      if (!isMissingSitemapRpc(rpc.error)) continue;

      const { data, error } = await publishedGuideQuery(supabase, locale).limit(40);
      if (error) continue;
      if ((data ?? []).some(isSitemapRow)) found.push(locale);
    } catch {
      /* eine Sprache darf den Index nicht killen */
    }
  }
  return found;
}

function urlset(origin, locale, games) {
  const urls = games
    .map((game) => {
      const hardware = hardwareToUrlSegment(game.hardware);
      const loc = buildPrettyGamePath(locale, hardware, game.slug);
      if (!loc) return '';
      const lastmod = String(game[GAME_STRUCT.createdAt] ?? '').slice(0, 10);
      return [
        '  <url>',
        `    <loc>${escapeHtml(`${origin}${loc}`)}</loc>`,
        lastmod ? `    <lastmod>${escapeHtml(lastmod)}</lastmod>` : '',
        '    <changefreq>weekly</changefreq>',
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .filter(Boolean)
    .join('\n');

  return xmlWrap(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
  );
}

function sitemapIndex(origin, locales) {
  const items = locales.map(
    (locale) =>
      `  <sitemap>\n    <loc>${escapeHtml(`${origin}/sitemap-${locale}.xml`)}</loc>\n  </sitemap>`,
  ).join('\n');
  return xmlWrap(
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>`,
  );
}

export async function handleSitemapRequest(requestUrl) {
  const parsed = parseSitemapLocale(requestUrl.pathname, requestUrl.search);
  const origin = publicOrigin(requestUrl);
  const headers = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
  };

  try {
    const supabase = getPublicSupabase();

    if (parsed.kind === 'index') {
      const localesWithUrls = await localesWithIndexableGames(supabase);
      return new Response(sitemapIndex(origin, localesWithUrls), { status: 200, headers });
    }

    const games = await loadIndexablePublishedGames(supabase, parsed.locale);
    return new Response(urlset(origin, parsed.locale, games), {
      status: 200,
      headers,
    });
  } catch (error) {
    const message = escapeHtml(error?.message ?? 'Sitemap fehlgeschlagen');
    return new Response(xmlWrap(`<error>${message}</error>`), {
      status: 500,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
}
