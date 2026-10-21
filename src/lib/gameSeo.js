import { DEFAULT_LOCALE, hreflangOf } from '../../shared/countryLocaleMap.js';
import { GAME_STRUCT, isServerDeadType } from './gameSchema.js';
import { publicStudioCredits } from './studioCredits.js';
import { getGameCover, getGameDescription, getGameTitle } from './gameModel.js';
import { buildPrettyGamePath, hardwareLabel, hardwareToUrlSegment } from './gameSlug.js';
import { contentLocalesForGame } from './contentLocales.js';
import { guideDescriptionFallback } from './gameOverviewCopy.js';

export const SITE_NAME = 'TrophyBase.app';
export const HOME_META_TITLE = 'TrophyBase.app – Trophäen-Guides für PlayStation';
export const HOME_META_DESCRIPTION =
  'Trophäen-Guides für PlayStation: Walkthroughs, Sammelobjekte und Platin-Routen. Unabhängige, redaktionelle Guides – ohne Tracking.';
export const DEFAULT_SHARE_IMAGE = '/icons/tb-icon-512.png';

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

/**
 * hreflang erst ab zwei freigegebenen Sprachen.
 * Eine einzelne Sprache bleibt bei ihrem Canonical, ohne Alternate.
 * @param {string[]} langs
 * @returns {{ langs: string[], xDefault: string }|null}
 */
export function hreflangCluster(langs) {
  const list = [...new Set((langs ?? []).filter(Boolean))];
  if (list.length < 2) return null;
  const xDefault = list.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : list[0];
  return { langs: list, xDefault };
}

