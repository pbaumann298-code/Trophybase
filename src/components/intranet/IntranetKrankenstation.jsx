import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../pages/supabaseClient';

const VIEW = 'v_krankenstation_denglisch_guides';
const RPC = 'tb_resolve_denglisch_guide';
const ROW_LIMIT = 1000;

const COLUMNS = [
  'row_uuid',
  'game_id',
  'spieltitel',
  'spiel_typ',
  'hardware',
  'verdachts_zeilen_im_spiel',
  'guide_id',
  'trophy_id',
  'text_de',
  'text_en',
].join(', ');

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

function cellText(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

function withoutRow(list, rowUuid) {
  const hit = list.find((row) => row.row_uuid === rowUuid);
  if (!hit) return list;
  return list
    .filter((row) => row.row_uuid !== rowUuid)
    .map((row) => (
      row.game_id === hit.game_id
        ? {
            ...row,
            verdachts_zeilen_im_spiel: Math.max(0, Number(row.verdachts_zeilen_im_spiel || 0) - 1),
          }
        : row
    ));
}

function restoreRows(list, removed) {
  if (!removed?.length) return list;
  const present = new Set(list.map((row) => row.row_uuid));
  const missing = removed.filter((row) => row?.row_uuid && !present.has(row.row_uuid));
  if (!missing.length) return list;
  const gameId = missing[0].game_id;
  const siblingsLeft = list.some((row) => row.game_id === gameId);
  if (!siblingsLeft) return [...missing, ...list];
  const bumped = list.map((row) => (
    row.game_id === gameId
      ? {
          ...row,
          verdachts_zeilen_im_spiel: Number(row.verdachts_zeilen_im_spiel || 0) + missing.length,
        }
      : row
  ));
  return [...missing, ...bumped];
}

function ActionButton({ children, title, onClick, tone = 'zinc' }) {
  const toneClass = tone === 'green'
    ? 'border-[#00ff66]/40 text-[#00ff66] hover:bg-[#00ff66]/10'
    : tone === 'red'
      ? 'border-red-500/40 text-red-300 hover:bg-red-500/10'
      : 'border-sky-500/40 text-sky-200 hover:bg-sky-500/10';
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-lg border bg-zinc-950/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${toneClass}`}
    >
      {children}
    </button>
  );
}

/**
 * Krankenstation-Reiter: DE-Guidezeilen, deren deutscher Text wie Englisch aussieht.
 * Batch-Aktionen schicken `p_row_uuid: null`, Zeilen-Buttons die `row_uuid`.
 */
export default function IntranetKrankenstation({ reloadToken = 0, onCount }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [capped, setCapped] = useState(false);
  const rowsRef = useRef([]);

  const commit = useCallback((next) => {
    rowsRef.current = next;
    setRows(next);
    onCount?.(next.length);
  }, [onCount]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from(VIEW)
      .select(COLUMNS)
      .order('verdachts_zeilen_im_spiel', { ascending: false })
      .limit(ROW_LIMIT)
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        if (loadError) {
          setError(loadError.message || 'Denglisch-Liste konnte nicht geladen werden.');
          commit([]);
        } else {
          const next = data ?? [];
          setError('');
          setCapped(next.length >= ROW_LIMIT);
          commit(next);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, commit]);

  const games = useMemo(() => {
    const groups = new Map();
    for (const row of rows) {
      const id = String(row.game_id ?? '');
      if (!id) continue;
      let group = groups.get(id);
      if (!group) {
        group = {
          game_id: id,
          spieltitel: cellText(row.spieltitel),
          spiel_typ: cellText(row.spiel_typ),
          hardware: cellText(row.hardware),
          verdachts_zeilen_im_spiel: Number(row.verdachts_zeilen_im_spiel || 0),
          rows: [],
        };
        groups.set(id, group);
      }
      group.verdachts_zeilen_im_spiel = Math.max(
        group.verdachts_zeilen_im_spiel,
        Number(row.verdachts_zeilen_im_spiel || 0),
      );
      group.rows.push(row);
    }
    for (const group of groups.values()) {
      group.rows.sort((a, b) => collator.compare(String(a.guide_id ?? ''), String(b.guide_id ?? '')));
    }
    return [...groups.values()].sort(
      (a, b) => b.verdachts_zeilen_im_spiel - a.verdachts_zeilen_im_spiel
        || collator.compare(a.spieltitel, b.spieltitel),
    );
  }, [rows]);

  const resolve = async (gameId, action, rowUuid) => {
    const prev = rowsRef.current;
    const removed = rowUuid
      ? prev.filter((row) => row.row_uuid === rowUuid)
      : prev.filter((row) => row.game_id === gameId);
    if (!removed.length) return;

    commit(rowUuid ? withoutRow(prev, rowUuid) : prev.filter((row) => row.game_id !== gameId));
    setError('');

    const { error: rpcError } = await supabase.rpc(RPC, {
      p_game_id: gameId,
      p_action: action,
      p_row_uuid: rowUuid,
    });
    if (rpcError) {
      commit(restoreRows(rowsRef.current, removed));
      setError(rpcError.message || 'Aktion fehlgeschlagen.');
    }
  };

  if (loading && rows.length === 0) {
    return <p className="font-mono text-sm text-zinc-500">Denglisch-Check wird geladen…</p>;
  }

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-xs leading-relaxed text-zinc-500">
        Guide-Zeilen, deren deutscher Text dem englischen entspricht. Ein Klick nimmt die Zeile
        sofort aus der Liste. Schlägt die Aktion fehl, kommt sie zurück.
      </p>
      {capped ? (
        <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Es werden die ersten {ROW_LIMIT} Verdachtszeilen gezeigt, die schwersten Spiele zuerst.
        </p>
      ) : null}
      {error ? (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>
      ) : null}
      {!loading && games.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-10 text-center text-xs text-zinc-500">
          Keine verdächtigen DE/EN-Zeilen.
        </p>
      ) : null}

      {games.map((game) => (
        <article key={game.game_id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#141516]">
          <header className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-1">
              <h3 className="text-sm font-bold text-white">{game.spieltitel}</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-sky-200">
                  {game.hardware}
                </span>
                <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  {game.spiel_typ}
                </span>
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                  {game.verdachts_zeilen_im_spiel} verdächtige Zeilen
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <ActionButton
                title="Alle DE-Texte dieses Spiels nach EN schieben und DE neu übersetzen lassen"
                onClick={() => resolve(game.game_id, 'MOVE_DE_TO_EN', null)}
              >
                ➡️ Alle DE → EN schieben & DE neu übersetzen
              </ActionButton>
              <ActionButton
                tone="red"
                title="Deutschen Text aller Verdachtszeilen dieses Spiels leeren"
                onClick={() => resolve(game.game_id, 'DELETE_DE', null)}
              >
                🗑️ Alle DE leeren
              </ActionButton>
              <ActionButton
                tone="green"
                title="Alle Verdachtszeilen dieses Spiels als gewolltes Denglisch markieren"
                onClick={() => resolve(game.game_id, 'MARK_OK', null)}
              >
                ✅ Ganzes Spiel ist Denglisch (Ignorieren)
              </ActionButton>
            </div>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="bg-[#121314] text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Guide-ID</th>
                  <th className="px-3 py-2 font-medium">Trophäen-ID</th>
                  <th className="px-3 py-2 font-medium">🇩🇪 Aktuell in DE</th>
                  <th className="px-3 py-2 font-medium">🇬🇧 Aktuell in EN</th>
                  <th className="px-3 py-2 font-medium text-right">Zeile</th>
                </tr>
              </thead>
              <tbody>
                {game.rows.map((row) => (
                  <tr key={row.row_uuid} className="border-t border-zinc-800/80 align-top">
                    <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">{cellText(row.guide_id)}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-zinc-500">{cellText(row.trophy_id)}</td>
                    <td className="max-w-xs px-3 py-2 whitespace-pre-wrap text-zinc-100">{cellText(row.text_de)}</td>
                    <td className="max-w-xs px-3 py-2 whitespace-pre-wrap text-zinc-400">{cellText(row.text_en)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <ActionButton
                          title="Deutschen Text dieser Zeile nach EN schieben"
                          onClick={() => resolve(game.game_id, 'MOVE_DE_TO_EN', row.row_uuid)}
                        >
                          [➡️ DE→EN]
                        </ActionButton>
                        <ActionButton
                          tone="red"
                          title="Deutschen Text dieser Zeile leeren"
                          onClick={() => resolve(game.game_id, 'DELETE_DE', row.row_uuid)}
                        >
                          [🗑️ DE löschen]
                        </ActionButton>
                        <ActionButton
                          tone="green"
                          title="Diese Zeile ist gewolltes Denglisch"
                          onClick={() => resolve(game.game_id, 'MARK_OK', row.row_uuid)}
                        >
                          [✅ Ist Denglisch]
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </div>
  );
}
