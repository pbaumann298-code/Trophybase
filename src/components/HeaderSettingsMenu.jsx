import { useEffect, useId, useRef, useState } from 'react';
import { useVisibility } from '../context/VisibilityContext';
import { useLocale } from '../context/LocaleContext';
import { localeOptions } from '../lib/uiStrings';
import { SUPPORTED_LOCALES } from '../lib/locale';
import { DEFAULT_AVAILABLE_LOCALES } from '../lib/contentLocales';

function GearIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V19a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H5a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H10a1.7 1.7 0 0 0 1-1.5V5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V10c.1.7.7 1.2 1.5 1.3H19a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.2Z" />
    </svg>
  );
}

function HeaderSettingsMenu({
  sessionUser = null,
  isAdmin = false,
  onLogout,
  onOpenWatchlist,
  onOpenPlatformTrophies,
  watchlistPath = '/watchlist',
}) {
  const { t, globalLocale, setGlobalLocale, availableLocales } = useLocale();
  const { displayMode, setDisplayMode, modes } = useVisibility();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();
  const isDim = displayMode === modes.DIM;

  const languageCodes = isAdmin
    ? SUPPORTED_LOCALES
    : (availableLocales ?? DEFAULT_AVAILABLE_LOCALES);
  const languageOptions = localeOptions(languageCodes);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (mode) => {
    setDisplayMode(mode);
    setOpen(false);
  };

  const chooseLanguage = (code) => {
    setGlobalLocale(code, isAdmin ? { unlock: true } : undefined);
    setOpen(false);
  };

  const openWatchlist = (event) => {
    event.preventDefault();
    setOpen(false);
    onOpenWatchlist?.();
  };

  const logout = () => {
    setOpen(false);
    onLogout?.();
  };

  return (
    <div ref={rootRef} className="header-settings relative flex-shrink-0">
      <button
        type="button"
        className={`header-settings__trigger flex h-8 w-8 items-center justify-center rounded-lg border transition backdrop-blur-sm ${
          open
            ? 'border-[#00ff66]/35 bg-[#00ff66]/10 text-[#00ff66]'
            : 'border-zinc-800 bg-[#121314]/90 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
        }`}
        aria-label={t('settingsMenu')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <GearIcon className="h-4 w-4" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t('settingsMenu')}
          className="header-settings__menu absolute right-0 top-[calc(100%+0.4rem)] z-[80] max-h-[min(70vh,28rem)] min-w-[13.5rem] overflow-y-auto rounded-xl border border-zinc-800 bg-[#121314] py-1.5 shadow-xl shadow-black/40"
        >
          {languageOptions.length >= 2 ? (
            <>
              <p className="px-3 pb-1 pt-0.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                {t('language')}
              </p>
              {languageOptions.map((opt) => {
                const selected = opt.code === globalLocale;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                      selected
                        ? 'bg-[#00ff66]/10 text-[#00ff66]'
                        : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                    }`}
                    onClick={() => chooseLanguage(opt.code)}
                  >
                    <span aria-hidden>{opt.flag}</span>
                    <span className="font-semibold">{opt.label}</span>
                    <span className="ml-auto font-mono text-[10px] text-zinc-500">{opt.short}</span>
                  </button>
                );
              })}
              <div className="my-1.5 border-t border-zinc-800" role="separator" />
            </>
          ) : null}

          <p className="px-3 pb-1 pt-0.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            {t('settingsHiddenItems')}
          </p>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={isDim}
            className={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition ${
              isDim
                ? 'bg-[#00ff66]/10 text-[#00ff66]'
                : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
            }`}
            onClick={() => choose(modes.DIM)}
          >
            <span className="mt-0.5 w-3 flex-shrink-0 font-mono" aria-hidden>
              {isDim ? '●' : '○'}
            </span>
            <span>
              <span className="block font-semibold">{t('settingsShowHidden')}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-zinc-500">
                {t('settingsShowHiddenHint')}
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!isDim}
            className={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition ${
              !isDim
                ? 'bg-[#00ff66]/10 text-[#00ff66]'
                : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
            }`}
            onClick={() => choose(modes.FILTER)}
          >
            <span className="mt-0.5 w-3 flex-shrink-0 font-mono" aria-hidden>
              {!isDim ? '●' : '○'}
            </span>
            <span>
              <span className="block font-semibold">{t('settingsHideHidden')}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-zinc-500">
                {t('settingsHideHiddenHint')}
              </span>
            </span>
          </button>

          <div className="my-1.5 border-t border-zinc-800" role="separator" />

          <a
            href={watchlistPath}
            role="menuitem"
            className="block px-3 py-2 text-xs font-semibold text-[#00ff66] no-underline hover:bg-zinc-800/80"
            onClick={openWatchlist}
          >
            {t('watchlistTitle')}
          </a>

          {isAdmin ? (
            <a
              href="/platinliste"
              role="menuitem"
              className="block px-3 py-2 text-xs font-semibold text-[#00ff66] no-underline hover:bg-zinc-800/80"
              onClick={(e) => {
                e.preventDefault();
                setOpen(false);
                onOpenPlatformTrophies?.();
              }}
            >
              🏆 Platinliste V1
            </a>
          ) : null}

          {sessionUser ? (
            <>
              <div className="my-1.5 border-t border-zinc-800" role="separator" />
              {sessionUser.email ? (
                <p className="px-3 pb-1 text-[10px] font-mono text-zinc-600 truncate" title={sessionUser.email}>
                  {sessionUser.email}
                </p>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2 text-left text-xs font-medium text-red-400 hover:bg-red-500/10"
                onClick={logout}
              >
                {t('logout')}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default HeaderSettingsMenu;
