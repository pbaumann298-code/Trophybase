
function StatusBanner({ title, message }) {
  return (
    <div
      role="alert"
      className="w-full rounded-xl border px-4 py-4 sm:px-5 sm:py-4 shadow-lg bg-red-950/90 border-red-500/70 text-red-50"
    >
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0" aria-hidden>
          🛑
        </span>
        <div className="min-w-0">
          {title && (
            <p className="text-xs font-mono font-bold uppercase tracking-wider mb-1 text-red-200">
              {title}
            </p>
          )}
          <p className="text-sm sm:text-base font-semibold leading-relaxed">{message}</p>
        </div>
      </div>
    </div>
  );
}

export function GameStatusBanners({ showServerShutdown, serverMessage }) {
  if (!showServerShutdown || !serverMessage) return null;

  return (
    <div className="w-full flex flex-col gap-3 mb-6">
      <StatusBanner title="Server Shutdown" message={serverMessage} />
    </div>
  );
}

export default GameStatusBanners;
