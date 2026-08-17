import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { TABLES, GAME_PK, GAME_STRUCT } from '../lib/gameSchema';
import { fetchGameByRouteRef, updateGameLocalizedFields } from '../lib/gameQueries';
import { getLocale } from '../lib/locale';
import '../styles/qa-admin.css';

const QA_TABLE = TABLES.qaDashboard;
const ALLOWED_ADMINS = ['master@trophybase.app'];
const VERSION_ORDER = ['ps3', 'ps4', 'remastered'];
const VERSION_LABEL = { ps3: 'PS3', ps4: 'PS4', remastered: 'Remastered' };

function parseErrors(raw) {
  if (!raw) return { issues: [], suggestions: [], master: {} };
  if (typeof raw === 'string') {
    try {
      return parseErrors(JSON.parse(raw));
    } catch {
      return { issues: [], suggestions: [], master: {} };
    }
  }
  return {
    issues: raw.issues || [],
    suggestions: (raw.suggestions || []).slice(0, 12),
    master: raw.master || {},
  };
}

function formatIssues(issues) {
  if (!issues.length) return '(keine Fehlerdetails)';
  return issues.map((item, i) => `${i + 1}. [${item.code || '?'}] ${item.message || ''}`).join('\n');
}

function normalizeText(v) {
  return String(v ?? '').toLowerCase().trim();
}

function classifyVersion(s) {
  const vTitle = normalizeText(s?.version_title);
  const lbl = normalizeText(s?.label);
  const platforms = (s?.platforms || []).map(normalizeText);
  const all = `${vTitle} ${lbl} ${platforms.join(' ')}`;

  if (/(remaster|remastered)/i.test(all)) return 'remastered';
  if (platforms.includes('playstation 3')) return 'ps3';
  if (platforms.includes('playstation 4') || platforms.includes('playstation 5')) return 'ps4';
  return 'unknown';
}

function buildPicksByVersion(suggestions) {
  const picksByVersion = { ps3: null, ps4: null, remastered: null };
  for (const s of suggestions) {
    const v = classifyVersion(s);
    if (v in picksByVersion && !picksByVersion[v]) picksByVersion[v] = s;
  }
  return picksByVersion;
}

/** Tooltip nur wenn Text visuell abgeschnitten ist */
function QaTip({ children, className = '', multiline = false, as: Tag = 'span' }) {
  const ref = useRef(null);
  const [title, setTitle] = useState('');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const truncated =
      el.scrollWidth > el.clientWidth + 1 ||
      (multiline && el.scrollHeight > el.clientHeight + 1);
    const text = typeof children === 'string' ? children : (el.textContent || '').trim();
    setTitle(truncated && text ? text : '');
  }, [children, multiline]);

  return (
    <Tag ref={ref} className={className} title={title || undefined}>
      {children}
    </Tag>
  );
}

