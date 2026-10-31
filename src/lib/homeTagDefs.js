import { GAME_PK, GAME_STRUCT, TABLES } from './gameSchema.js';
import { normalizeLocale } from './locale.js';

const HOME_TAG_DEFS = 'home_tag_defs';

/** Lokalisierte Labels für alle 26 home_tags-Slugs. */
export const HOME_TAG_TRANSLATIONS = {
  soulslike: {
    de: 'Souls / Soulslike',
    en: 'Souls / Soulslike',
    es: 'Souls / Soulslike',
    pt: 'Souls / Soulslike',
    pl: 'Souls / Soulslike',
    fr: 'Souls / Soulslike',
    it: 'Souls / Soulslike',
    nl: 'Souls / Soulslike',
    ru: 'Souls / Soulslike',
    ja: 'Souls / ソウルライク',
    ko: '소울 / 소울라이크',
    'zh-hans': '魂系 / 类魂',
    'zh-hant': '魂系 / 類魂',
    fi: 'Souls / Soulslike',
    sv: 'Souls / Soulslike',
    ar: 'سولز / شبيهة سولز',
  },
  open_world: {
    de: 'Open World',
    en: 'Open World',
    es: 'Mundo abierto',
    pt: 'Mundo Aberto',
    pl: 'Otwarty świat',
    fr: 'Monde ouvert',
    it: 'Open World',
    nl: 'Open wereld',
    ru: 'Открытый мир',
    ja: 'オープンワールド',
    ko: '오픈 월드',
    'zh-hans': '开放世界',
    'zh-hant': '開放世界',
    fi: 'Avoin maailma',
    sv: 'Öppen värld',
    ar: 'عالم مفتوح',
  },
  family: {
    de: 'Familienspaß & Easy Platin',
    en: 'Family & Easy Platinum',
    es: 'Diversión familiar y platinos fáciles',
    pt: 'Diversão em família e platinas fáceis',
    pl: 'Gry rodzinne i łatwe platyny',
    fr: 'Fun en famille & platines faciles',
    it: 'Divertimento in famiglia e platini facili',
    nl: 'Familieplezier & makkelijke platina',
    ru: 'Семейные и легкие платины',
    ja: 'ファミリー & 簡単プラチナ',
    ko: '패밀리 & 쉬운 플래티넘',
    'zh-hans': '合家欢与轻松白金',
    'zh-hant': '闔家歡與輕鬆白金',
    fi: 'Perhepelit & helppo platina',
    sv: 'Familjespel & enkla platinas',
    ar: 'ألعاب عائلية وبلاتينيوم سهل',
  },
  indie: {
    de: 'Indie',
    en: 'Indie',
    es: 'Indie',
    pt: 'Indie',
    pl: 'Indie',
    fr: 'Indé',
    it: 'Indie',
    nl: 'Indie',
    ru: 'Инди',
    ja: 'インディー',
    ko: '인디',
    'zh-hans': '独立游戏',
    'zh-hant': '獨立遊戲',
    fi: 'Indie',
    sv: 'Indie',
    ar: 'ألعاب مستقلة (Indie)',
  },
  racing: {
    de: 'Rennspiel',
    en: 'Racing',
    es: 'Carreras',
    pt: 'Corrida',
    pl: 'Wyścigi',
    fr: 'Course',
    it: 'Corse',
    nl: 'Race',
    ru: 'Гонки',
    ja: 'レーシング',
    ko: '레이싱',
    'zh-hans': '竞速',
    'zh-hant': '競速',
    fi: 'Ajopelit',
    sv: 'Racing',
    ar: 'سباقات',
  },
  fps: {
    de: 'Ego-Shooter (FPS)',
    en: 'First-Person Shooter (FPS)',
    es: 'Shooter en primera persona (FPS)',
    pt: 'Tiro em primeira pessoa (FPS)',
    pl: 'Strzelanka pierwszoosobowa (FPS)',
    fr: 'FPS (Tir à la 1re personne)',
    it: 'Sparatutto in prima persona (FPS)',
    nl: 'First-person shooter (FPS)',
    ru: 'Шутер от первого лица (FPS)',
    ja: 'FPS（一人称シューティング）',
    ko: '1인칭 슈팅 (FPS)',
    'zh-hans': '第一人称射击 (FPS)',
    'zh-hant': '第一人稱射擊 (FPS)',
    fi: 'Ensimmäisen persoonan räiskintä (FPS)',
    sv: 'Förstapersonsskjutare (FPS)',
    ar: 'تصويب منظور الشخص الأول (FPS)',
  },
  tps: {
    de: 'Third-Person-Shooter',
    en: 'Third-Person Shooter',
    es: 'Shooter en tercera persona',
    pt: 'Tiro em terceira pessoa',
    pl: 'Strzelanka trzecioosobowa',
    fr: 'Tir à la 3e personne',
    it: 'Sparatutto in terza persona',
    nl: 'Third-person shooter',
    ru: 'Шутер от третьего лица',
    ja: 'TPS（三人称シューティング）',
    ko: '3인칭 슈팅 (TPS)',
    'zh-hans': '第三人称射击',
    'zh-hant': '第三人稱射擊',
    fi: 'Kolmannen persoonan räiskintä',
    sv: 'Tredjepersonsskjutare',
    ar: 'تصويب منظور الشخص الثالث (TPS)',
  },
  loot_shooter: {
    de: 'Loot-Shooter',
    en: 'Loot Shooter',
    es: 'Loot Shooter',
    pt: 'Loot Shooter',
    pl: 'Loot Shooter',
    fr: 'Loot Shooter',
    it: 'Loot Shooter',
    nl: 'Loot Shooter',
    ru: 'Лут-шутер',
    ja: 'ルートシューター',
    ko: '루트 슈터',
    'zh-hans': '刷宝射击',
    'zh-hant': '刷寶射擊',
    fi: 'Loot Shooter',
    sv: 'Loot Shooter',
    ar: 'تصويب وجمع غنائم (Loot Shooter)',
  },
  tactics: {
    de: 'Strategie & Taktik',
    en: 'Strategy & Tactics',
    es: 'Estrategia y táctica',
    pt: 'Estratégia e tática',
    pl: 'Strategia i taktyka',
    fr: 'Stratégie & Tactique',
    it: 'Strategia e tattica',
    nl: 'Strategie & Tactiek',
    ru: 'Стратегии и тактика',
    ja: 'ストラテジー & タクティクス',
    ko: '전략 & 전술',
    'zh-hans': '策略与战术',
    'zh-hant': '策略與戰術',
    fi: 'Strategia & Taktiikka',
    sv: 'Strategi & Taktik',
    ar: 'استراتيجية وتكتيك',
  },
  coop_mp: {
    de: 'Koop & Multiplayer',
    en: 'Co-op & Multiplayer',
    es: 'Cooperativo y multijugador',
    pt: 'Co-op e multijogador',
    pl: 'Kooperacja i multiplayer',
    fr: 'Coop & Multijoueur',
    it: 'Co-op e multigiocatore',
    nl: 'Co-op & Multiplayer',
    ru: 'Кооператив и мультиплеер',
    ja: '協力プレイ & マルチプレイ',
    ko: '협동 & 멀티플레이어',
    'zh-hans': '合作与多人联机',
    'zh-hant': '合作與多人連線',
    fi: 'Yhteistyö & Moninpeli',
    sv: 'Co-op & Multiplayer',
    ar: 'تعاوني وجماعي (Co-op & Multiplayer)',
  },
  roguelike: {
    de: 'Roguelike / Roguelite',
    en: 'Roguelike / Roguelite',
    es: 'Roguelike / Roguelite',
    pt: 'Roguelike / Roguelite',
    pl: 'Roguelike / Roguelite',
    fr: 'Roguelike / Roguelite',
    it: 'Roguelike / Roguelite',
    nl: 'Roguelike / Roguelite',
    ru: 'Рогалик (Roguelike)',
    ja: 'ローグライク / ローグライト',
    ko: '로그라이크 / 로그라이트',
    'zh-hans': '肉鸽 (Roguelike)',
    'zh-hant': '肉鴿 (Roguelike)',
    fi: 'Roguelike / Roguelite',
    sv: 'Roguelike / Roguelite',
    ar: 'روغلايك / روغلايت',
  },
  rpg: {
    de: 'Rollenspiel (RPG)',
    en: 'Role-Playing (RPG)',
    es: 'Juego de rol (RPG)',
    pt: 'RPG',
    pl: 'Gry fabularne (RPG)',
    fr: 'Jeu de rôle (RPG)',
    it: 'Gioco di ruolo (RPG)',
    nl: 'RPG (Rollenspel)',
    ru: 'Ролевая игра (RPG)',
    ja: 'RPG（ロールプレイング）',
    ko: '롤플레잉 (RPG)',
    'zh-hans': '角色扮演 (RPG)',
    'zh-hant': '角色扮演 (RPG)',
    fi: 'Roolipeli (RPG)',
    sv: 'Rollspel (RPG)',
    ar: 'تقمص أدوار (RPG)',
  },
  action_adventure: {
    de: 'Action-Adventure',
    en: 'Action-Adventure',
    es: 'Acción y aventura',
    pt: 'Ação e Aventura',
    pl: 'Przygodowa gra akcji',
    fr: 'Action-Aventure',
    it: 'Azione e avventura',
    nl: 'Actie-avontuur',
    ru: 'Экшен-приключение',
    ja: 'アクションアドベンチャー',
    ko: '액션 어드벤처',
    'zh-hans': '动作冒险',
    'zh-hant': '動作冒險',
    fi: 'Toimintaseikkailu',
    sv: 'Actionäventyr',
    ar: 'أكشن ومغامرات',
  },
  survival_horror: {
    de: 'Horror & Survival',
    en: 'Horror & Survival',
    es: 'Terror y supervivencia',
    pt: 'Terror e sobrevivência',
    pl: 'Horror i survival',
    fr: 'Horreur & Survie',
    it: 'Horror e sopravvivenza',
    nl: 'Horror & Survival',
    ru: 'Хоррор и выживание',
    ja: 'ホラー & サバイバル',
    ko: '호러 & 서바이벌',
    'zh-hans': '恐怖与生存',
    'zh-hant': '恐怖與生存',
    fi: 'Kauhu & Selviytyminen',
    sv: 'Skräck & Överlevnad',
    ar: 'رعب وبقاء',
  },
  platformer: {
    de: 'Jump ’n’ Run / Platformer',
    en: 'Platformer',
    es: 'Plataformas',
    pt: 'Plataforma',
    pl: 'Platformówka',
    fr: 'Jeu de plateforme',
    it: 'Platform',
    nl: 'Platformer',
    ru: 'Платформер',
    ja: 'プラットフォーマー / アクション',
    ko: '플랫포머',
    'zh-hans': '平台跳跃',
    'zh-hant': '平台跳躍',
    fi: 'Tasohyppely',
    sv: 'Plattformsspel',
    ar: 'منصات (Platformer)',
  },
  fighting: {
    de: 'Beat ’em up / Kampfspiel',
    en: 'Fighting',
    es: 'Lucha',
    pt: 'Luta',
    pl: 'Bijatyki',
    fr: 'Combat',
    it: 'Picchiaduro',
    nl: 'Vechtspel',
    ru: 'Файтинг',
    ja: '格闘ゲーム',
    ko: '격투',
    'zh-hans': '格斗',
    'zh-hant': '格鬥',
    fi: 'Tappelupelit',
    sv: 'Fightingspel',
    ar: 'قتال',
  },
  sports: {
    de: 'Sport',
    en: 'Sports',
    es: 'Deportes',
    pt: 'Esportes',
    pl: 'Sport',
    fr: 'Sport',
    it: 'Sport',
    nl: 'Sport',
    ru: 'Спорт',
    ja: 'スポーツ',
    ko: '스포츠',
    'zh-hans': '体育',
    'zh-hant': '體育',
    fi: 'Urheilu',
    sv: 'Sport',
    ar: 'رياضة',
  },
  simulation: {
    de: 'Simulation',
    en: 'Simulation',
    es: 'Simulación',
    pt: 'Simulação',
    pl: 'Symulacja',
    fr: 'Simulation',
    it: 'Simulazione',
    nl: 'Simulatie',
    ru: 'Симулятор',
    ja: 'シミュレーション',
    ko: '시뮬레이션',
    'zh-hans': '模拟',
    'zh-hant': '模擬',
    fi: 'Simulaatio',
    sv: 'Simulering',
    ar: 'محاكاة',
  },
  hidden_object: {
    de: 'Wimmelbild',
    en: 'Hidden Object',
    es: 'Objetos ocultos',
    pt: 'Objetos ocultos',
    pl: 'Ukryte przedmioty',
    fr: 'Objets cachés',
    it: 'Oggetti nascosti',
    nl: 'Zoek-en-vind',
    ru: 'Поиск предметов',
    ja: 'アイテム探し',
    ko: '숨은그림찾기',
    'zh-hans': '寻物解谜',
    'zh-hant': '尋物解謎',
    fi: 'Piilo-objekti',
    sv: 'Dolda föremål',
    ar: 'بحث عن الأشياء المخفية',
  },
  visual_novel: {
    de: 'Visual Novel',
    en: 'Visual Novel',
    es: 'Novela visual',
    pt: 'Visual Novel',
    pl: 'Visual novel',
    fr: 'Visual Novel',
    it: 'Visual Novel',
    nl: 'Visual Novel',
    ru: 'Визуальная новелла',
    ja: 'ビジュアルノベル',
    ko: '비주얼 노벨',
    'zh-hans': '视觉小说',
    'zh-hant': '視覺小說',
    fi: 'Visual Novel',
    sv: 'Visuell roman',
    ar: 'رواية مرئية (Visual Novel)',
  },
  fmv: {
    de: 'FMV / Interaktiver Film',
    en: 'FMV / Interactive Movie',
    es: 'FMV / Película interactiva',
    pt: 'FMV / Filme interativo',
    pl: 'FMV / Film interaktywny',
    fr: 'FMV / Film interactif',
    it: 'FMV / Film interattivo',
    nl: 'FMV / Interactieve film',
    ru: 'FMV / Интерактивное кино',
    ja: 'FMV / インタラクティブムービー',
    ko: 'FMV / 인터랙티브 무비',
    'zh-hans': 'FMV / 互动电影',
    'zh-hant': 'FMV / 互動電影',
    fi: 'FMV / Interaktiivinen elokuva',
    sv: 'FMV / Interaktiv film',
    ar: 'فيلم تفاعلي (FMV)',
  },
  point_and_click: {
    de: 'Point & Click',
    en: 'Point & Click',
    es: 'Point & Click',
    pt: 'Point & Click',
    pl: 'Point & Click',
    fr: 'Point & Click',
    it: 'Punta e clicca',
    nl: 'Point & Click',
    ru: 'Point & Click (Квест)',
    ja: 'ポイント＆クリック',
    ko: '포인트 앤 클릭',
    'zh-hans': '点击解谜 (Point & Click)',
    'zh-hant': '點擊解謎 (Point & Click)',
    fi: 'Point & Click',
    sv: 'Peka och klicka',
    ar: 'أشر وانقر (Point & Click)',
  },
  mystery_crime: {
    de: 'Mystery, Crime & Detektiv',
    en: 'Mystery, Crime & Detective',
    es: 'Misterio, crimen y detectives',
    pt: 'Mistério, crime e detetive',
    pl: 'Tajemnice, kryminał i detektywi',
    fr: 'Mystère, crime & détective',
    it: 'Mistero, crimine e investigazione',
    nl: 'Mysterie, misdaad & detective',
    ru: 'Детектив и мистика',
    ja: 'ミステリー・犯罪・探偵',
    ko: '미스터리, 범죄 & 탐정',
    'zh-hans': '悬疑、犯罪与侦探',
    'zh-hant': '懸疑、犯罪與偵探',
    fi: 'Mysteeri, rikos & salapoliisi',
    sv: 'Mysterium, brott & detektiv',
    ar: 'غموض وجريمة وتحقيق',
  },
  scifi_cyberpunk: {
    de: 'Sci-Fi & Cyberpunk',
    en: 'Sci-Fi & Cyberpunk',
    es: 'Ciencia ficción y Cyberpunk',
    pt: 'Ficção científica e Cyberpunk',
    pl: 'Sci-Fi i Cyberpunk',
    fr: 'Sci-Fi & Cyberpunk',
    it: 'Fantascienza e Cyberpunk',
    nl: 'Sci-Fi & Cyberpunk',
    ru: 'Научная фантастика и киберпанк',
    ja: 'SF & サイバーパンク',
    ko: 'SF & 사이버펑크',
    'zh-hans': '科幻与赛博朋克',
    'zh-hant': '科幻與賽博龐克',
    fi: 'Sci-Fi & Cyberpunk',
    sv: 'Sci-Fi & Cyberpunk',
    ar: 'خيال علمي وسايبربانك',
  },
  otome_romance: {
    de: 'Otome & Romance',
    en: 'Otome & Romance',
    es: 'Otome y romance',
    pt: 'Otome e romance',
    pl: 'Otome i romans',
    fr: 'Otome & Romance',
    it: 'Otome e romantico',
    nl: 'Otome & Romantiek',
    ru: 'Отомэ и романтика',
    ja: '乙女ゲーム & ロマンス',
    ko: '오토메 & 로맨스',
    'zh-hans': '乙女与恋爱',
    'zh-hant': '乙女與戀愛',
    fi: 'Otome & Romantiikka',
    sv: 'Otome & Romantik',
    ar: 'أوتومي ورومانسية',
  },
  psych_horror: {
    de: 'Psychologischer Horror',
    en: 'Psychological Horror',
    es: 'Terror psicológico',
    pt: 'Terror psicológico',
    pl: 'Horror psychologiczny',
    fr: 'Horreur psychologique',
    it: 'Horror psicologico',
    nl: 'Psychologische horror',
    ru: 'Психологический хоррор',
    ja: 'サイコロジカルホラー',
    ko: '심리적 호러',
    'zh-hans': '心理恐怖',
    'zh-hant': '心理恐怖',
    fi: 'Psykologinen kauhu',
    sv: 'Psykologisk skräck',
    ar: 'رعب نفسي',
  },
};

