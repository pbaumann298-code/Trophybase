import { useEffect, useMemo, useRef, useState } from 'react';
import CollapsibleSectionCard from './CollapsibleSectionCard';
import Reportable from './Reportable';
import TrophyArtwork from './TrophyArtwork';
import TrophyTypeIcon from './TrophyTypeIcon';
import YouTubeEmbed from './YouTubeEmbed';
import { useGuideVideo } from '../context/GuideVideoContext';
import { useLocale } from '../context/LocaleContext';
import { reportableDataAttrs } from '../lib/reportableAttrs';
import { groupTrophiesByPack, countUnlockedInList } from '../lib/trophyGroups';
import { getTrophyAiTranslation, getTrophyDescription, getTrophyIdKey } from '../lib/trophyQueries';
import { getYouTubeEmbedUrl } from '../utils/videoUrl';

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
          if (!window.confirm(t('trophyTipDeleteConfirm'))) return;
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

function TrophyKindMenu({ trophy, onChange }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const toggle = async (key) => {
    if (busy) return;
    setBusy(true);
    setError('');
    const next = !trophy[key];
    const saveError = await onChange({ [key]: next });
    setBusy(false);
    if (saveError) setError(saveError.message || 'Konnte nicht gespeichert werden.');
  };

  return (
    <div ref={rootRef} className="relative mt-2">
      <button
        type="button"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
        className="rounded-md border border-zinc-700 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
      >
        {busy ? '…' : 'Trophäen-Art'}
      </button>
      {open ? (
        <div className="absolute left-0 z-30 mt-1 w-56 rounded-xl border border-zinc-700 bg-[#1a1b1c] p-3">
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <input type="checkbox" checked={Boolean(trophy.is_hidden)} disabled className="h-3.5 w-3.5" />
            Versteckt
            <span className="font-mono text-[9px] uppercase tracking-wider">Sony</span>
          </label>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-sky-300">
            <input
              type="checkbox"
              checked={Boolean(trophy.is_online)}
              disabled={busy}
              onChange={() => toggle('is_online')}
              className="h-3.5 w-3.5 rounded-sm border-zinc-600 bg-[#121314] text-[#00ff66] focus:ring-0"
            />
            Online
          </label>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-rose-300">
            <input
              type="checkbox"
              checked={Boolean(trophy.is_missable)}
              disabled={busy}
              onChange={() => toggle('is_missable')}
              className="h-3.5 w-3.5 rounded-sm border-zinc-600 bg-[#121314] text-[#00ff66] focus:ring-0"
            />
            Verpassbar
          </label>
          {error ? <p className="mt-2 text-[10px] text-red-400">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function TrophyRow({ trophy, gameId, isUnlocked, isEarned, conceal, onToggle, guideTipEditor, onTrophyFlags }) {
  const { t } = useLocale();
  const { notifyVideoStarted, notifyVideoCleared } = useGuideVideo();
  const [videoOpen, setVideoOpen] = useState(false);
  const trophyKey = getTrophyIdKey(trophy);
  const trophyDesc = getTrophyDescription(trophy);
  const trophyTranslation = getTrophyAiTranslation(trophy);
  const embedUrl = useMemo(
    () => (trophy.video_url ? getYouTubeEmbedUrl(trophy.video_url, null, { autoplay: true }) : null),
    [trophy.video_url],
  );

  useEffect(() => {
    if (!videoOpen) {
      notifyVideoCleared();
      return undefined;
    }
    notifyVideoStarted();
    return () => notifyVideoCleared();
  }, [videoOpen, notifyVideoStarted, notifyVideoCleared]);

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
          {onTrophyFlags && !conceal ? (
            <TrophyKindMenu trophy={trophy} onChange={(patch) => onTrophyFlags(trophy, patch)} />
          ) : null}
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
          {trophy.video_url && embedUrl ? (
            <>
              <button
                type="button"
                {...reportableDataAttrs({
                  source: gameId,
                  type: 'trophy',
                  reportKey: trophyKey,
                  field: 'video_url',
                })}
                onClick={() => setVideoOpen((open) => !open)}
                aria-expanded={videoOpen}
                className="text-[11px] text-[#00ff66] hover:underline flex items-center gap-1 font-mono font-bold bg-transparent border-none p-0 cursor-pointer text-left"
              >
                {videoOpen ? '▲ Video ausblenden' : '🎬 Video-Guide ansehen'}
              </button>
              {videoOpen ? (
                <div className="trophy-inline-video mt-1 w-full min-w-0 overflow-hidden rounded-lg border border-zinc-800">
                  <YouTubeEmbed
                    key={`${trophyKey}-${embedUrl}`}
                    src={embedUrl}
                    title={trophy.trophy_name || 'YouTube-Video'}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function TrophyList({ gameId, trophies, unlockedTrophies, earnedTrophyIds, hideCompleted, revealHidden, onToggle, guideTipEditor, onTrophyFlags }) {
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
            onTrophyFlags={onTrophyFlags}
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
  onTrophyFlags = null,
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
            onTrophyFlags={onTrophyFlags}
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
                onTrophyFlags={onTrophyFlags}
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
            onTrophyFlags={onTrophyFlags}
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
              onTrophyFlags={onTrophyFlags}
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
