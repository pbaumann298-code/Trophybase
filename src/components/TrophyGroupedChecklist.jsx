import { useMemo } from 'react';
import CollapsibleSectionCard from './CollapsibleSectionCard';
import Reportable from './Reportable';
import TrophyArtwork from './TrophyArtwork';
import TrophyTypeIcon from './TrophyTypeIcon';
import { groupTrophiesByPack, countUnlockedInList } from '../lib/trophyGroups';
import { getTrophyDescription, getTrophyIdKey } from '../lib/trophyQueries';

function TrophyRow({ trophy, gameId, isUnlocked, isEarned, isOnlineTrophy, onToggle }) {
  const trophyKey = getTrophyIdKey(trophy);
  const trophyDesc = getTrophyDescription(trophy);

  return (
    <div
      className={`flex flex-col gap-3 p-4 rounded-xl border transition-all duration-300 ${
        isUnlocked
          ? 'bg-[#121314]/40 border-zinc-800/40 opacity-60'
          : 'bg-[#121314] border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start gap-4">
        <input
          type="checkbox"
          checked={isUnlocked}
          disabled={isEarned}
          onChange={() => !isEarned && onToggle(trophyKey)}
          title={isEarned ? 'Von PSN synchronisiert' : undefined}
          className={`rounded-sm border-zinc-700 bg-[#1a1b1c] text-[#00ff66] focus:ring-0 w-4 h-4 mt-1 flex-shrink-0 ${
            isEarned ? 'cursor-default opacity-70' : 'cursor-pointer'
          }`}
        />
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 flex-shrink-0">
          <TrophyArtwork
            trophy={trophy}
            gameId={gameId}
            reportKey={trophyKey}
            size={48}
            reportable
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Reportable
              as="p"
              source={gameId}
              type="trophy"
              reportKey={trophyKey}
              field="name"
              className={`text-sm font-bold ${
                isUnlocked ? 'text-zinc-500 line-through' : 'text-zinc-200'
              }`}
            >
              {trophy.trophy_name}
            </Reportable>
            {trophy.is_hidden && (
              <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded-sm font-mono uppercase">
                Versteckt
              </span>
            )}
            {isEarned && (
              <span className="text-[9px] bg-[#00ff66]/10 text-[#00ff66] border border-[#00ff66]/20 px-1.5 py-0.5 rounded-sm font-mono uppercase">
                PSN
              </span>
            )}
            {isOnlineTrophy && (
              <span className="text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/25 px-1.5 py-0.5 rounded-sm font-mono uppercase">
                Online Trophäe
              </span>
            )}
          </div>
          {trophyDesc && (
            <Reportable
              as="p"
              source={gameId}
              type="trophy"
              reportKey={trophyKey}
              field="description"
              className={`text-xs mt-1 leading-relaxed ${
                isUnlocked ? 'text-zinc-600' : 'text-zinc-400'
              }`}
            >
              {trophyDesc}
            </Reportable>
          )}
          <span className="inline-flex items-center mt-2">
            <TrophyTypeIcon type={trophy.trophy_type} size={22} />
          </span>
        </div>
      </div>
      {!isUnlocked && (trophy.guide_tip || trophy.video_url) && (
        <div className="mt-1 pl-4 border-l-2 border-[#00ff66]/30 flex flex-col gap-2 bg-zinc-950/40 p-2 rounded-r-xl">
          {trophy.guide_tip && (
            <p className="text-xs text-zinc-400 font-sans italic">
              <span className="text-[#00ff66] font-mono font-bold not-italic mr-1">Tipp:</span>
              <Reportable
                as="span"
                source={gameId}
                type="trophy"
                reportKey={trophyKey}
                field="guide_tip"
              >
                {trophy.guide_tip}
              </Reportable>
            </p>
          )}
          {trophy.video_url && (
            <Reportable
              as="a"
              source={gameId}
              type="trophy"
              reportKey={trophyKey}
              field="video_url"
              href={trophy.video_url}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[#00ff66] hover:underline flex items-center gap-1 font-mono font-bold"
            >
              🎬 Video-Guide auf YouTube ansehen
            </Reportable>
          )}
        </div>
      )}
    </div>
  );
}

function TrophyList({ gameId, trophies, unlockedTrophies, earnedTrophyIds, onlineTrophyIds, hideCompleted, onToggle }) {
  const earnedSet = earnedTrophyIds ?? new Set();
  const visible = trophies.filter((t) => {
    const key = getTrophyIdKey(t);
    const done = earnedSet.has(key) || unlockedTrophies[key];
    return !hideCompleted || !done;
  });

  if (visible.length === 0) {
    return (
      <p className="text-xs text-zinc-500 italic text-center py-4">
        Keine Trophäen in diesem Abschnitt (oder alle erledigt ausgeblendet).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((t, idx) => {
        const key = getTrophyIdKey(t) || idx;
        const isEarned = earnedTrophyIds?.has?.(key) ?? false;
        return (
          <TrophyRow
            key={key}
            gameId={gameId}
            trophy={t}
            isUnlocked={isEarned || !!unlockedTrophies[key]}
            isEarned={isEarned}
            isOnlineTrophy={onlineTrophyIds.has(getTrophyIdKey(t))}
            onToggle={onToggle}
          />
        );
      })}
    </div>
  );
}

function TrophyGroupedChecklist({
  gameId,
  trophies,
  unlockedTrophies,
  earnedTrophyIds,
  onlineTrophyIds,
  hideCompleted,
  onToggle,
  mainGameTitle = 'Hauptspiel',
}) {
  const { mainGame, dlcGroups } = useMemo(
    () => groupTrophiesByPack(trophies),
    [trophies],
  );

  const earnedSet = earnedTrophyIds ?? new Set();

  const mainProgress = useMemo(
    () => countUnlockedInList(mainGame, unlockedTrophies, getTrophyIdKey, earnedSet),
    [mainGame, unlockedTrophies, earnedSet],
  );

  if (trophies.length === 0) {
    return (
      <p className="text-xs text-zinc-500 italic text-center py-6">
        Keine Trophäen für dieses Spiel in der Datenbank.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {mainGame.length > 0 && (
        <CollapsibleSectionCard
          sectionId="trophies-main"
          title={mainGameTitle}
          badge={`${mainProgress}/${mainGame.length} freigeschaltet`}
          defaultOpen
          accent="green"
        >
          <TrophyList
            gameId={gameId}
            trophies={mainGame}
            unlockedTrophies={unlockedTrophies}
            earnedTrophyIds={earnedSet}
            onlineTrophyIds={onlineTrophyIds}
            hideCompleted={hideCompleted}
            onToggle={onToggle}
          />
        </CollapsibleSectionCard>
      )}

      {dlcGroups.map((dlc) => {
        const dlcProgress = countUnlockedInList(
          dlc.trophies,
          unlockedTrophies,
          getTrophyIdKey,
          earnedSet,
        );
        return (
          <CollapsibleSectionCard
            key={dlc.gruppe}
            sectionId={`trophies-dlc-${dlc.gruppe}`}
            title={dlc.title}
            badge={`${dlcProgress}/${dlc.trophies.length} · ${dlc.trophies.length} Trophäen`}
            defaultOpen={false}
            accent="purple"
          >
            <TrophyList
              gameId={gameId}
              trophies={dlc.trophies}
              unlockedTrophies={unlockedTrophies}
              earnedTrophyIds={earnedSet}
              onlineTrophyIds={onlineTrophyIds}
              hideCompleted={hideCompleted}
              onToggle={onToggle}
            />
          </CollapsibleSectionCard>
        );
      })}

      {mainGame.length === 0 && dlcGroups.length === 0 && (
        <p className="text-xs text-zinc-500 italic text-center py-6">
          Keine gruppierten Trophäen gefunden.
        </p>
      )}
    </div>
  );
}

export default TrophyGroupedChecklist;
