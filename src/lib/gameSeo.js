import { DEFAULT_LOCALE, hreflangOf } from '../../shared/countryLocaleMap.js';
import { GAME_STRUCT } from './gameSchema.js';
import { publicStudioCredits } from './studioCredits.js';
import { getGameCover, getGameDescription, getGameTitle } from './gameModel.js';
import { buildPrettyGamePath, hardwareLabel, hardwareToUrlSegment } from './gameSlug.js';
import { contentLocalesForGame } from './contentLocales.js';

export const SITE_NAME = 'TrophyBase.app';
export const HOME_META_TITLE = 'TrophyBase.app – Trophäen-Guides für PlayStation';
export const HOME_META_DESCRIPTION =
  'Trophäen-Guides für PlayStation: Walkthroughs, Sammelobjekte und Platin-Routen. Unabhängige, redaktionelle Guides – ohne Tracking.';
export const DEFAULT_SHARE_IMAGE = '/icons/icon-512.png';

const OG_LOCALES = {
  ja: 'ja_JP',
  en: 'en_GB',
  fr: 'fr_FR',
  es: 'es_ES',
  de: 'de_DE',
  it: 'it_IT',
  nl: 'nl_NL',
  pt: 'pt_PT',
  ru: 'ru_RU',
  ko: 'ko_KR',
  'zh-hant': 'zh_TW',
  'zh-hans': 'zh_CN',
  fi: 'fi_FI',
  sv: 'sv_SE',
};

export function clipMetaText(value, max = 180) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function ogLocaleOf(locale) {
  return OG_LOCALES[locale] || 'de_DE';
}

function absoluteUrl(origin, pathOrUrl) {
  const raw = String(pathOrUrl ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = String(origin || '').replace(/\/$/, '');
  return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
}

/**
 * Titel, Canonical, Open Graph und JSON-LD für eine Guide-Seite.
 */
export function buildGameSeo({ origin, locale, hardware, slug, game, locales } = {}) {
  const hw = hardware || hardwareToUrlSegment(game?.hardware);
  const gameSlug = slug || String(game?.slug ?? '').trim();
  const langs = locales?.length ? locales : contentLocalesForGame(game);
  const canonicalLocale = langs.includes(locale)
    ? locale
    : langs.includes(DEFAULT_LOCALE)
      ? DEFAULT_LOCALE
      : langs[0];
  const path = buildPrettyGamePath(canonicalLocale, hw, gameSlug);
  const base = String(origin || '').replace(/\/$/, '');
  const canonical = path ? `${base}${path}` : '';
  const title = getGameTitle(game, canonicalLocale) || gameSlug || SITE_NAME;
  const rawDescription =
    getGameDescription(game, canonicalLocale) || `${title} – Trophäen-Guide auf TrophyBase.`;
  const description = clipMetaText(rawDescription);
  const cover = absoluteUrl(base, getGameCover(game, canonicalLocale));
  const year = game?.[GAME_STRUCT.releaseYear] ? String(game[GAME_STRUCT.releaseYear]) : '';
  const credits = publicStudioCredits(game);
  const genre = String(game?.[GAME_STRUCT.genre] ?? '').trim();
  const platform = hardwareLabel(game?.hardware || hw);
  const pageTitle = `${title} – TrophyBase`;

  const videoGame = {
    '@type': 'VideoGame',
    name: title,
    url: canonical || undefined,
    description: description || undefined,
    image: cover || undefined,
    inLanguage: hreflangOf(canonicalLocale),
    gamePlatform: platform || undefined,
    genre: genre || undefined,
    developer: credits.studio ? { '@type': 'Organization', name: credits.studio } : undefined,
    publisher: credits.publisher
      ? { '@type': 'Organization', name: credits.publisher }
      : undefined,
    datePublished: year || undefined,
  };

  const breadcrumbs = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: SITE_NAME,
        item: `${base}/`,
      },
      platform
        ? { '@type': 'ListItem', position: 2, name: platform }
        : null,
      genre
        ? {
            '@type': 'ListItem',
            position: platform ? 3 : 2,
            name: genre,
          }
        : null,
      {
        '@type': 'ListItem',
        position: 1 + (platform ? 1 : 0) + (genre ? 1 : 0) + 1,
        name: title,
        item: canonical || undefined,
      },
    ].filter(Boolean),
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemPage',
        name: pageTitle,
        description: description || undefined,
        url: canonical || undefined,
        inLanguage: hreflangOf(canonicalLocale),
        isPartOf: {
          '@type': 'WebSite',
          name: SITE_NAME,
          url: `${base}/`,
        },
        mainEntity: videoGame,
      },
      breadcrumbs,
    ],
  };

  return {
    pageTitle,
    title,
    description,
    canonical,
    cover,
    langs,
    canonicalLocale,
    jsonLd,
    ogLocale: ogLocaleOf(canonicalLocale),
    studio: credits.studio,
    publisher: credits.publisher,
  };
}

export function buildHomeJsonLd(origin) {
  const base = String(origin || '').replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `${base}/`,
    inLanguage: 'de',
    description: HOME_META_DESCRIPTION,
  };
}
