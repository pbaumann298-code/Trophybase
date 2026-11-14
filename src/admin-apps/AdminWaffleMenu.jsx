import { useEffect, useRef, useState } from 'react';
import {
  getAdminDesktopHref,
  getHubHref,
  MICRO_APPS,
} from './microAppRegistry';
import { setAdminReturnFlag } from '../lib/adminAccess';

export default function AdminWaffleMenu({ currentAppId = '' }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="TrophyBase Apps (Google-Waffel)"
        aria-label="TrophyBase Apps öffnen"
        aria-expanded={open}
        className={`flex h-9 w-9 items-center justify-center rounded-xl border transition cursor-pointer ${
          open
            ? 'border-[#00ff66]/50 bg-[#00ff66]/15 text-[#00ff66]'
            : 'border-zinc-800 bg-zinc-900/90 text-zinc-300 hover:border-zinc-600 hover:text-white'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
          <circle cx="5" cy="5" r="2" />
          <circle cx="12" cy="5" r="2" />
          <circle cx="19" cy="5" r="2" />
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
          <circle cx="5" cy="19" r="2" />
          <circle cx="12" cy="19" r="2" />
          <circle cx="19" cy="19" r="2" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-76 sm:w-84 rounded-2xl border border-zinc-700/90 bg-[#141619] p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
              TrophyBase Suite
            </span>
            <a
              href={getHubHref()}
              className="text-[10px] font-mono text-[#00ff66] hover:underline no-underline"
            >
              Alle Apps / Install ↗
            </a>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {MICRO_APPS.map((app) => {
              const isActive = app.id === currentAppId;
              return (
                <a
                  key={app.id}
                  href={app.href}
                  onClick={() => {
                    if (app.isPublicSite) {
                      setAdminReturnFlag(true, window.location.href);
                    }
                    setOpen(false);
                  }}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center no-underline transition ${
                    isActive
                      ? 'border-[#00ff66]/50 bg-[#00ff66]/10 text-white'
                      : 'border-transparent bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-white'
                  }`}
                >
                  <img
                    src={app.iconSrc}
                    alt=""
                    className="h-10 w-10 rounded-xl border border-zinc-800 object-cover"
                  />
                  <span className="w-full truncate text-[11px] font-semibold leading-tight">
                    {app.shortTitle}
                  </span>
                </a>
              );
            })}
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-zinc-800 pt-2 px-1 text-[10px] font-mono">
            <a
              href={getAdminDesktopHref()}
              className="text-zinc-400 hover:text-white no-underline"
            >
              🖥 Desktop-Gesamtansicht
            </a>
            <a
              href={getHubHref()}
              className="text-zinc-400 hover:text-[#00ff66] no-underline"
            >
              📱 App-Zentrale
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
