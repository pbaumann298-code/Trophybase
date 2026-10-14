import { useEffect, useMemo, useState } from 'react';
import CollapsibleSectionCard from './CollapsibleSectionCard';
import Reportable from './Reportable';
import TrophyArtwork from './TrophyArtwork';
import TrophyTypeIcon from './TrophyTypeIcon';
import { useLocale } from '../context/LocaleContext';
import { groupTrophiesByPack, countUnlockedInList } from '../lib/trophyGroups';
import { getTrophyAiTranslation, getTrophyDescription, getTrophyIdKey } from '../lib/trophyQueries';

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"
      />
    </svg>
  );
}

function TrophyTipEditor({ trophy, onSave }) {
  const { t } = useLocale();
  const saved = String(trophy.guide_tip ?? '');
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const commit = async (text) => {
    if (text.trim() === saved.trim() || busy) return;
    setBusy(true);
    setHint('');
    const error = await onSave(text);
    setBusy(false);
    setHint(error ? t('trophyTipFailed') : t('trophyTipSaved'));
  };

  return (
    <div className="mt-2 flex items-start gap-2">
      <label className="min-w-0 flex-1">
        <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-wider text-[#00ff66]">
          {t('trophyTipLabel')}
        </span>
        <textarea
          value={draft}
          rows={2}
          placeholder={t('trophyTipPlaceholder')}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          className="w-full resize-y rounded-lg border border-zinc-700 bg-[#121314] px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-[#00ff66]/40 focus:outline-hidden"
        />
        {hint ? <span className="mt-1 block text-[10px] text-zinc-500">{hint}</span> : null}
      </label>
      <button
        type="button"
        title={t('trophyTipDelete')}
        aria-label={t('trophyTipDelete')}
        disabled={busy || !draft.trim()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setDraft('');
          commit('');
        }}
        className="mt-5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:border-red-500/40 hover:text-red-300 disabled:opacity-30"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function TrophyRow({ trophy, gameId, isUnlocked, isEarned, conceal, onToggle, guideTipEditor }) {
  const { t } = useLocale();
  const trophyKey = getTrophyIdKey(trophy);
  const trophyDesc = getTrophyDescription(trophy);
  const trophyTranslation = getTrophyAiTranslation(trophy);

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
          {conceal ? (
            <div className="flex h-full w-full items-center justify-center text-lg text-zinc-600" aria-hidden="true">
              ?
            </div>
          ) : (
            <TrophyArtwork
              trophy={trophy}
              gameId={gameId}
              reportKey={trophyKey}
              size={48}
              reportable
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {conceal ? (
              <p className="text-sm font-bold text-zinc-500">{t('hiddenTrophyName')}</p>
            ) : (
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
            )}
            {trophy.is_hidden && (
              <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded-sm font-mono uppercase">
                Versteckt
              </span>
            )}
            {!conceal && trophy.is_missable && (
              <span className="text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/25 px-1.5 py-0.5 rounded-sm font-mono uppercase">
                Verpassbar
              </span>
            )}
            {isEarned && (
              <span className="text-[9px] bg-[#00ff66]/10 text-[#00ff66] border border-[#00ff66]/20 px-1.5 py-0.5 rounded-sm font-mono uppercase">
                PSN
              </span>
            )}
            {!conceal && trophy.is_online && (
              <span className="text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/25 px-1.5 py-0.5 rounded-sm font-mono uppercase">
                Online Trophäe
              </span>
            )}
          </div>
          {!conceal && (trophyDesc || trophyTranslation) && (
            <div className="mt-1">
              {trophyDesc && (
                <Reportable
                  as="p"
                  source={gameId}
                  type="trophy"
                  reportKey={trophyKey}
                  field="description"
                  className={`text-xs leading-relaxed ${
                    isUnlocked ? 'text-zinc-600' : 'text-zinc-400'
                  }`}
                >
                  {trophyDesc}
                </Reportable>
              )}
              {trophyTranslation && (
                <Reportable
                  as="p"
                  source={gameId}
                  type="trophy"
                  reportKey={trophyKey}
                  field="ai_translation"
                  className={`text-xs leading-relaxed italic ${
                    trophyDesc ? 'mt-1' : ''
                  } ${isUnlocked ? 'text-zinc-600' : 'text-zinc-500'}`}
                >
                  {trophyTranslation}
                </Reportable>
              )}
            </div>
          )}
          <span className="inline-flex items-center mt-2">
            <TrophyTypeIcon type={trophy.trophy_type} size={22} />
          </span>
        </div>
      </div>
      {guideTipEditor ? (
        <TrophyTipEditor
          trophy={trophy}
          onSave={(text) => guideTipEditor(getTrophyIdKey(trophy), text)}
        />
      ) : null}
      {!guideTipEditor && !conceal && !isUnlocked && (trophy.guide_tip || trophy.video_url) && (
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

function TrophyList({ gameId, trophies, unlockedTrophies, earnedTrophyIds, hideCompleted, revealHidden, onToggle, guideTipEditor }) {
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
        const isUnlocked = isEarned || !!unlockedTrophies[key];
        return (
          <TrophyRow
            key={key}
            gameId={gameId}
            trophy={t}
            isUnlocked={isUnlocked}
            isEarned={isEarned}
            conceal={Boolean(t.is_hidden) && !revealHidden && !isUnlocked}
            onToggle={onToggle}
            guideTipEditor={guideTipEditor}
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
  hideCompleted,
  revealHidden = false,
  onToggle,
  mainGameTitle = 'Hauptspiel',
  /** Kein zusätzlicher Karten-Reiter, wenn die Liste schon in einer Zeile steckt. */
  flat = false,
  guideTipEditor = null,
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

  if (flat) {
    return (
      <div className="flex flex-col gap-4">
        {mainGame.length > 0 && (
          <TrophyList
            gameId={gameId}
            trophies={mainGame}
            unlockedTrophies={unlockedTrophies}
            earnedTrophyIds={earnedSet}
            hideCompleted={hideCompleted}
            revealHidden={revealHidden}
            onToggle={onToggle}
            guideTipEditor={guideTipEditor}
          />
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
                hideCompleted={hideCompleted}
                revealHidden={revealHidden}
                onToggle={onToggle}
                guideTipEditor={guideTipEditor}
              />
            </CollapsibleSectionCard>
          );
        })}
      </div>
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
            hideCompleted={hideCompleted}
            revealHidden={revealHidden}
            onToggle={onToggle}
            guideTipEditor={guideTipEditor}
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
              hideCompleted={hideCompleted}
              revealHidden={revealHidden}
              onToggle={onToggle}
              guideTipEditor={guideTipEditor}
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

export function ClearGuideTipsButton({ onClear, locale = '', className = '' }) {
  const { t } = useLocale();
  const lang = String(locale ?? '').trim().toUpperCase();
  return (
    <button
      type="button"
      onClick={() => {
        const message = t('trophyTipsDeleteAllConfirm').replaceAll('{lang}', lang);
        if (window.confirm(message)) onClear();
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 hover:border-red-500/40 hover:text-red-300 ${className}`}
    >
      <TrashIcon />
      {t('trophyTipsDeleteAll').replaceAll('{lang}', lang)}
    </button>
  );
}

export default TrophyGroupedChecklist;
