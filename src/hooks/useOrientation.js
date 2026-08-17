import { useEffect, useState } from 'react';

function readOrientation() {
  if (typeof window === 'undefined') {
    return { isPortrait: true, isLandscape: false };
  }

  const mqPortrait = window.matchMedia('(orientation: portrait)');
  return {
    isPortrait: mqPortrait.matches,
    isLandscape: !mqPortrait.matches,
  };
}

/** Reagiert auf Geräte-Drehung (portrait / landscape). */
export function useOrientation() {
  const [orientation, setOrientation] = useState(readOrientation);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');

    const update = () => {
      setOrientation({
        isPortrait: mq.matches,
        isLandscape: !mq.matches,
      });
    };

    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return orientation;
}
