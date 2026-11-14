import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import {
  deleteAdminPushDevice,
  fetchAdminPushState,
  isWebPushSupported,
  subscribeAdminPush,
  triggerAdminTestPush,
  unsubscribeAdminPush,
} from '../lib/adminPush';

function formatShortTime(iso) {
  if (!iso) return 'noch kein Versand';
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function AdminPushControl({
  sessionUser,
  appTitle = 'TB Reports',
  variant = 'popover',
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [pushState, setPushState] = useState(() => ({
    supported: isWebPushSupported(),
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
    localEndpoint: null,
    isSubscribedHere: false,
    devices: [],
  }));

  const containerRef = useRef(null);

  const refreshState = useCallback(async () => {
    const next = await fetchAdminPushState(supabase);
    setPushState(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initPushState() {
      const next = await fetchAdminPushState(supabase);
      if (!cancelled) {
        setPushState(next);
        setLoading(false);
      }
    }

    initPushState();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchAdminPushState(supabase).then((next) => {
          if (!cancelled) setPushState(next);
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!open || variant !== 'popover') return undefined;
    const onPointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, variant]);

  const handleSubscribe = async () => {
    setBusy(true);
    setErrorMsg('');
    setFeedback('');
    try {
      await subscribeAdminPush(supabase, sessionUser, appTitle);
      await refreshState();
      setFeedback('Push auf diesem Gerät aktiviert.');
    } catch (err) {
      setErrorMsg(err?.message || 'Push-Aktivierung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const handleUnsubscribe = async () => {
    setBusy(true);
    setErrorMsg('');
    setFeedback('');
    try {
      await unsubscribeAdminPush(supabase);
      await refreshState();
      setFeedback('Push auf diesem Gerät ausgeschaltet.');
    } catch (err) {
      setErrorMsg(err?.message || 'Abmelden fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const handleTestPush = async () => {
    setBusy(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const res = await triggerAdminTestPush(supabase, pushState.localEndpoint);
      await refreshState();
      if (res?.delivered > 0) {
        setFeedback(`Test-Push gesendet (${res.delivered}/${res.total} zugestellt).`);
      } else {
        setErrorMsg('Test-Push ausgelöst, aber 0 Geräte erreicht – bitte Abo erneuern.');
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Test-Push fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDevice = async (row) => {
    setBusy(true);
    setErrorMsg('');
    setFeedback('');
    try {
      await deleteAdminPushDevice(supabase, row.id, pushState.localEndpoint, row.endpoint);
      await refreshState();
      setFeedback(`Gerät „${row.device_label}“ entfernt.`);
    } catch (err) {
      setErrorMsg(err?.message || 'Löschen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const activeDevices = pushState.devices.filter((d) => d.is_active);
  const isActive = pushState.isSubscribedHere;

  if (variant === 'banner') {
    if (!pushState.supported) return null;

    return (
      <div
        className={`rounded-2xl border px-3.5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2.5 ${
          isActive
            ? 'border-[#00ff66]/25 bg-[#00ff66]/5 text-zinc-300'
            : 'border-amber-500/35 bg-amber-500/10 text-amber-100'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="text-sm">
            {isActive ? '🔔' : '🔕'}
          </span>
          <span className="leading-snug">
            {loading ? (
              'Prüfe Push-Status…'
            ) : isActive ? (
              <>
                <strong className="text-[#00ff66]">Push aktiv</strong> für neue{' '}
                <span className="font-mono">community_reports</span>
                {activeDevices.length > 1 ? ` (${activeDevices.length} Geräte)` : ''}
              </>
            ) : pushState.permission === 'denied' ? (
              'Push im Browser blockiert – bitte Benachrichtigungen für trophybase.app erlauben.'
            ) : (
              <>
                <strong>Push-Alarm noch aus:</strong> Neue Community Reports sofort aufs Handy bekommen?
              </>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!loading && !isActive && pushState.permission !== 'denied' && (
            <button
              type="button"
              disabled={busy}
              onClick={handleSubscribe}
              className="rounded-xl bg-[#00ff66] px-3 py-1.5 font-mono text-[11px] font-bold text-[#0a0b0c] hover:bg-[#00dd55] disabled:opacity-50 cursor-pointer"
            >
              {busy ? '…' : '🔔 Push aktivieren'}
            </button>
          )}
          {isActive && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleTestPush}
                className="rounded-xl border border-[#00ff66]/40 bg-[#00ff66]/10 px-2.5 py-1 font-mono text-[11px] font-bold text-[#00ff66] hover:bg-[#00ff66]/20 disabled:opacity-50 cursor-pointer"
              >
                {busy ? '…' : '📨 Test-Push'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleUnsubscribe}
                className="rounded-xl border border-zinc-700 px-2.5 py-1 font-mono text-[11px] text-zinc-400 hover:border-red-500/40 hover:text-red-300 disabled:opacity-50 cursor-pointer"
              >
                Aus
              </button>
            </>
          )}
        </div>

        {(feedback || errorMsg) && (
          <p className={`w-full text-[11px] font-mono ${errorMsg ? 'text-red-300' : 'text-[#00ff66]'}`}>
            {errorMsg || feedback}
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) refreshState();
        }}
        title={isActive ? 'Push-Meldungen aktiv (Einstellungen)' : 'Push-Meldungen für Community Reports einrichten'}
        className={`relative flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-mono transition cursor-pointer ${
          isActive
            ? 'border-[#00ff66]/45 bg-[#00ff66]/12 text-[#00ff66]'
            : 'border-zinc-800 bg-zinc-900/90 text-zinc-400 hover:border-zinc-700 hover:text-white'
        }`}
      >
        <span aria-hidden>{isActive ? '🔔' : '🔕'}</span>
        <span className="hidden sm:inline">{isActive ? 'Push an' : 'Push'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[310px] sm:w-[340px] rounded-2xl border border-zinc-700/90 bg-[#141619] p-3.5 shadow-2xl text-xs text-zinc-200 space-y-3">
          <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-2">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-white">
                🔔 Push-Alarm · Reports
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Sofortmeldung bei neuen <span className="font-mono">community_reports</span>
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-bold ${
                isActive
                  ? 'bg-[#00ff66]/15 text-[#00ff66] border border-[#00ff66]/35'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {isActive ? 'AKTIV' : 'AUS'}
            </span>
          </div>

          {!pushState.supported ? (
            <p className="text-[11px] text-amber-300">
              Dieser Browser unterstützt keine Web-Push-Meldungen. Auf Android bitte Chrome / installierte Web-App nutzen.
            </p>
          ) : pushState.permission === 'denied' ? (
            <p className="text-[11px] text-red-300 leading-relaxed">
              Benachrichtigungen sind in den Browser-/App-Einstellungen blockiert. Bitte dort für{' '}
              <span className="font-mono">trophybase.app</span> freigeben.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {!isActive ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSubscribe}
                  className="w-full rounded-xl bg-[#00ff66] px-3 py-2 font-mono text-xs font-bold text-[#0a0b0c] hover:bg-[#00dd55] disabled:opacity-50 cursor-pointer"
                >
                  {busy ? 'Aktiviere…' : '🔔 Auf diesem Gerät aktivieren'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleTestPush}
                    className="flex-1 rounded-xl border border-[#00ff66]/45 bg-[#00ff66]/15 px-3 py-1.5 font-mono text-[11px] font-bold text-[#00ff66] hover:bg-[#00ff66]/25 disabled:opacity-50 cursor-pointer"
                  >
                    {busy ? '…' : '📨 Test-Push'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleUnsubscribe}
                    className="rounded-xl border border-zinc-700 px-3 py-1.5 font-mono text-[11px] text-zinc-400 hover:border-red-500/40 hover:text-red-300 disabled:opacity-50 cursor-pointer"
                  >
                    Ausschalten
                  </button>
                </>
              )}
            </div>
          )}

          {(feedback || errorMsg) && (
            <p
              className={`rounded-lg border px-2.5 py-1.5 font-mono text-[11px] ${
                errorMsg
                  ? 'border-red-500/30 bg-red-500/10 text-red-300'
                  : 'border-[#00ff66]/30 bg-[#00ff66]/10 text-[#00ff66]'
              }`}
            >
              {errorMsg || feedback}
            </p>
          )}

          {pushState.devices.length > 0 && (
            <div className="space-y-1.5 border-t border-zinc-800 pt-2">
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Hinterlegte Geräte ({activeDevices.length} aktiv)
              </p>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-0.5">
                {pushState.devices.map((dev) => {
                  const isCurrent =
                    Boolean(pushState.localEndpoint) && dev.endpoint === pushState.localEndpoint;
                  return (
                    <div
                      key={dev.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800/90 bg-zinc-900/60 px-2.5 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-zinc-200">
                          {dev.device_label}
                          {isCurrent ? (
                            <span className="ml-1.5 text-[10px] font-mono text-[#00ff66]">
                              · dieses Gerät
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-[10px] font-mono text-zinc-500">
                          {dev.last_error
                            ? `⚠️ ${dev.last_error}`
                            : `Letzter Push: ${formatShortTime(dev.last_sent_at)}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDeleteDevice(dev)}
                        title="Gerät entfernen"
                        className="shrink-0 rounded-lg px-1.5 py-0.5 font-mono text-xs text-zinc-500 hover:bg-red-500/15 hover:text-red-300 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
