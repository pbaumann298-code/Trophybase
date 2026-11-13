import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import { SUPPORTED_LOCALES } from '../../lib/locale';
import { localeOptions } from '../../lib/uiStrings';
import { intranetGameHref } from '../../lib/intranetQueries';
import { pullGameBackToDrafts } from '../../lib/intranetGameEdits';
import { buildSupabaseTableUrl } from '../../lib/supabaseDeepLink';

const VIEW = 'v_krankenstation_denglisch_guides';
const READ_RPC = 'tb_get_krankenstation_language_audit';
const RESOLVE_RPC = 'tb_resolve_krankenstation_language';
const REFRESH_RPC = 'tb_refresh_krankenstation_language_cache';
const ROW_LIMIT = 2000;

const COLUMNS = [
  'row_uuid',
  'game_id',
  'spieltitel',
  'spiel_typ',
  'hardware',
  'published_locales',
  'verdachts_zeilen_im_spiel',
  'guide_id',
  'trophy_id',
  'text_de',
  'text_en',
  'group_de',
  'group_en',
  'issue_type',
  'checked_lang',
  'detected_lang',
  'checked_text',
  'video_title',
  'video_url',
  'sony_trophy_name',
  'sony_localized_pct',
  'total_rows_in_game',
  'creator_name',
  'game_slug',
].join(', ');

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

const LANG_META = {
  de: { flag: '🇩🇪', label: 'Deutsch' },
  en: { flag: '🇬🇧', label: 'Englisch' },
  es: { flag: '🇪🇸', label: 'Spanisch' },
  pl: { flag: '🇵🇱', label: 'Polnisch' },
  fr: { flag: '🇫🇷', label: 'Französisch' },
  pt: { flag: '🇵🇹', label: 'Portugiesisch' },
  it: { flag: '🇮🇹', label: 'Italienisch' },
  nl: { flag: '🇳🇱', label: 'Niederländisch' },
  ru: { flag: '🇷🇺', label: 'Russisch / Kyrillisch' },
  sv: { flag: '🇸🇪', label: 'Schwedisch' },
  fi: { flag: '🇫🇮', label: 'Finnisch' },
  ja: { flag: '🇯🇵', label: 'Japanisch' },
  ko: { flag: '🇰🇷', label: 'Koreanisch' },
  'zh-hans': { flag: '🇨🇳', label: 'Chinesisch (Vereinf.)' },
  'zh-hant': { flag: '🇹🇼', label: 'Chinesisch (Trad.)' },
  ar: { flag: '🇸🇦', label: 'Arabisch' },
  east_eu: { flag: '🌍', label: 'Osteuropäisch (CS/SK/HU/RO)' },
};

const ISSUE_META = {
  FOREIGN_VIDEO_OUTLIER: {
    badge: '🎬 Fremdsprachen-Video / Creator-Bug',
    shortBadge: '🎬 Video-Bug',
    tone: 'border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-200',
  },
  WRONG_RELEASE_LANG: {
    badge: '🚨 Falsche Freigabe-Sprache',
    shortBadge: '🚨 Freigabe-Sprache',
    tone: 'border-red-500/50 bg-red-500/15 text-red-200',
  },
  UNTRANSLATED_TEXT: {
    badge: '🇬🇧 EN-Text trotz Sony-Lokalisierung',
    shortBadge: '🇬🇧 EN-Text',
    tone: 'border-amber-500/50 bg-amber-500/15 text-amber-200',
  },
};

const TARGET_LOCALE_OPTIONS = (() => {
  const byCode = new Map(localeOptions().map((opt) => [opt.code, opt]));
  const priority = ['en', 'de', 'pl', 'es', 'fr', 'pt', 'it', 'nl', 'ru', 'sv', 'fi', 'ja', 'ko', 'zh-hans', 'zh-hant', 'ar'];
  return priority.map((code) => byCode.get(code)).filter(Boolean);
})();

function formatLangBadge(code) {
  const key = String(code ?? '').trim().toLowerCase();
  if (!key) return '—';
  const meta = LANG_META[key];
  if (meta) {
    return key === 'east_eu' ? `${meta.flag} ${meta.label}` : `${meta.flag} ${key.toUpperCase()} (${meta.label})`;
  }
  return key.toUpperCase();
}

function formatLangShort(code) {
  const key = String(code ?? '').trim().toLowerCase();
  if (!key) return '—';
  const meta = LANG_META[key];
  if (key === 'east_eu') return '🌍 OST-EU';
  return meta ? `${meta.flag} ${key.toUpperCase()}` : key.toUpperCase();
}

