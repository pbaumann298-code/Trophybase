import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { gameGuidePath, navigateToHome } from '../lib/routeUtils';
import { useLocale } from '../context/LocaleContext';
import { SUPPORTED_LOCALES } from '../lib/locale';
import { localeOptions } from '../lib/uiStrings';
import { getGameCover, getGameTitle } from '../lib/gameModel';
import AccountDeleteCard from '../components/AccountDeleteCard';
import GameFallbackCover from '../components/GameFallbackCover';
import { fetchMyLinkedCreators } from '../lib/creatorQueries';
import {
  sanitizePreferredLocales,
  useUserPreferences,
} from '../lib/userPreferences';
import { saveCompletedGuideItems } from '../lib/guideProgressStorage';
import { saveUnlockedTrophies } from '../lib/trophyProgressStorage';
import { PROGRESS_SYNCED_EVENT } from '../lib/localUserProgress';
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
  watchlistGameMeta,
} from '../lib/userAreaQueries';
import {
  GAME_BUCKETS,
  GROUP_MODES,
  SORT_MODES,
  VIEW_MODES,
  groupLibraryItems,
  initialCockpitViewPrefs,
  letterSectionId,
  sortLibraryItems,
  writeCockpitViewPrefs,
} from '../lib/cockpitLibrary';
import {
  LibraryAlphaNav,
  LibraryBucketView,
  LibraryQuickAdd,
} from './profileLibraryView';

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

