import { useEffect, useState } from 'react';
import HeaderSettingsMenu from './HeaderSettingsMenu';
import { LocaleRegister } from './LocaleSelector';
import { hasAdminReturnFlag, isAdminUser } from '../lib/adminAccess';
import { navigateToHome, WATCHLIST_PATH } from '../lib/routeUtils';

function Header({ setCurrentView, sessionUser, onLogout, onOpenWatchlist }) {
  const [showAdminReturn, setShowAdminReturn] = useState(false);
  const isAdmin = isAdminUser(sessionUser);

  useEffect(() => {
    setShowAdminReturn(hasAdminReturnFlag());
  }, []);

  const handleHomeClick = (event) => {
    event.preventDefault();
    setCurrentView('home');
    navigateToHome();
  };

  return (
    <header className="site-header relative w-full max-w-full min-w-0 h-[57px] md:h-[69px] px-4 md:px-6 bg-[#1a1b1c] border-b border-zinc-800/80 sticky top-0 z-50 overflow-hidden">
      {/* Subtiler Sci-Fi-Glow hinter dem Logo — weich nach rechts ausblendend */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-[min(450px,85vw)] opacity-40"
        style={{
          background:
            'radial-gradient(ellipse at 15% 50%, rgba(30, 215, 96, 0.28) 0%, transparent 70%)',
        }}
        aria-hidden
      />

      <div className="site-header-left relative z-10 min-w-0">
        <a
          href="/"
          onClick={handleHomeClick}
          aria-label="TrophyBase.app – Startseite"
          className="site-header-logo group relative inline-flex items-center max-w-full min-w-0 no-underline rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00ff66]/60"
        >
          {/* Sehr schmale Displays: nur Pokal-Emblem */}
          <img
            src="/images/logo-mark.png"
            alt=""
            width={256}
            height={211}
            decoding="async"
            className="site-header-logo__mark block h-9 md:h-11 w-auto object-contain select-none pointer-events-none max-[399px]:block min-[400px]:hidden"
            draggable={false}
          />
          {/* Ab 400px: volles Logo (Pokal + Schriftzug) */}
          <img
            src="/images/logo-header.png"
            alt="TrophyBase.app"
            width={498}
            height={128}
            decoding="async"
            className="site-header-logo__full hidden min-[400px]:block h-9 md:h-[46px] w-auto max-w-[min(62vw,17rem)] md:max-w-[20rem] object-contain object-left select-none pointer-events-none transition-transform duration-200 group-hover:scale-[1.02]"
            draggable={false}
          />
        </a>
        {isAdmin ? <LocaleRegister /> : null}
      </div>

      <div className="site-header-right relative z-10 min-w-0 shrink-0">
        <div className="flex items-center justify-end gap-2 flex-nowrap">
          {isAdmin ? (
            <a
              href="/intranet"
              className="flex-shrink-0 text-xs font-bold font-mono uppercase tracking-wider text-zinc-300 bg-[#121314] hover:bg-[#202122] border border-zinc-800 px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap no-underline"
            >
              Intranet
            </a>
          ) : null}
          {isAdmin || showAdminReturn ? (
            <a
              href="/admin.html"
              className="flex-shrink-0 text-xs font-bold font-mono uppercase tracking-wider text-amber-400 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap no-underline"
            >
              Admin
            </a>
          ) : null}
          <HeaderSettingsMenu
            sessionUser={sessionUser}
            onLogout={onLogout}
            onOpenWatchlist={onOpenWatchlist}
            watchlistPath={WATCHLIST_PATH}
          />
        </div>
      </div>
    </header>
  );
}

export default Header;
