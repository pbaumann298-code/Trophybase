import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import WatchlistProgressBar from '../components/WatchlistProgressBar';
import { gameGuidePath, navigateToGame, navigateToHome } from '../lib/routeUtils';
import { useLocale } from '../context/LocaleContext';
import { SUPPORTED_LOCALES } from '../lib/locale';
import { localeOptions } from '../lib/uiStrings';
import {
  sanitizePreferredLocales,
  useUserPreferences,
} from '../lib/userPreferences';
import { saveCompletedGuideItems } from '../lib/guideProgressStorage';
import { saveUnlockedTrophies } from '../lib/trophyProgressStorage';
import { PROGRESS_SYNCED_EVENT } from '../lib/localUserProgress';
import { fetchAchievementsForGame } from '../lib/achievementQueries';
import {
  normalizeTrophyType,
  TROPHY_TYPE,
  trophyTypeIcon,
  trophyTypeLabel,
} from '../lib/trophyTypes';
import {
  getProfileStatusLabel,
  PROFILE_STATUS,
  registerPsnId,
  regenerateVerificationCode,
  requestPsnVerification,
} from '../lib/profileQueries';
import {
  fetchUserCockpitBundle,
  getUserAreaErrorHint,
  resetUserGuideChecklist,
  saveUserPreferredLocales,
  updateWatchlistEntryStatus,
  upsertUserGameRating,
} from '../lib/userAreaQueries';

const ALL_LANGUAGE_OPTIONS = localeOptions(SUPPORTED_LOCALES);

function StatusBadge({ status }) {
  const styles = {
    [PROFILE_STATUS.verified]: 'bg-[#00ff66]/10 text-[#00ff66] border-[#00ff66]/30',
    [PROFILE_STATUS.pending]: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    [PROFILE_STATUS.verifying]: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    [PROFILE_STATUS.failed]: 'bg-red-500/10 text-red-400 border-red-500/30',
  };

  const resolved = status || PROFILE_STATUS.none;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border ${
        styles[resolved] ?? 'bg-zinc-800/50 text-zinc-400 border-zinc-700'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          resolved === PROFILE_STATUS.verified
            ? 'bg-[#00ff66]'
            : resolved === PROFILE_STATUS.pending || resolved === PROFILE_STATUS.verifying
              ? 'bg-amber-400 animate-pulse'
              : 'bg-zinc-500'
        }`}
      />
      {getProfileStatusLabel(resolved)}
    </span>
  );
}

function StatCard({ icon, label, value, sublabel, accent = false }) {
  return (
    <div
      className={`rounded-xl border p-4 min-w-0 transition ${
        accent
          ? 'border-[#00ff66]/30 bg-gradient-to-br from-[#00ff66]/10 to-[#121314]'
          : 'border-zinc-800 bg-[#121314]'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 truncate">
          {label}
        </p>
        {icon ? <span className="text-sm flex-shrink-0">{icon}</span> : null}
      </div>
      <p
        className={`text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight ${
          accent ? 'text-[#00ff66]' : 'text-white'
        }`}
      >
        {value}
      </p>
      {sublabel ? (
        <p className="text-[11px] text-zinc-500 mt-1 font-mono truncate">{sublabel}</p>
      ) : null}
    </div>
  );
}

function TrophyBreakdownPills({
  earnedTrophies,
  isPlatinum,
  interactivePlatinum = false,
  platinumOpen = false,
  onTogglePlatinumList,
}) {
  const p = Number(earnedTrophies?.platinum ?? (isPlatinum ? 1 : 0));
  const g = Number(earnedTrophies?.gold ?? 0);
  const s = Number(earnedTrophies?.silver ?? 0);
  const b = Number(earnedTrophies?.bronze ?? 0);
  const platinumSrc = trophyTypeIcon(TROPHY_TYPE.PLATINUM);

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
      {interactivePlatinum ? (
        <button
          type="button"
          onClick={onTogglePlatinumList}
          aria-expanded={platinumOpen}
          title="Klicken, um die komplette Trophäenliste dieses Spiels ein-/auszuklappen"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-bold transition cursor-pointer ${
            platinumOpen
              ? 'bg-[#00ff66] text-zinc-950 border-[#00ff66] shadow-md shadow-[#00ff66]/20'
              : p > 0
                ? 'bg-sky-500/15 text-sky-200 border-sky-400/50 hover:border-[#00ff66] hover:text-[#00ff66]'
                : 'bg-zinc-900/90 text-zinc-300 border-zinc-700 hover:border-[#00ff66]/50 hover:text-white'
          }`}
        >
          {platinumSrc ? (
            <img src={platinumSrc} alt="" className="w-4 h-4 object-contain" />
          ) : (
            <span>🏆</span>
          )}
          <span>{p > 0 ? `Platin (${p})` : 'Trophäen'}</span>
          <span className="text-[10px] opacity-80">
            {platinumOpen ? '▴ Liste schließen' : '▾ Alle Trophäen'}
          </span>
        </button>
      ) : (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${
            p > 0
              ? 'bg-sky-500/15 text-sky-300 border-sky-500/40 font-bold'
              : 'bg-zinc-900/70 text-zinc-500 border-zinc-800'
          }`}
          title="Platin-Trophäen"
        >
          🏆 {p}
        </span>
      )}
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-amber-500/10 text-amber-300 border-amber-500/25"
        title="Gold-Trophäen"
      >
        🥇 {g}
      </span>
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-zinc-400/10 text-zinc-300 border-zinc-500/25"
        title="Silber-Trophäen"
      >
        🥈 {s}
      </span>
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-orange-700/15 text-orange-300 border-orange-600/30"
        title="Bronze-Trophäen"
      >
        🥉 {b}
      </span>
    </div>
  );
}

