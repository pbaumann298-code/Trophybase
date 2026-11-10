import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { normalizeLocale } from './locale.js';

/**
 * Öffentliche Micro-Platins-Seite je Sprache.
 * Adresse: /{locale}/{slug}. Legacy: /quickwins, /micro-platins, /micro-platinums.
 * Interner Code-Name bleibt „Quickwin“ (spiel_typ).
 */
export const QUICKWINS_PAGE = {
  de: {
    slug: 'micro-platins',
    title: 'Micro Platins',
    lead: 'Kurze PlayStation-Spiele für schnelle Platin-Trophäen (PS4 & PS5 Micro Platins) im PSN.',
    notice: '',
  },
  en: {
    slug: 'micro-platinums',
    title: 'Micro Platinums',
    lead: 'Short PlayStation games for fast platinum trophies (PS4 & PS5 micro platinums) on PSN.',
    notice: '',
  },
  fr: {
    slug: 'micro-platines',
    title: 'Micro-platines',
    lead: 'Aperçu des jeux courts pour des trophées platine rapides sur PlayStation.',
    notice: '',
  },
  es: {
    slug: 'micro-platinos',
    title: 'Microplatinos',
    lead: 'Resumen de juegos cortos para conseguir trofeos de platino rápidos en PlayStation.',
    notice: '',
  },
  it: {
    slug: 'micro-platini',
    title: 'Micro-platini',
    lead: 'Panoramica di giochi brevi per trofei di platino rapidi su PlayStation.',
    notice: '',
  },
  nl: {
    slug: 'micro-platina',
    title: 'Micro-platina',
    lead: 'Overzicht van korte PlayStation-games voor snelle platinatrofeeën.',
    notice: '',
  },
  pt: {
    slug: 'micro-platinas',
    title: 'Microplatinas',
    lead: 'Visão geral de jogos curtos para platinas rápidas no PlayStation.',
    notice: '',
  },
  pl: {
    slug: 'mikroplatyny',
    title: 'Mikroplatyny',
    lead: 'Przegląd krótkich gier na szybkie platyny na PlayStation.',
    notice: '',
  },
  ru: {
    slug: 'mikroplatiny',
    title: 'Микроплатины',
    lead: 'Обзор коротких игр для быстрых платиновых трофеев на PlayStation.',
    notice: '',
  },
  ja: {
    slug: 'maikuro-purachina',
    title: 'マイクロプラチナ',
    lead: '短時間でプラチナトロフィーを獲得できるショートゲーム一覧。',
    notice: '',
  },
  ko: {
    slug: 'maikeuro-peullaetineom',
    title: '마이크로 플래티넘',
    lead: '짧은 플레이 타임으로 빠르게 플래티넘 트로피를 획득할 수 있는 게임 목록입니다.',
    notice: '',
  },
  'zh-hant': {
    slug: 'weixing-baijin',
    title: '微型白金',
    lead: '適合短時間內快速取得白金獎盃的輕量遊戲一覽。',
    notice: '',
  },
  'zh-hans': {
    slug: 'weixing-baijin',
    title: '微型白金',
    lead: '适合短时间内快速取得白金奖杯的轻量游戏一览。',
    notice: '',
  },
  fi: {
    slug: 'mikroplatinat',
    title: 'Mikroplatinat',
    lead: 'Yleiskatsaus lyhyisiin peleihin nopeita platinatrofeita varten.',
    notice: '',
  },
  sv: {
    slug: 'mikroplatinor',
    title: 'Mikroplatinor',
    lead: 'Översikt över korta spel för snabba platinatroféer.',
    notice: '',
  },
  ar: {
    slug: 'micro-platins',
    title: 'ميكرو بلاتينيوم',
    lead: 'نظرة عامة على الألعاب القصيرة للحصول على كؤوس البلاتينيوم بسرعة.',
    notice: '',
  },
};

const LEGACY_SLUGS = new Set(['quickwins', 'micro-platins', 'micro-platinums']);

const SLUGS = new Set([
  ...Object.values(QUICKWINS_PAGE).map((entry) => entry.slug),
  ...LEGACY_SLUGS,
]);

export function quickwinsPageCopy(locale) {
  const key = normalizeLocale(locale);
  return QUICKWINS_PAGE[key] || QUICKWINS_PAGE.de;
}

export function quickwinsPublicPath(locale) {
  const copy = quickwinsPageCopy(locale);
  return `/${normalizeLocale(locale)}/${copy.slug}`;
}

/** /{locale}/{slug} sowie Legacy /quickwins, /micro-platins, /micro-platinums. */
export function parseQuickwinsPath(pathname = '') {
  const parts = String(pathname || '').split('?')[0].split('/').filter(Boolean);
  if (parts.length === 1 && LEGACY_SLUGS.has(parts[0])) {
    return { locale: null, slug: parts[0], legacy: true };
  }
  if (parts.length !== 2) return null;
  if (!SUPPORTED_LOCALES.includes(parts[0])) return null;
  if (!SLUGS.has(parts[1])) return null;
  return {
    locale: parts[0],
    slug: parts[1],
    legacy: parts[1] !== QUICKWINS_PAGE[parts[0]]?.slug,
  };
}
