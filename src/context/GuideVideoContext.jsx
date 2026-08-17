import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const GuideVideoContext = createContext(null);

export function GuideVideoProvider({ children }) {
  const [hasActiveVideo, setHasActiveVideo] = useState(false);

  const notifyVideoStarted = useCallback(() => {
    setHasActiveVideo(true);
  }, []);

  const notifyVideoCleared = useCallback(() => {
    setHasActiveVideo(false);
  }, []);

  const value = useMemo(
    () => ({
      hasActiveVideo,
      notifyVideoStarted,
      notifyVideoCleared,
    }),
    [hasActiveVideo, notifyVideoStarted, notifyVideoCleared],
  );

  return <GuideVideoContext.Provider value={value}>{children}</GuideVideoContext.Provider>;
}

export function useGuideVideo() {
  const ctx = useContext(GuideVideoContext);
  if (!ctx) {
    return {
      hasActiveVideo: false,
      notifyVideoStarted: () => {},
      notifyVideoCleared: () => {},
    };
  }
  return ctx;
}
