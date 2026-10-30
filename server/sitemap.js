import { SUPPORTED_LOCALES } from '../shared/countryLocaleMap.js';
import { PUBLIC_SITE_LOCALES } from '../src/lib/contentLocales.js';
import { GAME_STRUCT, GAME_TYPE } from '../src/lib/gameSchema.js';
import { hardwareToUrlSegment, buildPrettyGamePath } from '../src/lib/gameSlug.js';
import { servertotPublicPath } from '../src/lib/servertotPage.js';
import { easyPlatinsPublicPath } from '../src/lib/easyPlatinsPage.js';
import { quickwinsPublicPath } from '../src/lib/quickwinsPage.js';
import { getPublicSupabase, publicOrigin } from './publicSupabase.js';
import { parseSitemapLocale } from './prettyPath.js';
import { escapeHtml } from './escapeHtml.js';

/** Entspricht dem Cap in public.tb_sitemap_locale (supabase/tb_sitemap_locale.sql). */
const SITEMAP_URL_CAP = 10000;
const SITEMAP_RPC = 'tb_sitemap_locale';

function xmlWrap(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

/**
 * RPC public.tb_sitemap_locale(p_locale, p_limit):
 * nur status->>guide_<lang> = PUBLISHED, is_indexable <> false und ohne
 * Quickwin / easy_platin / Servertot / Unlesbar. Liefert
 * { slug, hardware, spiel_typ, is_indexable, created_at } – dieselben Spalten,
 * die die XML-Generierung braucht (created_at → lastmod).
 */
async function rpcSitemapRows(supabase, locale, limit) {
  const { data, error } = await supabase.rpc(SITEMAP_RPC, {
    p_locale: locale,
    p_limit: limit,
  });
  if (error) return { data: null, error };
  return { data: Array.isArray(data) ? data : [], error: null };
}

/** Defensive Nachfilterung – die RPC filtert bereits, Hardware-Segment prüft nur der Server. */
function isSitemapRow(row) {
  if (!row?.slug || !hardwareToUrlSegment(row.hardware)) return false;
  if (row[GAME_STRUCT.isIndexable] === false) return false;
  if (row[GAME_STRUCT.gameType] === GAME_TYPE.SERVER_DEAD) return false;
  if (row[GAME_STRUCT.gameType] === GAME_TYPE.QUICKWIN) return false;
  if (row[GAME_STRUCT.gameType] === GAME_TYPE.EASY_PLATIN) return false;
  return true;
}

async function loadIndexablePublishedGames(supabase, locale) {
  const { data, error } = await rpcSitemapRows(supabase, locale, SITEMAP_URL_CAP);
  if (error) throw error;
  return data.filter(isSitemapRow);
}

async function localesWithIndexableGames(supabase) {
  const checks = await Promise.all(
    SUPPORTED_LOCALES.map(async (locale) => {
      try {
        const { data, error } = await rpcSitemapRows(supabase, locale, 1);
        if (error) return null;
        return data.some(isSitemapRow) ? locale : null;
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

/**
 * Statische Sammelseiten – immer vor den Einzelspielen.
 * Die drei Hub-Seiten (Quickwins, Unerreichbare Platins, Easy Platins) stehen
 * in jeder Sprache fest drin; die Root-URL nur einmal (Default-Sprache de).
 */
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
