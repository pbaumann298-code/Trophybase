import { SUPPORTED_LOCALES } from '../shared/countryLocaleMap.js';
import { GAME_STRUCT } from '../src/lib/gameSchema.js';
import { hardwareToUrlSegment, buildPrettyGamePath } from '../src/lib/gameSlug.js';
import { GUIDE_PUBLICATION, isGuidePublished } from '../src/lib/guidePublication.js';
import { getPublicSupabase, publicOrigin } from './publicSupabase.js';
import { parseSitemapLocale } from './prettyPath.js';
import { escapeHtml } from './escapeHtml.js';

const SITEMAP_URL_CAP = 5000;

function xmlWrap(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

async function loadIndexablePublishedGames(supabase) {
  const { data, error } = await supabase
    .from('games')
    .select(`slug, hardware, ${GAME_STRUCT.createdAt}, ${GAME_STRUCT.status}`)
    .not('slug', 'is', null)
    .filter(`${GAME_STRUCT.status}->>guide_de`, 'eq', GUIDE_PUBLICATION.PUBLISHED)
    .or(`${GAME_STRUCT.isIndexable}.is.null,${GAME_STRUCT.isIndexable}.eq.true`)
    .limit(SITEMAP_URL_CAP);

  if (error) throw error;
  return (data ?? []).filter((row) => row?.slug && hardwareToUrlSegment(row.hardware));
}

function gamesForLocale(games, locale) {
  return games.filter((game) => isGuidePublished(game, locale));
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
    const games = await loadIndexablePublishedGames(supabase);
    const localesWithUrls = SUPPORTED_LOCALES.filter(
      (locale) => gamesForLocale(games, locale).length > 0,
    );

    if (parsed.kind === 'index') {
      return new Response(sitemapIndex(origin, localesWithUrls), { status: 200, headers });
    }

    return new Response(urlset(origin, parsed.locale, gamesForLocale(games, parsed.locale)), {
      status: 200,
      headers,
    });
  } catch (error) {
    const message = escapeHtml(error?.message ?? 'Sitemap fehlgeschlagen');
    return new Response(xmlWrap(`<error>${message}</error>`), {
      status: 500,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }
}
