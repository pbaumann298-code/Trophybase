import { useCallback, useEffect, useRef, useState } from 'react';
import { isLabModeActive } from '../lib/adminAccess';
import { HIDE_SWIPE_HANDLES_KEY, useUserPreferences } from '../lib/userPreferences';

const HUB_FILTERS = {
  platinliste_v1: {
    id: 'platinliste_v1',
    banner: 'Aktiver Hub: 🏆 Platin-Liste V1',
    hudTitle: 'Platin-Liste V1',
    hudMeta: '24 Plattform-Trophäen & Meilensteine',
    hudCta: 'Platin-Liste V1 öffnen',
  },
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
    id: 'platinliste_v1',
    filter: null,
    label: '🏆 Platin-Liste V1',
    sublabel: '24 Plattform-Meilensteine',
    color: '#00ff66',
    alwaysFramed: true,
    labelInside: true,
    areas: ['left-[3%] top-[3%] w-[28.5%] h-[31%]'],
  },
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
    labelInside: true,
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
    <div className="pointer-events-none absolute inset-[6%] flex items-center justify-center subpixel-antialiased">
      <div className="flex h-full w-full flex-col justify-between rounded-md border border-[#00ff66]/55 bg-[#090d0b]/92 px-2.5 py-2 text-left shadow-[inset_0_0_24px_rgba(0,255,102,0.14)]">
        <p className="font-mono text-[9px] md:text-[10px] lg:text-[11px] font-bold uppercase tracking-[0.16em] text-[#00ff66]">
          TrophyBase Live-HUD
        </p>
        <div>
          <p className="text-xs md:text-sm lg:text-base font-extrabold leading-snug text-white">
            {info.hudTitle}
          </p>
          <p className="mt-0.5 font-mono text-[10px] md:text-xs text-zinc-200">{info.hudMeta}</p>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelectAll();
          }}
          className="pointer-events-auto w-full rounded bg-[#00ff66] px-2 py-1 md:py-1.5 font-mono text-[10px] md:text-xs font-extrabold uppercase tracking-wider text-black hover:bg-[#00e65c] cursor-pointer"
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
    <div className="relative h-full w-full overflow-hidden bg-[#050607] subpixel-antialiased">
      <img
        src="/assets/gaming-hub.jpeg?v=2"
        alt="TrophyBase Gaming Room"
        draggable={false}
        className="absolute inset-0 h-full w-full select-none"
      />

      {ZONES.map((zone) =>
        zone.areas.map((pos, areaIndex) => {
          const isHovered = hoveredId === zone.id;
          const isAlwaysFramed = Boolean(zone.alwaysFramed);
          const showBadgeOnThisArea = areaIndex === 0;

          return (
            <button
              key={`${zone.id}-${pos}`}
              type="button"
              aria-label={zone.label}
              onMouseEnter={() => onHover(zone.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(zone.id)}
              onBlur={() => onHover(null)}
              onClick={() => onSelectZone(zone)}
              className={`group absolute z-10 rounded-lg border transition cursor-pointer ${pos} ${
                isAlwaysFramed
                  ? 'border-[#00ff66]/65 bg-black/20 hover:bg-black/30'
                  : 'border-transparent bg-transparent'
              }`}
              style={{
                boxShadow: isHovered
                  ? `0 0 0 2px ${zone.color}, 0 0 28px ${zone.color}66`
                  : isAlwaysFramed
                    ? `0 0 0 1.5px ${zone.color}99, inset 0 0 22px rgba(0,255,102,0.14)`
                    : undefined,
              }}
            >
              <span
                className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background: zone.color,
                  boxShadow: `0 0 12px ${zone.color}`,
                  animation: 'tb-hub-pulse 1.6s ease-in-out infinite',
                }}
              />
              {showBadgeOnThisArea ? (
                <span
                  className={`pointer-events-none absolute left-1/2 ${
                    zone.labelInside ? 'top-2.5' : 'top-[-2rem]'
                  } z-20 -translate-x-1/2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] md:text-xs font-mono font-bold text-white shadow-xl transition ${
                    isAlwaysFramed || isHovered
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
                  }`}
                  style={{
                    borderColor: zone.color,
                    background: 'rgba(10, 14, 12, 0.92)',
                  }}
                >
                  {zone.label}
                  {zone.sublabel ? (
                    <span className="hidden lg:inline text-zinc-300 font-normal">
                      {' '}
                      · {zone.sublabel}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        }),
      )}

      <button
        type="button"
        aria-label="🌐 Alle Plattformen (Cross-Platform)"
        onMouseEnter={() => onHover('all')}
        onMouseLeave={() => onHover(null)}
        onClick={onSelectAll}
        className="absolute left-[54.8%] top-[22.5%] z-20 h-[31%] w-[18%] rounded-sm border border-transparent bg-transparent cursor-pointer"
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
  currentView = 'home',
  onGoHome,
  onOpenCockpit,
  onOpenPlatformTrophies,
  onRequestLogin,
}) {
  const labActive = isLabModeActive(sessionUser);
  const { hideSwipeHandles, setHideSwipeHandles } = useUserPreferences();
  const [open, setOpen] = useState(false);
  const [hubFilter, setHubFilter] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const touchStartRef = useRef(null);
  const rightEdgePointerRef = useRef(null);
  const leftEdgePointerRef = useRef(null);

  const isHomeView = currentView === 'home';
  const isProfileView = currentView === 'profile';

  const closeRoom = useCallback(() => {
    setOpen(false);
    setHoveredId(null);
  }, []);

  const openRoom = useCallback(() => {
    setOpen(true);
    setShowcaseOpen(false);
  }, []);

  const openUserArea = useCallback(() => {
    closeRoom();
    if (sessionUser) {
      onOpenCockpit?.();
    } else {
      onRequestLogin?.();
    }
  }, [closeRoom, onOpenCockpit, onRequestLogin, sessionUser]);

  const goBackToHome = useCallback(() => {
    closeRoom();
    onGoHome?.();
  }, [closeRoom, onGoHome]);

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
      if (zone.id === 'platinliste_v1') {
        closeRoom();
        onOpenPlatformTrophies?.();
        return;
      }
      if (zone.id === 'trophy') {
        openTrophyWall();
        return;
      }
      applyFilter(zone.filter);
    },
    [applyFilter, closeRoom, onOpenPlatformTrophies, openTrophyWall],
  );

  // Rechte Swipe-Edge-Zone (Startseite -> Gaming Room per Links-Swipe)
  const handleRightEdgePointerDown = useCallback((event) => {
    rightEdgePointerRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleRightEdgePointerMove = useCallback(
    (event) => {
      const start = rightEdgePointerRef.current;
      if (!start) return;
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
      if (isHomeView && !open && deltaX < -24) {
        rightEdgePointerRef.current = null;
        openRoom();
      } else if (open && deltaX > 24) {
        rightEdgePointerRef.current = null;
        closeRoom();
      } else if (isProfileView && deltaX < -24) {
        rightEdgePointerRef.current = null;
        goBackToHome();
      }
    },
    [closeRoom, goBackToHome, isHomeView, isProfileView, open, openRoom],
  );

  const handleRightEdgePointerUp = useCallback(
    (event) => {
      const start = rightEdgePointerRef.current;
      rightEdgePointerRef.current = null;
      if (!start) return;
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
      if (isHomeView && !open && deltaX < -24) {
        openRoom();
      } else if (open && deltaX > 24) {
        closeRoom();
      } else if (isProfileView && deltaX < -24) {
        goBackToHome();
      }
    },
    [closeRoom, goBackToHome, isHomeView, isProfileView, open, openRoom],
  );

  // Linke Swipe-Edge-Zone (Startseite -> Userbereich per Rechts-Swipe / Userbereich -> Startseite)
  const handleLeftEdgePointerDown = useCallback((event) => {
    leftEdgePointerRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleLeftEdgePointerMove = useCallback(
    (event) => {
      const start = leftEdgePointerRef.current;
      if (!start) return;
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
      if (isHomeView && !open && deltaX > 24) {
        leftEdgePointerRef.current = null;
        openUserArea();
      } else if (open && deltaX > 24) {
        leftEdgePointerRef.current = null;
        closeRoom();
      } else if (isProfileView && deltaX < -24) {
        leftEdgePointerRef.current = null;
        goBackToHome();
      }
    },
    [closeRoom, goBackToHome, isHomeView, isProfileView, open, openUserArea],
  );

  const handleLeftEdgePointerUp = useCallback(
    (event) => {
      const start = leftEdgePointerRef.current;
      leftEdgePointerRef.current = null;
      if (!start) return;
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
      if (isHomeView && !open && deltaX > 24) {
        openUserArea();
      } else if (open && deltaX > 24) {
        closeRoom();
      } else if (isProfileView && deltaX < -24) {
        goBackToHome();
      }
    },
    [closeRoom, goBackToHome, isHomeView, isProfileView, open, openUserArea],
  );

  useEffect(() => {
    if (!labActive) return undefined;

    const onKeyDown = (event) => {
      if (isTypingTarget(event.target)) return;
      if (open) {
        if (event.key === 'Escape' || event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          closeRoom();
        }
        return;
      }
      if (isProfileView) {
        if (event.key === 'Escape' || event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          goBackToHome();
        }
        return;
      }
      if (isHomeView) {
        if (event.key === 'r' || event.key === 'R' || event.code === 'KeyR' || event.key === 'ArrowLeft') {
          event.preventDefault();
          openRoom();
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          openUserArea();
        }
      }
    };

    const onTouchStart = (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      const carousel = event.target?.closest?.('.home-carousel-track') || null;
      const panner = event.target?.closest?.('.gaming-room-panner') || null;
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        carousel,
        panner,
      };
    };

    const onTouchEnd = (event) => {
      const start = touchStartRef.current;
      const touch = event.changedTouches?.[0];
      touchStartRef.current = null;
      if (!start || !touch) return;
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const horizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
      if (!horizontal) return;

      if (open) {
        if (deltaX > 45) {
          if (start.panner && start.panner.scrollLeft > 8) return;
          closeRoom();
        }
        return;
      }

      if (isProfileView) {
        if (deltaX < -45) {
          goBackToHome();
        }
        return;
      }

      if (isHomeView) {
        if (deltaX < -45) {
          if (
            start.carousel &&
            start.carousel.scrollLeft + start.carousel.clientWidth <
              start.carousel.scrollWidth - 8
          ) {
            return;
          }
          openRoom();
        } else if (deltaX > 45) {
          if (start.carousel && start.carousel.scrollLeft > 8) {
            return;
          }
          openUserArea();
        }
      }
    };

    const onWheel = (event) => {
      if (event.target?.closest?.('.home-carousel-track, .gaming-room-panner')) return;
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 2) return;
      if (open && event.deltaX < -60) {
        closeRoom();
      } else if (isProfileView && event.deltaX > 60) {
        goBackToHome();
      } else if (isHomeView && !open) {
        if (event.deltaX > 60) {
          openRoom();
        } else if (event.deltaX < -60) {
          openUserArea();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('wheel', onWheel);
    };
  }, [labActive, open, isHomeView, isProfileView, openRoom, closeRoom, openUserArea, goBackToHome]);

  if (!labActive) return null;

  const activeHub = hubFilter ? HUB_FILTERS[hubFilter] : null;
  const swipeHandlesHidden =
    hideSwipeHandles ||
    (typeof window !== 'undefined' &&
      window.localStorage?.getItem(HIDE_SWIPE_HANDLES_KEY) === '1');

  const dismissSwipeHandles = (event) => {
    event.stopPropagation();
    try {
      window.localStorage?.setItem(HIDE_SWIPE_HANDLES_KEY, '1');
    } catch {
      // ignore storage errors
    }
    setHideSwipeHandles(true);
  };

  const handleGroupClass =
    'inline-flex items-center overflow-hidden rounded-l-xl md:rounded-l-2xl border border-r-0 border-[#00ff66]/50 bg-[#101412]/95 text-[#00ff66] shadow-xl shadow-black/50 backdrop-blur-md';
  const handleMainBtnClass =
    'px-2 py-1.5 sm:px-2.5 sm:py-2 md:px-3.5 md:py-3 lg:px-4 lg:py-3.5 font-mono text-[10px] sm:text-[11px] md:text-xs lg:text-sm font-bold tracking-wide text-[#00ff66] hover:bg-[#00ff66] hover:text-black transition cursor-pointer';
  const handleDismissBtnClass =
    'border-l border-[#00ff66]/25 px-1.5 py-1.5 sm:px-2 sm:py-2 md:px-2.5 md:py-3 lg:py-3.5 font-mono text-[10px] sm:text-xs md:text-sm font-bold text-zinc-400 hover:bg-red-500/20 hover:text-red-300 transition cursor-pointer';

  return (
    <>
      <style>{`
        @keyframes tb-hub-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.85; }
          50% { transform: translate(-50%, -50%) scale(1.45); opacity: 0.35; }
        }
      `}</style>

      {/* STARTSEITE: Beide Swipe-Handles am rechten Bildschirmrand untereinander gruppiert */}
      {isHomeView && !open && !swipeHandlesHidden ? (
        <>
          <div
            aria-hidden="false"
            onPointerDown={handleLeftEdgePointerDown}
            onPointerMove={handleLeftEdgePointerMove}
            onPointerUp={handleLeftEdgePointerUp}
            onPointerCancel={() => {
              leftEdgePointerRef.current = null;
            }}
            className="fixed left-0 top-16 bottom-0 z-[54] w-4 sm:w-6 touch-pan-y select-none"
          />

          <div
            aria-hidden="false"
            onPointerDown={handleRightEdgePointerDown}
            onPointerMove={handleRightEdgePointerMove}
            onPointerUp={handleRightEdgePointerUp}
            onPointerCancel={() => {
              rightEdgePointerRef.current = null;
            }}
            className="fixed right-0 top-16 bottom-0 z-[54] w-4 sm:w-6 touch-pan-y select-none"
          />

          <div className="fixed right-0 bottom-[10%] z-[55] flex flex-col items-end gap-2">
            <div className={handleGroupClass}>
              <button
                type="button"
                onClick={openUserArea}
                className={handleMainBtnClass}
              >
                🏆 Userbereich ← Swipe
              </button>
              <button
                type="button"
                onClick={dismissSwipeHandles}
                aria-label="Swipe-Buttons ausblenden"
                title="Swipe-Buttons am Rand ausblenden"
                className={handleDismissBtnClass}
              >
                ×
              </button>
            </div>

            <div className={handleGroupClass}>
              <button
                type="button"
                onClick={openRoom}
                className={handleMainBtnClass}
              >
                🕹️ Gaming Room ← Swipe
              </button>
              <button
                type="button"
                onClick={dismissSwipeHandles}
                aria-label="Swipe-Buttons ausblenden"
                title="Swipe-Buttons am Rand ausblenden"
                className={handleDismissBtnClass}
              >
                ×
              </button>
            </div>
          </div>
        </>
      ) : null}

      {/* USERBEREICH: Zurück zur Startseite per Swipe nach links */}
      {isProfileView && !open && !swipeHandlesHidden ? (
        <div
          aria-hidden="false"
          onPointerDown={handleRightEdgePointerDown}
          onPointerMove={handleRightEdgePointerMove}
          onPointerUp={handleRightEdgePointerUp}
          onPointerCancel={() => {
            rightEdgePointerRef.current = null;
          }}
          className="fixed right-0 top-16 bottom-0 z-[54] w-4 sm:w-6 touch-pan-y select-none"
        >
          <div className={`fixed right-0 bottom-[10%] z-[55] ${handleGroupClass}`}>
            <button
              type="button"
              onClick={goBackToHome}
              className={handleMainBtnClass}
            >
              🏠 Startseite ← Swipe
            </button>
            <button
              type="button"
              onClick={dismissSwipeHandles}
              aria-label="Swipe-Buttons ausblenden"
              title="Swipe-Buttons am Rand ausblenden"
              className={handleDismissBtnClass}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      {isHomeView && activeHub && !open ? (
        <div className="fixed left-3 right-3 top-[61px] z-[54] mx-auto flex max-w-4xl items-center justify-between gap-2 rounded-2xl border border-[#00ff66]/40 bg-[#101412]/95 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur-md md:top-[77px]">
          <p className="min-w-0 truncate font-mono text-xs font-bold text-white">
            {activeHub.banner}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHubFilter(null)}
              className="rounded-lg border border-zinc-700 px-2 py-1 font-mono text-[10px] text-zinc-300 hover:text-white cursor-pointer"
            >
              Filter lösen
            </button>
            <button
              type="button"
              onClick={openRoom}
              className="rounded-lg bg-[#00ff66] px-2 py-1 font-mono text-[10px] font-bold text-black cursor-pointer"
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
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <button
              type="button"
              onClick={closeRoom}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs font-bold text-white hover:border-[#00ff66]/50 cursor-pointer"
            >
              ← Zurück zur Übersicht
            </button>
            <p className="hidden font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400 sm:block">
              Lab · Gaming Room
            </p>
          </div>

          <div className="min-h-0 flex-1 px-2 pb-3 md:flex md:items-center md:justify-center">
            <div className="gaming-room-panner h-full overflow-x-auto snap-x snap-mandatory md:hidden">
              <div className="relative aspect-[16/9] h-[75vh] w-auto min-w-[125vh] snap-center">
                <RoomScene
                  hoveredId={hoveredId}
                  onHover={setHoveredId}
                  onSelectZone={handleSelectZone}
                  onSelectAll={() => applyFilter('all')}
                />
              </div>
            </div>

            <div className="relative mx-auto hidden aspect-[16/9] max-h-[calc(100dvh-4.25rem)] w-full max-w-[min(1600px,calc((100dvh-4.25rem)*16/9))] md:block">
              <RoomScene
                hoveredId={hoveredId}
                onHover={setHoveredId}
                onSelectZone={handleSelectZone}
                onSelectAll={() => applyFilter('all')}
              />
            </div>
          </div>

          {/* GAMING ROOM: Selbe Stelle (10% über Bildschirmende) Swipe "Startseite" nach rechts */}
          {open ? (
            <button
              type="button"
              onClick={closeRoom}
              className="fixed right-0 bottom-[10%] z-[85] rounded-l-2xl border border-r-0 border-[#00ff66]/50 bg-[#101412]/95 px-2.5 py-3 font-mono text-[11px] font-bold tracking-wide text-[#00ff66] shadow-xl shadow-black/50 backdrop-blur-md hover:bg-[#00ff66] hover:text-black cursor-pointer"
            >
              🏠 Startseite → Swipe
            </button>
          ) : null}
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
                className="rounded-lg border border-zinc-700 px-3 py-1.5 font-mono text-xs text-zinc-300 cursor-pointer"
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
                className="rounded-lg bg-[#eab308] px-3 py-1.5 font-mono text-xs font-bold text-black cursor-pointer"
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
