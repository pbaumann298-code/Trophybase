import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Inbox from '../components/Inbox';
import WatchlistProgressBar from '../components/WatchlistProgressBar';
import { navigateToHome } from '../lib/routeUtils';
import {
  getProfileStatusLabel,
  PROFILE_STATUS,
  registerPsnId,
  regenerateVerificationCode,
  requestPsnVerification,
} from '../lib/profileQueries';
import {
  fetchProfileWatchlistPreview,
  fetchUserAreaStats,
  getUserAreaErrorHint,
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
      className={`inline-flex text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${
        styles[resolved] ?? 'bg-zinc-800/50 text-zinc-500 border-zinc-700'
      }`}
    >
      {getProfileStatusLabel(resolved)}
    </span>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#121314] p-4 min-w-0">
      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-zinc-600 mt-1">{hint}</p>}
    </div>
  );
}

function ProfilePage({ sessionUser, setCurrentView, onRequestLogin, openGame }) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({
    watchlistCount: 0,
    earnedTrophiesCount: 0,
    unreadInboxCount: 0,
  });
  const [watchlistPreview, setWatchlistPreview] = useState([]);
  const [areaErrors, setAreaErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [psnId, setPsnId] = useState('');
  const [datenschutzConsent, setDatenschutzConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadUserArea = useCallback(async () => {
    if (!sessionUser?.id) {
      setProfile(null);
      setStats({ watchlistCount: 0, earnedTrophiesCount: 0, unreadInboxCount: 0 });
      setWatchlistPreview([]);
      setAreaErrors({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [areaStats, watchlistRes] = await Promise.all([
      fetchUserAreaStats(supabase, sessionUser.id),
      fetchProfileWatchlistPreview(supabase, sessionUser.id),
    ]);

    if (areaStats.profileError && !areaStats.profile) {
      setError(getUserAreaErrorHint(areaStats.profileError, 'profile') ?? areaStats.profileError.message);
    }

    setProfile(areaStats.profile);
    if (areaStats.profile?.psn_id) setPsnId(areaStats.profile.psn_id);

    setStats({
      watchlistCount: areaStats.watchlistCount,
      earnedTrophiesCount: areaStats.earnedTrophiesCount,
      unreadInboxCount: areaStats.unreadInboxCount,
    });

    const errors = { ...areaStats.errors };
    if (watchlistRes.error) errors.watchlist = watchlistRes.error;
    setAreaErrors(errors);
    setWatchlistPreview(watchlistRes.items ?? []);
    setLoading(false);
  }, [sessionUser?.id]);

  useEffect(() => {
    loadUserArea();
  }, [loadUserArea]);

  if (!sessionUser) {
    return (
      <div className="max-w-lg mx-auto w-full px-4 py-16 text-center">
        <p className="text-sm text-zinc-400 mb-4">Melde dich an, um dein Nutzerprofil zu öffnen.</p>
        <button
          type="button"
          onClick={onRequestLogin}
          className="text-xs font-bold text-zinc-950 bg-[#00ff66] hover:bg-[#00e65c] px-5 py-2.5 rounded-xl transition"
        >
          Anmelden
        </button>
      </div>
    );
  }

  const verificationStatus = profile?.verification_status ?? PROFILE_STATUS.none;

  const hasPendingVerification =
    profile?.verification_code &&
    [PROFILE_STATUS.pending, PROFILE_STATUS.verifying, PROFILE_STATUS.failed].includes(
      verificationStatus,
    );

  const isVerified = verificationStatus === PROFILE_STATUS.verified;

  const handleRegisterPsn = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const { data, error: regError } = await registerPsnId(
      supabase,
      sessionUser.id,
      psnId,
      datenschutzConsent,
    );

    setSubmitting(false);

    if (regError) {
      setError(regError.message);
      return;
    }

    setProfile(data);
    setSuccess('PSN-ID gespeichert. Füge den Code in deine PSN-Profilbeschreibung ein.');
    await loadUserArea();
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
    await loadUserArea();
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
    setSuccess('Neuer Verifizierungscode erstellt.');
  };

  const handleOpenWatchlistGame = (item) => {
    if (!openGame) return;
    if (item.game) {
      openGame(item.game);
      return;
    }
    openGame(item.game ?? { id: item.gameId, platform_game_id: item.gameId });
  };

  return (
    <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">
      <button
        type="button"
        onClick={() => {
          setCurrentView('home');
          navigateToHome();
        }}
        className="text-xs text-zinc-500 hover:text-zinc-300 mb-6 transition"
      >
        ← Zurück zur Startseite
      </button>

      {/* Account-Übersicht */}
      <div className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#00ff66] border border-[#00ff66]/20 bg-[#00ff66]/10 px-2 py-0.5 rounded">
              Nutzerbereich
            </span>
            <h1 className="text-xl font-bold text-white mt-2 mb-1">Mein Profil</h1>
            <p className="text-xs text-zinc-500 font-mono truncate">{sessionUser.email}</p>
          </div>
          <StatusBadge status={verificationStatus} />
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500 font-mono animate-pulse py-4 text-center">
            Nutzerdaten werden geladen…
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Watchlist"
              value={stats.watchlistCount}
              hint="Aktive Spiele"
            />
            <StatCard
              label="PSN-Sync"
              value={stats.earnedTrophiesCount}
              hint="Verdiente Trophäen"
            />
            <StatCard
              label="Postfach"
              value={stats.unreadInboxCount}
              hint="Ungelesen"
            />
          </div>
        )}

        {!loading && areaErrors.earnedTrophies && (
          <p className="mt-4 text-[10px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
            {getUserAreaErrorHint(areaErrors.earnedTrophies, 'earnedTrophies')}
          </p>
        )}
      </div>

      {/* Watchlist-Vorschau */}
      <div className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl mb-6">
        <h2 className="text-sm font-bold text-white mb-1">Meine Watchlist</h2>
        <p className="text-xs text-zinc-500 mb-4">Zuletzt bearbeitete Spiele aus deinem Dashboard</p>

        {loading && (
          <p className="text-xs text-zinc-500 italic animate-pulse">Watchlist wird geladen…</p>
        )}

        {!loading && areaErrors.watchlist && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-900/40 rounded-lg p-3">
            Watchlist: {areaErrors.watchlist.message}
          </p>
        )}

        {!loading && !areaErrors.watchlist && watchlistPreview.length === 0 && (
          <p className="text-xs text-zinc-500 italic">
            Noch keine Spiele auf der Watchlist. Markiere Spiele mit dem ☆ auf der Startseite oder in
            einem Guide.
          </p>
        )}

        {!loading && watchlistPreview.length > 0 && (
          <ul className="flex flex-col gap-2">
            {watchlistPreview.map((item) => (
              <li key={item.watchlistId || item.gameId}>
                <button
                  type="button"
                  onClick={() => handleOpenWatchlistGame(item)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-[#121314] hover:border-[#00ff66]/30 transition text-left"
                >
                  <div className="w-10 h-14 flex-shrink-0 rounded overflow-hidden border border-zinc-800 bg-zinc-900">
                    {item.cover ? (
                      <img src={item.cover} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm">🎮</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-zinc-200 truncate">{item.title}</p>
                    <div className="mt-2">
                      <WatchlistProgressBar percent={item.progress} />
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* PSN-Verknüpfung */}
      <div className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl mb-6">
        <h2 className="text-sm font-bold text-white mb-1">PSN-Verknüpfung</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Verknüpfe deinen PlayStation-Account für Trophäen-Sync und Verifizierung
        </p>

        {!loading && (
          <>
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 rounded-xl bg-[#00ff66]/10 border border-[#00ff66]/25 text-xs text-[#00ff66]">
                {success}
              </div>
            )}

            {verificationStatus === PROFILE_STATUS.none && !profile?.psn_id && (
              <div className="mb-4 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-400">
                Noch keine PSN-ID hinterlegt. Trage deine Online-ID ein, um den Verifizierungsprozess
                zu starten.
              </div>
            )}

            {isVerified && profile?.psn_id && (
              <div className="mb-6 p-4 rounded-xl bg-[#00ff66]/5 border border-[#00ff66]/20">
                <p className="text-sm text-zinc-300">
                  Dein PSN-Account{' '}
                  <span className="font-mono text-[#00ff66]">{profile.psn_id}</span> ist verifiziert.
                  Verdiente Trophäen werden automatisch in deinen Guides angezeigt.
                </p>
              </div>
            )}

            {!isVerified && (
              <form onSubmit={handleRegisterPsn} className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="psn-id"
                    className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider"
                  >
                    PSN-ID (Online-ID)
                  </label>
                  <input
                    id="psn-id"
                    type="text"
                    required
                    value={psnId}
                    onChange={(e) => setPsnId(e.target.value)}
                    placeholder="z. B. TrophyHunter_DE"
                    className="bg-[#121314] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600 w-full font-mono"
                    disabled={submitting || verificationStatus === PROFILE_STATUS.verifying}
                  />
                </div>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={datenschutzConsent || profile?.datenschutz_einwilligung === true}
                    onChange={(e) => setDatenschutzConsent(e.target.checked)}
                    disabled={profile?.datenschutz_einwilligung === true}
                    className="mt-0.5 rounded border-zinc-700 bg-[#121314] text-[#00ff66] focus:ring-0 w-4 h-4 cursor-pointer flex-shrink-0"
                  />
                  <span className="text-xs text-zinc-400 leading-relaxed group-hover:text-zinc-300 transition">
                    Ich willige ein, dass TrophyBase meine PSN-ID und Trophäendaten gemäß der{' '}
                    <a
                      href="/datenschutz"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#00ff66] hover:underline"
                    >
                      Datenschutzerklärung (DSGVO)
                    </a>{' '}
                    verarbeitet.
                    <span className="text-red-400"> *</span>
                  </span>
                </label>

                {profile?.eingewilligt_am && (
                  <p className="text-[10px] text-zinc-600 font-mono">
                    Eingewilligt am:{' '}
                    {new Date(profile.eingewilligt_am).toLocaleString('de-DE', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    verificationStatus === PROFILE_STATUS.verifying ||
                    (!datenschutzConsent && !profile?.datenschutz_einwilligung)
                  }
                  className="w-full text-xs font-bold text-zinc-950 bg-[#00ff66] hover:bg-[#00e65c] disabled:opacity-40 disabled:cursor-not-allowed py-3 rounded-xl transition"
                >
                  {submitting ? 'Speichern…' : profile?.psn_id ? 'PSN-ID aktualisieren' : 'PSN-ID speichern'}
                </button>
              </form>
            )}

            {hasPendingVerification && !isVerified && (
              <div className="p-5 rounded-xl bg-[#121314] border border-zinc-800 flex flex-col gap-4">
                <div>
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                    Verifizierungscode
                  </p>
                  <p className="text-2xl font-mono font-bold text-[#00ff66] tracking-widest">
                    {profile.verification_code}
                  </p>
                </div>

                <ol className="list-decimal list-inside space-y-1.5 text-xs text-zinc-500">
                  <li>Code in die PSN-Profilbeschreibung einfügen</li>
                  <li>Profil speichern und „Jetzt verifizieren“ klicken</li>
                  <li>Code nach Erfolg wieder entfernen</li>
                </ol>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={verifying || verificationStatus === PROFILE_STATUS.verifying}
                    className="flex-1 text-xs font-bold text-zinc-950 bg-[#00ff66] hover:bg-[#00e65c] disabled:opacity-40 py-3 rounded-xl transition"
                  >
                    {verifying || verificationStatus === PROFILE_STATUS.verifying
                      ? 'Wird geprüft…'
                      : 'Jetzt verifizieren'}
                  </button>
                  {verificationStatus === PROFILE_STATUS.failed && (
                    <button
                      type="button"
                      onClick={handleRegenerateCode}
                      disabled={submitting}
                      className="flex-1 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 py-3 rounded-xl transition border border-zinc-700"
                    >
                      Neuen Code erzeugen
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Postfach */}
      <div className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl">
        <Inbox sessionUser={sessionUser} setCurrentView={setCurrentView} embedded />
      </div>
    </div>
  );
}

export default ProfilePage;
