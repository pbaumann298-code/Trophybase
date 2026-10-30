import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { normalizeLocale } from './locale.js';

/**
 * Öffentliche Easy-Platins-Seite je Sprache.
 * Adresse: /{locale}/{slug}. Legacy: /easy-platins.
 */
export const EASY_PLATINS_PAGE = {
  de: {
    slug: 'easy-platins',
    title: 'Easy Platins',
    lead: 'Kurze Guides für schnelle Platins – Visual Novels, Hidden-Object und ähnlich kurze Titel.',
    notice: '',
  },
  en: {
    slug: 'easy-platins',
    title: 'Easy platinums',
    lead: 'Short guides for quick platinums – visual novels, hidden-object games and similarly short titles.',
    notice: '',
  },
  fr: {
    slug: 'platines-faciles',
    title: 'Platines faciles',
    lead: 'Guides courts pour des platines rapides – visual novels, hidden object et titres similaires.',
    notice: '',
  },
  es: {
    slug: 'platinos-faciles',
    title: 'Platinos fáciles',
    lead: 'Guías cortas para platinos rápidos: novelas visuales, hidden object y títulos similares.',
    notice: '',
  },
  it: {
    slug: 'platini-facili',
    title: 'Platini facili',
    lead: 'Guide brevi per platini rapidi: visual novel, hidden object e titoli simili.',
    notice: '',
  },
  nl: {
    slug: 'makkelijke-platina',
    title: 'Makkelijke platina',
    lead: 'Korte guides voor snelle platina – visual novels, hidden object en vergelijkbare korte games.',
    notice: '',
  },
  pt: {
    slug: 'platinas-faceis',
    title: 'Platinas fáceis',
    lead: 'Guias curtos para platinas rápidas – visual novels, hidden object e títulos semelhantes.',
    notice: '',
  },
  pl: {
    slug: 'latwe-platyny',
    title: 'Łatwe platyny',
    lead: 'Krótkie poradniki do szybkich platyn – visual novele, hidden object i podobnie krótkie tytuły.',
    notice: '',
  },
  ru: {
    slug: 'legkie-platiny',
    title: 'Лёгкие платины',
    lead: 'Короткие гайды для быстрых платин — визуальные новеллы, hidden object и похожие игры.',
    notice: '',
  },
  ja: {
    slug: 'kantan-purachina',
    title: 'かんたんプラチナ',
    lead: '短時間で取れるプラチナ向けの短いガイドです。ビジュアルノベルや隠しオブジェクト系など。',
    notice: '',
  },
  ko: {
    slug: 'swiun-peullaetineom',
    title: '쉬운 플래티넘',
    lead: '빠른 플래티넘을 위한 짧은 가이드 – 비주얼 노벨, 히든 오브젝트 등.',
    notice: '',
  },
  'zh-hant': {
    slug: 'jiandan-baijin',
    title: '簡單白金',
    lead: '適合快速白金的短指南——視覺小說、尋物遊戲等類似類型。',
    notice: '',
  },
  'zh-hans': {
    slug: 'jiandan-baijin',
    title: '简单白金',
    lead: '适合快速白金的短指南——视觉小说、寻物游戏等类似类型。',
    notice: '',
  },
  fi: {
    slug: 'helpot-platinat',
    title: 'Helpot platinat',
    lead: 'Lyhyitä oppaita nopeisiin platinoihin – visual novelit, hidden object ja vastaavat.',
    notice: '',
  },
  sv: {
    slug: 'lata-platinor',
    title: 'Lätta platinor',
    lead: 'Korta guider för snabba platinor – visual novels, hidden object och liknande.',
    notice: '',
  },
};

const SLUGS = new Set(Object.values(EASY_PLATINS_PAGE).map((entry) => entry.slug));

export function easyPlatinsPageCopy(locale) {
  const key = normalizeLocale(locale);
  return EASY_PLATINS_PAGE[key] || EASY_PLATINS_PAGE.de;
}

export function easyPlatinsPublicPath(locale) {
  const copy = easyPlatinsPageCopy(locale);
  return `/${normalizeLocale(locale)}/${copy.slug}`;
}

/** /de/easy-platins … sowie Legacy /easy-platins. */
export function parseEasyPlatinsPath(pathname = '') {
  const parts = String(pathname || '').split('?')[0].split('/').filter(Boolean);
  if (parts.length === 1 && (parts[0] === 'easy-platins' || parts[0] === 'easyplatins')) {
    return { locale: null, slug: parts[0], legacy: true };
  }
  if (parts.length !== 2) return null;
  if (!SUPPORTED_LOCALES.includes(parts[0])) return null;
  if (!SLUGS.has(parts[1])) return null;
  return { locale: parts[0], slug: parts[1], legacy: false };
}
