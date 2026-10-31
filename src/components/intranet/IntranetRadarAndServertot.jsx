import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import { handleStaffGamePreviewClick } from '../../lib/adminAccess';
import { getPlatformGameId } from '../../lib/gameModel';
import {
  ACHIEVEMENT_PK,
  GAME_FK,
  GAME_PK,
  GAME_STRUCT,
  GAME_TYPE,
  TABLES,
  parseGameTypes,
} from '../../lib/gameSchema';
import {
  hasPublishedGuide,
  isGameDraftMode,
  parseStatusMap,
  setGuidePublished,
} from '../../lib/guidePublication';
import { intranetGameHref } from '../../lib/intranetQueries';
import {
  clearGameGuideTips,
  fixGameCover,
  markGameCoverValid,
  pullGameBackToDrafts,
  saveGamePlaytime,
  saveTrophyGuideTip,
  setAchievementFlags,
  setAchievementsOnline,
  setIntranetGameType,
} from '../../lib/intranetGameEdits';
import {
  deleteCommunityReport,
  fetchCommunityReports,
  formatReportDisplayKey,
  formatReportGameTitle,
  formatReportNpwr,
  setReportStatus,
} from '../../lib/communityReportAdmin';
import { parseReportImageUrls } from '../../lib/errorReport';
import { LocaleProvider } from '../../context/LocaleContext';
import AdminGameTypeSelect from '../AdminGameTypeSelect';
import AdminHardwareSelect from '../AdminHardwareSelect';
import GameRadarCard from '../GameRadarCard';
import TrophyArtwork from '../TrophyArtwork';
import TrophyTypeIcon from '../TrophyTypeIcon';

/**
 * High-Speed-Freigabe ohne Video-Guide.
 *
 * mode="d_freigabe": unveröffentlichte Spiele mit guide_typ = D (alle Spieltypen außer Unlesbar)
 *   sowie Quickwin/easy_platin-Spiele mit guide_typ = C. Freigabe = Radar + Trophäenliste live.
 * mode="servertot": Spiele der spiel_typ-Kategorie „Servertot“ (Standard-Pill). Zusätzliche Kandidaten-Pill
 *   (Online-Trophäen) hilft, noch nicht kategorisierte Spiele zu finden.
 *   Freigabe stellt den Servertot-Typ sicher.
 *
 * Datenregeln (SUPABASE_SCHEMA.mdc): `games`/`game_achievements` werden mit `.range()` paginiert;
 * „unveröffentlicht“ = `!hasPublishedGuide(game)` (published_locales leer), zusätzlich clientseitig
 * abgesichert. Regel 0: 0 Guide-Zeilen sind hier Absicht – Freigabe läuft rein über `games`.
 */

const PAGE = 1000;
const MAX_QUEUE_ROWS = 10000;
const PUBLISH_LANG = 'de';
const GUIDE_TYPS = ['S', 'A', 'B', 'C', 'D'];
const ONLINE_KEYWORDS =
  /\b(online|multiplayer|mehrspieler|koop|co-op|coop|rangliste|leaderboard|mitspieler|server|matchmaking|pvp|invasion|crew|clan|liga)\b/i;

/** Leichte Spalten für die Queue (bis zu ~6.500 Zeilen in der D-Queue). */
const GAME_LIST_COLUMNS = [
  GAME_PK,
  'platform_game_id',
  'spieltitel',
  'cover_url',
  'cover_status',
  'cover_notes',
  'slug',
  'hardware',
  'ecosystem',
  'spiel_typ',
  'guide_typ',
  'fortschritt',
  'status',
  'publishing_status',
  'published_locales',
  'is_indexable',
  'anzahl_trophaeen',
  'total_online_trophies',
  'total_missable_trophies',
  'spielzeit_hauptstory',
  'spielzeit_komplettierer',
  'release_jahr',
  'publisher',
  'entwickler',
].join(', ');

const SICKBAY_COVER_COLUMNS = [
  'id',
  'slug',
  'spieltitel',
  'display_title',
  'ecosystem',
  'hardware',
  'spiel_typ',
  'cover_url',
  'extracted_cover_url',
  'cover_status',
  'cover_notes',
  'computed_error_reason',
].join(', ');

const SICKBAY_TABS = [
  { id: 'servertot', label: 'Servertot', icon: '💀' },
  { id: 'covers', label: 'Cover-Fehler', icon: '🖼️' },
  { id: 'reports', label: 'Fehlermeldungen', icon: '⚑' },
];

/** Schwere jsonb-Felder, erst beim Auswählen eines Spiels nachgeladen. */
const GAME_DETAIL_COLUMNS = [GAME_PK, 'radar_profile', 'status_explanation_localized'].join(', ');

const ACHIEVEMENT_COLUMNS = [
  ACHIEVEMENT_PK,
  'trophy_type',
  'ist_versteckt',
  'trophy_gruppe',
  'trophy_name',
  'trophy_desc',
  'icon_url',
  'guide_tip',
  'is_online',
  'is_missable',
  'is_collectible',
  'is_story_related',
].join(', ');

const FLAG_TOGGLES = [
  { key: 'is_online', icon: '🌐', label: 'Online', active: 'bg-sky-500/20 text-sky-200 border-sky-400/40' },
  { key: 'is_missable', icon: '⚠️', label: 'Verpassbar', active: 'bg-amber-500/20 text-amber-200 border-amber-400/40' },
  { key: 'is_collectible', icon: '📦', label: 'Sammelobjekt', active: 'bg-violet-500/20 text-violet-200 border-violet-400/40' },
  { key: 'is_story_related', icon: '📖', label: 'Story', active: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40' },
];

const MODES = {
  d_freigabe: {
    title: 'D-Freigabe (Radar-Only)',
    subtitle:
      'Spiele ohne Video-Guide direkt live schalten: Radar-Profil + Trophäenliste + Spielzeiten reichen. Freigabe setzt guide_de = PUBLISHED.',
    defaultPill: 'all',
    pills: [
      { id: 'all', label: 'Alle Radar-Kandidaten', test: () => true },
      { id: 'd', label: 'Nur guide_typ = D', test: (game) => guideTyp(game) === 'D' },
      { id: 'c_quick', label: 'Quickwin & guide_typ = C', test: (game) => guideTyp(game) === 'C' && isQuickType(game) },
    ],
    publishLabel: '✅ Freigeben (Ohne Video live schalten)',
  },
  servertot: {
    title: 'Krankenstation',
    subtitle:
      'Zentrale Prüf- & Reparaturstation: Servertot-Spiele freigeben, fehlerhafte/fehlende Cover (v_sickbay_covers) reparieren und Community-Fehlermeldungen abarbeiten.',
    defaultPill: 'typ',
    pills: [
      { id: 'typ', label: 'spiel_typ = Servertot', test: (game) => hasType(game, GAME_TYPE.SERVER_DEAD) },
      {
        id: 'online',
        label: 'Kandidat: Online-Trophäen',
        test: (game) => Number(game.total_online_trophies ?? 0) > 0 && !hasType(game, GAME_TYPE.SERVER_DEAD),
      },
    ],
    publishLabel: '💀 Als Servertot freigeben (Live auf Hub)',
  },
};

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

/** de → en → erster Wert einer jsonb-Sprachmap (oder String). */
function pickText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value !== 'object' || Array.isArray(value)) return '';
  const de = String(value.de ?? '').trim();
  if (de) return de;
  const en = String(value.en ?? '').trim();
  if (en) return en;
  const first = Object.values(value).find((entry) => String(entry ?? '').trim());
  return first ? String(first).trim() : '';
}

/**
 * Liest das Cover-Bild gemäß Spezifikation aus:
 * `extracted_cover_url` (in v_sickbay_covers) bzw. `cover_url.de || cover_url.en`.
 */
function extractGameCoverUrl(game) {
  if (!game || typeof game !== 'object') return '';
  const extracted = String(game.extracted_cover_url ?? '').trim();
  if (extracted) return extracted;
  const raw = game.cover_url;
  if (!raw) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const de = String(raw.de ?? '').trim();
    if (de) return de;
    const en = String(raw.en ?? '').trim();
    if (en) return en;
  }
  return '';
}

/**
 * 1-Click Google Images Such-URL für ein Spiel-Cover.
 */
function buildGoogleImagesCoverUrl(game) {
  const title =
    game?.spieltitel?.de ||
    game?.spieltitel?.en ||
    game?.display_title ||
    pickText(game?.spieltitel) ||
    '';
  const query = `${title} ${game?.hardware || ''} cover igdb`.trim();
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

/** Liest gezielt den Guide-Tipp für die Zielsprache (z. B. de), damit gelöschte Tipps nicht auf en zurückfallen. */
function pickGuideTip(value, lang = PUBLISH_LANG) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value !== 'object' || Array.isArray(value)) return '';
  return String(value[lang] ?? '').trim();
}

function withGuideTipForLang(existingGuideTip, lang, text) {
  const trimmed = String(text ?? '').trim();
  const nextMap =
    existingGuideTip && typeof existingGuideTip === 'object' && !Array.isArray(existingGuideTip)
      ? { ...existingGuideTip }
      : typeof existingGuideTip === 'string' && existingGuideTip.trim()
        ? { [lang]: existingGuideTip.trim() }
        : {};
  if (trimmed) {
    nextMap[lang] = trimmed;
  } else {
    delete nextMap[lang];
  }
  return Object.keys(nextMap).length ? nextMap : null;
}

