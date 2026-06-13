import React from 'react';

function StatusBanner({ tone, title, message }) {
  const styles =
    tone === 'danger'
      ? {
          wrap: 'bg-red-950/90 border-red-500/70 text-red-50',
          title: 'text-red-200',
          icon: '🛑',
        }
      : {
          wrap: 'bg-sky-950/80 border-sky-500/50 text-sky-50',
          title: 'text-sky-200',
          icon: 'ℹ️',
        };

  return (
    <div
      role="alert"
      className={`w-full rounded-xl border px-4 py-4 sm:px-5 sm:py-4 shadow-lg ${styles.wrap}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0" aria-hidden>
          {styles.icon}
        </span>
        <div className="min-w-0">
          {title && (
            <p className={`text-xs font-mono font-bold uppercase tracking-wider mb-1 ${styles.title}`}>
              {title}
            </p>
          )}
          <p className="text-sm sm:text-base font-semibold leading-relaxed">{message}</p>
        </div>
      </div>
    </div>
  );
}

export function GameStatusBanners({ showServerShutdown, showComingSoon, serverMessage, comingSoonMessage }) {
  if (!showServerShutdown && !showComingSoon) return null;

  return (
    <div className="w-full flex flex-col gap-3 mb-6">
      {showServerShutdown && serverMessage && (
        <StatusBanner tone="danger" title="Server Shutdown" message={serverMessage} />
      )}
      {showComingSoon && comingSoonMessage && (
        <StatusBanner tone="info" title="Coming Soon" message={comingSoonMessage} />
      )}
    </div>
  );
}

export default GameStatusBanners;
