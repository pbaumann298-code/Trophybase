/**
 * Prüft, wie viele URL-Konflikte das geplante Schema /{sprache}/{konsole}/{slug}
 * in den echten Daten erzeugen würde – VOR der Migration.
 *
 * Aufruf (PowerShell):
 *   $env:SUPABASE_URL="https://<projekt>.supabase.co"
 *   $env:SUPABASE_ANON_KEY="<anon key>"
 *   node scripts/check-slug-collisions.mjs
 *
 * Beide Werte stehen aktuell in src/pages/supabaseClient.js.
 */

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Fehlt: SUPABASE_URL und/oder SUPABASE_ANON_KEY als Umgebungsvariable.');
  process.exit(1);
}

const PAGE_SIZE = 1000;
const COLUMNS = 'id,platform_game_id,hardware,release_jahr,spieltitel';

/** Konsolenbezeichnung → URL-Segment */
function consoleSlug(hardware) {
  const raw = String(hardware ?? '').trim();
  if (!raw) return 'unbekannt';

  const normalized = raw
    .toLowerCase()
    .replace(/playstation\s*/g, 'ps')
    .replace(/[^a-z0-9]/g, '');

  return normalized || 'unbekannt';
}

/**
 * Titel aus der JSONB-Sprachmap holen. Reihenfolge wie im Frontend:
 * de → en → es → beliebiger vorhandener Wert.
 */
function pickTitle(spieltitel) {
  if (spieltitel == null) return '';
  if (typeof spieltitel === 'string') return spieltitel.trim();
  if (typeof spieltitel !== 'object' || Array.isArray(spieltitel)) return '';

  for (const key of ['de', 'en', 'es', ...Object.keys(spieltitel)]) {
    const value = spieltitel[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/** Spieltitel → URL-Segment. Muss deterministisch und stabil sein. */
export function slugify(title) {
  return String(title ?? '')
    .normalize('NFD')
    // Akzente entfernen: é → e, ñ → n
    .replace(/[\u0300-\u036f]/g, '')
    // Deutsche Umlaute ausschreiben, bevor sie wegfallen
    .replace(/ä/gi, 'ae')
    .replace(/ö/gi, 'oe')
    .replace(/ü/gi, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/&/g, ' und ')
    .toLowerCase()
    // Apostrophe ersatzlos: "assassin's" → "assassins"
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

async function fetchPage(offset) {
  const url = `${SUPABASE_URL}/rest/v1/games?select=${COLUMNS}&limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Supabase antwortete mit ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchAllGames() {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetchPage(offset);
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function report(rows) {
  const byKey = new Map();
  const untitled = [];

  for (const row of rows) {
    const title = pickTitle(row.spieltitel);
    if (!title) {
      untitled.push(row);
      continue;
    }

    const key = `${consoleSlug(row.hardware)}/${slugify(title)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ ...row, _title: title });
  }

  const collisions = [...byKey.entries()].filter(([, group]) => group.length > 1);

  console.log(`Spiele gesamt:           ${rows.length}`);
  console.log(`Ohne brauchbaren Titel:  ${untitled.length}`);
  console.log(`Eindeutige URLs:         ${byKey.size}`);
  console.log(`Konflikt-URLs:           ${collisions.length}`);
  console.log(
    `Betroffene Spiele:       ${collisions.reduce((n, [, g]) => n + g.length, 0)}`,
  );

  if (untitled.length > 0) {
    console.log('\n--- Ohne Titel (brauchen manuelle Pflege) ---');
    for (const row of untitled.slice(0, 20)) {
      console.log(`  ${row.id}  ${row.platform_game_id ?? '—'}  hardware=${row.hardware ?? '—'}`);
    }
    if (untitled.length > 20) console.log(`  … und ${untitled.length - 20} weitere`);
  }

  if (collisions.length > 0) {
    console.log('\n--- Konflikte ---');
    for (const [key, group] of collisions) {
      console.log(`\n  /${key}`);
      for (const row of group) {
        const year = row.release_jahr ?? '—';
        console.log(`    ${row._title}  (Jahr ${year}, ${row.platform_game_id ?? row.id})`);
      }
      // Prüfen, ob das Jahr als Unterscheidungsmerkmal ausreicht
      const years = new Set(group.map((r) => r.release_jahr ?? null));
      const yearSolves = years.size === group.length && !years.has(null);
      console.log(`    → Jahr-Suffix ${yearSolves ? 'löst diesen Konflikt' : 'reicht NICHT aus'}`);
    }
  } else {
    console.log('\nKeine Konflikte. Das Schema funktioniert ohne Zusatzregel.');
  }
}

const rows = await fetchAllGames();
report(rows);
