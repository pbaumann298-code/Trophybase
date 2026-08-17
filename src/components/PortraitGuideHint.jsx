import React, { useEffect, useState } from 'react';
import { useGuideVideo } from '../context/GuideVideoContext';
import { useOrientation } from '../hooks/useOrientation';

const AUTO_HIDE_MS = 6000;
const SESSION_KEY = 'tb_portrait_hint_dismissed';

/**
 * Dezenter Hinweis nur im Guide + Portrait + aktives Video.
 * @param {boolean} isGuideView – Nutzer ist auf der Spiele-Guide-Seite
 * @param {boolean} isVideoGuideTab – Reiter mit Video-Player (nicht Trophäen)
 */
function PortraitGuideHint({ isGuideView, isVideoGuideTab }) {
  const { isPortrait } = useOrientation();
  const { hasActiveVideo } = useGuideVideo();
  const [visible, setVisible] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const shouldShow =
    isGuideView &&
    isVideoGuideTab &&
    isPortrait &&
    hasActiveVideo &&
    !sessionStorage.getItem(SESSION_KEY);

  useEffect(() => {
    if (!shouldShow) {
      setVisible(false);
      setMinimized(false);
      return undefined;
    }

    setVisible(true);
    setMinimized(false);

    const timer = window.setTimeout(() => {
      setVisible(false);
      setMinimized(true);
    }, AUTO_HIDE_MS);

    return () => window.clearTimeout(timer);
  }, [shouldShow]);

  if (!shouldShow) {
    return null;
  }

  if (!visible) {
    if (minimized) {
      return (
        <button
          type="button"
          onClick={() => setVisible(true)}
          className="portrait-guide-hint portrait-guide-hint--pill"
          aria-label="Querformat-Tipp anzeigen"
        >
          📱 Querformat
        </button>
      );
    }
    return null;
  }

  const dismiss = () => {
    setVisible(false);
    setMinimized(true);
  };

  const dismissSession = () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    setVisible(false);
    setMinimized(false);
  };

  return (
    <div className="portrait-guide-hint" role="status" aria-live="polite">
      <p className="portrait-guide-hint__text">
        Für die beste Guide-Erfahrung mit Video bitte das Gerät ins Querformat drehen.
      </p>
      <div className="portrait-guide-hint__actions">
        <button type="button" onClick={dismiss} className="portrait-guide-hint__btn">
          OK
        </button>
        <button
          type="button"
          onClick={dismissSession}
          className="portrait-guide-hint__btn portrait-guide-hint__btn--muted"
        >
          Nicht mehr
        </button>
      </div>
    </div>
  );
}

export default PortraitGuideHint;
