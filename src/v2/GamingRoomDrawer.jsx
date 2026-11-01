import { useCallback, useEffect, useRef, useState } from 'react';
import { isLabModeActive } from '../lib/adminAccess';

const HUB_FILTERS = {
  steam: {
    id: 'steam',
    banner: 'Aktiver Hub: 🖥️ Steam',
    hudTitle: 'Steam & PC-Guides',
    hudMeta: 'Desktop-Setup · Triple-Monitor',
    hudCta: 'PC-Katalog öffnen',
  },
  psn: {
    id: 'psn',
    banner: 'Aktiver Hub: 💙 PlayStation',
    hudTitle: 'PlayStation',
    hudMeta: 'PS5 / PS4 / PS3',
    hudCta: 'PS-Guides öffnen',
  },
  xbox: {
    id: 'xbox',
    banner: 'Aktiver Hub: 💚 Xbox',
    hudMeta: 'Xbox & Gamerscore',
    hudTitle: 'Xbox Series',
    hudCta: 'Xbox-Guides öffnen',
  },
  all: {
    id: 'all',
    banner: 'Aktiver Hub: 🌐 Cross-Platform',
    hudTitle: 'Alle Plattformen',
    hudMeta: 'Cross-Platform Live-HUD',
    hudCta: 'Gesamtkatalog öffnen',
  },
};

const ZONES = [
  {
    id: 'steam',
    filter: 'steam',
    label: '🖥️ Steam & PC-Guides',
    color: '#22c55e',
    areas: ['left-[6.5%] top-[36%] w-[24%] h-[28%]'],
  },
  {
    id: 'psn',
    filter: 'psn',
    label: '💙 PlayStation (PS5 / PS4 / PS3)',
    color: '#3b82f6',
    areas: ['left-[59.5%] top-[56.5%] w-[12%] h-[11.5%]'],
  },
  {
    id: 'xbox',
    filter: 'xbox',
    label: '💚 Xbox & Gamerscore',
    color: '#10b981',
    areas: ['left-[73.5%] top-[47%] w-[7.5%] h-[17.5%]'],
  },
  {
    id: 'trophy',
    filter: null,
    label: '🏆 Deine Trophy Wall & Meilensteine',
    color: '#eab308',
    areas: [
      'left-[38%] top-[2%] w-[56%] h-[19%]',
      'left-[38%] top-[21%] w-[15%] h-[25%]',
    ],
  },
];

function isTypingTarget(target) {
  return Boolean(
    target?.closest?.('input, textarea, select, [contenteditable="true"]'),
  );
}

function scrollToHomeCatalog() {
  const catalog = document.querySelector(
    '.home-categories, .home-poster-grid, .home-landing',
  );
  if (catalog) {
    catalog.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  window.scrollTo({ top: Math.round(window.innerHeight * 0.72), behavior: 'smooth' });
}

function TvHud({ preview, onSelectAll }) {
  const info = HUB_FILTERS[preview] || HUB_FILTERS.all;
  return (
    <div
      className="pointer-events-none absolute inset-[8%] flex items-center justify-center"
      style={{ transform: 'perspective(600px) rotateY(-22deg) skewY(11deg)' }}
    >
      <div className="flex h-full w-full flex-col justify-between rounded-sm border border-[#00ff66]/25 bg-black/55 px-2 py-1.5 text-left shadow-[inset_0_0_24px_rgba(0,255,102,0.08)] backdrop-blur-[2px]">
        <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[#00ff66]/80">
          TrophyBase Live-HUD
        </p>
        <div>
          <p className="text-[11px] font-bold leading-tight text-white sm:text-xs">
            {info.hudTitle}
          </p>
          <p className="mt-0.5 font-mono text-[9px] text-zinc-300">{info.hudMeta}</p>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelectAll();
          }}
          className="pointer-events-auto w-full rounded bg-[#00ff66]/90 px-1.5 py-1 font-mono text-[8px] font-bold uppercase tracking-wider text-black hover:bg-[#00ff66]"
        >
          {info.hudCta}
        </button>
      </div>
    </div>
  );
}

