import { useEffect, useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import { getPlatformGameIds } from '../../lib/gameModel';
import { GAME_TYPE } from '../../lib/gameSchema';
import { formatIntranetTitles, intranetGameHref } from '../../lib/intranetQueries';
import {
  embedCount,
  listPipelineStatusEntries,
  pipelineStatusValue,
} from '../../lib/gamePipelineStatus';
import {
  discardIntranetGuide,
  removeIntranetStatusKey,
  setIntranetGameType,
  statusAfterGuideDiscard,
} from '../../lib/intranetGameEdits';
import { fetchHomeTagDefs, homeTagKey, orderHomeTags, readHomeTags, setEditorialHomeTags } from '../../lib/homeTagDefs';
import HomeTagChecks from '../HomeTagChecks';
import { toggleAdminFollowup } from '../../lib/adminFollowups';
import { useAdminFollowups } from '../../hooks/useAdminFollowups';

const GAME_TYPES = Object.values(GAME_TYPE);

const STATUS_COLUMNS = [
  { key: 'discovery', className: 'text-zinc-400' },
  { key: 'trophies', className: 'text-zinc-400' },
  { key: 'guides', className: 'text-zinc-400' },
  { key: 'guide_de', className: 'text-amber-300/90' },
];

function DiscardGuideButton({ disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label="Guide verwerfen"
      title="Guide verwerfen"
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9l1-12" />
        <path strokeLinecap="round" d="M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}

function StatusDeleteButton({ label, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[11px] leading-none text-zinc-500 hover:bg-red-500/15 hover:text-red-400 disabled:opacity-40"
    >
      ×
    </button>
  );
}

function GameTypeCell({ game, busy, onSelect }) {
  const [open, setOpen] = useState(false);
  const current = String(game.spiel_typ ?? '').trim();

  return (
    <div className="min-w-[7.5rem]">
      <button
        type="button"
        disabled={busy}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-[#121314] px-2 py-1 text-[10px] font-mono text-zinc-300 hover:border-[#00ff66]/40 disabled:opacity-50"
      >
        <span>{current || 'Typ wählen'}</span>
        <span aria-hidden className="text-zinc-500">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-0.5">
          {GAME_TYPES.map((type) => {
            const selected = type === current;
            return (
              <button
                key={type}
                type="button"
                disabled={busy || selected}
                onClick={() => {
                  setOpen(false);
                  if (!selected) onSelect(type);
                }}
                className={`rounded-md px-2 py-1 text-left text-[10px] font-mono ${
                  selected
                    ? 'bg-[#00ff66]/10 text-[#00ff66]'
                    : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                } disabled:opacity-70`}
              >
                {type}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IntranetGameTable({ games, sessionUser, onGamePatch }) {
  const userId = sessionUser?.id ?? '';
  const followups = useAdminFollowups(userId);
  const followedIds = new Set(followups.map((entry) => entry.id));
  const [busyKey, setBusyKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [tagDefs, setTagDefs] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchHomeTagDefs(supabase).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setErrorMessage(error.message || 'home_tag_defs konnten nicht geladen werden.');
        setTagDefs([]);
        return;
      }
      setTagDefs(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (gameId, partial) => {
    onGamePatch?.(gameId, partial);
  };

  const handleType = async (game, gameType) => {
    const key = `${game.id}:type`;
    setBusyKey(key);
    setErrorMessage('');
    const { gameType: saved, error } = await setIntranetGameType(supabase, game.id, gameType);
    setBusyKey('');
    if (error) {
      setErrorMessage(error.message || 'Spieltyp konnte nicht gespeichert werden.');
      return;
    }
    patch(game.id, { spiel_typ: saved });
  };

  const handleTags = async (game, slug) => {
    const current = readHomeTags(game);
    const tagKey = homeTagKey(slug);
    const next = current.some((value) => homeTagKey(value) === tagKey)
      ? current.filter((value) => homeTagKey(value) !== tagKey)
      : [...current, slug];
    const ordered = orderHomeTags(tagDefs, next);
    const key = `${game.id}:tags`;
    setBusyKey(key);
    setErrorMessage('');
    const { homeTags, error } = await setEditorialHomeTags(supabase, game.id, ordered, tagDefs);
    setBusyKey('');
    if (error) {
      setErrorMessage(error.message || 'Home-Tags konnten nicht gespeichert werden.');
      return;
    }
    patch(game.id, { home_tags: homeTags, home_tags_locked: true });
  };

  const handleDiscardGuide = async (game) => {
    const title = formatIntranetTitles(game.spieltitel);
    const confirmed = window.confirm(
      `Guide für „${title}“ verwerfen?\n\nAlle Guide-Zeilen werden gelöscht und der Freigabe-Status zurückgesetzt.`,
    );
    if (!confirmed) return;

    const key = `${game.id}:discard-guide`;
    const previous = {
      status: game.status,
      publishing_status: game.publishing_status,
      published_locales: game.published_locales,
      game_guides: game.game_guides,
    };
    const nextStatus = statusAfterGuideDiscard(game.status);
    setBusyKey(key);
    setErrorMessage('');
    setNotice('');
    patch(game.id, {
      status: nextStatus,
      publishing_status: {},
      published_locales: [],
      game_guides: [{ count: 0 }],
    });

    const { status, error } = await discardIntranetGuide(supabase, game.id);
    setBusyKey('');
    if (error) {
      patch(game.id, previous);
      setErrorMessage(error.message || 'Guide konnte nicht gelöscht werden.');
      return;
    }
    patch(game.id, {
      status,
      publishing_status: {},
      published_locales: [],
      game_guides: [{ count: 0 }],
    });
    setNotice('Guide erfolgreich gelöscht und Status zurückgesetzt.');
  };

  const handleRemoveStatus = async (game, statusKey, value) => {
    const confirmed = window.confirm(`Status „${statusKey}“ (${value}) wirklich löschen?`);
    if (!confirmed) return;

    const key = `${game.id}:status:${statusKey}`;
    setBusyKey(key);
    setErrorMessage('');
    const { status, error } = await removeIntranetStatusKey(supabase, game.id, statusKey);
    setBusyKey('');
    if (error) {
      setErrorMessage(error.message || `Status „${statusKey}“ konnte nicht gelöscht werden.`);
      return;
    }
    patch(game.id, { status });
  };

  const handleFollowup = (game) => {
    if (!userId) {
      setErrorMessage('Wiedervorlage braucht eine angemeldete Admin-Sitzung.');
      return;
    }
    setErrorMessage('');
    try {
      toggleAdminFollowup(userId, {
        id: game.id,
        title: formatIntranetTitles(game.spieltitel),
      });
    } catch (error) {
      setErrorMessage(error.message || 'Wiedervorlage konnte nicht gespeichert werden.');
    }
  };

  return (
    <div className="space-y-3">
      {errorMessage ? (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
          {errorMessage}
        </p>
      ) : null}
      {notice ? (
        <p className="text-xs text-[#00ff66] bg-[#00ff66]/10 border border-[#00ff66]/25 rounded-lg px-3 py-2">
          {notice}
        </p>
      ) : null}
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
              <th className="px-3 py-2.5 font-medium">publisher</th>
              <th className="px-3 py-2.5 font-medium">genre</th>
              <th className="px-3 py-2.5 font-medium">spiel_typ</th>
              <th className="px-3 py-2.5 font-medium">home_tags</th>
              <th className="px-3 py-2.5 font-medium">discovery</th>
              <th className="px-3 py-2.5 font-medium">trophies</th>
              <th className="px-3 py-2.5 font-medium">guides</th>
              <th className="px-3 py-2.5 font-medium">guide_de</th>
              <th className="px-3 py-2.5 font-medium">#Troph</th>
              <th className="px-3 py-2.5 font-medium">#Guide</th>
              <th className="px-3 py-2.5 font-medium">status</th>
              <th className="px-3 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => {
              const href = intranetGameHref(game);
              const noted = followedIds.has(game.id);
              const statusEntries = listPipelineStatusEntries(game.status);
              return (
                <tr key={game.id} className="border-t border-zinc-800/80 odd:bg-[#1a1b1c] even:bg-[#161718] align-top">
                  <td className="px-3 py-2 text-zinc-200 max-w-[18rem]">{formatIntranetTitles(game.spieltitel)}</td>
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{game.ecosystem || '—'}</td>
                  <td className="px-3 py-2 text-sky-300 whitespace-nowrap">{game.hardware || '—'}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">
                    {getPlatformGameIds(game).length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {getPlatformGameIds(game).map((id) => (
                          <span key={id} className="whitespace-nowrap">{id}</span>
                        ))}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{game.release_jahr || '—'}</td>
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{game.upcoming_date || '—'}</td>
                  <td className="px-3 py-2 text-zinc-300 max-w-[12rem]">{game.entwickler || '—'}</td>
                  <td className="px-3 py-2 text-zinc-300 max-w-[12rem]">{game.publisher || '—'}</td>
                  <td className="px-3 py-2 text-zinc-400 max-w-[12rem]">{game.genre || '—'}</td>
                  <td className="px-3 py-2">
                    <GameTypeCell
                      game={game}
                      busy={busyKey === `${game.id}:type`}
                      onSelect={(gameType) => handleType(game, gameType)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <HomeTagChecks
                      defs={tagDefs}
                      selected={readHomeTags(game)}
                      disabled={busyKey === `${game.id}:tags`}
                      onToggle={(slug) => handleTags(game, slug)}
                      wrap
                    />
                  </td>
                  {STATUS_COLUMNS.map((column) => {
                    const value = pipelineStatusValue(game.status, column.key);
                    const removing = busyKey === `${game.id}:status:${column.key}`;
                    return (
                      <td key={column.key} className="px-3 py-2 whitespace-nowrap">
                        {value ? (
                          <span className="inline-flex items-center gap-1">
                            <span className={`font-mono text-[10px] ${column.className}`}>{value}</span>
                            <StatusDeleteButton
                              label={`${column.key} löschen`}
                              disabled={removing}
                              onClick={() => handleRemoveStatus(game, column.key, value)}
                            />
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-zinc-600">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                    {embedCount(game.game_achievements) ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                    {embedCount(game.game_guides) ?? '—'}
                  </td>
                  <td className="px-3 py-2 max-w-[22rem]">
                    {statusEntries.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {statusEntries.map((entry) => {
                          const removing = busyKey === `${game.id}:status:${entry.key}`;
                          return (
                            <span
                              key={entry.key}
                              className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-[#121314] px-1.5 py-0.5"
                            >
                              <span className="text-[10px] font-mono tracking-wide text-[#00ff66]/90">
                                {entry.key}={entry.value}
                              </span>
                              <StatusDeleteButton
                                label={`${entry.key} löschen`}
                                disabled={removing}
                                onClick={() => handleRemoveStatus(game, entry.key, entry.value)}
                              />
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-[10px] font-mono text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <DiscardGuideButton
                        disabled={busyKey === `${game.id}:discard-guide`}
                        onClick={() => handleDiscardGuide(game)}
                      />
                      <button
                        type="button"
                        onClick={() => handleFollowup(game)}
                        aria-pressed={noted}
                        className={`text-[10px] font-bold uppercase tracking-wider ${
                          noted ? 'text-amber-300' : 'text-zinc-400 hover:text-amber-200'
                        }`}
                      >
                        {noted ? 'Notiert' : 'Merken'}
                      </button>
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default IntranetGameTable;