const HIGHER_PIPELINE_STAGES = new Set(['FERTIG', 'READY', 'PUBLISHED', 'DRAFT']);

/**
 * Prüft für die D-Freigabe, ob games.status.refinement = VEREDELT gesetzt ist
 * und (sofern nicht includePublished aktiv ist) noch keine höhere Stufe (FERTIG, READY, PUBLISHED, DRAFT) erreicht wurde.
 */
function isRefinedAtMaxStage(game, { includePublished = false } = {}) {
  const statusMap = parseStatusMap(game?.status);
  if (String(statusMap.refinement ?? '').trim().toUpperCase() !== 'VEREDELT') {
    return false;
  }
  if (includePublished) return true;
  if (hasPublishedGuide(game) || isGameDraftMode(game)) return false;
  if (HIGHER_PIPELINE_STAGES.has(String(statusMap.publish_status ?? '').trim().toUpperCase())) return false;
  if (HIGHER_PIPELINE_STAGES.has(String(statusMap.status ?? '').trim().toUpperCase())) return false;
  if (HIGHER_PIPELINE_STAGES.has(String(game?.fortschritt ?? '').trim().toUpperCase())) return false;
  for (const [key, val] of Object.entries(statusMap)) {
    if (!key.startsWith('guide_')) continue;
    if (HIGHER_PIPELINE_STAGES.has(String(val ?? '').trim().toUpperCase())) return false;
  }
  return true;
}

function allTexts(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.values(value)
      .filter((entry) => typeof entry === 'string')
      .join(' \n ');
  }
  return '';
}

function guideTyp(game) {
  return String(game?.guide_typ ?? '').trim().toUpperCase();
}

function hasType(game, type) {
  const needle = String(type).toLowerCase();
  return parseGameTypes(game?.spiel_typ).some((entry) => String(entry).toLowerCase() === needle);
}

function isQuickType(game) {
  const text = String(game?.spiel_typ ?? '').toLowerCase();
  return text.includes('quickwin') || text.includes('easy_platin');
}

function isUnlesbar(game) {
  return String(game?.spiel_typ ?? '').toLowerCase().includes('unlesbar');
}

/** Gehört das Spiel (noch) in die Queue dieses Modus? Clientseitiges Spiegelbild des DB-Filters. */
function matchesMode(mode, game, { includePublished = false } = {}) {
  if (!game) return false;
  if (!includePublished && hasPublishedGuide(game)) return false;
  if (mode === 'd_freigabe') {
    if (isUnlesbar(game)) return false;
    if (!isRefinedAtMaxStage(game, { includePublished })) return false;
    const typ = guideTyp(game);
    return typ === 'D' || (typ === 'C' && isQuickType(game));
  }
  return (
    hasType(game, GAME_TYPE.SERVER_DEAD) ||
    Number(game.total_online_trophies ?? 0) > 0
  );
}

function applyModeFilter(mode, query) {
  if (mode === 'd_freigabe') {
    return query
      .ilike('status->>refinement', 'veredelt')
      .or('guide_typ.eq.D,and(guide_typ.eq.C,spiel_typ.ilike.*Quickwin*),and(guide_typ.eq.C,spiel_typ.ilike.*easy_platin*)')
      .or('spiel_typ.is.null,spiel_typ.not.ilike.*Unlesbar*');
  }
  return query.or(
    'spiel_typ.ilike.*Servertot*,total_online_trophies.gt.0',
  );
}

async function fetchQueue(mode, { includePublished }) {
  const rows = [];
  for (let from = 0; from < MAX_QUEUE_ROWS; from += PAGE) {
    let query = supabase
      .from(TABLES.games)
      .select(GAME_LIST_COLUMNS)
      .order(GAME_PK, { ascending: true })
      .range(from, from + PAGE - 1);
    if (!includePublished) {
      // published_locales ist nie NULL (Trigger tb_sync_publishing_columns); '[]' = unveröffentlicht.
      // Partieller Index: games_unpublished_queue_idx (guide_typ, id) where published_locales = '[]'.
      query = query.eq('published_locales', '[]');
    }
    query = applyModeFilter(mode, query);
    const { data, error } = await query;
    if (error) return { rows: [], error, truncated: false };
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return { rows, error: null, truncated: false };
  }
  return { rows, error: null, truncated: true };
}

async function fetchGameDetails(gameId) {
  const { data, error } = await supabase
    .from(TABLES.games)
    .select(GAME_DETAIL_COLUMNS)
    .eq(GAME_PK, gameId)
    .maybeSingle();
  if (error || !data) return { details: null, error };
  return {
    details: {
      radar_profile: data.radar_profile ?? null,
      status_explanation_localized: data.status_explanation_localized ?? null,
      _detailsLoaded: true,
    },
    error: null,
  };
}

async function fetchAchievements(gameId) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLES.achievements)
      .select(ACHIEVEMENT_COLUMNS)
      .eq(GAME_FK, gameId)
      .order(ACHIEVEMENT_PK, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { rows: [], error };
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  rows.sort((a, b) => collator.compare(String(a[ACHIEVEMENT_PK] ?? ''), String(b[ACHIEVEMENT_PK] ?? '')));
  return { rows, error: null };
}

/**
 * Lädt paginiert alle Zeilen aus der View `v_sickbay_covers` (PostgREST 1.000-Zeilen-Limit).
 */
async function fetchSickbayCovers() {
  const rows = [];
  for (let from = 0; from < MAX_QUEUE_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLES.sickbayCovers)
      .select(SICKBAY_COVER_COLUMNS)
      .range(from, from + PAGE - 1);
    if (error) return { rows: [], error };
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  rows.sort((a, b) =>
    collator.compare(
      String(a.display_title || pickText(a.spieltitel) || ''),
      String(b.display_title || pickText(b.spieltitel) || ''),
    ),
  );
  return { rows, error: null };
}

/**
 * Anklickbares Cover-Element nach Vorbild von @GameDetailPage für alle 3 Krankenstation-Tabs.
 * Liest das Bild aus `cover_url.de || cover_url.en` (bzw. `extracted_cover_url`).
 * Wenn kein Bild vorhanden ist (`null` oder `{}`), zeigt es die anklickbare Platzhalter-Kachel
 * „Kein Cover – Klicken“.
 */
