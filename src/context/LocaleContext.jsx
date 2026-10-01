import {
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
import { DEFAULT_AVAILABLE_LOCALES, coerceToAvailableLocale } from '../lib/contentLocales';

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
  const [availableLocales, setAvailableLocales] = useState(DEFAULT_AVAILABLE_LOCALES);

  const displayLocale = coerceToAvailableLocale(globalLocale, availableLocales);

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
    const pathLocale = coerceToAvailableLocale(normalized, availableLocales);
    syncPathLocale(pathLocale);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = pathLocale;
    }
  }, [availableLocales]);

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
      document.documentElement.lang = displayLocale;
    }
    return () => {
      window.removeEventListener(LOCALE_CHANGE_EVENT, onLocaleChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [displayLocale]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pretty = parsePrettyGamePath(window.location.pathname);
    if (!pretty) return;
    if (!availableLocales.includes(pretty.locale)) {
      syncPathLocale(displayLocale);
    }
  }, [availableLocales, displayLocale]);

  const value = useMemo(
    () => ({
      globalLocale: displayLocale,
      persistedLocale: globalLocale,
      availableLocales,
      setAvailableLocales,
      setGlobalLocale,
      t: (key) => t(displayLocale, key),
    }),
    [displayLocale, globalLocale, availableLocales, setGlobalLocale],
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
