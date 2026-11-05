import { collectHardwareSegments } from './gameSlug.js';

const PLATFORM = {
  ps5: { short: 'PS5', full: 'PlayStation 5' },
  ps4: { short: 'PS4', full: 'PlayStation 4' },
  ps3: { short: 'PS3', full: 'PlayStation 3' },
  psvita: { short: 'PS Vita', full: 'PlayStation Vita' },
  psp: { short: 'PSP', full: 'PlayStation Portable' },
};

const RANK = { ps5: 5, ps4: 4, ps3: 3, psvita: 2, psp: 1 };

const GENERIC = {
  short: 'PSN',
  full: 'PlayStation',
  combined: 'PlayStation (PSN)',
  schemaPlatforms: ['PlayStation', 'PlayStation Network', 'PSN'],
};

function singleTerms(segment) {
  const info = PLATFORM[segment] || PLATFORM.ps5;
  return {
    short: info.short,
    full: info.full,
    combined: `${info.full} (${info.short})`,
    schemaPlatforms: [info.full, info.short, 'PlayStation Network'],
  };
}

/**
 * Kurzformen aus games.hardware (PS5, PS4, PS Vita, Kombi-Strings) auf die
 * ausgeschriebenen PlayStation-Begriffe für Title, Description und Schema.org.
 * @param {unknown} hardware
 * @param {unknown} [_ecosystem]
 * @returns {{ short: string, full: string, combined: string, schemaPlatforms: string[] }}
 */
export function expandPlayStationSeoTerms(hardware, ecosystem) {
  const fromHardware = collectHardwareSegments(hardware);
  const segments = fromHardware.length > 0 ? fromHardware : collectHardwareSegments(ecosystem);
  if (segments.length === 0) return GENERIC;
  if (segments.length === 1) return singleTerms(segments[0]);

  const set = new Set(segments);
  if (set.size === 2 && set.has('ps4') && set.has('ps5')) {
    return {
      short: 'PS4 & PS5',
      full: 'PlayStation 4 & PlayStation 5',
      combined: 'PlayStation 5 & PlayStation 4 (PS5/PS4)',
      schemaPlatforms: ['PlayStation 5', 'PlayStation 4', 'PS5', 'PS4'],
    };
  }

  const newestFirst = [...segments].sort((a, b) => (RANK[b] ?? 0) - (RANK[a] ?? 0));
  const oldestFirst = [...newestFirst].reverse();
  const short = oldestFirst.map((id) => PLATFORM[id].short).join(' & ');
  const full = oldestFirst.map((id) => PLATFORM[id].full).join(' & ');
  const combined = `${newestFirst.map((id) => PLATFORM[id].full).join(' & ')} (${newestFirst.map((id) => PLATFORM[id].short).join('/')})`;
  return {
    short,
    full,
    combined,
    schemaPlatforms: [
      ...newestFirst.map((id) => PLATFORM[id].full),
      ...newestFirst.map((id) => PLATFORM[id].short),
    ],
  };
}