function RoomScene({
  hoveredId,
  onHover,
  onSelectZone,
  onSelectAll,
}) {
  const preview = hoveredId && hoveredId !== 'trophy' ? hoveredId : 'all';

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#050607]">
      <img
        src="/assets/gaming-hub.jpeg"
        alt="TrophyBase Gaming Room"
        draggable={false}
        className="absolute inset-0 h-full w-full select-none"
      />

      {ZONES.map((zone) =>
        zone.areas.map((pos) => (
          <button
            key={`${zone.id}-${pos}`}
            type="button"
            aria-label={zone.label}
            onMouseEnter={() => onHover(zone.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(zone.id)}
            onBlur={() => onHover(null)}
            onClick={() => onSelectZone(zone)}
            className={`group absolute z-10 rounded-md border border-transparent bg-transparent transition ${pos}`}
            style={{
              boxShadow:
                hoveredId === zone.id
                  ? `0 0 0 2px ${zone.color}, 0 0 28px ${zone.color}66`
                  : undefined,
            }}
          >
            <span
              className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: zone.color,
                boxShadow: `0 0 12px ${zone.color}`,
                animation: 'tb-hub-pulse 1.6s ease-in-out infinite',
              }}
            />
            <span
              className={`pointer-events-none absolute left-1/2 top-[-1.7rem] z-20 -translate-x-1/2 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-mono font-bold text-white opacity-0 shadow-lg backdrop-blur-md transition group-hover:opacity-100 group-focus-visible:opacity-100 ${
                hoveredId === zone.id ? 'opacity-100' : ''
              }`}
              style={{
                borderColor: `${zone.color}99`,
                background: 'rgba(12,14,16,0.72)',
              }}
            >
              {zone.label}
            </span>
          </button>
        )),
      )}

      <button
        type="button"
        aria-label="🌐 Alle Plattformen (Cross-Platform)"
        onMouseEnter={() => onHover('all')}
        onMouseLeave={() => onHover(null)}
        onClick={onSelectAll}
        className="absolute left-[54.8%] top-[22.5%] z-20 h-[31%] w-[18%] rounded-sm border border-transparent bg-transparent"
        style={{
          boxShadow:
            hoveredId === 'all'
              ? '0 0 0 2px #00ff66, 0 0 24px rgba(0,255,102,0.35)'
              : undefined,
        }}
      >
        <TvHud preview={preview} onSelectAll={onSelectAll} />
      </button>
    </div>
  );
}

