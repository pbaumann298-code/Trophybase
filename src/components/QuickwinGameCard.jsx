import { useEffect, useMemo, useRef, useState } from 'react';
import WatchlistButton from './WatchlistButton';
import GuideOnlineBadge from './GuideOnlineBadge';
import GuideLanguageSelector from './GuideLanguageSelector';
import GameSeoInfobox from './GameSeoInfobox';
import GameGuideWorkspace from './GameGuideWorkspace';
import { useLocale } from '../context/LocaleContext';
import { GAME_FIELDS, GAME_STRUCT } from '../lib/gameSchema';
import { getGameViewPolicy } from '../lib/gameViewPolicy';
import {
  getGameCover,
  getGameDescription,
  getGameTitle,
  getGameUuid,
  getPlatformGameId,
} from '../lib/gameModel';
import { publicStudioCredits } from '../lib/studioCredits';
import { DeveloperSearchLink, HomeTagSearchLinks } from './SearchFacetLink';
import { gameGuidePath } from '../lib/routeUtils';
import { fetchGameGuideBundle, resolveGuideLanguage } from '../lib/guideQueries';
import { contentLocalesForGame } from '../lib/contentLocales';
import { fetchContentCreatorsForGame } from '../lib/contentCreators';
import {
  clearIntranetCover,
  markGameCoverValid,
  setIntranetIgdbCover,
} from '../lib/intranetGameEdits';
import { fetchGameTrophiesWithEarned } from '../lib/earnedTrophyQueries';
import {
  buildBossOverviewData,
  buildByTypeGuideData,
  buildChronologicalGuideData,
} from '../lib/guideData';
import {
  loadUnlockedTrophies,
  mergeUnlockedTrophies,
  saveUnlockedTrophies,
} from '../lib/trophyProgressStorage';
import { applyTrophyUnlockToggle, isPlatinumUnlocked } from '../lib/trophyTypes';
import { saveLocalPlatinumFlag, PROGRESS_SYNCED_EVENT } from '../lib/localUserProgress';
import { pushLocalGameProgressToCloud } from '../lib/progressCloudBridge';
import PlatinumUnlockedBadge from './PlatinumUnlockedBadge';
import {
  claimCompletedGuideItems,
  collectGuideProgressIds,
  readCompletedGuideItems,
  saveCompletedGuideItems,
} from '../lib/guideProgressStorage';
import { supabase } from '../pages/supabaseClient';
import { fetchGameByRouteRef, incrementGameViews } from '../lib/gameQueries';
import { fetchNewerVersions } from '../lib/newerVersions';

export function formatQuickwinCount(count, oneLabel, manyTemplate) {
  if (Number(count) === 1) return oneLabel;
  return String(manyTemplate ?? '').replace('{count}', String(count));
}

/**
 * Spielansicht, die erst beim Aufklappen eines Titels mountet und lädt.
 * Kopfzeile bleibt die kompakte Kachel; darunter die Guide-Reiter.
 */
