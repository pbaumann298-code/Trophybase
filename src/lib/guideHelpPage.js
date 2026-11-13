import { SUPPORTED_LOCALES } from '../../shared/countryLocaleMap.js';
import { normalizeLocale } from './locale.js';

/**
 * Öffentliche „Kurz erklärt“-Seite je Sprache.
 * Kanonisch immer mit Sprachpräfix: /{locale}/{slug}.
 * /kurz-erklaert und /how-it-works ohne Präfix sind Legacy-Einstiege.
 */
export const GUIDE_HELP_PAGE = {
  de: {
    slug: 'kurz-erklaert',
    title: 'Kurz erklärt',
    lead: 'So funktioniert TrophyBase: interaktive PlayStation Trophäen-Guides, Echtzeit-Checklisten, Video-Timestamps, Spamschutz und Spezial-Kataloge.',
    spamTitle: 'Integrierter Spamschutz',
    spamBeforeHub: 'Schluss mit Shovelware – filtere ',
    spamAfterHub:
      ' auf der Startseite und in der Suche mit einem Klick aus deiner Ansicht. Wer gezielt kurze Platin-Spiele sucht, findet sie gebündelt im eigenen Katalog.',
    hubsTitle: 'Spezial-Kataloge',
    hubsIntro: 'Drei eigene Übersichten bündeln besondere Platin-Kategorien außerhalb des regulären Hauptkatalogs:',
  },
  en: {
    slug: 'how-it-works',
    title: 'How It Works',
    lead: 'How TrophyBase works: interactive PlayStation trophy guides, real-time checklists, video timestamps, spam protection, and special catalogs.',
    spamTitle: 'Built-in spam protection',
    spamBeforeHub: 'No more shovelware — filter ',
    spamAfterHub:
      ' out of your home feed and search results with a single click. If you are specifically looking for short platinum games, you can browse them in their own dedicated hub.',
    hubsTitle: 'Special catalogs',
    hubsIntro: 'Three dedicated hubs group special platinum categories separately from the main catalog:',
  },
  fr: {
    slug: 'en-bref',
    title: 'En bref',
    lead: 'Découvrez TrophyBase : guides de trophées PlayStation interactifs, listes de contrôle en temps réel, repères vidéo, filtre anti-spam et catalogues dédiés.',
    spamTitle: 'Protection anti-spam intégrée',
    spamBeforeHub: 'Fini le shovelware — filtrez les ',
    spamAfterHub:
      ' de l’accueil et de la recherche en un clic. Ceux qui recherchent des platines rapides les retrouvent rassemblés dans un catalogue dédié.',
    hubsTitle: 'Catalogues spéciaux',
    hubsIntro: 'Trois pages dédiées regroupent les catégories particulières de trophées platine :',
  },
  es: {
    slug: 'como-funciona',
    title: 'Cómo funciona',
    lead: 'Así funciona TrophyBase: guías interactivas de trofeos de PlayStation, listas de verificación, marcas de tiempo en vídeo, filtro antispam y catálogos especiales.',
    spamTitle: 'Filtro antispam integrado',
    spamBeforeHub: 'Basta de shovelware: oculta los ',
    spamAfterHub:
      ' de la portada y de la búsqueda con un solo clic. Si buscas platinos cortos, los tienes reunidos en su propio catálogo.',
    hubsTitle: 'Catálogos especiales',
    hubsIntro: 'Tres secciones específicas agrupan categorías especiales de trofeos de platino:',
  },
  it: {
    slug: 'in-breve',
    title: 'In breve',
    lead: 'Come funziona TrophyBase: guide interattive ai trofei PlayStation, checklist in tempo reale, timestamp video, filtro anti-spam e cataloghi speciali.',
    spamTitle: 'Protezione anti-spam integrata',
    spamBeforeHub: 'Basta shovelware: filtra i ',
    spamAfterHub:
      ' dalla home e dalla ricerca con un clic. Chi cerca giochi brevi per il platino li trova raccolti in un catalogo dedicato.',
    hubsTitle: 'Cataloghi speciali',
    hubsIntro: 'Tre raccolte dedicate riuniscono le categorie speciali di trofei di platino:',
  },
  nl: {
    slug: 'kort-uitgelegd',
    title: 'Kort uitgelegd',
    lead: 'Zo werkt TrophyBase: interactieve PlayStation-trofeegidsen, realtime-checklists, videotimestamps, spamfilter en speciale catalogi.',
    spamTitle: 'Ingebouwde spambescherming',
    spamBeforeHub: 'Gedaan met shovelware — filter ',
    spamAfterHub:
      ' met één klik uit de startpagina en zoekresultaten. Wie gericht op zoek is naar korte platinagames, vindt ze overzichtelijk in een eigen catalogus.',
    hubsTitle: 'Speciale catalogi',
    hubsIntro: 'Drie aparte overzichten bundelen bijzondere platinacategorieën buiten de hoofdcatalogus:',
  },
  pt: {
    slug: 'como-funciona',
    title: 'Como funciona',
    lead: 'Como funciona o TrophyBase: guias interativos de troféus PlayStation, checklists em tempo real, marcações de vídeo, filtro antispam e catálogos especiais.',
    spamTitle: 'Proteção antispam integrada',
    spamBeforeHub: 'Chega de shovelware — filtre ',
    spamAfterHub:
      ' da página inicial e da pesquisa com um clique. Quem procura jogos curtos de platina encontra todos reunidos em um catálogo próprio.',
    hubsTitle: 'Catálogos especiais',
    hubsIntro: 'Três páginas dedicadas reúnem categorias especiais de troféus de platina:',
  },
  pl: {
    slug: 'w-skrocie',
    title: 'W skrócie',
    lead: 'Jak działa TrophyBase: interaktywne poradniki trofeów PlayStation, listy kontrolne na żywo, znaczniki czasu wideo, filtr antyspamowy i katalogi specjalne.',
    spamTitle: 'Wbudowana ochrona przed spamem',
    spamBeforeHub: 'Koniec z shovelware — ukryj ',
    spamAfterHub:
      ' na stronie głównej i w wyszukiwarce jednym kliknięciem. Osoby szukające szybkich platyn znajdą je w osobnym katalogu.',
    hubsTitle: 'Katalogi specjalne',
    hubsIntro: 'Trzy dedykowane zestawienia grupują szczególne kategorie trofeów platynowych:',
  },
  ru: {
    slug: 'kratko-o-proekte',
    title: 'Коротко о проекте',
    lead: 'Как работает TrophyBase: интерактивные гайды по трофеям PlayStation, чек-листы, видео-таймкоды, защита от спама и специальные каталоги.',
    spamTitle: 'Встроенная защита от спама',
    spamBeforeHub: 'Никакого shovelware — скройте раздел «',
    spamAfterHub:
      '» с главной страницы и из поиска в один клик. Если же вам нужны быстрые платины, они собраны в отдельном каталоге.',
    hubsTitle: 'Специальные каталоги',
    hubsIntro: 'Три отдельные подборки объединяют особые категории платиновых трофеев:',
  },
  ja: {
    slug: 'gaiyou',
    title: 'ガイド概要',
    lead: 'TrophyBaseの使い方：PlayStation向けインタラクティブ・トロフィーガイド、チェックリスト、動画タイムスタンプ、スパム対策フィルター、特別カタログの案内。',
    spamTitle: 'スパム対策フィルター',
    spamBeforeHub: '大量生産のShovelwareをワンクリックで除外 — ホームや検索結果から「',
    spamAfterHub:
      '」を非表示にできます。短時間で獲得できるプラチナを探す場合は、専用カタログから一覧できます。',
    hubsTitle: '特別カタログ',
    hubsIntro: '通常カタログとは別に、特徴的なプラチナカテゴリーを3つの専用ページにまとめています：',
  },
  ko: {
    slug: 'gaeyo',
    title: '서비스 안내',
    lead: 'TrophyBase 안내: 인터랙티브 PlayStation 트로피 가이드, 실시간 체크리스트, 동영상 타임스탬프, 스팸 방지 필터 및 특별 카탈로그.',
    spamTitle: '내장 스팸 방지 필터',
    spamBeforeHub: '양산형 Shovelware 걱정 끝 — 클릭 한 번으로 홈과 검색에서 ',
    spamAfterHub:
      ' 게임을 숨길 수 있습니다. 빠른 플래티넘 게임을 찾는 분들을 위해 전용 카탈로그도 별도로 제공됩니다.',
    hubsTitle: '특별 카탈로그',
    hubsIntro: '세 가지 전용 허브에서 특별한 플래티넘 카테고리를 한눈에 확인할 수 있습니다:',
  },
  'zh-hant': {
    slug: 'jianjie',
    title: '網站簡介',
    lead: 'TrophyBase 網站簡介：互動式 PlayStation 獎盃攻略、即時勾選清單、影片時間軸、防洗版過濾器與專屬分類目錄。',
    spamTitle: '內建防洗版過濾',
    spamBeforeHub: '告別罐頭遊戲（Shovelware）——一鍵在首頁與搜尋結果中隱藏「',
    spamAfterHub:
      '」。若想專門尋找快速白金遊戲，也可在獨立專區中集中瀏覽。',
    hubsTitle: '專屬分類目錄',
    hubsIntro: '三個獨立專區將特殊類型的白金獎盃與主目錄分開整理：',
  },
  'zh-hans': {
    slug: 'jianjie',
    title: '网站简介',
    lead: 'TrophyBase 网站简介：互动式 PlayStation 奖杯攻略、实时勾选清单、视频时间戳、防刷屏过滤器与专属分类目录。',
    spamTitle: '内置防刷屏过滤',
    spamBeforeHub: '告别罐头游戏（Shovelware）——一键在首页与搜索结果中隐藏“',
    spamAfterHub:
      '”。若想专门寻找快速白金游戏，也可在独立专区中集中浏览。',
    hubsTitle: '专属分类目录',
    hubsIntro: '三个独立专区将特殊类型的白金奖杯与主目录分开整理：',
  },
  fi: {
    slug: 'lyhyesti',
    title: 'Lyhyesti',
    lead: 'Näin TrophyBase toimii: interaktiiviset PlayStation-pokaalioppaat, tarkistuslistat, videoiden aikaleimat, roskapostisuodatin ja erikoiskatalogit.',
    spamTitle: 'Sisäänrakennettu suodatin',
    spamBeforeHub: 'Ei enää shovelware-täytettä — suodata ',
    spamAfterHub:
      ' pois etusivulta ja hausta yhdellä napsautuksella. Lyhyitä platinapelejä etsivät löytävät ne siististi omasta katalogistaan.',
    hubsTitle: 'Erikoiskatalogit',
    hubsIntro: 'Kolme erillistä kokoelmaa kokoavat erityiset platinakategoriat omille sivuilleen:',
  },
  sv: {
    slug: 'kort-forklarat',
    title: 'Kort förklarat',
    lead: 'Så fungerar TrophyBase: interaktiva PlayStation-troféguider, checklistor i realtid, videotidsstämplar, spamfilter och specialkataloger.',
    spamTitle: 'Inbyggt spamskydd',
    spamBeforeHub: 'Slipp shovelware — filtrera bort ',
    spamAfterHub:
      ' från startsidan och sökningen med ett klick. Vill du hitta korta platinaspel finns de samlade i en egen katalog.',
    hubsTitle: 'Specialkataloger',
    hubsIntro: 'Tre särskilda översikter samlar speciella platinakategorier utanför huvudkatalogen:',
  },
  ar: {
    slug: 'how-it-works',
    title: 'نبذة سريعة',
    lead: 'كيف يعمل TrophyBase: أدلة كؤوس PlayStation التفاعلية، قوائم التحقق الفورية، الطوابع الزمنية للفيديو، فلتر الحماية والفهارس الخاصة.',
    spamTitle: 'فلتر مدمج ضد الألعاب المكررة',
    spamBeforeHub: 'وداعًا لألعاب الحشو (Shovelware) — أخفِ فئة ',
    spamAfterHub:
      ' من الصفحة الرئيسية والبحث بنقرة واحدة، أو تصفحها بشكل مستقل في فهرسها المخصص.',
    hubsTitle: 'الفهارس الخاصة',
    hubsIntro: 'ثلاث صفحات مخصصة تجمع فئات البلاتينيوم الخاصة بشكل منفصل عن الفهرس الرئيسي:',
  },
};

