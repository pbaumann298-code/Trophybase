import React from 'react';

const SCRIPT_PHASES = [
  {
    id: 'import',
    title: 'Daten-Import',
    phase: 'Phase 1',
    status: 'planned',
    description: 'Trophäen, Guides und Bosse aus lokalen CSV/JSON in Supabase importieren.',
    scripts: ['import_trophies.py', 'import_guides.py', 'import_bosses.py'],
  },
  {
    id: 'qa',
    title: 'Gemini QA-Batch',
    phase: 'Phase 2',
    status: 'planned',
    description: 'Automatische Qualitätsprüfung und Vorschläge für community_reports.',
    scripts: ['gemini_qa_batch.py', 'sync_qa_dashboard.py'],
  },
  {
    id: 'media',
    title: 'Medien & Icons',
    phase: 'Phase 3',
    status: 'planned',
    description: 'Icon-URLs, Cover und Video-Links synchronisieren.',
    scripts: ['fetch_trophy_icons.py', 'validate_video_urls.py'],
  },
  {
    id: 'github',
    title: 'GitHub Actions',
    phase: 'Phase 4',
    status: 'future',
    description: 'Skripte aus dem Repo auslösen und Logs im Admin anzeigen (geplant).',
    scripts: ['workflow: admin-run-scripts.yml'],
  },
];

function statusBadge(status) {
  if (status === 'future') {
    return 'bg-purple-500/10 text-purple-400 border-purple-500/25';
  }
  return 'bg-zinc-800 text-zinc-400 border-zinc-700';
}

function ScriptsPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Lokale Skripte</h2>
        <p className="text-sm text-zinc-500">
          Übersicht für deine Pipeline-Skripte. Ausführung vom Admin-Panel folgt, sobald die
          Skripte im GitHub-Repo liegen (Vercel/Edge Functions oder GitHub Actions).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SCRIPT_PHASES.map((block) => (
          <article
            key={block.id}
            className="rounded-2xl border border-zinc-800 bg-[#1a1b1c] p-5 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  {block.phase}
                </p>
                <h3 className="text-sm font-bold text-[#00ff66] font-mono">{block.title}</h3>
              </div>
              <span
                className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded border ${statusBadge(block.status)}`}
              >
                {block.status === 'future' ? 'Geplant' : 'Vorbereitet'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">{block.description}</p>
            <ul className="text-[11px] font-mono text-zinc-500 space-y-1">
              {block.scripts.map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="text-zinc-600">▸</span>
                  {s}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled
              className="mt-auto text-xs font-mono uppercase px-3 py-2 rounded-lg border border-zinc-800 text-zinc-600 cursor-not-allowed"
            >
              Ausführen (demnächst)
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

export default ScriptsPanel;
