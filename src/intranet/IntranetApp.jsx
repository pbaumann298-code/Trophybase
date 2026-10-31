import { Component, useEffect, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import {
  fetchMyCreatorProfile,
  isAdminUser,
  readCachedSessionUser,
  readDraftReturnContext,
} from '../lib/adminAccess';
import AdminLoginForm from '../components/admin/AdminLoginForm';
import IntranetGameSearch from '../components/intranet/IntranetGameSearch';
import IntranetCreatorSearch from '../components/intranet/IntranetCreatorSearch';
import IntranetFollowups from '../components/intranet/IntranetFollowups';
import IntranetRohmaterial from '../components/intranet/IntranetRohmaterial';
import IntranetDrafts from '../components/intranet/IntranetDrafts';
import IntranetRadarAndServertot from '../components/intranet/IntranetRadarAndServertot';
import IntranetRoadmap from '../components/intranet/IntranetRoadmap';
import { useAdminFollowups } from '../hooks/useAdminFollowups';

class IntranetErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { message: '' };
  }

  static getDerivedStateFromError(error) {
    return { message: error?.message || 'Anzeige fehlgeschlagen.' };
  }

  render() {
    if (this.state.message) {
      return (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-5 text-sm text-red-300">
          {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}

const TABS = [
  { id: 'games', label: 'Spiele', icon: '🎮' },
  { id: 'entwuerfe', label: 'Entwürfe', icon: '📝' },
  { id: 'd_freigabe', label: 'D-Freigabe (Radar)', icon: '⚡' },
  { id: 'servertot_qa', label: 'Krankenstation', icon: '🏥' },
  { id: 'roadmap', label: 'Roadmap & Ideen', icon: '🗺️' },
  { id: 'followups', label: 'Wiedervorlage', icon: '⚑' },
  { id: 'creators', label: 'Creator', icon: '▶' },
  { id: 'rohmaterial', label: 'Rohmaterial', icon: '🧪' },
];

function IntranetApp() {
  const [sessionUser, setSessionUser] = useState(() => readCachedSessionUser());
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [bootStep, setBootStep] = useState('Prüfe Session...');
  const authReady = !authLoading;
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'games';
    const draftCtx = readDraftReturnContext();
    if (draftCtx?.gameId) return 'entwuerfe';
    const hash = String(window.location.hash ?? '').replace('#', '').toLowerCase();
    const searchTab = new URLSearchParams(window.location.search).get('tab')?.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();
    if (
      hash === 'entwuerfe' ||
      hash === 'drafts' ||
      searchTab === 'entwuerfe' ||
      searchTab === 'drafts' ||
      pathname.includes('/entwuerfe') ||
      pathname.includes('/drafts')
    ) {
      return 'entwuerfe';
    }
    if (
      hash === 'roadmap' ||
      searchTab === 'roadmap' ||
      pathname.includes('/roadmap')
    ) {
      return 'roadmap';
    }
    return 'games';
  });
  const isAdmin = isAdminUser(sessionUser);
  const { entries: followups } = useAdminFollowups(
    !authLoading && isAdmin ? sessionUser?.id : null,
  );
  const [draftsCount, setDraftsCount] = useState(0);
  // „🚀 Entwürfe + Follow“ oder Rückkehr über „⬅️ Zurück zum Entwurf“: Spiel vorauswählen.
  const [draftTargetGameId, setDraftTargetGameId] = useState(() => {
    const draftCtx = readDraftReturnContext();
    return draftCtx?.gameId || null;
  });

  const openInDrafts = (gameId) => {
    setDraftTargetGameId(gameId || null);
    setActiveTab('entwuerfe');
  };

  useEffect(() => {
    if (authLoading || !sessionUser || !isAdmin) return undefined;
    let cancelled = false;
    async function loadDraftsCount() {
      try {
        const { data, error } = await supabase
          .from('staging_game_guides')
          .select('game_id')
          .range(0, 999);
        if (cancelled || error || !data) return;
        const uniqueGames = new Set(data.map((r) => r.game_id).filter(Boolean));
        setDraftsCount(uniqueGames.size);
      } catch (err) {
        console.error('Entwürfe-Zähler Fehler:', err);
      }
    }
    loadDraftsCount();
    return () => {
      cancelled = true;
    };
  }, [activeTab, authLoading, sessionUser, isAdmin]);

  // Harter 3,5-Sekunden-Fallback (Watchdog-Timer): verhindert zu 100 % einen ewigen Ladebildschirm
  useEffect(() => {
    if (!authLoading) return undefined;
    const watchdog = window.setTimeout(() => {
      setSessionUser((prev) => prev || readCachedSessionUser());
      setAuthLoading(false);
    }, 3500);
    return () => window.clearTimeout(watchdog);
  }, [authLoading]);

  useEffect(() => {
    let cancelled = false;
    let initialResolved = false;

    async function init() {
      setBootStep('Prüfe Session...');
      try {
        const timeoutPromise = new Promise((resolve) => {
          window.setTimeout(
            () => resolve({ data: { session: null }, timedOut: true }),
            3000,
          );
        });

        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          timeoutPromise,
        ]);

        if (sessionResult?.error) {
          console.error('Intranet getSession Fehler:', sessionResult.error.message);
        }

        const user =
          sessionResult?.data?.session?.user ?? readCachedSessionUser() ?? null;

        if (!cancelled) {
          setBootStep('Prüfe Admin-Rechte...');
          setSessionUser(user);
        }

        if (user) {
          if (isAdminUser(user)) {
            // Admin braucht nicht auf Creator-RPC zu warten; im Hintergrund nachladen
            window.setTimeout(() => {
              fetchMyCreatorProfile(supabase).then((profile) => {
                if (!cancelled && profile) setCreatorProfile(profile);
              });
            }, 0);
          } else {
            const profile = await fetchMyCreatorProfile(supabase, 2000);
            if (!cancelled) {
              setCreatorProfile(profile);
            }
          }
        }
      } catch (err) {
        console.error('Intranet Auth-Init Fehler:', err);
        if (!cancelled) {
          setSessionUser((prev) => prev || readCachedSessionUser());
        }
      } finally {
        initialResolved = true;
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    init();

    // WICHTIG: KEINE await supabase...-Calls direkt in onAuthStateChange (verursacht Lock-Deadlock in supabase-js v2)!
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!initialResolved && event === 'INITIAL_SESSION') {
        return;
      }

      if (event === 'SIGNED_OUT') {
        if (!cancelled) {
          setSessionUser(null);
          setCreatorProfile(null);
        }
        return;
      }

      const user = session?.user ?? null;
      if (user && !cancelled) {
        setSessionUser(user);
        // DB-/RPC-Aufruf zwingend über setTimeout entkoppeln!
        window.setTimeout(() => {
          if (cancelled) return;
          fetchMyCreatorProfile(supabase).then((profile) => {
            if (!cancelled) setCreatorProfile(profile);
          });
        }, 0);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async (email, password) => {
    setLoginLoading(true);
    setLoginError('');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoginLoading(false);
      setLoginError(error.message);
      return;
    }

    const admin = isAdminUser(data.user);
    const profile = await fetchMyCreatorProfile(supabase);
    setLoginLoading(false);

    if (!admin && !profile) {
      await supabase.auth.signOut();
      setLoginError('Kein Admin- oder Creator-Zugang für dieses Konto.');
      return;
    }

    setCreatorProfile(profile);
    setSessionUser(data.user);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCreatorProfile(null);
    setSessionUser(null);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#0a0b0c] px-4 text-center font-mono">
        <p className="text-sm text-zinc-300">Intranet wird geladen…</p>
        <p className="text-xs text-zinc-500">{bootStep}</p>
        <button
          type="button"
          onClick={() => {
            setSessionUser((prev) => prev || readCachedSessionUser());
            setAuthLoading(false);
          }}
          className="mt-2 rounded-xl border border-[#00ff66]/40 bg-[#00ff66]/10 px-4 py-2 text-xs font-bold text-[#00ff66] hover:bg-[#00ff66]/20 transition cursor-pointer"
        >
          ⚡ Lade-Sperre überspringen &amp; direkt öffnen
        </button>
      </div>
    );
  }

  const isCreatorOnly = Boolean(sessionUser && !isAdmin && creatorProfile);

  if (!sessionUser || (!isAdmin && !creatorProfile)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <AdminLoginForm
          onLogin={handleLogin}
          loading={loginLoading}
          errorMessage={loginError}
          kicker="Interner Bereich"
          title="Intranet & Creator Studio"
          submitLabel="Anmelden"
        />
        <p className="mt-6 text-xs text-zinc-500 text-center max-w-md leading-relaxed">
          Auf dem Handy diese Adresse speichern:{' '}
          <span className="font-mono text-zinc-400">trophybase.app/intranet.html</span>
        </p>
        <a
          href="/"
          className="mt-4 text-[10px] font-mono uppercase tracking-wider text-zinc-600 hover:text-zinc-400 no-underline"
        >
          Zur Website
        </a>
        <p className="mt-8 text-[10px] text-zinc-600 font-mono uppercase tracking-widest">
          noindex · nofollow
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0b0c] text-zinc-200">
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-[#121314]/95 backdrop-blur px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-600">
              {isCreatorOnly ? 'TrophyBase Creator Studio' : 'TrophyBase Intranet'}
            </p>
            <h1 className="text-lg font-bold text-white">
              {isCreatorOnly ? (
                <>
                  TrophyBase Creator Studio{' '}
                  <span className="text-[#00ff66]">· {creatorProfile.channel_name}</span>
                </>
              ) : (
                <>
                  Interne Suche <span className="text-[#00ff66]">· Datenbank</span>
                </>
              )}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-500 hidden sm:inline">{sessionUser.email}</span>
            {isAdmin && (
              <a
                href="/admin.html"
                className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-[#00ff66] hover:border-[#00ff66]/40 no-underline"
              >
                Admin
              </a>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-900/50"
            >
              Abmelden
            </button>
          </div>
        </div>

        {!isCreatorOnly && (
          <nav className="max-w-7xl mx-auto flex gap-1 mt-4 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition ${
                  activeTab === tab.id
                    ? 'bg-[#00ff66]/10 text-[#00ff66] border border-[#00ff66]/30'
                    : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                }`}
              >
                <span aria-hidden>{tab.icon}</span>
                {tab.label}
                {tab.id === 'entwuerfe' && draftsCount > 0 ? (
                  <span className="rounded-full bg-[#00ff66]/15 px-1.5 py-0.5 text-[10px] text-[#00ff66] border border-[#00ff66]/30 font-bold">
                    {draftsCount}
                  </span>
                ) : null}
                {tab.id === 'followups' && followups.length > 0 ? (
                  <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                    {followups.length}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
        <IntranetErrorBoundary>
          {isCreatorOnly ? (
            <IntranetDrafts
              initialDataSource="staging"
              initialGameId={draftTargetGameId}
              creatorProfile={creatorProfile}
              isCreatorMode={true}
            />
          ) : (
            <>
              {activeTab === 'games' && (
                <IntranetGameSearch sessionUser={sessionUser} onOpenInDrafts={openInDrafts} />
              )}
              {activeTab === 'entwuerfe' && (
                <IntranetDrafts
                  initialDataSource="staging"
                  initialGameId={draftTargetGameId}
                  creatorProfile={creatorProfile}
                  isCreatorMode={false}
                />
              )}
              {activeTab === 'd_freigabe' && (
                <IntranetRadarAndServertot
                  mode="d_freigabe"
                  sessionUser={sessionUser}
                  onOpenInDrafts={openInDrafts}
                />
              )}
              {activeTab === 'servertot_qa' && (
                <IntranetRadarAndServertot
                  mode="servertot"
                  sessionUser={sessionUser}
                  onOpenInDrafts={openInDrafts}
                />
              )}
              {activeTab === 'roadmap' && <IntranetRoadmap />}
              {activeTab === 'followups' && (
                <IntranetFollowups sessionUser={sessionUser} onOpenInDrafts={openInDrafts} />
              )}
              {activeTab === 'creators' && <IntranetCreatorSearch />}
              {activeTab === 'rohmaterial' && <IntranetRohmaterial />}
            </>
          )}
        </IntranetErrorBoundary>
      </main>
    </div>
  );
}

export default IntranetApp;
