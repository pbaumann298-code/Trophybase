import { Component, Suspense, lazy, useEffect, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import {
  isAdminUser,
  readAdminTab,
  readCachedSessionUser,
  readDraftReturnContext,
  writeAdminTab,
} from '../lib/adminAccess';
import AdminLoginForm from '../components/admin/AdminLoginForm';
import AdminPipelineLawNotice from '../components/admin/AdminPipelineLawNotice';
import AdminPushControl from '../admin-apps/AdminPushControl';
import AdminWaffleMenu from '../admin-apps/AdminWaffleMenu';

const WebsitePanel = lazy(() => import('../components/admin/WebsitePanel'));
const IntranetGameSearch = lazy(() => import('../components/intranet/IntranetGameSearch'));
const IntranetFollowups = lazy(() => import('../components/intranet/IntranetFollowups'));
const IntranetDrafts = lazy(() => import('../components/intranet/IntranetDrafts'));
const IntranetRadarAndServertot = lazy(() => import('../components/intranet/IntranetRadarAndServertot'));
const IntranetRoadmap = lazy(() => import('../components/intranet/IntranetRoadmap'));
const CommunityReportsPanel = lazy(() => import('../components/admin/CommunityReportsPanel'));
const IntranetCreators = lazy(() => import('../components/intranet/IntranetCreators'));
const ScriptsPanel = lazy(() => import('../components/admin/ScriptsPanel'));

const TABS = [
  { id: 'website', label: 'Website', icon: '🌐' },
  { id: 'database', label: 'Datenbank', icon: '🗄' },
  { id: 'followups', label: 'Wiedervorlage', icon: '📌' },
  { id: 'entwuerfe', label: 'Entwürfe', icon: '📝' },
  { id: 'd_freigabe', label: 'D-Freigabe (Radar)', icon: '⚡' },
  { id: 'servertot_qa', label: 'Krankenstation', icon: '🏥' },
  { id: 'roadmap', label: 'Roadmap & Ideen', icon: '🗺️' },
  { id: 'reports', label: 'Community Reports', icon: '⚑' },
  { id: 'creators', label: 'Creator', icon: '🎬' },
  { id: 'scripts', label: 'Workflows & Skripte', icon: '⚙️' },
];

const TAB_IDS = new Set(TABS.map((tab) => tab.id));

class AdminErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { message: '' };
  }

  static getDerivedStateFromError(error) {
    return { message: error?.message || 'Anzeige im Tab fehlgeschlagen.' };
  }

  render() {
    if (this.state.message) {
      return (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300 flex items-center justify-between gap-3">
          <span>{this.state.message}</span>
          <button
            type="button"
            onClick={() => this.setState({ message: '' })}
            className="rounded-lg border border-red-400/40 bg-red-500/20 px-3 py-1 font-mono font-bold text-red-200 cursor-pointer"
          >
            Neu versuchen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function TabFallback() {
  return (
    <div className="flex h-36 items-center justify-center font-mono text-xs text-zinc-500 animate-pulse">
      Modul wird geladen…
    </div>
  );
}

function AdminApp() {
  const [sessionUser, setSessionUser] = useState(() => readCachedSessionUser());
  const [authLoading, setAuthLoading] = useState(true);
  const [bootStep, setBootStep] = useState('Prüfe Session...');
  const authReady = !authLoading;
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState(() => {
    const draftCtx = readDraftReturnContext();
    if (draftCtx?.gameId) return 'entwuerfe';
    const saved = readAdminTab('database');
    return TAB_IDS.has(saved) ? saved : 'database';
  });
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([activeTab]));

  const [draftTargetGameId, setDraftTargetGameId] = useState(() => {
    const draftCtx = readDraftReturnContext();
    return draftCtx?.gameId || null;
  });
  const [draftSource, setDraftSource] = useState('staging');

  const selectTab = (tabId) => {
    setActiveTab(tabId);
    setVisitedTabs((prev) => {
      if (prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.add(tabId);
      return next;
    });
  };

  const openInDrafts = (gameId, source = 'staging') => {
    setDraftTargetGameId(gameId || null);
    setDraftSource(source === 'fertig_review' ? 'fertig_review' : 'staging');
    selectTab('entwuerfe');
  };

  // Harter 3,5-Sekunden-Fallback (Watchdog-Timer)
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
          console.error('Admin getSession Fehler:', sessionResult.error.message);
        }
        const user =
          sessionResult?.data?.session?.user ?? readCachedSessionUser() ?? null;
        if (!cancelled) {
          setBootStep('Prüfe Admin-Rechte...');
          setSessionUser(user);
        }
      } catch (err) {
        console.error('Admin Auth-Init Fehler:', err);
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!initialResolved && event === 'INITIAL_SESSION') {
        return;
      }
      if (event === 'SIGNED_OUT') {
        if (!cancelled) setSessionUser(null);
        return;
      }
      if (session?.user && !cancelled) {
        setSessionUser(session.user);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    writeAdminTab(activeTab);
  }, [activeTab]);

  const handleLogin = async (email, password) => {
    setLoginLoading(true);
    setLoginError('');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    setLoginLoading(false);

    if (error) {
      setLoginError(error.message);
      return;
    }

    if (!isAdminUser(data.user)) {
      await supabase.auth.signOut();
      setLoginError('Kein Admin-Zugang für dieses Konto.');
      return;
    }

    setSessionUser(data.user);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSessionUser(null);
  };

  if (!authReady) {
    return (
      <div className="tb-fill-screen flex flex-col items-center justify-center gap-3 bg-[#0a0b0c] px-4 text-center font-mono">
        <p className="text-sm text-zinc-300">Admin wird geladen…</p>
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

  if (!sessionUser || !isAdminUser(sessionUser)) {
    return (
      <div className="tb-fill-screen flex flex-col items-center justify-center px-4 py-12">
        <AdminLoginForm onLogin={handleLogin} loading={loginLoading} errorMessage={loginError} />
        <p className="mt-6 text-xs text-zinc-500 text-center max-w-md leading-relaxed">
          Direktlink:{' '}
          <span className="font-mono text-zinc-400">trophybase.app/admin.html</span>
        </p>
        <a
          href="/admin-apps/"
          className="mt-4 text-[11px] font-mono text-[#00ff66] hover:underline no-underline"
        >
          📱 Zur Android Mikro-App-Zentrale
        </a>
        <p className="mt-8 text-[10px] text-zinc-600 font-mono uppercase tracking-widest">
          noindex · nofollow
        </p>
      </div>
    );
  }

  return (
    <div className="tb-fill-screen bg-[#0a0b0c] text-zinc-200">
      <header className="tb-safe-top border-b border-zinc-800 bg-[#121314] px-4 sm:px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-600">
              TrophyBase Admin
            </p>
            <h1 className="text-lg font-bold text-white">
              Dashboard <span className="text-[#00ff66]">· Cockpit</span>
            </h1>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2.5">
            <a
              href="/admin-apps/"
              className="rounded-xl border border-[#00ff66]/35 bg-[#00ff66]/10 px-3 py-1.5 text-xs font-mono font-bold text-[#00ff66] hover:bg-[#00ff66]/20 no-underline"
            >
              📱 Einzel-Apps
            </a>
            <AdminPushControl
              sessionUser={sessionUser}
              appTitle="Admin Cockpit"
              variant="popover"
            />
            <AdminWaffleMenu />
            <span className="text-xs font-mono text-zinc-500 hidden md:inline">{sessionUser.email}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-900/50 cursor-pointer"
            >
              Abmelden
            </button>
          </div>
        </div>

        <nav className="max-w-[1600px] mx-auto mt-4 flex min-w-0 flex-wrap gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-[#00ff66]/10 text-[#00ff66] border border-[#00ff66]/30'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
              }`}
            >
              <span aria-hidden>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
        <AdminPipelineLawNotice />

        {/* Lazy + Keep-Alive: Einmal besuchte Tabs bleiben im Speicher, kein Neuladen von 1000 Entwürfen beim Tab-Wechsel! */}
        {visitedTabs.has('website') && (
          <div className={activeTab === 'website' ? 'block' : 'hidden'}>
            <AdminErrorBoundary>
              <Suspense fallback={<TabFallback />}>
                <WebsitePanel />
              </Suspense>
            </AdminErrorBoundary>
          </div>
        )}

        {visitedTabs.has('database') && (
          <div className={activeTab === 'database' ? 'block' : 'hidden'}>
            <AdminErrorBoundary>
              <Suspense fallback={<TabFallback />}>
                <IntranetGameSearch sessionUser={sessionUser} onOpenInDrafts={openInDrafts} />
              </Suspense>
            </AdminErrorBoundary>
          </div>
        )}

        {visitedTabs.has('followups') && (
          <div className={activeTab === 'followups' ? 'block' : 'hidden'}>
            <AdminErrorBoundary>
              <Suspense fallback={<TabFallback />}>
                <IntranetFollowups sessionUser={sessionUser} onOpenInDrafts={openInDrafts} />
              </Suspense>
            </AdminErrorBoundary>
          </div>
        )}

        {visitedTabs.has('entwuerfe') && (
          <div className={activeTab === 'entwuerfe' ? 'block' : 'hidden'}>
            <AdminErrorBoundary>
              <Suspense fallback={<TabFallback />}>
                <IntranetDrafts initialDataSource={draftSource} initialGameId={draftTargetGameId} />
              </Suspense>
            </AdminErrorBoundary>
          </div>
        )}

        {visitedTabs.has('d_freigabe') && (
          <div className={activeTab === 'd_freigabe' ? 'block' : 'hidden'}>
            <AdminErrorBoundary>
              <Suspense fallback={<TabFallback />}>
                <IntranetRadarAndServertot
                  mode="d_freigabe"
                  sessionUser={sessionUser}
                  onOpenInDrafts={openInDrafts}
                />
              </Suspense>
            </AdminErrorBoundary>
          </div>
        )}

        {visitedTabs.has('servertot_qa') && (
          <div className={activeTab === 'servertot_qa' ? 'block' : 'hidden'}>
            <AdminErrorBoundary>
              <Suspense fallback={<TabFallback />}>
                <IntranetRadarAndServertot
                  mode="servertot"
                  sessionUser={sessionUser}
                  onOpenInDrafts={openInDrafts}
                />
              </Suspense>
            </AdminErrorBoundary>
          </div>
        )}

        {visitedTabs.has('roadmap') && (
          <div className={activeTab === 'roadmap' ? 'block' : 'hidden'}>
            <AdminErrorBoundary>
              <Suspense fallback={<TabFallback />}>
                <IntranetRoadmap />
              </Suspense>
            </AdminErrorBoundary>
          </div>
        )}

        {visitedTabs.has('reports') && (
          <div className={activeTab === 'reports' ? 'block' : 'hidden'}>
            <AdminErrorBoundary>
              <Suspense fallback={<TabFallback />}>
                <CommunityReportsPanel />
              </Suspense>
            </AdminErrorBoundary>
          </div>
        )}

        {visitedTabs.has('creators') && (
          <div className={activeTab === 'creators' ? 'block' : 'hidden'}>
            <AdminErrorBoundary>
              <Suspense fallback={<TabFallback />}>
                <IntranetCreators />
              </Suspense>
            </AdminErrorBoundary>
          </div>
        )}

        {visitedTabs.has('scripts') && (
          <div className={activeTab === 'scripts' ? 'block' : 'hidden'}>
            <AdminErrorBoundary>
              <Suspense fallback={<TabFallback />}>
                <ScriptsPanel />
              </Suspense>
            </AdminErrorBoundary>
          </div>
        )}
      </main>
    </div>
  );
}

export default AdminApp;
