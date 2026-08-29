import { SUPPORTED_LOCALES } from './locale';

/** UI-Texte für Website-Chrome (Header, Footer, gemeinsame Labels) */
export const UI_STRINGS = {
  de: {
    profile: 'Profil',
    login: 'Anmelden',
    logout: 'Abmelden',
    admin: 'Admin',
    language: 'Sprache',
    guideLanguage: 'Guide-Sprache',
    guideLanguageHint: 'Website',
    guideLanguageReset: 'Standard',
    impressum: 'Impressum',
    privacy: 'Datenschutz (DSGVO)',
    fairUseNote:
      'Cover, Logos und Spieltitel dienen nur der Identifikation im redaktionellen Datenbank-Kontext. TrophyBase ist nicht mit den Rechteinhabern affiliated.',
    consentTitle: 'Hinweise zu externen Inhalten',
    consentBody:
      'Kein Tracking, keine Affiliate-Cookies. YouTube-Videos laden wir erst nach deiner Zustimmung (Cookies von Google). Vorschaubilder kommen vom YouTube-Bild-CDN, ohne Player.',
    consentAllowYoutube: 'YouTube erlauben',
    consentNecessary: 'Ablehnen',
    consentYoutubeGate:
      'Vorschaubild ohne Player. YouTube setzt Cookies von Google erst, wenn du das Video lädst.',
    consentYoutubeLoad: 'YouTube-Video laden',
    dbConnected: 'Erfolgreich verbunden!',
    dbFailed: 'Fehlgeschlagen',
    dbLabel: 'DB',
    backDashboard: '← Zurück zum Dashboard',
    trophies: 'Trophäen',
    fullGameplay: 'Walkthrough',
    completion: 'Sammelobjekte',
    bosses: 'Bosse',
    hideCompleted: 'Erledigte ausblenden',
    guideLoading: 'Guide-Daten werden geladen …',
    loadingGuide: 'Guide wird geladen…',
    searchPlaceholder: 'Spieltitel, Genre oder Entwickler …',
    advancedSearch: 'Erweiterte Suche',
    advancedSearchHint:
      'Kombiniere Spieltitel, Entwickler, Genre und Konsole. Leere Felder werden ignoriert.',
    searchTitle: 'Spieltitel',
    searchDeveloper: 'Entwickler',
    searchGenre: 'Genre',
    searchConsole: 'Konsole',
    searchSubmit: 'Suchen',
    searchReset: 'Zurücksetzen',
    searchBack: '← Zurück zur Startseite',
    consoleAll: 'Alle Konsolen',
    advancedSearchEmpty: 'Bitte mindestens ein Feld ausfüllen.',
    searchAria: 'Spielsuche',
    searchStartAria: 'Suche starten',
    homeKicker: 'TrophyBase · Dein Guide-Hub',
    homeTitle: 'Finde deinen nächsten Platin-Run',
    homeSub:
      'Acht kuratierte Welten – vom Souls-Hardcore bis zur Familien-Platin. Wähle die Reihe, die zu deinem Gamer-Typ passt.',
    watchlistTitle: 'Watchlist',
    watchlistCountOne: '1 Spiel',
    watchlistCountMany: '{n} Spiele',
    watchlistEmpty:
      'Noch keine Spiele auf deiner Watchlist. Markiere Spiele mit dem ☆-Symbol in den Kategorien oder auf der Spieleseite.',
    creatorCredit:
      'Dieser Guide nutzt Inhalte aus den wunderbaren Videos von {name}. Wenn du die Videos von {name} genauso zu schätzen weißt wie wir, lass doch bitte ein Abo da. Jede Unterstützung hilft, um noch mehr tolle Inhalte zu erstellen!',
    creatorYoutube: 'YouTube',
  },
  en: {
    profile: 'Profile',
    login: 'Sign in',
    logout: 'Sign out',
    admin: 'Admin',
    language: 'Language',
    guideLanguage: 'Guide language',
    guideLanguageHint: 'Site',
    guideLanguageReset: 'Default',
    impressum: 'Legal notice',
    privacy: 'Privacy (GDPR)',
    fairUseNote:
      'Covers, logos and titles are used only to identify games in an editorial database. TrophyBase is not affiliated with the rights holders.',
    consentTitle: 'External content',
    consentBody:
      'No tracking and no affiliate cookies. YouTube videos load only after you consent (Google cookies). Preview images come from YouTube’s image CDN, without the player.',
    consentAllowYoutube: 'Allow YouTube',
    consentNecessary: 'Decline',
    consentYoutubeGate:
      'Preview image without the player. YouTube sets Google cookies only when you load the video.',
    consentYoutubeLoad: 'Load YouTube video',
    dbConnected: 'Connected successfully!',
    dbFailed: 'Failed',
    dbLabel: 'DB',
    backDashboard: '← Back to dashboard',
    trophies: 'Trophies',
    fullGameplay: 'Walkthrough',
    completion: 'Collectibles',
    bosses: 'Bosses',
    hideCompleted: 'Hide completed',
    guideLoading: 'Loading guide data…',
    loadingGuide: 'Loading guide…',
    searchPlaceholder: 'Game title, genre or developer…',
    advancedSearch: 'Advanced search',
    advancedSearchHint:
      'Combine game title, developer, genre and console. Empty fields are ignored.',
    searchTitle: 'Game title',
    searchDeveloper: 'Developer',
    searchGenre: 'Genre',
    searchConsole: 'Console',
    searchSubmit: 'Search',
    searchReset: 'Reset',
    searchBack: '← Back to home',
    consoleAll: 'All consoles',
    advancedSearchEmpty: 'Please fill in at least one field.',
    searchAria: 'Game search',
    searchStartAria: 'Start search',
    homeKicker: 'TrophyBase · Your guide hub',
    homeTitle: 'Find your next platinum run',
    homeSub:
      'Eight curated worlds — from Souls hardcore to family platinums. Pick the row that fits your play style.',
    watchlistTitle: 'Watchlist',
    watchlistCountOne: '1 game',
    watchlistCountMany: '{n} games',
    watchlistEmpty:
      'No games on your watchlist yet. Star games in the categories or on a game page.',
    creatorCredit:
      'This guide uses footage from the wonderful videos by {name}. If you enjoy {name}’s videos as much as we do, please consider subscribing. Every bit of support helps create even more great content!',
    creatorYoutube: 'YouTube',
  },
  es: {
    profile: 'Perfil',
    login: 'Iniciar sesión',
    logout: 'Cerrar sesión',
    admin: 'Admin',
    language: 'Idioma',
    guideLanguage: 'Idioma de la guía',
    guideLanguageHint: 'Sitio',
    guideLanguageReset: 'Predeterminado',
    impressum: 'Aviso legal',
    privacy: 'Privacidad (RGPD)',
    fairUseNote:
      'Carátulas, logos y títulos se usan solo para identificar juegos en una base editorial. TrophyBase no está afiliado a los titulares.',
    consentTitle: 'Contenido externo',
    consentBody:
      'Sin medición de audiencia ni cookies de afiliados. Los vídeos de YouTube se cargan solo con tu consentimiento (cookies de Google). Las miniaturas vienen del CDN de imágenes de YouTube, sin reproductor.',
    consentAllowYoutube: 'Permitir YouTube',
    consentNecessary: 'Rechazar',
    consentYoutubeGate:
      'Miniatura sin reproductor. YouTube establece cookies de Google solo al cargar el vídeo.',
    consentYoutubeLoad: 'Cargar vídeo de YouTube',
    dbConnected: '¡Conectado correctamente!',
    dbFailed: 'Error',
    dbLabel: 'BD',
    backDashboard: '← Volver al panel',
    trophies: 'Trofeos',
    fullGameplay: 'Walkthrough',
    completion: 'Coleccionables',
    bosses: 'Jefes',
    hideCompleted: 'Ocultar completados',
    guideLoading: 'Cargando datos de la guía…',
    loadingGuide: 'Cargando guía…',
    searchPlaceholder: 'Título, género o desarrollador…',
    advancedSearch: 'Búsqueda avanzada',
    advancedSearchHint:
      'Combina título, desarrollador, género y consola. Los campos vacíos se ignoran.',
    searchTitle: 'Título',
    searchDeveloper: 'Desarrollador',
    searchGenre: 'Género',
    searchConsole: 'Consola',
    searchSubmit: 'Buscar',
    searchReset: 'Restablecer',
    searchBack: '← Volver al inicio',
    consoleAll: 'Todas las consolas',
    advancedSearchEmpty: 'Rellena al menos un campo.',
    searchAria: 'Búsqueda de juegos',
    searchStartAria: 'Iniciar búsqueda',
    homeKicker: 'TrophyBase · Tu hub de guías',
    homeTitle: 'Encuentra tu próxima platino',
    homeSub:
      'Ocho categorías curadas — del hardcore Souls a platino familiar. Elige la fila que encaje contigo.',
    watchlistTitle: 'Watchlist',
    watchlistCountOne: '1 juego',
    watchlistCountMany: '{n} juegos',
    watchlistEmpty:
      'Todavía no hay juegos en tu watchlist. Márcalos con el ☆ en las categorías o en la ficha del juego.',
    creatorCredit:
      'Esta guía utiliza imágenes de los vídeos de {name}. Si te gustan tanto como a nosotros, suscríbete. Cada apoyo ayuda a crear aún más contenido.',
    creatorYoutube: 'YouTube',
  },
};

export const LOCALE_META = {
  de: { label: 'Deutsch', flag: '🇩🇪', short: 'DE' },
  en: { label: 'English', flag: '🇬🇧', short: 'EN' },
  es: { label: 'Español', flag: '🇪🇸', short: 'ES' },
};

export function t(locale, key) {
  const loc = UI_STRINGS[locale] ? locale : 'en';
  return UI_STRINGS[loc][key] ?? UI_STRINGS.en[key] ?? key;
}

export function localeOptions() {
  return SUPPORTED_LOCALES.map((code) => ({
    code,
    ...LOCALE_META[code],
  }));
}
