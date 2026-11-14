/**
 * Bereinigt Spiel- und Trophäentitel für gezielte Google-Videosuchen
 * (entfernt ™/®/© sowie optionale Plattform-Klammern wie (PS5)).
 * @param {unknown} raw
 * @returns {string}
 */
export function cleanSearchTitle(raw) {
  const input = String(raw ?? '').trim();
  if (!input) return '';
  return input
    .replace(/[™®©℠]/g, '')
    .replace(/\s*\((?:PS[1-5]|PS\s*Vita|PSP|PC|Steam|Xbox(?:\s+One|\s+Series\s+[XS])?|NSW|Switch)\)\s*/gi, ' ')
    .replace(/\s*\[(?:PS[1-5]|PS\s*Vita|PSP|PC|Steam|Xbox)\]\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickLocalizedText(val, preferredOrder) {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'object' && !Array.isArray(val)) {
    for (const lang of preferredOrder) {
      const candidate = val[lang];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    for (const candidate of Object.values(val)) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
  }
  return '';
}

/**
 * Erstellt die Google-Videosuch-URL (`tbm=vid`) für eine Trophäe bzw. ein Sammelobjekt.
 * Bevorzugt EN-Trophäen- und Spielnamen, sofern ein englischer Trophäenname vorliegt, sonst DE/Fallback.
 *
 * @param {{ gameTitle?: unknown, trophyName?: unknown, fallbackTrophyName?: string }} params
 * @returns {string|null}
 */
export function buildTrophyVideoSearchUrl({ gameTitle, trophyName, fallbackTrophyName = '' } = {}) {
  const enTrophy =
    typeof trophyName === 'object' && trophyName && !Array.isArray(trophyName)
      ? String(trophyName.en ?? '').trim()
      : '';

  const preferEn = Boolean(enTrophy);
  const trophyLangOrder = preferEn
    ? ['en', 'de', 'fr', 'es', 'it']
    : ['de', 'en', 'fr', 'es', 'it'];
  const gameLangOrder = preferEn ? ['en', 'de'] : ['de', 'en'];

  const pickedTrophy =
    pickLocalizedText(trophyName, trophyLangOrder) || String(fallbackTrophyName ?? '').trim();
  const pickedGame = pickLocalizedText(gameTitle, gameLangOrder);

  const cleanGame = cleanSearchTitle(pickedGame);
  const cleanTrophy = cleanSearchTitle(pickedTrophy).replace(/"/g, '');

  if (!cleanGame && !cleanTrophy) return null;

  const parts = [];
  if (cleanGame) parts.push(cleanGame);
  if (cleanTrophy) parts.push(`"${cleanTrophy}"`);
  parts.push('Trophy Guide Collectibles');

  return `https://www.google.com/search?tbm=vid&q=${encodeURIComponent(parts.join(' '))}`;
}
