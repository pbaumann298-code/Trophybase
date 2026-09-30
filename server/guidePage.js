import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../shared/countryLocaleMap.js';
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
import { hardwareToUrlSegment, buildPrettyGamePath } from '../src/lib/gameSlug.js';
import { localizeJsonField } from '../src/lib/translationUtils.js';
import { isGameIndexable } from '../src/lib/guidePublication.js';
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

function renderHtml({ origin, locale, hardware, slug, game, trophies, guides, noIndex }) {
  const title = localizeJsonField(game[GAME_I18N.title], locale) || slug;
  const description =
    localizeJsonField(game[GAME_I18N.description], locale) ||
    `${title} – Trophäen-Guide auf TrophyBase.`;
  const path = buildPrettyGamePath(locale, hardware, slug);
  const canonical = `${origin}${path}`;
  const hreflangs = SUPPORTED_LOCALES.map((lang) => {
    const href = `${origin}${buildPrettyGamePath(lang, hardware, slug)}`;
    return `<link rel="alternate" hreflang="${lang}" href="${escapeAttr(href)}" />`;
  }).join('\n    ');
  const xDefault = `${origin}${buildPrettyGamePath(DEFAULT_LOCALE, hardware, slug)}`;

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
  const developer = String(game[GAME_STRUCT.developer] ?? '').trim();

  return `<!DOCTYPE html>
<html lang="${escapeAttr(locale)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} – TrophyBase</title>
    <meta name="description" content="${escapeAttr(description)}" />
    <meta name="robots" content="${robots}" />
    <link rel="canonical" href="${escapeAttr(canonical)}" />
    ${hreflangs}
    <link rel="alternate" hreflang="x-default" href="${escapeAttr(xDefault)}" />
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; font: 16px/1.55 system-ui, sans-serif; background: #121314; color: #e4e4e7; }
      a { color: #00ff66; }
      header, main, footer { max-width: 52rem; margin: 0 auto; padding: 1.25rem 1.25rem; }
      header { border-bottom: 1px solid #27272a; }
      .brand { font-weight: 800; letter-spacing: .02em; text-decoration: none; color: #fff; }
      .brand span { color: #00ff66; }
      h1 { font-size: 1.75rem; margin: 0 0 .5rem; }
      .meta { color: #a1a1aa; font-size: .875rem; }
      section { margin: 2rem 0; }
      h2 { font-size: 1.1rem; color: #00ff66; }
      ol { padding-left: 1.2rem; }
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
        <h1>${escapeHtml(title)}</h1>
        <p class="meta">${escapeHtml([hardware.toUpperCase(), year, developer].filter(Boolean).join(' · '))}</p>
        ${paragraphsHtml(description)}
        ${listSection('Trophäen', trophyItems)}
        ${listSection('Walkthrough', walkthrough)}
        ${listSection('Sammelobjekte', collectibles)}
        ${listSection('Bosse', bosses)}
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
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  };

  try {
    const supabase = getPublicSupabase();
    const { data: rows, error } = await supabase
      .from(TABLES.games)
      .select(
        [
          GAME_PK,
          GAME_STRUCT.hardware,
          GAME_STRUCT.slug,
          GAME_STRUCT.releaseYear,
          GAME_STRUCT.developer,
          GAME_STRUCT.status,
          GAME_STRUCT.isIndexable,
          GAME_I18N.title,
          GAME_I18N.description,
        ].join(', '),
      )
      .eq(GAME_STRUCT.slug, pretty.slug)
      .limit(20);

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

    const [{ data: trophies }, { data: guides }] = await Promise.all([
      supabase.from(TABLES.achievements).select(TROPHY_SELECT).eq(GAME_FK, game[GAME_PK]),
      supabase.from(TABLES.guides).select(GUIDE_SELECT).eq(GAME_FK, game[GAME_PK]),
    ]);

    const html = renderHtml({
      origin,
      locale: pretty.locale,
      hardware: pretty.hardware,
      slug: pretty.slug,
      game,
      trophies: trophies ?? [],
      guides: guides ?? [],
      noIndex: !isGameIndexable(game),
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

export async function warmPublishedGuide(origin, hardware, slug) {
  const hw = hardwareToUrlSegment(hardware);
  if (!hw || !slug) return;
  const base = String(origin || SITE_ORIGIN).replace(/\/$/, '');
  await Promise.all(
    SUPPORTED_LOCALES.map((locale) => {
      const path = buildPrettyGamePath(locale, hw, slug);
      return path ? fetch(`${base}${path}`, { method: 'GET', cache: 'reload' }).catch(() => {}) : null;
    }),
  );
}
