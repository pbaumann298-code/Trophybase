import React, { useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import {
  formatIntranetTitles,
  intranetGameHref,
  searchIntranetCreators,
} from '../../lib/intranetQueries';

const FIELD_CLASS =
  'bg-[#121314] border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#00ff66]/40 w-full';

function emptyFilters() {
  return {
    channelName: '',
    youtubeUrl: '',
    gameTitle: '',
    contentType: '',
  };
}

function IntranetCreatorSearch() {
  const [filters, setFilters] = useState(emptyFilters);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const updateField = (key) => (event) => {
    setFilters((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const runSearch = async (nextFilters) => {
    setLoading(true);
    setErrorMessage('');
    setHasSearched(true);

    const { data, error } = await searchIntranetCreators(supabase, nextFilters);
    if (error) {
      setErrorMessage(error.message || 'Suche fehlgeschlagen.');
      setResults([]);
    } else {
      setResults(data);
    }
    setLoading(false);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    runSearch(filters);
  };

  const handleReset = () => {
    setFilters(emptyFilters());
    setResults([]);
    setHasSearched(false);
    setErrorMessage('');
  };

  const mappedCount = results.reduce((sum, creator) => sum + creator.games.length, 0);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Creator</h2>
        <p className="text-sm text-zinc-500 max-w-3xl leading-relaxed">
          Zeigt über <span className="text-zinc-400 font-mono">game_creator_map</span>, welche
          Spiele an welchen Creator hängen — inklusive Status aus der Datenbank. Ohne Filter:
          alle Zuordnungen.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-800 bg-[#1a1b1c] p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
            channel_name
          </span>
          <input
            type="text"
            value={filters.channelName}
            onChange={updateField('channelName')}
            autoComplete="off"
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
            youtube_url
          </span>
          <input
            type="text"
            value={filters.youtubeUrl}
            onChange={updateField('youtubeUrl')}
            autoComplete="off"
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
            Spieltitel
          </span>
          <input
            type="text"
            value={filters.gameTitle}
            onChange={updateField('gameTitle')}
            autoComplete="off"
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
            content_type
          </span>
          <select
            value={filters.contentType}
            onChange={updateField('contentType')}
            className={FIELD_CLASS}
          >
            <option value="">Alle</option>
            <option value="VIDEO">VIDEO</option>
          </select>
        </label>

        <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-2 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-[#00ff66] text-[#121314] text-xs font-bold uppercase tracking-wider hover:bg-[#00dd55] disabled:opacity-50"
          >
            {loading ? 'Suche…' : 'Suchen'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-xs font-bold uppercase tracking-wider hover:text-white"
          >
            Zurücksetzen
          </button>
        </div>
      </form>

      {errorMessage ? (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
          {errorMessage}
        </p>
      ) : null}

      {hasSearched && !loading && (
        <p className="text-[11px] font-mono text-zinc-500">
          {results.length} Creator · {mappedCount} Spiel-Zuordnungen
        </p>
      )}

      <div className="space-y-4">
        {results.map((creator) => (
          <article
            key={creator.id || creator.channelName}
            className="rounded-2xl border border-zinc-800 bg-[#1a1b1c] overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">{creator.channelName || '—'}</h3>
                <p className="text-[11px] font-mono text-zinc-600 mt-0.5 break-all">
                  {creator.youtubeUrl || 'kein YouTube-Link'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  {creator.games.length} Spiel{creator.games.length === 1 ? '' : 'e'}
                </span>
                {creator.youtubeUrl ? (
                  <a
                    href={creator.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-lg bg-[#ff0000] text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 hover:bg-[#e00000]"
                  >
                    YouTube
                  </a>
                ) : null}
              </div>
            </div>

            {creator.games.length === 0 ? (
              <p className="px-5 py-4 text-sm text-zinc-500">Keine Spiele zugeordnet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-5 py-2 font-medium">content_type</th>
                      <th className="px-3 py-2 font-medium">spieltitel</th>
                      <th className="px-3 py-2 font-medium">hardware</th>
                      <th className="px-3 py-2 font-medium">status</th>
                      <th className="px-3 py-2 font-medium">spiel_typ</th>
                      <th className="px-3 py-2 font-medium">platform_game_id</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {creator.games.map((game) => {
                      const href = intranetGameHref(game);
                      return (
                        <tr key={`${creator.id}-${game.id}-${game.contentType}`} className="border-t border-zinc-800/80">
                          <td className="px-5 py-2 font-mono text-[#00ff66]/90 whitespace-nowrap">
                            {game.contentType || '—'}
                          </td>
                          <td className="px-3 py-2 text-zinc-200 max-w-[20rem]">
                            {formatIntranetTitles(game.spieltitel)}
                          </td>
                          <td className="px-3 py-2 text-sky-300 whitespace-nowrap">{game.hardware || '—'}</td>
                          <td className="px-3 py-2 font-mono text-zinc-400 whitespace-nowrap">
                            {game.status || '—'}
                          </td>
                          <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{game.spiel_typ || '—'}</td>
                          <td className="px-3 py-2 font-mono text-zinc-600 whitespace-nowrap">
                            {game.platform_game_id || '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-bold uppercase tracking-wider text-[#00ff66] hover:underline"
                              >
                                Öffnen
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        ))}
      </div>

      {hasSearched && !loading && results.length === 0 && !errorMessage && (
        <p className="text-sm text-zinc-500">Keine Creator-Zuordnungen gefunden.</p>
      )}
    </section>
  );
}

export default IntranetCreatorSearch;
