import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  bootstrapGlobalLocaleAsync,
  bootstrapGlobalLocaleSync,
  getLocale,
  getPersistedLocale,
  LOCALE_CHANGE_EVENT,
  setLocale as persistLocale,
} from '../lib/locale';
import { parsePrettyGamePath } from '../lib/gameSlug';
import { syncPathLocale } from '../lib/routeUtils';
import { t } from '../lib/uiStrings';

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [globalLocale, setGlobalLocaleState] = useState(() => {
    if (typeof window !== 'undefined') {
      const pretty = parsePrettyGamePath(window.location.pathname);
      if (pretty?.locale) {
        return persistLocale(pretty.locale, { skipEvent: true });
      }
      return bootstrapGlobalLocaleSync();
    }
    return getLocale();
  });

  useEffect(() => {
    if (getPersistedLocale()) return undefined;

    let cancelled = false;

    bootstrapGlobalLocaleAsync().then((locale) => {
      if (cancelled) return;
      setGlobalLocaleState(locale);
      window.dispatchEvent(
        new CustomEvent(LOCALE_CHANGE_EVENT, { detail: { locale } }),
      );
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setGlobalLocale = useCallback((next) => {
    const normalized = persistLocale(next);
    setGlobalLocaleState(normalized);
    syncPathLocale(normalized);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = normalized;
    }
  }, []);

  useEffect(() => {
    const onLocaleChange = (event) => {
      if (event?.detail?.locale) {
        setGlobalLocaleState(event.detail.locale);
      } else {
        setGlobalLocaleState(getLocale());
      }
    };

    const onStorage = (event) => {
      if (event.key === 'tb_locale') {
        setGlobalLocaleState(getLocale());
      }
    };

    window.addEventListener(LOCALE_CHANGE_EVENT, onLocaleChange);
    window.addEventListener('storage', onStorage);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = globalLocale;
    }
    return () => {
      window.removeEventListener(LOCALE_CHANGE_EVENT, onLocaleChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [globalLocale]);

  const value = useMemo(
    () => ({
      globalLocale,
      setGlobalLocale,
      t: (key) => t(globalLocale, key),
    }),
    [globalLocale, setGlobalLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return ctx;
}
