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
  GAME_STRUCT.createdAt,
].join(', ');

function xmlWrap(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

/**
 * Eine Sprache, ein Ausdruck: status->>guide_<lang> = PUBLISHED.
 * Die frühere ODER-Kette über alle 14 Sprachen konnte keinen Index nutzen
 * und ist an statement_timeout gelaufen.
 */
function indexablePublishedQuery(supabase, locale) {
  return supabase
    .from('games')
    .select(SITEMAP_COLUMNS)
    .not('slug', 'is', null)
    .filter(
      `${GAME_STRUCT.status}->>${guideStatusKey(locale)}`,
      'eq',
      GUIDE_PUBLICATION.PUBLISHED,
    )
    .or(`${GAME_STRUCT.isIndexable}.is.null,${GAME_STRUCT.isIndexable}.eq.true`)
    .or(`${GAME_STRUCT.gameType}.is.null,${GAME_STRUCT.gameType}.neq.${GAME_TYPE.SERVER_DEAD}`);
}

function hasSitemapUrl(row) {
  return Boolean(row?.slug && hardwareToUrlSegment(row.hardware));
}

async function loadIndexablePublishedGames(supabase, locale) {
  const { data, error } = await indexablePublishedQuery(supabase, locale).limit(SITEMAP_URL_CAP);
  if (error) throw error;
  return (data ?? []).filter(hasSitemapUrl);
}

async function localesWithIndexableGames(supabase) {
  const checks = await Promise.all(SUPPORTED_LOCALES.map(async (locale) => {
    const { data, error } = await indexablePublishedQuery(supabase, locale).limit(20);
    if (error) throw error;
    return (data ?? []).some(hasSitemapUrl) ? locale : null;
  }));
  return checks.filter(Boolean);
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
