import { hasPublishedGuide, isGameDraftMode, parseStatusMap } from '../lib/guidePublication';
import { GAME_STRUCT, isServerDeadType } from '../lib/gameSchema';

/**
 * Mehrstufiges Status-Icon oben links auf dem Game-Cover.
 * - Für Admins (visible = true / isAdmin): Aktueller / neuester Status der Pipeline
 *   (DRAFT 🎬, PUBLISHED green check, READY ⏳, VEREDELT blue circle, PROCESSED white circle).
 * - Für normale User: Bei spiel_typ === 'Servertot' das "Unobtainable Platins"-Badge.
 */
function GuideOnlineBadge({ game, visible = false, size = 'sm', className = '' }) {
  if (!game) return null;

  const isServerDead = isServerDeadType(game?.[GAME_STRUCT.gameType] ?? game?.spiel_typ);

  // Für Admins: Mehrstufiges Admin-Status-Icon
  if (visible) {
    const statusMap = parseStatusMap(game?.[GAME_STRUCT.status] ?? game?.status);
    const sizeClass =
      size === 'md' ? 'w-8 h-8 text-sm' : size === 'lg' ? 'w-10 h-10 text-base' : 'w-7 h-7 text-xs';
    const iconSize = size === 'md' || size === 'lg' ? 'w-3.5 h-3.5' : 'w-3 h-3';

    // 1. DRAFT / production_roadmap === 'ACTIVE' -> Gelbes Filmklappen-Icon (🎬)
    if (isGameDraftMode(game)) {
      return (
        <span
          className={`${sizeClass} rounded-full border border-amber-400 bg-amber-500/90 text-black flex items-center justify-center shadow-md font-bold ${className}`}
          title="DRAFT / Video-Roadmap (Entwurf)"
          aria-label="DRAFT / Video-Roadmap (Entwurf)"
        >
          🎬
        </span>
      );
    }

    // 2. PUBLISHED 3. Phase -> Grüner Kreis mit Häkchen
    if (hasPublishedGuide(game)) {
      return (
        <span
          className={`${sizeClass} rounded-full border border-[#00ff66] bg-[#00ff66] text-[#121314] flex items-center justify-center shadow-md ${className}`}
          title="PUBLISHED (Online)"
          aria-label="PUBLISHED (Online)"
        >
          <svg
            viewBox="0 0 24 24"
            className={iconSize}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12.5 10 17.5 19 7" />
          </svg>
        </span>
      );
    }

    // 3. READY (Drip-Feed-Warteschlange) -> Blaues Uhr-Icon (⏳)
    const guideDe = String(statusMap.guide_de ?? '').toUpperCase();
    const isReady =
      guideDe === 'READY' ||
      guideDe === 'FERTIG' ||
      String(statusMap.status ?? '').toUpperCase() === 'READY' ||
      Object.entries(statusMap).some(
        ([k, v]) => k.startsWith('guide_') && (String(v).toUpperCase() === 'READY' || String(v).toUpperCase() === 'FERTIG'),
      );

    if (isReady) {
      return (
        <span
          className={`${sizeClass} rounded-full border border-sky-300 bg-sky-500 text-white flex items-center justify-center shadow-md ${className}`}
          title="READY (Drip-Feed-Warteschlange)"
          aria-label="READY (Drip-Feed-Warteschlange)"
        >
          ⏳
        </span>
      );
    }

    // 4. "refinement": "VEREDELT" (blauer Kreis) 2. Phase
    if (String(statusMap.refinement ?? '').toUpperCase() === 'VEREDELT') {
      return (
        <span
          className={`${sizeClass} rounded-full border border-blue-300 bg-blue-600 text-white flex items-center justify-center shadow-md ${className}`}
          title="VEREDELT (Phase 2)"
          aria-label="VEREDELT (Phase 2)"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-blue-200" />
        </span>
      );
    }

    // 5. "trophies": "PROCESSED" (weißer Kreis) 1. Phase
    if (String(statusMap.trophies ?? '').toUpperCase() === 'PROCESSED') {
      return (
        <span
          className={`${sizeClass} rounded-full border border-zinc-200 bg-white text-zinc-900 flex items-center justify-center shadow-md ${className}`}
          title="PROCESSED (Phase 1)"
          aria-label="PROCESSED (Phase 1)"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
        </span>
      );
    }

    // Fallback falls kein expliziter Status vorliegt, aber Servertot
    if (isServerDead) {
      return (
        <span
          className={`${sizeClass} rounded-full overflow-hidden border border-amber-500/80 shadow-md bg-black flex items-center justify-center ${className}`}
          title="Unobtainable Platins (Servertot)"
          aria-label="Unobtainable Platins (Servertot)"
        >
          <img
            src="/images/unobtainable-platins-tile.jpg"
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        </span>
      );
    }

    return null;
  }

  // Für normale User: Wenn das Spiel spiel_typ === 'Servertot' hat
  if (isServerDead) {
    const sizeClass =
      size === 'md' ? 'w-8 h-8' : size === 'lg' ? 'w-10 h-10' : 'w-7 h-7';

    return (
      <span
        className={`${sizeClass} rounded-full overflow-hidden border border-amber-500/80 shadow-md bg-black flex items-center justify-center ${className}`}
        title="Unobtainable Platins (Servertot)"
        aria-label="Unobtainable Platins (Servertot)"
      >
        <img
          src="/images/unobtainable-platins-tile.jpg"
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
        />
      </span>
    );
  }

  return null;
}

export default GuideOnlineBadge;
