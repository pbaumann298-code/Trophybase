import bronzeIcon from '../assets/trophies/bronze.png';
import silverIcon from '../assets/trophies/silver.png';
import goldIcon from '../assets/trophies/gold.png';
import platinumIcon from '../assets/trophies/platinum.png';

/**
 * Trophäenstufen als eigene Icons.
 *
 * game_achievements.trophy_type kommt aus der Pipeline uneinheitlich: der
 * Altbestand englisch (BRONZE / SILVER / GOLD / PLATINUM), neuere Uploads
 * deutsch (SILBER / PLATIN) – in Bloodborne stehen SILBER und SILVER sogar
 * gemischt in derselben Trophäenliste. Deshalb wird der Rohwert nie angezeigt,
 * sondern immer erst hier normalisiert.
 */
export const TROPHY_TYPE = {
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
  PLATINUM: 'platinum',
};

/** Rohwerte aus der Pipeline in de / en / es. */
const TYPE_BY_RAW = new Map([
  ['BRONZE', TROPHY_TYPE.BRONZE],
  ['BRONCE', TROPHY_TYPE.BRONZE],
  ['SILVER', TROPHY_TYPE.SILVER],
  ['SILBER', TROPHY_TYPE.SILVER],
  ['PLATA', TROPHY_TYPE.SILVER],
  ['GOLD', TROPHY_TYPE.GOLD],
  ['ORO', TROPHY_TYPE.GOLD],
  ['PLATIN', TROPHY_TYPE.PLATINUM],
  ['PLATINUM', TROPHY_TYPE.PLATINUM],
  ['PLATINO', TROPHY_TYPE.PLATINUM],
]);

const ICON_BY_TYPE = {
  [TROPHY_TYPE.BRONZE]: bronzeIcon,
  [TROPHY_TYPE.SILVER]: silverIcon,
  [TROPHY_TYPE.GOLD]: goldIcon,
  [TROPHY_TYPE.PLATINUM]: platinumIcon,
};

const LABEL_BY_TYPE = {
  [TROPHY_TYPE.BRONZE]: 'Bronze',
  [TROPHY_TYPE.SILVER]: 'Silber',
  [TROPHY_TYPE.GOLD]: 'Gold',
  [TROPHY_TYPE.PLATINUM]: 'Platin',
};

/**
 * @param {unknown} value trophy_type aus game_achievements
 * @returns {'bronze'|'silver'|'gold'|'platinum'|''} leer, wenn unbekannt
 */
export function normalizeTrophyType(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '';
  return TYPE_BY_RAW.get(raw) ?? '';
}

/**
 * Icon-URL der Trophäenstufe. Dient doppelt: als Stufen-Abzeichen und als
 * Rückfall, wenn Sony das Original-Bild gelöscht hat.
 * @param {unknown} value trophy_type (roh oder normalisiert)
 * @returns {string} leer, wenn die Stufe unbekannt ist
 */
export function trophyTypeIcon(value) {
  const type = normalizeTrophyType(value) || (ICON_BY_TYPE[value] ? value : '');
  return type ? ICON_BY_TYPE[type] : '';
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function trophyTypeLabel(value) {
  const type = normalizeTrophyType(value) || (LABEL_BY_TYPE[value] ? value : '');
  return type ? LABEL_BY_TYPE[type] : '';
}
