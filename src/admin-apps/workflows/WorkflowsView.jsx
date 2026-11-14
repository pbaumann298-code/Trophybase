import { useState } from 'react';
import ScriptsPanel from '../../components/admin/ScriptsPanel';
import WebsitePanel from '../../components/admin/WebsitePanel';

const SAVED_GAME_KEY = 'tb_workflow_search_game';

function readSavedGame() {
  try {
    return localStorage.getItem(SAVED_GAME_KEY) || '';
  } catch {
    return '';
  }
}

export default function WorkflowsView() {
  const [gameQuery, setGameQuery] = useState(() => readSavedGame());
  const [trophyQuery, setTrophyQuery] = useState('');
  const [suffixMode, setSuffixMode] = useState('Collectibles');
  const [activeSection, setActiveSection] = useState('scripts'); // 'scripts' | 'stats'

  const handleGameChange = (val) => {
    setGameQuery(val);
    try {
      if (val.trim()) localStorage.setItem(SAVED_GAME_KEY, val);
      else localStorage.removeItem(SAVED_GAME_KEY);
    } catch {
      /* ignore */
    }
  };

  const combinedQuery = [gameQuery.trim(), trophyQuery.trim(), suffixMode.trim()]
    .filter(Boolean)
    .join(' ');

  const openSearchUrl = (baseUrl) => {
    if (!combinedQuery) return;
    window.open(baseUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Schneller Video- & Sammelobjekt-Finder ("App 3") */}
      <section className="rounded-2xl border border-amber-500/30 bg-[#131416] p-3.5 sm:p-4 flex flex-col gap-3 shadow-md">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-amber-300">
              Schnell-Recherche · App 3
            </p>
            <h2 className="text-sm sm:text-base font-bold text-white">
              🎬 Sammelobjekt- &amp; Trophäen-Video-Finder
            </h2>
          </div>
          {(gameQuery || trophyQuery) && (
            <button
              type="button"
              onClick={() => {
                handleGameChange('');
                setTrophyQuery('');
              }}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] font-mono text-zinc-400 hover:text-white cursor-pointer"
            >
              Leeren
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          <input
            type="text"
            value={gameQuery}
            onChange={(e) => handleGameChange(e.target.value)}
            placeholder="Spiel (bleibt gemerkt, z. B. Uncharted)…"
            className="sm:col-span-2 rounded-xl border border-zinc-700/80 bg-zinc-950 px-3 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
          />
          <input
            type="text"
            value={trophyQuery}
            onChange={(e) => setTrophyQuery(e.target.value)}
            placeholder="Trophäe / Kapitel / Boss (z. B. Schatzsucher)…"
            className="sm:col-span-2 rounded-xl border border-zinc-700/80 bg-zinc-950 px-3 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
          />
          <select
            value={suffixMode}
            onChange={(e) => setSuffixMode(e.target.value)}
            className="rounded-xl border border-zinc-700/80 bg-zinc-900 px-2.5 py-2 text-xs font-mono text-zinc-200 focus:border-amber-400 focus:outline-none"
          >
            <option value="Collectibles">Collectibles</option>
            <option value="Trophy Guide">Trophy Guide</option>
            <option value="All Locations">All Locations</option>
            <option value="Walkthrough">Walkthrough</option>
            <option value="">Ohne Zusatz</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!combinedQuery}
            onClick={() =>
              openSearchUrl(
                `https://www.youtube.com/results?search_query=${encodeURIComponent(combinedQuery)}`,
              )
            }
            className="rounded-xl bg-red-500/90 px-3.5 py-2 text-xs font-mono font-bold text-white hover:bg-red-500 disabled:opacity-40 transition cursor-pointer"
          >
            ▶ YouTube Suche
          </button>

          <button
            type="button"
            disabled={!combinedQuery}
            onClick={() =>
              openSearchUrl(
                `https://www.google.com/search?tbm=vid&q=${encodeURIComponent(combinedQuery)}`,
              )
            }
            className="rounded-xl border border-sky-500/40 bg-sky-500/15 px-3.5 py-2 text-xs font-mono font-bold text-sky-300 hover:bg-sky-500/25 disabled:opacity-40 transition cursor-pointer"
          >
            🔍 Google Videos
          </button>

          <button
            type="button"
            disabled={!combinedQuery}
            onClick={() =>
              openSearchUrl(
                `https://www.google.com/search?q=${encodeURIComponent(`${gameQuery.trim()} ${trophyQuery.trim()} site:psnprofiles.com OR site:powerpyx.com`)}`,
              )
            }
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-mono text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-40 transition cursor-pointer"
          >
            🏆 PSNProfiles / PowerPyx
          </button>

          {combinedQuery && (
            <span className="truncate text-[11px] font-mono text-zinc-500">
              Query: „{combinedQuery}“
            </span>
          )}
        </div>
      </section>

      {/* 2. Umschalter Skripte vs. Live-Website-Metriken */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setActiveSection('scripts')}
          className={`rounded-xl border px-3 py-1.5 text-xs font-mono font-bold transition cursor-pointer ${
            activeSection === 'scripts'
              ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          ⚙️ Pipeline-Skripte
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('stats')}
          className={`rounded-xl border px-3 py-1.5 text-xs font-mono font-bold transition cursor-pointer ${
            activeSection === 'stats'
              ? 'border-[#00ff66]/50 bg-[#00ff66]/15 text-[#00ff66]'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          📊 Website &amp; Aufrufe
        </button>
      </div>

      <div className={activeSection === 'scripts' ? 'block' : 'hidden'}>
        <ScriptsPanel />
      </div>
      {activeSection === 'stats' && <WebsitePanel />}
    </div>
  );
}