export default function GamingRoomDrawer({
  sessionUser = null,
  onOpenCockpit,
  onRequestLogin,
}) {
  const labActive = isLabModeActive(sessionUser);
  const [open, setOpen] = useState(false);
  const [hubFilter, setHubFilter] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const touchStartRef = useRef(null);

  const closeRoom = useCallback(() => {
    setOpen(false);
    setHoveredId(null);
    setTilt({ x: 0, y: 0 });
  }, []);

  const openRoom = useCallback(() => {
    setOpen(true);
    setShowcaseOpen(false);
  }, []);

  const applyFilter = useCallback(
    (filterId) => {
      setHubFilter(filterId);
      closeRoom();
      window.setTimeout(scrollToHomeCatalog, 320);
    },
    [closeRoom],
  );

  const openTrophyWall = useCallback(() => {
    closeRoom();
    setShowcaseOpen(true);
  }, [closeRoom]);

  const handleSelectZone = useCallback(
    (zone) => {
      if (zone.id === 'trophy') {
        openTrophyWall();
        return;
      }
      applyFilter(zone.filter);
    },
    [applyFilter, openTrophyWall],
  );

  const handlePointerMove = useCallback((event) => {
    if (window.matchMedia('(max-width: 767px)').matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -6, y: px * 8 });
  }, []);

  useEffect(() => {
    if (!labActive) return undefined;

    const onKeyDown = (event) => {
      if (isTypingTarget(event.target)) return;
      if (!open && (event.key === 'r' || event.key === 'R' || event.key === 'ArrowRight')) {
        event.preventDefault();
        openRoom();
      }
      if (open && event.key === 'Escape') {
        event.preventDefault();
        closeRoom();
      }
    };

    const onTouchStart = (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const onTouchEnd = (event) => {
      const start = touchStartRef.current;
      const touch = event.changedTouches?.[0];
      touchStartRef.current = null;
      if (!start || !touch) return;
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const horizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.8;
      if (!horizontal) return;
      if (!open && deltaX < -70) openRoom();
      if (open && deltaX > 70) closeRoom();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [labActive, open, openRoom, closeRoom]);

  if (!labActive) return null;

  const activeHub = hubFilter ? HUB_FILTERS[hubFilter] : null;

  return (
    <>
      <style>{`
        @keyframes tb-hub-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.85; }
          50% { transform: translate(-50%, -50%) scale(1.45); opacity: 0.35; }
        }
      `}</style>

      {!open ? (
        <button
          type="button"
          onClick={openRoom}
          className="fixed right-0 top-1/2 z-[55] -translate-y-1/2 rounded-l-2xl border border-r-0 border-[#00ff66]/50 bg-[#101412]/95 px-2.5 py-3 font-mono text-[11px] font-bold tracking-wide text-[#00ff66] shadow-xl shadow-black/50 backdrop-blur-md hover:bg-[#00ff66] hover:text-black"
        >
          🕹️ Gaming Room ← Swipe
        </button>
      ) : null}

      {activeHub && !open ? (
        <div className="fixed left-3 right-3 top-[61px] z-[54] mx-auto flex max-w-4xl items-center justify-between gap-2 rounded-2xl border border-[#00ff66]/40 bg-[#101412]/95 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur-md md:top-[77px]">
          <p className="min-w-0 truncate font-mono text-xs font-bold text-white">
            {activeHub.banner}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHubFilter(null)}
              className="rounded-lg border border-zinc-700 px-2 py-1 font-mono text-[10px] text-zinc-300 hover:text-white"
            >
              Filter lösen
            </button>
            <button
              type="button"
              onClick={openRoom}
              className="rounded-lg bg-[#00ff66] px-2 py-1 font-mono text-[10px] font-bold text-black"
            >
              Zimmer öffnen
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={`fixed inset-0 z-[80] ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!open}
      >
        <div
          className={`absolute inset-0 bg-black/70 transition-opacity duration-300 ${
            open ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={closeRoom}
        />
        <div
          className={`absolute inset-0 flex flex-col bg-[#07080a] transition-transform duration-300 ease-out ${
            open ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <button
              type="button"
              onClick={closeRoom}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs font-bold text-white hover:border-[#00ff66]/50"
            >
              ← Zurück zur Übersicht
            </button>
            <p className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 sm:block">
              Lab · Gaming Room
            </p>
          </div>

          <div className="min-h-0 flex-1 px-3 pb-4 md:flex md:items-center md:justify-center">
            <div className="h-full overflow-x-auto snap-x snap-mandatory md:hidden">
              <div className="relative aspect-[16/9] h-[70vh] w-auto min-w-[120vh] snap-center">
                <RoomScene
                  hoveredId={hoveredId}
                  onHover={setHoveredId}
                  onSelectZone={handleSelectZone}
                  onSelectAll={() => applyFilter('all')}
                />
              </div>
            </div>

            <div
              className="relative mx-auto hidden w-full max-w-[1600px] aspect-[16/9] md:block"
              style={{
                transform: `perspective(1400px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                transformStyle: 'preserve-3d',
              }}
              onMouseMove={handlePointerMove}
              onMouseLeave={() => setTilt({ x: 0, y: 0 })}
            >
              <RoomScene
                hoveredId={hoveredId}
                onHover={setHoveredId}
                onSelectZone={handleSelectZone}
                onSelectAll={() => applyFilter('all')}
              />
            </div>
          </div>
        </div>
      </div>

      {showcaseOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-yellow-400/40 bg-[#121314] p-4 shadow-2xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-yellow-300">
              Trophy Wall
            </p>
            <h2 className="mt-1 text-lg font-bold text-white">Deine Platin-Pokale</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Lab-Showcase: hier landet die persönliche Trophy Wall. Das Cockpit bleibt die
              Live-Ansicht deiner Meilensteine.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowcaseOpen(false)}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 font-mono text-xs text-zinc-300"
              >
                Schließen
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowcaseOpen(false);
                  if (sessionUser) onOpenCockpit?.();
                  else onRequestLogin?.();
                }}
                className="rounded-lg bg-[#eab308] px-3 py-1.5 font-mono text-xs font-bold text-black"
              >
                {sessionUser ? 'Zum Cockpit' : 'Anmelden'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
