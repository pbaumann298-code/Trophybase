import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import { handleStaffGamePreviewClick, setAdminReturnFlag } from '../../lib/adminAccess';
import { buildPrettyGamePath, hardwareToUrlSegment } from '../../lib/gameSlug';
import { intranetGameHref } from '../../lib/intranetQueries';

function formatNumber(n) {
  return Number(n ?? 0).toLocaleString('de-DE');
}

function resolveTopGameHref(row) {
  if (!row || typeof row !== 'object') return '';
  if (row.url) return String(row.url);
  if (row.href) return String(row.href);
  const hw = hardwareToUrlSegment(row.hardware);
  const slug = String(row.slug ?? '').trim();
  if (hw && slug) {
    const pretty = buildPrettyGamePath('de', hw, slug);
    if (pretty) return pretty;
  }
  const fallbackHref = intranetGameHref({
    id: row.game_id ?? row.id,
    platform_game_id: row.platform_game_id,
    slug: row.slug,
  });
  return fallbackHref || '';
}

function resolveTopGameTitle(row) {
  if (!row || typeof row !== 'object') return '—';
  const raw = row.title ?? row.spieltitel ?? row.name ?? '';
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (raw && typeof raw === 'object') {
    const val = raw.de || raw.en || Object.values(raw).find(Boolean);
    if (val) return String(val).trim();
  }
  return String(row.slug ?? row.game_id ?? row.id ?? '—');
}

