import { useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import { isAdminUser } from '../lib/adminAccess';
import { GAME_STRUCT, GAME_TYPE } from '../lib/gameSchema';
import { setIntranetGameType } from '../lib/intranetGameEdits';
import {
  canPublishLocale,
  isGuidePublished,
  PUBLISH_LOCALE,
  setGuidePublished,
} from '../lib/guidePublication';

const GAME_TYPES = Object.values(GAME_TYPE);

const LANG_LABEL = PUBLISH_LOCALE.toUpperCase();

/**
 * Redaktionelle Freigabe eines Guides – nur für Admins sichtbar.
 *
 * Geschrieben wird ausschliesslich status.guide_de. Der Button erscheint daher
 * nur, solange der deutsche Guide angezeigt wird: geprüft und freigegeben wird
 * dieselbe Sprache.
 */
function currentGameType(game) {
  return String(game?.[GAME_STRUCT.gameType] ?? '').trim();
}

function GuidePublishButton({
  user,
  game,
  gameUuid,
  guideLang,
  onPublishedChange,
  onGameTypeChange,
  className = '',
}) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const [hintTone, setHintTone] = useState('ok');
  const [typePrompt, setTypePrompt] = useState(false);

  if (!isAdminUser(user) || !gameUuid || !canPublishLocale(guideLang)) return null;

  const published = isGuidePublished(game, PUBLISH_LOCALE);
  const knownType = GAME_TYPES.includes(currentGameType(game));

  const publish = async (gameType) => {
    setHint('');
    setBusy(true);

    let savedType = null;
    if (gameType) {
      const saved = await setIntranetGameType(supabase, gameUuid, gameType);
      if (saved.error) {
        setBusy(false);
        setHintTone('error');
        setHint(saved.error.message || 'Spieltyp konnte nicht gespeichert werden.');
        return;
      }
      savedType = saved.gameType;
      onGameTypeChange?.(savedType);
    }

    const { status, slug, error } = await setGuidePublished(
      supabase,
      gameUuid,
      PUBLISH_LOCALE,
      !published,
    );
    setBusy(false);

    if (error) {
      setHintTone('error');
      setHint(
        error.message
          ? `Freigabe fehlgeschlagen: ${error.message}`
          : 'Freigabe fehlgeschlagen – vermutlich fehlt die Schreibrechte-Policy auf games.',
      );
      return;
    }

    setTypePrompt(false);
    onPublishedChange?.(status, { slug, gameType: savedType });
    setHintTone('ok');
    setHint(published ? `${LANG_LABEL} wieder offline.` : `${LANG_LABEL} ist online.`);
    window.setTimeout(() => setHint(''), 2600);
  };

  const handleClick = () => {
    if (!published && !knownType) {
      setTypePrompt(true);
      return;
    }
    publish(null);
  };

  const handleTypeChoice = (gameType) => {
    publish(gameType);
  };

  return (
    <div className={`inline-flex flex-col items-stretch sm:items-end gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title={
          published
            ? `Guide (${LANG_LABEL}) wieder auf FERTIG setzen – für Besucher unsichtbar`
            : `Guide (${LANG_LABEL}) freigeben – für alle Besucher sichtbar`
        }
        aria-pressed={published}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wider transition-all duration-200 disabled:opacity-50 ${
          published
            ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66] hover:bg-[#00ff66]/15'
            : 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15'
        }`}
      >
        <span aria-hidden className="text-base leading-none">
          {published ? '●' : '○'}
        </span>
        {busy ? 'Speichert…' : published ? `${LANG_LABEL} online` : `${LANG_LABEL} freigeben`}
      </button>
      {hint && (
        <span
          className={`text-[10px] font-mono text-left sm:text-right leading-snug ${
            hintTone === 'error' ? 'text-amber-400' : 'text-[#00ff66]'
          }`}
        >
          {hint}
        </span>
      )}
      {typePrompt && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-type-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-[#1a1b1c] p-5 shadow-2xl">
            <h2 id="publish-type-title" className="text-sm font-bold text-white">
              Spieltyp fehlt
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Vor der Freigabe Quickwin, Evergreen, Premium oder Standard wählen.
              Ohne Typ bleibt die Guide-Logik der Seite unklar.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {GAME_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={busy}
                  onClick={() => handleTypeChoice(type)}
                  className="rounded-xl border border-zinc-700 px-3 py-2.5 text-left text-xs font-mono font-bold uppercase tracking-wider text-zinc-200 hover:border-[#00ff66]/40 hover:text-[#00ff66] disabled:opacity-50"
                >
                  {type}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setTypePrompt(false)}
              className="mt-3 text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GuidePublishButton;
