import { useLocale } from '../context/LocaleContext';

/**
 * Fragt nach Login, ob Browser-Häkchen ins Profil übernommen werden sollen.
 */
function ProgressSyncPrompt({
  open = false,
  busy = false,
  localStats = { games: 0, steps: 0 },
  cloudStats = { games: 0, steps: 0 },
  reason = '',
  onAccept,
  onDecline,
}) {
  const { t } = useLocale();
  if (!open) return null;

  const detailKey =
    reason === 'profile_empty' || reason === 'first_login'
      ? 'progressSyncDetailEmpty'
      : reason === 'foreign_or_cleared'
        ? 'progressSyncDetailForeign'
        : 'progressSyncDetailDivergent';

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-sync-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#1a1b1c] p-5 shadow-2xl">
        <h2
          id="progress-sync-title"
          className="text-base font-bold text-zinc-100 tracking-tight mb-2"
        >
          {t('progressSyncTitle')}
        </h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-3">
          {t(detailKey)}
        </p>
        <p className="text-xs font-mono text-zinc-500 mb-5">
          {t('progressSyncStats')
            .replace('{localGames}', String(localStats.games ?? 0))
            .replace('{localSteps}', String(localStats.steps ?? 0))
            .replace('{cloudGames}', String(cloudStats.games ?? 0))
            .replace('{cloudSteps}', String(cloudStats.steps ?? 0))}
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onDecline}
            className="rounded-xl border border-zinc-600 bg-transparent px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            {t('progressSyncDecline')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onAccept}
            className="rounded-xl border border-[#00ff66]/40 bg-[#00ff66]/15 px-4 py-2.5 text-sm font-bold text-[#00ff66] hover:bg-[#00ff66]/25 disabled:opacity-50"
          >
            {busy ? t('progressSyncBusy') : t('progressSyncAccept')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProgressSyncPrompt;
