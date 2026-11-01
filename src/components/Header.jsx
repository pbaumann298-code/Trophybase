import { useEffect, useState } from 'react';
import HeaderSettingsMenu from './HeaderSettingsMenu';
import {
  fetchMyCreatorProfile,
  getAdminReturnUrl,
  hasAdminReturnFlag,
  isAdminUser,
  isStaffOrPreviewContext,
  readDraftReturnContext,
} from '../lib/adminAccess';
import { navigateToHome, PROFILE_PATH, WATCHLIST_PATH } from '../lib/routeUtils';
import { supabase } from '../pages/supabaseClient';

function Header({
  setCurrentView,
  sessionUser,
  onLogout,
  onOpenWatchlist,
  onOpenProfile,
  onOpenPlatformTrophies,
  onCustomizeHome,
}) {
  const staffOrPreview = isStaffOrPreviewContext();
  const [draftReturnCtx] = useState(() =>
    staffOrPreview ? readDraftReturnContext() : null
  );
  const isLoggedIn = Boolean(sessionUser);
  const isAdmin = isAdminUser(sessionUser, { allowPublic: true });
  const showStaffReturn = isAdmin && (staffOrPreview || hasAdminReturnFlag());
  const [creatorProfile, setCreatorProfile] = useState(null);

  useEffect(() => {
    if (!sessionUser?.id || isAdmin) {
      setCreatorProfile(null);
      return undefined;
    }
    let cancelled = false;
    fetchMyCreatorProfile(supabase).then((profile) => {
      if (!cancelled) {
        setCreatorProfile(profile || null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionUser?.id, isAdmin]);

  const handleHomeClick = (event) => {
    event.preventDefault();
    setCurrentView('home');
    navigateToHome();
  };

  return (
    <header className="site-header relative w-full max-w-full min-w-0 h-[57px] md:h-[69px] bg-[#1a1b1c] border-b border-zinc-800/80 sticky top-0 z-50">
      <a
        href="/"
        onClick={handleHomeClick}
        aria-label="TrophyBase.app – Startseite"
        className="site-header-logo absolute inset-y-0 left-0 z-0 flex items-center pl-3 md:pl-4 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#00ff66]/60"
      >
        <img
          src="/images/logo-mark.jpg"
          alt=""
          width={512}
          height={512}
          decoding="async"
          className="site-header-logo__img block h-9 w-9 md:h-11 md:w-11 rounded-lg object-cover select-none pointer-events-none"
          draggable={false}
        />
      </a>

      <div className="site-header-right relative z-20 ml-auto flex h-full min-w-0 shrink-0 items-center gap-2 pr-4 md:pr-6 pl-2">
        {isLoggedIn ? (
          <a
            href={PROFILE_PATH}
            onClick={(e) => {
              e.preventDefault();
              onOpenProfile?.();
            }}
            className="flex-shrink-0 text-xs font-bold font-mono uppercase tracking-wider text-[#00ff66] bg-[#00ff66]/10 hover:bg-[#00ff66]/20 border border-[#00ff66]/40 px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap no-underline backdrop-blur-sm shadow-xs"
          >
            🏆 Mein Cockpit
          </a>
        ) : null}
        {staffOrPreview && draftReturnCtx?.gameId ? (
          <a
            href={draftReturnCtx.staffPath || '/intranet.html#entwuerfe'}
            onClick={(e) => {
              e.preventDefault();
              window.location.assign(draftReturnCtx.staffPath || '/intranet.html#entwuerfe');
            }}
            title={`Zurück zum Entwurf: ${draftReturnCtx.title || draftReturnCtx.gameId}`}
            className="flex-shrink-0 text-xs font-bold font-mono uppercase tracking-wider text-black bg-[#00ff66] hover:bg-[#00ff66]/90 border border-[#00ff66] px-3 sm:px-4 py-1.5 rounded-lg transition whitespace-nowrap no-underline shadow-md shadow-[#00ff66]/20"
          >
            ⬅️ Zurück zum Entwurf
            {draftReturnCtx.title
              ? `: ${draftReturnCtx.title.length > 20 ? `${draftReturnCtx.title.slice(0, 20)}…` : draftReturnCtx.title}`
              : ''}
          </a>
        ) : null}
        {showStaffReturn ? (
          <a
            href={getAdminReturnUrl('/intranet.html')}
            className="flex-shrink-0 text-xs font-bold font-mono uppercase tracking-wider text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 rounded-lg transition whitespace-nowrap no-underline"
          >
            🛠️ Intranet / Admin
          </a>
        ) : null}
        {!isAdmin && creatorProfile?.id ? (
          <a
            href="/intranet.html"
            className="flex-shrink-0 text-xs font-bold font-mono uppercase tracking-wider text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 rounded-lg transition whitespace-nowrap no-underline"
          >
            🎬 Creator Studio
          </a>
        ) : null}
        <HeaderSettingsMenu
          sessionUser={sessionUser}
          isAdmin={isAdmin}
          isCreator={Boolean(creatorProfile?.id)}
          onLogout={onLogout}
          onOpenWatchlist={onOpenWatchlist}
          onOpenProfile={onOpenProfile}
          onOpenPlatformTrophies={onOpenPlatformTrophies}
          onCustomizeHome={onCustomizeHome}
          watchlistPath={WATCHLIST_PATH}
          profilePath={PROFILE_PATH}
        />
      </div>
    </header>
  );
}

export default Header;
