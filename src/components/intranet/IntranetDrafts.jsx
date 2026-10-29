import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../pages/supabaseClient';
import { TABLES, GAME_FK, GAME_PK, GAME_STRUCT, GAME_TYPE, parseGameTypes, resolveSheetTypes } from '../../lib/gameSchema';
import AdminGameTypeSelect from '../AdminGameTypeSelect';
import { getYouTubeEmbedUrl, parseTimecodeToSeconds, buildVideoUrlWithTimestamp } from '../../utils/videoUrl';
import {
  GUIDE_PUBLICATION,
  buildUnifiedGuidePublishPatch,
  guideStatusKey,
  parseStatusMap,
  removeGameFromWiedervorlage,
} from '../../lib/guidePublication';
import {
  setIntranetGameType,
  saveTrophyGuideTip,
  clearGameGuideTips,
  removeIntranetStatusKey,
} from '../../lib/intranetGameEdits';
import { intranetGameHref } from '../../lib/intranetQueries';
import { listPipelineStatusEntries } from '../../lib/gamePipelineStatus';
import { handleStaffGamePreviewClick } from '../../lib/adminAccess';
import { localeOptions } from '../../lib/uiStrings';

const EMPTY_GROUP_TOKEN = '__EMPTY_GROUP__';
const MAX_VISIBLE_QUEUE_GAMES = 10;

function deriveSheetTypesFromRow(row) {
  const types = [];
  if (getLocalizedItemName(row?.chronological_group).trim()) types.push(1);
  if (getLocalizedItemName(row?.category_group).trim()) types.push(2);
  if (getLocalizedItemName(row?.boss_group).trim()) types.push(3);
  if (types.length > 0) return types;
  const resolved = resolveSheetTypes(row?.sheet_type);
  return resolved.length > 0 ? resolved : [1];
}

function areGroupNamesSimilar(nameA, nameB) {
  const a = String(nameA ?? '').trim().toLowerCase();
  const b = String(nameB ?? '').trim().toLowerCase();
  if (!a || !b || a === b) return false;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a))) {
    return true;
  }
  if (Math.abs(a.length - b.length) > 2) return false;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j += 1) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i += 1) {
      const temp = dp[i];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[a.length] <= 2;
}

/**
 * 1. Text-Normalisierung für den Trophäen-Matcher:
 * - Kleinbuchstaben
 * - Entfernt führende Timestamps / Zahlen (z. B. "01 -", "#1", "12:34 -")
 * - Entfernt typische YouTube-Suffixe/Wörter (trophy, guide, achievement, bronze, silver, gold, collectible)
 * - Entfernt Satzzeichen und mehrfache Leerzeichen
 */
