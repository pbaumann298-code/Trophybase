import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import { handleStaffGamePreviewClick } from '../../lib/adminAccess';
import {
  fetchCatalogAchievementRows,
  fetchPlatformCatalogGames,
} from '../../lib/platformCatalogAdapter';
import { localizeJsonField } from '../../lib/translationUtils';

const PAGE_SIZE = 100;

const PLATFORMS = [
  { id: 'steam', label: '🖥️ Steam Katalog (catalog_steam_games)' },
  { id: 'xbox', label: '💚 Xbox Katalog (catalog_xbox_games)' },
];

const STATUS_FILTERS = [
  { id: 'ALL', label: 'Alle' },
  { id: 'VERIFIED', label: '🟢 VERIFIED (>=80%)' },
  { id: 'AUTO_CANDIDATE', label: '🟡 AUTO_CANDIDATE' },
  { id: 'SEPARATE_STACK', label: '🔴 SEPARATE_STACK' },
  { id: 'UNLINKED', label: '⚪ UNLINKED' },
  { id: 'ACHIEVEMENTS_LOADED', label: '🏆 ACHIEVEMENTS_LOADED' },
];

function platformKey(platform, game) {
  if (!game) return '';
  return platform === 'xbox' ? String(game.title_id ?? '') : String(game.app_id ?? '');
}

function statusClass(status) {
  if (status === 'VERIFIED') return 'text-[#00ff66] border-[#00ff66]/40 bg-[#00ff66]/10';
  if (status === 'AUTO_CANDIDATE') return 'text-amber-300 border-amber-500/40 bg-amber-500/10';
  if (status === 'SEPARATE_STACK') return 'text-red-300 border-red-500/40 bg-red-500/10';
  return 'text-zinc-400 border-zinc-700 bg-zinc-900/40';
}

