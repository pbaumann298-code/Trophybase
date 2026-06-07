import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  VISIBILITY_MODE,
  createVisibilityStore,
  gameVisibilityKey,
  itemVisibilityKey,
} from '../lib/visibilityPreferences';

const VisibilityContext = createContext(null);

const store = createVisibilityStore();

export function VisibilityProvider({ children }) {
  const [snapshot, setSnapshot] = useState(() => store.getSnapshot());

  useEffect(
    () =>
      store.subscribe(() => {
        setSnapshot(store.getSnapshot());
      }),
    [],
  );

  const value = useMemo(
    () => ({
      displayMode: snapshot.displayMode,
      setDisplayMode: (mode) => store.setDisplayMode(mode),
      toggleHidden: (id) => store.toggleHidden(id),
      isHidden: (id) => store.isHidden(id),
      getEntryState: (id, options) => store.getEntryState(id, options),
      itemKey: itemVisibilityKey,
      gameKey: gameVisibilityKey,
      modes: VISIBILITY_MODE,
    }),
    [snapshot],
  );

  return <VisibilityContext.Provider value={value}>{children}</VisibilityContext.Provider>;
}

export function useVisibility() {
  const ctx = useContext(VisibilityContext);
  if (!ctx) {
    throw new Error('useVisibility must be used within VisibilityProvider');
  }
  return ctx;
}
