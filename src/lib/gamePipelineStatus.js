import { GAME_STRUCT } from './gameSchema';
import { parseStatusMap } from './guidePublication';

/** Schlüssel in games.status (Pipeline, nicht nur Guide-Freigabe). */
export const PIPELINE_STATUS_KEYS = [
  { key: 'discovery', label: 'discovery' },
  { key: 'trophies', label: 'trophies' },
  { key: 'guides', label: 'guides' },
  { key: 'guide_de', label: 'guide_de' },
  { key: 'igdb', label: 'igdb' },
  { key: 'overall', label: 'overall' },
  { key: 'refinement', label: 'refinement' },
  { key: 'online_mode', label: 'online_mode' },
];

export const PIPELINE_PRESETS = [
  {
    id: '',
    label: 'Kein Preset',
  },
  {
    id: 'stuck_discovery',
    label: 'Hängt nach Discovery',
    hint: 'discovery = DISCOVERED, Trophäen noch nicht PROCESSED',
  },
  {
    id: 'trophies_no_guide',
    label: 'Trophäen ohne Guide-Status',
    hint: 'trophies = PROCESSED, guide_de leer',
  },
  {
    id: 'ready_unpublished',
    label: 'FERTIG, nicht online',
    hint: 'guide_de = FERTIG',
  },
  {
    id: 'published',
    label: 'PUBLISHED',
    hint: 'Für Besucher sichtbar',
  },
];

function statusFilterColumn(key) {
  return `${GAME_STRUCT.status}->>${key}`;
}

/**
 * @param {unknown} value
 * @param {string} key
 */
export function pipelineStatusValue(value, key) {
  const map = parseStatusMap(value);
  const raw = map[key];
  if (raw == null || raw === '') return '';
  return String(raw).trim();
}

/**
 * Kompakte Pipeline-Zeile für Tabellen.
 * @param {unknown} value
 */
export function formatPipelineStatus(value) {
  const map = parseStatusMap(value);
  const parts = PIPELINE_STATUS_KEYS.map(({ key }) => {
    const raw = map[key];
    if (raw == null || raw === '') return null;
    return `${key}=${String(raw).trim()}`;
  }).filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function applyStatusEq(query, key, value) {
  const wanted = String(value ?? '').trim();
  if (!wanted) return query;
  return query.filter(statusFilterColumn(key), 'eq', wanted);
}

function applyStatusMissing(query, key) {
  return query.filter(statusFilterColumn(key), 'is', 'null');
}

/**
 * Filter auf einzelne JSONB-Schlüssel. Presets und freie Key/Value-Paare
 * werden UND-verknüpft.
 * @param {object} query supabase-Query
 * @param {{ preset?: string, statusKey?: string, statusValue?: string }} filters
 */
export function applyPipelineStatusFilters(query, filters = {}) {
  let next = query;
  const preset = String(filters.preset ?? '').trim();
  const statusKey = String(filters.statusKey ?? '').trim();
  const statusValue = String(filters.statusValue ?? '').trim();

  if (preset === 'stuck_discovery') {
    next = applyStatusEq(next, 'discovery', 'DISCOVERED');
    const trophies = statusFilterColumn('trophies');
    next = next.or(`${trophies}.is.null,${trophies}.neq.PROCESSED`);
  } else if (preset === 'trophies_no_guide') {
    next = applyStatusEq(next, 'trophies', 'PROCESSED');
    next = applyStatusMissing(next, 'guide_de');
  } else if (preset === 'ready_unpublished') {
    next = applyStatusEq(next, 'guide_de', 'FERTIG');
  } else if (preset === 'published') {
    next = applyStatusEq(next, 'guide_de', 'PUBLISHED');
  }

  if (statusKey && statusValue) {
    next = applyStatusEq(next, statusKey, statusValue);
  }

  return next;
}

/**
 * PostgREST-Count aus einer eingebetteten 1:n-Relation.
 * @param {unknown} value
 */
export function embedCount(value) {
  if (Array.isArray(value) && value[0] && typeof value[0].count === 'number') {
    return value[0].count;
  }
  if (value && typeof value.count === 'number') return value.count;
  return null;
}
