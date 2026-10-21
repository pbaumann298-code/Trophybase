import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { normalizeLocale } from './locale.js';

/**
 * Öffentliche Quickwins-Seite je Sprache.
 * Adresse: /{locale}/{slug}. Legacy: /quickwins.
 */
export const QUICKWINS_PAGE = {
  de: {
    slug: 'quickwins',
    title: 'Quickwins',
    lead: 'Übersicht von Spielen für schnelle Platin-Trophäen und kurze Spieldauern.',
    notice: '',
  },
  en: {
    slug: 'quickwins',
    title: 'Quickwins',
    lead: 'Overview of games for quick platinum trophies and short playtimes.',
    notice: '',
  },
  fr: {
    slug: 'quickwins',
    title: 'Quickwins',
    lead: 'Aperçu des jeux pour des trophées platine rapides et des durées de jeu courtes.',
    notice: '',
  },
  es: {
    slug: 'quickwins',
    title: 'Quickwins',
    lead: 'Resumen de juegos para platinos rápidos y tiempos de juego cortos.',
    notice: '',
  },
  it: {
    slug: 'quickwins',
    title: 'Quickwins',
    lead: 'Panoramica di giochi per platini rapidi e tempi di gioco brevi.',
    notice: '',
  },
  nl: {
    slug: 'quickwins',
    title: 'Quickwins',
    lead: 'Overzicht van games voor snelle platina en korte speeltijden.',
    notice: '',
  },
  pt: {
    slug: 'quickwins',
    title: 'Quickwins',
    lead: 'Visão geral de jogos para platinas rápidas e tempos de jogo curtos.',
    notice: '',
  },
  ru: {
    slug: 'quickwins',
    title: 'Quickwins',
    lead: 'Обзор игр для быстрых платин и короткого времени прохождения.',
    notice: '',
  },
  ja: {
    slug: 'quickwins',
    title: 'Quickwins',
    lead: '短時間で取れるプラチナトロフィーや短いプレイ時間のゲーム一覧。',
    notice: '',
  },
  ko: {
    slug: 'quickwins',
    title: 'Quickwins',
    lead: '빠른 플래티넘 트로피와 짧은 플레이 타임을 위한 게임 목록입니다.',
    notice: '',
  },
  'zh-hant': {
    slug: 'quickwins',
    title: 'Quickwins',
    lead: '適合快速白金獎盃與短時長遊玩的遊戲一覽。',
    notice: '',
  },
  'zh-hans': {
    slug: 'quickwins',
    title: 'Quickwins',
    lead: '适合快速白金奖杯与短时长游玩的游戏一览。',
    notice: '',
  },
  fi: {
    slug: 'quickwins',
    title: 'Quickwins',
    lead: 'Yleiskatsaus peleistä nopeisiin platinoihin ja lyhyisiin peliaikoihin.',
    notice: '',
  },
  sv: {
    slug: 'quickwins',
    title: 'Quickwins',
    lead: 'Översikt över spel för snabba platinor och korta speltider.',
    notice: '',
  },
};

const SLUGS = new Set(Object.values(QUICKWINS_PAGE).map((entry) => entry.slug));

export function quickwinsPageCopy(locale) {
  const key = normalizeLocale(locale);
  return QUICKWINS_PAGE[key] || QUICKWINS_PAGE.de;
}

export function quickwinsPublicPath(locale) {
  const copy = quickwinsPageCopy(locale);
  return `/${normalizeLocale(locale)}/${copy.slug}`;
}

/** /{locale}/quickwins … sowie Legacy /quickwins. */
export function parseQuickwinsPath(pathname = '') {
  const parts = String(pathname || '').split('?')[0].split('/').filter(Boolean);
  if (parts.length === 1 && parts[0] === 'quickwins') {
    return { locale: null, slug: parts[0], legacy: true };
  }
  if (parts.length !== 2) return null;
  if (!SUPPORTED_LOCALES.includes(parts[0])) return null;
  if (!SLUGS.has(parts[1])) return null;
  return { locale: parts[0], slug: parts[1], legacy: false };
}
