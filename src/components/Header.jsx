import { useEffect, useState } from 'react';
import VisibilityModeToggle from './VisibilityModeToggle';
import LocaleSelector from './LocaleSelector';
import { useLocale } from '../context/LocaleContext';
import { hasAdminReturnFlag, isAdminUser } from '../lib/adminAccess';
import { navigateToHome } from '../lib/routeUtils';

function Header({ setCurrentView, sessionUser, onLogout }) {
  const { t } = useLocale();
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
    <header className="site-header w-full max-w-full min-w-0 px-4 sm:px-6 md:px-8 py-3 bg-[#1a1b1c] border-b border-b-zinc-800/80 sticky top-0 z-50">
      <div className="site-header-left min-w-0">
        <div
          className="text-lg sm:text-xl font-bold cursor-pointer leading-tight"
          onClick={handleHomeClick}
        >
          <span className="text-white">TrophyBase</span>
          <span className="text-[#00ff66]">.app</span>
        </div>
        <LocaleSelector menuAlign="left" />
      </div>

      <div className="site-header-right min-w-0">
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
              href="/admin"
              className="flex-shrink-0 text-xs font-bold font-mono uppercase tracking-wider text-amber-400 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap no-underline"
            >
              Admin
            </a>
          ) : null}
          <VisibilityModeToggle />
        </div>
        {isAdmin ? (
          <div className="flex items-center justify-end gap-2 sm:gap-3 min-w-0">
            <span className="hidden sm:inline text-[10px] font-mono text-zinc-500 truncate max-w-[12rem]">
              {sessionUser.email}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="flex-shrink-0 text-xs font-medium text-red-400 bg-red-500/5 hover:bg-red-500/10 border border-red-900/30 px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap"
            >
              {t('logout')}
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

export default Header;