function SickbayCoverThumb({ game, onOpenEdit, size = 'sm' }) {
  const coverUrl = extractGameCoverUrl(game);
  const canEdit = Boolean(game?.id && onOpenEdit);

  const dims =
    size === 'lg'
      ? 'h-28 w-21'
      : size === 'md'
        ? 'h-20 w-15'
        : 'h-14 w-11';

  const handleClick = (event) => {
    if (!canEdit) return;
    event.stopPropagation();
    event.preventDefault();
    onOpenEdit(game);
  };

  if (coverUrl) {
    return (
      <div
        role={canEdit ? 'button' : undefined}
        tabIndex={canEdit ? 0 : undefined}
        onClick={handleClick}
        onKeyDown={(event) => {
          if (canEdit && (event.key === 'Enter' || event.key === ' ')) {
            handleClick(event);
          }
        }}
        title={canEdit ? 'Cover anklicken zum Ändern (IGDB / Bild-URL)' : undefined}
        className={`group relative ${dims} flex-none overflow-hidden rounded-lg border border-zinc-800 bg-[#121314] shadow ${
          canEdit ? 'cursor-pointer hover:border-[#00ff66]/60' : ''
        }`}
      >
        <img
          src={coverUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition group-hover:opacity-80"
        />
        {canEdit ? (
          <span className=" absolute inset-0 flex items-center justify-center bg-black/70 px-1 text-center font-mono text-[8px] font-bold uppercase leading-tight tracking-wider text-[#00ff66] opacity-0 transition group-hover:opacity-100">
            Cover ändern
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role={canEdit ? 'button' : undefined}
      tabIndex={canEdit ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (canEdit && (event.key === 'Enter' || event.key === ' ')) {
          handleClick(event);
        }
      }}
      title={canEdit ? 'Kein Cover vorhanden – Klicken zum Setzen' : 'Kein Cover vorhanden'}
      className={`${dims} flex flex-none items-center justify-center rounded-lg border border-dashed border-amber-500/40 bg-[#121314] px-1 text-center font-mono text-[8px] font-bold uppercase leading-tight tracking-wider text-amber-300 transition ${
        canEdit ? 'cursor-pointer hover:border-[#00ff66] hover:bg-[#00ff66]/10 hover:text-[#00ff66]' : ' opacity-60'
      }`}
    >
      Kein Cover – Klicken
    </div>
  );
}

/**
 * Direkt-Edit-Dialog für das Spiel-Cover (analog zu @GameDetailPage).
 * Speichert über `admin_fix_game_cover` bzw. direktes `games`-Update (`cover_url`, `cover_status='valid'`, `cover_notes=null`).
 */
function CoverEditModal({ game, onClose, onSaved }) {
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!game) return null;

  const title =
    game.display_title ||
    game.spieltitel?.de ||
    game.spieltitel?.en ||
    pickText(game.spieltitel) ||
    'Unbenanntes Spiel';
  const currentCover = extractGameCoverUrl(game);
  const googleSearchUrl = buildGoogleImagesCoverUrl(game);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!urlInput.trim() || saving) return;

    setSaving(true);
    setErrorMsg('');
    const { coverUrl, coverMap, error } = await fixGameCover(
      supabase,
      game.id,
      urlInput,
      game.cover_url,
    );
    setSaving(false);

    if (error) {
      setErrorMsg(error.message || 'Cover konnte nicht gespeichert werden.');
      return;
    }

    onSaved?.(game.id, coverUrl, coverMap);
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sickbay-cover-modal-title"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#1a1b1c] p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="sickbay-cover-modal-title" className="text-sm font-bold text-white">
              Cover direkt setzen / ändern
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-400" title={title}>
              {title} {game.hardware ? `· ${game.hardware}` : ''}
            </p>
          </div>
          <a
            href={googleSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-sky-300 hover:bg-sky-500/20"
          >
            🔍 Bild suchen
          </a>
        </div>

        {currentCover ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-zinc-800 bg-[#121314] p-2">
            <img src={currentCover} alt="" className="h-16 w-12 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase text-zinc-500">Aktuelles Cover</p>
              <p className="truncate font-mono text-[11px] text-zinc-300">{currentCover}</p>
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2 font-mono text-[11px] text-amber-300">
            Aktuell kein Cover vorhanden (NULL / &#123;&#125;)
          </p>
        )}

        <p className="mt-3 text-xs leading-relaxed text-zinc-400">
          Bildlink (z. B. von <code className="text-zinc-300">images.igdb.com</code>) einfügen. Setzt{' '}
          <code className="text-zinc-300">cover_url.de</code> &amp;{' '}
          <code className="text-zinc-300">cover_url.en</code>, markiert{' '}
          <code className="text-zinc-300">cover_status = &apos;valid&apos;</code> und leert{' '}
          <code className="text-zinc-300">cover_notes</code>.
        </p>

        <input
          type="text"
          inputMode="url"
          value={urlInput}
          onChange={(event) => setUrlInput(event.target.value)}
          placeholder="https://images.igdb.com/igdb/image/upload/…"
          autoFocus
          className="mt-3 w-full rounded-xl border border-zinc-700 bg-[#121314] px-3 py-2 text-sm text-zinc-200 focus:border-[#00ff66]/40 focus:outline-none"
        />

        {errorMsg ? (
          <p className="mt-2 font-mono text-[11px] text-red-300">{errorMsg}</p>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={saving || !urlInput.trim()}
            className="rounded-xl bg-[#00ff66] px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[#121314] hover:bg-[#00ff66]/90 disabled:opacity-50"
          >
            {saving ? 'Speichert…' : '✓ Cover speichern'}
          </button>
        </div>
      </form>
    </div>
  );
}

function formatHours(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '';
}

function Pill({ active, onClick, children, count, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition ${
        active
          ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66]'
          : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {children}
      {count != null ? <span className="ml-1.5 text-zinc-500">{count}</span> : null}
    </button>
  );
}

function GuideTypBadge({ value, className = '' }) {
  const typ = String(value ?? '').trim().toUpperCase();
  if (!typ) return null;
  return (
    <span
      className={`inline-flex items-center rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 ${className}`}
      title={`guide_typ = ${typ}`}
    >
      [{typ}]
    </span>
  );
}

/** Unkontrolliert; der Aufrufer remountet per `key`, wenn sich der gespeicherte Wert ändert. */
function PlaytimeInput({ label, value, onSave, disabled }) {
  const saved = formatHours(value);
  return (
    <label className="flex items-center gap-2 text-[11px] text-zinc-400">
      <span className="uppercase tracking-wider">{label}</span>
      <input
        type="number"
        min="0"
        step="0.5"
        defaultValue={saved}
        disabled={disabled}
        onBlur={(event) => {
          if (event.target.value !== saved) onSave(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className="w-20 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-100 focus:border-[#00ff66]/40 focus:outline-none"
        placeholder="h"
      />
    </label>
  );
}

function GuideTipCell({ trophy, gameId, onSaved, disabled }) {
  const current = pickGuideTip(trophy.guide_tip, PUBLISH_LANG);
  const trophyLabel = pickText(trophy.trophy_name) || trophy[ACHIEVEMENT_PK];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const startEditing = () => {
    setDraft(current);
    setError('');
    setEditing(true);
  };

  const commit = async (nextText) => {
    const trimmed = String(nextText ?? '').trim();
    if (trimmed === current) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError('');
    const { error: saveError } = await saveTrophyGuideTip(
      supabase,
      gameId,
      trophy[ACHIEVEMENT_PK],
      PUBLISH_LANG,
      trimmed,
    );
    setSaving(false);
    if (saveError) {
      setError(saveError.message || 'Tipp konnte nicht gespeichert werden.');
      return;
    }
    setEditing(false);
    onSaved(trimmed);
  };

  const handleDelete = async () => {
    if (!current || saving || disabled) return;
    if (
      !window.confirm(
        `Guide-Tipp für Trophäe „${trophyLabel}“ [${PUBLISH_LANG.toUpperCase()}] wirklich löschen?`,
      )
    ) {
      return;
    }
    setDraft('');
    await commit('');
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <textarea
          autoFocus
          value={draft}
          disabled={disabled || saving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setDraft(current);
              setEditing(false);
            }
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              commit(draft);
            }
          }}
          rows={3}
          placeholder="Guide-Tipp (de) eingeben…"
          className="w-full rounded border border-[#00ff66]/40 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 focus:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          {current ? (
            <button
              type="button"
              disabled={disabled || saving}
              onClick={handleDelete}
              className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-[10px] text-red-300 hover:bg-red-500/20 disabled:opacity-50"
            >
              🗑️ Tipp löschen
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setDraft(current);
                setEditing(false);
              }}
              className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-400 hover:text-white"
            >
              Abbrechen
            </button>
            <button
              type="button"
              disabled={disabled || saving}
              onClick={() => commit(draft)}
              className="rounded bg-[#00ff66] px-2.5 py-0.5 font-mono text-[10px] font-bold text-black hover:bg-[#00ff66]/90 disabled:opacity-50"
            >
              {saving ? 'Speichert…' : '✓ Speichern'}
            </button>
          </div>
        </div>
        {error ? <span className="block text-[10px] text-red-400">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={startEditing}
          disabled={disabled || saving}
          className="min-w-0 flex-1 text-left text-xs leading-snug text-zinc-300 hover:text-zinc-100"
          title="Klicken zum Bearbeiten (guide_tip, de)"
        >
          {current ? current : <span className="italic text-zinc-600">+ Guide-Tipp (de)</span>}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={disabled || saving}
            onClick={startEditing}
            title="Guide-Tipp bearbeiten"
            className="font-mono text-[10px] text-zinc-400 underline transition hover:text-[#00ff66] disabled:opacity-50"
          >
            {current ? '✏️ Bearbeiten' : '+ Tipp'}
          </button>
          {current ? (
            <button
              type="button"
              disabled={disabled || saving}
              onClick={handleDelete}
              title="Diesen Guide-Tipp löschen"
              className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              🗑️ Löschen
            </button>
          ) : null}
        </div>
      </div>
      {error ? <span className="block text-[10px] text-red-400">{error}</span> : null}
    </div>
  );
}

/** Servertot-Zusatzfelder; per `key={game.id}` remountet, Inputs unkontrolliert (Speichern bei Blur). */
function ServertotFields({ game, busy, onExplanation }) {
  const savedExplanation = pickText(game.status_explanation_localized);
  return (
    <div className="mt-4 border-t border-zinc-800 pt-4">
      <label className="block text-[11px] text-zinc-400">
        <span className="uppercase tracking-wider">Status-Erklärung (de)</span>
        <textarea
          defaultValue={savedExplanation}
          disabled={busy === 'playtime'}
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (next !== savedExplanation) onExplanation(next);
          }}
          rows={2}
          className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 focus:border-[#00ff66]/40 focus:outline-none"
          placeholder="Warum ist die Platin nicht (mehr) erreichbar? Server-Abschaltung, Datum …"
        />
      </label>
    </div>
  );
}

/**
 * @param {object} props
 * @param {'d_freigabe'|'servertot'} props.mode
 * @param {object|null} props.sessionUser
 * @param {(gameId: string) => void} [props.onOpenInDrafts]
 */
export default function IntranetRadarAndServertot({ mode = 'd_freigabe', sessionUser, onOpenInDrafts }) {
  const isSickbayMode = mode === 'servertot';
  const config = MODES[mode] ?? MODES.d_freigabe;
  const [sickbayTab, setSickbayTab] = useState('servertot');
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [includePublished, setIncludePublished] = useState(false);
  const [pill, setPill] = useState(config.defaultPill ?? config.pills[0].id);
  const [search, setSearch] = useState('');
  const [skipped, setSkipped] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  // Trophäen werden zusammen mit der Spiel-ID gehalten → „lädt“ ist ableitbar, kein setState im Effect nötig.
  const [achievementsState, setAchievementsState] = useState({ gameId: null, rows: [] });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const reloadToken = useRef(0);

  // Tab 2 (Cover-Fehler: v_sickbay_covers) & Tab 3 (Fehlermeldungen: community_reports)
  const [coverRows, setCoverRows] = useState([]);
  const [coversLoading, setCoversLoading] = useState(false);
  const [coverFilter, setCoverFilter] = useState('all');
  const [coverSearch, setCoverSearch] = useState('');
  const [coverBusyId, setCoverBusyId] = useState('');

  const [reportRows, setReportRows] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportFilter, setReportFilter] = useState('pending');
  const [reportSearch, setReportSearch] = useState('');
  const [reportBusyId, setReportBusyId] = useState('');

  // Anklickbares Cover-Modal für alle 3 Tabs
  const [editingCoverGame, setEditingCoverGame] = useState(null);

  const loadSickbayExtras = useCallback(async () => {
    if (!isSickbayMode) return;
    setCoversLoading(true);
    setReportsLoading(true);
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      if (!sessionData?.session) {
        throw new Error('Keine aktive Admin-Sitzung gefunden. Bitte neu anmelden.');
      }

      const [coversRes, reportsRes] = await Promise.all([
        fetchSickbayCovers(),
        fetchCommunityReports(supabase),
      ]);
      if (coversRes.error) {
        console.error('Krankenstation Cover-Fehler:', coversRes.error);
        setError((prev) => prev || coversRes.error.message || 'Cover-Fehler konnten nicht geladen werden.');
      } else {
        setCoverRows(coversRes.rows);
      }
      if (reportsRes.error) {
        console.error('Krankenstation Fehlermeldungen:', reportsRes.error);
        setError((prev) => prev || reportsRes.error.message || 'Fehlermeldungen konnten nicht geladen werden.');
      } else {
        setReportRows(reportsRes.reports);
      }
    } catch (err) {
      console.error('Krankenstation Extras Fehler:', err);
      setError((prev) => prev || err?.message || 'Krankenstation-Daten konnten nicht geladen werden.');
    } finally {
      setCoversLoading(false);
      setReportsLoading(false);
    }
  }, [isSickbayMode]);

  const loadQueueSafe = useCallback(
    async (withPublished, token) => {
      setLoading(true);
      setError('');
      try {
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;
        if (!sessionData?.session) {
          throw new Error('Keine aktive Admin-Sitzung gefunden. Bitte neu anmelden.');
        }

        const result = await fetchQueue(mode, { includePublished: withPublished });
        if (token !== reloadToken.current) return;
        if (result.error) throw result.error;
        setGames(result.rows.filter((game) => matchesMode(mode, game, { includePublished: withPublished })));
        setTruncated(result.truncated);
      } catch (err) {
        console.error('Krankenstation/Radar Queue Fehler:', err);
        if (token === reloadToken.current) {
          setError(err?.message || 'Queue konnte nicht geladen werden.');
          setGames([]);
        }
      } finally {
        if (token === reloadToken.current) {
          setLoading(false);
        }
      }
    },
    [mode],
  );

  // Initial-Load; startet erst nach abgeschlossener Session-Prüfung.
  useEffect(() => {
    const token = ++reloadToken.current;
    loadQueueSafe(false, token);
    if (isSickbayMode) {
      loadSickbayExtras();
    }
  }, [mode, isSickbayMode, loadQueueSafe, loadSickbayExtras]);

  const reload = (withPublished = includePublished) => {
    const token = ++reloadToken.current;
    loadQueueSafe(withPublished, token);
    if (isSickbayMode) {
      loadSickbayExtras();
    }
  };

  const toggleIncludePublished = (checked) => {
    setIncludePublished(checked);
    setSelectedId(null);
    reload(checked);
  };

  const pillCounts = useMemo(() => {
    const counts = {};
    for (const definition of config.pills) {
      counts[definition.id] = games.filter((game) => definition.test(game) && !skipped.has(game[GAME_PK])).length;
    }
    return counts;
  }, [config.pills, games, skipped]);

  const queue = useMemo(() => {
    const definition = config.pills.find((entry) => entry.id === pill) ?? config.pills[0];
    const needle = search.trim().toLowerCase();
    return games
      .filter((game) => definition.test(game) && !skipped.has(game[GAME_PK]))
      .filter((game) => {
        if (!needle) return true;
        const haystack = [
          allTexts(game.spieltitel),
          getPlatformGameId(game),
          game.publisher,
          game.entwickler,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => collator.compare(pickText(a.spieltitel), pickText(b.spieltitel)));
  }, [config.pills, games, pill, search, skipped]);

  // Aktive Auswahl: explizit gewählt und noch in der aktuellen Pill-Queue, sonst erstes Queue-Element.
  const activeId = selectedId && queue.some((game) => game[GAME_PK] === selectedId) ? selectedId : queue[0]?.[GAME_PK] ?? null;
  const activeGame = useMemo(
    () => games.find((game) => game[GAME_PK] === activeId) ?? null,
    [games, activeId],
  );

  const detailsLoaded = Boolean(activeGame?._detailsLoaded);

  useEffect(() => {
    if (!activeId) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const { rows, error: loadError } = await fetchAchievements(activeId);
        if (cancelled) return;
        if (loadError) throw loadError;
        setAchievementsState({ gameId: activeId, rows });
      } catch (err) {
        console.error('Krankenstation Trophäen Fehler:', err);
        if (!cancelled) {
          setError(err?.message || 'Trophäen konnten nicht geladen werden.');
          setAchievementsState({ gameId: activeId, rows: [] });
        }
      }
    })();

    if (!detailsLoaded) {
      (async () => {
        try {
          const { details, error: loadError } = await fetchGameDetails(activeId);
          if (cancelled) return;
          if (loadError) throw loadError;
          if (details) {
            setGames((prev) => prev.map((game) => (game[GAME_PK] === activeId ? { ...game, ...details } : game)));
          }
        } catch (err) {
          console.error('Krankenstation Spieldetails Fehler:', err);
          if (!cancelled) {
            setError(err?.message || 'Spieldetails konnten nicht geladen werden.');
          }
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [activeId, detailsLoaded]);

  const achievementsLoading = Boolean(activeId) && achievementsState.gameId !== activeId;
  const achievements = useMemo(
    () => (achievementsState.gameId === activeId ? achievementsState.rows : []),
    [achievementsState, activeId],
  );
  const setAchievements = useCallback((updater) => {
    setAchievementsState((prev) => ({
      ...prev,
      rows: typeof updater === 'function' ? updater(prev.rows) : updater,
    }));
  }, []);

  const patchGame = useCallback((gameId, partial) => {
    setGames((prev) => prev.map((game) => (game[GAME_PK] === gameId ? { ...game, ...partial } : game)));
  }, []);

  const selectNext = useCallback(
    (fromId) => {
      const index = queue.findIndex((game) => game[GAME_PK] === fromId);
      const candidates = queue.filter((game) => game[GAME_PK] !== fromId);
      const next = candidates[Math.min(Math.max(index, 0), candidates.length - 1)] ?? null;
      setSelectedId(next ? next[GAME_PK] : null);
    },
    [queue],
  );

  const removeFromQueue = useCallback(
    (gameId) => {
      selectNext(gameId);
      setGames((prev) => prev.filter((game) => game[GAME_PK] !== gameId));
    },
    [selectNext],
  );

  /** Patcht das Spiel und wirft es aus der Queue, wenn es den Modus-Filter verlässt. */
  const patchAndRecheck = useCallback(
    (gameId, partial) => {
      const current = games.find((game) => game[GAME_PK] === gameId);
      if (!current) return;
      const next = { ...current, ...partial };
      if (matchesMode(mode, next, { includePublished })) {
        patchGame(gameId, partial);
      } else {
        removeFromQueue(gameId);
      }
    },
    [games, includePublished, mode, patchGame, removeFromQueue],
  );

  const run = async (key, task) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await task();
    } catch (caught) {
      setError(caught?.message || String(caught));
    } finally {
      setBusy('');
    }
  };

  const handleGuideTyp = (typ) =>
    run('guide_typ', async () => {
      const id = activeGame[GAME_PK];
      const { error: saveError } = await supabase
        .from(TABLES.games)
        .update({ [GAME_STRUCT.guideTyp]: typ })
        .eq(GAME_PK, id);
      if (saveError) throw saveError;
      patchAndRecheck(id, { guide_typ: typ });
    });

  const handleGameField = (field, value, { recheck = true } = {}) =>
    run(field, async () => {
      const id = activeGame[GAME_PK];
      const { error: saveError } = await supabase
        .from(TABLES.games)
        .update({ [field]: value })
        .eq(GAME_PK, id);
      if (saveError) throw saveError;
      if (recheck) patchAndRecheck(id, { [field]: value });
      else patchGame(id, { [field]: value });
    });

  const handlePlaytime = (partial) =>
    run('playtime', async () => {
      const id = activeGame[GAME_PK];
      const payload = {
        hauptstory: partial.hauptstory ?? activeGame.spielzeit_hauptstory,
        komplett: partial.komplett ?? activeGame.spielzeit_komplettierer,
      };
      if (partial.statusExplanation !== undefined) {
        payload.statusExplanation = partial.statusExplanation;
        payload.locale = PUBLISH_LANG;
      }
      const result = await saveGamePlaytime(supabase, id, payload);
      if (result.error) throw result.error;
      const next = {
        spielzeit_hauptstory: result.hauptstory,
        spielzeit_komplettierer: result.komplett,
      };
      if (partial.statusExplanation !== undefined) {
        const map =
          activeGame.status_explanation_localized && typeof activeGame.status_explanation_localized === 'object'
            ? { ...activeGame.status_explanation_localized }
            : {};
        map[PUBLISH_LANG] = result.statusExplanation ?? partial.statusExplanation;
        next.status_explanation_localized = map;
      }
      patchGame(id, next);
    });

  const handleFlag = (trophy, flagKey) =>
    run(`flag:${trophy[ACHIEVEMENT_PK]}:${flagKey}`, async () => {
      const id = activeGame[GAME_PK];
      const nextValue = !trophy[flagKey];
      const { totals, error: saveError } = await setAchievementFlags(supabase, id, trophy[ACHIEVEMENT_PK], {
        [flagKey]: nextValue,
      });
      if (saveError) throw saveError;
      setAchievements((prev) =>
        prev.map((entry) => (entry[ACHIEVEMENT_PK] === trophy[ACHIEVEMENT_PK] ? { ...entry, [flagKey]: nextValue } : entry)),
      );
      if (totals) patchGame(id, totals);
    });

  const handleBulkOnline = () =>
    run('bulk-online', async () => {
      const id = activeGame[GAME_PK];
      const matched = achievements
        .filter((trophy) => {
          if (trophy.is_online) return false;
          const text = [allTexts(trophy.trophy_name), allTexts(trophy.trophy_desc), allTexts(trophy.guide_tip)].join(' \n ');
          return ONLINE_KEYWORDS.test(text);
        })
        .map((trophy) => trophy[ACHIEVEMENT_PK]);
      if (!matched.length) {
        setNotice('Keine neuen Online-/Koop-Treffer in Name, Beschreibung oder Tipp.');
        return;
      }
      const { totals, error: saveError } = await setAchievementsOnline(supabase, id, matched, true);
      if (saveError) throw saveError;
      const matchedSet = new Set(matched);
      setAchievements((prev) =>
        prev.map((entry) => (matchedSet.has(entry[ACHIEVEMENT_PK]) ? { ...entry, is_online: true } : entry)),
      );
      if (totals) patchGame(id, totals);
      setNotice(`${matched.length} Trophäe(n) als Online markiert.`);
    });

  const handleClearAllGuideTips = () => {
    if (!activeGame) return;
    const title = pickText(activeGame.spieltitel) || 'dieses Spiel';
    if (
      !window.confirm(
        `Möchtest du wirklich ALLE Guide-Tipps für „${title}“ in der Sprache [${PUBLISH_LANG.toUpperCase()}] komplett löschen?`,
      )
    ) {
      return;
    }
    run('clear-tips', async () => {
      const id = activeGame[GAME_PK];
      const { error: clearError } = await clearGameGuideTips(supabase, id, PUBLISH_LANG);
      if (clearError) throw clearError;
      setAchievements((prev) =>
        prev.map((entry) => ({
          ...entry,
          guide_tip: withGuideTipForLang(entry.guide_tip, PUBLISH_LANG, ''),
        })),
      );
      setNotice(`🗑️ Alle Guide-Tipps in [${PUBLISH_LANG.toUpperCase()}] wurden komplett gelöscht.`);
    });
  };

  const handlePublish = () =>
    run('publish', async () => {
      const id = activeGame[GAME_PK];
      const title = pickText(activeGame.spieltitel);
      if (mode === 'servertot') {
        const servertot = GAME_TYPE.SERVER_DEAD;
        if (!hasType(activeGame, servertot)) {
          const current = parseGameTypes(activeGame.spiel_typ);
          const nextTypes = [current[0], servertot].filter(Boolean);
          const { error: typeError } = await setIntranetGameType(supabase, id, nextTypes);
          if (typeError) throw typeError;
        }
      }
      const { error: publishError } = await setGuidePublished(supabase, id, PUBLISH_LANG, true);
      if (publishError) throw publishError;
      removeFromQueue(id);
      setNotice(
        mode === 'servertot'
          ? `„${title}“ ist als Servertot live (guide_de = PUBLISHED).`
          : `„${title}“ ist ohne Video live (guide_de = PUBLISHED).`,
      );
    });

  const handleDraftsAndFollow = () =>
    run('drafts', async () => {
      const id = activeGame[GAME_PK];
      const { count, error: countError } = await supabase
        .from(TABLES.stagingGuides)
        .select('id', { count: 'exact', head: true })
        .eq(GAME_FK, id);
      if (countError) throw countError;
      if (!(count > 0)) {
        const result = await pullGameBackToDrafts(supabase, id, PUBLISH_LANG);
        if (!result.ok) throw result.error ?? new Error('Zurückholen fehlgeschlagen.');
        patchGame(id, {
          status: result.status,
          publishing_status: {},
          published_locales: [],
          is_guide_locked: false,
        });
      }
      onOpenInDrafts?.(id);
    });

  const handleSkip = () => {
    if (!activeGame) return;
    const id = activeGame[GAME_PK];
    selectNext(id);
    setSkipped((prev) => new Set(prev).add(id));
  };

  /**
   * Optimistic UI Callback nach erfolgreichem Speichern eines Covers im Modal.
   * - In Tab 1 (Servertot / D-Freigabe): aktualisiert `cover_url` am Spiel.
   * - In Tab 2 (Cover-Fehler): entfernt die Zeile sofort per Optimistic UI aus `coverRows`.
   * - In Tab 3 (Fehlermeldungen): aktualisiert das verknüpfte Spiel-Cover in `reportRows`.
   */
  const handleCoverSaved = useCallback((gameId, newUrl, nextCoverMap) => {
    const resolvedMap =
      nextCoverMap && typeof nextCoverMap === 'object'
        ? nextCoverMap
        : { de: newUrl, en: newUrl };

    setGames((prev) =>
      prev.map((game) =>
        game[GAME_PK] === gameId
          ? {
              ...game,
              cover_url: { ...(game.cover_url || {}), ...resolvedMap },
              cover_status: 'valid',
              cover_notes: null,
            }
          : game,
      ),
    );
    // Optimistic UI: im Tab "Cover-Fehler" verschwindet die Zeile sofort aus der Liste
    setCoverRows((prev) => prev.filter((row) => row.id !== gameId));
    setReportRows((prev) =>
      prev.map((report) =>
        report.game?.id === gameId
          ? {
              ...report,
              game: {
                ...report.game,
                cover_url: { ...(report.game.cover_url || {}), ...resolvedMap },
                cover_status: 'valid',
                cover_notes: null,
              },
            }
          : report,
      ),
    );
    setNotice('✓ Cover gespeichert (cover_status = valid) und Liste aktualisiert.');
  }, []);

  /**
   * Quick-Action „Trotzdem OK" (False Positive) im Tab „Cover-Fehler":
   * Setzt in `games` direkt `cover_status = 'valid'` und `cover_notes = null`
   * und entfernt das Spiel sofort per Optimistic UI aus der Liste.
   */
  const handleMarkCoverOk = async (row) => {
    if (!row?.id || coverBusyId) return;
    const previousRows = coverRows;
    const title = row.display_title || pickText(row.spieltitel) || 'Spiel';
    setError('');
    setNotice('');
    // Optimistic UI: sofort aus der Liste entfernen
    setCoverRows((prev) => prev.filter((entry) => entry.id !== row.id));
    setCoverBusyId(row.id);
    const { error: updateError } = await markGameCoverValid(supabase, row.id);
    setCoverBusyId('');
    if (updateError) {
      setCoverRows(previousRows);
      setError(updateError.message || 'Cover-Status konnte nicht auf valid gesetzt werden.');
      return;
    }
    setGames((prev) =>
      prev.map((game) =>
        game[GAME_PK] === row.id ? { ...game, cover_status: 'valid', cover_notes: null } : game,
      ),
    );
    setNotice(`✓ „${title}“ als Trotzdem OK markiert (cover_status = valid).`);
  };

  /**
   * Fehlermeldung erledigen (Approve / Status setzen) oder löschen.
   */
  const handleResolveReport = async (report, modeAction = 'resolve') => {
    if (!report?.id || reportBusyId) return;
    setReportBusyId(String(report.id));
    setError('');
    setNotice('');

    if (modeAction === 'delete') {
      const previous = reportRows;
      setReportRows((prev) => prev.filter((entry) => entry.id !== report.id));
      const { error: delError } = await deleteCommunityReport(supabase, report.id);
      setReportBusyId('');
      if (delError) {
        setReportRows(previous);
        setError(delError.message || 'Meldung konnte nicht gelöscht werden.');
        return;
      }
      setNotice(`🗑️ Meldung #${report.id} gelöscht.`);
      return;
    }

    if (modeAction === 'apply') {
      const { error: applyError } = await setReportStatus(supabase, report.id, 'approved', report);
      setReportBusyId('');
      if (applyError) {
        setError(applyError.message || 'Vorschlag konnte nicht übernommen werden.');
        return;
      }
      setReportRows((prev) =>
        prev.map((entry) => (entry.id === report.id ? { ...entry, status: 'approved' } : entry)),
      );
      setNotice(`✓ Meldung #${report.id} übernommen & erledigt.`);
      return;
    }

    // Standard „Erledigen": setzt Status direkt auf approved (ohne automatisches Überschreiben, falls manuell geprüft)
    const { error: statusError } = await setReportStatus(supabase, report.id, 'approved', null);
    setReportBusyId('');
    if (statusError) {
      setError(statusError.message || 'Meldung konnte nicht als erledigt markiert werden.');
      return;
    }
    setReportRows((prev) =>
      prev.map((entry) => (entry.id === report.id ? { ...entry, status: 'approved' } : entry)),
    );
    setNotice(`✓ Meldung #${report.id} als erledigt markiert.`);
  };

  const coverCounts = useMemo(() => {
    let invalid = 0;
    let missing = 0;
    for (const row of coverRows) {
      if (row.cover_status === 'invalid') invalid += 1;
      else missing += 1;
    }
    return { all: coverRows.length, invalid, missing };
  }, [coverRows]);

  const filteredCovers = useMemo(() => {
    const needle = coverSearch.trim().toLowerCase();
    return coverRows.filter((row) => {
      if (coverFilter === 'invalid' && row.cover_status !== 'invalid') return false;
      if (coverFilter === 'missing' && row.cover_status === 'invalid') return false;
      if (!needle) return true;
      const haystack = [
        row.display_title,
        allTexts(row.spieltitel),
        row.slug,
        row.hardware,
        row.ecosystem,
        row.computed_error_reason,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [coverRows, coverFilter, coverSearch]);

  const reportCounts = useMemo(() => {
    const pendingCount = reportRows.filter((r) => (r.status || 'pending') === 'pending').length;
    return {
      pending: pendingCount,
      all: reportRows.length,
    };
  }, [reportRows]);

  const filteredReports = useMemo(() => {
    const needle = reportSearch.trim().toLowerCase();
    return reportRows.filter((row) => {
      const status = row.status || 'pending';
      if (reportFilter === 'pending' && status !== 'pending') return false;
      if (!needle) return true;
      const title = row.game
        ? pickText(row.game.spieltitel)
        : formatReportGameTitle(row.spieltitel);
      const haystack = [
        title,
        formatReportNpwr(row.platform_game_id),
        row.source_identifier,
        row.content_type,
        row.field_name,
        row.original_text,
        row.suggested_text,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [reportRows, reportFilter, reportSearch]);

  const servertotTabCount = useMemo(
    () => pillCounts[config.defaultPill] ?? games.length,
    [pillCounts, config.defaultPill, games.length],
  );

  const sickbayTabCounts = useMemo(
    () => ({
      servertot: servertotTabCount,
      covers: coverRows.length,
      reports: reportCounts.pending,
    }),
    [servertotTabCount, coverRows.length, reportCounts.pending],
  );

  const href = activeGame ? intranetGameHref(activeGame) : '';
  const npwr = activeGame ? getPlatformGameId(activeGame) : '';
  const totals = useMemo(() => {
    const online = achievements.filter((entry) => entry.is_online).length;
    const missable = achievements.filter((entry) => entry.is_missable).length;
    const collectible = achievements.filter((entry) => entry.is_collectible).length;
    const story = achievements.filter((entry) => entry.is_story_related).length;
    return { online, missable, collectible, story };
  }, [achievements]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black uppercase tracking-wider text-zinc-100">{config.title}</h2>
          <p className="mt-1 max-w-3xl text-xs text-zinc-500">{config.subtitle}</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-zinc-400">
          {!isSickbayMode || sickbayTab === 'servertot' ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includePublished}
                onChange={(event) => toggleIncludePublished(event.target.checked)}
                className="accent-[#00ff66]"
              />
              Bereits veröffentlichte einbeziehen
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => reload()}
            disabled={loading || coversLoading || reportsLoading}
            className="rounded border border-zinc-800 px-2 py-1 font-bold uppercase tracking-wider hover:text-zinc-200 disabled:opacity-50"
          >
            ↻ Neu laden
          </button>
        </div>
      </header>

      {/* 3 Umschalt-Tabs der Krankenstation (jeweils mit Anzahl-Badge) */}
      {isSickbayMode ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
          {SICKBAY_TABS.map((tab) => {
            const active = sickbayTab === tab.id;
            const count = sickbayTabCounts[tab.id] ?? 0;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSickbayTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-wider transition ${
                  active
                    ? 'border-[#00ff66]/50 bg-[#00ff66]/15 text-[#00ff66] shadow-[0_0_20px_rgba(0,255,102,0.12)]'
                    : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                    active
                      ? 'bg-[#00ff66]/20 text-[#00ff66]'
                      : 'bg-zinc-900 text-zinc-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>
      ) : null}
      {notice ? (
        <p className="rounded border border-[#00ff66]/30 bg-[#00ff66]/10 px-3 py-2 text-xs text-[#00ff66]">{notice}</p>
      ) : null}

      {/* TAB 2: Cover-Fehler (Datenquelle: v_sickbay_covers) */}
      {isSickbayMode && sickbayTab === 'covers' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Pill
                active={coverFilter === 'all'}
                onClick={() => setCoverFilter('all')}
                count={coverCounts.all}
              >
                Alle Cover-Fehler
              </Pill>
              <Pill
                active={coverFilter === 'invalid'}
                onClick={() => setCoverFilter('invalid')}
                count={coverCounts.invalid}
              >
                Defekt / Invalid
              </Pill>
              <Pill
                active={coverFilter === 'missing'}
                onClick={() => setCoverFilter('missing')}
                count={coverCounts.missing}
              >
                Fehlend (NULL / &#123;&#125;)
              </Pill>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="search"
                value={coverSearch}
                onChange={(event) => setCoverSearch(event.target.value)}
                placeholder="Spieltitel, Hardware, Fehler-Grund…"
                className="w-64 rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-[#00ff66]/40 focus:outline-none"
              />
              <span className="font-mono text-[11px] text-zinc-500">
                {coversLoading ? 'Lädt…' : `${filteredCovers.length} Einträge`}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60">
            <ul className="divide-y divide-zinc-900">
              {filteredCovers.map((row) => {
                const gameHref = intranetGameHref(row);
                const title = row.display_title || pickText(row.spieltitel) || 'Unbenanntes Spiel';
                const googleUrl = buildGoogleImagesCoverUrl(row);
                const isInvalid = row.cover_status === 'invalid';
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 transition hover:bg-zinc-900/40"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3.5">
                      <SickbayCoverThumb
                        game={row}
                        onOpenEdit={(target) => setEditingCoverGame(target)}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {gameHref ? (
                            <a
                              href={gameHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(event) => handleStaffGamePreviewClick(event, gameHref)}
                              className="truncate text-sm font-black text-zinc-100 hover:text-[#00ff66] hover:underline"
                            >
                              {title}
                            </a>
                          ) : (
                            <span className="truncate text-sm font-black text-zinc-100">{title}</span>
                          )}
                          {row.hardware ? (
                            <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-zinc-300">
                              {row.hardware}
                            </span>
                          ) : null}
                          {row.ecosystem ? (
                            <span className="rounded border border-zinc-800 bg-zinc-900/70 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-400">
                              {row.ecosystem}
                            </span>
                          ) : null}
                          {parseGameTypes(row.spiel_typ).map((type) => (
                            <span
                              key={type}
                              className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-300"
                            >
                              {type}
                            </span>
                          ))}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${
                              isInvalid
                                ? 'border-red-500/40 bg-red-500/10 text-red-300'
                                : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                            }`}
                          >
                            {isInvalid ? '⚠️' : '🖼️'} {row.computed_error_reason || 'Cover fehlt / ungültig'}
                          </span>
                          {row.slug ? (
                            <span className="font-mono text-[10px] text-zinc-500">/{row.slug}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Quick-Actions im Tab "Cover-Fehler" */}
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={googleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-sky-200 transition hover:bg-sky-500/20"
                        title="1-Click Google Images Suche nach Cover / IGDB"
                      >
                        🔍 Bild suchen
                      </a>
                      <button
                        type="button"
                        onClick={() => setEditingCoverGame(row)}
                        className="rounded-lg border border-[#00ff66]/40 bg-[#00ff66]/10 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#00ff66] transition hover:bg-[#00ff66]/20"
                      >
                        ✏️ Cover setzen
                      </button>
                      <button
                        type="button"
                        disabled={coverBusyId === row.id}
                        onClick={() => handleMarkCoverOk(row)}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                        title="False Positive: Setzt cover_status = 'valid' & cover_notes = null"
                      >
                        ✓ Trotzdem OK
                      </button>
                    </div>
                  </li>
                );
              })}
              {!coversLoading && !filteredCovers.length ? (
                <li className="px-4 py-10 text-center text-xs text-zinc-500">
                  Keine Cover-Fehler für diesen Filter gefunden.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {/* TAB 3: Fehlermeldungen (Datenquelle: community_reports inkl. Join auf games) */}
      {isSickbayMode && sickbayTab === 'reports' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Pill
                active={reportFilter === 'pending'}
                onClick={() => setReportFilter('pending')}
                count={reportCounts.pending}
              >
                Offen (Pending)
              </Pill>
              <Pill
                active={reportFilter === 'all'}
                onClick={() => setReportFilter('all')}
                count={reportCounts.all}
              >
                Alle Meldungen
              </Pill>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="search"
                value={reportSearch}
                onChange={(event) => setReportSearch(event.target.value)}
                placeholder="Spiel, Fehlertext, NPWR…"
                className="w-64 rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-[#00ff66]/40 focus:outline-none"
              />
              <span className="font-mono text-[11px] text-zinc-500">
                {reportsLoading ? 'Lädt…' : `${filteredReports.length} Meldung(en)`}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60">
            <ul className="divide-y divide-zinc-900">
              {filteredReports.map((report) => {
                const linkedGame = report.game;
                const gameHref = linkedGame ? intranetGameHref(linkedGame) : report.gameHref || '';
                const title = linkedGame
                  ? pickText(linkedGame.spieltitel) || 'Unbenanntes Spiel'
                  : formatReportGameTitle(report.spieltitel) || report.source_identifier || 'Unbekanntes Spiel';
                const npwrCode = formatReportNpwr(report.platform_game_id);
                const displayKey = formatReportDisplayKey(report);
                const images = parseReportImageUrls(report.image_url);
                const isBusy = reportBusyId === String(report.id);
                const isResolved = report.status && report.status !== 'pending';

                return (
                  <li
                    key={report.id}
                    className="flex flex-col gap-3 px-4 py-3.5 transition hover:bg-zinc-900/40 lg:flex-row lg:items-start lg:justify-between"
                  >
                    {/* Linke Seite: Identisches Spiel-Zeilen-Layout inkl. anklickbarem Cover + gemeldetem Fehlertext */}
                    <div className="flex min-w-0 flex-1 items-start gap-3.5">
                      <SickbayCoverThumb
                        game={linkedGame}
                        onOpenEdit={linkedGame ? (target) => setEditingCoverGame(target) : undefined}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {gameHref ? (
                            <a
                              href={gameHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(event) => handleStaffGamePreviewClick(event, gameHref)}
                              className="truncate text-sm font-black text-zinc-100 hover:text-[#00ff66] hover:underline"
                            >
                              {title}
                            </a>
                          ) : (
                            <span className="truncate text-sm font-black text-zinc-100">{title}</span>
                          )}
                          {linkedGame?.hardware ? (
                            <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-zinc-300">
                              {linkedGame.hardware}
                            </span>
                          ) : null}
                          {linkedGame?.ecosystem ? (
                            <span className="rounded border border-zinc-800 bg-zinc-900/70 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-400">
                              {linkedGame.ecosystem}
                            </span>
                          ) : null}
                          {linkedGame
                            ? parseGameTypes(linkedGame.spiel_typ).map((type) => (
                                <span
                                  key={type}
                                  className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-300"
                                >
                                  {type}
                                </span>
                              ))
                            : null}
                          {npwrCode ? (
                            <span className="font-mono text-[10px] text-zinc-500">{npwrCode}</span>
                          ) : null}
                          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-300">
                            {report.content_type || 'report'} · {displayKey}
                          </span>
                          {report.language_code ? (
                            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-400">
                              {report.language_code}
                            </span>
                          ) : null}
                          {isResolved ? (
                            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-emerald-300">
                              {report.status}
                            </span>
                          ) : null}
                        </div>

                        {/* Gemeldeter Fehlertext */}
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          {report.original_text ? (
                            <div className="rounded-lg border border-zinc-800/90 bg-zinc-950 p-2">
                              <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                                Original / Kontext ({report.field_name || 'Feld'})
                              </p>
                              <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-zinc-300">
                                {report.original_text}
                              </p>
                            </div>
                          ) : null}
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
                            <p className="font-mono text-[9px] uppercase tracking-wider text-amber-300">
                              Gemeldeter Fehler / Korrekturvorschlag
                            </p>
                            <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-zinc-100">
                              {report.suggested_text || '—'}
                            </p>
                          </div>
                        </div>

                        {images.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {images.map((imgUrl, idx) => (
                              <a
                                key={imgUrl}
                                href={imgUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-sky-300 hover:border-sky-400"
                              >
                                📎 Screenshot #{idx + 1}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Rechte Seite: Aktionen zum Erledigen / Übernehmen / Löschen */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {linkedGame ? (
                        <button
                          type="button"
                          onClick={() => setEditingCoverGame(linkedGame)}
                          className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66]"
                          title="Cover dieses Spiels direkt bearbeiten"
                        >
                          🖼️ Cover
                        </button>
                      ) : null}
                      {!isResolved ? (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleResolveReport(report, 'apply')}
                            className="rounded-lg border border-[#00ff66]/40 bg-[#00ff66]/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#00ff66] transition hover:bg-[#00ff66]/20 disabled:opacity-50"
                            title="Korrekturvorschlag in DB übernehmen & als erledigt markieren"
                          >
                            ✓ Übernehmen
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleResolveReport(report, 'resolve')}
                            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                            title="Meldung als erledigt markieren"
                          >
                            ✓ Erledigt
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleResolveReport(report, 'delete')}
                        className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                        title="Fehlermeldung endgültig aus community_reports löschen"
                      >
                        🗑️ Löschen
                      </button>
                    </div>
                  </li>
                );
              })}
              {!reportsLoading && !filteredReports.length ? (
                <li className="px-4 py-10 text-center text-xs text-zinc-500">
                  Keine Fehlermeldungen für diesen Filter vorhanden.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {/* TAB 1: Servertot (bzw. Standard-Ansicht bei d_freigabe) */}
      {!isSickbayMode || sickbayTab === 'servertot' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {config.pills.map((definition) => (
              <Pill
                key={definition.id}
                active={pill === definition.id}
                onClick={() => setPill(definition.id)}
                count={pillCounts[definition.id]}
              >
                {definition.label}
              </Pill>
            ))}
            {skipped.size ? (
              <button
                type="button"
                onClick={() => setSkipped(new Set())}
                className="text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
              >
                {skipped.size} übersprungen · zurückholen
              </button>
            ) : null}
          </div>

          {truncated ? (
            <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Queue auf {MAX_QUEUE_ROWS} Zeilen gedeckelt – Filter oder Suche eingrenzen.
            </p>
          ) : null}

          <div className="grid grid-cols-12 gap-4">
            {/* Linke Queue */}
            <aside className="col-span-12 lg:col-span-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60">
                <div className="border-b border-zinc-800 p-3">
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Titel, NPWR, Publisher…"
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 focus:border-[#00ff66]/40 focus:outline-none"
                  />
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-zinc-500">
                    {loading ? 'Lade Queue…' : `${queue.length} Spiel(e) in der Queue`}
                  </p>
                </div>
                <ul className="max-h-[70vh] overflow-y-auto">
                  {queue.map((game) => {
                    const id = game[GAME_PK];
                    const isActive = id === activeId;
                    return (
                      <li key={id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedId(id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedId(id);
                            }
                          }}
                          className={`flex w-full cursor-pointer items-center gap-3 border-b border-zinc-900 px-3 py-2 text-left transition ${
                            isActive ? 'bg-[#00ff66]/10' : 'hover:bg-zinc-900/60'
                          }`}
                        >
                          <SickbayCoverThumb
                            game={game}
                            onOpenEdit={(target) => setEditingCoverGame(target)}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-xs font-bold ${isActive ? 'text-[#00ff66]' : 'text-zinc-200'}`}>
                              {pickText(game.spieltitel) || 'Unbenanntes Spiel'}
                            </p>
                            <p className="truncate font-mono text-[10px] text-zinc-500">
                              {getPlatformGameId(game) || '—'}
                              {game.hardware ? ` · ${game.hardware}` : ''}
                              {game.ecosystem ? ` · ${game.ecosystem}` : ''}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {parseGameTypes(game.spiel_typ).map((type) => (
                                <span
                                  key={type}
                                  className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-300"
                                >
                                  {type}
                                </span>
                              ))}
                              <GuideTypBadge value={game.guide_typ} />
                              {hasPublishedGuide(game) ? (
                                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
                                  live
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {!loading && !queue.length ? (
                    <li className="px-3 py-6 text-center text-xs text-zinc-500">Keine Spiele in dieser Queue.</li>
                  ) : null}
                </ul>
              </div>
            </aside>

            {/* Rechter Arbeitsbereich */}
            <section className="col-span-12 lg:col-span-9">
              {!activeGame ? (
                <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
                  {loading ? 'Lade…' : 'Wähle links ein Spiel aus.'}
                </div>
              ) : (
                <div className="flex flex-col gap-4 pb-24">
                  {/* Header-Leiste */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3.5">
                        <SickbayCoverThumb
                          game={activeGame}
                          onOpenEdit={(target) => setEditingCoverGame(target)}
                          size="lg"
                        />
                        <div className="min-w-0">
                          <h3 className="text-base font-black text-zinc-100">
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => handleStaffGamePreviewClick(event, href)}
                                className="hover:text-[#00ff66] hover:underline"
                                title="Vorschau öffnen"
                              >
                                {pickText(activeGame.spieltitel) || 'Unbenanntes Spiel'}
                              </a>
                            ) : (
                              pickText(activeGame.spieltitel) || 'Unbenanntes Spiel'
                            )}
                          </h3>
                          {activeGame.spieltitel?.en && activeGame.spieltitel.en !== activeGame.spieltitel?.de ? (
                            <p className="text-xs text-zinc-500">EN: {activeGame.spieltitel.en}</p>
                          ) : null}
                          <p className="mt-1 font-mono text-[11px] text-zinc-500">
                            {npwr || '—'}
                            {activeGame.ecosystem ? ` · ${activeGame.ecosystem}` : ''}
                            {activeGame.release_jahr ? ` · ${activeGame.release_jahr}` : ''}
                            {activeGame.publisher ? ` · ${activeGame.publisher}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <AdminHardwareSelect
                          gameId={activeGame[GAME_PK]}
                          hardware={activeGame.hardware}
                          onSaved={(saved) => patchGame(activeGame[GAME_PK], { hardware: saved })}
                        />
                        <AdminGameTypeSelect
                          gameId={activeGame[GAME_PK]}
                          gameType={activeGame.spiel_typ}
                          onSaved={(saved) => patchAndRecheck(activeGame[GAME_PK], { spiel_typ: saved })}
                        />
                      </div>
                    </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="flex items-center gap-1">
                    <span className="mr-1 text-[10px] uppercase tracking-wider text-zinc-500">guide_typ</span>
                    {GUIDE_TYPS.map((typ) => (
                      <button
                        key={typ}
                        type="button"
                        onClick={() => handleGuideTyp(typ)}
                        disabled={busy === 'guide_typ'}
                        className={`rounded border px-2 py-1 font-mono text-xs font-bold transition ${
                          guideTyp(activeGame) === typ
                            ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66]'
                            : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        [{typ}]
                      </button>
                    ))}
                  </div>
                  <PlaytimeInput
                    key={`${activeGame[GAME_PK]}:story:${formatHours(activeGame.spielzeit_hauptstory)}`}
                    label="Story"
                    value={activeGame.spielzeit_hauptstory}
                    disabled={busy === 'playtime'}
                    onSave={(value) => handlePlaytime({ hauptstory: value })}
                  />
                  <PlaytimeInput
                    key={`${activeGame[GAME_PK]}:platin:${formatHours(activeGame.spielzeit_komplettierer)}`}
                    label="Platin"
                    value={activeGame.spielzeit_komplettierer}
                    disabled={busy === 'playtime'}
                    onSave={(value) => handlePlaytime({ komplett: value })}
                  />
                  <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                    <span>🏆 {activeGame.anzahl_trophaeen ?? achievements.length}</span>
                    <span title="Online">🌐 {totals.online}</span>
                    <span title="Verpassbar">⚠️ {totals.missable}</span>
                    <span title="Sammelobjekte">📦 {totals.collectible}</span>
                    <span title="Story">📖 {totals.story}</span>
                  </div>
                </div>

                {mode === 'servertot' ? (
                  <ServertotFields
                    key={`${activeGame[GAME_PK]}:${detailsLoaded ? 'full' : 'light'}`}
                    game={activeGame}
                    busy={busy}
                    onExplanation={(text) => handlePlaytime({ statusExplanation: text })}
                  />
                ) : null}
              </div>

              {/* Radar */}
              {activeGame.radar_profile ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                  <LocaleProvider>
                    <GameRadarCard profile={activeGame.radar_profile} isAdmin embedded />
                  </LocaleProvider>
                </div>
              ) : !detailsLoaded ? (
                <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-3 text-xs text-zinc-500">Lade Radar…</p>
              ) : (
                <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-3 text-xs text-zinc-500">
                  Kein radar_profile vorhanden – Freigabe ist trotzdem möglich (Regel 0), das Radar fehlt dann auf der Seite.
                </p>
              )}

              {/* Trophäen */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 p-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-zinc-300">
                    Trophäen {achievementsLoading ? '· lade…' : `· ${achievements.length}`}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    {achievements.some((trophy) => Boolean(pickGuideTip(trophy.guide_tip, PUBLISH_LANG))) ? (
                      <button
                        type="button"
                        onClick={handleClearAllGuideTips}
                        disabled={Boolean(busy) || achievementsLoading}
                        title={`Alle Guide-Tipps dieses Spiels in [${PUBLISH_LANG.toUpperCase()}] komplett löschen`}
                        className="rounded border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                      >
                        {busy === 'clear-tips'
                          ? '… löscht Tipps'
                          : `🗑️ Alle Guide-Tipps (${PUBLISH_LANG.toUpperCase()}) komplett löschen`}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleBulkOnline}
                      disabled={busy === 'bulk-online' || achievementsLoading || !achievements.length}
                      className="rounded border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
                    >
                      ⚡ Alle Online/Koop-Keywords automatisch markieren
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Trophäe</th>
                        <th className="px-3 py-2">Guide-Tipp (de)</th>
                        <th className="px-3 py-2">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {achievements.map((trophy) => {
                        const id = trophy[ACHIEVEMENT_PK];
                        const name = pickText(trophy.trophy_name);
                        return (
                          <tr key={id} className="border-t border-zinc-900 align-top">
                            <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">{id}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-start gap-2">
                                <TrophyArtwork
                                  trophy={{ ...trophy, trophy_name: name }}
                                  gameId={activeGame[GAME_PK]}
                                  size={36}
                                  className="flex-none"
                                />
                                <div className="min-w-0">
                                  <p className="flex items-center gap-1.5 font-bold text-zinc-100">
                                    <TrophyTypeIcon type={trophy.trophy_type} size={12} />
                                    <span className="truncate">{name || '—'}</span>
                                    {String(trophy.ist_versteckt ?? '').toLowerCase() === 'true' ? (
                                      <span className="text-[9px] uppercase text-zinc-500">versteckt</span>
                                    ) : null}
                                  </p>
                                  <p className="text-[11px] leading-snug text-zinc-400">{pickText(trophy.trophy_desc)}</p>
                                </div>
                              </div>
                            </td>
                            <td className="min-w-[14rem] px-3 py-2">
                              <GuideTipCell
                                trophy={trophy}
                                gameId={activeGame[GAME_PK]}
                                disabled={busy.startsWith('flag:') || busy === 'clear-tips'}
                                onSaved={(text) =>
                                  setAchievements((prev) =>
                                    prev.map((entry) =>
                                      entry[ACHIEVEMENT_PK] === id
                                        ? {
                                            ...entry,
                                            guide_tip: withGuideTipForLang(entry.guide_tip, PUBLISH_LANG, text),
                                          }
                                        : entry,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                {FLAG_TOGGLES.map((flag) => {
                                  const on = Boolean(trophy[flag.key]);
                                  return (
                                    <button
                                      key={flag.key}
                                      type="button"
                                      onClick={() => handleFlag(trophy, flag.key)}
                                      disabled={busy === `flag:${id}:${flag.key}`}
                                      aria-pressed={on}
                                      title={flag.label}
                                      className={`rounded border px-1.5 py-0.5 text-xs transition ${
                                        on ? flag.active : 'border-zinc-800 text-zinc-600 hover:text-zinc-300'
                                      }`}
                                    >
                                      {flag.icon}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!achievementsLoading && !achievements.length ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                            Keine Trophäen in game_achievements.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
            </section>
          </div>

          {/* Sticky Footer */}
          {activeGame ? (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
              <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
                <p className="min-w-0 truncate text-xs text-zinc-400">
                  <span className="font-bold text-zinc-200">{pickText(activeGame.spieltitel)}</span>
                  <span className="ml-2 font-mono text-zinc-500">{npwr}</span>
                  <GuideTypBadge value={activeGame.guide_typ} className="ml-2" />
                  {sessionUser?.email ? <span className="ml-2 text-zinc-600">· {sessionUser.email}</span> : null}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSkip}
                    disabled={Boolean(busy)}
                    className="rounded border border-zinc-800 px-3 py-2 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                  >
                    ⏭️ Überspringen
                  </button>
                  <button
                    type="button"
                    onClick={handleDraftsAndFollow}
                    disabled={Boolean(busy) || !onOpenInDrafts}
                    title="Spiel in die Entwürfe holen und dort öffnen (Video-Guide nachziehen)"
                    className="rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-fuchsia-200 hover:bg-fuchsia-500/20 disabled:opacity-50"
                  >
                    🚀 In Entwürfe & Follow
                  </button>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={Boolean(busy)}
                    className="rounded border border-[#00ff66]/50 bg-[#00ff66]/15 px-4 py-2 text-xs font-black uppercase tracking-wider text-[#00ff66] hover:bg-[#00ff66]/25 disabled:opacity-50"
                  >
                    {busy === 'publish' ? '… wird freigegeben' : config.publishLabel}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {/* Direkt-Edit Modal für das Cover (alle 3 Tabs) */}
      {editingCoverGame ? (
        <CoverEditModal
          game={editingCoverGame}
          onClose={() => setEditingCoverGame(null)}
          onSaved={handleCoverSaved}
        />
      ) : null}
    </div>
  );
}
