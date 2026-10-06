import { DEFAULT_LOCALE, hreflangOf } from '../shared/countryLocaleMap.js';
import { hreflangCluster } from '../src/lib/gameSeo.js';
import {
  TABLES,
  GAME_PK,
  GAME_FK,
  GAME_STRUCT,
  GAME_I18N,
  ACHIEVEMENT_I18N,
  ACHIEVEMENT_STRUCT,
  GUIDE_I18N,
  GUIDE_STRUCT,
  GUIDE_SHEET_TYPE,
} from '../src/lib/gameSchema.js';
import { hardwareToUrlSegment, buildPrettyGamePath, hardwareLabel } from '../src/lib/gameSlug.js';
import { localizeJsonField } from '../src/lib/translationUtils.js';
import { isGameIndexable } from '../src/lib/guidePublication.js';
import { contentLocalesForGame, coerceToAvailableLocale } from '../src/lib/contentLocales.js';
import { buildGameSeo } from '../src/lib/gameSeo.js';
import { loadRelatedGuides } from '../src/lib/relatedGames.js';
import { getGameTitle } from '../src/lib/gameModel.js';
import { getPublicSupabase, publicOrigin, SITE_ORIGIN } from './publicSupabase.js';
import { parsePrettyGuidePath } from './prettyPath.js';
import { escapeHtml, escapeAttr, paragraphsHtml } from './escapeHtml.js';

const TROPHY_SELECT = [
  GAME_FK,
  'platform_achievement_id',
  ACHIEVEMENT_STRUCT.trophyType,
  ACHIEVEMENT_I18N.name,
  ACHIEVEMENT_I18N.desc,
  ACHIEVEMENT_I18N.guideTip,
].join(', ');

const GUIDE_SELECT = [
  GAME_FK,
  GUIDE_STRUCT.localId,
  GUIDE_I18N.sheetType,
  GUIDE_I18N.itemName,
  GUIDE_I18N.localisation,
  GUIDE_I18N.chronologicalGroup,
  GUIDE_I18N.categoryGroup,
].join(', ');

function sheetTypesOf(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  }
  const n = Number(value);
  return Number.isFinite(n) ? [n] : [];
}

function listSection(title, items) {
  if (!items.length) return '';
  const rows = items
    .map((item) => {
      const name = escapeHtml(item.name);
      const extra = item.detail ? `<p>${escapeHtml(item.detail)}</p>` : '';
      return `<li><h3>${name}</h3>${extra}</li>`;
    })
    .join('');
  return `<section><h2>${escapeHtml(title)}</h2><ol>${rows}</ol></section>`;
}

function relatedHeading(kind, name, locale) {
  if (kind === 'creator') {
    if (locale === 'es') return name ? `Más guías de ${name}` : 'Más guías de estos creadores';
    if (locale === 'en') return name ? `More guides by ${name}` : 'More guides by these creators';
    return name ? `Weitere Guides von ${name}` : 'Weitere Guides der Creator';
  }
  if (locale === 'es') return 'Guías similares';
  if (locale === 'en') return 'Similar guides';
  return 'Ähnliche Guides';
}

function relatedSection(heading, games, origin, locale) {
  if (!games?.length) return '';
  const items = games
    .map((game) => {
      const hw = hardwareToUrlSegment(game[GAME_STRUCT.hardware]);
      const path = buildPrettyGamePath(locale, hw, game[GAME_STRUCT.slug]);
      const name = getGameTitle(game, locale);
      if (!path || !name) return '';
      return `<li><a href="${escapeAttr(`${origin}${path}`)}">${escapeHtml(name)}</a></li>`;
    })
    .filter(Boolean)
    .join('');
  if (!items) return '';
  return `<section><h2>${escapeHtml(heading)}</h2><ul>${items}</ul></section>`;
}

