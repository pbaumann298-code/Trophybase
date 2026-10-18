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

  const handleHomeClick = () => {
    setCurrentView('home');
    navigateToHome();
  };

  return (
    <header className="site-header w-full max-w-full min-w-0 px-4 sm:px-6 md:px-8 py-2.5 sm:py-3 bg-[#1a1b1c] border-b border-b-zinc-800/80 sticky top-0 z-50">
      <div className="site-header-left min-w-0">
        <button
          type="button"
          onClick={handleHomeClick}
          aria-label="TrophyBase.app – Startseite"
          className="site-header-logo relative block max-w-full shrink min-w-0 rounded-md p-0 border-0 bg-transparent cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00ff66]/60"
        >
          <img
            src="/images/logo-header.jpg"
            alt="TrophyBase.app"
            width={960}
            height={307}
            decoding="async"
            className="site-header-logo__img block h-9 sm:h-10 md:h-11 w-auto max-w-[min(58vw,15.5rem)] sm:max-w-[16.5rem] object-contain object-left select-none pointer-events-none"
            draggable={false}
          />
        </button>
        {isAdmin ? <LocaleRegister /> : null}
      </div>

      <div className="site-header-right min-w-0 shrink-0">
        <div className="flex items-center justify-end gap-2 flex-wrap">
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
