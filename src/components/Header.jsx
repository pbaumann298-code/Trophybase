import React, { useEffect, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import VisibilityModeToggle from './VisibilityModeToggle';

function Header({ setCurrentView, sessionUser, onLogout }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!sessionUser?.id) {
      setUnreadCount(0);
      return;
    }

    let cancelled = false;

    async function fetchUnread() {
      const { count, error } = await supabase
        .from('user_inbox')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', sessionUser.id)
        .eq('is_read', false);

      if (!cancelled && !error && count != null) {
        setUnreadCount(count);
      }
    }

    fetchUnread();
    return () => {
      cancelled = true;
    };
  }, [sessionUser?.id]);
  
  const handleHomeClick = () => {
    setCurrentView('home');
    window.history.pushState({}, '', '/');
  };

  return (
    <header className="w-full max-w-full min-w-0 overflow-x-hidden px-4 sm:px-6 md:px-8 py-4 flex justify-between items-center gap-3 bg-[#1a1b1c] border-b border-b-zinc-800/80 sticky top-0 z-50">
      
      {/* LOGO */}
      <div className="flex items-center gap-4 sm:gap-8 min-w-0 flex-shrink">
        <div className="text-lg sm:text-xl font-bold cursor-pointer truncate" onClick={handleHomeClick}>
          <span className="text-white">TrophyBase</span>
          <span className="text-[#00ff66]">.app</span>
        </div>
      </div>

      {/* SICHTBARKEIT + LOGIN / PROFILE */}
      <div className="min-w-0 flex-shrink flex items-center gap-2 sm:gap-4">
        <VisibilityModeToggle />
        {sessionUser ? (
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setCurrentView('inbox')}
              className="relative flex-shrink-0 text-xs font-medium text-zinc-300 bg-[#121314] hover:bg-[#202122] border border-zinc-800 px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap"
            >
              Postfach
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#00ff66] text-[10px] font-bold text-zinc-950 px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <span className="text-xs text-zinc-500 font-mono hidden md:inline truncate max-w-[10rem] lg:max-w-[14rem] xl:max-w-none">
              {sessionUser.email}
            </span>
            <button 
              onClick={onLogout} 
              className="flex-shrink-0 text-xs font-medium text-red-400 bg-red-500/5 hover:bg-red-500/10 border border-red-900/30 px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap"
            >
              Abmelden
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCurrentView('login')}
            className="flex-shrink-0 text-xs font-medium text-zinc-300 bg-[#121314] hover:bg-[#202122] border border-zinc-800 px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap"
          >
            Anmelden
          </button>
        )}
      </div>

    </header>
  );
}

export default Header;