function breadcrumbHtml({ origin, hardware, genre, title }) {
  const platform = hardwareLabel(hardware);
  const parts = [`<a href="${escapeAttr(`${origin}/`)}">TrophyBase</a>`];
  if (platform) parts.push(escapeHtml(platform));
  if (genre) parts.push(escapeHtml(genre));
  if (title) parts.push(escapeHtml(title));
  return `<nav class="crumbs" aria-label="Brotkrumen">${parts.join(' <span aria-hidden="true">/</span> ')}</nav>`;
}

function renderHtml({
  origin,
  locale,
  hardware,
  slug,
  game,
  trophies,
  guides,
  noIndex,
  locales,
  creatorGames = [],
  similarGames = [],
  creatorName = '',
}) {
  const seo = buildGameSeo({ origin, locale, hardware, slug, game, locales });
  const title = seo.title;
  const description =
    localizeJsonField(game[GAME_I18N.description], locale) ||
    `${title} – Trophäen-Guide auf TrophyBase.`;
  const canonical = seo.canonical;
  const cluster = hreflangCluster(seo.langs);
  const hreflangs = cluster
    ? [
        ...cluster.langs.map((lang) => {
          const href = `${origin}${buildPrettyGamePath(lang, hardware, slug)}`;
          return `<link rel="alternate" hreflang="${escapeAttr(hreflangOf(lang))}" href="${escapeAttr(href)}" />`;
        }),
        `<link rel="alternate" hreflang="x-default" href="${escapeAttr(`${origin}${buildPrettyGamePath(cluster.xDefault, hardware, slug)}`)}" />`,
      ].join('\n    ')
    : '';
  const jsonLd = JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c');
  const ogImage = seo.cover
    ? `<meta property="og:image" content="${escapeAttr(seo.cover)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${escapeAttr(seo.cover)}" />`
    : `<meta name="twitter:card" content="summary" />`;
  const genre = String(game[GAME_STRUCT.genre] ?? '').trim();

  const trophyItems = trophies.map((row) => ({
    name: localizeJsonField(row[ACHIEVEMENT_I18N.name], locale) || row.platform_achievement_id,
    detail: [
      localizeJsonField(row[ACHIEVEMENT_I18N.desc], locale),
      localizeJsonField(row[ACHIEVEMENT_I18N.guideTip], locale),
    ]
      .filter(Boolean)
      .join(' — '),
  }));

  const walkthrough = [];
  const collectibles = [];
  const bosses = [];
  for (const row of guides) {
    const types = sheetTypesOf(row[GUIDE_I18N.sheetType]);
    const item = {
      name: localizeJsonField(row[GUIDE_I18N.itemName], locale),
      detail: [
        localizeJsonField(row[GUIDE_I18N.localisation], locale),
        localizeJsonField(row[GUIDE_I18N.chronologicalGroup], locale),
        localizeJsonField(row[GUIDE_I18N.categoryGroup], locale),
      ]
        .filter(Boolean)
        .join(' · '),
    };
    if (!item.name) continue;
    if (types.includes(GUIDE_SHEET_TYPE.WALKTHROUGH)) walkthrough.push(item);
    if (types.includes(GUIDE_SHEET_TYPE.COLLECTIBLES)) collectibles.push(item);
    if (types.includes(GUIDE_SHEET_TYPE.BOSSES)) bosses.push(item);
  }

  const robots = noIndex ? 'noindex, follow' : 'index, follow';
  const year = game[GAME_STRUCT.releaseYear] ? String(game[GAME_STRUCT.releaseYear]) : '';
  const studioLine = [seo.studio, seo.publisher].filter(Boolean).join(' · ');
  const creatorHeading = relatedHeading('creator', creatorName, locale);
  const similarHeading = relatedHeading('similar', '', locale);

  return `<!DOCTYPE html>
<html lang="${escapeAttr(locale)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(seo.pageTitle)}</title>
    <meta name="description" content="${escapeAttr(seo.description)}" />
    <meta name="robots" content="${robots}" />
    <link rel="canonical" href="${escapeAttr(canonical)}" />
    ${hreflangs}
    <meta property="og:site_name" content="TrophyBase.app" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="${escapeAttr(seo.ogLocale)}" />
    <meta property="og:title" content="${escapeAttr(seo.pageTitle)}" />
    <meta property="og:description" content="${escapeAttr(seo.description)}" />
    <meta property="og:url" content="${escapeAttr(canonical)}" />
    ${ogImage}
    <meta name="twitter:title" content="${escapeAttr(seo.pageTitle)}" />
    <meta name="twitter:description" content="${escapeAttr(seo.description)}" />
    <script type="application/ld+json">${jsonLd}</script>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; font: 16px/1.55 system-ui, sans-serif; background: #121314; color: #e4e4e7; }
      a { color: #00ff66; }
      header, main, footer { max-width: 52rem; margin: 0 auto; padding: 1.25rem 1.25rem; }
      header { border-bottom: 1px solid #27272a; }
      .brand { font-weight: 800; letter-spacing: .02em; text-decoration: none; color: #fff; }
      .brand span { color: #00ff66; }
      .crumbs { color: #71717a; font-size: .8rem; margin: 0 0 1rem; }
      h1 { font-size: 1.75rem; margin: 0 0 .5rem; }
      .meta { color: #a1a1aa; font-size: .875rem; }
      section { margin: 2rem 0; }
      h2 { font-size: 1.1rem; color: #00ff66; }
      ol, ul { padding-left: 1.2rem; }
      li { margin: 0 0 1rem; }
      h3 { margin: 0 0 .25rem; font-size: 1rem; }
      p { margin: .35rem 0; color: #d4d4d8; }
      footer { border-top: 1px solid #27272a; color: #71717a; font-size: .8rem; }
    </style>
  </head>
  <body>
    <header>
      <a class="brand" href="${escapeAttr(origin)}/">TrophyBase<span>.app</span></a>
    </header>
    <main>
      <article>
        ${breadcrumbHtml({ origin, hardware, genre, title })}
        <h1>${escapeHtml(title)}</h1>
        <p class="meta">${escapeHtml([hardware.toUpperCase(), year, studioLine].filter(Boolean).join(' · '))}</p>
        ${paragraphsHtml(description)}
        ${listSection('Trophäen', trophyItems)}
        ${listSection('Walkthrough', walkthrough)}
        ${listSection('Sammelobjekte', collectibles)}
        ${listSection('Bosse', bosses)}
        ${relatedSection(creatorHeading, creatorGames, origin, locale)}
        ${relatedSection(similarHeading, similarGames, origin, locale)}
      </article>
    </main>
    <footer>Unabhängiger Trophäen-Guide. Kein offizielles Sony-Angebot.</footer>
  </body>
</html>`;
}