export default function QaAdminPage({ sessionUser, onExit }) {
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [selectedVersion, setSelectedVersion] = useState('ps4');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentGame, setCurrentGame] = useState(null);

  const isAdmin = sessionUser && ALLOWED_ADMINS.includes(sessionUser.email);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setMsg('');
    const { data, error } = await supabase
      .from(QA_TABLE)
      .select('game_id,title_de_current,errors,status')
      .in('status', ['open', 'deferred'])
      .order('game_id', { ascending: true });

    if (error) {
      setMsg(`Laden fehlgeschlagen: ${error.message}`);
      setQueue([]);
    } else {
      const open = (data || []).filter((r) => r.status === 'open');
      const deferred = (data || []).filter((r) => r.status === 'deferred');
      setQueue([...open, ...deferred]);
      setIndex(0);
      setSelectedVersion('ps4');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) loadQueue();
    else setLoading(false);
  }, [isAdmin, loadQueue]);

  const current = queue[index] || null;
  const parsed = current ? parseErrors(current.errors) : { issues: [], suggestions: [], master: {} };
  const suggestions = parsed.suggestions;
  const masterConsole = parsed.master?.console || '—';
  const masterYear = parsed.master?.release_year || '—';
  const picksByVersion = buildPicksByVersion(suggestions);
  const defaultVersion = VERSION_ORDER.find((k) => picksByVersion[k]) || 'ps4';
  const selectedPick = picksByVersion[selectedVersion] || picksByVersion[defaultVersion];
  const issuesText = formatIssues(parsed.issues);

  const advance = useCallback(() => {
    setQueue((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setIndex((old) => (old >= next.length ? Math.max(0, next.length - 1) : old));
      return next;
    });
    setSelectedVersion('ps4');
  }, [index]);

  useEffect(() => {
    if (!current?.game_id) return;
    setSelectedVersion(defaultVersion);
  }, [current?.game_id, defaultVersion]);

  useEffect(() => {
    let cancelled = false;
    async function loadCurrentGame() {
      if (!current?.game_id) {
        setCurrentGame(null);
        return;
      }
      const { data, error } = await fetchGameByRouteRef(
        supabase,
        current.game_id,
        getLocale(),
      );

      if (cancelled) return;
      if (error) setCurrentGame(null);
      else setCurrentGame(data || null);
    }
    loadCurrentGame();
    return () => {
      cancelled = true;
    };
  }, [current?.game_id]);

  const selectVersionIfAvailable = useCallback(
    (versionKey) => {
      if (picksByVersion[versionKey]) setSelectedVersion(versionKey);
    },
    [picksByVersion],
  );

  const handleConfirm = useCallback(async () => {
    if (!current || !selectedPick || busy) return;
    const pick = selectedPick;
    setBusy(true);
    setMsg('');
    const gameUuid = currentGame?.[GAME_PK] ?? current.game_id;
    const patchGame = {};

    if (selectedVersion === 'ps3') patchGame[GAME_STRUCT.hardware] = 'PS3';
    if (selectedVersion === 'ps4' || selectedVersion === 'remastered') {
      patchGame[GAME_STRUCT.hardware] = 'PS4';
    }

    if (!patchGame[GAME_STRUCT.hardware] && pick.platforms?.length === 1) {
      const p = pick.platforms[0];
      if (['PlayStation 3', 'PlayStation 4', 'PlayStation 5'].includes(p)) {
        patchGame[GAME_STRUCT.hardware] = p.replace('PlayStation ', 'PS');
      }
    }
    if (pick.release_year) {
      patchGame[GAME_STRUCT.releaseYear] = parseInt(pick.release_year, 10) || undefined;
    }
    if (pick.igdb_id) patchGame[GAME_STRUCT.igdbId] = pick.igdb_id;

    // spieltitel / cover_url sind JSONB-Sprachmaps: nur die aktive Sprache patchen
    const { error: localizedErr } = await updateGameLocalizedFields(
      supabase,
      gameUuid,
      getLocale(),
      { title: pick.title, coverUrl: pick.cover_url },
    );

    if (localizedErr) {
      setMsg(localizedErr.message);
      setBusy(false);
      return;
    }

    if (Object.keys(patchGame).length > 0) {
      const { error: gameErr } = await supabase
        .from(TABLES.games)
        .update(patchGame)
        .eq(GAME_PK, gameUuid);

      if (gameErr) {
        setMsg(gameErr.message);
        setBusy(false);
        return;
      }
    }

    const { error: qaErr } = await supabase
      .from(QA_TABLE)
      .update({ status: 'confirmed' })
      .eq('game_id', current.game_id);

    if (qaErr) setMsg(qaErr.message);
    else {
      setMsg('Bestätigt & Master aktualisiert.');
      advance();
    }
    setBusy(false);
  }, [advance, busy, current, selectedPick, selectedVersion]);

  const handleReject = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    const { error } = await supabase.from(QA_TABLE).delete().eq('game_id', current.game_id);
    if (error) setMsg(error.message);
    else {
      setMsg('Eintrag entfernt.');
      advance();
    }
    setBusy(false);
  }, [advance, busy, current]);

  const handleDefer = async () => {
    if (!current || busy) return;
    setBusy(true);
    const { error } = await supabase
      .from(QA_TABLE)
      .update({ status: 'deferred' })
      .eq('game_id', current.game_id);
    if (error) setMsg(error.message);
    else {
      setMsg('Wiedervorlage (ans Ende).');
      advance();
      await loadQueue();
    }
    setBusy(false);
  };

  useEffect(() => {
    if (!current || loading || busy) return;

    const onKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) {
        return;
      }

      if (e.key === '1') {
        e.preventDefault();
        selectVersionIfAvailable('ps3');
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        selectVersionIfAvailable('ps4');
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        selectVersionIfAvailable('remastered');
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        handleReject();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, current, handleConfirm, handleReject, loading, selectVersionIfAvailable]);

  if (!sessionUser) {
    return (
      <div className="qa-shell">
        <p className="qa-msg">Bitte einloggen (Admin-Account).</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="qa-shell">
        <p className="qa-msg">Kein Zugriff – nur QA-Admins.</p>
      </div>
    );
  }

  return (
    <div className="qa-shell">
      <div className="qa-titlebar">
        <span>TrophyBase QA – Massenprüfung</span>
        <span className="qa-titlebar-right">
          {queue.length ? `${index + 1} / ${queue.length}` : '0 offen'}
          <span className="qa-kbd-hint" title="Tastatur: 1=PS3 · 2=PS4 · 3=Remastered · Enter=Sync · Backspace=Ablehnen">
            [1][2][3] Enter ↵ · ⌫ Ablehnen
          </span>
          <button type="button" className="qa-link" onClick={onExit}>
            Schließen
          </button>
        </span>
      </div>

      {loading && <p className="qa-msg">Lade Warteschlange …</p>}

      {!loading && !current && (
        <p className="qa-msg">Keine offenen QA-Fälle (open/deferred).</p>
      )}

      {current && (
        <>
          <div className="qa-meta">
            <span className="qa-npwr">{current.game_id}</span>
            <span className="qa-pipe">|</span>
            <span className="qa-tag">Konsole: {masterConsole}</span>
            <span className="qa-pipe">|</span>
            <span className="qa-tag">Jahr: {masterYear}</span>
            <span className="qa-status">{current.status}</span>
          </div>

          <h1 className="qa-game-title">
            <QaTip className="qa-ellipsis">{current.title_de_current}</QaTip>
          </h1>

          <div className="qa-workspace">
            <fieldset className="qa-panel qa-panel-left">
              <legend>Fehler (roh)</legend>
              <div className="qa-panel-body qa-errors-body">
                {parsed.issues?.length ? (
                  <QaTip className="qa-errors-pre" multiline as="pre">
                    {issuesText}
                  </QaTip>
                ) : (
                  <div className="qa-empty">Keine Fehlerdetails.</div>
                )}
              </div>
            </fieldset>

            <fieldset className="qa-panel qa-panel-mid">
              <legend>IGDB Versionen (PS3 / PS4 / Remastered)</legend>
              <div className="qa-panel-body">
                {!suggestions.length && <div className="qa-empty">Keine Vorschläge im errors-JSON.</div>}
                <div className="qa-version-options">
                  {VERSION_ORDER.map((v, idx) => {
                    const pick = picksByVersion[v];
                    const disabled = !pick;
                    const pretty = VERSION_LABEL[v];
                    const igdb = pick?.igdb_id ? `IGDB ${pick.igdb_id}` : '—';
                    const subLine1 = `${igdb}${pick?.version_title ? ` · ${pick.version_title}` : ''}`;
                    const subLine2 = [
                      pick?.label || (pick?.platforms || []).join(' · ') || '',
                      pick?.release_year ? `Release ${pick.release_year}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <label
                        key={v}
                        className={[
                          'qa-version-option',
                          disabled ? 'qa-disabled' : '',
                          selectedVersion === v ? 'qa-selected' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <input
                          type="radio"
                          name="qa-version"
                          value={v}
                          checked={selectedVersion === v}
                          onChange={() => setSelectedVersion(v)}
                          disabled={disabled}
                        />
                        <span className={`qa-version-badge qa-badge-${v}`}>
                          <span className="qa-keycap">{idx + 1}</span> {pretty}
                        </span>
                        <span className="qa-version-text">
                          <QaTip className="qa-version-title">{pick?.title || '—'}</QaTip>
                          <QaTip className="qa-version-sub">{subLine1}</QaTip>
                          {subLine2 ? <QaTip className="qa-version-sub qa-version-sub2">{subLine2}</QaTip> : null}
                        </span>
                        {pick?.cover_url ? (
                          <img
                            className="qa-version-thumb"
                            src={pick.cover_url}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.style.visibility = 'hidden';
                            }}
                          />
                        ) : (
                          <span className="qa-version-thumb-empty" />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            </fieldset>

            <fieldset className="qa-panel qa-panel-right">
              <legend>Cover-Vergleich + Patch-Vorschau</legend>
              <div className="qa-panel-body">
                <div className="qa-compare-images">
                  <div className="qa-compare-slot">
                    <div className="qa-compare-slot-title">Aktuell</div>
                    <img
                      className="qa-cover-big qa-cover-current"
                      src={currentGame?.Cover_URL || ''}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden';
                      }}
                    />
                  </div>
                  <div className="qa-compare-slot">
                    <div className="qa-compare-slot-title">
                      Vorschlag: {VERSION_LABEL[selectedVersion] || '—'}
                    </div>
                    <img
                      className="qa-cover-big qa-cover-suggested"
                      src={selectedPick?.cover_url || ''}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden';
                      }}
                    />
                  </div>
                </div>

                <div className="qa-patch-details">
                  <div className="qa-detail-grid">
                    <div className="qa-detail-k">Spieltitel</div>
                    <QaTip className="qa-detail-v">{selectedPick?.title || '—'}</QaTip>
                    <div className="qa-detail-k">IGDB_ID</div>
                    <QaTip className="qa-detail-v">
                      {selectedPick?.igdb_id ? String(selectedPick.igdb_id) : '—'}
                    </QaTip>
                    <div className="qa-detail-k">Konsole</div>
                    <QaTip className="qa-detail-v">
                      {selectedVersion === 'ps3'
                        ? 'PS3'
                        : selectedVersion === 'ps4' || selectedVersion === 'remastered'
                          ? 'PS4'
                          : '—'}
                    </QaTip>
                    <div className="qa-detail-k">Release_Jahr</div>
                    <QaTip className="qa-detail-v">
                      {selectedPick?.release_year ? String(selectedPick.release_year) : '—'}
                    </QaTip>
                    <div className="qa-detail-k">IGDB Version Title</div>
                    <QaTip className="qa-detail-v">{selectedPick?.version_title || '—'}</QaTip>
                  </div>

                  <QaTip className="qa-compare-reason" multiline>
                    {selectedPick?.reason || 'Kein reason vorhanden.'}
                  </QaTip>
                </div>
              </div>
            </fieldset>
          </div>

          <div className="qa-actions">
            <button
              type="button"
              className="qa-btn qa-btn-ok"
              disabled={busy || !selectedPick}
              onClick={handleConfirm}
              title="Enter"
            >
              Bestätigen &amp; Sync <span className="qa-btn-kbd">Enter</span>
            </button>
            <button
              type="button"
              className="qa-btn qa-btn-no"
              disabled={busy}
              onClick={handleReject}
              title="Backspace"
            >
              Ablehnen / Ignorieren <span className="qa-btn-kbd">⌫</span>
            </button>
            <button type="button" className="qa-btn qa-btn-later" disabled={busy} onClick={handleDefer}>
              Wiedervorlage
            </button>
          </div>
        </>
      )}

      {msg && <p className="qa-foot-msg">{msg}</p>}
      <button type="button" className="qa-btn qa-btn-refresh" onClick={loadQueue} disabled={loading}>
        Queue neu laden
      </button>
    </div>
  );
}
