import { useMemo, useRef, useState } from 'react';
import { getGameTitle, getGameUuid } from '../../lib/gameModel';
import {
  buildCreatorShowcaseSections,
  detectCreatorSeriesSuggestions,
  gameMatchesShelf,
  normalizeShowcaseConfig,
} from '../../lib/creatorShowcaseModel';

function moveArrayItem(list, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  const [picked] = copy.splice(index, 1);
  copy.splice(target, 0, picked);
  return copy;
}

export default function CreatorShowcaseBuilder({
  games = [],
  initialConfig = {},
  creatorName = '',
  locale = 'de',
  saving = false,
  saveNotice = '',
  saveError = '',
  onPreviewChange,
  onSave,
}) {
  const isDe = locale === 'de';
  const [draft, setDraft] = useState(() => normalizeShowcaseConfig(initialConfig));
  const [newShelfTitle, setNewShelfTitle] = useState('');
  const [newShelfQuery, setNewShelfQuery] = useState('');
  const [expandedShelfId, setExpandedShelfId] = useState('');
  const [shelfGameFilter, setShelfGameFilter] = useState('');
  const shelfSeqRef = useRef(1);

  const applyNext = (updater) => {
    setDraft((prev) => {
      const next = normalizeShowcaseConfig(typeof updater === 'function' ? updater(prev) : updater);
      onPreviewChange?.(next);
      return next;
    });
  };

  const suggestions = useMemo(
    () => detectCreatorSeriesSuggestions(games, locale, draft.pinnedShelves),
    [games, locale, draft.pinnedShelves],
  );

  const previewSections = useMemo(
    () => buildCreatorShowcaseSections(games, draft, locale),
    [games, draft, locale],
  );

  const addShelf = (titleRaw, queryRaw = '') => {
    const title = String(titleRaw ?? '').trim();
    const matchQuery = String(queryRaw || titleRaw || '').trim();
    if (!title && !matchQuery) return;
    const seq = shelfSeqRef.current;
    shelfSeqRef.current += 1;
    const slugPart = (title || matchQuery)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24);
    const id = `shelf_${slugPart || 'custom'}_${draft.pinnedShelves.length + seq}`;
    applyNext((prev) => ({
      ...prev,
      pinnedShelves: [
        ...prev.pinnedShelves,
        { id, title: title || matchQuery, matchQuery, tagSlug: '', gameIds: [] },
      ],
    }));
    setNewShelfTitle('');
    setNewShelfQuery('');
  };

  const toggleGameInShelf = (shelfId, gameId) => {
    if (!gameId) return;
    applyNext((prev) => ({
      ...prev,
      pinnedShelves: prev.pinnedShelves.map((shelf) => {
        if (shelf.id !== shelfId) return shelf;
        const exists = shelf.gameIds.includes(gameId);
        return {
          ...shelf,
          gameIds: exists
            ? shelf.gameIds.filter((id) => id !== gameId)
            : [...shelf.gameIds, gameId],
        };
      }),
    }));
  };

  const moveGenre = (genreSlug, delta) => {
    const currentOrder = previewSections.genreRows.map((row) => row.genreSlug);
    const idx = currentOrder.indexOf(genreSlug);
    if (idx < 0) return;
    const reordered = moveArrayItem(currentOrder, idx, delta);
    applyNext((prev) => ({ ...prev, genreOrder: reordered }));
  };

  return (
    <div className="mb-6 rounded-2xl border border-[#00ff66]/35 bg-[#111513] p-4 sm:p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/80 pb-3.5">
        <div>
          <h3 className="text-sm font-bold text-white">
            🎨 Build your TrophyBase · {isDe ? 'Deine öffentliche Seiten-Struktur' : 'Your Public Page Layout'}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            {isDe
              ? 'Pinne deine wichtigsten Spielereihen ganz nach oben und lege fest, wie Besucher deine restlichen Guides sehen (z. B. nach Genre oder A–Z).'
              : 'Pin your top game franchises at the top and choose how visitors browse your remaining guides (by genre or A–Z).'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave?.(draft)}
            className="rounded-xl bg-[#00ff66] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#121314] hover:bg-[#00ff66]/90 disabled:opacity-50 cursor-pointer"
          >
            {saving
              ? isDe
                ? 'Speichere…'
                : 'Saving…'
              : isDe
                ? '💾 Ansicht für Besucher speichern'
                : '💾 Save public layout'}
          </button>
        </div>
      </div>

      {saveNotice ? <p className="text-xs font-medium text-[#00ff66]">{saveNotice}</p> : null}
      {saveError ? <p className="text-xs text-red-300">{saveError}</p> : null}

      {/* 1. Eigene Top-Reihen / Franchises */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-200">
            1. {isDe ? 'Angepinnte Top-Reihen (ganz oben)' : 'Pinned Top Rows'}
          </span>
          <span className="text-[11px] font-mono text-zinc-500">
            {draft.pinnedShelves.length} {isDe ? 'aktiv' : 'active'}
          </span>
        </div>

        {suggestions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono text-zinc-400 mr-1">
              {isDe ? 'Erkannte Reihen:' : 'Detected series:'}
            </span>
            {suggestions.map((sug) => (
              <button
                key={sug.title}
                type="button"
                onClick={() => addShelf(sug.title, sug.matchQuery)}
                className="rounded-lg border border-zinc-700 bg-zinc-900/90 px-2.5 py-1 text-[11px] font-mono text-zinc-200 hover:border-[#00ff66]/50 hover:text-[#00ff66] cursor-pointer transition"
              >
                + {sug.title} ({sug.count})
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newShelfTitle}
            onChange={(e) => setNewShelfTitle(e.target.value)}
            placeholder={
              isDe
                ? 'Reihen-Titel, z. B. Five Nights at Freddy’s oder Assassin’s Creed…'
                : 'Row title, e.g. Five Nights at Freddy’s or Assassin’s Creed…'
            }
            className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-[#0b0d0c] px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-[#00ff66]/60 focus:outline-hidden"
          />
          <input
            type="text"
            value={newShelfQuery}
            onChange={(e) => setNewShelfQuery(e.target.value)}
            placeholder={
              isDe
                ? 'Suchbegriff (leer = wie Titel)'
                : 'Match keyword (optional, defaults to title)'
            }
            className="sm:w-56 rounded-xl border border-zinc-700 bg-[#0b0d0c] px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-[#00ff66]/60 focus:outline-hidden"
          />
          <button
            type="button"
            disabled={!newShelfTitle.trim() && !newShelfQuery.trim()}
            onClick={() => addShelf(newShelfTitle, newShelfQuery)}
            className="shrink-0 rounded-xl border border-[#00ff66]/45 bg-[#00ff66]/15 px-3.5 py-2 text-xs font-mono font-bold text-[#00ff66] hover:bg-[#00ff66]/25 disabled:opacity-40 cursor-pointer"
          >
            + {isDe ? 'Reihe anlegen' : 'Add row'}
          </button>
        </div>

        {draft.pinnedShelves.length > 0 ? (
          <div className="space-y-2">
            {draft.pinnedShelves.map((shelf, idx) => {
              const matchedCount = games.filter((g) => gameMatchesShelf(g, shelf)).length;
              const isExpanded = expandedShelfId === shelf.id;
              const filteredPickerGames = games.filter((g) => {
                if (!shelfGameFilter.trim()) return true;
                return getGameTitle(g, locale)
                  .toLowerCase()
                  .includes(shelfGameFilter.toLowerCase().trim());
              });

              return (
                <div
                  key={shelf.id}
                  className="rounded-xl border border-zinc-800 bg-[#0b0d0c] p-2.5 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs font-mono text-[#00ff66]">#{idx + 1}</span>
                      <input
                        type="text"
                        value={shelf.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          applyNext((prev) => ({
                            ...prev,
                            pinnedShelves: prev.pinnedShelves.map((s) =>
                              s.id === shelf.id ? { ...s, title: val } : s,
                            ),
                          }));
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-xs font-bold text-white focus:border-[#00ff66]/50 focus:outline-hidden"
                      />
                      <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-mono text-zinc-300">
                        {matchedCount} {isDe ? 'Spiele' : 'games'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedShelfId(isExpanded ? '' : shelf.id);
                          setShelfGameFilter('');
                        }}
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-mono text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66] cursor-pointer"
                      >
                        {isExpanded
                          ? isDe
                            ? 'Spiele schließen'
                            : 'Hide picker'
                          : isDe
                            ? '+ Einzelspiele wählen'
                            : '+ Pick games'}
                      </button>
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() =>
                          applyNext((prev) => ({
                            ...prev,
                            pinnedShelves: moveArrayItem(prev.pinnedShelves, idx, -1),
                          }))
                        }
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:text-white disabled:opacity-30 cursor-pointer"
                        title={isDe ? 'Nach oben' : 'Move up'}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={idx === draft.pinnedShelves.length - 1}
                        onClick={() =>
                          applyNext((prev) => ({
                            ...prev,
                            pinnedShelves: moveArrayItem(prev.pinnedShelves, idx, 1),
                          }))
                        }
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:text-white disabled:opacity-30 cursor-pointer"
                        title={isDe ? 'Nach unten' : 'Move down'}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          applyNext((prev) => ({
                            ...prev,
                            pinnedShelves: prev.pinnedShelves.filter((s) => s.id !== shelf.id),
                          }))
                        }
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-400 hover:border-red-500/40 hover:text-red-300 cursor-pointer"
                        title={isDe ? 'Reihe löschen' : 'Remove row'}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="border-t border-zinc-800/80 pt-2 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={shelf.matchQuery}
                          onChange={(e) => {
                            const val = e.target.value;
                            applyNext((prev) => ({
                              ...prev,
                              pinnedShelves: prev.pinnedShelves.map((s) =>
                                s.id === shelf.id ? { ...s, matchQuery: val } : s,
                              ),
                            }));
                          }}
                          placeholder={isDe ? 'Automatischer Titel-/Publisher-Filter…' : 'Auto title/publisher keyword…'}
                          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-200 focus:border-[#00ff66]/40 focus:outline-hidden"
                        />
                        <input
                          type="search"
                          value={shelfGameFilter}
                          onChange={(e) => setShelfGameFilter(e.target.value)}
                          placeholder={isDe ? 'Eigene Guides filtern…' : 'Filter own guides…'}
                          className="sm:w-52 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-200 focus:border-[#00ff66]/40 focus:outline-hidden"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                        {filteredPickerGames.slice(0, 90).map((g) => {
                          const gid = getGameUuid(g);
                          const gTitle = getGameTitle(g, locale);
                          const manualPicked = shelf.gameIds.includes(gid);
                          const autoMatched = !manualPicked && gameMatchesShelf(g, shelf);
                          return (
                            <button
                              key={gid || gTitle}
                              type="button"
                              onClick={() => toggleGameInShelf(shelf.id, gid)}
                              className={`flex items-center justify-between gap-1.5 rounded-lg border px-2 py-1 text-left text-[11px] cursor-pointer ${
                                manualPicked
                                  ? 'border-[#00ff66]/50 bg-[#00ff66]/15 text-white'
                                  : autoMatched
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                    : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              <span className="truncate">{gTitle}</span>
                              <span className="shrink-0 font-mono text-[10px]">
                                {manualPicked ? '✓ Pin' : autoMatched ? 'Auto' : '+'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* 2. Gruppierung der Einzeltitel darunter */}
      <div className="space-y-3 border-t border-zinc-800/80 pt-3.5">
        <span className="block text-xs font-mono font-bold uppercase tracking-wider text-zinc-200">
          2. {isDe ? 'Darstellung der restlichen Einzeltitel darunter' : 'Display of Remaining Single Titles'}
        </span>

        <div className="flex flex-wrap gap-2">
          {[
            {
              id: 'auto',
              label: isDe
                ? '✨ Automatisch (ab 9 Spielen nach Genre, darunter Kacheln)'
                : '✨ Auto (by genre for 9+ games)',
            },
            {
              id: 'by_genre',
              label: isDe ? '🎬 Nach Genre in Reihen (Netflix-Stil)' : '🎬 Rows by Genre (Netflix)',
            },
            {
              id: 'a_z',
              label: isDe ? '🔤 A–Z Katalog (Quickwins-Stil)' : '🔤 A–Z Catalog',
            },
            {
              id: 'grid',
              label: isDe ? '🔲 Kompakt-Raster' : '🔲 Compact Grid',
            },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => applyNext((prev) => ({ ...prev, restGrouping: opt.id }))}
              className={`rounded-xl border px-3 py-1.5 text-xs font-mono transition cursor-pointer ${
                draft.restGrouping === opt.id
                  ? 'border-[#00ff66]/60 bg-[#00ff66]/15 text-[#00ff66] font-bold'
                  : 'border-zinc-700 bg-[#0b0d0c] text-zinc-300 hover:border-zinc-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {(draft.restGrouping === 'by_genre' ||
          (draft.restGrouping === 'auto' &&
            (games.length > 8 || draft.pinnedShelves.length > 0))) &&
        previewSections.genreRows.length > 1 ? (
          <div className="space-y-1.5 pt-1">
            <span className="block text-[11px] font-mono text-zinc-400">
              {isDe
                ? 'Genre-Reihenfolge anpassen (↑ / ↓):'
                : 'Reorder genre rows (↑ / ↓):'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {previewSections.genreRows.map((row, idx) => (
                <div
                  key={row.genreSlug}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-[#0b0d0c] px-2 py-1 text-[11px] text-zinc-300"
                >
                  <span>
                    {row.title} ({row.games.length})
                  </span>
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveGenre(row.genreSlug, -1)}
                    className="px-1 text-zinc-400 hover:text-[#00ff66] disabled:opacity-30 cursor-pointer"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={idx === previewSections.genreRows.length - 1}
                    onClick={() => moveGenre(row.genreSlug, 1)}
                    className="px-1 text-zinc-400 hover:text-[#00ff66] disabled:opacity-30 cursor-pointer"
                  >
                    ↓
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
          <label className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-[#0b0d0c] p-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.dedupePinnedFromRest}
              onChange={(e) =>
                applyNext((prev) => ({ ...prev, dedupePinnedFromRest: e.target.checked }))
              }
              className="mt-0.5"
            />
            <span className="text-xs text-zinc-300 leading-snug">
              {isDe
                ? 'Spiele aus meinen angepinnten Top-Reihen unten bei den Einzeltiteln nicht doppelt anzeigen'
                : 'Do not repeat games from pinned top rows in the genre rows below'}
            </span>
          </label>

          <label className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-[#0b0d0c] p-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.linkFromGuides}
              onChange={(e) =>
                applyNext((prev) => ({ ...prev, linkFromGuides: e.target.checked }))
              }
              className="mt-0.5"
            />
            <span className="text-xs text-zinc-300 leading-snug">
              {isDe
                ? `Unter meinen Spiel-Guides („Weitere Guides von ${creatorName || 'mir'}“) direkt auf meine Creator-Seite verlinken`
                : `Link “More guides by ${creatorName || 'me'}” directly to my public creator page`}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
