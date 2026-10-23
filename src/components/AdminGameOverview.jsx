import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import { GAME_FIELDS, GAME_I18N, GAME_STRUCT, GAME_TYPE } from '../lib/gameSchema';
import {
  buildPlatinumQuickFacts,
  hasPlaytimeValue,
  resolveStatusExplanation,
  storedStatusExplanation,
} from '../lib/gameOverviewCopy';
import { saveGamePlaytime } from '../lib/intranetGameEdits';
import { supabase } from '../pages/supabaseClient';
import CollapsibleSectionCard from './CollapsibleSectionCard';
import GameRadarCard from './GameRadarCard';

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

function QuickFactChip({ icon, text, tone = 'neutral' }) {
  const toneClass =
    tone === 'green'
      ? 'border-[#00ff66]/30 bg-[#00ff66]/10 text-[#00ff66]'
      : tone === 'amber'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        : tone === 'blue'
          ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
          : 'border-zinc-700/80 bg-zinc-900/80 text-zinc-200';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium leading-snug ${toneClass}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{text}</span>
    </span>
  );
}

/**
 * Guide-Überblick. Trophäen-Zahlen kommen aus games, Spielzeit aus den Spielzeit-Spalten,
 * sowie das Platin-Anforderungsprofil (6-Achsen-DNA Radar Chart).
 */
