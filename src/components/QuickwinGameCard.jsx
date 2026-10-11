import { useState } from 'react';
import WatchlistButton from './WatchlistButton';
import GuideOnlineBadge from './GuideOnlineBadge';
import TrophyGroupedChecklist from './TrophyGroupedChecklist';
import { CollectibleKacheln } from '../pages/CollectibleKacheln';
import { GuideVideoProvider } from '../context/GuideVideoContext';
import { useLocale } from '../context/LocaleContext';
import { GAME_FIELDS } from '../lib/gameSchema';
import { getGameCover, getGameTitle, getGameUuid } from '../lib/gameModel';
import { publicStudioCredits } from '../lib/studioCredits';
import { gameGuidePath } from '../lib/routeUtils';
import { fetchGameGuideBundle } from '../lib/guideQueries';
import { fetchGameTrophiesWithEarned } from '../lib/earnedTrophyQueries';
import { buildChronologicalGuideData } from '../lib/guideData';
import { getTrophyIdKey } from '../lib/trophyQueries';
import {
  loadUnlockedTrophies,
  mergeUnlockedTrophies,
  saveUnlockedTrophies,
} from '../lib/trophyProgressStorage';
import {
  claimCompletedGuideItems,
  collectGuideProgressIds,
  saveCompletedGuideItems,
} from '../lib/guideProgressStorage';
import {
  HIDDEN_TROPHY_MODE,
  hiddenTrophiesRevealed,
  loadHiddenTrophyMode,
  saveHiddenTrophyMode,
} from '../lib/hiddenTrophyPreference';
import { supabase } from '../pages/supabaseClient';

export function formatQuickwinCount(count, oneLabel, manyTemplate) {
  if (Number(count) === 1) return oneLabel;
  return String(manyTemplate ?? '').replace('{count}', String(count));
}