export function normalizeForMatch(str) {
  if (!str) return '';
  let s = String(str).toLowerCase().trim();

  // Führende Timestamps wie "01:23 - ", "1:02:03 " entfernen
  s = s.replace(/^(?:\d{1,2}:)+\d{2}\s*[-–—:|.]*\s*/g, '');
  // Führende Nummern/Aufzählungen wie "01 -", "#1", "1.", "(01)" entfernen
  s = s.replace(/^(?:#?\d+|[(\[]\d+[)\]])\s*(?:[-–—:|.]+\s*|\s+)/g, '');
  // Nachgelagerte Timestamps am Ende entfernen
  s = s.replace(/\s*[-–—:|.]*\s*(?:\d{1,2}:)+\d{2}$/g, '');

  // Typische YouTube-Suffixe / Stopwords als ganze Wörter entfernen
  s = s.replace(
    /\b(trophy|trophies|trophäe|trophäen|guide|achievement|achievements|bronze|silver|silber|gold|platinum|platin|collectible|collectibles|sammelobjekt|sammelobjekte|walkthrough|location|locations|fundort|fundorte)\b/gi,
    ' '
  );

  // Satzzeichen & Sonderzeichen durch Leerzeichen ersetzen (Buchstaben inkl. Umlaute & Ziffern behalten)
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');

  // Mehrfache Leerzeichen reduzieren
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Extrahiert die reine Zahl für staging_game_guides.trophy_id (integer)
 * z. B. 'trophy_12' -> 12, '05' -> 5
 */
export function extractNumericTrophyId(platform_achievement_id, fallbackIndex = 1) {
  const raw = String(platform_achievement_id ?? '').trim();
  const matches = raw.match(/\d+/g);
  if (matches && matches.length > 0) {
    const lastNum = Number.parseInt(matches[matches.length - 1], 10);
    if (Number.isFinite(lastNum)) return lastNum;
  }
  const fb = Number.parseInt(String(fallbackIndex ?? 1), 10);
  return Number.isFinite(fb) ? fb : 1;
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isWholeWordContained(haystackNorm, needleNorm) {
  if (!haystackNorm || !needleNorm || needleNorm.length < 5) return false;
  const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(needleNorm)}(?:$|\\s)`, 'i');
  return pattern.test(haystackNorm);
}

const STAGING_LOCAL_OVERRIDES_KEY = 'tb_intranet_staging_group_overrides_v1';

function loadStagingLocalOverrides() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STAGING_LOCAL_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStagingLocalOverrides(mapObj) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STAGING_LOCAL_OVERRIDES_KEY, JSON.stringify(mapObj));
  } catch {
    /* ignore quota errors */
  }
}

function getLocalizedTitle(spieltitel) {
  if (!spieltitel) return 'Unbenanntes Spiel';
  if (typeof spieltitel === 'string') return spieltitel;
  return spieltitel.de || spieltitel.en || Object.values(spieltitel)[0] || 'Unbenanntes Spiel';
}

function getLocalizedCover(coverUrl) {
  if (!coverUrl) return '';
  if (typeof coverUrl === 'string') return coverUrl;
  return coverUrl.de || coverUrl.en || Object.values(coverUrl)[0] || '';
}

function getLocalizedItemName(itemName) {
  if (!itemName) return '';
  if (typeof itemName === 'string') return itemName;
  return itemName.de || itemName.en || Object.values(itemName)[0] || '';
}

function getLocalizedTrophyName(trophyName) {
  if (!trophyName) return '';
  if (typeof trophyName === 'string') return trophyName;
  return trophyName.de || trophyName.en || Object.values(trophyName)[0] || '';
}

function getLocalizedTrophyDesc(trophyDesc, lang = 'de') {
  if (!trophyDesc) return '';
  if (typeof trophyDesc === 'string') return trophyDesc;
  if (typeof trophyDesc === 'object') {
    return trophyDesc[lang] || trophyDesc.de || trophyDesc.en || Object.values(trophyDesc)[0] || '';
  }
  return '';
}

function getLocalizedGuideTip(guideTip, lang = 'de') {
  if (!guideTip) return '';
  if (typeof guideTip === 'string') return guideTip;
  if (typeof guideTip === 'object') {
    return guideTip[lang] || guideTip.de || guideTip.en || Object.values(guideTip)[0] || '';
  }
  return '';
}

function TrophyTypeBadge({ type }) {
  const t = String(type ?? '').toLowerCase();
  let bg = 'bg-amber-700/30 text-amber-300 border-amber-600/40';
  let label = 'Bronze';
  if (t.includes('silver') || t.includes('silber')) {
    bg = 'bg-slate-400/30 text-slate-200 border-slate-400/40';
    label = 'Silber';
  } else if (t.includes('gold')) {
    bg = 'bg-yellow-500/30 text-yellow-300 border-yellow-500/40';
    label = 'Gold';
  } else if (t.includes('platin') || t.includes('platinum')) {
    bg = 'bg-cyan-400/30 text-cyan-200 border-cyan-400/40';
    label = 'Platin';
  }
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-mono font-bold border ${bg}`}>
      {label}
    </span>
  );
}

function AdminGameStatusDropdown({ game, onStatusUpdated }) {
  const [open, setOpen] = useState(false);
  const [removingKey, setRemovingKey] = useState('');
  const [error, setError] = useState('');
  const containerRef = useRef(null);

  const statusEntries = useMemo(() => listPipelineStatusEntries(game?.status), [game?.status]);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleDeleteStatusKey = async (statusKey, value) => {
    if (!game?.id || removingKey) return;
    if (!window.confirm(`Status „${statusKey}“ (${value}) wirklich löschen?`)) return;

    setRemovingKey(statusKey);
    setError('');

    const { status: updatedStatus, error: removeErr } = await removeIntranetStatusKey(
      supabase,
      game.id,
      statusKey
    );

    setRemovingKey('');

    if (removeErr) {
      setError(removeErr.message || `Status „${statusKey}“ konnte nicht gelöscht werden.`);
      return;
    }

    onStatusUpdated?.(updatedStatus);
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        disabled={!game?.id}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/90 px-2.5 py-1 text-[11px] font-mono font-medium text-zinc-200 transition hover:border-[#00ff66]/50 hover:bg-zinc-800 disabled:opacity-50"
      >
        {statusEntries.length === 0 ? (
          <span className="text-zinc-400">Kein Status gesetzt</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1 max-w-[260px] sm:max-w-[340px]">
            {statusEntries.slice(0, 3).map((entry) => (
              <span
                key={entry.key}
                className="inline-flex items-center rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-[#00ff66]/90 border border-zinc-700"
              >
                {entry.key}={entry.value}
              </span>
            ))}
            {statusEntries.length > 3 && (
              <span className="text-[10px] font-mono text-zinc-400">
                +{statusEntries.length - 3}
              </span>
            )}
          </div>
        )}
        <span aria-hidden className="text-zinc-500 text-[10px] ml-0.5">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1.5 w-64 rounded-xl border border-zinc-700 bg-[#16181a] p-2.5 shadow-2xl backdrop-blur-md">
          <div className="mb-1.5 px-1 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
            <span>Aktueller Spiel-Status</span>
            <span className="text-zinc-500 font-normal">{statusEntries.length} Keys</span>
          </div>

          {statusEntries.length === 0 ? (
            <p className="px-1.5 py-2 text-[11px] font-mono text-zinc-500">
              Keine Status-Einträge vorhanden.
            </p>
          ) : (
            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
              {statusEntries.map((entry) => {
                const isRemoving = removingKey === entry.key;
                return (
                  <div
                    key={entry.key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/90 bg-zinc-900/80 px-2 py-1.5 text-[11px] font-mono"
                  >
                    <div className="min-w-0 flex-1 truncate">
                      <span className="text-zinc-400">{entry.key}=</span>
                      <span className="text-[#00ff66] font-bold">{entry.value}</span>
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(removingKey)}
                      onClick={() => handleDeleteStatusKey(entry.key, entry.value)}
                      title={`Status "${entry.key}" löschen`}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40 transition"
                    >
                      {isRemoving ? '…' : '🗑️'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <p className="mt-1.5 px-1 text-[10px] font-mono text-red-400">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TrophyDraftItem({ trophy, activeRowId, trophyLang, onAssign, onSaveGuideTip }) {
  const trophyId = trophy.platform_achievement_id || trophy.id;
  const nameStr = getLocalizedTrophyName(trophy.trophy_name);
  const descStr = getLocalizedTrophyDesc(trophy.trophy_desc ?? trophy.trophy_description, trophyLang);
  const tipStr = getLocalizedGuideTip(trophy.guide_tip, trophyLang);

  const [isEditingTip, setIsEditingTip] = useState(false);
  const [tipDraft, setTipDraft] = useState(tipStr);
  const [savingTip, setSavingTip] = useState(false);

  useEffect(() => {
    setTipDraft(tipStr);
  }, [tipStr]);

  const handleCommit = async () => {
    if (tipDraft.trim() === tipStr.trim()) {
      setIsEditingTip(false);
      return;
    }
    setSavingTip(true);
    await onSaveGuideTip(trophyId, tipDraft);
    setSavingTip(false);
    setIsEditingTip(false);
  };

  const handleDeleteSingleTip = async () => {
    if (!tipStr || savingTip) return;
    if (!window.confirm(`Guide-Tipp für Trophäe "${nameStr || trophyId}" [${trophyLang.toUpperCase()}] wirklich löschen?`)) {
      return;
    }
    setSavingTip(true);
    setTipDraft('');
    await onSaveGuideTip(trophyId, '');
    setSavingTip(false);
    setIsEditingTip(false);
  };

  return (
    <div className="group flex flex-col gap-2 rounded-xl border border-zinc-800/80 bg-[#161718] p-2.5 hover:border-zinc-700 hover:bg-zinc-800/50 transition">
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {trophy.icon_url ? (
            <img
              src={trophy.icon_url}
              alt=""
              className="h-8 w-8 shrink-0 rounded bg-zinc-800 object-cover"
            />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded bg-zinc-800 flex items-center justify-center text-[10px]">
              🏆
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs font-bold text-white truncate leading-tight">{nameStr || trophyId}</p>
              <TrophyTypeBadge type={trophy.trophy_type} />
            </div>
            <p className="text-[9px] font-mono text-zinc-400 truncate mt-0.5">
              ID: <span className="text-zinc-300">{trophyId}</span>
            </p>
          </div>
        </div>

        {/* Quick Assign Button */}
        {activeRowId && (
          <button
            type="button"
            onClick={() => onAssign(trophyId)}
            title="Trophy ID der aktiven Zeile zuordnen"
            className="shrink-0 rounded bg-[#00ff66]/15 px-2 py-1 text-[10px] font-mono font-bold text-[#00ff66] hover:bg-[#00ff66]/30 border border-[#00ff66]/30"
          >
            + Assign
          </button>
        )}
      </div>

      {/* Trophy Description (trophy_desc) */}
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-2 text-[11px] font-sans">
        <span className="mb-0.5 block font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">
          Beschreibung:
        </span>
        {descStr ? (
          <p className="italic text-zinc-300 leading-relaxed">{descStr}</p>
        ) : (
          <p className="text-[10px] italic text-zinc-600">(Keine Beschreibung)</p>
        )}
      </div>

      {/* Guide Tip (guide_tip) */}
      <div className="rounded-lg border border-[#00ff66]/20 bg-[#00ff66]/5 p-2 text-[11px]">
        <div className="flex items-center justify-between mb-1 gap-2">
          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#00ff66]">
            💡 Guide-Tipp ({trophyLang.toUpperCase()}):
          </span>
          {!isEditingTip && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={savingTip}
                onClick={() => setIsEditingTip(true)}
                className="font-mono text-[9px] text-zinc-400 hover:text-[#00ff66] underline transition"
              >
                {tipStr ? '✏️ Bearbeiten' : '+ Tipp hinzufügen'}
              </button>
              {tipStr && (
                <button
                  type="button"
                  disabled={savingTip}
                  onClick={handleDeleteSingleTip}
                  title="Diesen Guide-Tipp löschen"
                  className="font-mono text-[9px] text-zinc-500 hover:text-red-400 transition"
                >
                  🗑️ Löschen
                </button>
              )}
            </div>
          )}
        </div>

        {isEditingTip ? (
          <div className="flex flex-col gap-1.5 mt-1">
            <textarea
              value={tipDraft}
              onChange={(e) => setTipDraft(e.target.value)}
              rows={2}
              placeholder="Guide-Tipp eingeben…"
              disabled={savingTip}
              className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-[#00ff66] focus:outline-none font-sans"
            />
            <div className="flex items-center justify-between gap-1.5">
              {tipStr ? (
                <button
                  type="button"
                  disabled={savingTip}
                  onClick={handleDeleteSingleTip}
                  className="rounded px-2 py-0.5 font-mono text-[10px] text-red-300 hover:bg-red-500/20 bg-red-500/10 border border-red-500/30"
                >
                  🗑️ Tipp löschen
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={savingTip}
                  onClick={() => {
                    setTipDraft(tipStr);
                    setIsEditingTip(false);
                  }}
                  className="rounded px-2 py-0.5 font-mono text-[10px] text-zinc-400 hover:text-white bg-zinc-800"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={savingTip}
                  onClick={handleCommit}
                  className="rounded px-2.5 py-0.5 font-mono text-[10px] font-bold text-black bg-[#00ff66] hover:bg-[#00ff66]/90 flex items-center gap-1"
                >
                  {savingTip ? 'Speichert…' : '✓ Speichern'}
                </button>
              </div>
            </div>
          </div>
        ) : tipStr ? (
          <p className="font-sans text-xs italic text-zinc-200 leading-relaxed whitespace-pre-wrap">
            {tipStr}
          </p>
        ) : (
          <p className="font-mono text-[10px] italic text-zinc-500">
            Kein Tipp hinterlegt.
          </p>
        )}
      </div>
    </div>
  );
}

export default function IntranetDrafts({ initialDataSource = 'staging', initialGameId = null }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Queue data
  const [stagingRows, setStagingRows] = useState([]);
  const [gamesMap, setGamesMap] = useState(new Map());
  const [filterQuery, setFilterQuery] = useState('');
  const [randomSeed, setRandomSeed] = useState(0);
  const randomWeightsRef = useRef(new Map());

  const getGameRandomWeight = useCallback((gameId) => {
    const key = String(gameId ?? '');
    if (!randomWeightsRef.current.has(key)) {
      randomWeightsRef.current.set(key, Math.random());
    }
    return randomWeightsRef.current.get(key);
  }, []);

  // Selection
  const [selectedGameId, setSelectedGameId] = useState(initialGameId);
  const [selectedCreatorName, setSelectedCreatorName] = useState(null);
  const [activeRowId, setActiveRowId] = useState(null);

  // Video Player state
  const [activeVideoUrl, setActiveVideoUrl] = useState('');
  const [activeTimestamp, setActiveTimestamp] = useState('');

  // Parallel Trophies
  const [gameTrophies, setGameTrophies] = useState([]);
  const [loadingTrophies, setLoadingTrophies] = useState(false);
  const [trophyLang, setTrophyLang] = useState('de');

  // Busy action state
  const [actionBusy, setActionBusy] = useState(false);

  // Approval Modal State
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveLocale, setApproveLocale] = useState('');
  const [selectedGameTypes, setSelectedGameTypes] = useState([]);

  // Sort state for Guide-Zeilen
  const [sortField, setSortField] = useState('guide_id');
  const [sortDirection, setSortDirection] = useState('asc');

  // Search & Replace state
  const [searchTargetField, setSearchTargetField] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);

  // Rohmaterial (verschobene große Spiele) & Multi-Tab Editor
  const [showRohmaterialView, setShowRohmaterialView] = useState(false);
  const [rohmaterialGames, setRohmaterialGames] = useState([]);
  const [rohmaterialRows, setRohmaterialRows] = useState([]);
  const [productiveRohRows, setProductiveRohRows] = useState([]);
  const [rohGamesMap, setRohGamesMap] = useState(new Map());
  const [loadingRohmaterial, setLoadingRohmaterial] = useState(false);
  /** 'staging' | 'rohmaterial' */
  const [activeDataSource, setActiveDataSource] = useState(initialDataSource);

  useEffect(() => {
    if (initialDataSource) setActiveDataSource(initialDataSource);
    if (initialGameId) setSelectedGameId(initialGameId);
  }, [initialDataSource, initialGameId]);

  // 1. Gruppen-Röntgenblick State (Category & Chrono Pills + Popover + Filter)
  const [showRoentgenblick, setShowRoentgenblick] = useState(true);
  /** 'az' | 'outliers' | 'count' */
  const [pillSortOrder, setPillSortOrder] = useState('az');
  /** { field: 'category_group' | 'chronological_group', value: string } | null */
  const [activePillPopover, setActivePillPopover] = useState(null);
  const [pillRenameText, setPillRenameText] = useState('');
  const [pillMergeSearch, setPillMergeSearch] = useState('');
  const pillPopoverRef = useRef(null);

  /** { field: 'category_group' | 'chronological_group', value: string } | null */
  const [activeGroupFilter, setActiveGroupFilter] = useState(null);
  /** 'all' | '1' | '2' | '3' */
  const [activeSheetFilter, setActiveSheetFilter] = useState('all');

  // 2. Multi-Select & Floating Batch-Bar State
  const [selectedRowIds, setSelectedRowIds] = useState(() => new Set());
  const [batchCustomField, setBatchCustomField] = useState(null); // 'chronological_group' | 'category_group' | null
  const [batchCustomValue, setBatchCustomValue] = useState('');

  // 3. Trophäen-Schnell-Picker & Auto-Matcher ("Just Do It") State
  const [showTrophyMatcher, setShowTrophyMatcher] = useState(false);
  /** 'open' | 'all' */
  const [matcherItemFilter, setMatcherItemFilter] = useState('open');
  const [matcherHideAssignedTrophies, setMatcherHideAssignedTrophies] = useState(true);
  const [matcherTrophySearch, setMatcherTrophySearch] = useState('');
  const [matcherActiveGroupKey, setMatcherActiveGroupKey] = useState(null);
  const [matcherExpandedGroupKeys, setMatcherExpandedGroupKeys] = useState(() => new Set());
  const [autoMatchedBannerCount, setAutoMatchedBannerCount] = useState(0);
  const autoMatchedKeysRef = useRef(new Set());

  // Close pill popover on outside click
  useEffect(() => {
    if (!activePillPopover) return undefined;
    const handleOutside = (event) => {
      if (pillPopoverRef.current && !pillPopoverRef.current.contains(event.target)) {
        setActivePillPopover(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [activePillPopover]);

  // Load Rohmaterial games (status->>rohmaterial = PENDING_MULTI_TAB or in game_guides_rohmaterial)
  const fetchRohmaterialSummary = useCallback(async () => {
    setLoadingRohmaterial(true);
    try {
      let rohRows = [];
      let rFrom = 0;
      const PAGE_SIZE = 1000;

      while (true) {
        const { data: chunk, error: rErr } = await supabase
          .from(TABLES.guidesRohmaterial)
          .select('*')
          .order('id', { ascending: true })
          .range(rFrom, rFrom + PAGE_SIZE - 1);

        if (rErr) {
          console.warn('Fehler beim Laden von game_guides_rohmaterial:', rErr.message);
          break;
        }
        const list = (chunk ?? []).map((r) => ({
          ...r,
          _sourceTable: TABLES.guidesRohmaterial,
        }));
        rohRows = rohRows.concat(list);
        if (list.length < PAGE_SIZE) break;
        rFrom += PAGE_SIZE;
      }

      setRohmaterialRows(rohRows);

      const { data: pendingGames } = await supabase
        .from(TABLES.games)
        .select('id, platform_game_id, slug, status, spieltitel, cover_url, publisher, entwickler, spiel_typ, anzahl_trophaeen')
        .eq('status->>rohmaterial', 'PENDING_MULTI_TAB');

      const gameIdsFromRoh = [...new Set(rohRows.map((r) => r.game_id).filter(Boolean))];
      const existingMap = new Map((pendingGames ?? []).map((g) => [g.id, g]));
      const missingIds = gameIdsFromRoh.filter((id) => !existingMap.has(id));

      if (missingIds.length > 0) {
        for (let i = 0; i < missingIds.length; i += 100) {
          const slice = missingIds.slice(i, i + 100);
          const { data: extraGames } = await supabase
            .from(TABLES.games)
            .select('id, platform_game_id, slug, status, spieltitel, cover_url, publisher, entwickler, spiel_typ, anzahl_trophaeen')
            .in('id', slice);
          for (const g of extraGames ?? []) {
            existingMap.set(g.id, g);
          }
        }
      }

      setRohGamesMap(existingMap);

      const groupedByGame = new Map();
      for (const g of existingMap.values()) {
        groupedByGame.set(g.id, {
          gameId: g.id,
          game: g,
          title: getLocalizedTitle(g.spieltitel),
          platformGameId: g.platform_game_id || (Array.isArray(g.platform_game_id) ? g.platform_game_id[0] : '—'),
          coverUrl: getLocalizedCover(g.cover_url),
          creators: new Set(),
          batches: new Set(),
          rowCount: 0,
          statusRohmaterial: g.status?.rohmaterial || null,
        });
      }

      for (const r of rohRows) {
        const key = r.game_id || r.platform_game_id || r.batch_key;
        if (!key) continue;
        let entry = groupedByGame.get(key);
        if (!entry) {
          entry = {
            gameId: key,
            game: { id: key, platform_game_id: r.platform_game_id, spieltitel: r.platform_game_id || r.batch_key },
            title: r.platform_game_id || r.batch_key || 'Unbekanntes Spiel',
            platformGameId: r.platform_game_id || '—',
            coverUrl: '',
            creators: new Set(),
            batches: new Set(),
            rowCount: 0,
            statusRohmaterial: 'ROHMATERIAL',
          };
          groupedByGame.set(key, entry);
        }
        if (r.creator_name) entry.creators.add(r.creator_name);
        if (r.batch_key) entry.batches.add(r.batch_key);
        entry.rowCount += 1;
      }

      const summaryList = [...groupedByGame.values()].map((item) => ({
        ...item,
        creatorCount: Math.max(item.creators.size, 1),
        creatorList: [...item.creators],
        batchList: [...item.batches],
      }));
      summaryList.sort((a, b) => getGameRandomWeight(a.gameId) - getGameRandomWeight(b.gameId));
      setRohmaterialGames(summaryList);
    } catch (err) {
      console.warn('Rohmaterial-Übersicht konnte nicht geladen werden:', err);
    } finally {
      setLoadingRohmaterial(false);
    }
  }, [getGameRandomWeight]);

  // Load staging queue (with 1000-row chunk loop to bypass PostgREST max_rows limit)
  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let allRows = [];
      let from = 0;
      const PAGE_SIZE = 1000;

      while (true) {
        const { data: rows, error: readError } = await supabase
          .from('staging_game_guides')
          .select('*')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (readError) {
          setError(`Fehler beim Laden von staging_game_guides: ${readError.message}`);
          setStagingRows([]);
          setLoading(false);
          return;
        }

        const chunk = rows ?? [];
        allRows = allRows.concat(chunk);
        if (chunk.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      const localOverrides = loadStagingLocalOverrides();
      const mergedStaging = allRows.map((r) => {
        const ov = localOverrides[r.id];
        return {
          ...r,
          ...(ov || {}),
          _sourceTable: 'staging_game_guides',
        };
      });

      setStagingRows(mergedStaging);

      // Extract unique game_ids & sort by random weight so the first 10 games load first
      const gameIds = [...new Set(mergedStaging.map((r) => r.game_id).filter(Boolean))];
      gameIds.sort((a, b) => getGameRandomWeight(a) - getGameRandomWeight(b));

      if (gameIds.length > 0) {
        const initialIds = gameIds.slice(0, MAX_VISIBLE_QUEUE_GAMES);
        const { data: initialGames, error: initialErr } = await supabase
          .from(TABLES.games)
          .select('id, platform_game_id, slug, status, spieltitel, cover_url, publisher, entwickler, spiel_typ, anzahl_trophaeen')
          .in('id', initialIds);

        if (initialErr) {
          console.error('Fehler beim Laden der Spiele-Details:', initialErr.message);
        }

        const initialMap = new Map((initialGames ?? []).map((g) => [g.id, g]));
        setGamesMap(initialMap);
        setLoading(false);

        const remainingIds = gameIds.slice(MAX_VISIBLE_QUEUE_GAMES);
        if (remainingIds.length > 0) {
          const CHUNK_SIZE = 100;
          const chunks = [];
          for (let i = 0; i < remainingIds.length; i += CHUNK_SIZE) {
            chunks.push(remainingIds.slice(i, i + CHUNK_SIZE));
          }
          const results = await Promise.all(
            chunks.map((chunkIds) =>
              supabase
                .from(TABLES.games)
                .select('id, platform_game_id, slug, status, spieltitel, cover_url, publisher, entwickler, spiel_typ, anzahl_trophaeen')
                .in('id', chunkIds)
            )
          );
          setGamesMap((prev) => {
            const next = new Map(prev);
            for (const res of results) {
              for (const g of res.data ?? []) {
                next.set(g.id, g);
              }
            }
            return next;
          });
        }
      } else {
        setGamesMap(new Map());
      }
    } catch (err) {
      setError(err.message || 'Unerwarteter Fehler beim Laden der Queue.');
    } finally {
      setLoading(false);
    }
  }, [getGameRandomWeight]);

  useEffect(() => {
    fetchQueue();
    fetchRohmaterialSummary();
  }, [fetchQueue, fetchRohmaterialSummary]);

  // Load productive game_guides rows when a Rohmaterial game has PENDING_MULTI_TAB in game_guides
  useEffect(() => {
    if (activeDataSource !== 'rohmaterial' || !selectedGameId) {
      setProductiveRohRows([]);
      return undefined;
    }

    let cancelled = false;
    async function loadProductiveForRohmaterial() {
      let rows = [];
      let from = 0;
      const PAGE_SIZE = 1000;

      while (true) {
        const { data, error: gErr } = await supabase
          .from(TABLES.guides)
          .select('*')
          .eq('game_id', selectedGameId)
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (gErr || cancelled) break;
        const chunk = (data ?? []).map((r) => ({
          ...r,
          creator_name: r.creator_name || 'Produktiver Guide (game_guides)',
          _sourceTable: TABLES.guides,
        }));
        rows = rows.concat(chunk);
        if (chunk.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      if (!cancelled) {
        setProductiveRohRows(rows);
      }
    }

    loadProductiveForRohmaterial();
    return () => {
      cancelled = true;
    };
  }, [activeDataSource, selectedGameId]);

  // Group staging rows by game_id
  const gameGroups = useMemo(() => {
    const groups = new Map();
    for (const row of stagingRows) {
      if (!row.game_id) continue;
      const list = groups.get(row.game_id) || [];
      list.push(row);
      groups.set(row.game_id, list);
    }
    return groups;
  }, [stagingRows]);

  // Group Rohmaterial & Multi-Tab rows by game_id / key
  const rohGameGroups = useMemo(() => {
    const groups = new Map();
    for (const row of rohmaterialRows) {
      const key = row.game_id || row.platform_game_id || row.batch_key;
      if (!key) continue;
      const list = groups.get(key) || [];
      list.push(row);
      groups.set(key, list);
    }
    if (selectedGameId && productiveRohRows.length > 0) {
      const existing = groups.get(selectedGameId) || [];
      groups.set(selectedGameId, [...existing, ...productiveRohRows]);
    }
    return groups;
  }, [rohmaterialRows, productiveRohRows, selectedGameId]);

  // List of games in staging queue (random order instead of alphabetical)
  const queueGamesList = useMemo(() => {
    const list = [];
    for (const [gameId, rows] of gameGroups.entries()) {
      const game = gamesMap.get(gameId) || { id: gameId };
      const title = getLocalizedTitle(game.spieltitel);
      const creators = new Set(rows.map((r) => r.creator_name || 'Unbekannt'));

      list.push({
        gameId,
        game,
        title,
        platformGameId: game.platform_game_id || (Array.isArray(game.platform_game_id) ? game.platform_game_id[0] : '—'),
        creatorCount: creators.size,
        rowCount: rows.length,
        coverUrl: getLocalizedCover(game.cover_url),
        source: 'staging',
      });
    }

    list.sort((a, b) => getGameRandomWeight(a.gameId) - getGameRandomWeight(b.gameId));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameGroups, gamesMap, getGameRandomWeight, randomSeed]);

  // Active sidebar list depending on activeDataSource ('staging' vs 'rohmaterial')
  const activeSidebarGamesList = useMemo(() => {
    if (activeDataSource === 'rohmaterial') {
      const list = rohmaterialGames.map((item) => {
        const dynamicCount = rohGameGroups.get(item.gameId)?.length ?? item.rowCount;
        return {
          ...item,
          rowCount: dynamicCount,
          source: 'rohmaterial',
        };
      });
      list.sort((a, b) => getGameRandomWeight(a.gameId) - getGameRandomWeight(b.gameId));
      return list;
    }
    return queueGamesList;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDataSource, rohmaterialGames, rohGameGroups, queueGamesList, getGameRandomWeight, randomSeed]);

  // Filtered Queue List (all matching games)
  const filteredQueueList = useMemo(() => {
    if (!filterQuery.trim()) return activeSidebarGamesList;
    const q = filterQuery.toLowerCase().trim();
    return activeSidebarGamesList.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        String(item.platformGameId).toLowerCase().includes(q)
    );
  }, [activeSidebarGamesList, filterQuery]);

  // Visible Queue List: Load max 10 games into the sidebar list; remaining games automatically slide in
  const visibleQueueList = useMemo(() => {
    const top = filteredQueueList.slice(0, MAX_VISIBLE_QUEUE_GAMES);
    if (selectedGameId && !top.some((item) => item.gameId === selectedGameId)) {
      const selectedItem = filteredQueueList.find((item) => item.gameId === selectedGameId);
      if (selectedItem) {
        return [selectedItem, ...top.slice(0, MAX_VISIBLE_QUEUE_GAMES - 1)];
      }
    }
    return top;
  }, [filteredQueueList, selectedGameId]);

  // Randomize queue order & select new top game
  const handleRandomizeQueue = useCallback(() => {
    randomWeightsRef.current.clear();
    const currentIds =
      activeDataSource === 'rohmaterial'
        ? rohmaterialGames.map((g) => g.gameId)
        : Array.from(gameGroups.keys());

    for (const id of currentIds) {
      if (id) {
        randomWeightsRef.current.set(String(id), Math.random());
      }
    }
    setRandomSeed((prev) => prev + 1);

    if (currentIds.length > 0) {
      const sortedIds = [...currentIds].sort(
        (a, b) =>
          (randomWeightsRef.current.get(String(a)) ?? 0) -
          (randomWeightsRef.current.get(String(b)) ?? 0)
      );
      setSelectedGameId(sortedIds[0]);
    }
  }, [activeDataSource, rohmaterialGames, gameGroups]);

  // Set default selection when queue loads or changes
  useEffect(() => {
    if (activeDataSource === 'staging') {
      if (queueGamesList.length > 0) {
        if (!selectedGameId || !gameGroups.has(selectedGameId)) {
          setSelectedGameId(queueGamesList[0].gameId);
        }
      } else if (rohmaterialGames.length > 0) {
        setActiveDataSource('rohmaterial');
        setSelectedGameId(rohmaterialGames[0].gameId);
      } else {
        setSelectedGameId(null);
        setSelectedCreatorName(null);
      }
    } else if (rohmaterialGames.length > 0) {
      const existsInRoh = rohmaterialGames.some((g) => g.gameId === selectedGameId);
      if (!selectedGameId || !existsInRoh) {
        setSelectedGameId(rohmaterialGames[0].gameId);
      }
    } else if (queueGamesList.length > 0) {
      setActiveDataSource('staging');
      setSelectedGameId(queueGamesList[0].gameId);
    } else {
      setSelectedGameId(null);
      setSelectedCreatorName(null);
    }
  }, [activeDataSource, queueGamesList, rohmaterialGames, selectedGameId, gameGroups]);

  // Reset filters & selection when game or creator changes
  useEffect(() => {
    setSelectedRowIds(new Set());
    setActiveGroupFilter(null);
    setActiveSheetFilter('all');
    setActivePillPopover(null);
    setBatchCustomField(null);
    setBatchCustomValue('');
    setMatcherActiveGroupKey(null);
    setMatcherExpandedGroupKeys(new Set());
    setMatcherTrophySearch('');
    setAutoMatchedBannerCount(0);
  }, [selectedGameId, selectedCreatorName, activeDataSource]);

  // Current game's rows
  const currentGameRows = useMemo(() => {
    if (!selectedGameId) return [];
    if (activeDataSource === 'rohmaterial') {
      return rohGameGroups.get(selectedGameId) || [];
    }
    return gameGroups.get(selectedGameId) || [];
  }, [selectedGameId, activeDataSource, rohGameGroups, gameGroups]);

  // Group current game rows by creator_name (or batch_key)
  const creatorGroups = useMemo(() => {
    const map = new Map();
    for (const row of currentGameRows) {
      const creator =
        row.creator_name ||
        (row.batch_key ? `Batch: ${row.batch_key}` : 'Unbekannter Creator');
      const list = map.get(creator) || [];
      list.push(row);
      map.set(creator, list);
    }
    return map;
  }, [currentGameRows]);

  // Creator Tabs info
  const creatorTabs = useMemo(() => {
    const tabs = [];
    for (const [creatorName, rows] of creatorGroups.entries()) {
      const videos = new Set(
        rows.map((r) => {
          const rawUrl = r.video_url || r.video_chapter || r.id;
          return String(rawUrl).split('&t=')[0].split('?t=')[0];
        })
      );
      tabs.push({
        creatorName,
        videoCount: videos.size,
        rowCount: rows.length,
        rows,
      });
    }
    return tabs;
  }, [creatorGroups]);

  // Keep creator selection valid
  useEffect(() => {
    if (creatorTabs.length > 0) {
      if (!selectedCreatorName || !creatorGroups.has(selectedCreatorName)) {
        setSelectedCreatorName(creatorTabs[0].creatorName);
      }
    } else {
      setSelectedCreatorName(null);
    }
  }, [creatorTabs, selectedCreatorName, creatorGroups]);

  // Toggle sort field / direction
  const handleToggleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Current creator's rows sorted by sortField and sortDirection
  const currentCreatorRows = useMemo(() => {
    if (!selectedCreatorName) return [];
    const rows = creatorGroups.get(selectedCreatorName) || [];
    const dir = sortDirection === 'desc' ? -1 : 1;

    return [...rows].sort((a, b) => {
      let cmp = 0;

      if (sortField === 'guide_id') {
        const numA = Number.parseInt(String(a.guide_id ?? '').replace(/\D/g, ''), 10);
        const numB = Number.parseInt(String(b.guide_id ?? '').replace(/\D/g, ''), 10);
        const valA = Number.isNaN(numA) ? Number.MAX_SAFE_INTEGER : numA;
        const valB = Number.isNaN(numB) ? Number.MAX_SAFE_INTEGER : numB;
        cmp = valA - valB;
      } else if (sortField === 'timestamp') {
        const secA = parseTimecodeToSeconds(a.timestamp);
        const secB = parseTimecodeToSeconds(b.timestamp);
        const valA = secA == null ? Number.MAX_SAFE_INTEGER : secA;
        const valB = secB == null ? Number.MAX_SAFE_INTEGER : secB;
        cmp = valA - valB;
      } else if (sortField === 'item_name') {
        const strA = getLocalizedItemName(a.item_name);
        const strB = getLocalizedItemName(b.item_name);
        cmp = strA.localeCompare(strB, 'de', { numeric: true });
      } else if (sortField === 'chronological_group') {
        const strA = getLocalizedItemName(a.chronological_group);
        const strB = getLocalizedItemName(b.chronological_group);
        cmp = strA.localeCompare(strB, 'de', { numeric: true });
      } else if (sortField === 'category_group') {
        const strA = getLocalizedItemName(a.category_group);
        const strB = getLocalizedItemName(b.category_group);
        cmp = strA.localeCompare(strB, 'de', { numeric: true });
      } else if (sortField === 'boss_group') {
        const strA = getLocalizedItemName(a.boss_group);
        const strB = getLocalizedItemName(b.boss_group);
        cmp = strA.localeCompare(strB, 'de', { numeric: true });
      } else if (sortField === 'video_chapter') {
        const strA = getLocalizedItemName(a.video_chapter);
        const strB = getLocalizedItemName(b.video_chapter);
        cmp = strA.localeCompare(strB, 'de', { numeric: true });
      } else if (sortField === 'trophy_id') {
        const numA = Number.parseInt(String(a.trophy_id ?? '').replace(/\D/g, ''), 10);
        const numB = Number.parseInt(String(b.trophy_id ?? '').replace(/\D/g, ''), 10);
        const valA = Number.isNaN(numA) ? Number.MAX_SAFE_INTEGER : numA;
        const valB = Number.isNaN(numB) ? Number.MAX_SAFE_INTEGER : numB;
        cmp = valA - valB;
      }

      if (cmp !== 0) return cmp * dir;
      const fallbackA = Number.parseInt(String(a.guide_id ?? '').replace(/\D/g, ''), 10) || 0;
      const fallbackB = Number.parseInt(String(b.guide_id ?? '').replace(/\D/g, ''), 10) || 0;
      return fallbackA - fallbackB;
    });
  }, [selectedCreatorName, creatorGroups, sortField, sortDirection]);

  // 1. GRUPPEN-RÖNTGENBLICK: Berechne vorkommende Werte von category_group, chronological_group und boss_group inkl. Anzahl
  const groupStats = useMemo(() => {
    const buildFieldStats = (field) => {
      const counts = new Map();
      const sheetSets = new Map();

      for (const row of currentCreatorRows) {
        const str = getLocalizedItemName(row[field]).trim();
        const key = str || EMPTY_GROUP_TOKEN;
        counts.set(key, (counts.get(key) || 0) + 1);

        const sKey = deriveSheetTypesFromRow(row).join(',');
        if (!sheetSets.has(key)) sheetSets.set(key, new Set());
        sheetSets.get(key).add(sKey);
      }

      const items = [];
      for (const [key, count] of counts.entries()) {
        const isEmpty = key === EMPTY_GROUP_TOKEN;
        const isOutlier = !isEmpty && (count === 1 || count === 2);
        items.push({
          key,
          label: isEmpty ? '(Ohne Gruppe)' : key,
          rawValue: isEmpty ? '' : key,
          count,
          isEmpty,
          isOutlier,
          sheets: [...(sheetSets.get(key) || [])],
        });
      }

      items.sort((a, b) => {
        if (a.isEmpty !== b.isEmpty) return a.isEmpty ? 1 : -1;
        if (pillSortOrder === 'outliers') {
          if (a.isOutlier !== b.isOutlier) return a.isOutlier ? -1 : 1;
          if (a.isOutlier && b.isOutlier && a.count !== b.count) return a.count - b.count;
        } else if (pillSortOrder === 'count') {
          if (a.count !== b.count) return b.count - a.count;
        }
        return a.label.localeCompare(b.label, 'de', { numeric: true });
      });

      return items;
    };

    const categoryPills = buildFieldStats('category_group');
    const chronoPills = buildFieldStats('chronological_group');
    const bossPills = buildFieldStats('boss_group');
    const outlierCount =
      categoryPills.filter((p) => p.isOutlier).length +
      chronoPills.filter((p) => p.isOutlier).length +
      bossPills.filter((p) => p.isOutlier).length;

    return {
      categoryPills,
      chronoPills,
      bossPills,
      outlierCount,
    };
  }, [currentCreatorRows, pillSortOrder]);

  // Sichtbare Zeilen in der Tabelle (nach Gruppen-Filter & Sheet-Filter)
  const visibleCreatorRows = useMemo(() => {
    return currentCreatorRows.filter((row) => {
      if (activeGroupFilter) {
        const val = getLocalizedItemName(row[activeGroupFilter.field]).trim();
        const key = val || EMPTY_GROUP_TOKEN;
        if (key !== activeGroupFilter.value) return false;
      }
      if (activeSheetFilter !== 'all') {
        const targetNum = Number.parseInt(activeSheetFilter, 10);
        const types = deriveSheetTypesFromRow(row);
        if (!types.includes(targetNum)) return false;
      }
      return true;
    });
  }, [currentCreatorRows, activeGroupFilter, activeSheetFilter]);

  // Set initial video player URL when game or creator changes
  useEffect(() => {
    const rawRows = selectedCreatorName ? creatorGroups.get(selectedCreatorName) || [] : [];
    if (rawRows.length > 0) {
      const sortedById = [...rawRows].sort((a, b) => {
        const numA = Number.parseInt(String(a.guide_id ?? '').replace(/\D/g, ''), 10) || 0;
        const numB = Number.parseInt(String(b.guide_id ?? '').replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      });
      const firstWithVideo = sortedById.find((r) => r.video_url) || sortedById[0];
      if (firstWithVideo) {
        setActiveVideoUrl(firstWithVideo.video_url || '');
        setActiveTimestamp(firstWithVideo.timestamp || '');
      }
    } else {
      setActiveVideoUrl('');
      setActiveTimestamp('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGameId, selectedCreatorName, activeDataSource]);

  // Selected game details
  const selectedGame = useMemo(() => {
    if (!selectedGameId) return null;
    return (
      gamesMap.get(selectedGameId) ||
      rohGamesMap.get(selectedGameId) ||
      rohmaterialGames.find((g) => g.gameId === selectedGameId)?.game ||
      null
    );
  }, [selectedGameId, gamesMap, rohGamesMap, rohmaterialGames]);

  // Load trophies for selected game
  useEffect(() => {
    if (!selectedGameId) {
      setGameTrophies([]);
      return;
    }

    let cancelled = false;
    async function loadTrophies() {
      setLoadingTrophies(true);
      const { data, error: trophyErr } = await supabase
        .from(TABLES.achievements)
        .select('*')
        .eq(GAME_FK, selectedGameId)
        .order('platform_achievement_id', { ascending: true });

      if (cancelled) return;
      setLoadingTrophies(false);

      if (trophyErr) {
        console.error('Fehler beim Laden der Trophäen:', trophyErr.message);
        setGameTrophies([]);
        return;
      }
      setGameTrophies(data ?? []);
    }

    loadTrophies();
    return () => {
      cancelled = true;
    };
  }, [selectedGameId]);

  // Jump to next game in queue
  const jumpToNextGame = useCallback(
    (currentId) => {
      const remainingFiltered = filteredQueueList.filter((item) => item.gameId !== currentId);
      if (remainingFiltered.length > 0) {
        setSelectedGameId(remainingFiltered[0].gameId);
      } else {
        const remainingAll = activeSidebarGamesList.filter((item) => item.gameId !== currentId);
        if (remainingAll.length > 0) {
          setSelectedGameId(remainingAll[0].gameId);
        } else {
          setSelectedGameId(null);
          setSelectedCreatorName(null);
        }
      }
    },
    [filteredQueueList, activeSidebarGamesList]
  );

  // Jump to next creator or next game
  const jumpToNextCreatorOrGame = useCallback(
    (currentId, currentCreator) => {
      const remainingCreators = creatorTabs.filter((t) => t.creatorName !== currentCreator);
      if (remainingCreators.length > 0) {
        setSelectedCreatorName(remainingCreators[0].creatorName);
      } else {
        jumpToNextGame(currentId);
      }
    },
    [creatorTabs, jumpToNextGame]
  );

  // --- HELPER: Format field value for target table (staging_game_guides vs game_guides_rohmaterial vs game_guides) ---
  const formatFieldValueForTable = useCallback((existingRow, field, rawValue) => {
    const sourceTable = existingRow?._sourceTable || 'staging_game_guides';
    const isJsonbTable = sourceTable === TABLES.guidesRohmaterial || sourceTable === TABLES.guides;

    if (field === 'guide_id' || field === 'trophy_id') {
      const digits = String(rawValue ?? '').replace(/\D/g, '');
      if (!digits) return null;
      return isJsonbTable ? String(Number.parseInt(digits, 10)) : Number.parseInt(digits, 10);
    }

    if (
      field === 'chronological_group' ||
      field === 'category_group' ||
      field === 'boss_group' ||
      field === 'item_name' ||
      field === 'video_chapter'
    ) {
      const str = String(rawValue ?? '').trim();
      if (!isJsonbTable) {
        return str || null;
      }
      if (!str) return null;
      const currentVal = existingRow?.[field];
      if (typeof currentVal === 'object' && currentVal !== null && !Array.isArray(currentVal)) {
        const nextObj = { ...currentVal };
        const keys = Object.keys(nextObj);
        if (keys.length > 0) {
          for (const k of keys) {
            nextObj[k] = str;
          }
          return nextObj;
        }
      }
      return { de: str, en: str };
    }

    return rawValue;
  }, []);

  // --- HELPER: Update rows in React state across all sources + local overrides for staging ---
  const applyRowsPatchInState = useCallback((patchesByRowId) => {
    if (!patchesByRowId || patchesByRowId.size === 0) return;

    const localOverrides = loadStagingLocalOverrides();
    let localModified = false;

    const mapRows = (prev) =>
      prev.map((row) => {
        if (!patchesByRowId.has(row.id)) return row;
        const patch = patchesByRowId.get(row.id);
        const sourceTable = row._sourceTable || 'staging_game_guides';
        if (
          sourceTable === 'staging_game_guides' &&
          (patch.category_group !== undefined || patch.boss_group !== undefined)
        ) {
          localOverrides[row.id] = {
            ...(localOverrides[row.id] || {}),
            ...(patch.category_group !== undefined ? { category_group: patch.category_group } : {}),
            ...(patch.boss_group !== undefined ? { boss_group: patch.boss_group } : {}),
          };
          localModified = true;
        }
        return { ...row, ...patch };
      });

    setStagingRows(mapRows);
    setRohmaterialRows(mapRows);
    setProductiveRohRows(mapRows);

    if (localModified) {
      saveStagingLocalOverrides(localOverrides);
    }
  }, []);

  // --- HELPER: Persist batch updates to Supabase (staging_game_guides, game_guides_rohmaterial, game_guides) ---
  const persistRowPatchesToSupabase = useCallback(async (targetRows, buildPatchForRow) => {
    const patchesByRowId = new Map();
    /** Map<tableName, Map<serializedPayload, { payload, ids }>> */
    const groupedDbCalls = new Map();

    for (const row of targetRows) {
      const statePatch = buildPatchForRow(row);
      if (!statePatch || Object.keys(statePatch).length === 0) continue;
      patchesByRowId.set(row.id, statePatch);

      const sourceTable = row._sourceTable || 'staging_game_guides';
      const dbPayload = { ...statePatch };
      if (sourceTable === TABLES.guides) {
        dbPayload.edit_unlocked = true;
      }

      const payloadKey = JSON.stringify(dbPayload);
      if (!groupedDbCalls.has(sourceTable)) {
        groupedDbCalls.set(sourceTable, new Map());
      }
      const tableGroup = groupedDbCalls.get(sourceTable);
      if (!tableGroup.has(payloadKey)) {
        tableGroup.set(payloadKey, { payload: dbPayload, ids: [] });
      }
      tableGroup.get(payloadKey).ids.push(row.id);
    }

    // 1. Optimistic State Update immediately
    applyRowsPatchInState(patchesByRowId);

    // 2. Execute DB updates grouped by table & payload
    for (const [tableName, tableGroup] of groupedDbCalls.entries()) {
      for (const { payload, ids } of tableGroup.values()) {
        const CHUNK_SIZE = 100;
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
          const chunkIds = ids.slice(i, i + CHUNK_SIZE);
          const { error: upErr } = await supabase
            .from(tableName)
            .update(payload)
            .in('id', chunkIds);

          if (upErr) {
            const msg = String(upErr.message || '');
            const isMissingStagingCol =
              tableName === 'staging_game_guides' &&
              (msg.includes('category_group') ||
                msg.includes('boss_group') ||
                msg.includes('column') ||
                msg.includes('schema cache'));

            if (isMissingStagingCol) {
              console.warn(
                `Hinweis: Spalte auf ${tableName} nicht in DB vorhanden, Wert bleibt im Browser-State gespeichert:`,
                msg
              );
            } else {
              throw new Error(`DB-Update auf ${tableName} fehlgeschlagen: ${msg}`);
            }
          }
        }
      }
    }

    return patchesByRowId.size;
  }, [applyRowsPatchInState]);

  // --- GRUPPEN-KONSOLIDIERUNG & BATCH ACTIONS ---

  // 1a) Gruppe umbenennen / zusammenführen mit Zielname
  const handleRenameOrMergeGroup = async (field, oldGroupKey, newGroupNameRaw) => {
    if (!field || actionBusy) return;
    const targetName = String(newGroupNameRaw ?? '').trim();
    const affectedRows = currentCreatorRows.filter((row) => {
      const val = getLocalizedItemName(row[field]).trim();
      const key = val || EMPTY_GROUP_TOKEN;
      return key === oldGroupKey;
    });

    if (affectedRows.length === 0) {
      setActivePillPopover(null);
      return;
    }

    setActionBusy(true);
    setError('');
    setNotice('');

    try {
      const updatedCount = await persistRowPatchesToSupabase(affectedRows, (row) => ({
        [field]: formatFieldValueForTable(row, field, targetName),
      }));

      // Falls Filter auf der alten Gruppe aktiv war, auf den neuen Namen mitziehen
      if (activeGroupFilter?.field === field && activeGroupFilter?.value === oldGroupKey) {
        setActiveGroupFilter({
          field,
          value: targetName || EMPTY_GROUP_TOKEN,
        });
      }

      setActivePillPopover(null);
      setPillRenameText('');
      setPillMergeSearch('');

      const oldLabel = oldGroupKey === EMPTY_GROUP_TOKEN ? '(Ohne Gruppe)' : `"${oldGroupKey}"`;
      const newLabel = targetName ? `"${targetName}"` : '(Ohne Gruppe)';
      const fieldLabel =
        field === 'category_group'
          ? 'Category-Gruppe'
          : field === 'boss_group'
            ? 'Boss-Gruppe'
            : 'Chrono-Gruppe';
      setNotice(
        `✓ ${fieldLabel} ${oldLabel} (${updatedCount} Zeilen) → ${newLabel} aktualisiert.`
      );
    } catch (err) {
      setError(`Fehler beim Umbenennen/Zusammenführen: ${err.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  // 1c) Ganze Gruppe in eine andere Gruppen-Spalte verschieben (kopiert Gruppennamen in Zielspalte & leert Quellspalte)
  const handleMoveGroupToField = async (sourceField, groupKey, targetField) => {
    if (!sourceField || !targetField || sourceField === targetField || actionBusy) return;
    if (groupKey === EMPTY_GROUP_TOKEN) return;

    const affectedRows = currentCreatorRows.filter((row) => {
      const val = getLocalizedItemName(row[sourceField]).trim();
      const key = val || EMPTY_GROUP_TOKEN;
      return key === groupKey;
    });

    if (affectedRows.length === 0) {
      setActivePillPopover(null);
      return;
    }

    setActionBusy(true);
    setError('');
    setNotice('');

    try {
      const updatedCount = await persistRowPatchesToSupabase(affectedRows, (row) => {
        const groupName = getLocalizedItemName(row[sourceField]).trim() || groupKey;
        return {
          [targetField]: formatFieldValueForTable(row, targetField, groupName),
          [sourceField]: formatFieldValueForTable(row, sourceField, ''),
        };
      });

      if (activeGroupFilter?.field === sourceField && activeGroupFilter?.value === groupKey) {
        setActiveGroupFilter({
          field: targetField,
          value: groupKey,
        });
      }

      setActivePillPopover(null);
      const labelFor = (f) =>
        f === 'category_group'
          ? 'Category (Tab 2)'
          : f === 'boss_group'
            ? 'Boss (Tab 3)'
            : 'Chrono (Tab 1)';
      setNotice(
        `⇄ Gruppe "${groupKey}" (${updatedCount} Zeilen) von ${labelFor(sourceField)} nach ${labelFor(targetField)} verschoben.`
      );
    } catch (err) {
      setError(`Fehler beim Verschieben der Gruppe: ${err.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  // 2a) Multi-Select Checkbox Helpers
  const handleToggleSelectRow = (rowId) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const allVisibleSelected = useMemo(() => {
    if (visibleCreatorRows.length === 0) return false;
    return visibleCreatorRows.every((r) => selectedRowIds.has(r.id));
  }, [visibleCreatorRows, selectedRowIds]);

  const handleToggleSelectAllVisible = () => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const r of visibleCreatorRows) {
          next.delete(r.id);
        }
      } else {
        for (const r of visibleCreatorRows) {
          next.add(r.id);
        }
      }
      return next;
    });
  };

  const handleSelectFromRowDownwards = (startRowId) => {
    const startIndex = visibleCreatorRows.findIndex((r) => r.id === startRowId);
    if (startIndex === -1) return;
    const slice = visibleCreatorRows.slice(startIndex);
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      const allSliceAlreadySelected = slice.every((r) => next.has(r.id));
      if (allSliceAlreadySelected) {
        for (const r of slice) next.delete(r.id);
      } else {
        for (const r of slice) next.add(r.id);
      }
      return next;
    });
  };

  // 2b) Floating Batch-Bar: Überschreibe chronological_group, category_group oder boss_group für alle ausgewählten Zeilen
  const handleBatchOverwriteSelected = async (field, value) => {
    if (selectedRowIds.size === 0 || actionBusy) return;
    const targetRows = currentCreatorRows.filter((r) => selectedRowIds.has(r.id));
    if (targetRows.length === 0) return;

    setActionBusy(true);
    setError('');
    setNotice('');

    try {
      const updatedCount = await persistRowPatchesToSupabase(targetRows, (row) => ({
        [field]: formatFieldValueForTable(row, field, value),
      }));

      setBatchCustomField(null);
      setBatchCustomValue('');

      let label = field;
      let valDisplay = String(value ?? '');
      if (field === 'category_group') {
        label = 'Category-Gruppe';
        valDisplay = valDisplay.trim() ? `"${valDisplay.trim()}"` : '(geleert)';
      } else if (field === 'boss_group') {
        label = 'Boss-Gruppe';
        valDisplay = valDisplay.trim() ? `"${valDisplay.trim()}"` : '(geleert)';
      } else if (field === 'chronological_group') {
        label = 'Chrono-Gruppe';
        valDisplay = valDisplay.trim() ? `"${valDisplay.trim()}"` : '(geleert)';
      }

      setNotice(`⚡ Batch-Update: ${label} = ${valDisplay} für ${updatedCount} markierte Zeilen gespeichert.`);
    } catch (err) {
      setError(`Batch-Update fehlgeschlagen: ${err.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  // --- ACTIONS ---

  // 1. Schnell-Löschen komplettes Spiel aus Liste oder Action-Bar
  const handleDeleteWholeGame = async (gameId) => {
    if (!gameId || actionBusy) return;
    const isRoh = activeDataSource === 'rohmaterial';
    if (
      !window.confirm(
        isRoh
          ? 'Möchtest du alle Rohmaterial-Einträge (game_guides_rohmaterial) für dieses Spiel löschen?'
          : 'Möchtest du alle Entwürfe für dieses Spiel komplett löschen?'
      )
    ) {
      return;
    }

    setActionBusy(true);
    setNotice('');
    setError('');

    const targetTable = isRoh ? TABLES.guidesRohmaterial : 'staging_game_guides';
    const { error: delErr } = await supabase
      .from(targetTable)
      .delete()
      .eq('game_id', gameId);

    setActionBusy(false);

    if (delErr) {
      setError(`Löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }

    setNotice(
      isRoh
        ? 'Spiel wurde aus game_guides_rohmaterial gelöscht.'
        : 'Spiel wurde aus der Staging Queue gelöscht.'
    );
    jumpToNextGame(gameId);
    if (isRoh) {
      setRohmaterialRows((prev) =>
        prev.filter(
          (r) => r.game_id !== gameId && r.platform_game_id !== gameId && r.batch_key !== gameId
        )
      );
      setRohmaterialGames((prev) => prev.filter((g) => g.gameId !== gameId));
    } else {
      setStagingRows((prev) => prev.filter((r) => r.game_id !== gameId));
    }
  };

  // 2. Creator verwerfen
  const handleDiscardCreator = async () => {
    if (!selectedGameId || !selectedCreatorName || actionBusy) return;
    if (!window.confirm(`Möchtest du alle Einträge von Creator "${selectedCreatorName}" löschen?`)) return;

    setActionBusy(true);
    setNotice('');
    setError('');

    const targetGameId = selectedGameId;
    const targetCreator = selectedCreatorName;
    const targetTable =
      activeDataSource === 'rohmaterial' ? TABLES.guidesRohmaterial : 'staging_game_guides';

    const { error: delErr } = await supabase
      .from(targetTable)
      .delete()
      .eq('game_id', targetGameId)
      .eq('creator_name', targetCreator);

    setActionBusy(false);

    if (delErr) {
      setError(`Creator verwerfen fehlgeschlagen: ${delErr.message}`);
      return;
    }

    setNotice(`Einträge für "${targetCreator}" wurden verworfen.`);
    jumpToNextCreatorOrGame(targetGameId, targetCreator);
    if (activeDataSource === 'rohmaterial') {
      setRohmaterialRows((prev) =>
        prev.filter((r) => !(r.game_id === targetGameId && r.creator_name === targetCreator))
      );
      fetchRohmaterialSummary();
    } else {
      setStagingRows((prev) =>
        prev.filter((r) => !(r.game_id === targetGameId && r.creator_name === targetCreator))
      );
    }
  };

  // Open approval modal
  const handleOpenApproveModal = () => {
    if (!selectedGameId || !selectedCreatorName || actionBusy) return;
    setApproveLocale('');
    setSelectedGameTypes(parseGameTypes(selectedGame?.spiel_typ));
    setShowApproveModal(true);
  };

  // 3. Creator freigeben (Zentraler Freigabe-Prozess über RPC approve_staging_guide bzw. Rohmaterial-Pipeline)
  const handleApproveCreatorConfirm = async () => {
    if (!selectedGameId || !selectedCreatorName || actionBusy || !approveLocale || selectedGameTypes.length === 0) return;

    setActionBusy(true);
    setNotice('');
    setError('');

    const selectedLanguage = approveLocale;

    try {
      // 1. Spieltyp speichern, falls gewählt/geändert
      const { error: typeErr } = await setIntranetGameType(supabase, selectedGameId, selectedGameTypes);
      if (typeErr) {
        console.warn('Fehler beim Speichern des Spiel-Typs im Freigabe-Modal:', typeErr.message);
      } else {
        const updateGameMap = (prev) => {
          const next = new Map(prev);
          const current = next.get(selectedGameId);
          if (current) next.set(selectedGameId, { ...current, spiel_typ: selectedGameTypes.join(', ') });
          return next;
        };
        setGamesMap(updateGameMap);
        setRohGamesMap(updateGameMap);
      }

      if (activeDataSource === 'staging') {
        // 2. Eventuelle ausstehende Inline-Edits in staging_game_guides sicherstellen
        const stagingTargets = currentCreatorRows.filter(
          (r) => (r._sourceTable || 'staging_game_guides') === 'staging_game_guides'
        );
        if (stagingTargets.length > 0) {
          await persistRowPatchesToSupabase(stagingTargets, (row) => ({
            guide_id: formatFieldValueForTable(row, 'guide_id', row.guide_id),
            item_name: formatFieldValueForTable(row, 'item_name', getLocalizedItemName(row.item_name)),
            chronological_group: formatFieldValueForTable(
              row,
              'chronological_group',
              getLocalizedItemName(row.chronological_group)
            ),
            category_group: formatFieldValueForTable(
              row,
              'category_group',
              getLocalizedItemName(row.category_group)
            ),
            boss_group: formatFieldValueForTable(
              row,
              'boss_group',
              getLocalizedItemName(row.boss_group)
            ),
            video_chapter: formatFieldValueForTable(
              row,
              'video_chapter',
              getLocalizedItemName(row.video_chapter)
            ),
            timestamp: row.timestamp || null,
            video_url: row.video_url || null,
            trophy_id: formatFieldValueForTable(row, 'trophy_id', row.trophy_id),
            is_trophy_relevant: row.is_trophy_relevant || null,
          }));
        }

        // 3. Zentrale Supabase-RPC aufrufen (keine manuellen Einzel-Updates auf game_guides / games.status)
        const { error: rpcErr } = await supabase.rpc('approve_staging_guide', {
          p_game_id: selectedGameId,
          p_lang: selectedLanguage,
          p_creator_name: selectedCreatorName,
        });

        if (rpcErr) {
          setActionBusy(false);
          setError(`Freigabe über approve_staging_guide fehlgeschlagen: ${rpcErr.message}`);
          return;
        }
      } else {
        // Rohmaterial / Multi-Tab Freigabe
        let creatorId = currentCreatorRows.find((r) => r.creator_id)?.creator_id || null;
        if (!creatorId && selectedCreatorName && !selectedCreatorName.startsWith('Produktiver Guide')) {
          const { data: existingCreator } = await supabase
            .from(TABLES.contentCreators)
            .select('id')
            .ilike('channel_name', selectedCreatorName.trim())
            .maybeSingle();

          if (existingCreator?.id) {
            creatorId = existingCreator.id;
          } else {
            const sampleRowWithUrl = currentCreatorRows.find((r) => r.creator_input_url || r.playlist_url);
            const inputUrl = sampleRowWithUrl?.creator_input_url || sampleRowWithUrl?.playlist_url || '';
            const { data: newCreator } = await supabase
              .from(TABLES.contentCreators)
              .insert({ channel_name: selectedCreatorName.trim(), youtube_url: inputUrl })
              .select('id')
              .maybeSingle();

            if (newCreator?.id) {
              creatorId = newCreator.id;
            }
          }
        }

        const toLocalized = (val) => {
          if (!val) return null;
          if (typeof val === 'object' && !Array.isArray(val)) {
            const str = val[selectedLanguage] || val.de || val.en || Object.values(val)[0] || '';
            return str ? { ...val, [selectedLanguage]: String(str).trim() } : null;
          }
          const str = String(val).trim();
          return str ? { [selectedLanguage]: str } : null;
        };

        const parseDigitStr = (val) => {
          const digits = String(val ?? '').replace(/\D/g, '');
          return digits ? String(Number.parseInt(digits, 10)) : null;
        };

        const rowsFromNonProductive = currentCreatorRows.filter(
          (r) => r._sourceTable !== TABLES.guides
        );

        if (rowsFromNonProductive.length > 0) {
          const rowsToApprove = rowsFromNonProductive.map((r) => ({
            game_id: r.game_id || selectedGameId,
            platform_game_id: r.platform_game_id || null,
            guide_id: parseDigitStr(r.guide_id),
            item_name: toLocalized(r.item_name),
            chronological_group: toLocalized(r.chronological_group),
            category_group: toLocalized(r.category_group),
            boss_group: toLocalized(r.boss_group),
            video_chapter: toLocalized(r.video_chapter),
            timestamp: r.timestamp || null,
            video_url: r.video_url || null,
            trophy_id: parseDigitStr(r.trophy_id),
            is_trophy_relevant: r.is_trophy_relevant || null,
            creator_id: creatorId,
            sheet_type: deriveSheetTypesFromRow(r),
          }));

          const { error: insertErr } = await supabase.from(TABLES.guides).insert(rowsToApprove);

          if (insertErr) {
            setActionBusy(false);
            setError(`Freigabe fehlgeschlagen: ${insertErr.message}`);
            return;
          }
        }

        // Einheitliches Update auf public.games (guide_<lang>: 'FERTIG', publish_status: 'PUBLISHED', publishing_status, published_locales, is_guide_locked: true)
        const { data: current } = await supabase
          .from(TABLES.games)
          .select(`${GAME_STRUCT.status}, ${GAME_STRUCT.publishingStatus}, ${GAME_STRUCT.publishedLocales}`)
          .eq(GAME_PK, selectedGameId)
          .maybeSingle();

        const hasVideo = currentCreatorRows.some((r) => Boolean(r.video_url));
        const updatePatch = buildUnifiedGuidePublishPatch({
          currentGame: current,
          lang: selectedLanguage,
          guideState: GUIDE_PUBLICATION.DONE,
          hasVideo,
          clearRohmaterial: true,
        });

        const { error: gameUpErr } = await supabase
          .from(TABLES.games)
          .update(updatePatch)
          .eq(GAME_PK, selectedGameId);

        if (gameUpErr) {
          setActionBusy(false);
          setError(`Fehler beim Aktualisieren des Spiel-Status: ${gameUpErr.message}`);
          return;
        }

        await removeGameFromWiedervorlage(supabase, selectedGameId);

        await supabase
          .from(TABLES.guidesRohmaterial)
          .delete()
          .eq('game_id', selectedGameId);
      }

      const approvedGameId = selectedGameId;
      setShowApproveModal(false);
      setActionBusy(false);
      setNotice(`Guide von Creator "${selectedCreatorName}" erfolgreich in [${selectedLanguage.toUpperCase()}] freigegeben!`);
      jumpToNextGame(approvedGameId);
      if (activeDataSource === 'rohmaterial') {
        setRohmaterialRows((prev) => prev.filter((r) => r.game_id !== approvedGameId));
        setRohmaterialGames((prev) => prev.filter((g) => g.gameId !== approvedGameId));
        setProductiveRohRows([]);
      } else {
        setStagingRows((prev) => prev.filter((r) => r.game_id !== approvedGameId));
      }
    } catch (err) {
      setActionBusy(false);
      setError(`Unerwarteter Fehler bei der Freigabe: ${err.message}`);
    }
  };

  // 4. Einzelne Zeile löschen
  const handleDeleteRow = async (rowId) => {
    if (!rowId || actionBusy) return;
    const targetRow = currentCreatorRows.find((r) => r.id === rowId);
    const sourceTable = targetRow?._sourceTable || 'staging_game_guides';

    const { error: delErr } = await supabase
      .from(sourceTable)
      .delete()
      .eq('id', rowId);

    if (delErr) {
      setError(`Zeile löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }

    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      next.delete(rowId);
      return next;
    });

    if (sourceTable === 'staging_game_guides') {
      setStagingRows((prev) => prev.filter((r) => r.id !== rowId));
    } else if (sourceTable === TABLES.guidesRohmaterial) {
      setRohmaterialRows((prev) => prev.filter((r) => r.id !== rowId));
    } else if (sourceTable === TABLES.guides) {
      setProductiveRohRows((prev) => prev.filter((r) => r.id !== rowId));
    }
  };

  // 5. Ganzes Video / Chapter entfernen
  const handleDeleteVideoChapter = async (videoChapter, videoUrl) => {
    if (!selectedGameId || !selectedCreatorName || actionBusy) return;
    if (!window.confirm('Möchtest du alle Zeilen dieses Videos / Chapters für diesen Creator löschen?')) return;

    setActionBusy(true);
    const targetTable =
      activeDataSource === 'rohmaterial' ? TABLES.guidesRohmaterial : 'staging_game_guides';

    let query = supabase
      .from(targetTable)
      .delete()
      .eq('game_id', selectedGameId)
      .eq('creator_name', selectedCreatorName);

    if (videoUrl) {
      query = query.eq('video_url', videoUrl);
    } else if (videoChapter) {
      query = query.eq('video_chapter', videoChapter);
    }

    const { error: delErr } = await query;
    setActionBusy(false);

    if (delErr) {
      setError(`Video/Chapter löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }

    if (activeDataSource === 'rohmaterial') {
      fetchRohmaterialSummary();
    } else {
      fetchQueue();
    }
  };

  // Helper: Synchronisiert video_url mit neuem Timestamp
  const updateVideoUrlTimestamp = (url, newTimestamp) => {
    if (!url) return url;
    const seconds = parseTimecodeToSeconds(newTimestamp);
    if (seconds == null) {
      return url;
    }
    const cleanUrl = url.replace(/([?&]t=)[^&]*/, '');
    const separator = cleanUrl.includes('?') ? '&' : '?';
    return `${cleanUrl}${separator}t=${seconds}s`;
  };

  // 6. Zeilen-Eigenschaft inline updaten
  const handleUpdateRowField = async (rowId, field, value) => {
    const targetRow = currentCreatorRows.find((r) => r.id === rowId) || stagingRows.find((r) => r.id === rowId);
    if (!targetRow) return;

    try {
      await persistRowPatchesToSupabase([targetRow], (row) => {
        if (field === 'timestamp') {
          const newVideoUrl = updateVideoUrlTimestamp(row?.video_url, value);
          return {
            timestamp: value,
            video_url: newVideoUrl,
          };
        }
        return {
          [field]: formatFieldValueForTable(row, field, value),
        };
      });
    } catch (err) {
      console.error(`Fehler beim Speichern von ${field}:`, err.message);
    }
  };

  // 7. 1-Klick-Reparatur für Zeitspannen im Item-Namen
  const handleCleanItemTimes = async () => {
    if (!currentCreatorRows.length || actionBusy) return;

    setActionBusy(true);
    setError('');
    setNotice('');

    try {
      const modifiedRows = [];
      const patchesMap = new Map();

      for (const row of currentCreatorRows) {
        const rawName = getLocalizedItemName(row.item_name);
        let nameStr = rawName.trim();
        let cleanTime = row.timestamp;
        let newVideoUrl = row.video_url;
        let isModified = false;

        // a) Prüfe Regex auf Uhrzeit am Ende des Item-Namens
        const match = nameStr.match(/[:\s-]*(\d{1,2}:\s*\d{2}(?::\s*\d{2})?)\s*$/);
        if (match) {
          const rawTime = match[1];
          cleanTime = rawTime.replace(/\s+/g, '');
          newVideoUrl = updateVideoUrlTimestamp(row.video_url, cleanTime);
          nameStr = nameStr.replace(/[:\s-]*\d{1,2}:\s*\d{2}(?::\s*\d{2})?\s*$/, '').trim();
          isModified = true;
        }

        // b) Zeilen mit item_name === '<Untitled Chapter...>' werden sauber in "Start" umbenannt
        if (/^<Untitled Chapter.*>/i.test(nameStr)) {
          nameStr = 'Start';
          isModified = true;
        }

        if (isModified) {
          modifiedRows.push(row);
          patchesMap.set(row.id, {
            item_name: formatFieldValueForTable(row, 'item_name', nameStr),
            timestamp: cleanTime,
            video_url: newVideoUrl,
          });
        }
      }

      if (modifiedRows.length > 0) {
        await persistRowPatchesToSupabase(modifiedRows, (row) => patchesMap.get(row.id));
      }

      setNotice(
        `Bereinigung abgeschlossen: ${modifiedRows.length} Zeilen in Items bereinigt / umbenannt.`
      );
    } catch (err) {
      setError(`Fehler bei der Bereinigung: ${err.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  // 8. Trophy ID zuweisen
  const handleAssignTrophyToActiveRow = (trophyId) => {
    if (!activeRowId) return;
    const numericId = extractNumericTrophyId(trophyId);
    handleUpdateRowField(activeRowId, 'trophy_id', numericId);
    handleUpdateRowField(activeRowId, 'is_trophy_relevant', 'ja');
  };

  // --- TROPHÄEN-SCHNELL-PICKER & AUTO-MATCHER ("JUST DO IT") ---

  // Aufbereitete Trophäen mit numerischer ID & normalisierten Texten für Matching
  const normalizedTrophies = useMemo(() => {
    return (gameTrophies ?? []).map((ach, idx) => {
      const rawAchId = ach.platform_achievement_id ?? ach.id ?? '';
      const numericId = extractNumericTrophyId(rawAchId, idx + 1);
      const nameDe =
        typeof ach.trophy_name === 'object' && ach.trophy_name !== null
          ? ach.trophy_name.de || ''
          : typeof ach.trophy_name === 'string'
            ? ach.trophy_name
            : '';
      const nameEn =
        typeof ach.trophy_name === 'object' && ach.trophy_name !== null
          ? ach.trophy_name.en || ''
          : '';
      const displayName =
        (typeof ach.trophy_name === 'object' && ach.trophy_name !== null
          ? ach.trophy_name[trophyLang] || ach.trophy_name.de || ach.trophy_name.en || Object.values(ach.trophy_name)[0]
          : ach.trophy_name) || String(rawAchId);
      const descDe = getLocalizedTrophyDesc(ach.trophy_desc ?? ach.trophy_description, 'de');
      const descEn = getLocalizedTrophyDesc(ach.trophy_desc ?? ach.trophy_description, 'en');
      const displayDesc = getLocalizedTrophyDesc(ach.trophy_desc ?? ach.trophy_description, trophyLang);

      return {
        raw: ach,
        rawAchId: String(rawAchId),
        numericId,
        displayName: String(displayName || '').trim(),
        displayDesc: String(displayDesc || '').trim(),
        normDe: normalizeForMatch(nameDe),
        normEn: normalizeForMatch(nameEn),
        normDescDe: normalizeForMatch(descDe),
        normDescEn: normalizeForMatch(descEn),
        iconUrl:
          typeof ach.icon_url === 'object' && ach.icon_url !== null
            ? ach.icon_url.de || ach.icon_url.en || Object.values(ach.icon_url)[0] || ''
            : ach.icon_url || '',
        trophyType: ach.trophy_type || 'bronze',
      };
    });
  }, [gameTrophies, trophyLang]);

  // Prüft eine Guide-Zeile auf 100%-Match ("Just Do It") gegen alle Trophäen
  const findExactTrophyMatchForItem = useCallback(
    (itemNameRaw) => {
      const itemNorm = normalizeForMatch(itemNameRaw);
      if (!itemNorm || normalizedTrophies.length === 0) return null;

      // a) 100% exakte Übereinstimmung mit normDe oder normEn (muss eindeutig sein)
      const exactMatches = normalizedTrophies.filter(
        (t) =>
          (t.normDe && t.normDe === itemNorm) ||
          (t.normEn && t.normEn === itemNorm)
      );
      if (exactMatches.length === 1) {
        return exactMatches[0];
      }

      // b) Normalisierter Trophäenname >= 5 Zeichen lang und eindeutig als ganzes Wort im item_name enthalten
      const containedMatches = normalizedTrophies.filter((t) => {
        const matchDe = t.normDe && t.normDe.length >= 5 && isWholeWordContained(itemNorm, t.normDe);
        const matchEn = t.normEn && t.normEn.length >= 5 && isWholeWordContained(itemNorm, t.normEn);
        return matchDe || matchEn;
      });
      if (containedMatches.length === 1) {
        return containedMatches[0];
      }

      return null;
    },
    [normalizedTrophies]
  );

  // Prüft auf Fuzzy-Vorschlag (Teil-Übereinstimmung über trophy_name oder trophy_desc)
  const findFuzzyTrophySuggestion = useCallback(
    (itemNameRaw, chronoGroupRaw) => {
      const itemNorm = normalizeForMatch(itemNameRaw);
      const groupNorm = normalizeForMatch(chronoGroupRaw);
      const combinedNorm = `${itemNorm} ${groupNorm}`.trim();
      if (!combinedNorm || normalizedTrophies.length === 0) return null;

      const tokens = combinedNorm
        .split(' ')
        .filter((w) => w.length >= 4);

      let bestTrophy = null;
      let bestScore = 0;

      for (const t of normalizedTrophies) {
        let score = 0;

        // Teil-Substring im Namen
        if (itemNorm.length >= 4) {
          if ((t.normDe && (t.normDe.includes(itemNorm) || itemNorm.includes(t.normDe))) ||
              (t.normEn && (t.normEn.includes(itemNorm) || itemNorm.includes(t.normEn)))) {
            score += 5;
          }
        }
        if (groupNorm.length >= 4) {
          if ((t.normDe && (t.normDe.includes(groupNorm) || groupNorm.includes(t.normDe))) ||
              (t.normEn && (t.normEn.includes(groupNorm) || groupNorm.includes(t.normEn)))) {
            score += 4;
          }
        }

        // Token-Treffer in Name oder Beschreibung
        for (const token of tokens) {
          if ((t.normDe && t.normDe.includes(token)) || (t.normEn && t.normEn.includes(token))) {
            score += 3;
          } else if (
            (t.normDescDe && t.normDescDe.includes(token)) ||
            (t.normDescEn && t.normDescEn.includes(token))
          ) {
            score += 2;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestTrophy = t;
        }
      }

      return bestScore >= 3 ? bestTrophy : null;
    },
    [normalizedTrophies]
  );

  // Führt den "Just Do It" Auto-Matcher für alle offenen Zeilen aus
  const runJustDoItAutoMatcher = useCallback(
    async (isManualClick = false) => {
      if (!currentCreatorRows.length || !normalizedTrophies.length) {
        if (isManualClick) {
          setNotice('⚡ Auto-Match: Keine passenden offenen Zeilen oder Trophäen gefunden.');
        }
        return 0;
      }

      const unassignedRows = currentCreatorRows.filter(
        (r) => r.trophy_id == null || String(r.trophy_id).trim() === ''
      );

      if (unassignedRows.length === 0) {
        if (isManualClick) {
          setNotice('⚡ Alle Zeilen haben bereits eine trophy_id!');
        }
        return 0;
      }

      const matchedRows = [];
      const matchedTrophyById = new Map();

      for (const row of unassignedRows) {
        const itemStr = getLocalizedItemName(row.item_name);
        const matchedTrophy = findExactTrophyMatchForItem(itemStr);
        if (matchedTrophy) {
          matchedRows.push(row);
          matchedTrophyById.set(row.id, matchedTrophy.numericId);
        }
      }

      if (matchedRows.length === 0) {
        if (isManualClick) {
          setNotice('⚡ Auto-Match: Keine neuen 100%-Übereinstimmungen gefunden.');
        }
        return 0;
      }

      try {
        await persistRowPatchesToSupabase(matchedRows, (row) => {
          const numId = matchedTrophyById.get(row.id);
          return {
            trophy_id: formatFieldValueForTable(row, 'trophy_id', numId),
            is_trophy_relevant: 'ja',
          };
        });

        setAutoMatchedBannerCount((prev) => prev + matchedRows.length);
        setNotice(`⚡ ${matchedRows.length} Zeilen automatisch zu 100% verknüpft`);
        return matchedRows.length;
      } catch (err) {
        console.error('Fehler beim Auto-Match:', err);
        if (isManualClick) {
          setError(`Auto-Match fehlgeschlagen: ${err.message}`);
        }
        return 0;
      }
    },
    [
      currentCreatorRows,
      normalizedTrophies,
      findExactTrophyMatchForItem,
      persistRowPatchesToSupabase,
      formatFieldValueForTable,
    ]
  );

  // Automatischer "Just Do It" Lauf sobald ein Spiel-Entwurf + Trophäen geladen sind
  useEffect(() => {
    if (
      !selectedGameId ||
      !selectedCreatorName ||
      loading ||
      loadingTrophies ||
      currentCreatorRows.length === 0 ||
      normalizedTrophies.length === 0
    ) {
      return;
    }

    const sessionKey = `${activeDataSource}::${selectedGameId}::${selectedCreatorName}`;
    if (autoMatchedKeysRef.current.has(sessionKey)) return;
    autoMatchedKeysRef.current.add(sessionKey);

    runJustDoItAutoMatcher(false);
  }, [
    selectedGameId,
    selectedCreatorName,
    activeDataSource,
    loading,
    loadingTrophies,
    currentCreatorRows.length,
    normalizedTrophies.length,
    runJustDoItAutoMatcher,
  ]);

  // Anzahl offener Zeilen ohne trophy_id
  const openUnassignedRowCount = useMemo(() => {
    return currentCreatorRows.filter(
      (r) => r.trophy_id == null || String(r.trophy_id).trim() === ''
    ).length;
  }, [currentCreatorRows]);

  // Bereits vergebene numerische Trophy-IDs im aktuellen Entwurf
  const assignedNumericTrophyIds = useMemo(() => {
    const set = new Set();
    for (const r of currentCreatorRows) {
      if (r.trophy_id != null && String(r.trophy_id).trim() !== '') {
        const num = extractNumericTrophyId(r.trophy_id, -1);
        if (num > 0) set.add(num);
      }
    }
    return set;
  }, [currentCreatorRows]);

  // Smart Grouping für die linke/obere Spalte des Trophäen-Schnell-Pickers (alphabetisch A-Z)
  const matcherSmartGroups = useMemo(() => {
    const sourceRows =
      matcherItemFilter === 'open'
        ? currentCreatorRows.filter((r) => r.trophy_id == null || String(r.trophy_id).trim() === '')
        : currentCreatorRows;

    if (sourceRows.length === 0) return [];

    // Zähle Häufigkeit von normalisiertem item_name und chronological_group
    const itemNormCounts = new Map();
    const chronoNormCounts = new Map();

    for (const r of sourceRows) {
      const iNorm = normalizeForMatch(getLocalizedItemName(r.item_name));
      const cRaw = getLocalizedItemName(r.chronological_group).trim();
      const cNorm = normalizeForMatch(cRaw);
      if (iNorm) itemNormCounts.set(iNorm, (itemNormCounts.get(iNorm) || 0) + 1);
      if (cNorm) chronoNormCounts.set(cNorm, (chronoNormCounts.get(cNorm) || 0) + 1);
    }

    const groupsMap = new Map();

    for (const row of sourceRows) {
      const itemStr = getLocalizedItemName(row.item_name).trim() || '(Unbenannt)';
      const chronoStr = getLocalizedItemName(row.chronological_group).trim();
      const iNorm = normalizeForMatch(itemStr);
      const cNorm = normalizeForMatch(chronoStr);

      let groupKey = `row_${row.id}`;
      let groupLabel = itemStr;
      let groupKind = 'single';

      if (iNorm && (itemNormCounts.get(iNorm) || 0) > 1) {
        groupKey = `item_${iNorm}`;
        groupLabel = itemStr.replace(/[:\s#-]*\d+\s*$/, '').trim() || itemStr;
        groupKind = 'item_norm';
      } else if (cNorm && (chronoNormCounts.get(cNorm) || 0) > 1) {
        groupKey = `chrono_${cNorm}`;
        groupLabel = chronoStr;
        groupKind = 'chrono_group';
      }

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          key: groupKey,
          label: groupLabel,
          kind: groupKind,
          rows: [],
          sampleItemName: itemStr,
          sampleChrono: chronoStr,
        });
      }
      groupsMap.get(groupKey).rows.push(row);
    }

    const result = [];
    for (const g of groupsMap.values()) {
      const assignedIds = [
        ...new Set(
          g.rows
            .map((r) => (r.trophy_id != null && String(r.trophy_id).trim() !== '' ? Number(r.trophy_id) : null))
            .filter((v) => v != null)
        ),
      ];
      const isOpen = g.rows.some((r) => r.trophy_id == null || String(r.trophy_id).trim() === '');
      const suggestion = isOpen
        ? findFuzzyTrophySuggestion(g.sampleItemName, g.sampleChrono)
        : null;

      result.push({
        ...g,
        count: g.rows.length,
        isGrouped: g.rows.length > 1,
        isOpen,
        assignedIds,
        suggestion,
      });
    }

    // Alphabetisch A-Z sortieren
    result.sort((a, b) => a.label.localeCompare(b.label, 'de', { numeric: true }));
    return result;
  }, [currentCreatorRows, matcherItemFilter, findFuzzyTrophySuggestion]);

  // Automatische Vorauswahl des obersten offenen Items im Trophäen-Schnell-Picker
  useEffect(() => {
    if (!showTrophyMatcher) return;
    if (matcherSmartGroups.length === 0) {
      setMatcherActiveGroupKey(null);
      return;
    }
    const stillExists = matcherSmartGroups.some((g) => g.key === matcherActiveGroupKey);
    if (!matcherActiveGroupKey || !stillExists) {
      const firstOpen = matcherSmartGroups.find((g) => g.isOpen) || matcherSmartGroups[0];
      setMatcherActiveGroupKey(firstOpen ? firstOpen.key : null);
    }
  }, [showTrophyMatcher, matcherSmartGroups, matcherActiveGroupKey]);

  // Alphabetisch sortierte (A-Z) und gefilterte Trophäen für die rechte/untere Spalte
  const matcherVisibleTrophies = useMemo(() => {
    let list = [...normalizedTrophies];

    if (matcherHideAssignedTrophies) {
      list = list.filter((t) => !assignedNumericTrophyIds.has(t.numericId));
    }

    if (matcherTrophySearch.trim()) {
      const q = matcherTrophySearch.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.displayName.toLowerCase().includes(q) ||
          t.displayDesc.toLowerCase().includes(q) ||
          String(t.numericId).includes(q) ||
          t.rawAchId.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'de', { numeric: true }));
    return list;
  }, [normalizedTrophies, matcherHideAssignedTrophies, assignedNumericTrophyIds, matcherTrophySearch]);

  // 1-Tap-Zuweisung für ein Item / eine Smart-Group und automatisches Weiterspringen zum nächsten offenen Item
  const handleMatcherAssignTrophyToGroup = useCallback(
    async (targetGroup, numericTrophyId) => {
      if (!targetGroup || !targetGroup.rows?.length || actionBusy) return;

      // Bestimme vorab das nächste offene Item in der Liste
      const currentIdx = matcherSmartGroups.findIndex((g) => g.key === targetGroup.key);
      let nextGroupKey = null;
      for (let i = currentIdx + 1; i < matcherSmartGroups.length; i += 1) {
        if (matcherSmartGroups[i].isOpen && matcherSmartGroups[i].key !== targetGroup.key) {
          nextGroupKey = matcherSmartGroups[i].key;
          break;
        }
      }
      if (!nextGroupKey) {
        for (let i = 0; i < currentIdx; i += 1) {
          if (matcherSmartGroups[i].isOpen && matcherSmartGroups[i].key !== targetGroup.key) {
            nextGroupKey = matcherSmartGroups[i].key;
            break;
          }
        }
      }

      try {
        await persistRowPatchesToSupabase(targetGroup.rows, (row) => ({
          trophy_id: formatFieldValueForTable(row, 'trophy_id', numericTrophyId),
          is_trophy_relevant: 'ja',
        }));

        setMatcherActiveGroupKey(nextGroupKey);
      } catch (err) {
        setError(`Zuweisung fehlgeschlagen: ${err.message}`);
      }
    },
    [actionBusy, matcherSmartGroups, persistRowPatchesToSupabase, formatFieldValueForTable]
  );

  // 8b. IDs neu durchnummerieren (1..N) in aktueller Sortierreihenfolge
  const handleRenumberGuideIds = async () => {
    if (!currentCreatorRows.length || actionBusy) return;

    setActionBusy(true);
    setError('');
    setNotice('');

    try {
      const indexById = new Map();
      currentCreatorRows.forEach((row, index) => {
        indexById.set(row.id, index + 1);
      });

      await persistRowPatchesToSupabase(currentCreatorRows, (row) => ({
        guide_id: formatFieldValueForTable(row, 'guide_id', indexById.get(row.id)),
      }));

      setSortField('guide_id');
      setSortDirection('asc');
      setNotice(`🔢 ${currentCreatorRows.length} Zeilen erfolgreich neu durchnummeriert (1..${currentCreatorRows.length}).`);
    } catch (err) {
      setError(`Fehler beim Neu-Nummerieren: ${err.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  // 8c. Suchen & Ersetzen Logik (inkl. category_group)
  const searchReplacePreview = useMemo(() => {
    if (!searchQuery || !currentCreatorRows.length) {
      return { matchCount: 0, matchedRows: [], regexError: null };
    }

    let regex = null;
    try {
      const flags = caseSensitive ? 'g' : 'gi';
      const pattern = useRegex
        ? searchQuery
        : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(pattern, flags);
    } catch (err) {
      return { matchCount: 0, matchedRows: [], regexError: err.message };
    }

    const targetFields =
      searchTargetField === 'all'
        ? ['item_name', 'chronological_group', 'category_group', 'boss_group', 'video_chapter']
        : [searchTargetField];

    const matchedRows = [];

    for (const row of currentCreatorRows) {
      let rowMatched = false;
      const newFields = {};

      for (const field of targetFields) {
        const rawVal = row[field];
        const currentStr = getLocalizedItemName(rawVal);
        if (!currentStr) continue;

        regex.lastIndex = 0;
        if (regex.test(currentStr)) {
          rowMatched = true;
          regex.lastIndex = 0;
          const replacedStr = currentStr.replace(regex, replaceValue);
          newFields[field] = formatFieldValueForTable(row, field, replacedStr);
        }
      }

      if (rowMatched) {
        matchedRows.push({ row, id: row.id, updates: newFields });
      }
    }

    return {
      matchCount: matchedRows.length,
      matchedRows,
      regexError: null,
    };
  }, [searchQuery, replaceValue, searchTargetField, useRegex, caseSensitive, currentCreatorRows, formatFieldValueForTable]);

  const handleApplySearchReplace = async () => {
    const { matchedRows, matchCount, regexError } = searchReplacePreview;
    if (!matchCount || regexError || actionBusy) return;

    setActionBusy(true);
    setError('');
    setNotice('');

    try {
      const updatesById = new Map(matchedRows.map((m) => [m.id, m.updates]));
      await persistRowPatchesToSupabase(
        matchedRows.map((m) => m.row),
        (row) => updatesById.get(row.id)
      );

      setNotice(`🔄 Suchen & Ersetzen in ${matchCount} Zeilen erfolgreich angewendet.`);
    } catch (err) {
      setError(`Fehler bei Suchen & Ersetzen: ${err.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  // 8d. Großes Spiel -> Rohmaterial (Multi-Tab) verschieben
  const handleMoveToRohmaterial = async () => {
    if (!selectedGameId || !selectedCreatorName || actionBusy) return;

    setActionBusy(true);
    setError('');
    setNotice('');

    const targetGameId = selectedGameId;
    const targetCreator = selectedCreatorName;

    try {
      let movedViaRpc = false;
      const hasCustomCategoryOrSheet = currentCreatorRows.some(
        (r) =>
          Boolean(getLocalizedItemName(r.category_group).trim()) ||
          Boolean(getLocalizedItemName(r.boss_group).trim()) ||
          deriveSheetTypesFromRow(r).join(',') !== '1'
      );

      // 1. Versuche Supabase RPC move_staging_to_rohmaterial (nur wenn keine lokalen category_group/boss_group Anpassungen vorliegen)
      if (!hasCustomCategoryOrSheet) {
        const { error: rpcErr } = await supabase.rpc('move_staging_to_rohmaterial', {
          p_game_id: targetGameId,
          p_creator_name: targetCreator,
        });
        if (!rpcErr) {
          movedViaRpc = true;
        } else {
          console.warn(
            'RPC move_staging_to_rohmaterial nicht verfügbar oder fehlgeschlagen, nutze Fallback:',
            rpcErr.message
          );
        }
      }

      if (!movedViaRpc) {
        // Fallback: Zeilen in game_guides_rohmaterial kopieren, games.status.rohmaterial = 'PENDING_MULTI_TAB' setzen, aus staging_game_guides löschen
        const safeCreator = targetCreator.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
        const batchKey = `staging_${String(targetGameId).slice(0, 8)}_${safeCreator}_${Date.now()}`;

        const toJsonb = (val) => {
          if (!val) return null;
          if (typeof val === 'object' && !Array.isArray(val)) return val;
          const str = String(val).trim();
          return str ? { de: str, en: str } : null;
        };

        const parseNum = (val) => {
          const digits = String(val ?? '').replace(/\D/g, '');
          return digits ? Number.parseInt(digits, 10) : null;
        };

        const rohRows = currentCreatorRows.map((r, idx) => ({
          batch_key: batchKey,
          batch_status: 'MATCHED',
          creator_name: targetCreator,
          playlist_url: r.creator_input_url || r.video_url || null,
          game_id: r.game_id,
          platform_game_id:
            r.platform_game_id ||
            (Array.isArray(selectedGame?.platform_game_id)
              ? selectedGame.platform_game_id[0]
              : selectedGame?.platform_game_id) ||
            null,
          guide_id: String(parseNum(r.guide_id) ?? idx + 1),
          sheet_type: deriveSheetTypesFromRow(r),
          item_name: toJsonb(r.item_name),
          chronological_group: toJsonb(r.chronological_group),
          category_group: toJsonb(r.category_group),
          boss_group: toJsonb(r.boss_group),
          video_chapter: toJsonb(r.video_chapter),
          timestamp: r.timestamp || null,
          video_url: r.video_url || null,
          trophy_id: parseNum(r.trophy_id) != null ? String(parseNum(r.trophy_id)) : null,
          is_trophy_relevant: r.is_trophy_relevant || null,
        }));

        if (rohRows.length > 0) {
          const { error: insErr } = await supabase
            .from(TABLES.guidesRohmaterial)
            .insert(rohRows);

          if (insErr) {
            throw new Error(`Fehler beim Kopieren in game_guides_rohmaterial: ${insErr.message}`);
          }
        }

        // games.status.rohmaterial = 'PENDING_MULTI_TAB' setzen
        const { data: currentGameData } = await supabase
          .from(TABLES.games)
          .select(GAME_STRUCT.status)
          .eq(GAME_PK, targetGameId)
          .maybeSingle();

        const statusMap = {
          ...parseStatusMap(currentGameData?.[GAME_STRUCT.status]),
          rohmaterial: 'PENDING_MULTI_TAB',
        };

        const { error: statusUpErr } = await supabase
          .from(TABLES.games)
          .update({ [GAME_STRUCT.status]: statusMap })
          .eq(GAME_PK, targetGameId);

        if (statusUpErr) {
          console.warn('Warnung beim Setzen von status.rohmaterial:', statusUpErr.message);
        }

        // Aus staging_game_guides löschen (für dieses Spiel)
        const { error: delStagingErr } = await supabase
          .from('staging_game_guides')
          .delete()
          .eq('game_id', targetGameId);

        if (delStagingErr) {
          throw new Error(`Fehler beim Löschen aus staging_game_guides: ${delStagingErr.message}`);
        }
      }

      setNotice(
        `📦 Spiel "${getLocalizedTitle(selectedGame?.spieltitel)}" (${targetCreator}) zu Rohmaterial (Multi-Tab) verschoben${movedViaRpc ? ' (RPC)' : ''}.`
      );
      jumpToNextGame(targetGameId);
      setStagingRows((prev) => prev.filter((r) => r.game_id !== targetGameId));
      fetchRohmaterialSummary();
    } catch (err) {
      setError(`Verschieben zu Rohmaterial fehlgeschlagen: ${err.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  // 9. Guide-Tipp für Trophäe in DB speichern
  const handleSaveTrophyGuideTip = async (platformAchievementId, newTipText) => {
    if (!selectedGameId || !platformAchievementId) return;
    const { error: err } = await saveTrophyGuideTip(
      supabase,
      selectedGameId,
      platformAchievementId,
      trophyLang,
      newTipText
    );

    if (err) {
      console.error('Fehler beim Speichern des Guide-Tipps:', err.message);
      setError(`Trophäen-Tipp konnte nicht gespeichert werden: ${err.message}`);
      return;
    }

    setNotice(
      newTipText.trim()
        ? `Guide-Tipp für Trophäe "${platformAchievementId}" [${trophyLang.toUpperCase()}] gespeichert.`
        : `Guide-Tipp für Trophäe "${platformAchievementId}" [${trophyLang.toUpperCase()}] gelöscht.`
    );
    setGameTrophies((prev) =>
      prev.map((t) => {
        if (t.platform_achievement_id === platformAchievementId || t.id === platformAchievementId) {
          let currentMap = {};
          if (typeof t.guide_tip === 'object' && t.guide_tip !== null && !Array.isArray(t.guide_tip)) {
            currentMap = { ...t.guide_tip };
          } else if (typeof t.guide_tip === 'string' && t.guide_tip) {
            currentMap = { de: t.guide_tip };
          }

          if (newTipText.trim()) {
            currentMap[trophyLang] = newTipText.trim();
          } else {
            delete currentMap[trophyLang];
          }

          return { ...t, guide_tip: Object.keys(currentMap).length ? currentMap : null };
        }
        return t;
      })
    );
  };

  // 9b. Alle Guide-Tipps für das Spiel in der gewählten Sprache löschen
  const handleClearAllTrophyGuideTips = async () => {
    if (!selectedGameId || actionBusy) return;
    if (
      !window.confirm(
        `Möchtest du wirklich ALLE Guide-Tipps für "${getLocalizedTitle(selectedGame?.spieltitel)}" in der Sprache [${trophyLang.toUpperCase()}] komplett löschen?`
      )
    ) {
      return;
    }

    setActionBusy(true);
    setError('');
    setNotice('');

    const { error: clearErr } = await clearGameGuideTips(supabase, selectedGameId, trophyLang);
    setActionBusy(false);

    if (clearErr) {
      setError(`Komplett-Löschen der Guide-Tipps fehlgeschlagen: ${clearErr.message}`);
      return;
    }

    setGameTrophies((prev) =>
      prev.map((t) => {
        let currentMap = {};
        if (typeof t.guide_tip === 'object' && t.guide_tip !== null && !Array.isArray(t.guide_tip)) {
          currentMap = { ...t.guide_tip };
        } else if (typeof t.guide_tip === 'string' && t.guide_tip) {
          currentMap = { de: t.guide_tip };
        }
        delete currentMap[trophyLang];
        return { ...t, guide_tip: Object.keys(currentMap).length ? currentMap : null };
      })
    );

    setNotice(`🗑️ Alle Guide-Tipps in [${trophyLang.toUpperCase()}] wurden komplett gelöscht.`);
  };

  // Video embed URL
  const currentEmbedUrl = useMemo(() => {
    if (!activeVideoUrl) return null;
    return getYouTubeEmbedUrl(activeVideoUrl, activeTimestamp, { autoplay: false });
  }, [activeVideoUrl, activeTimestamp]);

  return (
    <div className="flex flex-col gap-4 text-zinc-200">
      {/* Top Banner / Notice */}
      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-[#00ff66]/30 bg-[#00ff66]/10 px-4 py-2.5 text-xs text-[#00ff66]">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Umschalter / Zähler für verschobene große Spiele (Rohmaterial) & Datenquelle */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-800 bg-[#121314] px-4 py-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Modus-Umschalter: Entwürfe (staging_game_guides) vs. Rohmaterial / Multi-Tab */}
          <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900/90 p-0.5">
            <button
              type="button"
              onClick={() => setActiveDataSource('staging')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-mono font-bold transition ${
                activeDataSource === 'staging'
                  ? 'bg-[#00ff66]/15 text-[#00ff66] border border-[#00ff66]/40'
                  : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
              }`}
            >
              <span>📝 Staging-Entwürfe ({queueGamesList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveDataSource('rohmaterial')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-mono font-bold transition ${
                activeDataSource === 'rohmaterial'
                  ? 'bg-purple-500/20 text-purple-200 border border-purple-400/50'
                  : 'text-zinc-400 hover:text-purple-200 border border-transparent'
              }`}
            >
              <span>📦 Multi-Tab / Rohmaterial ({rohmaterialGames.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowRohmaterialView((prev) => !prev)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-mono font-bold transition ${
              showRohmaterialView
                ? 'border-purple-500/60 bg-purple-500/20 text-purple-200'
                : 'border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20'
            }`}
          >
            <span>📦 Rohmaterial-Übersicht ({rohmaterialGames.length})</span>
            <span>{showRohmaterialView ? '▲' : '▼'}</span>
          </button>
          <span className="text-[11px] font-mono text-zinc-500">
            Staging: <strong className="text-zinc-300">{queueGamesList.length} Spiele</strong> ({stagingRows.length} Zeilen) · Rohmaterial: <strong className="text-purple-300">{rohmaterialGames.length} Spiele</strong> ({rohmaterialRows.length} Zeilen)
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleRandomizeQueue}
            title="Spiele-Liste zufällig neu mischen"
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] font-mono text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66] transition"
          >
            🎲 Zufällig mischen
          </button>
          <button
            type="button"
            onClick={() => {
              fetchQueue();
              fetchRohmaterialSummary();
            }}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] font-mono text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66] transition"
          >
            🔄 Alles aktualisieren
          </button>
        </div>
      </div>

      {/* Aufklappbare Liste der verschobenen großen Spiele (Rohmaterial / Multi-Tab) */}
      {showRohmaterialView && (
        <div className="rounded-2xl border border-purple-500/30 bg-[#15131c] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-purple-500/20 pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-purple-200">
                📦 Verschobene große Spiele zur Multi-Tab-Bearbeitung ({rohmaterialGames.length})
              </h3>
              <p className="text-[11px] text-zinc-400 font-mono">
                Spiele mit <span className="text-purple-300">status-&gt;&gt;&apos;rohmaterial&apos; = &apos;PENDING_MULTI_TAB&apos;</span> oder Einträgen in <span className="text-purple-300">game_guides_rohmaterial</span> – direkt im Editor konsolidierbar
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRohmaterialView(false)}
              className="text-xs font-mono text-zinc-400 hover:text-white px-2 py-1"
            >
              ✕ Schließen
            </button>
          </div>

          {loadingRohmaterial ? (
            <p className="text-xs font-mono text-zinc-400 py-4 text-center animate-pulse">
              Lade Rohmaterial-Spiele…
            </p>
          ) : rohmaterialGames.length === 0 ? (
            <p className="text-xs font-mono text-zinc-500 py-4 text-center">
              Aktuell keine verschobenen großen Spiele vorhanden.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
              {rohmaterialGames.map((item, idx) => {
                const targetId = item.gameId || item.platformGameId;
                const multiTabHref = targetId ? `/guide/${encodeURIComponent(targetId)}?rohmaterial=1` : '';
                const isSelectedRoh = activeDataSource === 'rohmaterial' && selectedGameId === item.gameId;
                return (
                  <div
                    key={item.gameId || item.platformGameId || idx}
                    className={`flex items-center justify-between gap-2.5 rounded-xl border p-2.5 transition ${
                      isSelectedRoh
                        ? 'border-purple-400 bg-purple-500/20'
                        : 'border-purple-500/25 bg-zinc-900/80 hover:border-purple-400/50'
                    }`}
                  >
                    <div
                      onClick={() => {
                        setActiveDataSource('rohmaterial');
                        setSelectedGameId(item.gameId);
                      }}
                      className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                    >
                      {item.coverUrl ? (
                        <img
                          src={item.coverUrl}
                          alt={item.title}
                          className="h-11 w-9 shrink-0 rounded object-cover bg-zinc-800"
                        />
                      ) : (
                        <div className="h-11 w-9 shrink-0 rounded bg-zinc-800 flex items-center justify-center text-xs">
                          📦
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{item.title}</p>
                        <p className="text-[10px] font-mono text-purple-300 truncate">
                          {item.platformGameId} · {item.rowCount} Zeilen
                        </p>
                        {item.creatorList?.length > 0 && (
                          <p className="text-[10px] font-mono text-zinc-400 truncate">
                            ▶ {item.creatorList.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDataSource('rohmaterial');
                          setSelectedGameId(item.gameId);
                          setShowRohmaterialView(false);
                        }}
                        className="rounded-lg border border-[#00ff66]/40 bg-[#00ff66]/15 px-2.5 py-1.5 text-[10px] font-mono font-bold text-[#00ff66] hover:bg-[#00ff66]/30 transition"
                        title="Im Gruppen- & Multi-Tab-Editor öffnen"
                      >
                        ✏️ Bearbeiten
                      </button>
                      {multiTabHref && (
                        <a
                          href={multiTabHref}
                          onClick={(e) => handleStaffGamePreviewClick(e, multiTabHref)}
                          className="rounded-lg border border-purple-400/40 bg-purple-500/20 px-2 py-1.5 text-[10px] font-mono font-bold text-purple-200 hover:bg-purple-500/35 no-underline"
                          title="Auf Spieleseite prüfen"
                        >
                          ↗
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading && activeSidebarGamesList.length === 0 ? (
        <div className="flex h-64 items-center justify-center font-mono text-sm text-zinc-500 animate-pulse">
          Lade Entwürfe-Queue…
        </div>
      ) : activeSidebarGamesList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-[#121314] px-6 py-16 text-center">
          <span className="text-4xl">🎉</span>
          <h2 className="mt-3 text-lg font-bold text-white">
            {activeDataSource === 'rohmaterial' ? 'Keine Rohmaterial-Spiele' : 'Keine offenen Entwürfe'}
          </h2>
          <p className="mt-1 text-xs text-zinc-400 max-w-sm leading-relaxed">
            {activeDataSource === 'rohmaterial' ? (
              <>Aktuell liegen keine Spiele in <span className="font-mono text-zinc-300">game_guides_rohmaterial</span>.</>
            ) : (
              <>Die Staging Queue (<span className="font-mono text-zinc-300">staging_game_guides</span>) ist aktuell leer.</>
            )}
          </p>
          <div className="mt-4 flex items-center gap-2">
            {activeDataSource === 'staging' && rohmaterialGames.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveDataSource('rohmaterial')}
                className="rounded-xl border border-purple-500/50 bg-purple-500/20 px-4 py-2 text-xs font-bold text-purple-200 hover:bg-purple-500/30"
              >
                📦 Zu Multi-Tab / Rohmaterial wechseln ({rohmaterialGames.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                fetchQueue();
                fetchRohmaterialSummary();
              }}
              className="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-200 hover:border-[#00ff66]/40 hover:text-[#00ff66]"
            >
              🔄 Queue neu laden
            </button>
          </div>
        </div>
      ) : (
        /* High-Density 3-Spalten Layout */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
          
          {/* ==================== A. LINKE SPALTE: Spiele-Queue (3 Cols) ==================== */}
          <div className="lg:col-span-3 flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-[#121314] p-3 max-h-[calc(100vh-160px)] overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5 px-1">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  {activeDataSource === 'rohmaterial' ? '📦 Multi-Tab Queue' : '📝 Spiele-Queue'}
                </h3>
                <p className="text-[10px] text-zinc-500 font-mono">
                  {visibleQueueList.length} / {filteredQueueList.length} Spiele ({activeDataSource === 'rohmaterial' ? rohmaterialRows.length : stagingRows.length} Zeilen)
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleRandomizeQueue}
                  title="Spiele-Liste zufällig mischen"
                  className="rounded-lg border border-zinc-700 bg-zinc-800 p-1.5 text-xs text-zinc-400 hover:text-[#00ff66]"
                >
                  🎲
                </button>
                <button
                  type="button"
                  onClick={() => {
                    fetchQueue();
                    fetchRohmaterialSummary();
                  }}
                  title="Queue aktualisieren"
                  className="rounded-lg border border-zinc-700 bg-zinc-800 p-1.5 text-xs text-zinc-400 hover:text-[#00ff66]"
                >
                  🔄
                </button>
              </div>
            </div>

            {/* Filter Input */}
            <input
              type="text"
              placeholder="Spiele filtern…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900/90 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
            />

            {/* Queue List (max 10 Spiele geladen, Rest rutscht automatisch nach) */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
              {visibleQueueList.map((item) => {
                const isSelected = item.gameId === selectedGameId;
                return (
                  <div
                    key={item.gameId}
                    onClick={() => setSelectedGameId(item.gameId)}
                    className={`group relative flex items-center justify-between gap-2 rounded-xl border p-2 cursor-pointer transition select-none ${
                      isSelected
                        ? 'border-[#00ff66]/50 bg-[#00ff66]/10 text-white'
                        : 'border-zinc-800/80 bg-[#17181a] hover:border-zinc-700 hover:bg-zinc-800/60 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.coverUrl ? (
                        <img
                          src={item.coverUrl}
                          alt={item.title}
                          className="h-10 w-8 shrink-0 rounded object-cover bg-zinc-800"
                        />
                      ) : (
                        <div className="h-10 w-8 shrink-0 rounded bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-600 font-mono">
                          🎮
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold leading-tight truncate">{item.title}</p>
                        <p className="text-[10px] font-mono text-zinc-400 truncate">{item.platformGameId}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-[9px] font-mono text-zinc-500">
                          <span>▶ {item.creatorCount} Creator</span>
                          <span>·</span>
                          <span>📄 {item.rowCount} Zeilen</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Delete Game Button */}
                    <button
                      type="button"
                      title="Komplettes Spiel verworfen/löschen"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWholeGame(item.gameId);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-red-500/20 hover:text-red-400"
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ==================== B & C. MITTLERE SPALTE: Detail & Creator Guide (6 Cols) ==================== */}
          <div className="lg:col-span-6 flex flex-col gap-3 min-w-0">
            
            {selectedGame ? (
              <>
                {/* B. GAME-HEADER & CREATOR TABS & VIDEO PLAYER */}
                <div className="rounded-2xl border border-zinc-800 bg-[#121314] p-4 flex flex-col gap-4">
                  
                  {/* Header Top: Cover + Game Details + Video Player */}
                  <div className="flex flex-wrap sm:flex-nowrap gap-4 items-start justify-between">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {getLocalizedCover(selectedGame.cover_url) ? (
                        <img
                          src={getLocalizedCover(selectedGame.cover_url)}
                          alt="Cover"
                          className="h-20 w-16 shrink-0 rounded-lg object-cover shadow-md border border-zinc-700/60"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                          {selectedGame.platform_game_id || 'ID unbekannt'}
                        </p>
                        {intranetGameHref(selectedGame) ? (
                          <a
                            href={intranetGameHref(selectedGame)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => handleStaffGamePreviewClick(e, intranetGameHref(selectedGame))}
                            title="Spiel-Detail-Seite öffnen"
                            className="group inline-flex items-center gap-1.5 max-w-full text-base font-bold text-white hover:text-[#00ff66] no-underline transition leading-snug"
                          >
                            <span className="truncate group-hover:underline">
                              {getLocalizedTitle(selectedGame.spieltitel)}
                            </span>
                            <span className="shrink-0 text-xs font-mono text-zinc-400 group-hover:text-[#00ff66]">
                              ↗
                            </span>
                          </a>
                        ) : (
                          <h2 className="text-base font-bold text-white truncate leading-snug">
                            {getLocalizedTitle(selectedGame.spieltitel)}
                          </h2>
                        )}
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {selectedGame.publisher || selectedGame.entwickler || 'Publisher N/A'}
                        </p>

                        {/* Spiel-Typ Multi-Select Dropdown */}
                        <div className="mt-2.5 flex items-center gap-2">
                          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider w-16 shrink-0">Spiel-Typ:</span>
                          <AdminGameTypeSelect
                            gameId={selectedGame.id}
                            gameType={selectedGame.spiel_typ}
                            onSaved={(savedType) => {
                              setGamesMap((prev) => {
                                const next = new Map(prev);
                                const current = next.get(selectedGame.id);
                                if (current) next.set(selectedGame.id, { ...current, spiel_typ: savedType });
                                return next;
                              });
                            }}
                          />
                        </div>

                        {/* Status Dropdown mit Löschmöglichkeit */}
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider w-16 shrink-0">Status:</span>
                          <AdminGameStatusDropdown
                            game={selectedGame}
                            onStatusUpdated={(updatedStatus) => {
                              setGamesMap((prev) => {
                                const next = new Map(prev);
                                const current = next.get(selectedGame.id);
                                if (current) next.set(selectedGame.id, { ...current, status: updatedStatus });
                                return next;
                              });
                              setNotice('Status-Eintrag wurde gelöscht.');
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Compact Video Player (Sticky Top Right) */}
                    <div className="w-full sm:w-56 shrink-0 flex flex-col gap-1">
                      <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-zinc-800 bg-black">
                        {currentEmbedUrl ? (
                          <iframe
                            src={currentEmbedUrl}
                            title="YouTube Preview"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="h-full w-full border-0"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center text-[10px] font-mono text-zinc-500">
                            <span>▶ Kein Video geladen</span>
                            <span className="text-[9px] text-zinc-600 mt-1">Klicke auf eine Zeile/Timestamp</span>
                          </div>
                        )}
                      </div>
                      {activeTimestamp ? (
                        <span className="text-[10px] font-mono text-center text-[#00ff66]">
                          ▶ Position: {activeTimestamp}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Creator Tabs */}
                  {creatorTabs.length > 0 && (
                    <div className="border-t border-zinc-800/80 pt-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                        Creator in der Queue ({creatorTabs.length}):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {creatorTabs.map((tab) => {
                          const isActive = tab.creatorName === selectedCreatorName;
                          return (
                            <button
                              key={tab.creatorName}
                              type="button"
                              onClick={() => setSelectedCreatorName(tab.creatorName)}
                              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-mono transition ${
                                isActive
                                  ? 'bg-[#00ff66]/15 text-[#00ff66] border border-[#00ff66]/40 font-bold'
                                  : 'bg-zinc-800/80 text-zinc-300 border border-zinc-700/60 hover:bg-zinc-700'
                              }`}
                            >
                              <span>▶ {tab.creatorName}</span>
                              <span className="rounded bg-zinc-900/60 px-1.5 py-0.5 text-[10px] text-zinc-400">
                                {tab.videoCount} Videos | {tab.rowCount} Zeilen
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* C. GUIDE-ZEILEN TABELLE & GRUPPEN-RÖNTGENBLICK (SUPER COMPACT HIGH-DENSITY) */}
                <div className="rounded-2xl border border-zinc-800 bg-[#121314] p-3 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                        Guide-Zeilen ({visibleCreatorRows.length}
                        {visibleCreatorRows.length !== currentCreatorRows.length
                          ? ` / ${currentCreatorRows.length}`
                          : ''}
                        )
                      </h4>
                      <button
                        type="button"
                        disabled={actionBusy || currentCreatorRows.length === 0}
                        onClick={handleCleanItemTimes}
                        title="Entfernt <Untitled Chapter 1> und extrahiert Uhrzeiten aus Item-Namen"
                        className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 transition disabled:opacity-50"
                      >
                        ⚡ Zeiten in Items bereinigen
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy || currentCreatorRows.length === 0}
                        onClick={handleRenumberGuideIds}
                        title="Nummeriert guide_id (1..N) in der aktuell angezeigten Sortierreihenfolge neu durch"
                        className="inline-flex items-center gap-1 rounded bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/30 transition disabled:opacity-50"
                      >
                        🔢 IDs neu durchnummerieren (1..N)
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy || currentCreatorRows.length === 0 || gameTrophies.length === 0}
                        onClick={() => runJustDoItAutoMatcher(true)}
                        title="Prüft alle Zeilen ohne trophy_id auf 100%-Übereinstimmung mit Trophäennamen (DE/EN) und verknüpft sie sofort"
                        className="inline-flex items-center gap-1 rounded bg-[#00ff66]/15 px-2 py-1 text-[11px] font-mono font-bold text-[#00ff66] hover:bg-[#00ff66]/25 border border-[#00ff66]/40 transition disabled:opacity-50"
                      >
                        ⚡ Auto-Match
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowTrophyMatcher((prev) => !prev)}
                        className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-mono font-bold border transition ${
                          showTrophyMatcher
                            ? 'bg-amber-400 text-black border-amber-300 shadow-md shadow-amber-500/20'
                            : 'bg-amber-500/15 text-amber-300 border-amber-400/50 hover:bg-amber-500/25'
                        }`}
                      >
                        <span>🏆 Trophäen-Matcher ({openUnassignedRowCount} offen)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRoentgenblick((prev) => !prev)}
                        className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-mono font-bold border transition ${
                          showRoentgenblick
                            ? 'bg-emerald-500/15 text-[#00ff66] border-[#00ff66]/40'
                            : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:text-white'
                        }`}
                      >
                        <span>🔬 Gruppen-Röntgenblick</span>
                        {groupStats.outlierCount > 0 && (
                          <span className="rounded bg-amber-400/20 px-1 py-0.2 text-[10px] text-amber-300 border border-amber-400/50">
                            ⚠️ {groupStats.outlierCount} Ausreißer
                          </span>
                        )}
                        <span>{showRoentgenblick ? '▲' : '▼'}</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {autoMatchedBannerCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#00ff66]/50 bg-[#00ff66]/15 px-2.5 py-0.5 text-[11px] font-mono font-bold text-[#00ff66]">
                          ⚡ {autoMatchedBannerCount} Zeilen automatisch zu 100% verknüpft
                        </span>
                      )}
                      {activeRowId && (
                        <span className="text-[10px] font-mono text-[#00ff66]">
                          ✓ Aktive Zeile ausgewählt (Trophäen-Zuordnung bereit)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ==================== 3. SPLITSCREEN TROPHÄEN-SCHNELL-PICKER ("JUST DO IT" UI) ==================== */}
                  {showTrophyMatcher && (
                    <div className="rounded-2xl border-2 border-amber-400/50 bg-[#141619] p-3 flex flex-col gap-3 shadow-2xl">
                      {/* Matcher Top Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                            🏆 Splitscreen Trophäen-Schnell-Picker
                          </span>
                          <span className="rounded-md bg-zinc-900 border border-zinc-700 px-2 py-0.5 text-[10px] font-mono text-zinc-300">
                            Offen: <strong className="text-amber-300">{openUnassignedRowCount}</strong> / {currentCreatorRows.length} Zeilen
                          </span>
                          {autoMatchedBannerCount > 0 && (
                            <span className="rounded-md border border-[#00ff66]/40 bg-[#00ff66]/10 px-2 py-0.5 text-[10px] font-mono font-bold text-[#00ff66]">
                              ⚡ {autoMatchedBannerCount} Zeilen automatisch zu 100% verknüpft
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => runJustDoItAutoMatcher(true)}
                            className="rounded-lg border border-[#00ff66]/40 bg-[#00ff66]/15 px-2.5 py-1 text-[10px] font-mono font-bold text-[#00ff66] hover:bg-[#00ff66]/25"
                          >
                            ⚡ Auto-Match erneut prüfen
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowTrophyMatcher(false)}
                            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[10px] font-mono text-zinc-300 hover:text-white"
                          >
                            ✕ Schließen
                          </button>
                        </div>
                      </div>

                      {/* Splitscreen Container: Desktop 50/50 Links/Rechts nebeneinander | Mobile 50/50 Oben/Unten übereinander */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-[72vh] min-h-[480px] max-h-[760px]">
                        {/* LINKE / OBERE SPALTE: Guide-Items (alphabetisch A-Z + Smart Grouping) */}
                        <div className="flex flex-col rounded-xl border border-zinc-800 bg-[#101113] overflow-hidden h-[34vh] lg:h-full min-h-[220px]">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/80 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-mono font-bold text-white uppercase tracking-wider">
                                1. Guide-Items (A–Z)
                              </span>
                              <span className="text-[10px] font-mono text-zinc-400">
                                ({matcherSmartGroups.length} Gruppen/Items)
                              </span>
                            </div>

                            {/* Filter-Toggle: Nur offene / Alle */}
                            <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-950 p-0.5 text-[10px] font-mono">
                              <button
                                type="button"
                                onClick={() => setMatcherItemFilter('open')}
                                className={`rounded-md px-2 py-0.5 font-bold transition ${
                                  matcherItemFilter === 'open'
                                    ? 'bg-amber-400 text-black'
                                    : 'text-zinc-400 hover:text-white'
                                }`}
                              >
                                Nur offene ({openUnassignedRowCount})
                              </button>
                              <button
                                type="button"
                                onClick={() => setMatcherItemFilter('all')}
                                className={`rounded-md px-2 py-0.5 font-bold transition ${
                                  matcherItemFilter === 'all'
                                    ? 'bg-[#00ff66] text-black'
                                    : 'text-zinc-400 hover:text-white'
                                }`}
                              >
                                Alle ({currentCreatorRows.length})
                              </button>
                            </div>
                          </div>

                          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                            {matcherSmartGroups.length === 0 ? (
                              <div className="flex h-full flex-col items-center justify-center text-center p-4 font-mono text-xs text-zinc-500">
                                <span>🎉 Keine offenen Guide-Items mehr vorhanden!</span>
                              </div>
                            ) : (
                              matcherSmartGroups.map((group) => {
                                const isSelected = matcherActiveGroupKey === group.key;
                                const isExpanded = matcherExpandedGroupKeys.has(group.key);

                                return (
                                  <div
                                    key={group.key}
                                    onClick={() => setMatcherActiveGroupKey(group.key)}
                                    className={`rounded-xl border p-2 transition cursor-pointer select-none ${
                                      isSelected
                                        ? 'border-[#00ff66] bg-[#00ff66]/12 ring-1 ring-[#00ff66]/50'
                                        : group.isOpen
                                          ? 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700'
                                          : 'border-emerald-500/30 bg-emerald-950/15 hover:border-emerald-500/50'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          {group.isGrouped ? (
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-200">
                                              <span>📁 {group.label}</span>
                                              <span className="rounded bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 text-[10px] font-mono text-amber-300">
                                                ({group.count}x)
                                              </span>
                                            </span>
                                          ) : (
                                            <span className="text-xs font-bold text-white break-words">
                                              {group.label}
                                            </span>
                                          )}

                                          {group.sampleChrono && group.kind !== 'chrono_group' && (
                                            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-mono text-cyan-300">
                                              {group.sampleChrono}
                                            </span>
                                          )}

                                          {group.assignedIds.length > 0 && (
                                            <span className="rounded bg-[#00ff66]/20 border border-[#00ff66]/40 px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#00ff66]">
                                              🏆 #{group.assignedIds.join(', #')}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1 shrink-0">
                                        {group.isGrouped && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setMatcherExpandedGroupKeys((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(group.key)) next.delete(group.key);
                                                else next.add(group.key);
                                                return next;
                                              });
                                            }}
                                            className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[9px] font-mono text-zinc-300 hover:text-white"
                                            title="Einzelne Zeilen dieser Smart-Group ein-/ausklappen"
                                          >
                                            {isExpanded ? '▲ Zuklappen' : `▼ ${group.count} Zeilen`}
                                          </button>
                                        )}
                                        {isSelected && (
                                          <span className="rounded bg-[#00ff66] px-1.5 py-0.5 text-[9px] font-mono font-bold text-black">
                                            AKTIV
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Fuzzy-Match Schnell-Button (1-Tap Übernahme) */}
                                    {group.suggestion && (
                                      <div className="mt-1.5">
                                        <button
                                          type="button"
                                          disabled={actionBusy}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleMatcherAssignTrophyToGroup(
                                              group,
                                              group.suggestion.numericId
                                            );
                                          }}
                                          className="w-full text-left flex items-center justify-between gap-2 rounded-lg border border-amber-400/60 bg-amber-500/15 px-2.5 py-1 text-[10px] font-mono font-bold text-amber-200 hover:bg-amber-500/30 transition"
                                        >
                                          <span className="truncate">
                                            💡 Vorschlag: {group.suggestion.displayName} (#{group.suggestion.numericId})
                                          </span>
                                          <span className="shrink-0 rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-black">
                                            1-Tap Übernahme
                                          </span>
                                        </button>
                                      </div>
                                    )}

                                    {/* Aufgeklappte Einzelzeilen bei Smart-Grouping */}
                                    {group.isGrouped && isExpanded && (
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        className="mt-2 space-y-1 border-t border-zinc-800 pt-1.5 pl-2"
                                      >
                                        {group.rows.map((r) => (
                                          <div
                                            key={r.id}
                                            className="flex items-center justify-between gap-2 rounded bg-zinc-950/80 px-2 py-1 text-[10px] font-mono text-zinc-300"
                                          >
                                            <span className="truncate">
                                              #{r.guide_id ?? '—'} · {getLocalizedItemName(r.item_name)}
                                            </span>
                                            <span className="text-zinc-500 shrink-0">
                                              {r.timestamp || '—'}{' '}
                                              {r.trophy_id ? `· 🏆 #${r.trophy_id}` : ''}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* RECHTE / UNTERE SPALTE: Trophäen aus game_achievements (alphabetisch A-Z) */}
                        <div className="flex flex-col rounded-xl border border-zinc-800 bg-[#101113] overflow-hidden h-[34vh] lg:h-full min-h-[220px]">
                          <div className="flex flex-col gap-2 border-b border-zinc-800 bg-zinc-900/80 px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11px] font-mono font-bold text-white uppercase tracking-wider">
                                2. Trophäen (A–Z · 1-Tap Zuweisung)
                              </span>

                              <div className="flex items-center gap-2">
                                <label className="inline-flex items-center gap-1.5 text-[10px] font-mono text-zinc-300 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={matcherHideAssignedTrophies}
                                    onChange={(e) =>
                                      setMatcherHideAssignedTrophies(e.target.checked)
                                    }
                                    className="h-3.5 w-3.5 accent-[#00ff66] rounded"
                                  />
                                  <span>Bereits vergebene ausblenden</span>
                                </label>
                                <select
                                  value={trophyLang}
                                  onChange={(e) => setTrophyLang(e.target.value)}
                                  className="rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-[10px] font-mono text-zinc-200"
                                >
                                  <option value="de">DE</option>
                                  <option value="en">EN</option>
                                </select>
                              </div>
                            </div>

                            {/* Schnellsuche */}
                            <input
                              type="text"
                              value={matcherTrophySearch}
                              onChange={(e) => setMatcherTrophySearch(e.target.value)}
                              placeholder="🔍 Trophäe nach Name, Beschreibung oder #ID filtern…"
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs font-mono text-white placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
                            />
                          </div>

                          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                            {matcherVisibleTrophies.length === 0 ? (
                              <div className="flex h-full items-center justify-center p-4 text-center font-mono text-xs text-zinc-500">
                                Keine Trophäen für diesen Filter gefunden.
                              </div>
                            ) : (
                              matcherVisibleTrophies.map((t) => {
                                const isAlreadyUsed = assignedNumericTrophyIds.has(t.numericId);
                                const activeGroupObj = matcherSmartGroups.find(
                                  (g) => g.key === matcherActiveGroupKey
                                );

                                return (
                                  <button
                                    key={t.rawAchId || t.numericId}
                                    type="button"
                                    disabled={!activeGroupObj || actionBusy}
                                    onClick={() => {
                                      if (activeGroupObj) {
                                        handleMatcherAssignTrophyToGroup(activeGroupObj, t.numericId);
                                      }
                                    }}
                                    className={`w-full text-left flex items-start gap-2.5 rounded-xl border p-2 transition ${
                                      isAlreadyUsed
                                        ? 'border-zinc-800/70 bg-zinc-900/40 opacity-75 hover:opacity-100 hover:border-[#00ff66]/50'
                                        : 'border-zinc-800 bg-zinc-900/80 hover:border-[#00ff66] hover:bg-[#00ff66]/10'
                                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                                  >
                                    {t.iconUrl ? (
                                      <img
                                        src={t.iconUrl}
                                        alt=""
                                        className="h-9 w-9 shrink-0 rounded-lg bg-zinc-800 object-cover mt-0.5"
                                      />
                                    ) : (
                                      <div className="h-9 w-9 shrink-0 rounded-lg bg-zinc-800 flex items-center justify-center text-xs mt-0.5">
                                        🏆
                                      </div>
                                    )}

                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#00ff66]">
                                          #{t.numericId}
                                        </span>
                                        <TrophyTypeBadge type={t.trophyType} />
                                        <span className="text-xs font-bold text-white break-words">
                                          {t.displayName}
                                        </span>
                                        {isAlreadyUsed && (
                                          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-mono text-emerald-300">
                                            ✓ vergeben
                                          </span>
                                        )}
                                      </div>
                                      {t.displayDesc && (
                                        <p className="mt-0.5 text-[11px] text-zinc-400 line-clamp-2 leading-snug">
                                          {t.displayDesc}
                                        </p>
                                      )}
                                    </div>

                                    <span className="shrink-0 self-center rounded-lg border border-[#00ff66]/40 bg-[#00ff66]/15 px-2 py-1 text-[10px] font-mono font-bold text-[#00ff66]">
                                      1-Tap ⚡
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ==================== 1. GRUPPEN-RÖNTGENBLICK (CATEGORY & CHRONO PILLS) ==================== */}
                  {showRoentgenblick && currentCreatorRows.length > 0 && (
                    <div className="relative rounded-xl border border-zinc-800/90 bg-zinc-900/60 p-2.5 flex flex-col gap-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-300">
                            🔬 Gruppen-Röntgenblick (Klick auf Pille = Konsolidieren / Filtern / Gruppe verschieben)
                          </span>
                          {groupStats.outlierCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/50 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-300">
                              ⚠️ {groupStats.outlierCount} Ausreißer (1–2 Einträge) erkannt
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300">
                              ✓ Keine 1–2 Zeilen Ausreißer
                            </span>
                          )}
                        </div>

                        {/* Sortierung der Pillen & Schnellfilter Sheet-Type */}
                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                          <span className="text-zinc-500">Sortierung:</span>
                          {[
                            { id: 'az', label: 'A–Z' },
                            { id: 'outliers', label: '⚠️ Ausreißer zuerst' },
                            { id: 'count', label: 'Anzahl ↓' },
                          ].map((mode) => (
                            <button
                              key={mode.id}
                              type="button"
                              onClick={() => setPillSortOrder(mode.id)}
                              className={`rounded px-1.5 py-0.5 border transition ${
                                pillSortOrder === mode.id
                                  ? 'border-[#00ff66]/40 bg-[#00ff66]/15 text-[#00ff66] font-bold'
                                  : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Aktive Filter-Hinweis-Leiste */}
                      {(activeGroupFilter || activeSheetFilter !== 'all') && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#00ff66]/40 bg-[#00ff66]/10 px-2.5 py-1.5 text-[11px] font-mono">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-[#00ff66]">🔍 Aktiver Tabellen-Filter:</span>
                            {activeGroupFilter && (
                              <span className="rounded bg-zinc-900 px-2 py-0.5 text-white border border-zinc-700">
                                {activeGroupFilter.field === 'category_group'
                                  ? 'Category'
                                  : activeGroupFilter.field === 'boss_group'
                                    ? 'Boss'
                                    : 'Chrono'}
                                :{' '}
                                <strong className="text-[#00ff66]">
                                  {activeGroupFilter.value === EMPTY_GROUP_TOKEN
                                    ? '(Ohne Gruppe)'
                                    : activeGroupFilter.value}
                                </strong>
                              </span>
                            )}
                            {activeSheetFilter !== 'all' && (
                              <span className="rounded bg-zinc-900 px-2 py-0.5 text-purple-200 border border-purple-500/40">
                                Tab [{activeSheetFilter}]
                              </span>
                            )}
                            <span className="text-zinc-300">
                              ({visibleCreatorRows.length} von {currentCreatorRows.length} Zeilen sichtbar)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveGroupFilter(null);
                              setActiveSheetFilter('all');
                            }}
                            className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-zinc-800 border border-amber-500/40"
                          >
                            ✕ Filter zurücksetzen (Alle zeigen)
                          </button>
                        </div>
                      )}

                      {/* Drei Zeilen: 1) category_group Pills, 2) chronological_group Pills, 3) boss_group Pills */}
                      {[
                        {
                          field: 'category_group',
                          title: '🗂️ Category-Group (Sammelobjekt-Kategorien)',
                          pills: groupStats.categoryPills,
                          accent: 'purple',
                        },
                        {
                          field: 'chronological_group',
                          title: '⏱️ Chronological-Group (Kapitel / Gebiete)',
                          pills: groupStats.chronoPills,
                          accent: 'cyan',
                        },
                        {
                          field: 'boss_group',
                          title: '⚔️ Boss-Group (Bosse)',
                          pills: groupStats.bossPills,
                          accent: 'amber',
                        },
                      ].map((section) => (
                        <div key={section.field} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold text-zinc-400">
                              {section.title} ({section.pills.length} Gruppen)
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {section.pills.map((pill) => {
                              const isPopoverOpen =
                                activePillPopover?.field === section.field &&
                                activePillPopover?.value === pill.key;
                              const isFiltered =
                                activeGroupFilter?.field === section.field &&
                                activeGroupFilter?.value === pill.key;

                              // Gelber Warn-Rahmen für Gruppen mit nur 1-2 Einträgen (Verdacht auf Tippfehler/Ausreißer)
                              let pillStyle =
                                'border-zinc-700/80 bg-zinc-800/90 text-zinc-200 hover:border-zinc-500';
                              if (isFiltered) {
                                pillStyle =
                                  'border-[#00ff66] bg-[#00ff66]/20 text-[#00ff66] font-bold ring-1 ring-[#00ff66]/50';
                              } else if (pill.isOutlier) {
                                pillStyle =
                                  'border-2 border-amber-400 bg-amber-500/15 text-amber-200 font-bold shadow-sm shadow-amber-500/20 hover:bg-amber-500/25';
                              } else if (pill.isEmpty) {
                                pillStyle =
                                  'border-dashed border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:border-zinc-500';
                              }

                              const otherGroups = section.pills.filter((p) => p.key !== pill.key);
                              const searchTrim = pillMergeSearch.trim().toLowerCase();
                              const filteredTargets = otherGroups
                                .filter(
                                  (p) =>
                                    !searchTrim ||
                                    p.label.toLowerCase().includes(searchTrim)
                                )
                                .sort((a, b) => {
                                  const simA = areGroupNamesSimilar(pill.rawValue, a.rawValue);
                                  const simB = areGroupNamesSimilar(pill.rawValue, b.rawValue);
                                  if (simA !== simB) return simA ? -1 : 1;
                                  return b.count - a.count;
                                });

                              return (
                                <div key={pill.key} className="relative inline-block">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isPopoverOpen) {
                                        setActivePillPopover(null);
                                      } else {
                                        setActivePillPopover({
                                          field: section.field,
                                          value: pill.key,
                                        });
                                        setPillRenameText(pill.rawValue);
                                        setPillMergeSearch('');
                                      }
                                    }}
                                    title={
                                      pill.isOutlier
                                        ? `⚠️ Ausreißer-Verdacht (${pill.count} ${pill.count === 1 ? 'Eintrag' : 'Einträge'}) – Klicken zum Zusammenführen oder Filtern`
                                        : `${pill.label} (${pill.count} Zeilen) – Klicken für Aktionen`
                                    }
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-mono transition select-none ${pillStyle}`}
                                  >
                                    {pill.isOutlier && <span title="1–2 Einträge (Tippfehler-Verdacht)">⚠️</span>}
                                    {isFiltered && <span>🔍</span>}
                                    <span className="max-w-[180px] truncate">{pill.label}</span>
                                    <span
                                      className={`rounded px-1 py-0.2 text-[10px] ${
                                        pill.isOutlier
                                          ? 'bg-amber-400/25 text-amber-200 font-bold'
                                          : 'bg-zinc-950/70 text-zinc-400'
                                      }`}
                                    >
                                      ({pill.count})
                                    </span>
                                    {pill.sheets.length > 0 && (
                                      <span className="text-[9px] text-purple-300/90">
                                        [{pill.sheets.join('|')}]
                                      </span>
                                    )}
                                  </button>

                                  {/* Popover / Dropdown für diese Gruppen-Pille */}
                                  {isPopoverOpen && (
                                    <div
                                      ref={pillPopoverRef}
                                      className="fixed sm:absolute left-3 right-3 sm:left-0 sm:right-auto top-1/4 sm:top-full z-50 mt-1.5 sm:w-80 rounded-2xl border border-zinc-600 bg-[#16181c] p-3 shadow-2xl flex flex-col gap-2.5 text-left"
                                    >
                                      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                                        <div className="min-w-0">
                                          <span className="block text-[9px] font-mono uppercase tracking-wider text-zinc-400">
                                            {section.field === 'category_group'
                                              ? 'Category-Group bearbeiten'
                                              : section.field === 'boss_group'
                                                ? 'Boss-Group bearbeiten'
                                                : 'Chronological-Group bearbeiten'}
                                          </span>
                                          <p className="text-xs font-bold text-white truncate">
                                            {pill.label}{' '}
                                            <span className="text-[#00ff66] font-mono">
                                              ({pill.count} Zeilen)
                                            </span>
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setActivePillPopover(null)}
                                          className="rounded p-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                                        >
                                          ✕
                                        </button>
                                      </div>

                                      {/* b) Nur diese Gruppe in der Tabelle filtern */}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isFiltered) {
                                            setActiveGroupFilter(null);
                                          } else {
                                            setActiveGroupFilter({
                                              field: section.field,
                                              value: pill.key,
                                            });
                                          }
                                          setActivePillPopover(null);
                                        }}
                                        className={`w-full flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-[11px] font-mono font-bold transition ${
                                          isFiltered
                                            ? 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                                            : 'border-[#00ff66]/40 bg-[#00ff66]/15 text-[#00ff66] hover:bg-[#00ff66]/25'
                                        }`}
                                      >
                                        <span>
                                          {isFiltered
                                            ? '✕ Gruppen-Filter aufheben'
                                            : '🔍 Nur diese Gruppe in Tabelle filtern'}
                                        </span>
                                        <span>{pill.count} Zeilen</span>
                                      </button>

                                      {/* Alle Zeilen dieser Gruppe direkt markieren (Multi-Select) */}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const matchingIds = currentCreatorRows
                                            .filter((r) => {
                                              const val = getLocalizedItemName(r[section.field]).trim();
                                              return (val || EMPTY_GROUP_TOKEN) === pill.key;
                                            })
                                            .map((r) => r.id);
                                          setSelectedRowIds((prev) => {
                                            const next = new Set(prev);
                                            for (const id of matchingIds) next.add(id);
                                            return next;
                                          });
                                          setActivePillPopover(null);
                                        }}
                                        className="w-full flex items-center justify-between gap-2 rounded-xl border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-[11px] font-mono text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 transition"
                                      >
                                        <span>☑️ Alle {pill.count} Zeilen dieser Gruppe auswählen</span>
                                      </button>

                                      {/* a) Umbenennen / Zusammenführen mit... */}
                                      <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-2">
                                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-300">
                                          ✏️ Umbenennen / Zusammenführen mit:
                                        </span>

                                        {/* Freitextfeld */}
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            type="text"
                                            value={pillRenameText}
                                            onChange={(e) => setPillRenameText(e.target.value)}
                                            placeholder="Neuer Gruppenname..."
                                            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleRenameOrMergeGroup(
                                                  section.field,
                                                  pill.key,
                                                  pillRenameText
                                                );
                                              }
                                            }}
                                          />
                                          <button
                                            type="button"
                                            disabled={actionBusy}
                                            onClick={() =>
                                              handleRenameOrMergeGroup(
                                                section.field,
                                                pill.key,
                                                pillRenameText
                                              )
                                            }
                                            className="shrink-0 rounded-lg bg-[#00ff66] px-2.5 py-1.5 text-[11px] font-mono font-bold text-black hover:bg-[#00ff66]/90 disabled:opacity-50"
                                          >
                                            Speichern
                                          </button>
                                        </div>

                                        {/* Bestehende Gruppen zum 1-Klick-Zusammenführen */}
                                        {otherGroups.length > 0 && (
                                          <div className="flex flex-col gap-1 mt-1">
                                            {otherGroups.length > 5 && (
                                              <input
                                                type="text"
                                                value={pillMergeSearch}
                                                onChange={(e) => setPillMergeSearch(e.target.value)}
                                                placeholder="Bestehende Gruppe suchen..."
                                                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
                                              />
                                            )}
                                            <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-0.5">
                                              {filteredTargets.map((target) => {
                                                const isSimilar = areGroupNamesSimilar(
                                                  pill.rawValue,
                                                  target.rawValue
                                                );
                                                return (
                                                  <button
                                                    key={target.key}
                                                    type="button"
                                                    disabled={actionBusy}
                                                    onClick={() =>
                                                      handleRenameOrMergeGroup(
                                                        section.field,
                                                        pill.key,
                                                        target.rawValue
                                                      )
                                                    }
                                                    className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1 text-[11px] font-mono text-left transition ${
                                                      isSimilar
                                                        ? 'border-amber-400/60 bg-amber-500/15 text-amber-200 font-bold hover:bg-amber-500/25'
                                                        : 'border-zinc-800 bg-zinc-900/90 text-zinc-300 hover:border-[#00ff66]/40 hover:text-white'
                                                    }`}
                                                  >
                                                    <span className="truncate">
                                                      {isSimilar ? '💡 ' : '↳ '}
                                                      {target.label}
                                                    </span>
                                                    <span className="shrink-0 text-[10px] text-zinc-400">
                                                      ({target.count})
                                                    </span>
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      {/* c) 1-Klick-Aktion: Ganze Gruppe verschieben nach Chrono / Category / Boss */}
                                      {!pill.isEmpty && (
                                        <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-2">
                                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-300">
                                            ⇄ Ganze Gruppe verschieben nach:
                                          </span>
                                          <div className="grid grid-cols-3 gap-1">
                                            {[
                                              { field: 'chronological_group', label: 'Chrono (Tab 1)' },
                                              { field: 'category_group', label: 'Category (Tab 2)' },
                                              { field: 'boss_group', label: 'Boss (Tab 3)' },
                                            ].map((target) => {
                                              const isCurrent = target.field === section.field;
                                              return (
                                                <button
                                                  key={target.field}
                                                  type="button"
                                                  disabled={actionBusy || isCurrent}
                                                  onClick={() =>
                                                    handleMoveGroupToField(
                                                      section.field,
                                                      pill.key,
                                                      target.field
                                                    )
                                                  }
                                                  className={`rounded-lg border px-2 py-1 text-[10px] font-mono font-bold transition ${
                                                    isCurrent
                                                      ? 'border-zinc-800 bg-zinc-900/50 text-zinc-600 cursor-not-allowed'
                                                      : 'border-purple-500/35 bg-purple-500/10 text-purple-200 hover:bg-purple-500/25 hover:border-purple-400'
                                                  }`}
                                                >
                                                  {target.label}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Kompakte Suchen & Ersetzen Leiste + Sheet-Tab Filter */}
                  <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-zinc-800/90 bg-zinc-900/70 px-2.5 py-2 text-[11px]">
                    <select
                      value={searchTargetField}
                      onChange={(e) => setSearchTargetField(e.target.value)}
                      className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] font-mono text-zinc-200 focus:border-[#00ff66] focus:outline-none"
                      title="Zielfeld für Suchen & Ersetzen"
                    >
                      <option value="all">Alle Textfelder</option>
                      <option value="item_name">Item / Bezeichnung (item_name)</option>
                      <option value="chronological_group">Chrono-Gruppe (chronological_group)</option>
                      <option value="category_group">Category-Gruppe (category_group)</option>
                      <option value="boss_group">Boss-Gruppe (boss_group)</option>
                      <option value="video_chapter">Chapter (video_chapter)</option>
                    </select>

                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Suchen nach..."
                      className="min-w-[110px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-200 placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
                    />

                    <input
                      type="text"
                      value={replaceValue}
                      onChange={(e) => setReplaceValue(e.target.value)}
                      placeholder="Ersetzen durch... (leer = löschen)"
                      className="min-w-[110px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-200 placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
                    />

                    <label className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 cursor-pointer select-none px-1">
                      <input
                        type="checkbox"
                        checked={useRegex}
                        onChange={(e) => setUseRegex(e.target.checked)}
                        className="rounded border-zinc-700 bg-zinc-900 text-[#00ff66] focus:ring-0"
                      />
                      <span>Regex</span>
                    </label>

                    <label className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 cursor-pointer select-none px-1">
                      <input
                        type="checkbox"
                        checked={caseSensitive}
                        onChange={(e) => setCaseSensitive(e.target.checked)}
                        className="rounded border-zinc-700 bg-zinc-900 text-[#00ff66] focus:ring-0"
                      />
                      <span>Aa</span>
                    </label>

                    <button
                      type="button"
                      disabled={
                        actionBusy ||
                        !searchQuery ||
                        searchReplacePreview.matchCount === 0 ||
                        Boolean(searchReplacePreview.regexError)
                      }
                      onClick={handleApplySearchReplace}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#00ff66]/40 bg-[#00ff66]/15 px-2.5 py-1 text-[11px] font-mono font-bold text-[#00ff66] hover:bg-[#00ff66]/25 disabled:opacity-40 transition shrink-0"
                    >
                      🔄 In {searchReplacePreview.matchCount} Treffern ersetzen
                    </button>

                    {/* Schnell-Filter nach Sheet-Type ([1], [2], [3]) */}
                    <div className="inline-flex items-center gap-1 ml-auto border-l border-zinc-800 pl-2">
                      <span className="text-[10px] font-mono text-zinc-500">Tab:</span>
                      {[
                        { id: 'all', label: 'Alle' },
                        { id: '1', label: '[1]' },
                        { id: '2', label: '[2]' },
                        { id: '3', label: '[3]' },
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setActiveSheetFilter(t.id)}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono transition ${
                            activeSheetFilter === t.id
                              ? 'bg-purple-500/25 text-purple-200 border border-purple-400/50 font-bold'
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {searchReplacePreview.regexError && (
                      <span className="w-full text-[10px] font-mono text-red-400">
                        Ungültiger Regex: {searchReplacePreview.regexError}
                      </span>
                    )}
                  </div>

                  {/* Multi-Select Schnell-Leiste über der Tabelle */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] font-mono text-zinc-400">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-zinc-300 hover:text-white">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={handleToggleSelectAllVisible}
                          className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-[#00ff66] focus:ring-0"
                        />
                        <span>
                          Alle sichtbaren auswählen ({visibleCreatorRows.length})
                        </span>
                      </label>
                      {selectedRowIds.size > 0 && (
                        <>
                          <span className="text-[#00ff66] font-bold">
                            · {selectedRowIds.size} markiert
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedRowIds(new Set())}
                            className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300 hover:text-white border border-zinc-700"
                          >
                            Auswahl aufheben
                          </button>
                        </>
                      )}
                    </div>
                    <span className="text-zinc-500">
                      Tipp: Button <strong className="text-zinc-300">⤵</strong> in einer Zeile wählt ab dieser Zeile abwärts alle sichtbaren Zeilen aus
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] font-mono border-collapse min-w-[780px] sm:min-w-0">
                      <thead>
                        <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider select-none">
                          {/* Multi-Select Header Checkbox */}
                          <th className="py-2 px-1 w-12">
                            <div className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                onChange={handleToggleSelectAllVisible}
                                title="Alle sichtbaren Zeilen auswählen / abwählen"
                                className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-[#00ff66] cursor-pointer focus:ring-0"
                              />
                              <span className="text-[9px] text-zinc-500">⤵</span>
                            </div>
                          </th>
                          <th
                            onClick={() => handleToggleSort('guide_id')}
                            className="py-2 px-1 w-10 sm:w-12 cursor-pointer hover:text-white transition"
                            title="Nach ID sortieren"
                          >
                            <span className="inline-flex items-center gap-0.5">
                              <span>ID</span>
                              {sortField === 'guide_id' && (
                                <span className="text-[#00ff66]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </span>
                          </th>
                          <th
                            onClick={() => handleToggleSort('item_name')}
                            className="py-2 px-1 cursor-pointer hover:text-white transition"
                            title="Nach Item / Bezeichnung sortieren"
                          >
                            <span className="inline-flex items-center gap-1">
                              <span>Item / Bezeichnung</span>
                              {sortField === 'item_name' && (
                                <span className="text-[#00ff66]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </span>
                          </th>
                          <th
                            onClick={() => handleToggleSort('chronological_group')}
                            className="py-2 px-1 w-24 cursor-pointer hover:text-white transition"
                            title="Nach Chronological-Group sortieren"
                          >
                            <span className="inline-flex items-center gap-1">
                              <span>Chrono</span>
                              {sortField === 'chronological_group' && (
                                <span className="text-[#00ff66]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </span>
                          </th>
                          <th
                            onClick={() => handleToggleSort('category_group')}
                            className="py-2 px-1 w-24 cursor-pointer hover:text-white transition"
                            title="Nach Category-Group sortieren"
                          >
                            <span className="inline-flex items-center gap-1">
                              <span>Category</span>
                              {sortField === 'category_group' && (
                                <span className="text-[#00ff66]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </span>
                          </th>
                          <th
                            onClick={() => handleToggleSort('boss_group')}
                            className="py-2 px-1 w-24 cursor-pointer hover:text-white transition"
                            title="Nach Boss-Group sortieren"
                          >
                            <span className="inline-flex items-center gap-1">
                              <span>Boss</span>
                              {sortField === 'boss_group' && (
                                <span className="text-[#00ff66]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </span>
                          </th>
                          <th
                            onClick={() => handleToggleSort('timestamp')}
                            className="py-2 px-1 w-24 cursor-pointer hover:text-white transition"
                            title="Numerisch nach Zeit (Sekunden) sortieren"
                          >
                            <span className="inline-flex items-center gap-1">
                              <span>Zeit</span>
                              {sortField === 'timestamp' && (
                                <span className="text-[#00ff66]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </span>
                          </th>
                          <th
                            onClick={() => handleToggleSort('video_chapter')}
                            className="py-2 px-1 w-[52ch] min-w-[260px] sm:min-w-[320px] cursor-pointer hover:text-white transition"
                            title="Nach Chapter / Info sortieren"
                          >
                            <span className="inline-flex items-center gap-1">
                              <span>Chapter</span>
                              {sortField === 'video_chapter' && (
                                <span className="text-[#00ff66]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </span>
                          </th>
                          <th
                            onClick={() => handleToggleSort('trophy_id')}
                            className="py-2 px-1 w-16 sm:w-20 cursor-pointer hover:text-white transition"
                            title="Nach Trophy ID sortieren"
                          >
                            <span className="inline-flex items-center gap-1">
                              <span>Trophy</span>
                              {sortField === 'trophy_id' && (
                                <span className="text-[#00ff66]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                              )}
                            </span>
                          </th>
                          <th className="py-2 px-1 w-12 text-right">Aktion</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {visibleCreatorRows.map((row) => {
                          const isActive = row.id === activeRowId;
                          const isSelected = selectedRowIds.has(row.id);
                          const itemNameStr = getLocalizedItemName(row.item_name);
                          const chronoStr = getLocalizedItemName(row.chronological_group);
                          const categoryStr = getLocalizedItemName(row.category_group);
                          const bossStr = getLocalizedItemName(row.boss_group);
                          const chapterStr = getLocalizedItemName(row.video_chapter);

                          return (
                            <tr
                              key={row.id}
                              onClick={() => setActiveRowId(row.id)}
                              className={`transition cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-500/15 hover:bg-emerald-500/20'
                                  : isActive
                                    ? 'bg-[#00ff66]/10'
                                    : 'hover:bg-zinc-800/40'
                              }`}
                            >
                              {/* Checkbox + Ab dieser Zeile abwärts auswählen */}
                              <td
                                className="py-1 px-1 whitespace-nowrap"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="inline-flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleToggleSelectRow(row.id)}
                                    className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-[#00ff66] cursor-pointer focus:ring-0"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSelectFromRowDownwards(row.id)}
                                    title="Ab dieser Zeile abwärts alle sichtbaren Zeilen auswählen / abwählen"
                                    className="rounded px-1 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-[#00ff66] transition"
                                  >
                                    ⤵
                                  </button>
                                </div>
                              </td>

                              {/* guide_id */}
                              <td className="py-1 px-1">
                                <input
                                  type="text"
                                  value={row.guide_id ?? ''}
                                  onChange={(e) => handleUpdateRowField(row.id, 'guide_id', e.target.value)}
                                  className="w-8 sm:w-10 rounded border border-transparent bg-transparent px-0.5 py-0.5 text-zinc-300 hover:border-zinc-700 focus:border-[#00ff66] focus:bg-zinc-900 focus:outline-none"
                                />
                              </td>

                              {/* item_name */}
                              <td className="py-1 px-1">
                                <input
                                  type="text"
                                  value={itemNameStr}
                                  onChange={(e) => handleUpdateRowField(row.id, 'item_name', e.target.value)}
                                  className="w-full min-w-[7rem] sm:min-w-[8rem] rounded border border-transparent bg-transparent px-1 py-0.5 font-sans text-xs font-medium text-white hover:border-zinc-700 focus:border-[#00ff66] focus:bg-zinc-900 focus:outline-none"
                                />
                              </td>

                              {/* chronological_group */}
                              <td className="py-1 px-1">
                                <input
                                  type="text"
                                  value={chronoStr}
                                  placeholder="—"
                                  onChange={(e) => handleUpdateRowField(row.id, 'chronological_group', e.target.value)}
                                  className="w-full min-w-[4rem] sm:min-w-[5rem] rounded border border-transparent bg-transparent px-1 py-0.5 text-zinc-300 placeholder-zinc-600 hover:border-zinc-700 focus:border-[#00ff66] focus:bg-zinc-900 focus:outline-none"
                                />
                              </td>

                              {/* category_group */}
                              <td className="py-1 px-1">
                                <input
                                  type="text"
                                  value={categoryStr}
                                  placeholder="—"
                                  onChange={(e) => handleUpdateRowField(row.id, 'category_group', e.target.value)}
                                  className="w-full min-w-[4rem] sm:min-w-[5rem] rounded border border-transparent bg-transparent px-1 py-0.5 text-purple-200 placeholder-zinc-600 hover:border-zinc-700 focus:border-[#00ff66] focus:bg-zinc-900 focus:outline-none"
                                />
                              </td>

                              {/* boss_group */}
                              <td className="py-1 px-1">
                                <input
                                  type="text"
                                  value={bossStr}
                                  placeholder="—"
                                  onChange={(e) => handleUpdateRowField(row.id, 'boss_group', e.target.value)}
                                  className="w-full min-w-[4rem] sm:min-w-[5rem] rounded border border-transparent bg-transparent px-1 py-0.5 text-amber-200 placeholder-zinc-600 hover:border-zinc-700 focus:border-[#00ff66] focus:bg-zinc-900 focus:outline-none"
                                />
                              </td>

                              {/* timestamp */}
                              <td className="py-1 px-1 whitespace-nowrap">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveRowId(row.id);
                                      if (row.video_url) setActiveVideoUrl(row.video_url);
                                      if (row.timestamp) setActiveTimestamp(row.timestamp);
                                    }}
                                    title="Video an dieser Position abspielen"
                                    className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-[#00ff66] hover:bg-[#00ff66]/20 border border-zinc-700"
                                  >
                                    ▶
                                  </button>
                                  <input
                                    type="text"
                                    value={row.timestamp ?? ''}
                                    onChange={(e) => handleUpdateRowField(row.id, 'timestamp', e.target.value)}
                                    placeholder="0:00"
                                    className="w-14 rounded border border-transparent bg-transparent px-1 py-0.5 text-[10px] font-mono text-[#00ff66] hover:border-zinc-700 focus:border-[#00ff66] focus:bg-zinc-900 focus:outline-none"
                                  />
                                </div>
                              </td>

                              {/* video_chapter */}
                              <td
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveRowId(row.id);
                                  if (row.video_url) setActiveVideoUrl(row.video_url);
                                  if (row.timestamp) setActiveTimestamp(row.timestamp);
                                }}
                                className="py-1 px-1 text-zinc-400 text-[10px] w-[52ch] min-w-[260px] sm:min-w-[320px] cursor-pointer hover:text-white hover:underline align-middle"
                                title={`${chapterStr || '—'} (Klicken zum Abspielen)`}
                              >
                                <div className="break-words line-clamp-2 leading-snug">
                                  {chapterStr
                                    ? chapterStr.length > 100
                                      ? `${chapterStr.slice(0, 100)}…`
                                      : chapterStr
                                    : '—'}
                                </div>
                              </td>

                              {/* trophy_id */}
                              <td className="py-1 px-1">
                                <input
                                  type="text"
                                  placeholder="—"
                                  value={row.trophy_id ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleUpdateRowField(row.id, 'trophy_id', val);
                                    handleUpdateRowField(row.id, 'is_trophy_relevant', val ? 'ja' : null);
                                  }}
                                  className={`w-full rounded border px-1 py-0.5 text-[10px] focus:outline-none ${
                                    row.trophy_id
                                      ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66] font-bold'
                                      : 'border-transparent bg-transparent text-zinc-400 hover:border-zinc-700 focus:border-[#00ff66] focus:bg-zinc-900'
                                  }`}
                                />
                              </td>

                              {/* Actions */}
                              <td className="py-1 px-1 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-0.5">
                                  <button
                                    type="button"
                                    title="Ganzes Video / Chapter entfernen"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteVideoChapter(row.video_chapter, row.video_url);
                                    }}
                                    className="rounded p-1 text-[10px] text-zinc-500 hover:bg-amber-500/20 hover:text-amber-400"
                                  >
                                    🎬
                                  </button>
                                  <button
                                    type="button"
                                    title="Zeile löschen"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteRow(row.id);
                                    }}
                                    className="rounded p-1 text-zinc-500 hover:bg-red-500/20 hover:text-red-400"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ==================== 2. FLOATING BATCH-BAR (WENN ZEILEN AUSGEWÄHLT SIND) ==================== */}
                {selectedRowIds.size > 0 && (
                  <div className="fixed bottom-4 left-3 right-3 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:w-[820px] z-50 rounded-2xl border-2 border-[#00ff66] bg-[#101412]/95 backdrop-blur-md p-3 shadow-2xl shadow-black/80 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-lg bg-[#00ff66] px-2.5 py-1 text-xs font-mono font-bold text-black">
                          ☑️ {selectedRowIds.size} Zeilen markiert
                        </span>
                        <button
                          type="button"
                          onClick={handleToggleSelectAllVisible}
                          className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] font-mono text-zinc-200 hover:border-[#00ff66]/50"
                        >
                          {allVisibleSelected
                            ? 'Sichtbare abwählen'
                            : `Alle sichtbaren (${visibleCreatorRows.length})`}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedRowIds(new Set())}
                          className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-mono text-zinc-400 hover:text-white"
                        >
                          ✕ Auswahl aufheben
                        </button>
                      </div>

                      <span className="text-[10px] font-mono text-zinc-400">
                        1-Klick Batch-Überschreiben:
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {/* 1-Klick Dropdown: chronological_group */}
                      <select
                        value=""
                        disabled={actionBusy}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          if (val === '__CUSTOM__') {
                            setBatchCustomField('chronological_group');
                            setBatchCustomValue('');
                          } else if (val === '__CLEAR__') {
                            handleBatchOverwriteSelected('chronological_group', '');
                          } else {
                            handleBatchOverwriteSelected('chronological_group', val);
                          }
                        }}
                        className="rounded-xl border border-cyan-500/40 bg-zinc-900 px-2.5 py-1.5 text-xs font-mono text-cyan-200 focus:border-[#00ff66] focus:outline-none"
                      >
                        <option value="">⏱️ Chrono-Group setzen…</option>
                        <option value="__CUSTOM__">✏️ + Neue Chrono-Group eingeben…</option>
                        <option value="__CLEAR__">🗑️ (Chrono-Group leeren)</option>
                        {groupStats.chronoPills
                          .filter((p) => !p.isEmpty)
                          .map((p) => (
                            <option key={p.key} value={p.rawValue}>
                              {p.label} ({p.count})
                            </option>
                          ))}
                      </select>

                      {/* 1-Klick Dropdown: category_group */}
                      <select
                        value=""
                        disabled={actionBusy}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          if (val === '__CUSTOM__') {
                            setBatchCustomField('category_group');
                            setBatchCustomValue('');
                          } else if (val === '__CLEAR__') {
                            handleBatchOverwriteSelected('category_group', '');
                          } else {
                            handleBatchOverwriteSelected('category_group', val);
                          }
                        }}
                        className="rounded-xl border border-purple-500/40 bg-zinc-900 px-2.5 py-1.5 text-xs font-mono text-purple-200 focus:border-[#00ff66] focus:outline-none"
                      >
                        <option value="">🗂️ Category-Group setzen…</option>
                        <option value="__CUSTOM__">✏️ + Neue Category-Group eingeben…</option>
                        <option value="__CLEAR__">🗑️ (Category-Group leeren)</option>
                        {groupStats.categoryPills
                          .filter((p) => !p.isEmpty)
                          .map((p) => (
                            <option key={p.key} value={p.rawValue}>
                              {p.label} ({p.count})
                            </option>
                          ))}
                      </select>

                      {/* 1-Klick Dropdown: boss_group */}
                      <select
                        value=""
                        disabled={actionBusy}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          if (val === '__CUSTOM__') {
                            setBatchCustomField('boss_group');
                            setBatchCustomValue('');
                          } else if (val === '__CLEAR__') {
                            handleBatchOverwriteSelected('boss_group', '');
                          } else {
                            handleBatchOverwriteSelected('boss_group', val);
                          }
                        }}
                        className="rounded-xl border border-amber-500/40 bg-zinc-900 px-2.5 py-1.5 text-xs font-mono text-amber-200 focus:border-[#00ff66] focus:outline-none"
                      >
                        <option value="">⚔️ Boss-Group setzen…</option>
                        <option value="__CUSTOM__">✏️ + Neue Boss-Group eingeben…</option>
                        <option value="__CLEAR__">🗑️ (Boss-Group leeren)</option>
                        {groupStats.bossPills
                          .filter((p) => !p.isEmpty)
                          .map((p) => (
                            <option key={p.key} value={p.rawValue}>
                              {p.label} ({p.count})
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Freitext-Eingabe für neue Gruppe in der Batch-Bar */}
                    {batchCustomField && (
                      <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
                        <span className="text-[10px] font-mono text-[#00ff66] shrink-0">
                          {batchCustomField === 'category_group'
                            ? 'Neue Category-Group:'
                            : batchCustomField === 'boss_group'
                              ? 'Neue Boss-Group:'
                              : 'Neue Chrono-Group:'}
                        </span>
                        <input
                          type="text"
                          value={batchCustomValue}
                          onChange={(e) => setBatchCustomValue(e.target.value)}
                          placeholder="Gruppenname eingeben..."
                          autoFocus
                          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs text-white focus:border-[#00ff66] focus:outline-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleBatchOverwriteSelected(batchCustomField, batchCustomValue);
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() =>
                            handleBatchOverwriteSelected(batchCustomField, batchCustomValue)
                          }
                          className="rounded-lg bg-[#00ff66] px-3 py-1 text-xs font-mono font-bold text-black hover:bg-[#00ff66]/90"
                        >
                          Auf {selectedRowIds.size} Zeilen anwenden
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBatchCustomField(null);
                            setBatchCustomValue('');
                          }}
                          className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:text-white"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* E. ACTION-BAR (Freigeben vs. Rohmaterial vs. Löschen) */}
                <div className="sticky bottom-4 z-40 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-800 bg-[#121314]/95 backdrop-blur-md p-3 shadow-xl">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* [✓ Diesen Creator freigeben] (Grün) */}
                    <button
                      type="button"
                      disabled={actionBusy || currentCreatorRows.length === 0}
                      onClick={handleOpenApproveModal}
                      className="flex items-center gap-2 rounded-xl bg-[#00ff66] px-4 py-2.5 text-xs font-bold text-black hover:bg-[#00ff66]/90 disabled:opacity-50 transition shadow-lg shadow-[#00ff66]/10"
                    >
                      <span>✓</span>
                      <span>
                        {activeDataSource === 'rohmaterial'
                          ? 'Multi-Tab Guide jetzt freigeben'
                          : 'Diesen Creator freigeben'}
                      </span>
                    </button>

                    {/* [📦 Großes Spiel -> Rohmaterial (Multi-Tab)] (Lila/Blau, Sofort-Aktion ohne Confirm) */}
                    {activeDataSource === 'staging' && (
                      <button
                        type="button"
                        disabled={actionBusy || currentCreatorRows.length === 0}
                        onClick={handleMoveToRohmaterial}
                        title="Verschiebt das Spiel ohne Rückfrage sofort zu Rohmaterial (Multi-Tab) und springt zum nächsten Spiel"
                        className="flex items-center gap-2 rounded-xl border border-purple-500/50 bg-purple-600/20 px-3.5 py-2.5 text-xs font-bold text-purple-200 hover:bg-purple-600/35 hover:border-purple-400 disabled:opacity-50 transition shadow-lg shadow-purple-500/10"
                      >
                        <span>📦</span>
                        <span>Großes Spiel -&gt; Rohmaterial (Multi-Tab)</span>
                      </button>
                    )}

                    {/* [✕ Creator verwerfen] (Orange) */}
                    {creatorTabs.length > 1 && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={handleDiscardCreator}
                        className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 transition"
                      >
                        <span>✕</span>
                        <span>Creator verwerfen</span>
                      </button>
                    )}
                  </div>

                  {/* [🗑️ Komplettes Spiel löschen] (Rot) */}
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => handleDeleteWholeGame(selectedGameId)}
                    className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition"
                  >
                    <span>🗑️</span>
                    <span>Komplettes Spiel löschen</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-2xl border border-zinc-800 bg-[#121314] text-xs font-mono text-zinc-500">
                Wähle ein Spiel aus der linken Liste aus.
              </div>
            )}
          </div>

          {/* ==================== D. RECHTE SPALTE: Parallele Trophäen-Ansicht (3 Cols) ==================== */}
          <div className="lg:col-span-3 flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-[#121314] p-3 max-h-[calc(100vh-160px)] overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-zinc-800/80 pb-2.5 px-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">Trophäen ({gameTrophies.length})</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    Referenz-Abgleich & Tipps
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <select
                    value={trophyLang}
                    onChange={(e) => setTrophyLang(e.target.value)}
                    className="rounded bg-zinc-900 border border-zinc-700 px-1.5 py-0.5 text-[10px] font-mono text-zinc-200 focus:border-[#00ff66] focus:outline-none"
                    title="Sprache für Trophäentexte & Tipps"
                  >
                    <option value="de">DE 🇩🇪</option>
                    <option value="en">EN 🇬🇧</option>
                    <option value="es">ES 🇪🇸</option>
                    <option value="fr">FR 🇫🇷</option>
                    <option value="it">IT 🇮🇹</option>
                    <option value="ja">JA 🇯🇵</option>
                    <option value="pt">PT 🇵🇹</option>
                  </select>
                  {activeRowId && (
                    <span className="text-[9px] font-mono text-[#00ff66] bg-[#00ff66]/10 px-1.5 py-0.5 rounded border border-[#00ff66]/30">
                      Zuordnung bereit
                    </span>
                  )}
                </div>
              </div>

              {/* Button: Alle Guide-Tipps komplett löschen */}
              {gameTrophies.some((t) => Boolean(getLocalizedGuideTip(t.guide_tip, trophyLang))) && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={handleClearAllTrophyGuideTips}
                  title={`Alle Guide-Tipps dieses Spiels in [${trophyLang.toUpperCase()}] komplett löschen`}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-red-500/35 bg-red-500/10 px-2.5 py-1 text-[10px] font-mono font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-40 transition"
                >
                  <span>🗑️</span>
                  <span>Alle Guide-Tipps ({trophyLang.toUpperCase()}) komplett löschen</span>
                </button>
              )}
            </div>

            {loadingTrophies ? (
              <div className="py-8 text-center text-xs font-mono text-zinc-500 animate-pulse">
                Trophäen laden…
              </div>
            ) : gameTrophies.length === 0 ? (
              <div className="py-8 text-center text-xs font-mono text-zinc-500">
                Keine Trophäen für dieses Spiel in DB.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
                {gameTrophies.map((trophy) => (
                  <TrophyDraftItem
                    key={trophy.platform_achievement_id || trophy.id}
                    trophy={trophy}
                    activeRowId={activeRowId}
                    trophyLang={trophyLang}
                    onAssign={handleAssignTrophyToActiveRow}
                    onSaveGuideTip={handleSaveTrophyGuideTip}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Guide-Freigabe Bestätigen Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#16181a] p-5 shadow-2xl flex flex-col gap-4 text-zinc-200">
            <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Guide-Freigabe bestätigen
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Spiels: <span className="text-white font-medium">{getLocalizedTitle(selectedGame?.spieltitel)}</span>
                  <br />
                  Creator: <span className="text-[#00ff66] font-mono">{selectedCreatorName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="text-zinc-500 hover:text-white text-base leading-none p-1"
              >
                ✕
              </button>
            </div>

            {/* Pflichtfeld 1: Guide-Sprache */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span>1. Target Guide-Sprache (Pflichtfeld)</span>
                {approveLocale ? (
                  <span className="text-[10px] font-mono text-[#00ff66] font-bold">✓ {approveLocale.toUpperCase()} gewählt</span>
                ) : (
                  <span className="text-[10px] font-mono text-amber-400">Sprache wählen!</span>
                )}
              </label>

              {/* Schnellwahl Buttons */}
              <div className="flex flex-wrap gap-1.5">
                {['de', 'en', 'es', 'fr', 'ja', 'pt', 'it'].map((code) => {
                  const isSelected = approveLocale === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setApproveLocale(code)}
                      className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold uppercase transition ${
                        isSelected
                          ? 'bg-[#00ff66] text-black border border-[#00ff66]'
                          : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white'
                      }`}
                    >
                      {code}
                    </button>
                  );
                })}
              </div>

              {/* Alle weiteren Sprachen Dropdown */}
              <select
                value={approveLocale}
                onChange={(e) => setApproveLocale(e.target.value)}
                className="mt-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 font-mono focus:border-[#00ff66] focus:outline-none"
              >
                <option value="">-- Alle Sprachen durchsuchen --</option>
                {localeOptions().map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.flag} {opt.label} ({opt.code.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {/* Pflichtfeld 2: Spiel-Typ */}
            <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
              <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span>2. Spiel-Typ (Max. 2, Mind. 1)</span>
                <span className="text-[10px] font-mono text-zinc-500">
                  {selectedGameTypes.length}/2 gewählt
                </span>
              </label>

              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-zinc-900/60 rounded-xl border border-zinc-800">
                {Object.values(GAME_TYPE).map((type) => {
                  const isChecked = selectedGameTypes.includes(type);
                  const isDisabled = !isChecked && selectedGameTypes.length >= 2;

                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        if (isChecked) {
                          setSelectedGameTypes((prev) => prev.filter((t) => t !== type));
                        } else if (selectedGameTypes.length < 2) {
                          setSelectedGameTypes((prev) => [...prev, type]);
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[11px] transition ${
                        isChecked
                          ? 'bg-[#00ff66]/20 text-[#00ff66] border border-[#00ff66]/50 font-bold'
                          : isDisabled
                            ? 'opacity-30 cursor-not-allowed bg-zinc-800 text-zinc-500 border border-transparent'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white'
                      }`}
                    >
                      <span>{isChecked ? '✓' : '+'}</span>
                      <span>{type}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3 mt-1">
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                Abbrechen
              </button>

              <button
                type="button"
                disabled={actionBusy || !approveLocale || selectedGameTypes.length === 0}
                onClick={handleApproveCreatorConfirm}
                className="flex items-center gap-1.5 rounded-xl bg-[#00ff66] px-4 py-2 text-xs font-bold text-black hover:bg-[#00ff66]/90 disabled:opacity-40 transition shadow-lg shadow-[#00ff66]/10"
              >
                <span>✓</span>
                <span>
                  {approveLocale ? `Jetzt in [${approveLocale.toUpperCase()}] freigegeben` : 'Sprache wählen…'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
