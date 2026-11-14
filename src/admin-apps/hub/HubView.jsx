import { useEffect, useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import { setAdminReturnFlag } from '../../lib/adminAccess';
import AdminPushControl from '../AdminPushControl';
import { MICRO_APPS } from '../microAppRegistry';

export default function HubView({ sessionUser }) {
  const [badges, setBadges] = useState({
    roadmap: null,
    reports: null,
    drafts: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchLiveCounts() {
      try {
        const [urgentBugsRes, openReportsRes, draftsSummaryRes] = await Promise.all([
          supabase
            .from('admin_roadmap')
            .select('id', { count: 'exact', head: true })
            .not('status', 'in', '("DONE","REJECTED")')
            .eq('is_urgent', true),
          supabase
            .from('community_reports')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase.rpc('tb_get_staging_queue_summary', { p_creator_id: null }),
        ]);

        if (cancelled) return;

        const draftsTotal = Array.isArray(draftsSummaryRes.data)
          ? draftsSummaryRes.data.length
          : typeof draftsSummaryRes.data?.total_games === 'number'
            ? draftsSummaryRes.data.total_games
            : null;

        setBadges({
          roadmap: urgentBugsRes.count ?? 0,
          reports: openReportsRes.count ?? 0,
          drafts: draftsTotal,
        });
      } catch {
        /* ignore optional badge counts */
      }
    }

    fetchLiveCounts();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-mono uppercase tracking-wider text-[#00ff66]">
          TrophyBase Suite · Google-Stil
        </p>
        <h2 className="text-lg sm:text-xl font-bold text-white">
          Einzel-Apps für deine Android-Sammelkachel
        </h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Jede Kachel unten ist eine eigene, isolierte Mini-PWA mit eigenem Icon und eigenem Android-Fenster.
          Einmal einloggen gilt automatisch für alle Apps.
        </p>
      </div>

      {sessionUser && (
        <AdminPushControl
          sessionUser={sessionUser}
          appTitle="TB Cockpit"
          variant="banner"
        />
      )}

      {/* 3x3 App-Gitter */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {MICRO_APPS.map((app) => {
          const badgeCount = badges[app.id];
          const showBadge = typeof badgeCount === 'number' && badgeCount > 0;

          return (
            <a
              key={app.id}
              href={app.href}
              onClick={() => {
                if (app.isPublicSite) {
                  setAdminReturnFlag(true, '/admin-apps/');
                }
              }}
              className="group relative flex flex-col items-start gap-2.5 rounded-2xl border border-zinc-800/90 bg-[#121417] p-3.5 sm:p-4 no-underline hover:border-[#00ff66]/50 hover:bg-[#15181c] transition shadow-md"
            >
              <div className="flex w-full items-start justify-between gap-2">
                <img
                  src={app.iconSrc}
                  alt=""
                  className="h-12 w-12 rounded-2xl border border-zinc-800 object-cover shadow-sm group-hover:scale-105 transition"
                />
                {showBadge && (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-mono font-bold ${app.accent}`}
                  >
                    {app.id === 'roadmap' ? `🔥 ${badgeCount}` : badgeCount}
                  </span>
                )}
              </div>

              <div className="min-w-0 w-full">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-white group-hover:text-[#00ff66] transition">
                    {app.title}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-400 leading-snug">
                  {app.subtitle}
                </p>
              </div>
            </a>
          );
        })}
      </div>

      {/* Kurzanleitung für Android Sammelkachel */}
      <div className="rounded-2xl border border-zinc-800 bg-[#121315] p-4 flex flex-col gap-2 text-xs text-zinc-300">
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
          📱 So baust du dir die Android-Sammelkachel in 1 Minute:
        </span>
        <ol className="list-decimal pl-4 space-y-1 text-zinc-400 leading-relaxed">
          <li>
            Tippe eine Kachel oben an (z. B. <strong className="text-white">TB Bugs &amp; Ideen</strong> oder{' '}
            <strong className="text-white">TB Entwürfe</strong>).
          </li>
          <li>
            Tippe in der Teil-App oben rechts direkt auf{' '}
            <span className="rounded bg-[#00ff66]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#00ff66]">
              📲 Installieren
            </span>{' '}
            (oder im Chrome-Menü ⋮ auf <em>„App installieren“</em>).
          </li>
          <li>
            Ziehe die installierten Icons auf deinem Android-Startbildschirm zusammen in einen Ordner – fertig! Jede App bleibt im Android-Task-Switcher eigenständig offen, ohne deine offene Guide-Bearbeitung neu zu laden.
          </li>
        </ol>
      </div>
    </div>
  );
}
