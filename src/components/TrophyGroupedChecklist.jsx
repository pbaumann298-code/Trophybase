import React, { useMemo } from 'react';
import CollapsibleSectionCard from './CollapsibleSectionCard';
import { groupTrophiesByPack, countUnlockedInList } from '../lib/trophyGroups';
import { getTrophyDescription, getTrophyIdKey } from '../lib/trophyQueries';

function TrophyRow({ trophy, isUnlocked, isOnlineTrophy, onToggle }) {
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
          onChange={() => onToggle(trophyKey)}
          className="rounded border-zinc-700 bg-[#1a1b1c] text-[#00ff66] focus:ring-0 w-4 h-4 cursor-pointer mt-1 flex-shrink-0"
        />
        {trophy.icon_url && (
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 flex-shrink-0">
            <img src={trophy.icon_url} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={`text-sm font-bold ${
                isUnlocked ? 'text-zinc-500 line-through' : 'text-zinc-200'
              }`}
            >
              {trophy.trophy_name}
            </p>
            {trophy.ist_versteckt && (
              <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono uppercase">
                Versteckt
              </span>
            )}
            {isOnlineTrophy && (
              <span className="text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/25 px-1.5 py-0.5 rounded font-mono uppercase">
                Online Trophäe
              </span>
            )}
          </div>
          {trophyDesc && (
            <p
              className={`text-xs mt-1 leading-relaxed ${
                isUnlocked ? 'text-zinc-600' : 'text-zinc-400'
              }`}
            >
              {trophyDesc}
            </p>
          )}
          <span className="inline-block text-[10px] text-zinc-500 font-mono uppercase mt-2 bg-zinc-800/50 px-2 py-0.5 rounded border border-zinc-800">
            {trophy.trophy_type || 'Bronze'}
          </span>
        </div>
      </div>
      {!isUnlocked && (trophy.guide_tip || trophy.video_url) && (
        <div className="mt-1 pl-4 border-l-2 border-[#00ff66]/30 flex flex-col gap-2 bg-zinc-950/40 p-2 rounded-r-xl">
          {trophy.guide_tip && (
            <p className="text-xs text-zinc-400 font-sans italic">
              <span className="text-[#00ff66] font-mono font-bold not-italic mr-1">Tipp:</span>
              {trophy.guide_tip}
            </p>
          )}
          {trophy.video_url && (
            <a
              href={trophy.video_url}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[#00ff66] hover:underline flex items-center gap-1 font-mono font-bold"
            >
              🎬 Video-Guide auf YouTube ansehen
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function TrophyList({ trophies, unlockedTrophies, onlineTrophyIds, hideCompleted, onToggle }) {
  const visible = trophies.filter(
    (t) => !hideCompleted || !unlockedTrophies[getTrophyIdKey(t)],
  );

  if (visible.length === 0) {
    return (
      <p className="text-xs text-zinc-500 italic text-center py-4">
        Keine Trophäen in diesem Abschnitt (oder alle erledigt ausgeblendet).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-1">
      {visible.map((t, idx) => {
        const key = getTrophyIdKey(t) || idx;
        return (
          <TrophyRow
            key={key}
            trophy={t}
            isUnlocked={!!unlockedTrophies[key]}
            isOnlineTrophy={onlineTrophyIds.has(getTrophyIdKey(t))}
            onToggle={onToggle}
          />
        );
      })}
    </div>
  );
}

function TrophyGroupedChecklist({
  trophies,
  unlockedTrophies,
  onlineTrophyIds,
  hideCompleted,
  onToggle,
  mainGameTitle = 'Hauptspiel',
}) {
  const { mainGame, dlcGroups } = useMemo(
    () => groupTrophiesByPack(trophies),
    [trophies],
  );

  const mainProgress = useMemo(
    () => countUnlockedInList(mainGame, unlockedTrophies, getTrophyIdKey),
    [mainGame, unlockedTrophies],
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
          subtitle="Hauptspiel-Trophäen"
          badge={`${mainProgress}/${mainGame.length} freigeschaltet`}
          defaultOpen
          accent="green"
        >
          <TrophyList
            trophies={mainGame}
            unlockedTrophies={unlockedTrophies}
            onlineTrophyIds={onlineTrophyIds}
            hideCompleted={hideCompleted}
            onToggle={onToggle}
          />
        </CollapsibleSectionCard>
      )}

      {dlcGroups.map((dlc) => {
        const dlcProgress = countUnlockedInList(dlc.trophies, unlockedTrophies, getTrophyIdKey);
        return (
          <CollapsibleSectionCard
            key={dlc.gruppe}
            sectionId={`trophies-dlc-${dlc.gruppe}`}
            title={dlc.title}
            subtitle={`DLC · Gruppe ${dlc.gruppe}`}
            badge={`${dlcProgress}/${dlc.trophies.length} · ${dlc.trophies.length} Trophäen`}
            defaultOpen={false}
            accent="purple"
          >
            <TrophyList
              trophies={dlc.trophies}
              unlockedTrophies={unlockedTrophies}
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