function GameTrophyListDrawer({ game, gameId, locale }) {
  const [trophies, setTrophies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const { data, error: fetchErr } = await fetchAchievementsForGame(
        supabase,
        game || gameId,
        locale,
        null,
        { textFallback: true },
      );
      if (cancelled) return;
      if (fetchErr) {
        setError(fetchErr.message || 'Trophäen konnten nicht geladen werden.');
        setTrophies([]);
      } else {
        setTrophies(data ?? []);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [game, gameId, locale]);

  if (loading) {
    return (
      <div className="mt-3 rounded-xl border border-zinc-800 bg-[#0d0e0f] p-4 text-center text-xs font-mono text-zinc-400 animate-pulse">
        Lade komplette Trophäenliste aus game_achievements…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-mono text-red-300">
        Fehler beim Laden der Trophäenliste: {error}
      </div>
    );
  }

  if (trophies.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-zinc-800 bg-[#0d0e0f] p-4 text-center text-xs font-mono text-zinc-500">
        Für dieses Spiel sind aktuell keine Trophäen-Einträge in game_achievements hinterlegt.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[#00ff66]/30 bg-[#0d0e0f] p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-zinc-800">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#00ff66]">
          🏆 Komplette Trophäenliste ({trophies.length})
        </span>
        <span className="text-[11px] font-mono text-zinc-500">
          Quelle: game_achievements
        </span>
      </div>

      <div className="max-h-96 overflow-y-auto pr-1 space-y-2">
        {trophies.map((trophy, idx) => {
          const normType = normalizeTrophyType(trophy.trophy_type);
          const fallbackIcon = trophyTypeIcon(normType || TROPHY_TYPE.BRONZE);
          const typeLabel = trophyTypeLabel(normType);

          return (
            <div
              key={trophy.trophy_id || trophy.id || idx}
              className="flex items-start gap-3 rounded-lg border border-zinc-800/90 bg-[#141618] p-2.5"
            >
              <img
                src={trophy.icon_url || fallbackIcon}
                alt={typeLabel}
                loading="lazy"
                onError={(e) => {
                  if (fallbackIcon && e.currentTarget.src !== fallbackIcon) {
                    e.currentTarget.src = fallbackIcon;
                  }
                }}
                className="w-10 h-10 rounded-md object-cover bg-zinc-900 border border-zinc-800 flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {fallbackIcon ? (
                    <img
                      src={fallbackIcon}
                      alt={typeLabel}
                      title={typeLabel}
                      className="w-4 h-4 object-contain flex-shrink-0"
                    />
                  ) : null}
                  <span className="text-xs font-bold text-white">
                    {trophy.trophy_name || `Trophäe #${idx + 1}`}
                  </span>
                  {trophy.global_seltenheit ? (
                    <span className="ml-auto text-[10px] font-mono text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded">
                      {trophy.global_seltenheit}
                    </span>
                  ) : null}
                </div>
                {trophy.trophy_desc ? (
                  <p className="text-xs text-zinc-400 mt-0.5 leading-snug">
                    {trophy.trophy_desc}
                  </p>
                ) : null}
                {trophy.guide_tip ? (
                  <p className="text-[11px] text-[#00ff66]/90 bg-[#00ff66]/5 border border-[#00ff66]/20 rounded px-2 py-1 mt-1.5 leading-snug">
                    💡 {trophy.guide_tip}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Platin-Spielzeit & Schwierigkeit bewerten:
 * Exklusiv bei Spielen in "3. Fertige Spiele" mit Platin-Status!
 */
function InlineGameRatingControl({ item, userId, onSaved }) {
  const existing = item.rating;
  const defaultHours =
    existing?.completionHours != null
      ? String(existing.completionHours)
      : item.playtimeHours > 0
        ? String(item.playtimeHours)
        : '';
  const defaultDiff =
    existing?.difficulty != null ? String(existing.difficulty) : '';

  const [hours, setHours] = useState(defaultHours);
  const [difficulty, setDifficulty] = useState(defaultDiff);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setHours(
      item.rating?.completionHours != null
        ? String(item.rating.completionHours)
        : item.playtimeHours > 0
          ? String(item.playtimeHours)
          : '',
    );
    setDifficulty(
      item.rating?.difficulty != null ? String(item.rating.difficulty) : '',
    );
  }, [item.rating?.completionHours, item.rating?.difficulty, item.playtimeHours]);

  if (!item.isPlatinum || item.bucket !== 'COMPLETED') {
    return null;
  }

  const handleSaveRating = async (e) => {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    const { data, error } = await upsertUserGameRating(supabase, userId, item.gameId, {
      completionHours: hours,
      difficulty,
    });
    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
    onSaved?.(item.gameId, data);
  };

  const handleQuickConfirmPsnHours = async () => {
    if (!item.playtimeHours || item.playtimeHours <= 0) return;
    setErr(null);
    setSaving(true);
    const nextDiff = difficulty ? Number(difficulty) : 3;
    const { data, error } = await upsertUserGameRating(supabase, userId, item.gameId, {
      completionHours: item.playtimeHours,
      difficulty: nextDiff,
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setHours(String(item.playtimeHours));
    if (!difficulty) setDifficulty(String(nextDiff));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
    onSaved?.(item.gameId, data);
  };

  return (
    <div className="mt-3 pt-3 border-t border-[#00ff66]/20">
      <form
        onSubmit={handleSaveRating}
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-300">
            🏆 Platin-Spielzeit & Schwierigkeit bewerten:
          </span>
          {existing ? (
            <span className="text-[10px] font-mono text-[#00ff66] bg-[#00ff66]/10 border border-[#00ff66]/30 px-1.5 py-0.5 rounded-sm">
              ✓ Gespeichert ({existing.completionHours ?? '–'}h · {existing.difficulty ?? '–'}/10)
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 bg-[#1a1b1c] border border-zinc-800 rounded-lg px-2 py-1">
            <span>⏱️</span>
            <input
              type="number"
              min="0"
              max="9999"
              step="0.5"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder={item.playtimeHours > 0 ? `${item.playtimeHours}` : 'Std.'}
              aria-label="Echte Platin-Zeit in Stunden"
              className="w-14 bg-transparent text-white font-bold text-xs focus:outline-hidden text-right tabular-nums"
            />
            <span className="text-zinc-500">h</span>
          </label>

          <label className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 bg-[#1a1b1c] border border-zinc-800 rounded-lg px-2 py-1">
            <span>⚡</span>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              aria-label="Schwierigkeit 1 bis 10"
              className="bg-[#1a1b1c] text-white font-bold text-xs focus:outline-hidden cursor-pointer"
            >
              <option value="">Diff. (1-10)</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={String(n)}>
                  {n} / 10
                </option>
              ))}
            </select>
          </label>

          {item.isPlatinum && item.playtimeHours > 0 && !existing ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleQuickConfirmPsnHours}
              title={`PSN-Spielzeit (${item.playtimeHours}h) mit 1 Klick als Platin-Zeit bestätigen`}
              className="text-[11px] font-mono font-bold text-zinc-950 bg-[#00ff66] hover:bg-[#00e65c] disabled:opacity-40 px-2.5 py-1 rounded-lg transition cursor-pointer"
            >
              ✓ {item.playtimeHours}h übernehmen
            </button>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className={`text-[11px] font-mono font-bold px-3 py-1 rounded-lg border transition cursor-pointer ${
              savedFlash
                ? 'bg-[#00ff66] text-zinc-950 border-[#00ff66]'
                : 'bg-[#00ff66]/15 hover:bg-[#00ff66]/25 text-[#00ff66] border-[#00ff66]/40'
            }`}
          >
            {saving ? '…' : savedFlash ? '✓ Gesendet!' : existing ? 'Aktualisieren' : 'Senden'}
          </button>
        </div>
      </form>
      {err ? <p className="text-[10px] text-red-400 mt-1 font-mono">{err}</p> : null}
    </div>
  );
}

function ProfilePage({ sessionUser, setCurrentView, onRequestLogin, openGame }) {
  const { globalLocale, setGlobalLocale } = useLocale();
  const {
    preferredLocales,
    setPreferredLocales,
    togglePreferredLocale,
  } = useUserPreferences();

  const [profile, setProfile] = useState(null);
  const [watchlistItems, setWatchlistItems] = useState([]);
  const [guideChecklists, setGuideChecklists] = useState([]);
  const [areaErrors, setAreaErrors] = useState({});
  const [loading, setLoading] = useState(true);

  // PSN Inline-Editor States
  const [psnId, setPsnId] = useState('');
  const [editingPsn, setEditingPsn] = useState(false);
  const [datenschutzConsent, setDatenschutzConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Sprachen-Speicherstatus
  const [savingLangs, setSavingLangs] = useState(false);
  const [langSavedFlash, setLangSavedFlash] = useState(false);

  // Bibliothek-Suche & geöffnete Trophäenlisten in Stufe 3
  const [searchTerm, setSearchTerm] = useState('');
  const [resettingGameId, setResettingGameId] = useState(null);
  const [expandedTrophyGameIds, setExpandedTrophyGameIds] = useState({});
  const [coopHintOpen, setCoopHintOpen] = useState(false);

  useEffect(() => {
    const prev = document.title;
    document.title = '🏆 Mein Cockpit · TrophyBase.app';
    return () => {
      document.title = prev;
    };
  }, []);

  const loadCockpit = useCallback(async () => {
    if (!sessionUser?.id) {
      setProfile(null);
      setWatchlistItems([]);
      setGuideChecklists([]);
      setAreaErrors({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const bundle = await fetchUserCockpitBundle(supabase, sessionUser.id, globalLocale);

    if (bundle.errors.profile && !bundle.profile) {
      setError(
        getUserAreaErrorHint(bundle.errors.profile, 'profile') ??
          bundle.errors.profile.message,
      );
    }

    setProfile(bundle.profile);
    if (bundle.profile?.psn_id) {
      setPsnId(bundle.profile.psn_id);
      setEditingPsn(false);
    } else {
      setEditingPsn(true);
    }

    const remotePreferred =
      bundle.profile?.preferred_locales ??
      sessionUser?.user_metadata?.preferred_locales;
    if (Array.isArray(remotePreferred) && remotePreferred.length > 0) {
      setPreferredLocales(sanitizePreferredLocales(remotePreferred));
    }

    setWatchlistItems(bundle.watchlistItems);
    setGuideChecklists(bundle.guideChecklists);
    setAreaErrors(bundle.errors);
    setLoading(false);
  }, [sessionUser?.id, sessionUser?.user_metadata?.preferred_locales, globalLocale, setPreferredLocales]);

  useEffect(() => {
    loadCockpit();
  }, [loadCockpit]);

  // 4 Haupt-Stat-Counter berechnen (aus user_watchlist + profiles)
  const cockpitStats = useMemo(() => {
    const libraryCount = watchlistItems.length;
    const watchlistPlatinums = watchlistItems.filter((item) => item.isPlatinum).length;
    const profilePlatinums = Number(profile?.psn_total_platinums ?? 0);
    const totalPlatinums = Math.max(watchlistPlatinums, profilePlatinums);

    const totalPlaytimeHours = watchlistItems.reduce(
      (sum, item) => sum + (Number(item.playtimeHours) || 0),
      0,
    );

    const avgCompletion =
      libraryCount > 0
        ? Math.round(
            watchlistItems.reduce((sum, item) => sum + (Number(item.progressPercent) || 0), 0) /
              libraryCount,
          )
        : 0;

    return {
      totalPlatinums,
      watchlistPlatinums,
      profilePlatinums,
      totalPlaytimeHours: Math.round(totalPlaytimeHours * 10) / 10,
      libraryCount,
      avgCompletion,
    };
  }, [watchlistItems, profile?.psn_total_platinums]);

  const filteredBySearch = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return watchlistItems;
    return watchlistItems.filter((item) => {
      const matchTitle = String(item.title ?? '').toLowerCase().includes(q);
      const matchTitleId = String(item.titleId ?? '').toLowerCase().includes(q);
      return matchTitle || matchTitleId;
    });
  }, [watchlistItems, searchTerm]);

  // 3 feste Stufen der Bibliothek: 1. Watchlist -> 2. Angefangen -> 3. Fertige Spiele
  const stage1Watchlist = useMemo(
    () => filteredBySearch.filter((item) => item.bucket === 'BACKLOG'),
    [filteredBySearch],
  );
  const stage2Playing = useMemo(
    () => filteredBySearch.filter((item) => item.bucket === 'PLAYING'),
    [filteredBySearch],
  );
  const stage3Completed = useMemo(
    () => filteredBySearch.filter((item) => item.bucket === 'COMPLETED'),
    [filteredBySearch],
  );

  if (!sessionUser) {
    return (
      <div className="max-w-lg mx-auto w-full px-4 py-16 text-center">
        <div className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-8 shadow-xl">
          <p className="text-3xl mb-3">🏆</p>
          <h1 className="text-lg font-bold text-white mb-2">Mein TrophyBase-Cockpit</h1>
          <p className="text-sm text-zinc-400 mb-6">
            Melde dich an, um deine PSN-Bibliothek, Platin-Zeiten und aktiven Guide-Checklisten zu
            verwalten.
          </p>
          <button
            type="button"
            onClick={onRequestLogin}
            className="text-xs font-bold text-zinc-950 bg-[#00ff66] hover:bg-[#00e65c] px-6 py-3 rounded-xl transition cursor-pointer"
          >
            Jetzt anmelden
          </button>
        </div>
      </div>
    );
  }

  const verificationStatus = profile?.verification_status ?? PROFILE_STATUS.none;
  const isVerified = verificationStatus === PROFILE_STATUS.verified;

  const handlePrimaryLanguageChange = async (nextLocale) => {
    setGlobalLocale(nextLocale, { unlock: true });
    if (!preferredLocales.includes(nextLocale)) {
      const nextList = [...preferredLocales, nextLocale];
      setSavingLangs(true);
      await saveUserPreferredLocales(supabase, sessionUser.id, nextList);
      setSavingLangs(false);
    }
  };

  const handleTogglePreferredLocale = async (code) => {
    const nextList = togglePreferredLocale(code);
    setSavingLangs(true);
    await saveUserPreferredLocales(supabase, sessionUser.id, nextList);
    setSavingLangs(false);
    setLangSavedFlash(true);
    window.setTimeout(() => setLangSavedFlash(false), 1800);
  };

  const handleRegisterPsn = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const consent = datenschutzConsent || profile?.datenschutz_einwilligung === true || true;
    const { data, error: regError } = await registerPsnId(
      supabase,
      sessionUser.id,
      psnId,
      consent,
    );

    setSubmitting(false);

    if (regError) {
      setError(regError.message);
      return;
    }

    setProfile(data);
    setEditingPsn(false);
    setSuccess(
      'PSN-ID gespeichert! Trage den Verifizierungscode unten in dein PSN-„Über mich“-Feld ein.',
    );
    await loadCockpit();
  };

  const handleVerify = async () => {
    setError(null);
    setSuccess(null);
    setVerifying(true);

    const result = await requestPsnVerification(supabase);

    setVerifying(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setSuccess(result.message);
    await loadCockpit();
  };

  const handleRegenerateCode = async () => {
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const { data, error: regenError } = await regenerateVerificationCode(
      supabase,
      sessionUser.id,
    );

    setSubmitting(false);

    if (regenError) {
      setError(regenError.message);
      return;
    }

    setProfile(data);
    setSuccess('Neuer Verifizierungscode erzeugt.');
  };

  const handleOpenGameGuide = (item) => {
    if (!openGame) return;
    if (item.game) {
      navigateToGame(item.game, { locale: globalLocale });
      openGame(item.game);
      return;
    }
    if (item.gameId) {
      navigateToGame(item.gameId, { locale: globalLocale });
      openGame({ id: item.gameId });
    }
  };

  const handleRatingSaved = (gameId, ratingRow) => {
    setWatchlistItems((prev) =>
      prev.map((item) => {
        if (item.gameId !== gameId) return item;
        return {
          ...item,
          rating: {
            id: ratingRow?.id,
            gameId,
            completionHours:
              ratingRow?.completion_hours != null ? Number(ratingRow.completion_hours) : null,
            difficulty: ratingRow?.difficulty != null ? Number(ratingRow.difficulty) : null,
            updatedAt: ratingRow?.updated_at ?? new Date().toISOString(),
          },
        };
      }),
    );
  };

  // Stufe 1 -> Stufe 2: Spiel starten
  const handleStartGame = async (item) => {
    const { error: statusErr } = await updateWatchlistEntryStatus(
      supabase,
      sessionUser.id,
      item.gameId,
      'PLAYING',
    );
    if (statusErr) {
      setError(`Status-Update fehlgeschlagen: ${statusErr.message}`);
      return;
    }
    setWatchlistItems((prev) =>
      prev.map((w) =>
        w.gameId === item.gameId
          ? {
              ...w,
              status: 'PLAYING',
              bucket: 'PLAYING',
              completedWithoutPlatinum: false,
            }
          : w,
      ),
    );
  };

  // Stufe 2 -> Stufe 3 (Option A): Platin erreicht
  const handleCompleteWithPlatinum = async (item) => {
    const { error: statusErr } = await updateWatchlistEntryStatus(
      supabase,
      sessionUser.id,
      item.gameId,
      'COMPLETED',
      { markPlatinum: true, progressPercent: 100 },
    );
    if (statusErr) {
      setError(`Status-Update fehlgeschlagen: ${statusErr.message}`);
      return;
    }
    setWatchlistItems((prev) =>
      prev.map((w) =>
        w.gameId === item.gameId
          ? {
              ...w,
              status: 'COMPLETED',
              bucket: 'COMPLETED',
              isPlatinum: true,
              completedWithoutPlatinum: false,
              progressPercent: 100,
              earnedTrophies: {
                ...(w.earnedTrophies || { gold: 0, silver: 0, bronze: 0 }),
                platinum: Math.max(1, Number(w.earnedTrophies?.platinum ?? 0)),
              },
            }
          : w,
      ),
    );
  };

  // Stufe 2 -> Stufe 3 (Option B): Ohne Platin fertig
  const handleCompleteWithoutPlatinum = async (item) => {
    const { error: statusErr } = await updateWatchlistEntryStatus(
      supabase,
      sessionUser.id,
      item.gameId,
      'completed_no_platinum',
      { markPlatinum: false },
    );
    if (statusErr) {
      setError(`Status-Update fehlgeschlagen: ${statusErr.message}`);
      return;
    }
    setWatchlistItems((prev) =>
      prev.map((w) =>
        w.gameId === item.gameId
          ? {
              ...w,
              status: 'completed_no_platinum',
              bucket: 'COMPLETED',
              isPlatinum: false,
              completedWithoutPlatinum: true,
            }
          : w,
      ),
    );
  };

  // Zurück auf Watchlist (Stufe 1)
  const handleMoveToWatchlist = async (item) => {
    const { error: statusErr } = await updateWatchlistEntryStatus(
      supabase,
      sessionUser.id,
      item.gameId,
      'BACKLOG',
      { markPlatinum: false, progressPercent: 0 },
    );
    if (statusErr) {
      setError(`Status-Update fehlgeschlagen: ${statusErr.message}`);
      return;
    }
    setWatchlistItems((prev) =>
      prev.map((w) =>
        w.gameId === item.gameId
          ? {
              ...w,
              status: 'BACKLOG',
              bucket: 'BACKLOG',
              isPlatinum: false,
              completedWithoutPlatinum: false,
              progressPercent: 0,
            }
          : w,
      ),
    );
  };

  const toggleExpandedTrophies = (gameId) => {
    setExpandedTrophyGameIds((prev) => ({
      ...prev,
      [gameId]: !prev[gameId],
    }));
  };

  const handleResetChecklist = async (checklistItem) => {
    const confirmed = window.confirm(
      `Möchtest du die Guide-Checkliste für „${checklistItem.title}“ wirklich auf 0 zurücksetzen (z. B. für New Game+)?\n\nDein PSN-Trophäenstatus bleibt dabei vollständig erhalten!`,
    );
    if (!confirmed) return;

    setResettingGameId(checklistItem.gameId);
    const { error: resetError } = await resetUserGuideChecklist(
      supabase,
      sessionUser.id,
      checklistItem.gameId,
      checklistItem.isPlatinum,
    );
    setResettingGameId(null);

    if (resetError) {
      setError(`Checkliste konnte nicht zurückgesetzt werden: ${resetError.message}`);
      return;
    }

    saveCompletedGuideItems(checklistItem.gameId, {});
    saveUnlockedTrophies(checklistItem.gameId, {});
    try {
      window.dispatchEvent(
        new CustomEvent(PROGRESS_SYNCED_EVENT, { detail: { gameIds: [checklistItem.gameId] } }),
      );
    } catch {
      /* ignore */
    }

    setGuideChecklists((prev) => prev.filter((c) => c.gameId !== checklistItem.gameId));
    setSuccess(`Guide-Checkliste für „${checklistItem.title}“ wurde auf 0 zurückgesetzt.`);
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      {/* Top Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setCurrentView('home');
            navigateToHome();
          }}
          className="text-xs font-mono text-zinc-400 hover:text-[#00ff66] transition cursor-pointer"
        >
          ← Zurück zur Startseite
        </button>

        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
          <span>Account:</span>
          <span className="text-zinc-300">{sessionUser.email}</span>
        </div>
      </div>

      {/* ===================================================================
          BEREICH A: Header-Kachel (PSN-Status & Gesamt-Statistik)
      =================================================================== */}
      <section className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-5 sm:p-7 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pb-6 border-b border-zinc-800/80">
          {/* Avatar + PSN Identity */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-[#00ff66]/40 bg-[#121314] flex-shrink-0 flex items-center justify-center shadow-lg">
              {profile?.psn_avatar_url ? (
                <img
                  src={profile.psn_avatar_url}
                  alt={profile.psn_id || 'PSN Avatar'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-3xl select-none">🎮</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#00ff66] border border-[#00ff66]/30 bg-[#00ff66]/10 px-2 py-0.5 rounded-sm">
                  🏆 Mein Cockpit
                </span>
                <StatusBadge status={verificationStatus} />
              </div>

              <div className="flex flex-wrap items-center gap-2.5 mt-1">
                <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight truncate">
                  {profile?.psn_id || profile?.display_name || 'PSN-Account verknüpfen'}
                </h1>
                {profile?.psn_id && !editingPsn ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPsnId(profile.psn_id || '');
                      setEditingPsn(true);
                    }}
                    className="text-[11px] font-mono text-zinc-400 hover:text-white bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700 px-2.5 py-1 rounded-lg transition cursor-pointer"
                  >
                    ✏️ PSN-ID ändern
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs font-mono text-zinc-500">
                {profile?.last_psn_sync_at ? (
                  <span>
                    🔄 Letzter PSN-Sync:{' '}
                    <strong className="text-zinc-300">
                      {new Date(profile.last_psn_sync_at).toLocaleString('de-DE', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </strong>
                  </span>
                ) : (
                  <span>Noch kein automatischer PSN-Sync durchgeführt</span>
                )}
              </div>
            </div>
          </div>

          {/* Verifizierungscode-Box rechts oben, immer griffbereit */}
          {profile?.verification_code ? (
            <div className="flex flex-col sm:flex-row md:flex-col items-start sm:items-center md:items-end justify-between gap-2 bg-[#121314] border border-zinc-800 rounded-xl px-4 py-3 flex-shrink-0">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  PSN „Über mich“-Code
                </p>
                <p className="text-lg font-mono font-extrabold text-[#00ff66] tracking-widest">
                  {profile.verification_code}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {!isVerified ? (
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={verifying || verificationStatus === PROFILE_STATUS.verifying}
                    className="text-[11px] font-mono font-bold text-zinc-950 bg-[#00ff66] hover:bg-[#00e65c] disabled:opacity-40 px-2.5 py-1 rounded-lg transition cursor-pointer"
                  >
                    {verifying || verificationStatus === PROFILE_STATUS.verifying
                      ? 'Prüfe…'
                      : 'Jetzt prüfen'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleRegenerateCode}
                  disabled={submitting}
                  title="Neuen Verifizierungscode generieren"
                  className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 hover:bg-zinc-700 px-2 py-1 rounded-lg border border-zinc-700 transition cursor-pointer"
                >
                  ↻ Neu
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Feedback-Banner */}
        {error ? (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 font-mono">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-4 p-3 rounded-xl bg-[#00ff66]/10 border border-[#00ff66]/30 text-xs text-[#00ff66] font-mono">
            {success}
          </div>
        ) : null}

        {/* Inline PSN-ID Formular (wenn psn_id leer ist oder geändert wird) */}
        {!loading && (!profile?.psn_id || editingPsn) ? (
          <form
            onSubmit={handleRegisterPsn}
            className="mt-5 p-4 rounded-xl bg-[#121314] border border-zinc-800 space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <label
                  htmlFor="cockpit-psn-id"
                  className="block text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-1.5"
                >
                  PSN Online-ID eintragen oder anpassen
                </label>
                <input
                  id="cockpit-psn-id"
                  type="text"
                  required
                  value={psnId}
                  onChange={(e) => setPsnId(e.target.value)}
                  placeholder="z. B. TrophyHunter_DE"
                  disabled={submitting}
                  className="w-full bg-[#1a1b1c] border border-zinc-700 focus:border-[#00ff66] rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    (!datenschutzConsent && !profile?.datenschutz_einwilligung)
                  }
                  className="text-xs font-mono font-bold text-zinc-950 bg-[#00ff66] hover:bg-[#00e65c] disabled:opacity-40 px-5 py-2.5 rounded-xl transition cursor-pointer whitespace-nowrap"
                >
                  {submitting ? 'Speichere…' : 'PSN-ID speichern'}
                </button>
                {profile?.psn_id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPsnId(profile.psn_id);
                      setEditingPsn(false);
                    }}
                    className="text-xs font-mono text-zinc-400 hover:text-zinc-200 bg-zinc-800 px-3.5 py-2.5 rounded-xl border border-zinc-700 transition cursor-pointer"
                  >
                    Abbrechen
                  </button>
                ) : null}
              </div>
            </div>

            {!profile?.datenschutz_einwilligung ? (
              <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={datenschutzConsent}
                  onChange={(e) => setDatenschutzConsent(e.target.checked)}
                  className="mt-0.5 rounded-sm border-zinc-700 bg-[#1a1b1c] text-[#00ff66] focus:ring-0 w-4 h-4 cursor-pointer flex-shrink-0"
                />
                <span className="text-xs text-zinc-400 leading-relaxed">
                  Ich willige ein, dass TrophyBase meine öffentliche PSN-ID, Spielzeiten und
                  Trophäendaten gemäß der{' '}
                  <a
                    href="/datenschutz"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#00ff66] hover:underline"
                  >
                    Datenschutzerklärung (DSGVO)
                  </a>{' '}
                  synchronisiert.
                </span>
              </label>
            ) : null}

            {profile?.verification_code ? (
              <p className="text-[11px] font-mono text-zinc-500">
                💡 Tipp: Trage den Code{' '}
                <strong className="text-[#00ff66]">{profile.verification_code}</strong> im
                PSN-Profil unter „Über mich“ ein, um deinen Account zu verifizieren.
              </p>
            ) : null}
          </form>
        ) : null}

        {/* 4 knackige Stat-Counter */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6">
          <StatCard
            icon="🏆"
            label="Platin-Trophäen"
            value={loading ? '…' : cockpitStats.totalPlatinums}
            sublabel={
              cockpitStats.watchlistPlatinums > 0
                ? `${cockpitStats.watchlistPlatinums} in Bibliothek`
                : 'PSN Gesamt-Platin'
            }
            accent
          />
          <StatCard
            icon="⏱️"
            label="Gespielte Stunden"
            value={loading ? '…' : `${cockpitStats.totalPlaytimeHours} h`}
            sublabel="Summe aus PSN-Sync"
          />
          <StatCard
            icon="📚"
            label="Spiele in Bibliothek"
            value={loading ? '…' : cockpitStats.libraryCount}
            sublabel={`${stage1Watchlist.length} Watchlist · ${stage2Playing.length} aktiv · ${stage3Completed.length} fertig`}
          />
          <StatCard
            icon="📈"
            label="Ø Komplettierung"
            value={loading ? '…' : `${cockpitStats.avgCompletion}%`}
            sublabel="Durchschnitt aller Spiele"
          />
        </div>
      </section>

      {/* ===================================================================
          BEREICH A2: Sprachauswahl (Primäre Websitesprache + Multi-Select Guide/Koop-Sprachen)
      =================================================================== */}
      <section className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-5 sm:p-7 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-white tracking-tight">
              🌐 Spracheinstellungen (Website, Guides & Koop-Verabredungen)
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Wähle deine primäre Websitesprache sowie alle Sprachen, die du für Guides und spätere Online-Trophäen-Verabredungen beherrschst.
            </p>
          </div>
          {savingLangs ? (
            <span className="text-[11px] font-mono text-zinc-400">Speichere…</span>
          ) : langSavedFlash ? (
            <span className="text-[11px] font-mono text-[#00ff66] bg-[#00ff66]/10 border border-[#00ff66]/30 px-2.5 py-1 rounded-md">
              ✓ Sprachen im Profil gespeichert
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
          {/* 1. Primäre Websitesprache (Single-Select Dropdown) */}
          <div className="rounded-xl border border-zinc-800 bg-[#121314] p-4">
            <label
              htmlFor="profile-primary-locale"
              className="block text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-2"
            >
              1. Primäre Websitesprache
            </label>
            <select
              id="profile-primary-locale"
              value={globalLocale}
              onChange={(e) => handlePrimaryLanguageChange(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-[#1a1b1c] px-3 py-2.5 text-xs font-bold text-white focus:border-[#00ff66] focus:outline-hidden cursor-pointer"
            >
              {ALL_LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.flag} {opt.label} ({opt.code.toUpperCase()})
                </option>
              ))}
            </select>
            <p className="mt-2 text-[11px] text-zinc-500 leading-snug">
              Steuert die Hauptsprache der Benutzeroberfläche und die Standard-Sprache beim Öffnen von Guides.
            </p>
          </div>

          {/* 2. Meine Sprachen (Mehrfachauswahl / Multi-Select Chips aus den 16 unterstützten Sprachen) */}
          <div className="md:col-span-2 rounded-xl border border-zinc-800 bg-[#121314] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                2. Meine Sprachen (Mehrfachauswahl · Guides & Koop-Sprachen)
              </span>
              <span className="text-[11px] font-mono text-[#00ff66]">
                Aktiv: {preferredLocales.map((c) => c.toUpperCase()).join(', ')}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {ALL_LANGUAGE_OPTIONS.map((opt) => {
                const selected = preferredLocales.includes(opt.code);
                return (
                  <button
                    key={opt.code}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleTogglePreferredLocale(opt.code)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-mono transition cursor-pointer ${
                      selected
                        ? 'border-[#00ff66]/60 bg-[#00ff66]/15 text-[#00ff66] font-bold shadow-xs'
                        : 'border-zinc-800 bg-[#1a1b1c] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <span aria-hidden>{opt.flag}</span>
                    <span>{opt.label}</span>
                    <span className="text-[10px] opacity-75">({opt.code.toUpperCase()})</span>
                    {selected ? <span aria-hidden>✓</span> : null}
                  </button>
                );
              })}
            </div>

            <p className="mt-2.5 text-[11px] text-zinc-500 leading-snug">
              Wird in deinem Profil (<code className="text-zinc-400">preferred_locales</code>) gespeichert und für mehrsprachige Guides sowie spätere Online-Trophäen-Verabredungen genutzt.
            </p>
          </div>
        </div>
      </section>

      {/* ===================================================================
          BEREICH B: Meine Spiele-Bibliothek in 3 festen Stufen
          (1. Watchlist -> 2. Angefangene Spiele -> 3. Fertige Spiele)
      =================================================================== */}
      <section className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-5 sm:p-7 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-extrabold text-white tracking-tight">
              🎮 Meine Spiele-Bibliothek (3-Stufen-Pipeline)
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              1. Watchlist → 2. Angefangene Spiele → 3. Fertige Spiele (inkl. PSN-Sync, kompletter Trophäenliste & Platin-Bewertung)
            </p>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Bibliothek durchsuchen…"
              className="w-full bg-[#121314] border border-zinc-800 focus:border-zinc-600 rounded-xl px-3.5 py-2 text-xs text-zinc-200 font-mono focus:outline-hidden"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm font-mono text-zinc-500 animate-pulse">
            Lade Spiele-Bibliothek…
          </div>
        ) : areaErrors.watchlist ? (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-900/40 text-xs text-red-300 font-mono">
            Fehler beim Laden der Bibliothek: {areaErrors.watchlist.message}
          </div>
        ) : (
          <div className="space-y-8">
            {/* -------------------------------------------------------------
                STUFE 1 (OBEN): 1. Watchlist
                Keine Platin-Spielzeit/Schwierigkeit-Bewertung erlaubt!
            ------------------------------------------------------------- */}
            <div className="rounded-2xl border border-zinc-800/90 bg-[#141618] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-zinc-800 text-zinc-300 font-mono text-xs">
                      1
                    </span>
                    <span>📌 Watchlist</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Vorgemerkte Spiele – starte ein Spiel per Klick, sobald du loslegst.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-300">
                  {stage1Watchlist.length} {stage1Watchlist.length === 1 ? 'Spiel' : 'Spiele'}
                </span>
              </div>

              {stage1Watchlist.length === 0 ? (
                <div className="py-6 px-4 text-center rounded-xl border border-dashed border-zinc-800 bg-[#121314]/60">
                  <p className="text-xs text-zinc-400">
                    Keine Spiele auf der Watchlist. Markiere Spiele im Katalog oder Guide mit dem ☆ Stern.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {stage1Watchlist.map((item) => {
                    const guideHref = item.game
                      ? gameGuidePath(item.game, globalLocale)
                      : `/guide/${item.gameId}`;

                    return (
                      <div
                        key={item.watchlistId || item.gameId}
                        className="rounded-xl border border-zinc-800 hover:border-zinc-700 p-3.5 bg-[#121314] transition"
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <a
                              href={guideHref}
                              onClick={(e) => {
                                e.preventDefault();
                                handleOpenGameGuide(item);
                              }}
                              className="w-14 h-18 sm:w-16 sm:h-20 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 flex-shrink-0 block group"
                            >
                              {item.cover ? (
                                <img
                                  src={item.cover}
                                  alt={item.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-lg">
                                  🎮
                                </div>
                              )}
                            </a>

                            <div className="min-w-0">
                              <a
                                href={guideHref}
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleOpenGameGuide(item);
                                }}
                                className="text-sm sm:text-base font-bold text-white hover:text-[#00ff66] transition no-underline block truncate"
                              >
                                {item.title}
                              </a>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                {item.titleId ? (
                                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-sm bg-zinc-800 text-zinc-300 border border-zinc-700">
                                    {item.titleId}
                                  </span>
                                ) : null}
                                {item.guideCompletionTime ? (
                                  <span className="text-[11px] font-mono text-zinc-400">
                                    ⏱️ Guide-Richtwert: {item.guideCompletionTime}h
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => handleStartGame(item)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-[#00ff66] hover:bg-[#00e65c] text-zinc-950 font-mono text-xs font-bold px-3.5 py-2 transition cursor-pointer shadow-sm"
                            >
                              ▶️ Spiel starten
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* -------------------------------------------------------------
                STUFE 2 (MITTE): 2. Angefangene Spiele
                Zwei Abschluss-Wege: "🏆 Platin erreicht" oder "✅ Ohne Platin fertig"
            ------------------------------------------------------------- */}
            <div className="rounded-2xl border border-amber-500/25 bg-[#141618] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-xs">
                      2
                    </span>
                    <span>🔥 Angefangene Spiele</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Spiele, die du aktuell spielst – schließe sie mit Platin oder ohne Platin ab.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 font-mono text-xs text-amber-300">
                  {stage2Playing.length} aktiv
                </span>
              </div>

              {stage2Playing.length === 0 ? (
                <div className="py-6 px-4 text-center rounded-xl border border-dashed border-zinc-800 bg-[#121314]/60">
                  <p className="text-xs text-zinc-400">
                    Aktuell keine angefangenen Spiele. Starte oben ein Spiel aus deiner Watchlist!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5">
                  {stage2Playing.map((item) => {
                    const guideHref = item.game
                      ? gameGuidePath(item.game, globalLocale)
                      : `/guide/${item.gameId}`;

                    return (
                      <div
                        key={item.watchlistId || item.gameId}
                        className="rounded-xl border border-zinc-800 hover:border-zinc-700 p-4 bg-[#121314] transition"
                      >
                        <div className="flex flex-col sm:flex-row items-start gap-4">
                          <a
                            href={guideHref}
                            onClick={(e) => {
                              e.preventDefault();
                              handleOpenGameGuide(item);
                            }}
                            className="w-16 h-20 sm:w-20 sm:h-24 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 flex-shrink-0 block group"
                          >
                            {item.cover ? (
                              <img
                                src={item.cover}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xl">
                                🎮
                              </div>
                            )}
                          </a>

                          <div className="flex-1 min-w-0 w-full">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <a
                                  href={guideHref}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleOpenGameGuide(item);
                                  }}
                                  className="text-base font-bold text-white hover:text-[#00ff66] transition no-underline block truncate"
                                >
                                  {item.title}
                                </a>

                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  {item.titleId ? (
                                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-sm bg-zinc-800 text-zinc-300 border border-zinc-700">
                                      {item.titleId}
                                    </span>
                                  ) : null}
                                  <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900/90 border border-zinc-800 px-2 py-0.5 rounded-sm">
                                    ⏱️ PSN: <strong className="text-zinc-200">{item.playtimeHours} h</strong>
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleCompleteWithPlatinum(item)}
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#00ff66] hover:bg-[#00e65c] text-zinc-950 font-mono text-xs font-bold px-3 py-1.5 transition cursor-pointer shadow-xs"
                                >
                                  🏆 Platin erreicht
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCompleteWithoutPlatinum(item)}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 font-mono text-xs font-semibold px-3 py-1.5 transition cursor-pointer"
                                >
                                  ✅ Ohne Platin fertig
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveToWatchlist(item)}
                                  title="Zurück auf die Watchlist schieben"
                                  className="rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 font-mono text-[11px] px-2.5 py-1.5 transition cursor-pointer"
                                >
                                  ↩️ Watchlist
                                </button>
                              </div>
                            </div>

                            <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex-1 max-w-md">
                                <WatchlistProgressBar percent={item.progressPercent} />
                              </div>
                              <TrophyBreakdownPills
                                earnedTrophies={item.earnedTrophies}
                                isPlatinum={item.isPlatinum}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* -------------------------------------------------------------
                STUFE 3 (UNTEN): 3. Fertige Spiele (Platin & Abgeschlossen, inkl. Sync)
                - Klick auf Platin-Trophäe öffnet komplette Trophäenliste aus game_achievements
                - Platin-Spielzeit & Schwierigkeit bewerten ("Senden") NUR bei Platin!
            ------------------------------------------------------------- */}
            <div className="rounded-2xl border border-[#00ff66]/30 bg-[#141618] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#00ff66]/20 text-[#00ff66] border border-[#00ff66]/40 font-mono text-xs">
                      3
                    </span>
                    <span>🏆 Fertige Spiele (Platin & Abgeschlossen, inkl. Sync)</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Klicke bei einem Spiel auf die Platin-Trophäe, um die komplette Trophäenliste aus <code className="text-zinc-300">game_achievements</code> aufzuklappen.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-[#00ff66]/15 border border-[#00ff66]/35 font-mono text-xs text-[#00ff66] font-bold">
                  {stage3Completed.length} abgeschlossen
                </span>
              </div>

              {stage3Completed.length === 0 ? (
                <div className="py-6 px-4 text-center rounded-xl border border-dashed border-zinc-800 bg-[#121314]/60">
                  <p className="text-xs text-zinc-400">
                    Noch keine abgeschlossenen oder platinierten Spiele vorhanden.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5">
                  {stage3Completed.map((item) => {
                    const guideHref = item.game
                      ? gameGuidePath(item.game, globalLocale)
                      : `/guide/${item.gameId}`;
                    const trophyListOpen = Boolean(expandedTrophyGameIds[item.gameId]);

                    return (
                      <div
                        key={item.watchlistId || item.gameId}
                        className={`rounded-xl border p-4 bg-[#121314] transition ${
                          item.isPlatinum
                            ? 'border-[#00ff66]/35 shadow-sm shadow-[#00ff66]/5'
                            : 'border-zinc-800'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row items-start gap-4">
                          <a
                            href={guideHref}
                            onClick={(e) => {
                              e.preventDefault();
                              handleOpenGameGuide(item);
                            }}
                            className="w-16 h-20 sm:w-20 sm:h-24 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 flex-shrink-0 block group relative"
                          >
                            {item.cover ? (
                              <img
                                src={item.cover}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xl">
                                🎮
                              </div>
                            )}
                          </a>

                          <div className="flex-1 min-w-0 w-full">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <a
                                    href={guideHref}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleOpenGameGuide(item);
                                    }}
                                    className="text-base font-bold text-white hover:text-[#00ff66] transition no-underline truncate"
                                  >
                                    {item.title}
                                  </a>
                                  {item.isPlatinum ? (
                                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-sm bg-[#00ff66]/15 text-[#00ff66] border border-[#00ff66]/35">
                                      🏆 Platin
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-sm bg-zinc-800 text-zinc-300 border border-zinc-700">
                                      ✅ Ohne Platin fertig
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  {item.titleId ? (
                                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-sm bg-zinc-800 text-zinc-300 border border-zinc-700">
                                      {item.titleId}
                                    </span>
                                  ) : null}

                                  <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900/90 border border-zinc-800 px-2 py-0.5 rounded-sm">
                                    ⏱️ PSN: <strong className="text-zinc-200">{item.playtimeHours} h</strong>
                                  </span>

                                  {item.guideCompletionTime ? (
                                    <span className="text-[11px] font-mono text-zinc-500">
                                      Guide-Richtwert: {item.guideCompletionTime}h
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5">
                                {!item.isPlatinum ? (
                                  <button
                                    type="button"
                                    onClick={() => handleCompleteWithPlatinum(item)}
                                    className="rounded-lg border border-[#00ff66]/40 bg-[#00ff66]/10 hover:bg-[#00ff66]/20 text-[#00ff66] font-mono text-[11px] font-bold px-2.5 py-1 transition cursor-pointer"
                                  >
                                    🏆 Doch Platin erreicht
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => handleStartGame(item)}
                                  className="rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 font-mono text-[11px] px-2.5 py-1 transition cursor-pointer"
                                >
                                  ↩️ In „Angefangen“
                                </button>
                              </div>
                            </div>

                            {/* Fortschrittsbalken + Interaktive Platin-Trophäe (öffnet komplette Liste) */}
                            <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex-1 max-w-md">
                                <WatchlistProgressBar percent={item.progressPercent} />
                              </div>
                              <TrophyBreakdownPills
                                earnedTrophies={item.earnedTrophies}
                                isPlatinum={item.isPlatinum}
                                interactivePlatinum
                                platinumOpen={trophyListOpen}
                                onTogglePlatinumList={() => toggleExpandedTrophies(item.gameId)}
                              />
                            </div>

                            {/* Aufklappende komplette Trophäenliste aus game_achievements */}
                            {trophyListOpen ? (
                              <GameTrophyListDrawer
                                game={item.game}
                                gameId={item.gameId}
                                locale={globalLocale}
                              />
                            ) : null}

                            {/* Platin-Spielzeit & Schwierigkeit bewerten ("Senden") – NUR bei Platin! */}
                            {item.isPlatinum ? (
                              <InlineGameRatingControl
                                item={item}
                                userId={sessionUser.id}
                                onSaved={handleRatingSaved}
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ===================================================================
          BEREICH C: Aktive Guide-Checklisten (user_guide_progress)
      =================================================================== */}
      <section className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-5 sm:p-7 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-extrabold text-white tracking-tight">
              ☑️ Aktive Guide-Checklisten
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Spiele, bei denen du Schritte im interaktiven Guide abgehakt hast (unabhängig vom
              PSN-Trophäenstatus)
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-400 bg-[#121314] border border-zinc-800 px-3 py-1 rounded-lg">
            {guideChecklists.length} aktive Checkliste{guideChecklists.length === 1 ? '' : 'n'}
          </span>
        </div>

        {loading ? (
          <p className="text-xs font-mono text-zinc-500 animate-pulse py-6 text-center">
            Checklisten werden geladen…
          </p>
        ) : guideChecklists.length === 0 ? (
          <div className="py-8 px-4 text-center rounded-xl border border-dashed border-zinc-800 bg-[#121314]/60">
            <p className="text-xs text-zinc-400">
              Du hast aktuell keine offenen Guide-Checklisten mit abgehakten Schritten.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {guideChecklists.map((chk) => {
              const guideHref = chk.game
                ? gameGuidePath(chk.game, globalLocale)
                : `/guide/${chk.gameId}`;

              return (
                <div
                  key={chk.gameId}
                  className="flex flex-col justify-between gap-3 p-4 rounded-xl border border-zinc-800 bg-[#121314]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <a
                      href={guideHref}
                      onClick={(e) => {
                        e.preventDefault();
                        handleOpenGameGuide(chk);
                      }}
                      className="w-12 h-16 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 flex-shrink-0 block"
                    >
                      {chk.cover ? (
                        <img
                          src={chk.cover}
                          alt={chk.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-base">
                          🎮
                        </div>
                      )}
                    </a>

                    <div className="min-w-0 flex-1">
                      <a
                        href={guideHref}
                        onClick={(e) => {
                          e.preventDefault();
                          handleOpenGameGuide(chk);
                        }}
                        className="text-sm font-bold text-white hover:text-[#00ff66] transition no-underline block truncate"
                      >
                        {chk.title}
                      </a>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs font-mono">
                        <span className="text-[#00ff66] font-bold">
                          ✓ {chk.stepsCount} Schritt{chk.stepsCount === 1 ? '' : 'e'} abgehakt
                        </span>
                        {chk.updatedAt ? (
                          <span className="text-zinc-500 text-[11px]">
                            · Stand:{' '}
                            {new Date(chk.updatedAt).toLocaleDateString('de-DE', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-800/80">
                    <button
                      type="button"
                      onClick={() => handleOpenGameGuide(chk)}
                      className="text-[11px] font-mono text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-700 transition cursor-pointer"
                    >
                      Guide öffnen →
                    </button>

                    <button
                      type="button"
                      disabled={resettingGameId === chk.gameId}
                      onClick={() => handleResetChecklist(chk)}
                      className="text-[11px] font-mono font-semibold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-40"
                    >
                      {resettingGameId === chk.gameId
                        ? 'Setze zurück…'
                        : '🔄 Durchlauf-Checkliste auf 0 zurücksetzen'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===================================================================
          BEREICH D: Platzhalter für strukturierte Online-Trophäen-Verabredungen (statt Inbox)
      =================================================================== */}
      <section className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-5 sm:p-7 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white">
                🤝 Online-Trophäen-Verabredungen (Koop-Matchmaking)
              </h2>
              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-sm bg-[#00ff66]/10 text-[#00ff66] border border-[#00ff66]/30">
                Demnächst
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Strukturierte Koop-Gesuche für Online-Trophäen auf Basis deiner oben gewählten Sprachen (
              <strong className="text-zinc-200">
                {preferredLocales.map((c) => c.toUpperCase()).join(', ')}
              </strong>
              ) – sicher und ohne freien 1:1-Textchat (DSA-konform).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCoopHintOpen((prev) => !prev)}
            className="shrink-0 rounded-xl border border-[#00ff66]/40 bg-[#00ff66]/10 hover:bg-[#00ff66]/20 px-4 py-2 text-xs font-mono font-bold text-[#00ff66] transition cursor-pointer"
          >
            {coopHintOpen ? 'Hinweis ausblenden ▴' : 'Koop-Verabredung vormerken ▾'}
          </button>
        </div>

        {coopHintOpen ? (
          <div className="mt-4 rounded-xl border border-zinc-800 bg-[#121314] p-4 text-xs text-zinc-300 space-y-1.5">
            <p className="font-semibold text-white">
              So funktionieren die kommenden Online-Trophäen-Verabredungen:
            </p>
            <p className="text-zinc-400">
              Du wählst ein Spiel, die gewünschten Online-Trophäen, ein Zeitfenster und deine Koop-Sprachen ({preferredLocales.map((c) => c.toUpperCase()).join(', ')}). Andere verifizierte PSN-Spieler können sich direkt per 1-Klick für die Session eintragen – ganz ohne unmoderierten Freitext-Chat.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default ProfilePage;