/**
 * Übersetzt einen einzelnen home_tags-Slug in die aktive Sprache.
 * @param {string} slug
 * @param {string} [locale]
 * @param {string} [fallbackLabel]
 * @returns {string}
 */
export function translateHomeTag(slug, locale = 'de', fallbackLabel = '') {
  const key = homeTagKey(slug);
  if (!key) return fallbackLabel || '';
  const lang = normalizeLocale(locale);
  const map = HOME_TAG_TRANSLATIONS[key];
  if (!map) return fallbackLabel || slug;
  return map[lang] || map.en || fallbackLabel || slug;
}

/**
 * Übersetzt ein Array von home_tags-Slugs in die aktive Sprache und verbindet sie mit ' · '.
 * Falls tags leer ist, Rückfall auf fallbackGenre (auf nicht-deutschen Seiten mit Übersetzung bekannter deutscher Genre-Begriffe).
 * @param {unknown} tags
 * @param {string} [locale]
 * @param {string} [fallbackGenre]
 * @returns {string}
 */
export function formatLocalizedHomeTags(tags, locale = 'de', fallbackGenre = '') {
  let list = [];
  if (Array.isArray(tags)) {
    list = tags;
  } else if (typeof tags === 'string' && tags.trim()) {
    const trimmed = tags.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        // ignore
      }
    } else {
      list = [trimmed];
    }
  }

  const lang = normalizeLocale(locale);
  const seen = new Set();
  const translated = [];

  for (const raw of list) {
    const key = homeTagKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const map = HOME_TAG_TRANSLATIONS[key];
    if (map) {
      const label = map[lang] || map.en;
      if (label && !translated.includes(label)) {
        translated.push(label);
      }
    }
  }

  if (translated.length > 0) {
    return translated.join(' · ');
  }

  const fallback = String(fallbackGenre ?? '').trim();
  if (!fallback || lang === 'de') {
    return fallback;
  }

  // Falls home_tags leer ist, versuche deutsche Standard-Begriffe im fallbackGenre zu übersetzen
  return translateGermanFallbackGenre(fallback, lang);
}

