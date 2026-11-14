import { useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import { deleteMyAccount } from '../lib/creatorQueries';
import { navigateToHome } from '../lib/routeUtils';

/**
 * Selbstbedienungs-Löschung für Nutzer- und Creator-Konten.
 * Bietet bei verknüpftem Creator-Kanal explizit Option A (nur Profil/Konto löschen)
 * und Option B (Guides offline nehmen, Kanal sperren & Konto löschen) an.
 */
export default function AccountDeleteCard({
  locale = 'de',
  linkedCreators = [],
  onDeleted = null,
}) {
  const isDe = locale !== 'en';
  const hasCreators = Array.isArray(linkedCreators) && linkedCreators.length > 0;
  const channelNames = hasCreators
    ? linkedCreators.map((c) => c?.channel_name || c?.slug).filter(Boolean).join(', ')
    : '';

  const [expanded, setExpanded] = useState(false);
  const [creatorMode, setCreatorMode] = useState('keep_guides');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleDelete = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setErrorMsg('');

    const { error } = await deleteMyAccount(supabase, {
      creatorMode: hasCreators ? creatorMode : 'keep_guides',
    });

    if (error) {
      setBusy(false);
      setErrorMsg(
        error.message ||
          (isDe ? 'Konto konnte nicht gelöscht werden.' : 'Account could not be deleted.'),
      );
      return;
    }

    if (typeof onDeleted === 'function') {
      onDeleted();
    } else {
      navigateToHome(locale);
    }
  };

  return (
    <div className="rounded-xl border border-red-900/40 bg-[#141112] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-red-300">
            {hasCreators
              ? isDe
                ? '🗑️ Creator-Profil & Konto löschen'
                : '🗑️ Delete creator profile & account'
              : isDe
                ? '🗑️ TrophyBase-Konto & Profildaten löschen'
                : '🗑️ Delete TrophyBase account & profile data'}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            {hasCreators
              ? isDe
                ? `Verknüpfter Kanal: ${channelNames}. Wähle selbst, ob bestehende Guides aktiv bleiben oder sofort offline gehen.`
                : `Linked channel: ${channelNames}. Choose whether existing guides stay online or are taken offline immediately.`
              : isDe
                ? 'Löscht dein Login-Konto inklusive Bibliothek, Watchlist, Checklisten und Bewertungen unwiderruflich.'
                : 'Permanently deletes your account including library, watchlist, checklists, and ratings.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setExpanded((prev) => !prev);
            setErrorMsg('');
          }}
          className="rounded-xl border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 px-3.5 py-2 text-xs font-mono font-bold text-red-300 transition cursor-pointer"
        >
          {expanded
            ? isDe
              ? 'Abbrechen ▴'
              : 'Cancel ▴'
            : isDe
              ? 'Profil löschen…'
              : 'Delete profile…'}
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3.5 border-t border-red-900/30 pt-4">
          {hasCreators ? (
            <div className="space-y-2.5">
              <label
                className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${
                  creatorMode === 'keep_guides'
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-zinc-800 bg-[#0e0f10] hover:border-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="tb-creator-delete-mode"
                  checked={creatorMode === 'keep_guides'}
                  onChange={() => setCreatorMode('keep_guides')}
                  className="mt-0.5"
                />
                <span className="space-y-0.5 text-xs">
                  <span className="block font-bold text-white">
                    {isDe
                      ? 'Option A: Nur mein Profil & Login-Konto löschen (Guides bleiben online)'
                      : 'Option A: Delete only my profile & account (keep guides online)'}
                  </span>
                  <span className="block text-[11px] text-zinc-400 leading-relaxed">
                    {isDe
                      ? 'Dein TrophyBase-Login, deine Bio, Social-Links und persönlichen Einstellungen werden sofort gelöscht. Bestehende Einbettungen deiner öffentlichen YouTube-Videos bleiben weiter nutzbar.'
                      : 'Deletes your TrophyBase login, bio, social links, and personal data immediately while keeping existing public YouTube embeds active.'}
                  </span>
                </span>
              </label>

              <label
                className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${
                  creatorMode === 'offline_guides'
                    ? 'border-red-500/60 bg-red-500/10'
                    : 'border-zinc-800 bg-[#0e0f10] hover:border-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="tb-creator-delete-mode"
                  checked={creatorMode === 'offline_guides'}
                  onChange={() => setCreatorMode('offline_guides')}
                  className="mt-0.5"
                />
                <span className="space-y-0.5 text-xs">
                  <span className="block font-bold text-red-200">
                    {isDe
                      ? 'Option B: Verknüpfte Guides offline nehmen, Kanal sperren (Opt-Out) & Konto löschen'
                      : 'Option B: Take linked guides offline, block channel (Opt-Out) & delete account'}
                  </span>
                  <span className="block text-[11px] text-zinc-400 leading-relaxed">
                    {isDe
                      ? 'Alle mit deinem Kanal verknüpften Guides & Video-Links gehen sofort offline, dein Kanal wird dauerhaft für künftige Importe gesperrt (Opt-Out) und dein TrophyBase-Konto wird vollständig gelöscht.'
                      : 'Immediately takes all guides & video links associated with your channel offline, blocks future imports (Opt-Out), and permanently deletes your account.'}
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          <label className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-[#0c0d0f] p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-zinc-300 leading-snug">
              {isDe
                ? 'Mir ist bewusst, dass mein Konto unwiderruflich gelöscht wird und dieser Schritt nicht rückgängig gemacht werden kann.'
                : 'I understand that my account will be permanently deleted and this action cannot be undone.'}
            </span>
          </label>

          {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!confirmed || busy}
              onClick={handleDelete}
              className="rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition cursor-pointer"
            >
              {busy
                ? isDe
                  ? 'Lösche Konto…'
                  : 'Deleting…'
                : hasCreators && creatorMode === 'offline_guides'
                  ? isDe
                    ? 'Guides offline nehmen & Konto endgültig löschen'
                    : 'Take guides offline & delete account'
                  : isDe
                    ? 'Konto jetzt endgültig löschen'
                    : 'Permanently delete account'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