function ProfilePage({ sessionUser, setCurrentView, onRequestLogin, openGame, onBack }) {
  const { globalLocale, setGlobalLocale } = useLocale();
  const {
    preferredLocales,
    setPreferredLocales,
    togglePreferredLocale,
  } = useUserPreferences();

  const [profile, setProfile] = useState(null);
  const [watchlistItems, setWatchlistItems] = useState([]);
  const [guideChecklists, setGuideChecklists] = useState([]);
  const [linkedCreators, setLinkedCreators] = useState([]);
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

  const [searchTerm, setSearchTerm] = useState('');
  const [resettingGameId, setResettingGameId] = useState(null);
  const [coopHintOpen, setCoopHintOpen] = useState(false);
  const [tileOpenId, setTileOpenId] = useState(null);
  const [activeLetter, setActiveLetter] = useState('');
  const [viewMode, setViewMode] = useState(() => initialCockpitViewPrefs().viewMode);
  const [groupBy, setGroupBy] = useState(() => initialCockpitViewPrefs().groupBy);
  const [sortBy, setSortBy] = useState(() => initialCockpitViewPrefs().sortBy);
  const [activeBucket, setActiveBucket] = useState(() => initialCockpitViewPrefs().activeBucket);

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

    const [bundle, myCreatorsRes] = await Promise.all([
      fetchUserCockpitBundle(supabase, sessionUser.id, globalLocale),
      fetchMyLinkedCreators(supabase),
    ]);
    setLinkedCreators(myCreatorsRes.data ?? []);

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
    setActiveBucket((current) => {
      if (current) return current;
      const hasPlaying = (bundle.watchlistItems ?? []).some((item) => item.bucket === 'PLAYING');
      return hasPlaying ? 'PLAYING' : 'ALL';
    });
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

  const visibleItems = useMemo(() => {
    if (activeBucket === 'PLAYING') return stage2Playing;
    if (activeBucket === 'BACKLOG') return stage1Watchlist;
    if (activeBucket === 'COMPLETED') return stage3Completed;
    return filteredBySearch;
  }, [activeBucket, stage1Watchlist, stage2Playing, stage3Completed, filteredBySearch]);

  const libraryGroups = useMemo(
    () => groupLibraryItems(sortLibraryItems(visibleItems, sortBy, globalLocale), groupBy, globalLocale),
    [visibleItems, sortBy, groupBy, globalLocale],
  );

  const watchlistByGameId = useMemo(() => {
    const map = new Map();
    for (const item of watchlistItems) {
      if (item.gameId) map.set(item.gameId, item);
    }
    return map;
  }, [watchlistItems]);

  const visibleChecklists = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return guideChecklists;
    return guideChecklists.filter((chk) => String(chk.title ?? '').toLowerCase().includes(q));
  }, [guideChecklists, searchTerm]);

  useEffect(() => {
    if (!activeBucket) return;
    writeCockpitViewPrefs({ viewMode, groupBy, sortBy, activeBucket });
  }, [viewMode, groupBy, sortBy, activeBucket]);

  useEffect(() => {
    if (groupBy !== 'alpha' || !GAME_BUCKETS.has(activeBucket)) return undefined;
    const nodes = libraryGroups
      .map((group) => document.getElementById(letterSectionId(group.key)))
      .filter(Boolean);
    if (nodes.length === 0) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0]?.target?.id?.replace('cockpit-letter-', '');
        if (first) setActiveLetter(first === 'hash' ? '#' : first);
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: 0 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [groupBy, activeBucket, libraryGroups]);

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
      openGame(item.game);
      return;
    }
    if (item.gameId) {
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

  const selectBucket = (bucket) => {
    setTileOpenId(null);
    setActiveBucket(bucket);
  };

  const changeViewMode = (mode) => {
    setTileOpenId(null);
    setViewMode(mode);
  };

  const changeGroupBy = (next) => {
    setTileOpenId(null);
    setGroupBy(next);
  };

  const handleToggleTile = (key) => {
    setTileOpenId((prev) => (prev === key ? null : key));
  };

  const jumpToLetter = (letter) => {
    setActiveLetter(letter);
    document.getElementById(letterSectionId(letter))?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleQuickAdd = (game, mode) => {
    const gameId = String(game?.id ?? '').trim();
    if (!gameId || !sessionUser?.id) return;
    const now = new Date().toISOString();
    const bucket = mode === 'PLAYING' ? 'PLAYING' : mode === 'COMPLETED' ? 'COMPLETED' : 'BACKLOG';
    const isPlatinum = mode === 'COMPLETED';
    const forcedProgress = mode === 'COMPLETED' ? 100 : mode === 'BACKLOG' ? 0 : null;

    setWatchlistItems((prev) => {
      const existing = prev.find((entry) => entry.gameId === gameId);
      const meta = watchlistGameMeta(game);
      const base = existing ?? {
        watchlistId: `opt:${sessionUser.id}:${gameId}`,
        gameId,
        playtimeHours: 0,
        titleId: null,
        rating: null,
        earnedTrophies: { platinum: 0, gold: 0, silver: 0, bronze: 0 },
        totalTrophies: game?.anzahl_trophaeen ?? null,
        guideCompletionTime: game?.spielzeit_komplettierer ?? null,
        progressPercent: 0,
        isPlatinum: false,
      };
      const next = {
        ...base,
        ...meta,
        status: bucket,
        bucket,
        completedWithoutPlatinum: false,
        isPlatinum: isPlatinum ? true : mode === 'BACKLOG' ? false : Boolean(base.isPlatinum),
        progressPercent: forcedProgress == null ? Number(base.progressPercent ?? 0) : forcedProgress,
        lastPlayedAt: now,
        game: game ?? base.game,
        title: getGameTitle(game, globalLocale) || base.title || gameId,
        cover: getGameCover(game, globalLocale) || base.cover || null,
        earnedTrophies: isPlatinum
          ? {
              platinum: Math.max(1, Number(base.earnedTrophies?.platinum ?? 0)),
              gold: Number(base.earnedTrophies?.gold ?? 0),
              silver: Number(base.earnedTrophies?.silver ?? 0),
              bronze: Number(base.earnedTrophies?.bronze ?? 0),
            }
          : base.earnedTrophies,
      };
      if (!existing) return [next, ...prev];
      return prev.map((entry) => (entry.gameId === gameId ? next : entry));
    });

    const options = mode === 'COMPLETED'
      ? { markPlatinum: true, progressPercent: 100 }
      : mode === 'BACKLOG'
        ? { markPlatinum: false, progressPercent: 0 }
        : {};

    updateWatchlistEntryStatus(supabase, sessionUser.id, gameId, bucket, options).then(({ error: statusErr }) => {
      if (statusErr) {
        setError(`Spiel konnte nicht gespeichert werden: ${statusErr.message}`);
        loadCockpit();
      }
    });
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
          onClick={() => onBack ? onBack() : (setCurrentView('home'), navigateToHome())}
          className="text-xs font-mono text-zinc-400 hover:text-[#00ff66] transition cursor-pointer"
        >
          ← Zurück
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

      <section className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-5 sm:p-7 shadow-xl space-y-5">
        <div className="flex flex-col gap-4 border-b border-zinc-800 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-white">
              🎮 Meine Spiele-Bibliothek
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Tabs, Poster, Karten oder Tabelle – Gruppierung und Sortierung bleiben in diesem Browser gespeichert.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start sm:justify-end lg:max-w-xl">
            <LibraryQuickAdd
              locale={globalLocale}
              watchlistByGameId={watchlistByGameId}
              onAdd={handleQuickAdd}
            />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setTileOpenId(null);
              }}
              placeholder="Bibliothek durchsuchen…"
              className="w-full rounded-xl border border-zinc-800 bg-[#121314] px-3.5 py-2 font-mono text-xs text-zinc-200 focus:border-zinc-600 focus:outline-hidden sm:w-64"
            />
          </div>
        </div>

        <div role="tablist" aria-label="Bibliothek" className="flex gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'PLAYING', label: `🔥 Angefangen (${stage2Playing.length})` },
            { id: 'BACKLOG', label: `📌 Watchlist (${stage1Watchlist.length})` },
            { id: 'COMPLETED', label: `🏆 Fertig & Platin (${stage3Completed.length})` },
            { id: 'ALL', label: `🌐 Alle Spiele (${filteredBySearch.length})` },
            { id: 'CHECKLISTS', label: `☑️ Checklisten (${guideChecklists.length})` },
            { id: 'SETTINGS', label: '⚙️ Sprachen, Koop & Konto' },
          ].map((tab) => {
            const selected = activeBucket === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectBucket(tab.id)}
                className={`shrink-0 cursor-pointer rounded-xl border px-3 py-2 font-mono text-xs font-bold transition ${
                  selected
                    ? 'border-[#00ff66] bg-[#00ff66] text-zinc-950'
                    : 'border-zinc-800 bg-[#121314] text-zinc-300 hover:border-zinc-600 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {GAME_BUCKETS.has(activeBucket) ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-zinc-800 bg-[#121314] p-0.5" role="group" aria-label="Ansicht">
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  title={mode.title}
                  aria-pressed={viewMode === mode.id}
                  onClick={() => changeViewMode(mode.id)}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 font-mono text-[11px] font-bold transition ${
                    viewMode === mode.id ? 'bg-[#00ff66] text-zinc-950' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
              Gruppe
              <select
                value={groupBy}
                onChange={(event) => changeGroupBy(event.target.value)}
                aria-label="Gruppierung"
                className="cursor-pointer rounded-lg border border-zinc-700 bg-[#121314] px-2 py-1.5 text-xs font-bold text-white focus:border-[#00ff66] focus:outline-hidden"
              >
                {GROUP_MODES.map((mode) => (
                  <option key={mode.id} value={mode.id}>{mode.label}</option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
              Sortierung
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                aria-label="Sortierung"
                className="cursor-pointer rounded-lg border border-zinc-700 bg-[#121314] px-2 py-1.5 text-xs font-bold text-white focus:border-[#00ff66] focus:outline-hidden"
              >
                {SORT_MODES.map((mode) => (
                  <option key={mode.id} value={mode.id}>{mode.label}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {activeBucket === 'SETTINGS' ? (
          <div className="space-y-5">
      <div className="rounded-xl border border-zinc-800 bg-[#121314] p-4 sm:p-5">
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
      </div>
      <div className="rounded-xl border border-zinc-800 bg-[#121314] p-4 sm:p-5">
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
      </div>

      <AccountDeleteCard
        locale={globalLocale}
        linkedCreators={linkedCreators}
        onDeleted={() => navigateToHome(globalLocale)}
      />
          </div>
        ) : activeBucket === 'CHECKLISTS' ? (
      <div className="rounded-xl border border-zinc-800 bg-[#121314] p-4 sm:p-5">
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
        ) : visibleChecklists.length === 0 ? (
          <div className="py-8 px-4 text-center rounded-xl border border-dashed border-zinc-800 bg-[#121314]/60">
            <p className="text-xs text-zinc-400">
              Du hast aktuell keine offenen Guide-Checklisten mit abgehakten Schritten.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {visibleChecklists.map((chk) => {
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
                      <GameFallbackCover
                        src={chk.cover}
                        title={chk.title}
                        alt={chk.title}
                        variant="thumb"
                        imgClassName="h-full w-full object-cover"
                        className="h-full w-full"
                      />
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
      </div>
        ) : loading || !activeBucket ? (
          <div className="py-12 text-center font-mono text-sm text-zinc-500 animate-pulse">
            Lade Spiele-Bibliothek…
          </div>
        ) : areaErrors.watchlist ? (
          <div className="rounded-xl border border-red-900/40 bg-red-500/10 p-4 font-mono text-xs text-red-300">
            Fehler beim Laden der Bibliothek: {areaErrors.watchlist.message}
          </div>
        ) : (
          <>
            {groupBy === 'alpha' && libraryGroups.length > 0 ? (
              <LibraryAlphaNav
                groups={libraryGroups}
                activeLetter={activeLetter}
                onJump={jumpToLetter}
              />
            ) : null}
            <LibraryBucketView
              groups={libraryGroups}
              viewMode={viewMode}
              groupBy={groupBy}
              locale={globalLocale}
              tileOpenId={tileOpenId}
              onToggleTile={handleToggleTile}
              onOpenGuide={handleOpenGameGuide}
              onStart={handleStartGame}
              onPlatinum={handleCompleteWithPlatinum}
              onCompleteWithout={handleCompleteWithoutPlatinum}
              onWatchlist={handleMoveToWatchlist}
              userId={sessionUser.id}
              onRatingSaved={handleRatingSaved}
              emptyLabel={
                searchTerm.trim()
                  ? `Keine Treffer für „${searchTerm.trim()}“.`
                  : activeBucket === 'PLAYING'
                    ? 'Aktuell keine angefangenen Spiele.'
                    : activeBucket === 'BACKLOG'
                      ? 'Keine Spiele auf der Watchlist.'
                      : activeBucket === 'COMPLETED'
                        ? 'Noch keine abgeschlossenen oder platinierten Spiele.'
                        : 'Deine Bibliothek ist noch leer. Lege mit „+ Spiel hinzufügen“ die ersten Titel ab.'
              }
            />
          </>
        )}
      </section>

    </div>
  );
}

export default ProfilePage;