function WebsitePanel() {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState('');

  const loadViewStats = useCallback(async () => {
    setLoadingStats(true);
    setStatsError('');
    try {
      const { data, error } = await supabase.rpc('tb_get_admin_view_stats', { p_limit: 25 });
      if (error) {
        setStatsError(error.message || 'Statistik konnte nicht geladen werden.');
      } else {
        setStats(data && typeof data === 'object' ? data : {});
      }
    } catch (err) {
      setStatsError(err?.message || 'Statistik konnte nicht geladen werden.');
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadViewStats();
  }, [loadViewStats]);

  const openWebsite = () => {
    setAdminReturnFlag(true);
    window.location.href = '/';
  };

  const summary = stats?.summary && typeof stats.summary === 'object' ? stats.summary : {};
  const topGames = Array.isArray(stats?.top_games) ? stats.top_games : [];
  const dailySeries = Array.isArray(stats?.daily_series)
    ? stats.daily_series.slice(0, 14)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Website-Vorschau</h2>
        <p className="text-sm text-zinc-500">
          Öffne die normale TrophyBase-Website in derselben Session. Im Header erscheint ein
          Button „Admin“, um hierher zurückzukehren.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-[#1a1b1c] p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <p className="text-sm text-zinc-300 font-mono">https://www.trophybase.app/</p>
          <p className="text-xs text-zinc-500 mt-1">
            Die Website zeigt nur veröffentlichte Guides. Rohe Guides (FERTIG) suchst du im Tab Datenbank.
          </p>
        </div>
        <button
          type="button"
          onClick={openWebsite}
          className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-[#00ff66] text-[#121314] text-sm font-bold hover:bg-[#00dd55] transition"
        >
          Website öffnen
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-[#121314] p-4 text-xs text-zinc-500">
        Tipp: Unter „Datenbank“ filterst du die komplette games-Tabelle nach Pipeline-Status
        (z. B. hängt nach Discovery). Nach dem Öffnen der Website kannst du Guides live
        prüfen, während du Meldungen in einem zweiten Tab bearbeitest.
      </div>

      {/* Live-Statistik (ohne Datensammler) */}
      <div className="rounded-2xl border border-zinc-800 bg-[#1a1b1c] p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white">
              Live-Statistik (ohne Datensammler)
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Anonyme Guide-Aufrufe echter Besucher (Admin-, Creator- und Vorschau-Klicks sind ausgeschlossen).
            </p>
          </div>
          <button
            type="button"
            onClick={loadViewStats}
            disabled={loadingStats}
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl border border-zinc-700 bg-[#121314] text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:text-white disabled:opacity-50 transition"
          >
            {loadingStats ? 'Lade…' : '↻ Aktualisieren'}
          </button>
        </div>

        {statsError ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
            {statsError}
          </div>
        ) : null}

        {/* 1. 4 kompakte KPI-Kacheln (summary) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-zinc-800 bg-[#121314] p-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
              Heute
            </p>
            <p className="text-2xl font-extrabold text-[#00ff66] mt-1 tabular-nums">
              {loadingStats && !stats ? '…' : formatNumber(summary.today)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#121314] p-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
              Gestern
            </p>
            <p className="text-2xl font-extrabold text-white mt-1 tabular-nums">
              {loadingStats && !stats ? '…' : formatNumber(summary.yesterday)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#121314] p-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
              Letzte 7 Tage
            </p>
            <p className="text-2xl font-extrabold text-white mt-1 tabular-nums">
              {loadingStats && !stats ? '…' : formatNumber(summary.last_7_days)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#121314] p-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
              Letzte 30 Tage
            </p>
            <p className="text-2xl font-extrabold text-white mt-1 tabular-nums">
              {loadingStats && !stats ? '…' : formatNumber(summary.last_30_days)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* 2. Top-Spiele-Tabelle (top_games) */}
          <div className="xl:col-span-2 space-y-2.5">
            <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Top-Spiele ({topGames.length})
            </h4>
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-[#121314]">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-zinc-800 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Spiel</th>
                    <th className="px-3 py-2.5 font-medium">Hardware</th>
                    <th className="px-3 py-2.5 font-medium text-right">Heute</th>
                    <th className="px-3 py-2.5 font-medium text-right">7 Tage</th>
                    <th className="px-3 py-2.5 font-medium text-right">Gesamt</th>
                    <th className="px-3 py-2.5 font-medium text-right">Guide</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {topGames.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                        {loadingStats ? 'Lade Top-Spiele…' : 'Noch keine Aufrufe erfasst.'}
                      </td>
                    </tr>
                  ) : (
                    topGames.map((row, idx) => {
                      const title = resolveTopGameTitle(row);
                      const href = resolveTopGameHref(row);
                      const key = String(row.game_id ?? row.id ?? row.slug ?? idx);
                      return (
                        <tr key={key} className="hover:bg-zinc-900/60">
                          <td className="px-3 py-2 font-medium text-zinc-200 max-w-[240px] truncate">
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => handleStaffGamePreviewClick(e, href)}
                                className="hover:text-[#00ff66] hover:underline"
                                title={title}
                              >
                                {title}
                              </a>
                            ) : (
                              <span title={title}>{title}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sky-300 whitespace-nowrap">
                            {row.hardware || '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-[#00ff66]">
                            {formatNumber(row.views_today)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-200">
                            {formatNumber(row.views_7d)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">
                            {formatNumber(row.views_total)}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => handleStaffGamePreviewClick(e, href)}
                                className="text-[11px] font-bold text-[#00ff66] hover:underline"
                              >
                                Öffnen ↗
                              </a>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Tages-Verlauf (daily_series) */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Tages-Verlauf (letzte 14 Tage)
            </h4>
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-[#121314]">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-zinc-800 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Datum</th>
                    <th className="px-3 py-2.5 font-medium text-right">Aufrufe</th>
                    <th className="px-3 py-2.5 font-medium text-right">Spiele</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {dailySeries.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-zinc-500">
                        {loadingStats ? 'Lade Verlauf…' : 'Noch keine Tagesdaten.'}
                      </td>
                    </tr>
                  ) : (
                    dailySeries.map((day, idx) => (
                      <tr key={String(day.date ?? idx)} className="hover:bg-zinc-900/60">
                        <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">
                          {day.date || '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-white">
                          {formatNumber(day.views)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-400">
                          {formatNumber(day.unique_games)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WebsitePanel;