function resolveDefaultMoveTarget(checkedLang, detectedLang) {
  const from = String(checkedLang ?? 'de').trim().toLowerCase();
  const det = String(detectedLang ?? '').trim().toLowerCase();
  if (SUPPORTED_LOCALES.includes(det) && det !== from) return det;
  return from === 'en' ? 'de' : 'en';
}

function cellText(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

function withoutRow(list, rowUuid) {
  const hit = list.find((row) => row.row_uuid === rowUuid);
  if (!hit) return list;
  return list
    .filter((row) => row.row_uuid !== rowUuid)
    .map((row) => (
      row.game_id === hit.game_id
        ? {
            ...row,
            verdachts_zeilen_im_spiel: Math.max(0, Number(row.verdachts_zeilen_im_spiel || 0) - 1),
          }
        : row
    ));
}

function restoreRows(list, removed) {
  if (!removed?.length) return list;
  const present = new Set(list.map((row) => row.row_uuid));
  const missing = removed.filter((row) => row?.row_uuid && !present.has(row.row_uuid));
  if (!missing.length) return list;
  const gameId = missing[0].game_id;
  const siblingsLeft = list.some((row) => row.game_id === gameId);
  if (!siblingsLeft) return [...missing, ...list];
  const bumped = list.map((row) => (
    row.game_id === gameId
      ? {
          ...row,
          verdachts_zeilen_im_spiel: Number(row.verdachts_zeilen_im_spiel || 0) + missing.length,
        }
      : row
  ));
  return [...missing, ...bumped];
}

function ActionButton({ children, title, onClick, disabled = false, tone = 'sky' }) {
  const toneClass = tone === 'green'
    ? 'border-[#00ff66]/40 text-[#00ff66] hover:bg-[#00ff66]/10'
    : tone === 'red'
      ? 'border-red-500/40 text-red-300 hover:bg-red-500/10'
      : tone === 'amber'
        ? 'border-amber-500/40 text-amber-200 hover:bg-amber-500/10'
        : 'border-sky-500/40 text-sky-200 hover:bg-sky-500/10';
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border bg-zinc-950/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

/**
 * Krankenstation: Sony-bewusster Sprach-, Freigabe- & Creator-Video-Check.
 * - Ignoriert Spiele, für die Sony in der Freigabe-Sprache keine Übersetzung liefert.
 * - Erkennt Admin-Freigabefehler (z. B. ES/PL/EN als DE freigegeben oder DE als EN).
 * - Erkennt einzelne fremdsprachige Creator-Videos (insb. Osteuropäisch / Kyrillisch / ES / PL / DE).
 */
export default function IntranetKrankenstation({ reloadToken = 0, onCount, onOpenInDrafts }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [capped, setCapped] = useState(false);
  const [issueFilter, setIssueFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [targetLangByGame, setTargetLangByGame] = useState({});
  const [pullBackConfirmId, setPullBackConfirmId] = useState(null);
  const [pullingBackGameId, setPullingBackGameId] = useState(null);
  const rowsRef = useRef([]);

  const commit = useCallback((next) => {
    rowsRef.current = next;
    setRows(next);
    onCount?.(next.length);
  }, [onCount]);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const rpcRes = await supabase.rpc(READ_RPC, { p_limit: ROW_LIMIT });
      let res = rpcRes;
      if (rpcRes.error) {
        res = await supabase
          .from(VIEW)
          .select(COLUMNS)
          .limit(ROW_LIMIT);
      }
      if (res.error) {
        setError(res.error.message || 'Sprachprüfung konnte nicht geladen werden.');
        commit([]);
      } else {
        const next = res.data ?? [];
        setError('');
        setCapped(next.length >= ROW_LIMIT);
        commit(next);
      }
    } finally {
      setLoading(false);
    }
  }, [commit]);

  useEffect(() => {
    let cancelled = false;
    loadAudit();
    return () => {
      cancelled = true;
    };
  }, [reloadToken, loadAudit]);

  const handleRefreshCache = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError('');
    setNotice('');
    try {
      const { data, error: rpcErr } = await supabase.rpc(REFRESH_RPC);
      if (rpcErr) {
        setError(rpcErr.message || 'Cache-Aktualisierung fehlgeschlagen.');
      } else {
        setNotice(`⚡ Cache erfolgreich aktualisiert (${data ?? 0} Einträge analysiert).`);
        await loadAudit();
      }
    } catch (e) {
      setError(e?.message || 'Cache-Aktualisierung fehlgeschlagen.');
    } finally {
      setRefreshing(false);
    }
  };

  const counts = useMemo(() => {
    const acc = {
      ALL: rows.length,
      FOREIGN_VIDEO_OUTLIER: 0,
      WRONG_RELEASE_LANG: 0,
      UNTRANSLATED_TEXT: 0,
    };
    for (const row of rows) {
      const t = String(row.issue_type || 'UNTRANSLATED_TEXT');
      if (acc[t] != null) acc[t] += 1;
    }
    return acc;
  }, [rows]);

  const games = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groups = new Map();

    for (const row of rows) {
      const issueType = String(row.issue_type || 'UNTRANSLATED_TEXT');
      if (issueFilter !== 'ALL' && issueType !== issueFilter) continue;

      if (q) {
        const hay = [
          row.spieltitel,
          row.creator_name,
          row.checked_lang,
          row.detected_lang,
          row.checked_text,
          row.video_title,
          row.sony_trophy_name,
          row.text_de,
          row.text_en,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) continue;
      }

      const id = String(row.game_id ?? '');
      if (!id) continue;
      let group = groups.get(id);
      if (!group) {
        const checkedLang = String(row.checked_lang || 'de').toLowerCase();
        const detectedCounts = new Map();
        group = {
          game_id: id,
          spieltitel: cellText(row.spieltitel),
          spiel_typ: cellText(row.spiel_typ),
          hardware: cellText(row.hardware),
          game_slug: row.game_slug || '',
          published_locales: Array.isArray(row.published_locales) ? row.published_locales : [],
          checked_lang: checkedLang,
          sony_localized_pct: row.sony_localized_pct ?? 100,
          total_rows_in_game: Number(row.total_rows_in_game || 0),
          verdachts_zeilen_im_spiel: Number(row.verdachts_zeilen_im_spiel || 0),
          creator_name: row.creator_name || '',
          issue_type: issueType,
          detectedCounts,
          hasForeignOutlier: false,
          rows: [],
        };
        groups.set(id, group);
      }

      const det = String(row.detected_lang || 'en').toLowerCase();
      group.detectedCounts.set(det, (group.detectedCounts.get(det) || 0) + 1);
      if (det !== 'en') group.hasForeignOutlier = true;
      if (row.issue_type === 'FOREIGN_VIDEO_OUTLIER') {
        group.issue_type = 'FOREIGN_VIDEO_OUTLIER';
      } else if (row.issue_type === 'WRONG_RELEASE_LANG' && group.issue_type !== 'FOREIGN_VIDEO_OUTLIER') {
        group.issue_type = 'WRONG_RELEASE_LANG';
      }
      if (!group.creator_name && row.creator_name) {
        group.creator_name = row.creator_name;
      }
      group.verdachts_zeilen_im_spiel = Math.max(
        group.verdachts_zeilen_im_spiel,
        Number(row.verdachts_zeilen_im_spiel || 0),
      );
      group.rows.push(row);
    }

    const list = [];
    for (const group of groups.values()) {
      group.rows.sort((a, b) => collator.compare(String(a.guide_id ?? ''), String(b.guide_id ?? '')));
      let topDetected = 'en';
      let topCount = -1;
      for (const [det, cnt] of group.detectedCounts.entries()) {
        if (cnt > topCount) {
          topDetected = det;
          topCount = cnt;
        }
      }
      group.primary_detected_lang = topDetected;
      group.default_target_lang = resolveDefaultMoveTarget(group.checked_lang, topDetected);
      list.push(group);
    }

    return list.sort((a, b) => {
      const aPrio = a.hasForeignOutlier ? 2 : a.issue_type === 'WRONG_RELEASE_LANG' ? 1 : 0;
      const bPrio = b.hasForeignOutlier ? 2 : b.issue_type === 'WRONG_RELEASE_LANG' ? 1 : 0;
      return (
        bPrio - aPrio
        || b.verdachts_zeilen_im_spiel - a.verdachts_zeilen_im_spiel
        || collator.compare(a.spieltitel, b.spieltitel)
      );
    });
  }, [rows, issueFilter, search]);

  const resolve = async (gameId, action, rowUuid, fromLang, toLang) => {
    const prev = rowsRef.current;
    const removed = rowUuid
      ? prev.filter((row) => row.row_uuid === rowUuid)
      : prev.filter((row) => row.game_id === gameId);
    if (!removed.length) return;

    commit(rowUuid ? withoutRow(prev, rowUuid) : prev.filter((row) => row.game_id !== gameId));
    setError('');
    setNotice('');

    const { error: rpcError } = await supabase.rpc(RESOLVE_RPC, {
      p_game_id: gameId,
      p_action: action,
      p_row_uuid: rowUuid,
      p_from_lang: fromLang || 'de',
      p_to_lang: toLang || 'en',
    });
    if (rpcError) {
      commit(restoreRows(rowsRef.current, removed));
      setError(rpcError.message || 'Aktion fehlgeschlagen.');
    }
  };

  const handlePullBackToDrafts = async (game) => {
    if (pullingBackGameId) return;
    if (pullBackConfirmId !== game.game_id) {
      setPullBackConfirmId(game.game_id);
      return;
    }
    setPullingBackGameId(game.game_id);
    setPullBackConfirmId(null);
    setError('');
    setNotice('');

    const res = await pullGameBackToDrafts(supabase, game.game_id, game.checked_lang || 'de');
    setPullingBackGameId(null);
    if (!res.ok) {
      setError(res.error?.message || 'Rückholen in Entwürfe fehlgeschlagen.');
      return;
    }
    commit(rowsRef.current.filter((row) => row.game_id !== game.game_id));
    setNotice(`„${game.spieltitel}“ wurde in die Entwürfe zurückgeholt (${res.stagedCount} Zeilen).`);
    onOpenInDrafts?.(game.game_id);
  };

  if (loading && rows.length === 0) {
    return (
      <p className="font-mono text-sm text-zinc-400">
        🌐 Sprach-, Sony- &amp; Creator-Video-Prüfung wird geladen…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-[#121314] p-3.5 space-y-3">
        <p className="text-xs leading-relaxed text-zinc-400">
          Prüft alle freigegebenen Guides gegen die offiziellen <strong className="text-zinc-200">Sony-Sprachdaten</strong>:
          Spiele ohne Sony-Übersetzung in der Zielsprache (0 % lokalisiert) sowie offizielle Sony-Trophäennamen werden
          automatisch herausgefiltert. Angezeigt werden <strong className="text-fuchsia-300">fremdsprachige Creator-Videos</strong>{' '}
          (z. B. Osteuropäisch/Spanisch/Deutsch in falscher Playlist), <strong className="text-red-300">verrutschte Freigabe-Sprachen</strong>{' '}
          und unübersetzte Restzeilen.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: `Alle (${counts.ALL})` },
              { id: 'FOREIGN_VIDEO_OUTLIER', label: `🎬 Video / Fremdsprache (${counts.FOREIGN_VIDEO_OUTLIER})` },
              { id: 'WRONG_RELEASE_LANG', label: `🚨 Falsche Freigabe (${counts.WRONG_RELEASE_LANG})` },
              { id: 'UNTRANSLATED_TEXT', label: `🇬🇧 EN trotz Sony-Lokalisierung (${counts.UNTRANSLATED_TEXT})` },
            ].map((pill) => {
              const active = issueFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setIssueFilter(pill.id)}
                  className={`rounded-xl border px-2.5 py-1 font-mono text-[11px] font-bold transition ${
                    active
                      ? 'border-[#00ff66] bg-[#00ff66]/15 text-[#00ff66]'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto sm:max-w-md">
            <button
              type="button"
              onClick={handleRefreshCache}
              disabled={refreshing || loading}
              title="Aktualisiert den serverseitigen Sprach-Cache"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs font-bold text-zinc-300 transition hover:border-[#00ff66] hover:text-[#00ff66] disabled:opacity-40"
            >
              <span>{refreshing ? '⏳' : '⚡'}</span>
              <span>{refreshing ? 'Prüft…' : 'Cache aktualisieren'}</span>
            </button>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Spiel, Creator, Sprache oder Text filtern…"
              className="min-w-[15rem] flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {capped ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Es werden die ersten {ROW_LIMIT} Verdachtszeilen gezeigt (Fremdsprachen-Videos &amp; komplette Fehlfreigaben zuerst).
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-[#00ff66]/40 bg-[#00ff66]/10 px-3 py-2 text-xs text-[#00ff66]">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      ) : null}
      {!loading && games.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-10 text-center text-xs text-zinc-500">
          Keine Treffer für diesen Filter.
        </p>
      ) : null}

      {games.map((game) => {
        const fromLang = game.checked_lang || 'de';
        const fromUpper = fromLang.toUpperCase();
        const targetLang = targetLangByGame[game.game_id] || game.default_target_lang;
        const targetUpper = targetLang.toUpperCase();
        const issueMeta = ISSUE_META[game.issue_type] || ISSUE_META.UNTRANSLATED_TEXT;
        const guidesDeepUrl = buildSupabaseTableUrl('game_guides', 'game_id', game.game_id);
        const gameHref = game.game_slug
          ? intranetGameHref({ id: game.game_id, slug: game.game_slug, hardware: game.hardware }, fromLang)
          : '';
        const isPullingBack = pullingBackGameId === game.game_id;
        const isConfirmingPullBack = pullBackConfirmId === game.game_id;

        return (
          <article key={game.game_id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#141516]">
            <header className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-3.5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {gameHref ? (
                    <a
                      href={gameHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-bold text-white hover:text-[#00ff66] hover:underline"
                    >
                      {game.spieltitel} ↗
                    </a>
                  ) : (
                    <h3 className="text-sm font-bold text-white">{game.spieltitel}</h3>
                  )}
                  {guidesDeepUrl ? (
                    <a
                      href={guidesDeepUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Direkt in Supabase game_guides öffnen"
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 hover:border-[#00ff66]/50 hover:text-[#00ff66]"
                    >
                      🗄️ DB
                    </a>
                  ) : null}
                  <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${issueMeta.tone}`}>
                    {issueMeta.badge}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-sky-200">
                    {game.hardware}
                  </span>
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    {game.spiel_typ}
                  </span>
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-200">
                    Freigegeben: {formatLangShort(fromLang)}
                  </span>
                  <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-200">
                    Erkannt: {formatLangBadge(game.primary_detected_lang)}
                  </span>
                  {fromLang !== 'en' ? (
                    <span
                      title="Anteil der offiziellen Sony-Trophäen mit eigener Übersetzung in der geprüften Sprache"
                      className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-200"
                    >
                      🏆 Sony {fromUpper}: {game.sony_localized_pct}% lokalisiert
                    </span>
                  ) : null}
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-200">
                    {game.verdachts_zeilen_im_spiel}
                    {game.total_rows_in_game > 0 ? ` / ${game.total_rows_in_game}` : ''} Zeilen
                  </span>
                  {game.creator_name ? (
                    <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                      👤 {game.creator_name}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <div className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-zinc-950/90 p-0.5">
                  <select
                    value={targetLang}
                    aria-label="Zielsprache für Umhängen"
                    onChange={(e) => {
                      const val = e.target.value;
                      setTargetLangByGame((prev) => ({ ...prev, [game.game_id]: val }));
                    }}
                    className="rounded-md bg-zinc-900 px-1.5 py-1 font-mono text-[10px] font-bold text-zinc-100 focus:outline-none"
                  >
                    {TARGET_LOCALE_OPTIONS.filter((opt) => opt.code !== fromLang).map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.flag} {opt.code.toUpperCase()} ({opt.label})
                      </option>
                    ))}
                  </select>
                  <ActionButton
                    title={`Kompletten Guide von ${fromUpper} nach ${targetUpper} umhängen und Stage-1 neu ausführen`}
                    onClick={() => resolve(game.game_id, 'MOVE_LANG', null, fromLang, targetLang)}
                  >
                    ➡️ Ganzen Guide {fromUpper} → {targetUpper}
                  </ActionButton>
                </div>

                <ActionButton
                  tone="amber"
                  disabled={isPullingBack}
                  title="Guide entsperren und zur Korrektur (z. B. falsches Einzelvideo tauschen/löschen) zurück in die Entwürfe holen"
                  onClick={() => handlePullBackToDrafts(game)}
                >
                  {isPullingBack
                    ? '⏳ Holt zurück…'
                    : isConfirmingPullBack
                      ? '⚠️ Wirklich zurück in Entwürfe?'
                      : '📝 In Entwürfe holen'}
                </ActionButton>

                {game.published_locales.length > 1 ? (
                  <ActionButton
                    tone="red"
                    title={`${fromUpper}-Text aller Verdachtszeilen dieses Spiels leeren`}
                    onClick={() => resolve(game.game_id, 'DELETE_LANG', null, fromLang, targetLang)}
                  >
                    🗑️ Alle {fromUpper} leeren
                  </ActionButton>
                ) : null}

                <ActionButton
                  tone="green"
                  title="Alle Verdachtszeilen dieses Spiels dauerhaft als geprüft/korrekt markieren"
                  onClick={() => resolve(game.game_id, 'MARK_OK', null, fromLang, targetLang)}
                >
                  ✅ Ganzes Spiel OK
                </ActionButton>
              </div>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-xs">
                <thead className="bg-[#121314] text-[10px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">ID / Trophy</th>
                    <th className="px-3 py-2 font-medium">Befund</th>
                    <th className="px-3 py-2 font-medium">
                      Guide-Text ({formatLangShort(fromLang)}) &amp; Sony-Referenz
                    </th>
                    <th className="px-3 py-2 font-medium">Video-Chapter &amp; Direkt-Check</th>
                    <th className="px-3 py-2 font-medium text-right">Zeilen-Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {game.rows.map((row) => {
                    const rowFrom = String(row.checked_lang || fromLang).toLowerCase();
                    const rowFromUpper = rowFrom.toUpperCase();
                    const rowDetected = String(row.detected_lang || 'en').toLowerCase();
                    const rowMoveTarget = targetLangByGame[game.game_id] || resolveDefaultMoveTarget(rowFrom, rowDetected);
                    const rowMoveUpper = rowMoveTarget.toUpperCase();
                    const rowIssue = ISSUE_META[row.issue_type] || ISSUE_META.UNTRANSLATED_TEXT;
                    const primaryText = row.checked_text || (rowFrom === 'en' ? row.text_en : row.text_de);
                    const groupLabel = rowFrom === 'en' ? row.group_en : row.group_de;

                    return (
                      <tr key={row.row_uuid} className="border-t border-zinc-800/80 align-top">
                        <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">
                          <div className="text-zinc-200 font-bold">#{cellText(row.guide_id)}</div>
                          <div className="text-[10px] text-zinc-500">Trophy: {cellText(row.trophy_id)}</div>
                        </td>

                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-1">
                            <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold ${rowIssue.tone}`}>
                              {rowIssue.shortBadge}
                            </span>
                            <span className="font-mono text-[10px] text-zinc-400">
                              {formatLangShort(rowFrom)} ≠ {formatLangShort(rowDetected)}
                            </span>
                          </div>
                        </td>

                        <td className="max-w-sm px-3 py-2 space-y-1">
                          <div className="whitespace-pre-wrap text-zinc-100">{cellText(primaryText)}</div>
                          {groupLabel ? (
                            <div className="font-mono text-[10px] text-zinc-500">Gruppe: {groupLabel}</div>
                          ) : null}
                          {row.sony_trophy_name ? (
                            <div className="rounded border border-cyan-500/25 bg-cyan-500/5 px-1.5 py-0.5 font-mono text-[10px] text-cyan-200">
                              🏆 Sony ({rowFromUpper}): {row.sony_trophy_name}
                            </div>
                          ) : null}
                        </td>

                        <td className="max-w-xs px-3 py-2 space-y-1">
                          <div className="whitespace-pre-wrap text-zinc-300">
                            {cellText(row.video_title)}
                          </div>
                          {row.video_url ? (
                            <a
                              href={row.video_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] font-bold text-[#00ff66] hover:border-[#00ff66]/50"
                            >
                              ▶️ Video prüfen ↗
                            </a>
                          ) : null}
                        </td>

                        <td className="px-3 py-2">
                          <div className="flex flex-wrap justify-end gap-1">
                            {rowMoveTarget !== rowFrom ? (
                              <ActionButton
                                title={`Zeile von ${rowFromUpper} nach ${rowMoveUpper} verschieben`}
                                onClick={() => resolve(game.game_id, 'MOVE_LANG', row.row_uuid, rowFrom, rowMoveTarget)}
                              >
                                [➡️ {rowFromUpper}→{rowMoveUpper}]
                              </ActionButton>
                            ) : null}
                            <ActionButton
                              tone="red"
                              title={`${rowFromUpper}-Eintrag dieser Zeile löschen (sofern weitere Sprache existiert)`}
                              onClick={() => resolve(game.game_id, 'DELETE_LANG', row.row_uuid, rowFrom, rowMoveTarget)}
                            >
                              [🗑️ {rowFromUpper} löschen]
                            </ActionButton>
                            <ActionButton
                              tone="green"
                              title="Diese Zeile als geprüft/korrekt markieren"
                              onClick={() => resolve(game.game_id, 'MARK_OK', row.row_uuid, rowFrom, rowMoveTarget)}
                            >
                              [✅ OK]
                            </ActionButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        );
      })}
    </div>
  );
}