const GERMAN_GENRE_TOKENS = [
  [/rollenspiel(e)?/gi, 'rpg'],
  [/ego-shooter/gi, 'fps'],
  [/third-person-shooter/gi, 'tps'],
  [/loot-shooter/gi, 'loot_shooter'],
  [/strategie\s*&\s*taktik|strategie|taktik/gi, 'tactics'],
  [/koop\s*&\s*multiplayer|koop/gi, 'coop_mp'],
  [/horror\s*&\s*survival|überlebenshorror|survival-horror/gi, 'survival_horror'],
  [/psychologischer\s+horror/gi, 'psych_horror'],
  [/wimmelbild(spiel)?/gi, 'hidden_object'],
  [/interaktiver\s+film/gi, 'fmv'],
  [/rennspiel(e)?/gi, 'racing'],
  [/kampfspiel(e)?/gi, 'fighting'],
  [/abenteuer/gi, 'action_adventure'],
];

function translateGermanFallbackGenre(genreStr, lang) {
  let result = genreStr;
  for (const [regex, tagSlug] of GERMAN_GENRE_TOKENS) {
    const replacement = HOME_TAG_TRANSLATIONS[tagSlug]?.[lang] || HOME_TAG_TRANSLATIONS[tagSlug]?.en;
    if (replacement) {
      result = result.replace(regex, replacement);
    }
  }
  return result;
}

