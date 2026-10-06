import { useEffect, useState } from 'react';
import { useGuideVideo } from '../context/GuideVideoContext';
import { useOrientation } from './useOrientation';
import { hintSeen } from '../lib/featureHints';

const PORTRAIT_DISMISS_KEY = 'tb_portrait_hint_dismissed';

function readSeen() {
  return {
    swipe: hintSeen('swipe'),
    watchlist: hintSeen('watchlist'),
  };
}

/**
 * Höchstens ein Hinweis: Querformat vor Wischen vor Watchlist.
 */
export function useFeatureHintSlots({ isVideoGuideTab, tabCount }) {
  const { isPortrait } = useOrientation();
  const { hasActiveVideo } = useGuideVideo();
  const [coarse, setCoarse] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  );
  const [seen, setSeen] = useState(readSeen);

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const onChange = () => setCoarse(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const onSeen = () => setSeen(readSeen());
    window.addEventListener('tb-hint-seen', onSeen);
    return () => window.removeEventListener('tb-hint-seen', onSeen);
  }, []);

  const portrait =
    isVideoGuideTab &&
    isPortrait &&
    hasActiveVideo &&
    !window.sessionStorage.getItem(PORTRAIT_DISMISS_KEY);
  const swipe = coarse && tabCount > 1 && !seen.swipe && !portrait;
  const watchlist = !swipe && !portrait && !seen.watchlist;

  return { swipe, watchlist };
}
