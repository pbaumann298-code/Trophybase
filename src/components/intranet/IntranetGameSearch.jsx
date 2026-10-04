import { useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import { GAME_TYPE } from '../../lib/gameSchema';
import { INTRANET_GAME_LIMIT, INTRANET_GAME_TYPE_EMPTY, searchIntranetGames } from '../../lib/intranetQueries';
import { PIPELINE_PRESETS, PIPELINE_STATUS_KEYS, STATUS_FILTER_MODES } from '../../lib/gamePipelineStatus';
import IntranetGameTable from './IntranetGameTable';

const FIELD_CLASS =
  'bg-[#121314] border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-hidden focus:border-[#00ff66]/40 w-full';

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
    preset: '',
    statusKey: '',
    statusMode: 'eq',
    statusValue: '',
  };
}

function Field({ id, label, value, onChange, placeholder = '', type = 'text', disabled = false }) {
  return (
    <label className={`flex flex-col gap-1.5 min-w-0 ${disabled ? 'opacity-50' : ''}`}>
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
        disabled={disabled}
        className={FIELD_CLASS}
      />
    </label>
  );
}

function IntranetGameSearch({ sessionUser }) {
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
          nach Veröffentlichung. Spieltyp, Home-Tags und einzelne Status-Werte lassen sich direkt
          in der Zeile ändern. Die Tags kommen aus <span className="text-zinc-400 font-mono">home_tag_defs</span>.
          Leere Felder werden ignoriert. Ohne jedes Feld: bis zu {INTRANET_GAME_LIMIT} Einträge.
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
        <Field id="in-dev" label="entwickler / publisher" value={filters.developer} onChange={updateField('developer')} />
        <Field id="in-genre" label="genre" value={filters.genre} onChange={updateField('genre')} />
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
            spiel_typ
          </span>
          <select
            id="in-type"
            value={filters.gameType}
            onChange={updateField('gameType')}
            className={FIELD_CLASS}
          >
            <option value="">Alle Typen</option>
            {Object.values(GAME_TYPE).map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
            <option value={INTRANET_GAME_TYPE_EMPTY}>Leer</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5 min-w-0 sm:col-span-2 lg:col-span-3">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
            Pipeline hängt
          </span>
          <div className="flex flex-wrap gap-2">
            {PIPELINE_PRESETS.filter((preset) => preset.id).map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.hint}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    preset: prev.preset === preset.id ? '' : preset.id,
                  }))
                }
                className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider border ${
                  filters.preset === preset.id
                    ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66]'
                    : 'border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </label>

        <label className="flex flex-col gap-1.5 min-w-0">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
            status-schlüssel
          </span>
          <select
            id="in-status-key"
            value={filters.statusKey}
            onChange={updateField('statusKey')}
            className={FIELD_CLASS}
          >
            <option value="">Alle Schlüssel</option>
            {PIPELINE_STATUS_KEYS.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
            status-vergleich
          </span>
          <select
            id="in-status-mode"
            value={filters.statusMode}
            onChange={updateField('statusMode')}
            className={FIELD_CLASS}
          >
            {STATUS_FILTER_MODES.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>
        <Field
          id="in-status-val"
          label="status-wert"
          value={filters.statusValue}
          onChange={updateField('statusValue')}
          placeholder={filters.statusMode === 'missing' ? 'wird bei „fehlt“ ignoriert' : 'DISCOVERED, PROCESSED, FERTIG…'}
          disabled={filters.statusMode === 'missing'}
        />

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
        <IntranetGameTable
          games={results}
          sessionUser={sessionUser}
          onGamePatch={(gameId, partial) => {
            setResults((prev) => prev.map((game) => (
              game.id === gameId ? { ...game, ...partial } : game
            )));
          }}
        />
      )}

      {hasSearched && !loading && results.length === 0 && !errorMessage && (
        <p className="text-sm text-zinc-500">Keine Spiele gefunden.</p>
      )}
    </section>
  );
}

export default IntranetGameSearch;
