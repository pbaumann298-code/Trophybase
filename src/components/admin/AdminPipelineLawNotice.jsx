import { useState } from 'react';

/**
 * Pipeline-Gesetz (Admin-Gate) – Architektur-Notiz für Admin-UI, Cursor und Repomix.
 *
 * Diese drei Regeln gelten für die gesamte Publishing-Pipeline
 * (`games.status->>'guide_<lang>'`, `tb_check_and_publish_locale`,
 * `tb_auto_release_locales`, Sitemap, Hubs). Siehe auch
 * `.cursor/rules/SUPABASE_SCHEMA.mdc`, „Regel 0“.
 *
 * 1. Admin-Gate: Jedes Spiel mit `PUBLISHED` in IRGENDEINER Sprache wurde vom Admin
 *    persönlich gesichtet oder über ein zu 99 % verifiziertes, deterministisches
 *    Creator-Schema abgenommen. `PUBLISHED` wird nie automatisch zurückgenommen.
 *
 * 2. Keine Geister-Spiele: 0 Zeilen in `game_guides` bei einem `PUBLISHED`-Spiel sind
 *    KEIN Bug. Das Spiel braucht keinen Schritt-für-Schritt-Guide (In-Game-Selbstläufer,
 *    reine Trophäen-Tipps in `game_achievements.guide_tip` / `"Guide-Tip-lang"`, Erklärung
 *    in `games.beschreibung` / `status_explanation_localized`). Niemals `guide_rows > 0`
 *    als Blocker einbauen.
 *
 * 3. Quellsprache sprachagnostisch: Erst-Freigabe kann `de`, `en`, `es`, `pt` oder jede
 *    andere Sprache sein (`tb_source_lang_for_game`: de → en → es → pt → weitere PUBLISHED).
 *    Sobald `guide_tip` / `"Guide-Tip-lang"` (game_achievements) oder `beschreibung` /
 *    `status_explanation_localized` (games) übersetzt werden, feuern die Trigger
 *    `game_achievements_auto_release_on_tips` / `games_auto_release_on_texts` →
 *    `tb_auto_release_locales` → Zielsprache wird `PUBLISHED` (Hubs, de/en, noindex)
 *    bzw. `READY` (indexierbare Hauptspiele → Drip-Feed `tb-drip-publish-guides`).
 */
const LAWS = [
  {
    title: 'Admin-Gate',
    body:
      'PUBLISHED in irgendeiner Sprache = vom Admin persönlich gesichtet oder per 99 %-Creator-Schema abgenommen. Automatik nimmt PUBLISHED nie zurück.',
  },
  {
    title: '0-Row-Guides sind erlaubt',
    body:
      '0 Zeilen in game_guides bei einem PUBLISHED-Spiel sind kein Bug: Selbstläufer oder reine Trophäen-Tipps (guide_tip, beschreibung, status_explanation_localized). Nie guide_rows > 0 als Blocker einbauen.',
  },
  {
    title: 'Beliebige Erst-Sprache → Auto-Release',
    body:
      'Quellsprache ist de → en → es → pt → jede weitere PUBLISHED-Sprache. Sobald guide_tip / Guide-Tip-lang oder beschreibung / status_explanation_localized übersetzt sind, zieht tb_auto_release_locales die Zielsprache auf PUBLISHED (Hubs, de/en, noindex) bzw. READY (indexierbare Hauptspiele, Drip-Feed).',
  },
];

function AdminPipelineLawNotice() {
  const [open, setOpen] = useState(false);

  return (
    <section
      aria-label="Pipeline-Gesetz (Admin-Gate)"
      className="mb-6 rounded-xl border border-[#00ff66]/25 bg-[#00ff66]/[0.04]"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#00ff66]">
          <span aria-hidden>⚖️</span>
          Pipeline-Gesetz (Admin-Gate)
        </span>
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          {open ? 'Einklappen' : 'System-Notiz anzeigen'}
        </span>
      </button>
      {open && (
        <ol className="px-4 pb-4 space-y-2">
          {LAWS.map((law, index) => (
            <li key={law.title} className="flex gap-3 text-xs leading-relaxed">
              <span className="flex-shrink-0 font-mono text-[#00ff66]">{index + 1}.</span>
              <p className="text-zinc-400">
                <span className="font-bold text-zinc-200">{law.title}: </span>
                {law.body}
              </p>
            </li>
          ))}
          <li className="pt-1 text-[10px] font-mono text-zinc-600">
            Quelle: .cursor/rules/SUPABASE_SCHEMA.mdc · Regel 0 · tb_check_and_publish_locale ohne
            guide_rows-Sperre seit 10/2026
          </li>
        </ol>
      )}
    </section>
  );
}

export default AdminPipelineLawNotice;
