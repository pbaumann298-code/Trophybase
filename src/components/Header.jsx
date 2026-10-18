import { useEffect, useState } from 'react';
import HeaderSettingsMenu from './HeaderSettingsMenu';
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
    <header className="site-header relative w-full max-w-full min-w-0 h-[57px] md:h-[69px] bg-[#1a1b1c] border-b border-zinc-800/80 sticky top-0 z-50">
      {/* Banner-Logo: volle Höhe, links/oben, weicher Auslauf nach rechts */}
      <a
        href="/"
        onClick={handleHomeClick}
        aria-label="TrophyBase.app – Startseite"
        className="site-header-logo absolute inset-y-0 left-0 z-0 block overflow-hidden no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#00ff66]/60"
      >
        <img
          src="/images/logo-header.jpg"
          alt="TrophyBase.app"
          width={826}
          height={276}
          decoding="async"
          className="site-header-logo__img block h-full w-auto max-w-none object-cover object-left select-none pointer-events-none"
          draggable={false}
        />
      </a>

      <div className="site-header-right relative z-20 ml-auto flex h-full min-w-0 shrink-0 items-center gap-2 pr-4 md:pr-6 pl-2">
        {isAdmin ? (
          <a
            href="/intranet"
            className="flex-shrink-0 text-xs font-bold font-mono uppercase tracking-wider text-zinc-300 bg-[#121314]/90 hover:bg-[#202122] border border-zinc-800 px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap no-underline backdrop-blur-sm"
          >
            Intranet
          </a>
        ) : null}
        {isAdmin || showAdminReturn ? (
          <a
            href="/admin.html"
            className="flex-shrink-0 text-xs font-bold font-mono uppercase tracking-wider text-amber-400 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap no-underline backdrop-blur-sm"
          >
            Admin
          </a>
        ) : null}
        <HeaderSettingsMenu
          sessionUser={sessionUser}
          isAdmin={isAdmin}
          onLogout={onLogout}
          onOpenWatchlist={onOpenWatchlist}
          watchlistPath={WATCHLIST_PATH}
        />
      </div>
    </header>
  );
}

export default Header;
