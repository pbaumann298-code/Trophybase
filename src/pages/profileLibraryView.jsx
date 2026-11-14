import { useEffect, useState } from 'react';
import WatchlistProgressBar from '../components/WatchlistProgressBar';
import { gameGuidePath } from '../lib/routeUtils';
import { searchGames } from '../lib/gameSearch';
import { getGameCover, getGameTitle } from '../lib/gameModel';
import { hasPublishedGuide } from '../lib/guidePublication';
import GameFallbackCover from '../components/GameFallbackCover';
import { QUICKWIN_ALPHABET } from '../lib/quickwinCatalog';
import { letterSectionId, tileOpenKey } from '../lib/cockpitLibrary';
import { fetchAchievementsForGame } from '../lib/achievementQueries';
import {
  normalizeTrophyType,
  TROPHY_TYPE,
  trophyTypeIcon,
  trophyTypeLabel,
} from '../lib/trophyTypes';
import { upsertUserGameRating } from '../lib/userAreaQueries';
import { supabase } from './supabaseClient';
import '../styles/quickwins.css';

function GameTrophyListDrawer({ game, gameId, locale }) {
  const [trophies, setTrophies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const { data, error: fetchErr } = await fetchAchievementsForGame(
        supabase,
        game || gameId,
        locale,
        null,
        { textFallback: true },
      );
      if (cancelled) return;
      if (fetchErr) {
        setError(fetchErr.message || 'Trophäen konnten nicht geladen werden.');
        setTrophies([]);
      } else {
        setTrophies(data ?? []);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [game, gameId, locale]);

  if (loading) {
    return (
      <div className="mt-3 rounded-xl border border-zinc-800 bg-[#0d0e0f] p-4 text-center font-mono text-xs text-zinc-400 animate-pulse">
        Lade komplette Trophäenliste aus game_achievements…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 font-mono text-xs text-red-300">
        Fehler beim Laden der Trophäenliste: {error}
      </div>
    );
  }

  if (trophies.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-zinc-800 bg-[#0d0e0f] p-4 text-center font-mono text-xs text-zinc-500">
        Für dieses Spiel sind aktuell keine Trophäen-Einträge in game_achievements hinterlegt.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[#00ff66]/30 bg-[#0d0e0f] p-3 sm:p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#00ff66]">
          🏆 Komplette Trophäenliste ({trophies.length})
        </span>
        <span className="font-mono text-[11px] text-zinc-500">Quelle: game_achievements</span>
      </div>
      <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
        {trophies.map((trophy, idx) => {
          const normType = normalizeTrophyType(trophy.trophy_type);
          const fallbackIcon = trophyTypeIcon(normType || TROPHY_TYPE.BRONZE);
          const typeLabel = trophyTypeLabel(normType);
          return (
            <div
              key={trophy.trophy_id || trophy.id || idx}
              className="flex items-start gap-3 rounded-lg border border-zinc-800/90 bg-[#141618] p-2.5"
            >
              <img
                src={trophy.icon_url || fallbackIcon}
                alt={typeLabel}
                loading="lazy"
                onError={(event) => {
                  if (fallbackIcon && event.currentTarget.src !== fallbackIcon) {
                    event.currentTarget.src = fallbackIcon;
                  }
                }}
                className="h-10 w-10 shrink-0 rounded-md border border-zinc-800 bg-zinc-900 object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {fallbackIcon ? (
                    <img src={fallbackIcon} alt={typeLabel} title={typeLabel} className="h-4 w-4 shrink-0 object-contain" />
                  ) : null}
                  <span className="text-xs font-bold text-white">{trophy.trophy_name || `Trophäe #${idx + 1}`}</span>
                  {trophy.global_seltenheit ? (
                    <span className="ml-auto rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                      {trophy.global_seltenheit}
                    </span>
                  ) : null}
                </div>
                {trophy.trophy_desc ? (
                  <p className="mt-0.5 text-xs leading-snug text-zinc-400">{trophy.trophy_desc}</p>
                ) : null}
                {trophy.guide_tip ? (
                  <p className="mt-1.5 rounded border border-[#00ff66]/20 bg-[#00ff66]/5 px-2 py-1 text-[11px] leading-snug text-[#00ff66]/90">
                    💡 {trophy.guide_tip}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InlineGameRatingControl({ item, userId, onSaved }) {
  const existing = item.rating;
  const [hours, setHours] = useState(
    existing?.completionHours != null
      ? String(existing.completionHours)
      : item.playtimeHours > 0
        ? String(item.playtimeHours)
        : '',
  );
  const [difficulty, setDifficulty] = useState(
    existing?.difficulty != null ? String(existing.difficulty) : '',
  );
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [err, setErr] = useState(null);

  if (!item.isPlatinum || item.bucket !== 'COMPLETED') return null;

  const handleSaveRating = async (event) => {
    event.preventDefault();
    setErr(null);
    setSaving(true);
    const { data, error } = await upsertUserGameRating(supabase, userId, item.gameId, {
      completionHours: hours,
      difficulty,
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
    onSaved?.(item.gameId, data);
  };

  const handleQuickConfirmPsnHours = async () => {
    if (!item.playtimeHours || item.playtimeHours <= 0) return;
    setErr(null);
    setSaving(true);
    const nextDiff = difficulty ? Number(difficulty) : 3;
    const { data, error } = await upsertUserGameRating(supabase, userId, item.gameId, {
      completionHours: item.playtimeHours,
      difficulty: nextDiff,
    });
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setHours(String(item.playtimeHours));
    if (!difficulty) setDifficulty(String(nextDiff));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
    onSaved?.(item.gameId, data);
  };

  return (
    <div className="mt-3 border-t border-[#00ff66]/20 pt-3">
      <form onSubmit={handleSaveRating} className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-300">
            🏆 Platin-Spielzeit & Schwierigkeit bewerten:
          </span>
          {existing ? (
            <span className="rounded-sm border border-[#00ff66]/30 bg-[#00ff66]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#00ff66]">
              ✓ Gespeichert ({existing.completionHours ?? '–'}h · {existing.difficulty ?? '–'}/10)
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-[#1a1b1c] px-2 py-1 font-mono text-[11px] text-zinc-400">
            <span>⏱️</span>
            <input
              type="number"
              min="0"
              max="9999"
              step="0.5"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              placeholder={item.playtimeHours > 0 ? `${item.playtimeHours}` : 'Std.'}
              aria-label="Echte Platin-Zeit in Stunden"
              className="w-14 bg-transparent text-right font-mono text-xs font-bold text-white tabular-nums focus:outline-hidden"
            />
            <span className="text-zinc-500">h</span>
          </label>
          <label className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-[#1a1b1c] px-2 py-1 font-mono text-[11px] text-zinc-400">
            <span>⚡</span>
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
              aria-label="Schwierigkeit 1 bis 10"
              className="cursor-pointer bg-[#1a1b1c] text-xs font-bold text-white focus:outline-hidden"
            >
              <option value="">Diff. (1-10)</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={String(n)}>
                  {n} / 10
                </option>
              ))}
            </select>
          </label>
          {item.isPlatinum && item.playtimeHours > 0 && !existing ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleQuickConfirmPsnHours}
              title={`PSN-Spielzeit (${item.playtimeHours}h) mit 1 Klick als Platin-Zeit bestätigen`}
              className="cursor-pointer rounded-lg bg-[#00ff66] px-2.5 py-1 font-mono text-[11px] font-bold text-zinc-950 transition hover:bg-[#00e65c] disabled:opacity-40"
            >
              ✓ {item.playtimeHours}h übernehmen
            </button>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className={`cursor-pointer rounded-lg border px-3 py-1 font-mono text-[11px] font-bold transition ${
              savedFlash
                ? 'border-[#00ff66] bg-[#00ff66] text-zinc-950'
                : 'border-[#00ff66]/40 bg-[#00ff66]/15 text-[#00ff66] hover:bg-[#00ff66]/25'
            }`}
          >
            {saving ? '…' : savedFlash ? '✓ Gesendet!' : existing ? 'Aktualisieren' : 'Senden'}
          </button>
        </div>
      </form>
      {err ? <p className="mt-1 font-mono text-[10px] text-red-400">{err}</p> : null}
    </div>
  );
}

function guideHrefFor(item, locale) {
  if (item?.game) return gameGuidePath(item.game, locale);
  return `/guide/${item?.gameId ?? ''}`;
}

function LibraryPosterTile({ item, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={item.title}
      className={`relative block w-full aspect-[3/4] overflow-hidden rounded-lg border bg-zinc-900 text-left cursor-pointer transition ${
        open ? 'border-[#00ff66] ring-2 ring-[#00ff66]/40' : 'border-zinc-800 hover:border-zinc-500'
      }`}
    >
      <GameFallbackCover
        src={item.cover}
        title={item.title}
        variant="card"
        imgClassName="absolute inset-0 h-full w-full object-cover"
        className="absolute inset-0 h-full w-full"
      />
      {item.isPlatinum ? (
        <span className="absolute left-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-sky-500/90 px-1 text-[10px] font-bold text-white shadow">
          🏆
        </span>
      ) : null}
      <span className="absolute right-1 top-1 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
        {item.progressPercent}%
      </span>
      {item.hardware ? (
        <span className="absolute bottom-1 left-1 right-1 truncate rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-100">
          {item.hardware}
        </span>
      ) : null}
    </button>
  );
}

export function CockpitGameDetailCard({
  item,
  locale,
  userId,
  defaultTrophyOpen = false,
  onOpenGuide,
  onStart,
  onPlatinum,
  onCompleteWithout,
  onWatchlist,
  onRatingSaved,
  onClose,
}) {
  const [trophyOpen, setTrophyOpen] = useState(defaultTrophyOpen);
  const guideHref = guideHrefFor(item, locale);

  return (
    <div
      className={`rounded-xl border bg-[#121314] p-4 ${
        item.isPlatinum ? 'border-[#00ff66]/35' : 'border-zinc-800'
      }`}
    >
      <div className="flex flex-col items-start gap-4 sm:flex-row">
        <a
          href={guideHref}
          onClick={(event) => {
            event.preventDefault();
            onOpenGuide(item);
          }}
          className="block h-24 w-16 shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 sm:h-28 sm:w-20"
        >
          <GameFallbackCover
            src={item.cover}
            title={item.title}
            variant="thumb"
            imgClassName="h-full w-full object-cover"
            className="h-full w-full"
          />
        </a>

        <div className="min-w-0 w-full flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={guideHref}
                  onClick={(event) => {
                    event.preventDefault();
                    onOpenGuide(item);
                  }}
                  className="truncate text-base font-bold text-white no-underline transition hover:text-[#00ff66]"
                >
                  {item.title}
                </a>
                {item.bucket === 'COMPLETED' && item.isPlatinum ? (
                  <span className="rounded-sm border border-[#00ff66]/35 bg-[#00ff66]/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#00ff66]">
                    🏆 Platin
                  </span>
                ) : null}
                {item.bucket === 'COMPLETED' && !item.isPlatinum ? (
                  <span className="rounded-sm border border-zinc-700 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-zinc-300">
                    ✅ Ohne Platin fertig
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {item.hardware ? (
                  <span className="rounded-sm border border-zinc-700 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-zinc-300">
                    {item.hardware}
                  </span>
                ) : null}
                {item.releaseYear ? (
                  <span className="font-mono text-[11px] text-zinc-500">{item.releaseYear}</span>
                ) : null}
                {item.titleId ? (
                  <span className="rounded-sm border border-zinc-700 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-zinc-300">
                    {item.titleId}
                  </span>
                ) : null}
                <span className="rounded-sm border border-zinc-800 bg-zinc-900/90 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                  ⏱️ PSN: <strong className="text-zinc-200">{item.playtimeHours} h</strong>
                </span>
                {item.guideCompletionTime ? (
                  <span className="font-mono text-[11px] text-zinc-500">
                    Guide-Richtwert: {item.guideCompletionTime}h
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {item.bucket === 'BACKLOG' ? (
                <button
                  type="button"
                  onClick={() => onStart(item)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#00ff66] px-3.5 py-2 font-mono text-xs font-bold text-zinc-950 shadow-sm transition hover:bg-[#00e65c]"
                >
                  ▶️ Spiel starten
                </button>
              ) : null}
              {item.bucket === 'PLAYING' ? (
                <>
                  <button
                    type="button"
                    onClick={() => onPlatinum(item)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#00ff66] px-3 py-1.5 font-mono text-xs font-bold text-zinc-950 shadow-xs transition hover:bg-[#00e65c]"
                  >
                    🏆 Platin erreicht
                  </button>
                  <button
                    type="button"
                    onClick={() => onCompleteWithout(item)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/90 px-3 py-1.5 font-mono text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700"
                  >
                    ✅ Ohne Platin fertig
                  </button>
                  <button
                    type="button"
                    onClick={() => onWatchlist(item)}
                    className="cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    ↩️ Watchlist
                  </button>
                </>
              ) : null}
              {item.bucket === 'COMPLETED' ? (
                <>
                  {!item.isPlatinum ? (
                    <button
                      type="button"
                      onClick={() => onPlatinum(item)}
                      className="cursor-pointer rounded-lg border border-[#00ff66]/40 bg-[#00ff66]/10 px-2.5 py-1 font-mono text-[11px] font-bold text-[#00ff66] transition hover:bg-[#00ff66]/20"
                    >
                      🏆 Doch Platin erreicht
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onStart(item)}
                    className="cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-[11px] text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    ↩️ In „Angefangen“
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => onOpenGuide(item)}
                className={`cursor-pointer rounded-lg border px-2.5 py-1 font-mono text-[11px] transition ${
                  hasPublishedGuide(item?.game)
                    ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66] hover:bg-[#00ff66]/20'
                    : 'border-zinc-700 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700'
                }`}
              >
                {hasPublishedGuide(item?.game) ? '📖 Guide →' : '🏆 Trophäen →'}
              </button>
              {onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded-lg border border-zinc-800 px-2.5 py-1 font-mono text-[11px] text-zinc-500 transition hover:text-zinc-200"
                >
                  ▴ Schließen
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="max-w-md flex-1">
              <WatchlistProgressBar percent={item.progressPercent} />
            </div>
            <TrophyPills
              item={item}
              open={trophyOpen}
              onToggle={() => setTrophyOpen((prev) => !prev)}
            />
          </div>

          {trophyOpen ? (
            <GameTrophyListDrawer game={item.game} gameId={item.gameId} locale={locale} />
          ) : null}

          <InlineGameRatingControl
            key={`${item.gameId}:${item.rating?.completionHours ?? ''}:${item.rating?.difficulty ?? ''}:${item.playtimeHours}`}
            item={item}
            userId={userId}
            onSaved={onRatingSaved}
          />
        </div>
      </div>
    </div>
  );
}

function TrophyPills({ item, open, onToggle }) {
  const p = Number(item.earnedTrophies?.platinum ?? (item.isPlatinum ? 1 : 0));
  const g = Number(item.earnedTrophies?.gold ?? 0);
  const s = Number(item.earnedTrophies?.silver ?? 0);
  const b = Number(item.earnedTrophies?.bronze ?? 0);
  return (
    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 font-bold transition ${
          open
            ? 'border-[#00ff66] bg-[#00ff66] text-zinc-950'
            : 'border-zinc-700 bg-zinc-900/90 text-zinc-300 hover:border-[#00ff66]/50 hover:text-white'
        }`}
      >
        <span>🏆 {p > 0 ? `Platin (${p})` : 'Trophäen'}</span>
        <span className="text-[10px] opacity-80">{open ? '▴ Liste schließen' : '▾ Alle Trophäen'}</span>
      </button>
      <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-amber-300">🥇 {g}</span>
      <span className="rounded-md border border-zinc-500/25 bg-zinc-400/10 px-2 py-0.5 text-zinc-300">🥈 {s}</span>
      <span className="rounded-md border border-orange-600/30 bg-orange-700/15 px-2 py-0.5 text-orange-300">🥉 {b}</span>
    </div>
  );
}

function ratingLabel(item) {
  const rating = item.rating;
  if (!rating || (rating.completionHours == null && rating.difficulty == null)) return '–';
  const hours = rating.completionHours != null ? `${rating.completionHours}h` : '–';
  const diff = rating.difficulty != null ? `${rating.difficulty}/10` : '–';
  return `${hours} · ${diff}`;
}

function QuickAction({ item, onStart, onPlatinum, onOpenGuide }) {
  if (item.bucket === 'BACKLOG') {
    return (
      <button type="button" onClick={() => onStart(item)} className="cursor-pointer rounded-lg bg-[#00ff66] px-2.5 py-1 font-mono text-[11px] font-bold text-zinc-950 hover:bg-[#00e65c]">
        ▶️ Starten
      </button>
    );
  }
  if (item.bucket === 'PLAYING') {
    return (
      <button type="button" onClick={() => onPlatinum(item)} className="cursor-pointer rounded-lg bg-[#00ff66] px-2.5 py-1 font-mono text-[11px] font-bold text-zinc-950 hover:bg-[#00e65c]">
        🏆 Platin
      </button>
    );
  }
  const guideReady = hasPublishedGuide(item?.game);
  return (
    <button
      type="button"
      onClick={() => onOpenGuide(item)}
      className={`cursor-pointer rounded-lg border px-2.5 py-1 font-mono text-[11px] transition ${
        guideReady
          ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66] hover:bg-[#00ff66]/20'
          : 'border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
      }`}
    >
      {guideReady ? '📖 Guide →' : '🏆 Trophäen →'}
    </button>
  );
}

function LibraryTable({ items, locale, onOpenGuide, onStart, onPlatinum }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <thead>
          <tr className="bg-zinc-900/80 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            <th className="px-2 py-2 font-semibold">Cover</th>
            <th className="px-2 py-2 font-semibold">Titel</th>
            <th className="px-2 py-2 font-semibold">Konsole</th>
            <th className="px-2 py-2 font-semibold">Jahr</th>
            <th className="px-2 py-2 font-semibold">PSN-Zeit</th>
            <th className="px-2 py-2 font-semibold">Fortschritt</th>
            <th className="px-2 py-2 font-semibold">Meine Bewertung</th>
            <th className="px-2 py-2 font-semibold">Aktion</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const href = guideHrefFor(item, locale);
            return (
              <tr key={item.watchlistId || item.gameId} className="border-t border-zinc-800/80 hover:bg-zinc-900/40">
                <td className="px-2 py-1.5">
                  <a
                    href={href}
                    onClick={(event) => {
                      event.preventDefault();
                      onOpenGuide(item);
                    }}
                    className="block h-10 w-8 overflow-hidden rounded border border-zinc-800 bg-zinc-900"
                  >
                    <GameFallbackCover
                      src={item.cover}
                      title={item.title}
                      variant="thumb"
                      imgClassName="h-full w-full object-cover"
                      className="h-full w-full"
                    />
                  </a>
                </td>
                <td className="max-w-[14rem] px-2 py-1.5">
                  <a
                    href={href}
                    onClick={(event) => {
                      event.preventDefault();
                      onOpenGuide(item);
                    }}
                    className="block truncate text-sm font-semibold text-white no-underline hover:text-[#00ff66]"
                  >
                    {item.title}
                  </a>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-zinc-400">{item.hardware || '–'}</td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-zinc-400">{item.releaseYear || '–'}</td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-zinc-300">{item.playtimeHours} h</td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px]">
                  <span className="font-bold text-white">{item.progressPercent}%</span>
                  <span className="ml-1.5 text-zinc-500">
                    P{Number(item.earnedTrophies?.platinum ?? 0)} G{Number(item.earnedTrophies?.gold ?? 0)} S{Number(item.earnedTrophies?.silver ?? 0)} B{Number(item.earnedTrophies?.bronze ?? 0)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-zinc-300">{ratingLabel(item)}</td>
                <td className="px-2 py-1.5">
                  <QuickAction item={item} onStart={onStart} onPlatinum={onPlatinum} onOpenGuide={onOpenGuide} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LibraryAlphaNav({ groups, activeLetter, onJump }) {
  const present = new Set(groups.map((group) => group.key));
  return (
    <nav className="catalog-alpha" aria-label="Alphabet">
      <div className="catalog-alpha-track">
        {QUICKWIN_ALPHABET.map((letter) => {
          const enabled = present.has(letter);
          return (
            <button
              key={letter}
              type="button"
              className={`catalog-alpha-btn${enabled ? '' : ' is-disabled'}${activeLetter === letter ? ' is-active' : ''}`}
              disabled={!enabled}
              onClick={() => onJump(letter)}
            >
              {letter}
            </button>
          );
        })}
        {present.has('#') ? (
          <button
            type="button"
            className={`catalog-alpha-btn${activeLetter === '#' ? ' is-active' : ''}`}
            onClick={() => onJump('#')}
          >
            #
          </button>
        ) : null}
      </div>
    </nav>
  );
}

export function LibraryBucketView({
  groups,
  viewMode,
  groupBy,
  locale,
  tileOpenId,
  onToggleTile,
  onOpenGuide,
  onStart,
  onPlatinum,
  onCompleteWithout,
  onWatchlist,
  userId,
  onRatingSaved,
  emptyLabel,
}) {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-[#121314]/60 px-4 py-8 text-center">
        <p className="text-xs text-zinc-400">{emptyLabel}</p>
      </div>
    );
  }

  const useRows = viewMode === 'tiles' && groupBy !== 'none';

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const sectionId = groupBy === 'alpha' ? letterSectionId(group.key) : undefined;
        return (
          <section
            key={group.key}
            id={sectionId}
            className={groupBy === 'alpha' ? 'scroll-mt-28' : undefined}
          >
            {group.label ? (
              <h3 className="mb-2.5 text-sm font-extrabold tracking-tight text-white">
                {group.label}
                <span className="ml-2 font-mono text-xs font-semibold text-zinc-500">
                  {group.items.length}
                </span>
              </h3>
            ) : null}

            {viewMode === 'table' ? (
              <LibraryTable
                items={group.items}
                locale={locale}
                onOpenGuide={onOpenGuide}
                onStart={onStart}
                onPlatinum={onPlatinum}
              />
            ) : null}

            {viewMode === 'cards' ? (
              <div className="grid grid-cols-1 gap-3">
                {group.items.map((item) => (
                  <CockpitGameDetailCard
                    key={item.watchlistId || item.gameId}
                    item={item}
                    locale={locale}
                    userId={userId}
                    onOpenGuide={onOpenGuide}
                    onStart={onStart}
                    onPlatinum={onPlatinum}
                    onCompleteWithout={onCompleteWithout}
                    onWatchlist={onWatchlist}
                    onRatingSaved={onRatingSaved}
                  />
                ))}
              </div>
            ) : null}

            {viewMode === 'tiles' && useRows ? (
              <>
                <div className="flex gap-2.5 overflow-x-auto pb-2">
                  {group.items.map((item) => {
                    const open = tileOpenId === tileOpenKey(group.key, item.gameId);
                    return (
                      <div key={item.watchlistId || item.gameId} className="w-[6.75rem] shrink-0 sm:w-[7.5rem]">
                        <LibraryPosterTile
                          item={item}
                          open={open}
                          onToggle={() => onToggleTile(tileOpenKey(group.key, item.gameId))}
                        />
                        <p className="mt-1 truncate text-[11px] font-semibold text-zinc-200">{item.title}</p>
                      </div>
                    );
                  })}
                </div>
                {group.items
                  .filter((item) => tileOpenId === tileOpenKey(group.key, item.gameId))
                  .map((item) => (
                    <div key={`detail-${item.gameId}`} className="mt-2">
                      <CockpitGameDetailCard
                        item={item}
                        locale={locale}
                        userId={userId}
                        defaultTrophyOpen
                        onOpenGuide={onOpenGuide}
                        onStart={onStart}
                        onPlatinum={onPlatinum}
                        onCompleteWithout={onCompleteWithout}
                        onWatchlist={onWatchlist}
                        onRatingSaved={onRatingSaved}
                        onClose={() => onToggleTile(tileOpenKey(group.key, item.gameId))}
                      />
                    </div>
                  ))}
              </>
            ) : null}

            {viewMode === 'tiles' && !useRows ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(6.75rem,1fr))] gap-2.5">
                {group.items.map((item) => {
                  const open = tileOpenId === tileOpenKey(group.key, item.gameId);
                  return (
                    <div key={item.watchlistId || item.gameId} className={open ? 'col-span-full' : 'min-w-0'}>
                      <div className={open ? 'w-[6.75rem] sm:w-[7.5rem]' : undefined}>
                        <LibraryPosterTile
                          item={item}
                          open={open}
                          onToggle={() => onToggleTile(tileOpenKey(group.key, item.gameId))}
                        />
                        {open ? null : (
                          <p className="mt-1 truncate text-[11px] font-semibold text-zinc-200">{item.title}</p>
                        )}
                      </div>
                      {open ? (
                        <div className="mt-2">
                          <CockpitGameDetailCard
                            item={item}
                            locale={locale}
                            userId={userId}
                            defaultTrophyOpen
                            onOpenGuide={onOpenGuide}
                            onStart={onStart}
                            onPlatinum={onPlatinum}
                            onCompleteWithout={onCompleteWithout}
                            onWatchlist={onWatchlist}
                            onRatingSaved={onRatingSaved}
                            onClose={() => onToggleTile(tileOpenKey(group.key, item.gameId))}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function LibraryQuickAdd({ locale, watchlistByGameId, onAdd }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { data, error: searchError } = await searchGames(supabase, q, {
        locale,
        excludeQuickwins: false,
        includeTrophiesOnly: true,
        limit: 12,
      });
      if (cancelled) return;
      setSearching(false);
      if (searchError) {
        setError(searchError.message || 'Suche fehlgeschlagen');
        setResults([]);
        return;
      }
      setError(null);
      setResults(Array.isArray(data) ? data.slice(0, 12) : []);
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, locale]);

  return (
    <div className="relative w-full sm:w-auto">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open && query.trim().length >= 2) setSearching(true);
        }}
        className={`cursor-pointer rounded-xl border px-3 py-2 font-mono text-xs font-bold transition ${
          open
            ? 'border-[#00ff66] bg-[#00ff66] text-zinc-950'
            : 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66] hover:bg-[#00ff66]/20'
        }`}
      >
        + Spiel hinzufügen
      </button>

      {open ? (
        <div className="mt-3 w-full rounded-xl border border-zinc-800 bg-[#121314] p-3 sm:absolute sm:right-0 sm:z-50 sm:mt-2 sm:w-[34rem] sm:shadow-2xl">
          <input
            type="search"
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              if (value.trim().length >= 2) {
                setSearching(true);
                setError(null);
              } else {
                setSearching(false);
                setError(null);
              }
            }}
            placeholder="Spiel suchen und mit 1 Tap ablegen…"
            autoFocus
            className="w-full rounded-lg border border-zinc-800 bg-[#0d0e0f] px-3 py-2 font-mono text-xs text-zinc-200 focus:border-zinc-600 focus:outline-hidden"
          />
          <div className="mt-2 max-h-80 space-y-1.5 overflow-y-auto">
            {searching ? <p className="px-1 py-3 font-mono text-[11px] text-zinc-500">Suche…</p> : null}
            {error ? <p className="px-1 py-2 font-mono text-[11px] text-red-400">{error}</p> : null}
            {!searching && !error && query.trim().length >= 2 && results.length === 0 ? (
              <p className="px-1 py-3 font-mono text-[11px] text-zinc-500">Keine Treffer.</p>
            ) : null}
            {query.trim().length < 2 && !searching ? (
              <p className="px-1 py-3 font-mono text-[11px] text-zinc-500">Mindestens 2 Zeichen.</p>
            ) : null}
            {results.map((game) => {
              const gameId = String(game?.id ?? '').trim();
              if (!gameId) return null;
              const title = getGameTitle(game, locale) || gameId;
              const cover = getGameCover(game, locale) || null;
              const existing = watchlistByGameId.get(gameId);
              const bucket = existing?.bucket ?? null;
              return (
                <div key={gameId} className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-[#18191b] px-2 py-1.5">
                  <div className="h-10 w-8 shrink-0 overflow-hidden rounded border border-zinc-800 bg-zinc-900">
                    <GameFallbackCover
                      src={cover}
                      title={title}
                      variant="thumb"
                      imgClassName="h-full w-full object-cover"
                      className="h-full w-full"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-white">{title}</p>
                    <p className="truncate font-mono text-[10px] text-zinc-500">
                      {game.hardware || 'Konsole unbekannt'}
                      <span className="mx-1.5 text-zinc-700">·</span>
                      {hasPublishedGuide(game) ? (
                        <span className="text-[#00ff66]">📖 Guide</span>
                      ) : (
                        <span className="text-zinc-400">🏆 Nur Trophäen</span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    <AddTap
                      label="📌 Watchlist"
                      active={bucket === 'BACKLOG'}
                      onClick={() => onAdd(game, 'BACKLOG')}
                    />
                    <AddTap
                      label="🔥 Angefangen"
                      active={bucket === 'PLAYING'}
                      onClick={() => onAdd(game, 'PLAYING')}
                    />
                    <AddTap
                      label="🏆 Platin fertig"
                      active={bucket === 'COMPLETED' && existing?.isPlatinum}
                      onClick={() => onAdd(game, 'COMPLETED')}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddTap({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-lg border px-2 py-1 font-mono text-[10px] font-bold transition ${
        active
          ? 'border-[#00ff66] bg-[#00ff66] text-zinc-950'
          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-[#00ff66]/50 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}
