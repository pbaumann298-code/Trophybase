import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { TABLES, GAME_PK } from '../lib/gameSchema';
import '../styles/qa-admin.css';

const QA_TABLE = TABLES.qaDashboard;
const ALLOWED_ADMINS = ['master@trophybase.app'];

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
    suggestions: (raw.suggestions || []).slice(0, 3),
    master: raw.master || {},
  };
}

function formatIssues(issues) {
  if (!issues.length) return '(keine Fehlerdetails)';
  return issues.map((item, i) => `${i + 1}. [${item.code || '?'}] ${item.message || ''}`).join('\n');
}

export default function QaAdminPage({ sessionUser, onExit }) {
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

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
      setSelectedIdx(0);
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

  const advance = () => {
    setQueue((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setIndex((old) => (old >= next.length ? Math.max(0, next.length - 1) : old));
      return next;
    });
    setSelectedIdx(0);
  };

  const handleConfirm = async () => {
    if (!current || !suggestions[selectedIdx]) return;
    const pick = suggestions[selectedIdx];
    setBusy(true);
    setMsg('');
    const patch = {
      Spieltitel: pick.title,
      Cover_URL: pick.cover_url || undefined,
      IGDB_ID: pick.igdb_id,
    };
    if (pick.platforms?.length === 1) {
      const p = pick.platforms[0];
      if (['PlayStation 3', 'PlayStation 4', 'PlayStation 5'].includes(p)) {
        patch.Konsole = p.replace('PlayStation ', 'PS');
      }
    }
    if (pick.release_year) patch.Release_Jahr = parseInt(pick.release_year, 10) || undefined;

    const { error: gameErr } = await supabase
      .from(TABLES.games)
      .update(patch)
      .eq(GAME_PK, current.game_id);

    if (gameErr) {
      setMsg(gameErr.message);
      setBusy(false);
      return;
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
  };

  const handleReject = async () => {
    if (!current) return;
    setBusy(true);
    const { error } = await supabase.from(QA_TABLE).delete().eq('game_id', current.game_id);
    if (error) setMsg(error.message);
    else {
      setMsg('Eintrag entfernt.');
      advance();
    }
    setBusy(false);
  };

  const handleDefer = async () => {
    if (!current) return;
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

          <h1 className="qa-game-title">{current.title_de_current}</h1>

          <div className="qa-workspace">
            <fieldset className="qa-panel qa-panel-left">
              <legend>Fehler (gebündelt)</legend>
              <textarea
                className="qa-errors-box"
                readOnly
                value={formatIssues(parsed.issues)}
                rows={12}
              />
            </fieldset>

            <fieldset className="qa-panel qa-panel-right">
              <legend>IGDB-Lösungsvorschläge</legend>
              <div className="qa-suggestions">
                {suggestions.length === 0 && (
                  <p className="qa-empty">Keine Vorschläge im errors-JSON.</p>
                )}
                {suggestions.map((s, i) => (
                  <label key={s.igdb_id || i} className="qa-suggestion-row">
                    <input
                      type="radio"
                      name="qa-suggestion"
                      checked={selectedIdx === i}
                      onChange={() => setSelectedIdx(i)}
                    />
                    <img
                      className="qa-thumb"
                      src={s.cover_url || ''}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden';
                      }}
                    />
                    <span className="qa-suggestion-text">
                      <strong>{s.title}</strong>
                      <span className="qa-suggestion-sub">
                        {s.label || (s.platforms || []).join(' · ')}
                        {s.release_year ? ` · ${s.release_year}` : ''}
                      </span>
                      <span className="qa-suggestion-sub">
                        IGDB {s.igdb_id}
                        {s.version_title ? ` · ${s.version_title}` : ''}
                      </span>
                      <span className="qa-suggestion-reason">{s.reason}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="qa-actions">
            <button
              type="button"
              className="qa-btn qa-btn-ok"
              disabled={busy || !suggestions[selectedIdx]}
              onClick={handleConfirm}
            >
              Bestätigen &amp; Sync
            </button>
            <button type="button" className="qa-btn qa-btn-no" disabled={busy} onClick={handleReject}>
              Ablehnen / Ignorieren
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
