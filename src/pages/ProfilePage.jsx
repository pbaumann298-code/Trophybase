import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import Inbox from '../components/Inbox';
import WatchlistProgressBar from '../components/WatchlistProgressBar';
import { gameGuidePath, navigateToGame, navigateToHome } from '../lib/routeUtils';
import { useLocale } from '../context/LocaleContext';
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
  updateWatchlistEntryStatus,
  upsertUserGameRating,
} from '../lib/userAreaQueries';

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

const LIBRARY_TABS = [
  { id: 'ALL', label: 'Alle' },
  { id: 'PLAYING', label: '🔥 In Arbeit (PLAYING)' },
  { id: 'COMPLETED', label: '🏆 Platin / 100% (COMPLETED)' },
  { id: 'BACKLOG', label: '📌 Merkliste (BACKLOG)' },
];

function TrophyBreakdownPills({ earnedTrophies, isPlatinum }) {
  const p = Number(earnedTrophies?.platinum ?? (isPlatinum ? 1 : 0));
  const g = Number(earnedTrophies?.gold ?? 0);
  const s = Number(earnedTrophies?.silver ?? 0);
  const b = Number(earnedTrophies?.bronze ?? 0);

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
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
    <div
      className={`mt-3 pt-3 border-t ${
        item.isPlatinum ? 'border-[#00ff66]/20' : 'border-zinc-800/80'
      }`}
    >
      <form
        onSubmit={handleSaveRating}
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
            {item.isPlatinum ? '🏆 Platin-Datenpunkt:' : '📊 Community-Rating:'}
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
            {saving ? '…' : savedFlash ? '✓ Gespendet!' : existing ? 'Aktualisieren' : 'Spenden'}
          </button>
        </div>
      </form>
      {err ? <p className="text-[10px] text-red-400 mt-1 font-mono">{err}</p> : null}
    </div>
  );
}