/** Vergleichsschlüssel. Die gespeicherte Schreibweise bleibt der Slug aus der Tabelle. */
export function homeTagKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

const HOME_TAG_SYNONYMS = {
  soulslike: ['souls', 'soulslike', 'souls-like', 'dark souls', 'elden ring'],
  open_world: ['open world', 'open-world', 'openworld', 'sandbox', 'post-apocalyptic', 'postapocalyptic', 'postapokalyptisch'],
  family: ['family', 'familie', 'familienspaß', 'familienspass', 'easy platin', 'easy platinum', 'kinder', 'kids'],
  indie: ['indie', 'indie-perlen', 'indie game'],
  racing: ['racing', 'rennspiel', 'rennspiele', 'rennen', 'asphalt', 'highspeed', 'driving', 'arcade racer'],
  fps: ['fps', 'ego-shooter', 'ego shooter', 'first-person shooter', 'first person shooter', 'first-person'],
  tps: ['tps', 'third-person-shooter', 'third-person shooter', 'third person shooter', 'third-person', 'third person'],
  loot_shooter: ['loot-shooter', 'loot shooter', 'looter shooter', 'looter-shooter'],
  tactics: ['tactics', 'taktik', 'strategie', 'strategy', 'turn-based', 'rundenbasiert', 'rts'],
  coop_mp: ['coop', 'co-op', 'koop', 'multiplayer', 'online-koop', 'online co-op', 'splitscreen'],
  roguelike: ['roguelike', 'roguelite', 'rogue-like', 'rogue-lite', 'bullet heaven'],
  rpg: ['rpg', 'rollenspiel', 'rollenspiele', 'role-playing', 'role playing', 'jrpg', 'arpg', 'action-rpg'],
  action_adventure: ['action-adventure', 'action adventure', 'action', 'adventure', 'abenteuer', 'hack and slash', 'stealth'],
  survival_horror: ['survival horror', 'survival-horror', 'horror', 'survival', 'überlebenshorror', 'zombie'],
  platformer: ['platformer', 'jump n run', "jump 'n' run", 'jump & run', 'metroidvania', '2d platformer', '3d platformer'],
  fighting: ['fighting', 'beat em up', "beat 'em up", 'kampfspiel', 'kampfspiele', 'brawler', 'fighter'],
  sports: ['sports', 'sport', 'sportspiel', 'fußball', 'football', 'soccer', 'basketball', 'skate', 'golf', 'tennis'],
  simulation: ['simulation', 'simulator', 'sim', 'management', 'aufbau', 'farming', 'tycoon'],
  hidden_object: ['hidden object', 'hidden-object', 'wimmelbild', 'wimmelbildspiel'],
  visual_novel: ['visual novel', 'visual-novel', 'vn'],
  fmv: ['fmv', 'interactive movie', 'interactive film', 'interaktiver film', 'full motion video'],
  point_and_click: ['point & click', 'point and click', 'point-and-click', 'graphic adventure'],
  mystery_crime: ['mystery', 'crime', 'detective', 'detektiv', 'krimi', 'investigation', 'thriller'],
  scifi_cyberpunk: ['sci-fi', 'scifi', 'science fiction', 'cyberpunk', 'space', 'weltraum', 'mecha'],
  otome_romance: ['otome', 'romance', 'romantik', 'dating sim'],
  psych_horror: ['psychological horror', 'psychologischer horror', 'psych horror', 'psycho-horror'],
};

function normalizeGenreSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[-_/&+.,:;'"’()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Löst eine Freitext- oder Subgenre-Suchanfrage (z. B. "Looter Shooter", "Third-Person",
 * "Soulslike", "Ego-Shooter") in passende `home_tags`-Slugs auf.
 * @param {string} query
 * @returns {string[]}
 */
export function resolveMatchingHomeTagSlugs(query) {
  const normQuery = normalizeGenreSearchText(query);
  if (!normQuery || normQuery.length < 2) return [];

  const matched = new Set();

  for (const [slug, translations] of Object.entries(HOME_TAG_TRANSLATIONS)) {
    const slugNorm = normalizeGenreSearchText(slug);
    if (slugNorm === normQuery || (normQuery.length >= 3 && slugNorm.includes(normQuery))) {
      matched.add(slug);
      continue;
    }

    const candidates = [
      ...Object.values(translations ?? {}),
      ...(HOME_TAG_SYNONYMS[slug] ?? []),
    ];

    for (const label of candidates) {
      const labelNorm = normalizeGenreSearchText(label);
      if (!labelNorm) continue;
      if (
        labelNorm === normQuery ||
        (normQuery.length >= 3 && labelNorm.includes(normQuery)) ||
        (labelNorm.length >= 3 && normQuery.includes(labelNorm))
      ) {
        matched.add(slug);
        break;
      }
    }
  }

  return [...matched];
}