const LEGACY_SLUGS = new Set(['kurz-erklaert', 'how-it-works']);

const KNOWN_SLUGS = new Set([
  ...Object.values(GUIDE_HELP_PAGE).map((entry) => entry.slug),
  ...LEGACY_SLUGS,
]);

export function guideHelpPageCopy(locale) {
  const key = normalizeLocale(locale);
  return GUIDE_HELP_PAGE[key] || GUIDE_HELP_PAGE.de;
}

export function guideHelpPublicPath(locale) {
  const copy = guideHelpPageCopy(locale);
  return `/${normalizeLocale(locale)}/${copy.slug}`;
}

/** /{locale}/{slug} sowie Legacy /kurz-erklaert und /how-it-works. */
export function parseGuideHelpPath(pathname = '') {
  const pathOnly = String(pathname || '').split('?')[0].split('#')[0];
  const parts = pathOnly.split('/').filter(Boolean);
  if (parts.length === 1 && LEGACY_SLUGS.has(parts[0])) {
    return { locale: null, slug: parts[0], legacy: true };
  }
  if (parts.length !== 2) return null;
  if (!SUPPORTED_LOCALES.includes(parts[0])) return null;
  if (!KNOWN_SLUGS.has(parts[1])) return null;
  return {
    locale: parts[0],
    slug: parts[1],
    legacy: parts[1] !== GUIDE_HELP_PAGE[parts[0]]?.slug,
  };
}
