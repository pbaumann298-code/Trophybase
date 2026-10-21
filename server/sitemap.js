import { SUPPORTED_LOCALES } from '../shared/countryLocaleMap.js';
import { PUBLIC_SITE_LOCALES } from '../src/lib/contentLocales.js';
import { GAME_STRUCT, GAME_TYPE } from '../src/lib/gameSchema.js';
import { hardwareToUrlSegment, buildPrettyGamePath } from '../src/lib/gameSlug.js';
import { GUIDE_PUBLICATION, guideStatusKey } from '../src/lib/guidePublication.js';
import { servertotPublicPath } from '../src/lib/servertotPage.js';
import { easyPlatinsPublicPath } from '../src/lib/easyPlatinsPage.js';
import { quickwinsPublicPath } from '../src/lib/quickwinsPage.js';
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
 * Quickwins / easy_platin / Servertot und noindex-Spiele bleiben draußen.
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
    )
    .neq(GAME_STRUCT.isIndexable, false)
    .neq(GAME_STRUCT.gameType, GAME_TYPE.SERVER_DEAD)
    .neq(GAME_STRUCT.gameType, GAME_TYPE.QUICKWIN)
    .neq(GAME_STRUCT.gameType, GAME_TYPE.EASY_PLATIN);
}

function isSitemapRow(row) {
  if (!row?.slug || !hardwareToUrlSegment(row.hardware)) return false;
  if (row[GAME_STRUCT.isIndexable] === false) return false;
  if (row[GAME_STRUCT.gameType] === GAME_TYPE.SERVER_DEAD) return false;
  if (row[GAME_STRUCT.gameType] === GAME_TYPE.QUICKWIN) return false;
  if (row[GAME_STRUCT.gameType] === GAME_TYPE.EASY_PLATIN) return false;
  return true;
}

async function loadViaTable(supabase, locale) {
  const { data, error } = await publishedGuideQuery(supabase, locale).limit(SITEMAP_URL_CAP);
  if (error) return { data: null, error };
  return { data: (data ?? []).filter(isSitemapRow), error: null };
}

async function loadIndexablePublishedGames(supabase, locale) {
  const table = await loadViaTable(supabase, locale);
  if (table.error) throw table.error;
  return table.data;
}

async function localesWithIndexableGames(supabase) {
  const checks = await Promise.all(
    SUPPORTED_LOCALES.map(async (locale) => {
      try {
        const { data, error } = await publishedGuideQuery(supabase, locale).limit(1);
        if (error) return null;
        return (data ?? []).some(isSitemapRow) ? locale : null;
      } catch {
        return null;
      }
    }),
  );
  const ensured = new Set([...PUBLIC_SITE_LOCALES, ...checks.filter(Boolean)]);
  return SUPPORTED_LOCALES.filter((locale) => ensured.has(locale));
}

function urlEntry(loc, lastmod = '') {
  return [
    '  <url>',
    `    <loc>${escapeHtml(loc)}</loc>`,
    lastmod ? `    <lastmod>${escapeHtml(lastmod)}</lastmod>` : '',
    '    <changefreq>weekly</changefreq>',
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Statische Sammelseiten – immer vor den Einzelspielen. */
function staticCollectionUrls(origin, locale) {
  const urls = [];
  if (locale === 'de') {
    urls.push(`${origin}/`);
  }
  urls.push(`${origin}${quickwinsPublicPath(locale)}`);
  urls.push(`${origin}${servertotPublicPath(locale)}`);
  urls.push(`${origin}${easyPlatinsPublicPath(locale)}`);
  return urls;
}

function urlset(origin, locale, games) {
  const staticPart = staticCollectionUrls(origin, locale)
    .map((loc) => urlEntry(loc))
    .join('\n');

  const gamePart = games
    .map((game) => {
      const hardware = hardwareToUrlSegment(game.hardware);
      const loc = buildPrettyGamePath(locale, hardware, game.slug);
      if (!loc) return '';
      const lastmod = String(game[GAME_STRUCT.createdAt] ?? '').slice(0, 10);
      return urlEntry(`${origin}${loc}`, lastmod);
    })
    .filter(Boolean)
    .join('\n');

  const body = [staticPart, gamePart].filter(Boolean).join('\n');

  return xmlWrap(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`,
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
