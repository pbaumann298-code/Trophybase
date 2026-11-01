import { useEffect, useId, useRef, useState } from 'react';
import { useVisibility } from '../context/VisibilityContext';
import { useLocale } from '../context/LocaleContext';
import { localeOptions } from '../lib/uiStrings';
import { SUPPORTED_LOCALES } from '../lib/locale';
import { DEFAULT_AVAILABLE_LOCALES } from '../lib/contentLocales';
import {
  COMPLETED_TROPHY_STYLE,
  HOME_LAYOUT_MODE,
  VIDEO_TIMESTAMP_LAYOUT,
  useUserPreferences,
} from '../lib/userPreferences';

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
  onOpenProfile,
  onCustomizeHome,
  watchlistPath = '/watchlist',
  profilePath = '/profile',
}) {
  const { t, globalLocale, setGlobalLocale, availableLocales } = useLocale();
  const { displayMode, setDisplayMode, modes } = useVisibility();
  const {
    homeLayoutMode,
    videoTimestampLayout,
    hidePlatinumedGames,
    completedTrophyStyle,
    hideSwipeHandles,
    setHomeLayoutMode,
    setVideoTimestampLayout,
    setHidePlatinumedGames,
    setCompletedTrophyStyle,
    setHideSwipeHandles,
  } = useUserPreferences();
  const [open, setOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [customizeMenuOpen, setCustomizeMenuOpen] = useState(false);
  const [customizeSubSection, setCustomizeSubSection] = useState('view');
  const rootRef = useRef(null);
  const menuId = useId();
  const isDim = displayMode === modes.DIM;
  const showSwipeHandles = !hideSwipeHandles;

  const languageCodes = isAdmin
    ? SUPPORTED_LOCALES
    : (availableLocales?.length ? availableLocales : DEFAULT_AVAILABLE_LOCALES);
  const languageOptions = localeOptions(languageCodes);
  const activeLanguageOption =
    languageOptions.find((opt) => opt.code === globalLocale) ??
    localeOptions([globalLocale])[0];

  useEffect(() => {
    if (!open) {
      setLangDropdownOpen(false);
      return undefined;
    }

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setLangDropdownOpen(false);
        setOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setLangDropdownOpen(false);
        setOpen(false);
      }
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
    setLangDropdownOpen(false);
    setOpen(false);
  };

  const chooseLanguage = (code) => {
    setGlobalLocale(code, isAdmin ? { unlock: true } : undefined);
    setLangDropdownOpen(false);
    setOpen(false);
  };

  const openWatchlist = (event) => {
    event.preventDefault();
    setOpen(false);
    onOpenWatchlist?.();
  };

  const openProfile = (event) => {
    event.preventDefault();
    setOpen(false);
    onOpenProfile?.();
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
          className="header-settings__menu absolute right-0 top-[calc(100%+0.4rem)] z-[80] max-h-[min(80vh,34rem)] min-w-[18.5rem] sm:min-w-[20.5rem] max-w-[92vw] overflow-y-auto rounded-xl border border-zinc-800 bg-[#121314] py-1.5 shadow-xl shadow-black/40"
        >
          {languageOptions.length >= 2 ? (
            <>
              <button
                type="button"
                aria-expanded={langDropdownOpen}
                onClick={() => setLangDropdownOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-zinc-200 transition hover:bg-zinc-800/80 hover:text-white"
              >
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  {t('websiteLanguage') || t('language') || 'Websitesprache'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700/80 bg-zinc-900/90 px-2 py-0.5 font-mono text-[11px] font-bold text-[#00ff66]">
                  {activeLanguageOption?.flag ? (
                    <span aria-hidden>{activeLanguageOption.flag}</span>
                  ) : null}
                  <span>{globalLocale.toUpperCase()}</span>
                  <span aria-hidden className="text-[10px] text-zinc-400">
                    {langDropdownOpen ? '▴' : '▾'}
                  </span>
                </span>
              </button>

              {langDropdownOpen ? (
                <div className="mx-1.5 my-1 max-h-56 overflow-y-auto rounded-lg border border-zinc-800/90 bg-[#0d0e0f] py-1">
                  {languageOptions.map((opt) => {
                    const selected = opt.code === globalLocale;
                    return (
                      <button
                        key={opt.code}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition ${
                          selected
                            ? 'bg-[#00ff66]/10 text-[#00ff66]'
                            : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                        }`}
                        onClick={() => chooseLanguage(opt.code)}
                      >
                        <span aria-hidden>{opt.flag}</span>
                        <span className="font-semibold">{opt.label}</span>
                        <span className="ml-auto font-mono text-[10px] text-zinc-500">
                          {opt.short}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

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

          {/* TrophyBase individualisieren (aufklappbares Untermenü) */}
          <div className="px-1.5">
            <button
              type="button"
              aria-expanded={customizeMenuOpen}
              onClick={() => setCustomizeMenuOpen((prev) => !prev)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs font-bold transition cursor-pointer ${
                customizeMenuOpen
                  ? 'bg-[#00ff66]/12 text-[#00ff66]'
                  : 'text-[#00ff66] hover:bg-zinc-800/80'
              }`}
            >
              <span>TrophyBase individualisieren</span>
              <span aria-hidden className="font-mono text-[10px]">
                {customizeMenuOpen ? '▴' : '▾'}
              </span>
            </button>

            {customizeMenuOpen ? (
              <div className="mt-1 mb-1.5 rounded-lg border border-zinc-800/90 bg-[#0d0e0f] p-2 space-y-2.5">
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-900/90 p-1">
                  <button
                    type="button"
                    onClick={() => setCustomizeSubSection('view')}
                    className={`rounded-md px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                      customizeSubSection === 'view'
                        ? 'bg-[#00ff66] text-black'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Startseiten-Ansicht
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomizeSubSection('features')}
                    className={`rounded-md px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                      customizeSubSection === 'features'
                        ? 'bg-[#00ff66] text-black'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Funktionen
                  </button>
                </div>

                {customizeSubSection === 'view' ? (
                  <div className="space-y-1">
                    <p className="px-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                      Startseiten-Layout (Einzelauswahl)
                    </p>
                    {[
                      {
                        id: HOME_LAYOUT_MODE.RAILS,
                        label: 'Standard (Netflix-Reihen)',
                        hint: 'Kategorie-Schienen mit Covern',
                      },
                      {
                        id: HOME_LAYOUT_MODE.TABLE,
                        label: 'Kompakt (Daten-Tabelle)',
                        hint: 'Schlanke Liste ohne große Bilderwand',
                      },
                      {
                        id: HOME_LAYOUT_MODE.GRID,
                        label: 'Poster-Wand (Raster)',
                        hint: 'Dichtes Cover-Raster aller Kategorien',
                      },
                      {
                        id: HOME_LAYOUT_MODE.MINIMAL,
                        label: 'Purist (Minimal)',
                        hint: 'Nur Suche & Watchlist',
                      },
                    ].map((opt) => {
                      const active = homeLayoutMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => setHomeLayoutMode(opt.id)}
                          className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition cursor-pointer ${
                            active
                              ? 'bg-[#00ff66]/10 text-[#00ff66]'
                              : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                          }`}
                        >
                          <span className="mt-0.5 w-3 flex-shrink-0 font-mono" aria-hidden>
                            {active ? '●' : '○'}
                          </span>
                          <span>
                            <span className="block font-semibold">{opt.label}</span>
                            <span className="block text-[10px] text-zinc-500">{opt.hint}</span>
                          </span>
                        </button>
                      );
                    })}

                    {typeof onCustomizeHome === 'function' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          onCustomizeHome();
                        }}
                        className="mt-1.5 flex w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/70 px-2.5 py-1.5 text-left text-[11px] font-semibold text-zinc-300 hover:border-[#00ff66]/40 hover:text-white cursor-pointer"
                      >
                        <span>Kategorien & Reihenfolge anpassen …</span>
                        <span aria-hidden>→</span>
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* 1. Video & Timestamps Anordnung */}
                    <div className="space-y-1">
                      <p className="px-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                        1. Video & Timestamps Anordnung
                      </p>
                      {[
                        {
                          id: VIDEO_TIMESTAMP_LAYOUT.VIDEO_LEFT,
                          label: 'Video links & Timestamps rechts',
                        },
                        {
                          id: VIDEO_TIMESTAMP_LAYOUT.TIMESTAMPS_LEFT,
                          label: 'Timestamps links & Video rechts',
                        },
                      ].map((opt) => {
                        const active = videoTimestampLayout === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={active}
                            onClick={() => setVideoTimestampLayout(opt.id)}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition cursor-pointer ${
                              active
                                ? 'bg-[#00ff66]/10 text-[#00ff66] font-semibold'
                                : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                            }`}
                          >
                            <span className="w-3 flex-shrink-0 font-mono" aria-hidden>
                              {active ? '●' : '○'}
                            </span>
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* 2. Platinierte Spiele ausblenden */}
                    <div className="flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-2 px-1">
                      <span className="text-xs text-zinc-200 leading-snug">
                        Platinierte Spiele auf Startseite/Katalog ausblenden
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={hidePlatinumedGames}
                        onClick={() => setHidePlatinumedGames(!hidePlatinumedGames)}
                        className={`shrink-0 rounded-md border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                          hidePlatinumedGames
                            ? 'border-[#00ff66]/50 bg-[#00ff66]/15 text-[#00ff66]'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {hidePlatinumedGames ? 'An' : 'Aus'}
                      </button>
                    </div>

                    {/* 3. Darstellung abgehakter Trophäen im Guide */}
                    <div className="space-y-1 border-t border-zinc-800/80 pt-2">
                      <p className="px-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                        Darstellung abgehakter Trophäen im Guide
                      </p>
                      {[
                        {
                          id: COMPLETED_TROPHY_STYLE.CHECK,
                          label: 'Nur abhaken',
                        },
                        {
                          id: COMPLETED_TROPHY_STYLE.DIM,
                          label: 'Ausgrauen',
                        },
                        {
                          id: COMPLETED_TROPHY_STYLE.HIDE,
                          label: 'Komplett ausblenden',
                        },
                      ].map((opt) => {
                        const active = completedTrophyStyle === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={active}
                            onClick={() => setCompletedTrophyStyle(opt.id)}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition cursor-pointer ${
                              active
                                ? 'bg-[#00ff66]/10 text-[#00ff66] font-semibold'
                                : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                            }`}
                          >
                            <span className="w-3 flex-shrink-0 font-mono" aria-hidden>
                              {active ? '●' : '○'}
                            </span>
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* 4. Swipe-Buttons am rechten Rand anzeigen */}
                    <div className="flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-2 px-1">
                      <span className="text-xs text-zinc-200 leading-snug">
                        Swipe-Buttons am Rand anzeigen
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={showSwipeHandles}
                        onClick={() => setHideSwipeHandles(showSwipeHandles)}
                        className={`shrink-0 rounded-md border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                          showSwipeHandles
                            ? 'border-[#00ff66]/50 bg-[#00ff66]/15 text-[#00ff66]'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {showSwipeHandles ? 'An' : 'Aus'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {sessionUser || isAdmin ? (
            <a
              href={profilePath}
              role="menuitem"
              className="block px-3 py-2 text-xs font-bold text-[#00ff66] no-underline hover:bg-zinc-800/80"
              onClick={openProfile}
            >
              🏆 Mein Cockpit
            </a>
          ) : null}

          <a
            href={watchlistPath}
            role="menuitem"
            className="block px-3 py-2 text-xs font-semibold text-[#00ff66] no-underline hover:bg-zinc-800/80"
            onClick={openWatchlist}
          >
            {t('watchlistTitle')}
          </a>

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
