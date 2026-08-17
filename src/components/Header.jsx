import React, { useEffect, useState } from 'react';
import VisibilityModeToggle from './VisibilityModeToggle';
import LocaleSelector from './LocaleSelector';
import { useLocale } from '../context/LocaleContext';
import { hasAdminReturnFlag } from '../lib/adminAccess';
import { navigateToHome, navigateToProfile } from '../lib/routeUtils';

function Header({ setCurrentView, sessionUser, onLogout }) {
  const { t } = useLocale();
  const [showAdminReturn, setShowAdminReturn] = useState(false);

  useEffect(() => {
    setShowAdminReturn(hasAdminReturnFlag());
  }, []);

  const handleHomeClick = () => {
    setCurrentView('home');
    navigateToHome();
  };

  const openProfile = () => {
    setCurrentView('profile');
    navigateToProfile();
  };

  return (
    <header className="w-full max-w-full min-w-0 overflow-x-hidden px-4 sm:px-6 md:px-8 py-4 flex justify-between items-center gap-3 bg-[#1a1b1c] border-b border-b-zinc-800/80 sticky top-0 z-50">
      <div className="flex items-center gap-4 sm:gap-8 min-w-0 flex-shrink">
        <div className="text-lg sm:text-xl font-bold cursor-pointer truncate" onClick={handleHomeClick}>
          <span className="text-white">TrophyBase</span>
          <span className="text-[#00ff66]">.app</span>
        </div>
      </div>

      <div className="min-w-0 flex-shrink flex items-center gap-2 sm:gap-4">
        {showAdminReturn && (
          <a
            href="/admin"
            className="flex-shrink-0 text-xs font-bold font-mono uppercase tracking-wider text-amber-400 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap"
          >
            Admin
          </a>
        )}
        <LocaleSelector />
        <VisibilityModeToggle />
        {sessionUser ? (
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={openProfile}
              className="flex-shrink-0 text-xs font-medium text-zinc-300 bg-[#121314] hover:bg-[#202122] border border-zinc-800 px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap"
            >
              {t('profile')}
            </button>
            <button
              onClick={onLogout}
              className="flex-shrink-0 text-xs font-medium text-red-400 bg-red-500/5 hover:bg-red-500/10 border border-red-900/30 px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap"
            >
              {t('logout')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCurrentView('login')}
            className="flex-shrink-0 text-xs font-medium text-zinc-300 bg-[#121314] hover:bg-[#202122] border border-zinc-800 px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap"
          >
            {t('login')}
          </button>
        )}
      </div>
    </header>
  );
}

export default Header;