function AdminGameOverview({
  game,
  trophies = [],
  title = '',
  playtime = null,
  radarProfile = null,
  className = '',
  isAdmin = false,
  gameId = '',
  locale: localeProp = '',
  onPlaytimeSaved,
  onStatusExplanationSaved,
}) {
  const { globalLocale, t } = useLocale();
  const locale = String(localeProp || globalLocale || 'de').toLowerCase();
  const [editing, setEditing] = useState(false);
  const [draftStory, setDraftStory] = useState('');
  const [draftComplete, setDraftComplete] = useState('');
  const [draftExplanation, setDraftExplanation] = useState('');
  const [explanationOverride, setExplanationOverride] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setEditing(false);
    setError('');
    setExplanationOverride(null);
  }, [gameId, locale]);

  const gameWithoutStoredExplanation = useMemo(
    () => ({
      ...game,
      [GAME_FIELDS.statusExplanation]: '',
      [GAME_I18N.statusExplanation]: {},
      status_explanation_localized: {},
    }),
    [game],
  );

  const manualExplanation = useMemo(() => {
    if (explanationOverride?.locale === locale) {
      return String(explanationOverride.text ?? '').trim();
    }
    return storedStatusExplanation(game, locale);
  }, [game, locale, explanationOverride]);

  const rawProfile =
    radarProfile ??
    game?.radar_profile ??
    game?.radarProfile ??
    null;

  const profile = useMemo(() => {
    if (!rawProfile) return null;
    let parsed = rawProfile;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return null;
      }
    }
    if (!parsed || typeof parsed !== 'object') return null;

    const langKey = locale || 'de';
    if (parsed[langKey] && typeof parsed[langKey] === 'object' && Array.isArray(parsed[langKey].axes)) {
      return { ...parsed[langKey], _resolvedLocale: langKey };
    }

    // Rein deutsches radar_profile nur auf deutschen Seiten anzeigen
    if (langKey === 'de') {
      if (parsed.de && typeof parsed.de === 'object' && Array.isArray(parsed.de.axes)) {
        return { ...parsed.de, _resolvedLocale: 'de' };
      }
      if (Array.isArray(parsed.axes)) {
        return { ...parsed, _resolvedLocale: 'de' };
      }
      if (Array.isArray(parsed)) {
        return { axes: parsed, _resolvedLocale: 'de' };
      }
    }

    return null;
  }, [rawProfile, locale]);

  const trophyCounts = useMemo(() => {
    const list = Array.isArray(trophies) ? trophies : [];
    const dbTotal = game?.[GAME_STRUCT.trophyCount];
    const dbMissable = game?.[GAME_STRUCT.totalMissableTrophies];
    const dbOnline = game?.[GAME_STRUCT.totalOnlineTrophies];

    const total = dbTotal != null && dbTotal !== ''
      ? dbTotal
      : list.length > 0
        ? list.length
        : null;

    const missable = dbMissable != null && dbMissable !== ''
      ? dbMissable
      : list.length > 0
        ? list.filter((tr) => Boolean(tr?.is_missable)).length
        : (game?.[GAME_STRUCT.hasMissableTrophies] === false ? 0 : null);

    const online = dbOnline != null && dbOnline !== ''
      ? dbOnline
      : list.length > 0
        ? list.filter((tr) => Boolean(tr?.is_online)).length
        : (game?.[GAME_STRUCT.hasOnlineTrophies] === false ? 0 : null);

    return { total, missable, online };
  }, [game, trophies]);

  const quickFacts = useMemo(
    () => buildPlatinumQuickFacts(game, trophies, profile ?? rawProfile, locale),
    [game, trophies, profile, rawProfile, locale],
  );

  if (!game) return null;

  const serverDead = String(game[GAME_STRUCT.gameType] ?? '').trim() === GAME_TYPE.SERVER_DEAD;
  const hours = (key) => formatHours(playtime?.[key], globalLocale, t('playtimeHours'));
  const heading = t('gameOverview').replaceAll('{title}', title || '—');
  const hasStory = hasPlaytimeValue(playtime?.hauptstory);
  const hasComplete = hasPlaytimeValue(playtime?.komplett);
  const showPlaytimeBlock = isAdmin || hasStory || hasComplete;

  const storageKey = gameId
    ? `trophybase_guide_overview_open_${gameId}`
    : 'trophybase_guide_overview_open';

  const startEdit = () => {
    setDraftStory(playtime?.hauptstory != null ? String(playtime.hauptstory) : '');
    setDraftComplete(playtime?.komplett != null ? String(playtime.komplett) : '');
    const stored =
      explanationOverride?.locale === locale
        ? String(explanationOverride.text ?? '')
        : storedStatusExplanation(game, locale);
    setDraftExplanation(stored);
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
    const { hauptstory, komplett, statusExplanation, error: saveError } = await saveGamePlaytime(
      supabase,
      gameId,
      {
        hauptstory: draftStory,
        komplett: draftComplete,
        statusExplanation: draftExplanation,
        locale,
      },
    );
    setSaving(false);
    if (saveError) {
      setError(saveError.message || 'Überblick konnte nicht gespeichert werden.');
      return;
    }
    onPlaytimeSaved?.({ hauptstory, komplett });
    setExplanationOverride({ locale, text: statusExplanation ?? draftExplanation.trim() });
    onStatusExplanationSaved?.(statusExplanation ?? draftExplanation.trim(), locale);
    setEditing(false);
  };

  const headerActions = isAdmin && !editing ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
      className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66]"
    >
      Bearbeiten
    </button>
  ) : null;

  return (
    <CollapsibleSectionCard
      sectionId="guide-overview"
      title={heading}
      defaultOpen={true}
      accent="green"
      className={className}
      storageKey={storageKey}
      headerActions={headerActions}
    >
      {serverDead ? (
        <p className="mb-3 text-sm font-semibold leading-relaxed text-red-500">
          {t('serverDeadPlatinum')}
        </p>
      ) : null}

      {!serverDead && quickFacts.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {quickFacts.map((fact) => (
            <QuickFactChip
              key={fact.key}
              icon={fact.icon}
              text={fact.text}
              tone={fact.tone}
            />
          ))}
        </div>
      ) : null}

      {!serverDead && manualExplanation && !editing ? (
        <p className="mb-4 text-sm leading-relaxed text-zinc-300">{manualExplanation}</p>
      ) : null}

      {editing ? (
        <label className="mb-3 flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Kurztext ({locale.toUpperCase()}) – leer = Auto-Satz
          </span>
          <textarea
            value={draftExplanation}
            onChange={(e) => setDraftExplanation(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-relaxed text-zinc-200"
            placeholder={
              resolveStatusExplanation(gameWithoutStoredExplanation, locale) ||
              'Optionaler Kurztext…'
            }
          />
        </label>
      ) : null}

      <div className={`grid gap-x-8 ${showPlaytimeBlock ? 'sm:grid-cols-2' : ''}`}>
        <dl className="text-sm">
          <FactRow label={t('trophiesTotal')} value={formatCount(trophyCounts.total)} emphasize />
          <FactRow label={t('trophiesMissable')} value={formatCount(trophyCounts.missable)} />
          <FactRow label={t('trophiesOnline')} value={formatCount(trophyCounts.online)} />
        </dl>
        {showPlaytimeBlock ? (
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
                {(isAdmin || hasStory) ? (
                  <FactRow label={t('playtimeStory')} value={hours('hauptstory')} />
                ) : null}
                {(isAdmin || hasComplete) ? (
                  <FactRow label={t('playtimeComplete')} value={hours('komplett')} />
                ) : null}
              </>
            )}
          </dl>
        ) : null}
      </div>

      {editing && !showPlaytimeBlock ? (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
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
          {error ? <p className="w-full text-xs text-red-400">{error}</p> : null}
        </div>
      ) : null}

      <GameRadarCard profile={profile} isAdmin={isAdmin} embedded />
    </CollapsibleSectionCard>
  );
}

export default AdminGameOverview;
