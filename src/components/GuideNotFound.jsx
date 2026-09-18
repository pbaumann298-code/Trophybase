import { useLocale } from '../context/LocaleContext';

/**
 * Deep-Link auf einen Guide, den es (noch) nicht gibt. Ohne diese Ansicht
 * bleibt der Inhaltsbereich komplett leer und der Fehler steht nur in der Konsole.
 */
export default function GuideNotFound({ error, onBack }) {
  const { t } = useLocale();

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-16 text-center">
      <p className="text-5xl mb-4" aria-hidden="true">
        🔍
      </p>
      <h1 className="text-xl font-extrabold text-white tracking-tight mb-3">
        {t('guideNotFoundTitle')}
      </h1>
      <p className="text-sm text-zinc-400 leading-relaxed mb-6">
        {t('guideNotFoundBody')}
      </p>

      {error?.ref && (
        <p className="text-xs font-mono text-zinc-600 break-all mb-6">{error.ref}</p>
      )}

      {import.meta.env.DEV && error?.detail && (
        <p className="text-xs font-mono text-red-400/80 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2 text-left break-words mb-6">
          {error.detail}
        </p>
      )}

      <button
        type="button"
        onClick={onBack}
        className="text-[#00ff66] text-xs uppercase tracking-wider font-bold hover:underline bg-none border-none cursor-pointer"
      >
        {t('backDashboard')}
      </button>
    </div>
  );
}
