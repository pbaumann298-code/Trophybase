import { Component, useCallback, useEffect, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import {
  isAdminUser,
  readCachedSessionUser,
  setDraftReturnContext,
} from '../lib/adminAccess';
import { registerPwa } from '../lib/registerPwa';
import { ensureAdminServiceWorker } from '../lib/adminPush';
import AdminLoginForm from '../components/admin/AdminLoginForm';
import AdminPushControl from './AdminPushControl';
import AdminWaffleMenu from './AdminWaffleMenu';
import { getMicroAppById } from './microAppRegistry';

let pwaRegistered = false;

class MicroAppErrorBoundary extends Component {
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

export default function AdminMicroAppShell({
  appId,
  title,
  iconSrc,
  maxWidthClass = 'max-w-[1500px]',
  children,
}) {
  const meta = getMicroAppById(appId);
  const effectiveTitle = title || meta?.title || 'TB Cockpit';
  const effectiveIcon = iconSrc || meta?.iconSrc || '/icons/apps/hub-192.png';

  const [sessionUser, setSessionUser] = useState(() => readCachedSessionUser());
  const [authLoading, setAuthLoading] = useState(() => !readCachedSessionUser());
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [installPromptEvent, setInstallPromptEvent] = useState(null);

  useEffect(() => {
    if (!pwaRegistered) {
      pwaRegistered = true;
      registerPwa();
      if (import.meta.env.PROD) {
        ensureAdminServiceWorker().catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };
    const onAppInstalled = () => {
      setInstallPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let initialResolved = false;

    const watchdog = window.setTimeout(() => {
      if (!cancelled) {
        setSessionUser((prev) => prev || readCachedSessionUser());
        setAuthLoading(false);
      }
    }, 3000);

    async function verifySession() {
      try {
        const timeoutPromise = new Promise((resolve) => {
          window.setTimeout(() => resolve({ data: { session: null }, timedOut: true }), 2800);
        });
        const res = await Promise.race([supabase.auth.getSession(), timeoutPromise]);
        const user = res?.data?.session?.user ?? readCachedSessionUser() ?? null;
        if (!cancelled) {
          setSessionUser(user);
        }
      } catch {
        if (!cancelled) {
          setSessionUser((prev) => prev || readCachedSessionUser());
        }
      } finally {
        initialResolved = true;
        window.clearTimeout(watchdog);
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    verifySession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!initialResolved && event === 'INITIAL_SESSION') return;
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
      window.clearTimeout(watchdog);
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

  const handleInstallClick = async () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    try {
      await installPromptEvent.userChoice;
    } catch {
      /* ignore */
    }
    setInstallPromptEvent(null);
  };

  const openInDrafts = useCallback((gameId, source = 'staging') => {
    if (gameId) {
      setDraftReturnContext({
        gameId,
        activeDataSource: source === 'rohmaterial' ? 'rohmaterial' : 'staging',
        staffPath: window.location.pathname,
      });
    }
    const targetUrl = source === 'fertig_review'
      ? '/admin-apps/drafts/?source=fertig_review'
      : '/admin-apps/drafts/';
    window.location.href = targetUrl;
  }, []);

  if (authLoading) {
    return (
      <div className="tb-fill-screen flex flex-col items-center justify-center gap-2 bg-[#0a0b0c] px-4 text-center font-mono">
        <img src={effectiveIcon} alt="" className="h-12 w-12 rounded-2xl border border-zinc-800" />
        <p className="text-xs text-zinc-400">{effectiveTitle} startet…</p>
      </div>
    );
  }

  if (!sessionUser || !isAdminUser(sessionUser)) {
    return (
      <div className="tb-fill-screen flex flex-col items-center justify-center bg-[#0a0b0c] px-4 py-10">
        <div className="mb-4 flex items-center gap-2.5">
          <img src={effectiveIcon} alt="" className="h-10 w-10 rounded-xl border border-zinc-800" />
          <span className="font-mono text-sm font-bold text-white">{effectiveTitle}</span>
        </div>
        <AdminLoginForm onLogin={handleLogin} loading={loginLoading} errorMessage={loginError} />
      </div>
    );
  }

  return (
    <div className="tb-fill-screen bg-[#0a0b0c] text-zinc-200">
      <header className="tb-safe-top sticky top-0 z-40 border-b border-zinc-800/90 bg-[#101214]/95 backdrop-blur-xs px-3 sm:px-5 py-2">
        <div className={`${maxWidthClass} mx-auto flex items-center justify-between gap-2`}>
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src={effectiveIcon}
              alt=""
              className="h-7 w-7 shrink-0 rounded-lg border border-zinc-800 object-cover"
            />
            <h1 className="truncate text-sm font-bold text-white">{effectiveTitle}</h1>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {installPromptEvent && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="rounded-xl border border-[#00ff66]/50 bg-[#00ff66]/15 px-2.5 py-1 text-[11px] font-mono font-bold text-[#00ff66] hover:bg-[#00ff66]/25 cursor-pointer"
              >
                📲 Installieren
              </button>
            )}

            <AdminPushControl
              sessionUser={sessionUser}
              appTitle={effectiveTitle}
              variant="popover"
            />

            <AdminWaffleMenu currentAppId={appId} />

            <button
              type="button"
              onClick={handleLogout}
              title={`Abmelden (${sessionUser.email})`}
              className="rounded-xl border border-zinc-800 bg-zinc-900/90 px-2.5 py-1.5 text-[11px] font-mono text-zinc-400 hover:border-red-900/60 hover:text-red-300 cursor-pointer"
            >
              ⏻
            </button>
          </div>
        </div>
      </header>

      <main className={`${maxWidthClass} mx-auto px-3 sm:px-5 py-4 sm:py-6`}>
        <MicroAppErrorBoundary>
          {typeof children === 'function'
            ? children({ sessionUser, openInDrafts })
            : children}
        </MicroAppErrorBoundary>
      </main>
    </div>
  );
}
