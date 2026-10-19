import { useEffect, useMemo, useState } from 'react';
import { GUIDE_SHEET_TYPE, TABLES } from '../lib/gameSchema';
import {
  insertQuickGuideSteps,
  parseQuickGuideText,
} from '../lib/intranetGameEdits';
import { getTrophyIdKey } from '../lib/trophyQueries';
import { supabase } from '../pages/supabaseClient';

const SHEET_OPTIONS = [
  { value: GUIDE_SHEET_TYPE.WALKTHROUGH, label: 'Walkthrough (1)', defaultGroup: 'Walkthrough' },
  { value: GUIDE_SHEET_TYPE.COLLECTIBLES, label: 'Sammelobjekte (2)', defaultGroup: 'Sammelobjekte' },
  { value: GUIDE_SHEET_TYPE.BOSSES, label: 'Bosse (3)', defaultGroup: 'Bosse' },
];

const NEW_CREATOR = '__new__';

/**
 * Mobilfreundlicher Admin-Dialog zum Einfügen von YouTube-Timestamp-Schritten.
 */
function AdminQuickGuideModal({
  open,
  onClose,
  gameId = '',
  platformGameId = '',
  locale = '',
  trophies = [],
  onSaved,
}) {
  const [sheetType, setSheetType] = useState(GUIDE_SHEET_TYPE.WALKTHROUGH);
  const [videoUrl, setVideoUrl] = useState('');
  const [creators, setCreators] = useState([]);
  const [creatorId, setCreatorId] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [newYoutube, setNewYoutube] = useState('');
  const [defaultGroup, setDefaultGroup] = useState('Walkthrough');
  const [trophyId, setTrophyId] = useState('');
  const [rawText, setRawText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadingCreators, setLoadingCreators] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setSheetType(GUIDE_SHEET_TYPE.WALKTHROUGH);
    setVideoUrl('');
    setCreatorId('');
    setNewChannel('');
    setNewYoutube('');
    setDefaultGroup('Walkthrough');
    setTrophyId('');
    setRawText('');
    setError('');
    setSaving(false);

    let cancelled = false;
    setLoadingCreators(true);
    supabase
      .from(TABLES.contentCreators)
      .select('id, channel_name, youtube_url')
      .order('channel_name', { ascending: true })
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        setLoadingCreators(false);
        if (loadError) {
          setError(loadError.message || 'Creator konnten nicht geladen werden.');
          setCreators([]);
          return;
        }
        setCreators(data ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const steps = useMemo(
    () => parseQuickGuideText(rawText, defaultGroup),
    [rawText, defaultGroup],
  );

  if (!open) return null;

  const handleSheetChange = (value) => {
    const next = Number(value);
    setSheetType(next);
    const option = SHEET_OPTIONS.find((item) => item.value === next);
    if (option) setDefaultGroup(option.defaultGroup);
  };

  const ensureCreatorId = async () => {
    if (creatorId !== NEW_CREATOR) return creatorId || null;
    const channelName = newChannel.trim();
    const youtubeUrl = newYoutube.trim();
    if (!channelName) {
      throw new Error('Bitte einen Creator-Namen angeben.');
    }
    const { data, error: insertError } = await supabase
      .from(TABLES.contentCreators)
      .insert({ channel_name: channelName, youtube_url: youtubeUrl || null })
      .select('id, channel_name, youtube_url')
      .maybeSingle();
    if (insertError) throw insertError;
    if (data) setCreators((prev) => [...prev, data]);
    setCreatorId(data?.id ?? '');
    return data?.id ?? null;
  };

  const handleSave = async () => {
    if (!gameId || saving) return;
    if (steps.length === 0) {
      setError('Keine Schritte erkannt.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const resolvedCreatorId = await ensureCreatorId();
      const { inserted, status, error: insertError } = await insertQuickGuideSteps(supabase, {
        gameId,
        platformGameId,
        locale,
        sheetType,
        videoUrl,
        creatorId: resolvedCreatorId,
        trophyId: trophyId || null,
        steps,
      });
      if (insertError) {
        setError(insertError.message || 'Schritte konnten nicht gespeichert werden.');
        setSaving(false);
        return;
      }
      onSaved?.({ sheetType, inserted, status });
      setSaving(false);
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Speichern fehlgeschlagen.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Guide-Schritte einfügen"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Schließen"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-[#121314] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">+ Guide-Schritte</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
          >
            ×
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3 text-sm">
          <label className="block space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Ziel-Reiter</span>
            <select
              value={sheetType}
              onChange={(e) => handleSheetChange(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            >
              {SHEET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              YouTube-Video-URL (optional)
            </span>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            />
          </label>

          <label className="block space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Creator</span>
            <select
              value={creatorId}
              onChange={(e) => setCreatorId(e.target.value)}
              disabled={loadingCreators}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            >
              <option value="">— Kein Creator —</option>
              {creators.map((creator) => (
                <option key={creator.id} value={creator.id}>
                  {creator.channel_name || creator.id}
                </option>
              ))}
              <option value={NEW_CREATOR}>+ Neuen Creator anlegen</option>
            </select>
          </label>

          {creatorId === NEW_CREATOR ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
                placeholder="channel_name"
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              />
              <input
                type="url"
                value={newYoutube}
                onChange={(e) => setNewYoutube(e.target.value)}
                placeholder="youtube_url"
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              />
            </div>
          ) : null}

          <label className="block space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Standard-Gruppenname
            </span>
            <input
              type="text"
              value={defaultGroup}
              onChange={(e) => setDefaultGroup(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            />
          </label>

          <label className="block space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              Mit Trophäe verknüpfen (optional)
            </span>
            <select
              value={trophyId}
              onChange={(e) => setTrophyId(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            >
              <option value="">— Keine —</option>
              {(trophies ?? []).map((trophy) => {
                const id = getTrophyIdKey(trophy);
                if (!id) return null;
                const label = String(trophy.trophy_name || trophy.name || trophy.title || id).trim();
                return (
                  <option key={id} value={id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              YouTube-Timestamps
            </span>
            <p className="text-xs text-zinc-500">
              Format: <code className="text-zinc-400">02:15 - Name</code> pro Zeile. Zeilen mit{' '}
              <code className="text-zinc-400"># Gruppenname</code> starten eine neue Kachel.
            </p>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={10}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-200"
              placeholder={'# Kapitel 1\n02:15 - Erster Schritt\n05:40 Zweiter Schritt'}
            />
            <p className="text-xs text-zinc-400">{steps.length} Schritte erkannt</p>
          </label>

          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-mono uppercase tracking-wider text-zinc-400"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || steps.length === 0}
            className="rounded-lg border border-[#00ff66]/40 bg-[#00ff66]/10 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-[#00ff66] disabled:opacity-40"
          >
            {saving ? 'Speichern…' : `${steps.length} Schritte speichern`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminQuickGuideModal;