/**
 * @param {object | null | undefined} game
 * @returns {string[]}
 */
export function readHomeTags(game) {
  const raw = game?.[GAME_STRUCT.homeTags];
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const tags = [];
  for (const value of raw) {
    const slug = String(value ?? '').trim();
    const key = homeTagKey(slug);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    tags.push(slug);
  }
  return tags;
}

/**
 * @param {{ slug: string }[]} defs
 * @param {string[]} slugs
 */
export function orderHomeTags(defs, slugs) {
  const chosen = new Set((slugs ?? []).map(homeTagKey).filter(Boolean));
  return (defs ?? []).filter((def) => chosen.has(homeTagKey(def.slug))).map((def) => def.slug);
}

/**
 * Allowlist aus home_tag_defs, sortiert wie in der Tabelle.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function fetchHomeTagDefs(supabase) {
  const { data, error } = await supabase
    .from(HOME_TAG_DEFS)
    .select('slug, label, rail_id, sort_pos')
    .order('sort_pos', { ascending: true })
    .order('slug', { ascending: true });

  if (error) return { data: [], error };
  const defs = (data ?? [])
    .map((row) => ({
      slug: String(row.slug ?? '').trim(),
      label: String(row.label ?? '').trim() || String(row.slug ?? '').trim(),
      railId: String(row.rail_id ?? '').trim(),
      sortPos: Number(row.sort_pos) || 0,
    }))
    .filter((row) => row.slug);
  return { data: defs, error: null };
}

/**
 * Redaktionelle Zuordnung. Sperrt die Zeile, damit das Modell sie nicht überschreibt.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} gameId
 * @param {string[]} tags
 * @param {{ slug: string }[]} [defs]
 */