function absoluteUrl(origin, pathOrUrl) {
  const raw = String(pathOrUrl ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = String(origin || '').replace(/\/$/, '');
  return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
}

function buildGameFaq(game, title, canonicalLocale) {
  if (!game) return [];
  const isServerDead = isServerDeadType(game[GAME_STRUCT.gameType] ?? game.spiel_typ);
  if (game[GAME_STRUCT.isIndexable] === false || isServerDead) {
    return [];
  }

  const isDe = canonicalLocale === 'de';

  const parseNum = (val) => {
    if (val == null || val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  };

  const totalTrophies = parseNum(game[GAME_STRUCT.trophyCount] ?? game.anzahl_trophaeen);
  const missable = parseNum(game[GAME_STRUCT.totalMissableTrophies] ?? game.total_missable_trophies);
  const online = parseNum(game[GAME_STRUCT.totalOnlineTrophies] ?? game.total_online_trophies);
  const storyTime = parseNum(game.spielzeit_hauptstory);
  const compTime = parseNum(game.spielzeit_komplettierer);

  const questions = [];

  // Q1: How many trophies
  if (totalTrophies != null && totalTrophies > 0) {
    let answerText = isDe
      ? `${title} hat insgesamt ${totalTrophies} Trophäen.`
      : `${title} has a total of ${totalTrophies} trophies.`;

    if (missable != null && online != null) {
      if (isDe) {
        const mText = missable === 0 ? 'keine verpassbar' : `${missable} verpassbar`;
        const oText = online === 0 ? 'keine erfordern eine Online-Verbindung' : `${online} erfordern eine Online-Verbindung`;
        answerText += ` Davon sind ${mText} und ${oText}.`;
      } else {
        const mText = missable === 0 ? 'none are missable' : missable === 1 ? '1 is missable' : `${missable} are missable`;
        const oText = online === 0 ? 'none require an online connection' : online === 1 ? '1 requires an online connection' : `${online} require an online connection`;
        answerText += ` Of these, ${mText} and ${oText}.`;
      }
    } else if (missable != null) {
      if (isDe) {
        answerText += missable === 0
          ? ' Davon ist keine verpassbar.'
          : ` Davon sind ${missable} verpassbar.`;
      } else {
        answerText += missable === 0
          ? ' Of these, none are missable.'
          : missable === 1
            ? ' Of these, 1 is missable.'
            : ` Of these, ${missable} are missable.`;
      }
    } else if (online != null) {
      if (isDe) {
        answerText += online === 0
          ? ' Alle Trophäen sind offline erspielbar.'
          : ` Davon erfordern ${online} eine Online-Verbindung.`;
      } else {
        answerText += online === 0
          ? ' All trophies can be earned offline.'
          : online === 1
            ? ' Of these, 1 requires an online connection.'
            : ` Of these, ${online} require an online connection.`;
      }
    }

    questions.push({
      '@type': 'Question',
      name: isDe ? `Wie viele Trophäen hat ${title}?` : `How many trophies does ${title} have?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answerText,
      },
    });
  }

  // Q2: Missable trophies
  if (missable != null) {
    const answerText = isDe
      ? (missable === 0
          ? `Nein, ${title} hat keine verpassbaren Trophäen.`
          : `Ja, in ${title} gibt es ${missable} verpassbare ${missable === 1 ? 'Trophäe' : 'Trophäen'}.`)
      : (missable === 0
          ? `No, ${title} has no missable trophies.`
          : `Yes, there ${missable === 1 ? 'is 1 missable trophy' : `are ${missable} missable trophies`} in ${title}.`);

    questions.push({
      '@type': 'Question',
      name: isDe ? `Gibt es verpassbare Trophäen in ${title}?` : `Are there any missable trophies in ${title}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answerText,
      },
    });
  }

  // Q3: Online trophies
  if (online != null) {
    const answerText = isDe
      ? (online === 0
          ? `Nein, alle Trophäen in ${title} sind offline erspielbar.`
          : `Ja, ${title} enthält ${online} Online-${online === 1 ? 'Trophäe' : 'Trophäen'}.`)
      : (online === 0
          ? `No, all trophies in ${title} can be earned offline.`
          : `Yes, ${title} contains ${online} online ${online === 1 ? 'trophy' : 'trophies'}.`);

    questions.push({
      '@type': 'Question',
      name: isDe ? `Hat ${title} Online-Trophäen?` : `Does ${title} have online trophies?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answerText,
      },
    });
  }

  // Q4: Playtime
  if ((storyTime != null && storyTime > 0) || (compTime != null && compTime > 0)) {
    let answerText = '';
    if (compTime != null && compTime > 0 && storyTime != null && storyTime > 0) {
      answerText = isDe
        ? `Für die Platin-Trophäe in ${title} benötigt man ca. ${compTime} Stunden (für die Hauptstory ca. ${storyTime} Stunden).`
        : `Obtaining the platinum trophy in ${title} takes approximately ${compTime} hours (around ${storyTime} hours for the main story alone).`;
    } else if (compTime != null && compTime > 0) {
      answerText = isDe
        ? `Die Platin-Trophäe in ${title} dauert ca. ${compTime} Stunden.`
        : `Obtaining the platinum trophy in ${title} takes approximately ${compTime} hours.`;
    } else if (storyTime != null && storyTime > 0) {
      answerText = isDe
        ? `Die Hauptstory von ${title} dauert ca. ${storyTime} Stunden.`
        : `The main story of ${title} takes approximately ${storyTime} hours.`;
    }

    if (answerText) {
      questions.push({
        '@type': 'Question',
        name: isDe ? `Wie lange dauert die Platin-Trophäe in ${title}?` : `How long does it take to platinum ${title}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: answerText,
        },
      });
    }
  }

  return questions;
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
    getGameDescription(game, canonicalLocale) ||
    guideDescriptionFallback(title, canonicalLocale);
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

  const jsonLdGraph = [
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
  ];

  const faqQuestions = buildGameFaq(game, title, canonicalLocale);
  if (faqQuestions.length >= 2) {
    jsonLdGraph.push({
      '@type': 'FAQPage',
      mainEntity: faqQuestions,
    });
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': jsonLdGraph,
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

/** Kernfeatures der Web-App (DE/EN) für JSON-LD featureList. */
export const HOME_FEATURE_LIST = [
  'Interaktive Echtzeit-Checklisten für Trophäen / Interactive real-time trophy checklists',
  'Walkthroughs, Sammelobjekte und Bosse / Walkthroughs, collectibles and bosses',
  'Punktgenaue Video-Timestamps im Split-Screen-Querformat / Precise video timestamps in landscape split-screen',
  'Shovelware- und Micro-Platin-Filter / Shovelware and micro-platinum filter',
  'Direkter Community-Fehlerreport / Direct community error reporting',
];

/**
 * Erweitertes Startseiten-JSON-LD als @graph (WebSite + WebApplication + Organization).
 * Muss mit dem Script in index.html übereinstimmen.
 */
export function buildHomeJsonLd(origin) {
  const base = String(origin || '').replace(/\/$/, '') || 'https://trophybase.app';
  const homeUrl = `${base}/`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${homeUrl}#website`,
        name: SITE_NAME,
        url: homeUrl,
        inLanguage: ['de', 'en'],
        description: HOME_META_DESCRIPTION,
        publisher: { '@id': `${homeUrl}#organization` },
      },
      {
        '@type': 'WebApplication',
        '@id': `${homeUrl}#app`,
        name: SITE_NAME,
        url: homeUrl,
        applicationCategory: 'GameApplication',
        operatingSystem: 'All',
        inLanguage: ['de', 'en'],
        description: HOME_META_DESCRIPTION,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'EUR',
        },
        featureList: HOME_FEATURE_LIST,
        publisher: { '@id': `${homeUrl}#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${homeUrl}#organization`,
        name: 'TrophyBase GmbH & Co. KG',
        url: homeUrl,
        logo: `${base}/icons/tb-icon-512.png`,
      },
    ],
  };
}
