import { useEffect, useState } from 'react';
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
import CommunityReportsPanel from '../components/admin/CommunityReportsPanel';
import ScriptsPanel from '../components/admin/ScriptsPanel';
import WebsitePanel from '../components/admin/WebsitePanel';
import IntranetGameSearch from '../components/intranet/IntranetGameSearch';
import IntranetDrafts from '../components/intranet/IntranetDrafts';
import IntranetRadarAndServertot from '../components/intranet/IntranetRadarAndServertot';
import IntranetRoadmap from '../components/intranet/IntranetRoadmap';

const TABS = [
  { id: 'website', label: 'Website', icon: '🌐' },
  { id: 'database', label: 'Datenbank', icon: '🗄' },
  { id: 'entwuerfe', label: 'Entwürfe', icon: '📝' },
  { id: 'd_freigabe', label: 'D-Freigabe (Radar)', icon: '⚡' },
  { id: 'servertot_qa', label: 'Krankenstation', icon: '🏥' },
  { id: 'roadmap', label: 'Roadmap & Ideen', icon: '🗺️' },
  { id: 'reports', label: 'Community Reports', icon: '⚑' },
  { id: 'scripts', label: 'Skripte', icon: '⚙️' },
];

const TAB_IDS = new Set(TABS.map((tab) => tab.id));

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
  // „🚀 Entwürfe + Follow“ oder Rückkehr über „⬅️ Zurück zum Entwurf“: Spiel vorauswählen.
  const [draftTargetGameId, setDraftTargetGameId] = useState(() => {
    const draftCtx = readDraftReturnContext();
    return draftCtx?.gameId || null;
  });

  const openInDrafts = (gameId) => {
    setDraftTargetGameId(gameId || null);
    setActiveTab('entwuerfe');
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#0a0b0c] px-4 text-center font-mono">
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
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <AdminLoginForm onLogin={handleLogin} loading={loginLoading} errorMessage={loginError} />
        <p className="mt-6 text-xs text-zinc-500 text-center max-w-md leading-relaxed">
          Direktlink:{' '}
          <span className="font-mono text-zinc-400">trophybase.app/admin.html</span>
        </p>
        <a
          href="/intranet.html"
          className="mt-4 text-[10px] font-mono uppercase tracking-wider text-zinc-600 hover:text-zinc-400 no-underline"
        >
          Zum Intranet
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
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-600">
              TrophyBase Admin
            </p>
            <h1 className="text-lg font-bold text-white">
              Dashboard <span className="text-[#00ff66]">· Phase 1</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-500 hidden sm:inline">{sessionUser.email}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-900/50"
            >
              Abmelden
            </button>
          </div>
        </div>

        <nav className="max-w-6xl mx-auto flex gap-1 mt-4 overflow-x-auto">
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
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
        {/* Nur hinter dem Admin-Login sichtbar (isAdminUser-Guard oben). */}
        <AdminPipelineLawNotice />
        {activeTab === 'website' && <WebsitePanel />}
        {activeTab === 'database' && (
          <IntranetGameSearch sessionUser={sessionUser} onOpenInDrafts={openInDrafts} />
        )}
        {activeTab === 'entwuerfe' && (
          <IntranetDrafts initialDataSource="staging" initialGameId={draftTargetGameId} />
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
        {activeTab === 'reports' && <CommunityReportsPanel />}
        {activeTab === 'scripts' && <ScriptsPanel />}
      </main>
    </div>
  );
}

export default AdminApp;
