import { useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import { isAdminUser } from '../lib/adminAccess';
import {
  canPublishLocale,
  isGuidePublished,
  PUBLISH_LOCALE,
  setGuidePublished,
} from '../lib/guidePublication';

const LANG_LABEL = PUBLISH_LOCALE.toUpperCase();

/**
 * Redaktionelle Freigabe eines Guides – nur für Admins sichtbar.
 *
 * Geschrieben wird ausschliesslich status.guide_de. Der Button erscheint daher
 * nur, solange der deutsche Guide angezeigt wird: geprüft und freigegeben wird
 * dieselbe Sprache.
 */
function GuidePublishButton({ user, game, gameUuid, guideLang, onPublishedChange, className = '' }) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const [hintTone, setHintTone] = useState('ok');

  if (!isAdminUser(user) || !gameUuid || !canPublishLocale(guideLang)) return null;

  const published = isGuidePublished(game, PUBLISH_LOCALE);

  const handleClick = async () => {
    setHint('');
    setBusy(true);
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

    onPublishedChange?.(status, { slug });
    setHintTone('ok');
    setHint(published ? `${LANG_LABEL} wieder offline.` : `${LANG_LABEL} ist online.`);
    window.setTimeout(() => setHint(''), 2600);
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
    </div>
  );
}

export default GuidePublishButton;
