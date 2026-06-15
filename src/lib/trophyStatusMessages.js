import { TABLES } from './gameSchema';
import { DEFAULT_LOCALE, normalizeLocale } from './locale';

export const STATUS_MESSAGE_KEYS = {
  SERVER_SHUTDOWN: 'server_shutdown',
  COMING_SOON_BANNER: 'coming_soon_banner',
};

/** Fallback-Texte, falls Supabase-Eintrag fehlt */
export const STATUS_MESSAGE_FALLBACKS = {
  [STATUS_MESSAGE_KEYS.SERVER_SHUTDOWN]: {
    de: 'Achtung: Die Server für dieses Spiel wurden abgeschaltet. Die Platin-Trophäe ist nicht mehr regulär erspielbar!',
    en: 'Warning: The servers for this game have been shut down. The platinum trophy can no longer be earned through regular means!',
    es: 'Atención: Los servidores de este juego han sido cerrados. ¡El trofeo de platino ya no se puede obtener de forma regular!',
  },
  [STATUS_MESSAGE_KEYS.COMING_SOON_BANNER]: {
    de: 'Coming Soon: Die Trophäenübersicht ist vollständig, die detaillierten Guide-Abschnitte werden noch erstellt.',
    en: 'Coming Soon: The trophy overview is complete; detailed guide sections are still being created.',
    es: 'Próximamente: El resumen de trofeos está completo; las secciones detalladas de la guía aún se están creando.',
  },
};

export const SERVER_OFFLINE_VALUES = ['OFFLINE', 'SERVER_TOT', 'TOT'];
export const GAME_STATUS_COMING_SOON = 'COMING_SOON';

/** trophy_status_messages.id – Cover-Hinweise auf der Spieldetailseite */
export const STATUS_MESSAGE_IDS = {
  SERVER_DEAD: 2,
  HAS_ONLINE_TROPHIES: 3,
};

/**
 * Liest lokalisierten Text aus einer trophy_status_messages-Zeile.
 * Unterstützt: Spalten de/en/es, text_de/text_en, message_de, oder language+message Zeilen.
 */
export function pickLocalizedMessage(row, locale = DEFAULT_LOCALE) {
  if (!row) return '';

  const loc = normalizeLocale(locale);
  const direct =
    row[loc] ??
    row[`text_${loc}`] ??
    row[`message_${loc}`] ??
    row[`${loc}_text`];

  if (direct != null && String(direct).trim()) return String(direct).trim();

  if (row.message != null && row.language && normalizeLocale(row.language) === loc) {
    return String(row.message).trim();
  }

  if (row.message != null && !row.language) return String(row.message).trim();

  return (
    row.de ??
    row.text_de ??
    row.message_de ??
    ''
  );
}

export function normalizeGameFlag(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

export function isServerOffline(game, getProp) {
  const status = normalizeGameFlag(
    getProp(game, ['server_status', 'Server_Status', 'server_Status']),
  );
  return SERVER_OFFLINE_VALUES.includes(status);
}

/** server_status = „tot“ (inkl. Varianten) → Hinweis id 2 in der Cover-Kachel */
export function isServerDead(game, getProp) {
  const raw = String(
    getProp(game, ['server_status', 'Server_Status', 'server_Status']) ?? '',
  )
    .trim()
    .toLowerCase();
  return raw === 'tot' || raw === 'server_tot' || raw === 'offline';
}

export function hasOnlineTrophiesFlag(game, getProp) {
  const raw = getProp(game, ['has_online_trophies', 'Has_Online_Trophies']);
  if (raw === true) return true;
  return String(raw ?? '').trim().toUpperCase() === 'TRUE';
}

export function isComingSoonStatus(game, getProp) {
  const status = normalizeGameFlag(getProp(game, ['Status', 'status', 'game_status']));
  return status === GAME_STATUS_COMING_SOON;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string[]} keys
 * @param {string} [locale]
 */
export async function fetchTrophyStatusMessages(supabase, keys, locale = DEFAULT_LOCALE) {
  const loc = normalizeLocale(locale);
  const result = {};

  for (const key of keys) {
    result[key] = STATUS_MESSAGE_FALLBACKS[key]?.[loc] ?? STATUS_MESSAGE_FALLBACKS[key]?.de ?? '';
  }

  const { data, error } = await supabase
    .from(TABLES.statusMessages)
    .select('*')
    .in('message_key', keys);

  if (error) {
    console.error('trophy_status_messages:', error.message);
    return { messages: result, error };
  }

  const rowsByKey = {};
  for (const row of data ?? []) {
    const key = row.message_key ?? row.key;
    if (!key || !keys.includes(key)) continue;
    if (!rowsByKey[key]) rowsByKey[key] = [];
    rowsByKey[key].push(row);
  }

  for (const key of keys) {
    const rows = rowsByKey[key];
    if (!rows?.length) continue;

    const localeRow = rows.find(
      (row) => row.language && normalizeLocale(row.language) === loc,
    );
    if (localeRow?.message) {
      result[key] = String(localeRow.message).trim();
      continue;
    }

    const text = pickLocalizedMessage(rows[0], loc);
    if (text) result[key] = text;
  }

  return { messages: result, error: null };
}

/**
 * Nach numerischer id aus trophy_status_messages (z. B. id 2 / 3).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number[]} ids
 * @param {string} [locale]
 */
export async function fetchTrophyStatusMessagesByIds(supabase, ids, locale = DEFAULT_LOCALE) {
  const loc = normalizeLocale(locale);
  const result = {};

  if (!ids?.length) return { messages: result, error: null };

  const { data, error } = await supabase
    .from(TABLES.statusMessages)
    .select('*')
    .in('id', ids);

  if (error) {
    console.error('trophy_status_messages (by id):', error.message);
    return { messages: result, error };
  }

  for (const id of ids) {
    const row = (data ?? []).find((entry) => Number(entry.id) === Number(id));
    if (row) {
      const text = pickLocalizedMessage(row, loc);
      if (text) result[id] = text;
    }
  }

  return { messages: result, error: null };
}