function QuickwinGameCard({
  game,
  openGame,
  onRequestLogin,
  isAdmin = false,
  sessionUser = null,
  includeReady = false,
  serverNoticeText = '',
  /** false = nur komprimierte Guide-Ansicht, kein Sprung zur Vollseite */
  allowFullGameNav = true,
}) {
  const { t, globalLocale } = useLocale();
  const [detailGame, setDetailGame] = useState(game);
  const [langState, setLangState] = useState({ id: getGameUuid(game), override: null });
  const langGameId = getGameUuid(game);
  if (langState.id !== langGameId) {
    setLangState({ id: langGameId, override: null });
  }
  const guideLanguageOverride = langState.id === langGameId ? langState.override : null;
  const setGuideLanguageOverride = (override) => setLangState({ id: langGameId, override });
  const guideLang = resolveGuideLanguage(globalLocale, guideLanguageOverride);
  const policy = getGameViewPolicy(detailGame, { variant: 'inline', isAdmin });
  const showFullPageLink = policy.allowFullPageLink && allowFullGameNav;
  const gameUuid = getGameUuid(detailGame) || getGameUuid(game);
  const reportSource =
    getPlatformGameId(detailGame) ||
    getPlatformGameId(game) ||
    String(detailGame?.slug || game?.slug || '').trim() ||
    gameUuid;
  const title = getGameTitle(detailGame, globalLocale);
  const cover = getGameCover(detailGame, globalLocale);
  const credits = publicStudioCredits(detailGame);
  const href = gameGuidePath(detailGame, globalLocale);

  const [loading, setLoading] = useState(true);
  const [trophies, setTrophies] = useState([]);
  const [earnedIds, setEarnedIds] = useState(() => new Set());
  const [unlocked, setUnlocked] = useState(() => loadUnlockedTrophies(gameUuid));
  const [walkthrough, setWalkthrough] = useState([]);
  const [collectibles, setCollectibles] = useState([]);
  const [bosses, setBosses] = useState([]);
  const [creators, setCreators] = useState([]);
  const [completedItems, setCompletedItems] = useState({});
  const [hideCompleted, setHideCompleted] = useState(false);
  const [newer, setNewer] = useState({ mode: '', heading: '', games: [] });
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState('');
  const [igdbPrompt, setIgdbPrompt] = useState(false);
  const [igdbLink, setIgdbLink] = useState('');

  const handleClearCover = async () => {
    if (!gameUuid || coverBusy) return;
    if (!window.confirm('Cover wirklich löschen? Der IGDB-Status wird dabei mit entfernt.')) return;
    setCoverBusy(true);
    setCoverError('');
    const { status, error } = await clearIntranetCover(supabase, gameUuid);
    setCoverBusy(false);
    if (error) {
      setCoverError(error.message || 'Cover konnte nicht gelöscht werden.');
      return;
    }
    setDetailGame((prev) => ({
      ...prev,
      cover_url: {},
      cover_status: null,
      ...(status ? { status } : {}),
    }));
  };

  const handleSaveIgdbLink = async (event) => {
    event.preventDefault();
    if (!gameUuid || coverBusy) return;
    setCoverBusy(true);
    setCoverError('');
    const { coverUrl, coverMap, status, error } = await setIntranetIgdbCover(
      supabase,
      gameUuid,
      igdbLink,
    );
    setCoverBusy(false);
    if (error) {
      setCoverError(error.message || 'IGDB-Link konnte nicht gespeichert werden.');
      return;
    }
    setIgdbPrompt(false);
    setIgdbLink('');
    setDetailGame((prev) => ({
      ...prev,
      cover_url: coverMap || { ...(prev?.cover_url || {}), de: coverUrl, en: coverUrl },
      cover_status: 'valid',
      ...(status ? { status } : {}),
    }));
  };

  const handleVerifyCover = async () => {
    if (!gameUuid || coverBusy) return;
    setCoverBusy(true);
    setCoverError('');
    const { error } = await markGameCoverValid(supabase, gameUuid);
    setCoverBusy(false);
    if (error) {
      setCoverError(error.message || 'Cover-Status konnte nicht verifiziert werden.');
      return;
    }
    setDetailGame((prev) => ({ ...prev, cover_status: 'valid', cover_notes: null }));
  };

  useEffect(() => {
    setDetailGame(game);
  }, [game]);

  useEffect(() => {
    if (!gameUuid || isAdmin) return undefined;
    incrementGameViews(supabase, gameUuid, sessionUser);
    return undefined;
  }, [gameUuid, isAdmin, sessionUser]);

  const loadCursorRef = useRef({ gameUuid: '', lang: undefined });

  useEffect(() => {
    let cancelled = false;
    const prev = loadCursorRef.current;
    const quiet = prev.gameUuid === gameUuid && prev.lang !== guideLanguageOverride;
    loadCursorRef.current = { gameUuid, lang: guideLanguageOverride };
    if (!quiet) {
      setLoading(true);
      setNewer({ mode: '', heading: '', games: [] });
    }
    const uuid = getGameUuid(game);
    Promise.all([
      // Listenzeile ohne Cover/Genre → volle games-Zeile parallel nachladen
      uuid
        ? fetchGameByRouteRef(supabase, uuid, globalLocale)
        : Promise.resolve({ data: null }),
      // Hub-Typen: ohne eigene Sprachwahl fällt guide_tip auf de/en zurück.
      fetchGameTrophiesWithEarned(
        supabase,
        sessionUser?.id ?? null,
        game,
        globalLocale,
        guideLanguageOverride,
        { textFallback: policy.useTextFallback && guideLanguageOverride == null },
      ),
      fetchGameGuideBundle(supabase, game, globalLocale, guideLanguageOverride),
      quiet
        ? Promise.resolve(null)
        : fetchContentCreatorsForGame(supabase, game),
      !quiet && policy.showNewerVersionsTab
        ? fetchNewerVersions(supabase, game, globalLocale, { includeReady })
        : Promise.resolve(null),
    ]).then(([fullGameResult, trophyResult, guideBundle, creatorResult, newerResult]) => {
      if (cancelled) return;
      if (fullGameResult?.data) setDetailGame(fullGameResult.data);
      const nextTrophies = trophyResult.trophies ?? [];
      const nextEarned = trophyResult.earnedIds ?? new Set();
      const chapters = guideBundle.chapters ?? [];
      const guides = guideBundle.guides ?? [];
      const bossRows = guideBundle.bosses ?? [];
      setTrophies(nextTrophies);
      setEarnedIds(nextEarned);
      setUnlocked(mergeUnlockedTrophies(gameUuid, nextEarned));
      setWalkthrough(buildChronologicalGuideData(chapters));
      setCollectibles(buildByTypeGuideData(guides));
      setBosses(buildBossOverviewData(bossRows));
      if (!quiet) {
        setCreators(creatorResult?.data ?? []);
        setNewer(newerResult || { mode: '', heading: '', games: [] });
        setCompletedItems(
          claimCompletedGuideItems(gameUuid, collectGuideProgressIds(chapters, guides, bossRows)),
        );
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [game, gameUuid, globalLocale, guideLanguageOverride, sessionUser?.id, includeReady, policy.useTextFallback, policy.showNewerVersionsTab]);

  useEffect(() => {
    if (!gameUuid) return undefined;
    const onSynced = () => {
      setUnlocked(mergeUnlockedTrophies(gameUuid, earnedIds));
      setCompletedItems(readCompletedGuideItems(gameUuid));
    };
    window.addEventListener(PROGRESS_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(PROGRESS_SYNCED_EVENT, onSynced);
  }, [gameUuid, earnedIds]);

  const toggleTrophy = (id) => {
    if (earnedIds.has(id)) return;
    setUnlocked((prev) => {
      const next = applyTrophyUnlockToggle(prev, id, trophies, earnedIds);
      saveUnlockedTrophies(gameUuid, next, earnedIds);
      saveLocalPlatinumFlag(gameUuid, isPlatinumUnlocked(trophies, next, earnedIds));
      pushLocalGameProgressToCloud(gameUuid);
      return next;
    });
  };

  const toggleGuideItem = (idOrIds, forceState) => {
    setCompletedItems((prev) => {
      const next = { ...prev };
      const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
      for (const id of ids) {
        if (!id) continue;
        const targetState = typeof forceState === 'boolean' ? forceState : !prev[id];
        if (targetState) {
          next[id] = true;
        } else {
          delete next[id];
        }
      }
      saveCompletedGuideItems(gameUuid, next);
      pushLocalGameProgressToCloud(gameUuid);
      return next;
    });
  };

  const trophyById = useMemo(() => {
    const map = new Map();
    for (const trophy of trophies) {
      const key = String(trophy?.platform_achievement_id ?? trophy?.trophy_id ?? '').trim();
      if (key) map.set(key, trophy);
    }
    return map;
  }, [trophies]);

  const contentLocales = useMemo(
    () => contentLocalesForGame(detailGame, { includeReady: isAdmin }),
    [detailGame, isAdmin],
  );
  // Hub-Typen fallen ohne eigene Sprachwahl auf de/en zurück. Eine gewählte Guidesprache ist exakt.
  const description = getGameDescription(detailGame, guideLang, {
    exact: guideLanguageOverride != null || !policy.useTextFallback,
  });

  const platinumDone = isPlatinumUnlocked(trophies, unlocked, earnedIds);

  return (
    <div className="quickwin-detail">
      <article className="quickwin-card">
        <div className="quickwin-card-main">
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <div className="quickwin-card-cover-wrap relative">
              {cover ? (
                <img
                  src={cover}
                  onClick={
                    isAdmin
                      ? () => {
                          setCoverError('');
                          setIgdbPrompt(true);
                        }
                      : undefined
                  }
                  title={isAdmin ? 'Klicken, um Cover-Link zu ändern' : undefined}
                  className={`quickwin-card-cover ${isAdmin ? 'cursor-pointer transition hover:opacity-90' : ''}`}
                  alt=""
                />
              ) : (
                <div
                  onClick={
                    isAdmin
                      ? () => {
                          setCoverError('');
                          setIgdbPrompt(true);
                        }
                      : undefined
                  }
                  className={`quickwin-card-cover quickwin-card-cover--empty ${isAdmin ? 'cursor-pointer' : ''}`}
                  aria-hidden
                />
              )}
              <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
                <GuideOnlineBadge game={detailGame} visible={isAdmin} size="sm" />
              </div>
              <PlatinumUnlockedBadge active={platinumDone} size="sm" />
              {isAdmin && detailGame?.cover_status !== 'valid' ? (
                <div className="tb-admin-bar tb-admin-bar--col absolute top-1.5 right-1.5 z-10 max-w-[calc(100%-0.75rem)] items-end">
                  <button
                    type="button"
                    onClick={handleClearCover}
                    disabled={coverBusy || !cover}
                    title="Falsches Cover löschen und status.igdb entfernen"
                    className="rounded border border-red-500/40 bg-black/80 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/20 disabled:opacity-40 cursor-pointer"
                  >
                    {coverBusy ? '…' : 'Cover löschen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCoverError('');
                      setIgdbPrompt(true);
                    }}
                    disabled={coverBusy}
                    title="Neuen IGDB-Bildlink als Cover hinterlegen"
                    className="rounded border border-[#00ff66]/40 bg-black/80 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider text-[#00ff66] hover:bg-[#00ff66]/15 disabled:opacity-50 cursor-pointer"
                  >
                    IGDB Link
                  </button>
                </div>
              ) : null}
            </div>
            {isAdmin && detailGame?.cover_status !== 'valid' ? (
              <button
                type="button"
                onClick={handleVerifyCover}
                disabled={coverBusy}
                title="Klick darauf verifiziert das Cover (setzt cover_status = 'valid')"
                className={`rounded-md border px-2 py-1 text-center font-mono text-[10px] font-bold transition cursor-pointer disabled:opacity-50 ${
                  detailGame?.cover_status === 'invalid'
                    ? 'border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:border-[#00ff66]/50 hover:bg-[#00ff66]/15 hover:text-[#00ff66]'
                }`}
              >
                {`cover_status: ${detailGame?.cover_status === 'invalid' ? 'invalid' : 'ungeprüft'}`}
              </button>
            ) : null}
            {coverError && !igdbPrompt ? (
              <p className="max-w-[9rem] rounded bg-black/80 px-1.5 py-1 text-[9px] font-mono text-red-300">
                {coverError}
              </p>
            ) : null}
          </div>
          <div className="quickwin-card-body">
            <div className="quickwin-card-title-row">
              {showFullPageLink ? (
                <a
                  href={href}
                  className="quickwin-card-title"
                  onClick={(event) => {
                    event.preventDefault();
                    openGame?.(detailGame);
                  }}
                >
                  {title}
                  {isAdmin ? (
                    <span className="quickwin-type">
                      {String(detailGame.spiel_typ ?? '').trim() || '—'}
                    </span>
                  ) : null}
                </a>
              ) : (
                <p className="quickwin-card-title">
                  {title}
                  {isAdmin ? (
                    <span className="quickwin-type">
                      {String(detailGame.spiel_typ ?? '').trim() || '—'}
                    </span>
                  ) : null}
                </p>
              )}
              <div className="quickwin-card-actions">
                <GuideOnlineBadge game={detailGame} visible={isAdmin} size="md" />
                <WatchlistButton gameId={gameUuid} onRequestLogin={onRequestLogin} size="md" />
              </div>
            </div>
            <div className="quickwin-card-meta">
              <div>
                <span>{t('searchConsole')}</span>
                <strong>{detailGame[GAME_FIELDS.console] || '—'}</strong>
              </div>
              <div>
                <span>{t('yearLabel')}</span>
                <strong>{detailGame[GAME_FIELDS.year] || '—'}</strong>
              </div>
              <div>
                <span>{t('searchGenre')}</span>
                <strong className="quickwin-card-meta-links">
                  <HomeTagSearchLinks
                    tags={detailGame[GAME_STRUCT.homeTags]}
                    locale={globalLocale}
                    fallback={detailGame[GAME_FIELDS.genre] || '—'}
                  />
                </strong>
              </div>
              <div>
                <span>{t('studioLabel')}</span>
                <strong className="quickwin-card-meta-links">
                  {credits.studio ? <DeveloperSearchLink name={credits.studio} /> : '—'}
                </strong>
              </div>
            </div>
            {description ? (
              <div className="mt-4 space-y-2 text-sm leading-relaxed text-zinc-300">
                {description
                  .split(/\n{2,}/)
                  .map((paragraph) => paragraph.trim())
                  .filter(Boolean)
                  .map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      </article>

      <GameSeoInfobox
        title={title}
        description={description}
        creators={creators}
        showDescription={false}
        className="mb-4"
      />

      <div className="mb-4">
        <GuideLanguageSelector
          className="!mb-0 min-w-0 w-full"
          guideLanguageOverride={guideLanguageOverride}
          onGuideLanguageOverride={setGuideLanguageOverride}
          locales={contentLocales}
        />
      </div>

      <GameGuideWorkspace
        variant="inline"
        policy={policy}
        game={detailGame}
        gameUuid={gameUuid}
        reportSource={reportSource}
        locale={guideLang}
        isAdmin={isAdmin}
        trophies={trophies}
        onReplaceTrophies={setTrophies}
        unlockedTrophies={unlocked}
        earnedTrophyIds={earnedIds}
        onToggleTrophy={toggleTrophy}
        hideCompleted={hideCompleted}
        setHideCompleted={setHideCompleted}
        completedItems={completedItems}
        toggleCompleted={toggleGuideItem}
        walkthrough={walkthrough}
        collectibles={collectibles}
        bosses={bosses}
        trophyById={trophyById}
        loading={loading}
        mainGameTitle={title}
        newer={newer}
        openGame={openGame}
        serverNoticeText={serverNoticeText}
      />

      {isAdmin && igdbPrompt ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!coverBusy) setIgdbPrompt(false);
          }}
        >
          <form
            onSubmit={handleSaveIgdbLink}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#1a1b1c] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-bold text-white">Neuer IGDB-Link</h2>
              <a
                href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${title} ${detailGame?.[GAME_FIELDS.console] || ''} cover igdb`.trim())}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-sky-300 hover:bg-sky-500/20 no-underline"
              >
                🔍 Bild suchen
              </a>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Bildlink von images.igdb.com einfügen. Der ersetzt das Cover und hält den IGDB-Status auf erledigt.
            </p>
            <input
              type="text"
              inputMode="url"
              value={igdbLink}
              onChange={(event) => setIgdbLink(event.target.value)}
              placeholder="https://images.igdb.com/igdb/image/upload/…"
              autoFocus
              className="mt-3 w-full rounded-xl border border-zinc-700 bg-[#121314] px-3 py-2 text-sm text-zinc-200 focus:border-[#00ff66]/40 focus:outline-hidden"
            />
            {coverError ? (
              <p className="mt-2 font-mono text-[11px] text-red-300">{coverError}</p>
            ) : null}
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={coverBusy}
                onClick={() => setIgdbPrompt(false)}
                className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={coverBusy || !igdbLink.trim()}
                className="rounded-xl bg-[#00ff66] px-3.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#121314] disabled:opacity-50 cursor-pointer"
              >
                {coverBusy ? 'Speichere…' : 'Cover speichern'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default QuickwinGameCard;
