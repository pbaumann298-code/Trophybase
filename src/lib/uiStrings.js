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
    homeKicker: 'TrophyBase · Dein Guide-Hub',
    homeTitle: 'Finde deinen nächsten Platin-Run',
    homeSub:
      'Acht kuratierte Welten – vom Souls-Hardcore bis zur Familien-Platin. Wähle die Reihe, die zu deinem Gamer-Typ passt.',
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
    homeKicker: 'TrophyBase · Your guide hub',
    homeTitle: 'Find your next platinum run',
    homeSub:
      'Eight curated worlds — from Souls hardcore to family platinums. Pick the row that fits your play style.',
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
    homeKicker: 'TrophyBase · Tu hub de guías',
    homeTitle: 'Encuentra tu próxima platino',
    homeSub:
      'Ocho categorías curadas — del hardcore Souls a platino familiar. Elige la fila que encaje contigo.',
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