function QuickwinGameCard({
  game,
  groupNames = [],
  openGame,
  onRequestLogin,
  isAdmin = false,
  sessionUser = null,
}) {
  const { t, globalLocale } = useLocale();
  const gameUuid = getGameUuid(game);
  const title = getGameTitle(game, globalLocale);
  const cover = getGameCover(game, globalLocale);
  const credits = publicStudioCredits(game);
  const href = gameGuidePath(game, globalLocale);

  const [trophiesOpen, setTrophiesOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [trophies, setTrophies] = useState([]);
  const [earnedIds, setEarnedIds] = useState(() => new Set());
  const [unlocked, setUnlocked] = useState(() => loadUnlockedTrophies(gameUuid));
  const [guideRows, setGuideRows] = useState([]);
  const [completedItems, setCompletedItems] = useState({});
  const [hideCompleted, setHideCompleted] = useState(false);
  const [hiddenMode, setHiddenMode] = useState(() => loadHiddenTrophyMode(gameUuid));

  const ensureLoaded = async () => {
    if (loaded || loading || !gameUuid) return;
    setLoading(true);
    const [trophyResult, guideBundle] = await Promise.all([
      fetchGameTrophiesWithEarned(supabase, sessionUser?.id ?? null, game, globalLocale),
      fetchGameGuideBundle(supabase, game, globalLocale),
    ]);
    const nextTrophies = trophyResult.trophies ?? [];
    const nextEarned = trophyResult.earnedIds ?? new Set();
    const chapters = guideBundle.chapters ?? [];
    setTrophies(nextTrophies);
    setEarnedIds(nextEarned);
    setUnlocked(mergeUnlockedTrophies(gameUuid, nextEarned));
    setGuideRows(buildChronologicalGuideData(chapters));
    setCompletedItems(
      claimCompletedGuideItems(gameUuid, collectGuideProgressIds(chapters, guideBundle.guides, guideBundle.bosses)),
    );
    setLoaded(true);
    setLoading(false);
  };

  const toggleTrophy = (id) => {
    if (earnedIds.has(id)) return;
    setUnlocked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      saveUnlockedTrophies(gameUuid, next, earnedIds);
      return next;
    });
  };

  const toggleGuideItem = (id) => {
    setCompletedItems((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      saveCompletedGuideItems(gameUuid, next);
      return next;
    });
  };

  const openTrophies = () => {
    setTrophiesOpen((prev) => !prev);
    ensureLoaded();
  };

  const toggleGroup = (name) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    ensureLoaded();
  };

  const doneCount = trophies.filter((trophy) => {
    const key = getTrophyIdKey(trophy);
    return earnedIds.has(key) || unlocked[key];
  }).length;
  const progressPercent = trophies.length > 0 ? Math.round((doneCount / trophies.length) * 100) : 0;
  const hasHidden = trophies.some((trophy) => trophy.is_hidden);

  return (
    <article className="quickwin-card">
      <div className="quickwin-card-main">
        {cover ? (
          <img src={cover} className="quickwin-card-cover" alt="" />
        ) : (
          <div className="quickwin-card-cover quickwin-card-cover--empty" aria-hidden />
        )}

        <div className="quickwin-card-body">
          <div className="quickwin-card-title-row">
            <a
              href={href}
              className="quickwin-card-title"
              onClick={(event) => {
                event.preventDefault();
                openGame(game);
              }}
            >
              {title}
            </a>
            <div className="quickwin-card-actions">
              <GuideOnlineBadge game={game} visible={isAdmin} size="md" />
              <WatchlistButton gameId={gameUuid} onRequestLogin={onRequestLogin} size="md" />
            </div>
          </div>

          <div className="quickwin-card-meta">
            <div>
              <span>Plattform</span>
              <strong>{game[GAME_FIELDS.console] || '—'}</strong>
            </div>
            <div>
              <span>Jahr</span>
              <strong>{game[GAME_FIELDS.year] || '—'}</strong>
            </div>
            <div>
              <span>Genre</span>
              <strong>{game[GAME_FIELDS.genre] || '—'}</strong>
            </div>
            <div>
              <span>{t('studioLabel')}</span>
              <strong>{credits.studio || '—'}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="quickwin-card-folds">
        <button type="button" className="quickwin-card-fold" aria-expanded={trophiesOpen} onClick={openTrophies}>
          <span>{t('quickwinsTrophies')}</span>
          <span aria-hidden>{trophiesOpen ? '▲' : '▼'}</span>
        </button>
        {trophiesOpen && (
          <div className="quickwin-card-fold-body">
            {loading && !loaded ? (
              <p className="quickwin-card-note">{t('guideLoading')}</p>
            ) : (
              <>
                <div className="quickwin-progress">
                  <div className="quickwin-progress-label">
                    <span>{t('overallProgress')}</span>
                    <strong>
                      {progressPercent}% ({doneCount}/{trophies.length})
                    </strong>
                  </div>
                  <div className="quickwin-progress-track">
                    <div style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
                <label className="quickwin-hide-done">
                  <input
                    type="checkbox"
                    checked={hideCompleted}
                    onChange={(event) => setHideCompleted(event.target.checked)}
                  />
                  {t('hideCompleted')}
                </label>
                {hasHidden && (
                  <fieldset className="quickwin-hidden">
                    <legend>{t('hiddenTrophies')}</legend>
                    {[
                      [HIDDEN_TROPHY_MODE.SHOW, 'hiddenTrophiesShow'],
                      [HIDDEN_TROPHY_MODE.HIDE, 'hiddenTrophiesHide'],
                      [HIDDEN_TROPHY_MODE.ALWAYS, 'hiddenTrophiesAlways'],
                    ].map(([mode, labelKey]) => (
                      <label key={mode}>
                        <input
                          type="radio"
                          name={`hidden-trophy-${gameUuid}`}
                          value={mode}
                          checked={hiddenMode === mode}
                          onChange={() => {
                            saveHiddenTrophyMode(gameUuid, mode);
                            setHiddenMode(loadHiddenTrophyMode(gameUuid));
                          }}
                        />
                        {t(labelKey)}
                      </label>
                    ))}
                  </fieldset>
                )}
                <TrophyGroupedChecklist
                  gameId={gameUuid}
                  trophies={trophies}
                  unlockedTrophies={unlocked}
                  earnedTrophyIds={earnedIds}
                  hideCompleted={hideCompleted}
                  revealHidden={hiddenTrophiesRevealed(hiddenMode)}
                  onToggle={toggleTrophy}
                  mainGameTitle={title || 'Hauptspiel'}
                  flat
                />
              </>
            )}
          </div>
        )}

        {groupNames.map((name) => {
          const isOpen = openGroups.has(name);
          const rows = guideRows.filter((row) => String(row.chronological_group ?? '').trim() === name);
          return (
            <div key={name}>
              <button
                type="button"
                className="quickwin-card-fold"
                aria-expanded={isOpen}
                onClick={() => toggleGroup(name)}
              >
                <span>{name}</span>
                <span aria-hidden>{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
                <div className="quickwin-card-fold-body">
                  {loading && !loaded ? (
                    <p className="quickwin-card-note">{t('guideLoading')}</p>
                  ) : (
                    <GuideVideoProvider>
                      <CollectibleKacheln
                        gameId={gameUuid}
                        reportEntityType="guide_step"
                        collectiblesData={rows}
                        groupByField="chronological_group"
                        listTitle={name}
                        hideCompleted={hideCompleted}
                        setHideCompleted={setHideCompleted}
                        completedItems={completedItems}
                        toggleCompleted={toggleGuideItem}
                        embedInAccordion
                        hideGroupHeader
                      />
                    </GuideVideoProvider>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}

export default QuickwinGameCard;