function formatConfidence(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n}%`;
}

function textAt(value, locale) {
  return localizeJsonField(value, locale, 'en', { exact: locale === 'de' ? false : true }) || '—';
}

function AchievementDrawer({ platform, game }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const platformId = platformKey(platform, game);

  useEffect(() => {
    let cancelled = false;
    fetchCatalogAchievementRows(supabase, platform, platformId)
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Achievements konnten nicht geladen werden.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [platform, platformId]);

  if (loading) {
    return <p className="px-4 py-3 font-mono text-xs text-zinc-500">Achievements werden geladen…</p>;
  }
  if (error) {
    return <p className="px-4 py-3 text-xs text-red-300">{error}</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-zinc-500">
        Keine Achievements geladen
        {game?.crawl_status ? ` (crawl_status: ${game.crawl_status})` : ''}.
      </p>
    );
  }

  return (
    <div className="max-h-[28rem] overflow-auto border-t border-zinc-800">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="sticky top-0 bg-[#121314] text-[10px] uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-3 py-2 font-medium">Icon</th>
            <th className="px-3 py-2 font-medium">Name DE / EN</th>
            <th className="px-3 py-2 font-medium">Beschreibung</th>
            <th className="px-3 py-2 font-medium">Guide-Tipp</th>
            <th className="px-3 py-2 font-medium">PSN-ID</th>
            <th className="px-3 py-2 font-medium">{platform === 'xbox' ? 'Score' : '%'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const apiName = String(row.api_name || row.achievement_id || '');
            const nameSource = row.trophy_name ?? row.name;
            const descSource = row.trophy_desc ?? row.description;
            const percent = row.global_percent ?? row.rarity_percent;
            return (
              <tr key={apiName || row.id} className="border-t border-zinc-800/80 align-top">
                <td className="px-3 py-2">
                  {row.icon_url ? (
                    <img src={row.icon_url} alt="" className="h-8 w-8 rounded bg-zinc-950 object-cover" />
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-200">
                  <p className="font-semibold">{textAt(nameSource, 'de')}</p>
                  <p className="mt-0.5 text-zinc-500">{textAt(nameSource, 'en')}</p>
                  <p className="mt-1 font-mono text-[10px] text-zinc-600">{apiName}</p>
                </td>
                <td className="px-3 py-2 text-zinc-400">
                  <p>{textAt(descSource, 'de')}</p>
                  <p className="mt-1 text-zinc-500">{textAt(descSource, 'en')}</p>
                </td>
                <td className="px-3 py-2 text-zinc-300">{textAt(row.guide_tip, 'de')}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-sky-300">
                  {row.matched_psn_trophy_id || '—'}
                </td>
                <td className="px-3 py-2 font-mono text-zinc-300">
                  {platform === 'xbox'
                    ? (row.gamerscore != null ? `${row.gamerscore} GS` : '—')
                    : (percent != null && percent !== '' ? `${percent}%` : '—')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IntranetPlatformCatalog() {
  const [platform, setPlatform] = useState('steam');
  const [matchStatus, setMatchStatus] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [games, setGames] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [openKey, setOpenKey] = useState('');

  const appliedSearchRef = useRef('');

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = searchInput.trim();
      if (appliedSearchRef.current === next) return;
      appliedSearchRef.current = next;
      setSearch(next);
      setOffset(0);
      setOpenKey('');
      setLoading(true);
      setError('');
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    const append = offset > 0;
    fetchPlatformCatalogGames(supabase, platform, {
      search,
      matchStatus,
      limit: PAGE_SIZE,
      offset,
    }).then((result) => {
      if (cancelled) return;
      const next = result?.games ?? [];
      setGames((prev) => (append ? [...prev, ...next] : next));
      setHasMore(next.length === PAGE_SIZE);
      setError(result?.error || '');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [platform, matchStatus, search, offset]);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="mb-1 text-lg font-bold text-white">Steam &amp; Xbox</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-500">
          Katalog der verknüpften Plattform-Stacks. Die öffentliche Website bleibt die
          PlayStation-Ansicht. Ein Klick auf den Master-Guide öffnet die Vorschau.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setPlatform(entry.id);
              setOffset(0);
              setOpenKey('');
              setGames([]);
              setLoading(true);
              setError('');
            }}
            className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wider ${
              platform === entry.id
                ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66]'
                : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setMatchStatus(entry.id);
              setOffset(0);
              setOpenKey('');
              setGames([]);
              setLoading(true);
              setError('');
            }}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              matchStatus === entry.id
                ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66]'
                : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <input
        type="search"
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        placeholder="Titel suchen…"
        className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
      />

      {error ? (
        <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}

      {loading && games.length === 0 ? (
        <p className="font-mono text-sm text-zinc-500">Katalog wird geladen…</p>
      ) : null}

      {!loading && games.length === 0 ? (
        <p className="text-sm text-zinc-500">Keine Einträge für diesen Filter.</p>
      ) : null}

      <div className="space-y-3">
        {games.map((game) => {
          const key = platformKey(platform, game);
          const open = openKey === key;
          const href = game.linked_game_id
            ? `/guide/${encodeURIComponent(game.linked_game_id)}?preview=1`
            : '';
          return (
            <article
              key={key || game.title}
              className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#141516]"
            >
              <div className="flex flex-col gap-4 p-4 sm:flex-row">
                <div className="h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
                  {game.cover_url ? (
                    <img src={game.cover_url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-white">{game.title || '—'}</h3>
                    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${statusClass(game.match_status)}`}>
                      {game.match_status || '—'}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-zinc-500">
                    {platform === 'xbox' ? 'TitleID' : 'AppID'} {key || '—'}
                    {game.store_id ? ` · Store ${game.store_id}` : ''}
                    {game.hardware ? ` · ${game.hardware}` : ''}
                    {' · '}
                    {game.release_year || '—'}
                    {' · '}
                    {game.achievement_count ?? 0} Achievements
                    {platform === 'steam' && game.fsk != null ? ` · FSK ${game.fsk}` : ''}
                    {game.max_gamerscore != null ? ` · ${game.max_gamerscore} GS` : ''}
                    {' · '}
                    Match {formatConfidence(game.match_confidence)}
                    {game.crawl_status ? ` · ${game.crawl_status}` : ''}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {[game.developer, game.publisher].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {game.match_notes ? (
                    <p className="text-xs leading-relaxed text-zinc-500">{game.match_notes}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => handleStaffGamePreviewClick(event, href)}
                        className="text-[11px] font-bold uppercase tracking-wider text-[#00ff66] no-underline hover:underline"
                      >
                        PlayStation-Master-Guide
                      </a>
                    ) : (
                      <span className="text-[11px] uppercase tracking-wider text-zinc-600">
                        kein linked_game_id
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpenKey(open ? '' : key)}
                      className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
                    >
                      {open ? 'Achievements zuklappen' : 'Achievements anzeigen'}
                    </button>
                  </div>
                </div>
              </div>
              {open ? (
                <AchievementDrawer key={`${platform}:${key}`} platform={platform} game={game} />
              ) : null}
            </article>
          );
        })}
      </div>

      {hasMore ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
          className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66] disabled:opacity-50"
        >
          {loading ? 'Lädt…' : 'Weitere 100 laden'}
        </button>
      ) : null}
    </section>
  );
}

export default IntranetPlatformCatalog;
