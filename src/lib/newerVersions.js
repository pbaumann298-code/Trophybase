import { GAME_I18N, GAME_STRUCT, GAME_TYPE, TABLES } from './gameSchema';
import { applyGuideCatalogFilter, excludeQuickwinStyleTypes, getGameSelect } from './gameQueries';
import { getGameTitle, getGameUuid, mergeGameRows } from './gameModel';
import { getLocale } from './locale';
import { quickwinPublisherKey } from './quickwinCatalog';

const EDITION_WORDS =
  /\b(remastered|remake|hd|definitive|edition|goty|classic|collection|legacy|complete|directors|director)\b/gi;

const TRAILING_NUMBER = /\s+(?:\d+|i{1,3}|iv|vi{0,3}|ix|xi{0,3}|part\s+[ivx0-9]+)$/i;

function cleanTitle(value) {
  return String(value ?? '')
    .replace(/[®™©]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMatch(value) {
  return cleanTitle(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(EDITION_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reihenstamm: „Far Cry 3“ → „Far Cry“, „Uncharted: Drake's Fortune“ → „Uncharted“.
 * Bleibt der Titel ohne Zahl und ohne Untertitel, gibt es keine Reihe.
 * @returns {{ key: string, label: string } | null}
 */
export function seriesStem(title) {
  const cleaned = cleanTitle(title);
  if (!cleaned) return null;
  const head = cleaned.split(/[:–—]/)[0].trim();
  const withoutEdition = head.replace(EDITION_WORDS, ' ').replace(/\s+/g, ' ').trim();
  const stripped = withoutEdition.replace(TRAILING_NUMBER, '').trim();
  if (!stripped || stripped.length < 4) return null;
  if (normalizeMatch(stripped) === normalizeMatch(cleaned) && !TRAILING_NUMBER.test(withoutEdition) && !cleaned.includes(':')) {
    return null;
  }
  return { key: normalizeMatch(stripped), label: stripped };
}

function titleMatchesStem(title, stemKey) {
  const normalized = normalizeMatch(title);
  if (!stemKey || !normalized) return false;
  return normalized === stemKey || normalized.startsWith(`${stemKey} `);
}

function allTitles(game, locale) {
  const raw = game?.[GAME_I18N.title];
  const localized = raw && typeof raw === 'object'
    ? Object.values(raw).map((value) => String(value ?? '').trim())
    : [];
  return [...new Set([getGameTitle(game, locale), ...localized].filter(Boolean))];
}

function quoteFilterValue(pattern) {
  return `"${String(pattern ?? '').replace(/["\\]/g, '')}"`;
}

function titleOrFilter(stem) {
  const value = quoteFilterValue(`%${stem}%`);
  const locales = [...new Set(['de', 'en', getLocale()])];
  return locales.map((lang) => `${GAME_I18N.title}->>${lang}.ilike.${value}`).join(',');
}

function livingCatalog(query, includeReady) {
  return excludeQuickwinStyleTypes(
    applyGuideCatalogFilter(query, {
      includeReady: Boolean(includeReady),
      publishedOnly: !includeReady,
      locale: 'de',
    }),
  );
}

/**
 * Neuere Ausgaben derselben Reihe, sonst andere Spiele des Publishers.
 * @returns {Promise<{ mode: 'series'|'publisher'|'', heading: string, games: object[] }>}
 */
export async function fetchNewerVersions(supabase, game, locale = getLocale(), { includeReady = false } = {}) {
  const empty = { mode: '', heading: '', games: [] };
  const selfId = getGameUuid(game);
  if (!selfId) return empty;

  const stem = seriesStem(getGameTitle(game, locale)) || seriesStem(getGameTitle(game, 'en'));
  if (stem) {
    const { data, error } = await livingCatalog(
      supabase.from(TABLES.games).select(getGameSelect()).or(titleOrFilter(stem.label)).neq('id', selfId),
      includeReady,
    )
      .order(GAME_STRUCT.releaseYear, { ascending: false, nullsFirst: false })
      .limit(40);

    if (!error) {
      const games = mergeGameRows(data ?? [], locale).filter((row) =>
        allTitles(row, locale).some((title) => titleMatchesStem(title, stem.key)),
      );
      if (games.length > 0) {
        return { mode: 'series', heading: stem.label, games: games.slice(0, 12) };
      }
    }
  }

  const publisher = quickwinPublisherKey(game);
  if (!publisher) return empty;
  const value = quoteFilterValue(`%${publisher}%`);
  const { data, error } = await livingCatalog(
    supabase
      .from(TABLES.games)
      .select(getGameSelect())
      .or(`${GAME_STRUCT.publisher}.ilike.${value},${GAME_STRUCT.developer}.ilike.${value}`)
      .neq('id', selfId),
    includeReady,
  )
    .order(GAME_STRUCT.releaseYear, { ascending: false, nullsFirst: false })
    .limit(24);

  if (error) return empty;
  const games = mergeGameRows(data ?? [], locale)
    .filter((row) => quickwinPublisherKey(row) === publisher)
    .slice(0, 12);
  if (games.length === 0) return empty;
  return { mode: 'publisher', heading: publisher, games };
}
