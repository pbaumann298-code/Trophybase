import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import { getGameCover, getGameTitle } from '../../lib/gameModel';
import { translateHomeTag } from '../../lib/homeTagDefs';
import { searchUnifiedCatalog } from '../../lib/creatorQueries';

function resolvePlatformBadge(item) {
  const src = item?.source_platform;
  if (src === 'steam') {
    return {
      label: item.steam_app_id ? `Steam #${item.steam_app_id}` : 'Steam',
      cls: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    };
  }
  if (src === 'xbox') {
    return {
      label: 'Xbox',
      cls: 'border-lime-500/40 bg-lime-500/15 text-lime-300',
    };
  }
  return {
    label: item?.hardware || 'PS5/PS4',
    cls: 'border-sky-500/35 bg-sky-500/10 text-sky-300',
  };
}

function resolveNpwrLabel(item) {
  if (item?.source_platform === 'steam') return '';
  if (item?.source_platform === 'xbox') return item?.xbox_title_id ? String(item.xbox_title_id) : '';
  const raw = item?.platform_game_id;
  if (Array.isArray(raw) && raw.length > 0) return String(raw[0] || '');
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return '';
}

export default function UnifiedGameSearchField({
  locale = 'de',
  onlyWithoutGuide = false,
  requireGamesEntry = false,
  limit = 25,
  placeholder = '',
  selectedTargetKey = '',
  disabledTargetKeys = null,
  actionLabel = '',
  addedLabel = '',
  clearOnSelect = false,
  autoFocus = false,
  compact = false,
  onSelect,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [error, setError] = useState('');
  const reqSeqRef = useRef(0);

  const defaultPlaceholder =
    locale === 'de'
      ? onlyWithoutGuide
        ? 'Spiele ohne Guide suchen (Titel, Publisher, Genre, Steam, Xbox)…'
        : 'Spiel, Publisher, Genre, NPWR oder Steam/Xbox suchen…'
      : onlyWithoutGuide
        ? 'Search games without guide (title, publisher, genre, Steam, Xbox)…'
        : 'Search game, publisher, genre, NPWR, Steam or Xbox…';

  const runSearch = async (rawText) => {
    const trimmed = String(rawText ?? '').trim();
    if (trimmed.length < 2) {
      reqSeqRef.current += 1;
      setResults([]);
      setLoading(false);
      setSearchedOnce(false);
      setError('');
      return;
    }

    const seq = ++reqSeqRef.current;
    setLoading(true);
    setError('');
    const { data, error: rpcErr } = await searchUnifiedCatalog(supabase, trimmed, {
      onlyWithoutGuide,
      limit,
    });
    if (seq !== reqSeqRef.current) return;
    setLoading(false);
    setSearchedOnce(true);
    if (rpcErr) {
      setResults([]);
      setError(rpcErr.message || 'Suche fehlgeschlagen.');
      return;
    }
    setResults(data);
  };

  const handleQueryChange = (nextVal) => {
    setQuery(nextVal);
    if (String(nextVal ?? '').trim().length < 2) {
      reqSeqRef.current += 1;
      setResults([]);
      setLoading(false);
      setSearchedOnce(false);
      setError('');
    }
  };

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void runSearch(trimmed);
    }, 240);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, onlyWithoutGuide, limit]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void runSearch(query);
    } else if (event.key === 'Escape' && query) {
      event.preventDefault();
      handleQueryChange('');
    }
  };

  const disabledSet = disabledTargetKeys instanceof Set ? disabledTargetKeys : null;

  return (
    <div className="w-full min-w-0">
      <div className="relative flex items-center">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 text-xs text-zinc-500 select-none"
        >
          🔍
        </span>
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || defaultPlaceholder}
          className={`w-full rounded-xl border border-zinc-700/90 bg-[#0d0e10] pl-8 pr-8 ${
            compact ? 'py-1.5 text-[11px]' : 'py-2 text-xs'
          } text-zinc-100 placeholder-zinc-500 focus:border-[#00ff66]/70 focus:outline-hidden transition`}
        />
        {loading ? (
          <span className="absolute right-3 text-[10px] font-mono text-[#00ff66] animate-pulse">
            …
          </span>
        ) : query ? (
          <button
            type="button"
            onClick={() => handleQueryChange('')}
            aria-label={locale === 'de' ? 'Suche leeren' : 'Clear search'}
            className="absolute right-2.5 rounded px-1 text-xs text-zinc-500 hover:text-zinc-200 cursor-pointer"
          >
            ✕
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-1.5 text-[11px] text-red-400">{error}</p> : null}

      {query.trim().length >= 2 && (results.length > 0 || (searchedOnce && !loading)) ? (
        <div className="mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-zinc-800 bg-[#0c0d0f]/95 divide-y divide-zinc-800/70 shadow-xl">
          {results.length === 0 ? (
            <p className="px-3 py-2.5 text-xs font-mono text-zinc-500">
              {locale === 'de' ? 'Keine passenden Spiele gefunden.' : 'No matching games found.'}
            </p>
          ) : (
            results.map((item) => {
              const targetKey =
                item.target_key ||
                `${item.source_platform || 'psn'}:${item.id || item.steam_app_id || item.xbox_title_id}`;
              const title = item.title || getGameTitle(item, locale);
              const cover = getGameCover(item, locale);
              const badge = resolvePlatformBadge(item);
              const npwr = resolveNpwrLabel(item);
              const studio = item.publisher || item.entwickler || '';
              const genreLabels = Array.isArray(item.home_tags)
                ? item.home_tags
                    .slice(0, 2)
                    .map((slug) => translateHomeTag(slug, locale))
                    .filter(Boolean)
                : [];
              const isAlreadyAdded = Boolean(disabledSet && disabledSet.has(targetKey));
              const isSelected = Boolean(
                selectedTargetKey &&
                  (selectedTargetKey === targetKey ||
                    (item.id && selectedTargetKey === String(item.id))),
              );
              const missingMaster = Boolean(requireGamesEntry && !item.id);
              const rowDisabled = isAlreadyAdded || missingMaster;

              return (
                <div
                  key={targetKey}
                  onClick={() => {
                    if (rowDisabled) return;
                    onSelect?.(item);
                    if (clearOnSelect) handleQueryChange('');
                  }}
                  className={`flex items-center justify-between gap-2.5 px-2.5 py-2 transition ${
                    isSelected
                      ? 'bg-[#00ff66]/15 border-l-4 border-l-[#00ff66] text-white'
                      : rowDisabled
                        ? 'opacity-60 cursor-default text-zinc-400'
                        : 'cursor-pointer hover:bg-zinc-800/60 text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        loading="lazy"
                        className="h-10 w-8 shrink-0 rounded object-cover bg-zinc-800"
                      />
                    ) : (
                      <div className="h-10 w-8 shrink-0 rounded bg-zinc-800 flex items-center justify-center text-xs">
                        🎮
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="truncate text-xs font-bold text-white">{title}</span>
                        <span
                          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono leading-none ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                        {item.source_platform === 'psn' && item.steam_app_id ? (
                          <span className="inline-flex items-center rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono leading-none text-emerald-300">
                            +Steam
                          </span>
                        ) : null}
                        {item.source_platform === 'psn' && item.xbox_title_id ? (
                          <span className="inline-flex items-center rounded border border-lime-500/30 bg-lime-500/10 px-1.5 py-0.5 text-[10px] font-mono leading-none text-lime-300">
                            +Xbox
                          </span>
                        ) : null}
                        {!onlyWithoutGuide && item.is_published ? (
                          <span className="inline-flex items-center rounded border border-[#00ff66]/35 bg-[#00ff66]/10 px-1.5 py-0.5 text-[10px] font-mono leading-none text-[#00ff66]">
                            Guide
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-0.5 truncate text-[10px] font-mono text-zinc-400">
                        {[
                          studio,
                          genreLabels.join(', '),
                          npwr,
                          item.anzahl_trophaeen != null ? `🏆 ${item.anzahl_trophaeen}` : '',
                          missingMaster
                            ? locale === 'de'
                              ? 'Noch nicht mit Master-Spiel verknüpft'
                              : 'Not yet linked to master game'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>

                  {actionLabel || isAlreadyAdded ? (
                    <button
                      type="button"
                      disabled={rowDisabled}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (rowDisabled) return;
                        onSelect?.(item);
                        if (clearOnSelect) handleQueryChange('');
                      }}
                      className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-mono font-bold transition ${
                        isAlreadyAdded
                          ? 'border-zinc-700 bg-zinc-900 text-zinc-400 cursor-default'
                          : 'border-[#00ff66]/45 bg-[#00ff66]/15 text-[#00ff66] hover:bg-[#00ff66]/25 cursor-pointer'
                      }`}
                    >
                      {isAlreadyAdded
                        ? addedLabel || (locale === 'de' ? '✓ Gemerkt' : '✓ Saved')
                        : actionLabel}
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
