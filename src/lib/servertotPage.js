import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { normalizeLocale } from './locale';

/**
 * Öffentliche Servertot-Seite je Sprache: Titel, Einleitung, Hinweis, URL-Segment.
 * Die Adresse ist /{locale}/{slug}.
 */
export const SERVERTOT_PAGE = {
  de: {
    slug: 'unerreichbare-platin',
    title: 'Unerreichbare Platin',
    lead: 'Übersicht von Spielen, deren Platin-Trophäe durch abgeschaltete Server nicht mehr erspielbar ist.',
    notice: 'Wegen Abschaltung der Server ist die Platin nicht mehr regulär erspielbar.',
  },
  en: {
    slug: 'unobtainable-platinum',
    title: 'Unobtainable platinum',
    lead: 'Games whose platinum trophy can no longer be earned because the servers were shut down.',
    notice: 'Because the servers have been shut down, the platinum can no longer be earned through regular play.',
  },
  fr: {
    slug: 'platine-inaccessible',
    title: 'Platine inaccessible',
    lead: 'Jeux dont le trophée platine ne peut plus être obtenu, les serveurs ayant été coupés.',
    notice: 'En raison de l’arrêt des serveurs, le platine n’est plus obtenable en jeu normal.',
  },
  es: {
    slug: 'platino-inalcanzable',
    title: 'Platino inalcanzable',
    lead: 'Juegos cuyo trofeo de platino ya no se puede conseguir porque los servidores se han cerrado.',
    notice: 'Por el cierre de los servidores, el platino ya no se puede conseguir de forma normal.',
  },
  it: {
    slug: 'platino-irraggiungibile',
    title: 'Platino irraggiungibile',
    lead: 'Giochi il cui trofeo di platino non è più ottenibile perché i server sono stati spenti.',
    notice: 'A causa della chiusura dei server, il platino non è più ottenibile normalmente.',
  },
  nl: {
    slug: 'onbereikbaar-platina',
    title: 'Onbereikbaar platina',
    lead: 'Spellen waarvan de platinatrofee niet meer te behalen is doordat de servers zijn uitgezet.',
    notice: 'Door het uitschakelen van de servers is de platina niet meer normaal te behalen.',
  },
  pt: {
    slug: 'platina-inalcancavel',
    title: 'Platina inalcançável',
    lead: 'Jogos cujo troféu de platina já não pode ser obtido porque os servidores foram desligados.',
    notice: 'Com o encerramento dos servidores, a platina já não pode ser obtida normalmente.',
  },
  ru: {
    slug: 'nedostizhimaya-platina',
    title: 'Недостижимая платина',
    lead: 'Игры, платиновый трофей которых больше нельзя получить из‑за отключения серверов.',
    notice: 'Из‑за отключения серверов платину больше нельзя получить обычным способом.',
  },
  ja: {
    slug: 'toutatsu-dekinai-purachina',
    title: '到達できないプラチナ',
    lead: 'サーバー停止により、プラチナトロフィーが通常のプレイでは取れなくなったゲームの一覧です。',
    notice: 'サーバー停止のため、プラチナは通常のプレイでは獲得できなくなりました。',
  },
  ko: {
    slug: 'peullaetineom-bulga',
    title: '달성할 수 없는 플래티넘',
    lead: '서버 종료로 플래티넘 트로피를 더 이상 정상적으로 얻을 수 없는 게임 목록입니다.',
    notice: '서버가 종료되어 플래티넘을 정상적인 플레이로는 더 이상 획득할 수 없습니다.',
  },
  'zh-hant': {
    slug: 'wufa-baijin',
    title: '無法取得的白金',
    lead: '因伺服器關閉，白金獎盃已無法透過一般遊玩取得的遊戲一覽。',
    notice: '由於伺服器關閉，白金已無法透過一般遊玩取得。',
  },
  'zh-hans': {
    slug: 'wufa-baijin',
    title: '无法取得的白金',
    lead: '因服务器关闭，白金奖杯已无法通过正常游玩获得的游戏一览。',
    notice: '由于服务器关闭，白金已无法通过正常游玩获得。',
  },
  fi: {
    slug: 'saavuttamaton-platina',
    title: 'Saavuttamaton platina',
    lead: 'Pelit, joiden platinapokaalia ei voi enää saada, koska palvelimet on suljettu.',
    notice: 'Palvelinten sulkemisen vuoksi platinaa ei voi enää saada normaalisti pelaamalla.',
  },
  sv: {
    slug: 'ouppnaelig-platina',
    title: 'Ouppnåelig platina',
    lead: 'Spel vars platinatrofé inte längre går att få eftersom servrarna har stängts.',
    notice: 'Eftersom servrarna har stängts går platinat inte längre att få genom vanligt spel.',
  },
};

const SLUGS = new Set(Object.values(SERVERTOT_PAGE).map((entry) => entry.slug));

export function servertotPageCopy(locale) {
  const key = normalizeLocale(locale);
  return SERVERTOT_PAGE[key] || SERVERTOT_PAGE.de;
}

export function servertotPublicPath(locale) {
  const copy = servertotPageCopy(locale);
  return `/${normalizeLocale(locale)}/${copy.slug}`;
}

/** /de/unerreichbare-platin und die übrigen Sprachadressen. /servertot bleibt der alte Einstieg. */
export function parseServertotPath(pathname = '') {
  const parts = String(pathname || '').split('?')[0].split('/').filter(Boolean);
  if (parts.length === 1 && parts[0] === 'servertot') {
    return { locale: null, slug: 'servertot', legacy: true };
  }
  if (parts.length !== 2) return null;
  if (!SUPPORTED_LOCALES.includes(parts[0])) return null;
  if (!SLUGS.has(parts[1])) return null;
  return { locale: parts[0], slug: parts[1], legacy: false };
}
