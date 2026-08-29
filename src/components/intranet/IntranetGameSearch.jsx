import React, { useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import {
  INTRANET_GAME_LIMIT,
  formatIntranetTitles,
  intranetGameHref,
  searchIntranetGames,
} from '../../lib/intranetQueries';

const FIELD_CLASS =
  'bg-[#121314] border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#00ff66]/40 w-full';

function emptyFilters() {
  return {
    title: '',
    ecosystem: '',
    hardware: '',
    platformGameId: '',
    releaseYear: '',
    upcomingDate: '',
    developer: '',
    genre: '',
    gameType: '',
    status: '',
  };
}

function Field({ id, label, value, onChange, placeholder = '', type = 'text' }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="off"
        className={FIELD_CLASS}
      />
    </label>
  );
}

function IntranetGameSearch() {
  const [filters, setFilters] = useState(emptyFilters);
  const [results, setResults] = useState([]);
  const [count, setCount] = useState(0);
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

    const { data, count: total, error } = await searchIntranetGames(supabase, nextFilters);
    if (error) {
      setErrorMessage(error.message || 'Suche fehlgeschlagen.');
      setResults([]);
      setCount(0);
    } else {
      setResults(data);
      setCount(total);
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
    setCount(0);
    setHasSearched(false);
    setErrorMessage('');
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Spiele</h2>
        <p className="text-sm text-zinc-500 max-w-3xl leading-relaxed">
          Komplette <span className="text-zinc-400 font-mono">games</span>-Tabelle, ohne Filter
          nach Veröffentlichung. Leere Felder werden ignoriert. Ohne jedes Feld: bis zu{' '}
          {INTRANET_GAME_LIMIT} Einträge.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-800 bg-[#1a1b1c] p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <Field id="in-title" label="spieltitel" value={filters.title} onChange={updateField('title')} placeholder="DE / EN / ES" />
        <Field id="in-eco" label="ecosystem" value={filters.ecosystem} onChange={updateField('ecosystem')} />
        <Field id="in-hw" label="hardware" value={filters.hardware} onChange={updateField('hardware')} placeholder="PS4, PS5…" />
        <Field id="in-npwr" label="platform_game_id" value={filters.platformGameId} onChange={updateField('platformGameId')} placeholder="NPWR…" />
        <Field id="in-year" label="release_jahr" value={filters.releaseYear} onChange={updateField('releaseYear')} placeholder="2015" />
        <Field id="in-up" label="upcoming_date" value={filters.upcomingDate} onChange={updateField('upcomingDate')} />
        <Field id="in-dev" label="entwickler" value={filters.developer} onChange={updateField('developer')} />
        <Field id="in-genre" label="genre" value={filters.genre} onChange={updateField('genre')} />
        <Field id="in-type" label="spiel_typ" value={filters.gameType} onChange={updateField('gameType')} />
        <Field id="in-status" label="status" value={filters.status} onChange={updateField('status')} />

        <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-2 pt-1">
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
          {count} Treffer{results.length < count ? ` · ${results.length} angezeigt` : ''}
        </p>
      )}

      {hasSearched && results.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-[#121314] text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">spieltitel</th>
                <th className="px-3 py-2.5 font-medium">ecosystem</th>
                <th className="px-3 py-2.5 font-medium">hardware</th>
                <th className="px-3 py-2.5 font-medium">platform_game_id</th>
                <th className="px-3 py-2.5 font-medium">release_jahr</th>
                <th className="px-3 py-2.5 font-medium">upcoming_date</th>
                <th className="px-3 py-2.5 font-medium">entwickler</th>
                <th className="px-3 py-2.5 font-medium">genre</th>
                <th className="px-3 py-2.5 font-medium">spiel_typ</th>
                <th className="px-3 py-2.5 font-medium">status</th>
                <th className="px-3 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((game) => {
                const href = intranetGameHref(game);
                return (
                  <tr key={game.id} className="border-t border-zinc-800/80 odd:bg-[#1a1b1c] even:bg-[#161718]">
                    <td className="px-3 py-2 text-zinc-200 max-w-[18rem]">{formatIntranetTitles(game.spieltitel)}</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{game.ecosystem || '—'}</td>
                    <td className="px-3 py-2 text-sky-300 whitespace-nowrap">{game.hardware || '—'}</td>
                    <td className="px-3 py-2 font-mono text-zinc-500 whitespace-nowrap">{game.platform_game_id || '—'}</td>
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{game.release_jahr || '—'}</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{game.upcoming_date || '—'}</td>
                    <td className="px-3 py-2 text-zinc-300 max-w-[12rem]">{game.entwickler || '—'}</td>
                    <td className="px-3 py-2 text-zinc-400 max-w-[12rem]">{game.genre || '—'}</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{game.spiel_typ || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#00ff66]/90">
                        {game.status || '—'}
                      </span>
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
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasSearched && !loading && results.length === 0 && !errorMessage && (
        <p className="text-sm text-zinc-500">Keine Spiele gefunden.</p>
      )}
    </section>
  );
}

export default IntranetGameSearch;
