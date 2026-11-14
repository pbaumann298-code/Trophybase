import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import {
  addCreatorWatchlistItem,
  fetchCreatorWatchlist,
  removeCreatorWatchlistItem,
} from '../../lib/creatorQueries';
import UnifiedGameSearchField from '../common/UnifiedGameSearchField';

function platformPill(row) {
  if (row?.source_platform === 'steam') {
    return {
      label: row.steam_app_id ? `Steam #${row.steam_app_id}` : 'Steam',
      cls: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    };
  }
  if (row?.source_platform === 'xbox') {
    return {
      label: 'Xbox',
      cls: 'border-lime-500/40 bg-lime-500/15 text-lime-300',
    };
  }
  return {
    label: row?.cached_hardware || 'PS5/PS4',
    cls: 'border-sky-500/35 bg-sky-500/10 text-sky-300',
  };
}

export default function CreatorWatchlistPanel({
  creatorId,
  locale = 'de',
  onOpenGame,
}) {
  const [listState, setListState] = useState({ creatorId: '', items: [], loaded: false });
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  if (listState.creatorId !== creatorId) {
    setListState({ creatorId, items: [], loaded: !creatorId });
  }

  useEffect(() => {
    if (!creatorId) return undefined;
    let cancelled = false;
    fetchCreatorWatchlist(supabase, creatorId).then(({ data, error: loadErr }) => {
      if (cancelled) return;
      if (loadErr) {
        setError(loadErr.message || 'Watchlist konnte nicht geladen werden.');
        setListState({ creatorId, items: [], loaded: true });
        return;
      }
      setListState({ creatorId, items: data, loaded: true });
    });
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  const items = listState.items;
  const loading = !listState.loaded;

  const savedTargetKeys = useMemo(
    () => new Set(items.map((entry) => entry.target_key).filter(Boolean)),
    [items],
  );

  const handleAdd = async (searchItem) => {
    if (!creatorId || !searchItem) return;
    const key =
      searchItem.target_key ||
      `${searchItem.source_platform || 'psn'}:${searchItem.id || searchItem.steam_app_id || searchItem.xbox_title_id}`;
    if (savedTargetKeys.has(key) || busyKey === key) return;

    setBusyKey(key);
    setError('');
    const { data, error: addErr } = await addCreatorWatchlistItem(supabase, {
      creatorId,
      item: searchItem,
      locale,
    });
    setBusyKey('');
    if (addErr) {
      setError(addErr.message || 'Konnte nicht zur Watchlist hinzugefügt werden.');
      return;
    }
    if (data) {
      setListState((prev) => ({
        ...prev,
        items: [data, ...prev.items.filter((row) => row.id !== data.id)],
      }));
    } else {
      const { data: fresh } = await fetchCreatorWatchlist(supabase, creatorId);
      setListState({ creatorId, items: fresh, loaded: true });
    }
  };

  const handleRemove = async (rowId) => {
    if (!rowId || busyKey === rowId) return;
    setBusyKey(rowId);
    setError('');
    const { error: rmErr } = await removeCreatorWatchlistItem(supabase, rowId);
    setBusyKey('');
    if (rmErr) {
      setError(rmErr.message || 'Eintrag konnte nicht entfernt werden.');
      return;
    }
    setListState((prev) => ({
      ...prev,
      items: prev.items.filter((row) => row.id !== rowId),
    }));
  };

  const isDe = locale === 'de';

  return (
    <section className="mb-8 rounded-2xl border border-zinc-800 bg-[#121315] p-4 sm:p-5 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-white">
            📌 {isDe ? 'Meine Watchlist · Spiele ohne Guide' : 'My Watchlist · Games without Guide'}
          </h2>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] font-mono text-zinc-300">
            {items.length}
          </span>
        </div>
        <span className="text-[11px] font-mono text-zinc-500">
          {isDe ? 'Nur für dich sichtbar' : 'Visible only to you'}
        </span>
      </div>

      {/* Schlanke angehängte Suche ohne Schnickschnack */}
      <UnifiedGameSearchField
        locale={locale}
        onlyWithoutGuide
        disabledTargetKeys={savedTargetKeys}
        actionLabel={isDe ? '+ Watchlist' : '+ Watchlist'}
        addedLabel={isDe ? '✓ Auf Watchlist' : '✓ In Watchlist'}
        onSelect={handleAdd}
      />

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {loading ? (
        <p className="text-xs font-mono text-zinc-500">
          {isDe ? 'Watchlist wird geladen…' : 'Loading watchlist…'}
        </p>
      ) : items.length === 0 ? (
        <p className="text-xs text-zinc-500">
          {isDe
            ? 'Noch keine Spiele vorgemerkt. Suche oben nach Titel, Publisher, Genre, Steam oder Xbox, um offene Spiele für nächste Guides zu sammeln.'
            : 'No games saved yet. Search above by title, publisher, genre, Steam or Xbox to plan upcoming guides.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 pt-1">
          {items.map((row) => {
            const pill = platformPill(row);
            const canOpenPsn = Boolean(row.game_id && onOpenGame);
            return (
              <div
                key={row.id}
                className="flex items-center justify-between gap-2.5 rounded-xl border border-zinc-800/90 bg-[#0d0e10] p-2 hover:border-zinc-700 transition"
              >
                <div
                  onClick={() => {
                    if (canOpenPsn) {
                      onOpenGame({ id: row.game_id, spieltitel: { de: row.cached_title, en: row.cached_title } });
                    }
                  }}
                  className={`flex items-center gap-2.5 min-w-0 flex-1 ${
                    canOpenPsn ? 'cursor-pointer group' : ''
                  }`}
                >
                  {row.cached_cover_url ? (
                    <img
                      src={row.cached_cover_url}
                      alt=""
                      loading="lazy"
                      className="h-11 w-9 shrink-0 rounded object-cover bg-zinc-800"
                    />
                  ) : (
                    <div className="h-11 w-9 shrink-0 rounded bg-zinc-800 flex items-center justify-center text-xs">
                      🎮
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-zinc-100 group-hover:text-[#00ff66] transition-colors">
                      {row.cached_title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono leading-none ${pill.cls}`}
                      >
                        {pill.label}
                      </span>
                      {row.cached_achievement_count != null ? (
                        <span className="text-[10px] font-mono text-zinc-400">
                          🏆 {row.cached_achievement_count}
                        </span>
                      ) : null}
                    </div>
                    {row.cached_publisher ? (
                      <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                        {row.cached_publisher}
                      </p>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busyKey === row.id}
                  onClick={() => void handleRemove(row.id)}
                  title={isDe ? 'Von Watchlist entfernen' : 'Remove from watchlist'}
                  className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-400 hover:border-red-500/40 hover:text-red-300 cursor-pointer disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