function ProfilePage({ sessionUser, setCurrentView, onRequestLogin, openGame }) {
  const { globalLocale } = useLocale();

  const [profile, setProfile] = useState(null);
  const [watchlistItems, setWatchlistItems] = useState([]);
  const [guideChecklists, setGuideChecklists] = useState([]);
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);
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

  // Filter-Tab für Bibliothek
  const [libraryFilter, setLibraryFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [resettingGameId, setResettingGameId] = useState(null);

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
      setUnreadInboxCount(0);
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

    setWatchlistItems(bundle.watchlistItems);
    setGuideChecklists(bundle.guideChecklists);
    setUnreadInboxCount(bundle.unreadInboxCount);
    setAreaErrors(bundle.errors);
    setLoading(false);
  }, [sessionUser?.id, globalLocale]);

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

  const tabCounts = useMemo(() => {
    const counts = { ALL: watchlistItems.length, PLAYING: 0, COMPLETED: 0, BACKLOG: 0 };
    for (const item of watchlistItems) {
      if (counts[item.bucket] != null) counts[item.bucket] += 1;
    }
    return counts;
  }, [watchlistItems]);

  const filteredWatchlist = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return watchlistItems.filter((item) => {
      if (libraryFilter !== 'ALL' && item.bucket !== libraryFilter) return false;
      if (q) {
        const matchTitle = String(item.title ?? '').toLowerCase().includes(q);
        const matchTitleId = String(item.titleId ?? '').toLowerCase().includes(q);
        return matchTitle || matchTitleId;
      }
      return true;
    });
  }, [watchlistItems, libraryFilter, searchTerm]);

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

  const handleStatusChange = async (item, nextBucket) => {
    const { error: statusErr } = await updateWatchlistEntryStatus(
      supabase,
      sessionUser.id,
      item.gameId,
      nextBucket,
    );
    if (statusErr) {
      setError(`Status-Update fehlgeschlagen: ${statusErr.message}`);
      return;
    }
    setWatchlistItems((prev) =>
      prev.map((w) =>
        w.gameId === item.gameId ? { ...w, status: nextBucket, bucket: nextBucket } : w,
      ),
    );
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

    // Auch den lokalen Browser-Cache für dieses Spiel leeren, damit er nicht sofort wieder hochgesynct wird
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
            sublabel={`${tabCounts.PLAYING} aktiv · ${tabCounts.COMPLETED} fertig`}
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
          BEREICH B: Meine Spiele-Bibliothek & Platin-Zeiten (user_watchlist + games)
      =================================================================== */}
      <section className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-5 sm:p-7 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-extrabold text-white tracking-tight">
              🎮 Meine Spiele-Bibliothek & Platin-Zeiten
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Deine synchronisierten PSN-Spiele, Fortschritte und 1-Klick-Community-Ratings
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

        {/* Filter-Tabs */}
        <div className="flex flex-wrap items-center gap-2 pb-4 mb-5 border-b border-zinc-800">
          {LIBRARY_TABS.map((tab) => {
            const active = libraryFilter === tab.id;
            const count = tabCounts[tab.id] ?? 0;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLibraryFilter(tab.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold border transition cursor-pointer ${
                  active
                    ? 'bg-[#00ff66]/15 text-[#00ff66] border-[#00ff66]/40 shadow-xs'
                    : 'bg-[#121314] text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                    active ? 'bg-[#00ff66]/20 text-[#00ff66]' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm font-mono text-zinc-500 animate-pulse">
            Lade Spiele-Bibliothek…
          </div>
        ) : areaErrors.watchlist ? (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-900/40 text-xs text-red-300 font-mono">
            Fehler beim Laden der Bibliothek: {areaErrors.watchlist.message}
          </div>
        ) : filteredWatchlist.length === 0 ? (
          <div className="py-10 px-4 text-center rounded-xl border border-dashed border-zinc-800 bg-[#121314]/60">
            <p className="text-sm text-zinc-400 font-medium">
              {watchlistItems.length === 0
                ? 'Noch keine Spiele in deiner Bibliothek vorhanden.'
                : 'Keine Spiele in diesem Filter-Tab gefunden.'}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Markiere Spiele mit dem ☆ in einem Guide oder starte den PSN-Sync über deine PSN-ID.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {filteredWatchlist.map((item) => {
              const guideHref = item.game
                ? gameGuidePath(item.game, globalLocale)
                : `/guide/${item.gameId}`;

              return (
                <div
                  key={item.watchlistId || item.gameId}
                  className={`rounded-xl border p-4 bg-[#121314] transition ${
                    item.isPlatinum
                      ? 'border-[#00ff66]/35 shadow-sm shadow-[#00ff66]/5'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start gap-4">
                    {/* Cover + Klick zum Guide */}
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

                    {/* Haupt-Infos */}
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

                          {/* Badges: CUSA/PPSA title_id, PSN-Spielzeit, Status */}
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
                                Guide-Richtwert: {item.guideCompletionTime}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Status-Umschalter */}
                        <div className="flex items-center gap-2">
                          <select
                            value={item.bucket}
                            onChange={(e) => handleStatusChange(item, e.target.value)}
                            aria-label="Bibliothek-Status"
                            className="text-[11px] font-mono font-bold bg-[#1a1b1c] text-zinc-300 border border-zinc-700 rounded-lg px-2.5 py-1 focus:outline-hidden cursor-pointer"
                          >
                            <option value="PLAYING">🔥 PLAYING</option>
                            <option value="COMPLETED">🏆 COMPLETED</option>
                            <option value="BACKLOG">📌 BACKLOG</option>
                          </select>
                        </div>
                      </div>

                      {/* Fortschrittsbalken + Trophäen-Aufschlüsselung */}
                      <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 max-w-md">
                          <WatchlistProgressBar percent={item.progressPercent} />
                        </div>
                        <TrophyBreakdownPills
                          earnedTrophies={item.earnedTrophies}
                          isPlatinum={item.isPlatinum}
                        />
                      </div>

                      {/* 1-Klick-Rating (Community-Datenpunkt spenden) */}
                      <InlineGameRatingControl
                        item={item}
                        userId={sessionUser.id}
                        onSaved={handleRatingSaved}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
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

      {/* Postfach (kompakt am Ende) */}
      <section className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-5 sm:p-7 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white">📬 System-Postfach</h2>
          {unreadInboxCount > 0 ? (
            <span className="text-[10px] font-mono font-bold bg-[#00ff66]/15 text-[#00ff66] border border-[#00ff66]/30 px-2 py-0.5 rounded-sm">
              {unreadInboxCount} ungelesen
            </span>
          ) : null}
        </div>
        <Inbox sessionUser={sessionUser} setCurrentView={setCurrentView} embedded />
      </section>
    </div>
  );
}

export default ProfilePage;
