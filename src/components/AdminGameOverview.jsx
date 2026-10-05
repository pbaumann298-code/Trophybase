import { useLocale } from '../context/LocaleContext';
import { GAME_STRUCT, GAME_TYPE } from '../lib/gameSchema';

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
 * Admin-Prototyp. Zahlen kommen aus games, die Beschriftung aus der Seitensprache.
 */
function AdminGameOverview({ game, title = '', playtime = null, className = '' }) {
  const { globalLocale, t } = useLocale();
  if (!game) return null;

  const serverDead = String(game[GAME_STRUCT.gameType] ?? '').trim() === GAME_TYPE.SERVER_DEAD;
  const hours = (key) => formatHours(playtime?.[key], globalLocale, t('playtimeHours'));
  const heading = t('gameOverview').replaceAll('{title}', title || '—');

  return (
    <section className={`rounded-2xl border border-zinc-800 bg-[#1a1b1c] px-4 py-3 ${className}`}>
      <h3 className="mb-3 text-base font-bold tracking-tight text-white md:text-lg">
        {heading}
      </h3>
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
          <FactRow label={t('playtimeStory')} value={hours('hauptstory')} />
          <FactRow label={t('playtimeSides')} value={hours('neben')} />
          <FactRow label={t('playtimeComplete')} value={hours('komplett')} />
          <FactRow label={t('playtimeDlc')} value={hours('dlc')} />
        </dl>
      </div>
    </section>
  );
}

export default AdminGameOverview;
