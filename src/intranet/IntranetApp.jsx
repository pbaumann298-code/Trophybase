import React, { useEffect, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import { isAdminUser } from '../lib/adminAccess';
import AdminLoginForm from '../components/admin/AdminLoginForm';
import IntranetGameSearch from '../components/intranet/IntranetGameSearch';
import IntranetCreatorSearch from '../components/intranet/IntranetCreatorSearch';

const TABS = [
  { id: 'games', label: 'Spiele', icon: '🎮' },
  { id: 'creators', label: 'Creator', icon: '▶' },
];

function IntranetApp() {
  const [sessionUser, setSessionUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState('games');

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) {
        setSessionUser(session?.user ?? null);
        setAuthReady(true);
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
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
      <div className="min-h-screen flex items-center justify-center text-zinc-500 text-sm font-mono">
        Intranet wird geladen…
      </div>
    );
  }

  if (!sessionUser || !isAdminUser(sessionUser)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <AdminLoginForm
          onLogin={handleLogin}
          loading={loginLoading}
          errorMessage={loginError}
          kicker="Interner Bereich"
          title="Intranet"
          submitLabel="Anmelden"
        />
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
              TrophyBase Intranet
            </p>
            <h1 className="text-lg font-bold text-white">
              Interne Suche <span className="text-[#00ff66]">· Datenbank</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-500 hidden sm:inline">{sessionUser.email}</span>
            <a
              href="/admin"
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-[#00ff66] hover:border-[#00ff66]/40 no-underline"
            >
              Admin
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-900/50"
            >
              Abmelden
            </button>
          </div>
        </div>

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
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'games' && <IntranetGameSearch />}
        {activeTab === 'creators' && <IntranetCreatorSearch />}
      </main>
    </div>
  );
}

export default IntranetApp;