export async function handleGuideRequest(requestUrl) {
  const pretty =
    parsePrettyGuidePath(requestUrl.pathname) ||
    (() => {
      const params = requestUrl.searchParams;
      const locale = params.get('locale');
      const hardware = params.get('hardware');
      const slug = params.get('slug');
      if (!locale || !hardware || !slug) return null;
      return parsePrettyGuidePath(`/${locale}/${hardware}/${slug}`);
    })();

  if (!pretty) {
    return new Response('Not found', { status: 404 });
  }

  const origin = publicOrigin(requestUrl);
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600',
  };

  try {
    const supabase = getPublicSupabase();
    const guideColumns = [
      GAME_PK,
      GAME_STRUCT.hardware,
      GAME_STRUCT.slug,
      GAME_STRUCT.releaseYear,
      GAME_STRUCT.developer,
      GAME_STRUCT.publisher,
      GAME_STRUCT.genre,
      GAME_STRUCT.gameType,
      GAME_STRUCT.status,
      GAME_STRUCT.isIndexable,
      GAME_I18N.title,
      GAME_I18N.description,
      GAME_I18N.coverUrl,
    ];
    let { data: rows, error } = await supabase
      .from(TABLES.games)
      .select(guideColumns.join(', '))
      .eq(GAME_STRUCT.slug, pretty.slug)
      .limit(20);

    if (error && String(error.message ?? '').toLowerCase().includes('publisher')) {
      ({ data: rows, error } = await supabase
        .from(TABLES.games)
        .select(guideColumns.filter((column) => column !== GAME_STRUCT.publisher).join(', '))
        .eq(GAME_STRUCT.slug, pretty.slug)
        .limit(20));
    }

    if (error) throw error;

    const game =
      (rows ?? []).find((row) => hardwareToUrlSegment(row[GAME_STRUCT.hardware]) === pretty.hardware) ??
      ((rows ?? []).length === 1 ? rows[0] : null);

    if (!game) {
      return new Response(notFoundHtml(origin, pretty.locale), {
        status: 404,
        headers: { ...headers, 'Cache-Control': 'public, s-maxage=60' },
      });
    }

    const publishedLocales = contentLocalesForGame(game);
    const serveLocale = coerceToAvailableLocale(pretty.locale, publishedLocales);
    if (pretty.locale !== serveLocale) {
      const location = `${origin}${buildPrettyGamePath(serveLocale, pretty.hardware, pretty.slug)}`;
      return new Response(null, {
        status: 302,
        headers: {
          Location: location,
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60',
        },
      });
    }

    const [{ data: trophies }, { data: guides }, related] = await Promise.all([
      supabase.from(TABLES.achievements).select(TROPHY_SELECT).eq(GAME_FK, game[GAME_PK]),
      supabase.from(TABLES.guides).select(GUIDE_SELECT).eq(GAME_FK, game[GAME_PK]),
      loadRelatedGuides(supabase, game, { locale: serveLocale }).catch(() => ({
        creatorGames: [],
        similarGames: [],
        creators: [],
      })),
    ]);

    const html = renderHtml({
      origin,
      locale: serveLocale,
      hardware: pretty.hardware,
      slug: pretty.slug,
      game,
      trophies: trophies ?? [],
      guides: guides ?? [],
      noIndex: !isGameIndexable(game),
      locales: publishedLocales,
      creatorGames: related.creatorGames,
      similarGames: related.similarGames,
      creatorName: related.creators?.[0]?.channelName || '',
    });

    return new Response(html, { status: 200, headers });
  } catch (error) {
    return new Response(errorHtml(origin, error?.message), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

function notFoundHtml(origin, locale) {
  return `<!DOCTYPE html><html lang="${escapeAttr(locale)}"><head><meta charset="UTF-8" /><meta name="robots" content="noindex" /><title>Guide nicht gefunden</title></head><body style="background:#121314;color:#e4e4e7;font:16px system-ui;padding:2rem"><p>Zu diesem Link gibt es keinen veröffentlichten Guide.</p><p><a href="${escapeAttr(origin)}/" style="color:#00ff66">Zur Startseite</a></p></body></html>`;
}

function errorHtml(origin, message) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8" /><meta name="robots" content="noindex" /><title>Fehler</title></head><body style="background:#121314;color:#e4e4e7;font:16px system-ui;padding:2rem"><p>${escapeHtml(message || 'Seite konnte nicht gebaut werden.')}</p><p><a href="${escapeAttr(origin || SITE_ORIGIN)}/" style="color:#00ff66">Zur Startseite</a></p></body></html>`;
}

export async function warmPublishedGuide(origin, hardware, slug, locales = [DEFAULT_LOCALE]) {
  const hw = hardwareToUrlSegment(hardware);
  if (!hw || !slug) return;
  const base = String(origin || SITE_ORIGIN).replace(/\/$/, '');
  const langs = Array.isArray(locales) && locales.length > 0 ? locales : [DEFAULT_LOCALE];
  await Promise.all(
    langs.map((locale) => {
      const path = buildPrettyGamePath(locale, hw, slug);
      return path ? fetch(`${base}${path}`, { method: 'GET', cache: 'reload' }).catch(() => {}) : null;
    }),
  );
}
