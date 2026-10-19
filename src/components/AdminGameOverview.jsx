import { useEffect, useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import { GAME_STRUCT, GAME_TYPE } from '../lib/gameSchema';
import { saveGamePlaytime } from '../lib/intranetGameEdits';
import { supabase } from '../pages/supabaseClient';

function formatCount(value) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : '—';
}

function formatHours(value, locale, pattern) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const shown = number.toLocaleString(locale, { maximumFractionDigits: 1 });
  return pattern.replace('{n}', shown);
}

function FactRow({ label, value, emphasize = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-800/70 py-1.5">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`text-right font-medium ${emphasize ? 'text-white' : 'text-zinc-100'}`}>{value}</dd>
    </div>
  );
}

/**
 * Guide-Überblick. Trophäen-Zahlen kommen aus games, Spielzeit aus den Spielzeit-Spalten.
 */
function AdminGameOverview({
  game,
  title = '',
  playtime = null,
  className = '',
  isAdmin = false,
  gameId = '',
  onPlaytimeSaved,
}) {
  const { globalLocale, t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [draftStory, setDraftStory] = useState('');
  const [draftComplete, setDraftComplete] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setEditing(false);
    setError('');
  }, [gameId]);

  if (!game) return null;

  const serverDead = String(game[GAME_STRUCT.gameType] ?? '').trim() === GAME_TYPE.SERVER_DEAD;
  const hours = (key) => formatHours(playtime?.[key], globalLocale, t('playtimeHours'));
  const heading = t('gameOverview').replaceAll('{title}', title || '—');

  const startEdit = () => {
    setDraftStory(playtime?.hauptstory != null ? String(playtime.hauptstory) : '');
    setDraftComplete(playtime?.komplett != null ? String(playtime.komplett) : '');
    setError('');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError('');
  };

  const handleSave = async () => {
    if (!gameId || saving) return;
    setSaving(true);
    setError('');
    const { hauptstory, komplett, error: saveError } = await saveGamePlaytime(supabase, gameId, {
      hauptstory: draftStory,
      komplett: draftComplete,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError.message || 'Spielzeit konnte nicht gespeichert werden.');
      return;
    }
    onPlaytimeSaved?.({ hauptstory, komplett });
    setEditing(false);
  };

  return (
    <section className={`rounded-2xl border border-zinc-800 bg-[#1a1b1c] px-4 py-3 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold tracking-tight text-white md:text-lg">{heading}</h3>
        {isAdmin && !editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66]"
          >
            Bearbeiten
          </button>
        ) : null}
      </div>
      {serverDead ? (
        <p className="mb-3 text-sm font-semibold leading-relaxed text-red-500">
          {t('serverDeadPlatinum')}
        </p>
      ) : null}
      <div className="grid gap-x-8 sm:grid-cols-2">
        <dl className="text-sm">
          <FactRow label={t('trophiesTotal')} value={formatCount(game[GAME_STRUCT.trophyCount])} emphasize />
          <FactRow label={t('trophiesMissable')} value={formatCount(game[GAME_STRUCT.totalMissableTrophies])} />
          <FactRow label={t('trophiesOnline')} value={formatCount(game[GAME_STRUCT.totalOnlineTrophies])} />
        </dl>
        <dl className="text-sm">
          <p className="pt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600 sm:pt-0">
            {t('playtimeTitle')}
          </p>
          {editing ? (
            <div className="mt-1 space-y-2">
              <label className="flex items-center justify-between gap-3">
                <span className="text-zinc-500">{t('playtimeStory')}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  value={draftStory}
                  onChange={(e) => setDraftStory(e.target.value)}
                  className="w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-right text-sm text-zinc-100"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-zinc-500">{t('playtimeComplete')}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  value={draftComplete}
                  onChange={(e) => setDraftComplete(e.target.value)}
                  className="w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-right text-sm text-zinc-100"
                />
              </label>
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-zinc-400"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg border border-[#00ff66]/40 bg-[#00ff66]/10 px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider text-[#00ff66]"
                >
                  {saving ? '…' : 'Speichern'}
                </button>
              </div>
              {error ? <p className="text-xs text-red-400">{error}</p> : null}
            </div>
          ) : (
            <>
              <FactRow label={t('playtimeStory')} value={hours('hauptstory')} />
              <FactRow label={t('playtimeComplete')} value={hours('komplett')} />
            </>
          )}
        </dl>
      </div>
    </section>
  );
}

export default AdminGameOverview;