export async function setEditorialHomeTags(supabase, gameId, tags, defs = []) {
  const id = String(gameId ?? '').trim();
  if (!id) return { homeTags: null, error: new Error('Kein Spiel ausgewählt.') };

  const next = defs.length
    ? orderHomeTags(defs, tags)
    : [...new Set((tags ?? []).map((tag) => String(tag ?? '').trim()).filter(Boolean))];
  const { data, error } = await supabase.rpc('tb_set_home_tags_editorial', {
    p_id: id,
    p_tags: next,
    p_lock: true,
  });

  if (!error) {
    if (data === false) return { homeTags: null, error: new Error('Spiel nicht gefunden.') };
    return { homeTags: next, error: null };
  }

  const message = String(error.message ?? '');
  const missingRpc = error.code === 'PGRST202' || /tb_set_home_tags_editorial/i.test(message);
  if (!missingRpc) return { homeTags: null, error };

  const { data: updated, error: updateError } = await supabase
    .from(TABLES.games)
    .update({
      [GAME_STRUCT.homeTags]: next,
      [GAME_STRUCT.homeTagsLocked]: true,
    })
    .eq(GAME_PK, id)
    .select(GAME_STRUCT.homeTags)
    .maybeSingle();

  if (updateError) return { homeTags: null, error: updateError };
  return { homeTags: readHomeTags(updated), error: null };
}
