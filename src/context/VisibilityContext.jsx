import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { HIDDEN_IDS_STORAGE_KEY } from '../lib/guideKeyMigration';
import {
  DISPLAY_MODE_STORAGE_KEY,
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

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== HIDDEN_IDS_STORAGE_KEY && event.key !== DISPLAY_MODE_STORAGE_KEY) return;
      store.reloadFromStorage();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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
