import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../pages/supabaseClient';

const STATUS_OPTIONS = [
  { value: 'IN_PROGRESS', label: '🔥 IN_PROGRESS', badgeClass: 'border-amber-500/40 bg-amber-500/15 text-amber-300' },
  { value: 'PLANNED', label: '📅 PLANNED', badgeClass: 'border-sky-500/40 bg-sky-500/15 text-sky-300' },
  { value: 'IDEA', label: '💡 IDEA', badgeClass: 'border-purple-500/40 bg-purple-500/15 text-purple-300' },
  { value: 'DONE', label: '✅ DONE', badgeClass: 'border-[#00ff66]/40 bg-[#00ff66]/15 text-[#00ff66]' },
  { value: 'REJECTED', label: '❌ REJECTED', badgeClass: 'border-red-500/40 bg-red-500/15 text-red-300' },
];

const CATEGORY_OPTIONS = [
  'Meilenstein',
  'Architektur',
  'Hub & Content',
  'Monetarisierung',
  'Verworfen',
];

function getCategoryStyle(category) {
  switch (category) {
    case 'Meilenstein':
      return 'border-amber-400/40 bg-amber-500/10 text-amber-300';
    case 'Architektur':
      return 'border-cyan-400/40 bg-cyan-500/10 text-cyan-300';
    case 'Hub & Content':
      return 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66]';
    case 'Monetarisierung':
      return 'border-purple-400/40 bg-purple-500/10 text-purple-300';
    case 'Verworfen':
      return 'border-red-400/40 bg-red-500/10 text-red-300';
    default:
      return 'border-zinc-700 bg-zinc-800 text-zinc-300';
  }
}

function getStatusMeta(status) {
  return STATUS_OPTIONS.find((s) => s.value === status) || {
    value: status || 'IDEA',
    label: status || 'IDEA',
    badgeClass: 'border-zinc-700 bg-zinc-800 text-zinc-300',
  };
}

function formatDateBadge(isoDateStr) {
  if (!isoDateStr) return null;
  const parts = String(isoDateStr).slice(0, 10).split('-');
  if (parts.length !== 3) return isoDateStr;
  const [yyyy, mm, dd] = parts;
  return `${dd}.${mm}.${yyyy}`;
}

function getTodayDDMM() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.`;
}

function normalizeCategory(rawCategory) {
  if (!rawCategory) return 'Architektur';
  const trimmed = String(rawCategory).trim();
  const match = CATEGORY_OPTIONS.find(
    (c) => c.toLowerCase() === trimmed.toLowerCase()
  );
  if (match) return match;
  if (trimmed.toLowerCase().includes('hub') || trimmed.toLowerCase().includes('content')) return 'Hub & Content';
  if (trimmed.toLowerCase().includes('meilen')) return 'Meilenstein';
  if (trimmed.toLowerCase().includes('arch')) return 'Architektur';
  if (trimmed.toLowerCase().includes('monet')) return 'Monetarisierung';
  if (trimmed.toLowerCase().includes('verworfen') || trimmed.toLowerCase().includes('reject')) return 'Verworfen';
  return trimmed;
}

function RoadmapCard({ item, onUpdate, onDelete }) {
  const [title, setTitle] = useState(item.title ?? '');
  const [category, setCategory] = useState(item.category ?? 'Architektur');
  const [targetDate, setTargetDate] = useState(item.target_date ? String(item.target_date).slice(0, 10) : '');
  const [status, setStatus] = useState(item.status ?? 'IDEA');
  const [notes, setNotes] = useState(item.notes ?? '');
  const [quickDetail, setQuickDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState('');

  useEffect(() => {
    setTitle(item.title ?? '');
    setCategory(item.category ?? 'Architektur');
    setTargetDate(item.target_date ? String(item.target_date).slice(0, 10) : '');
    setStatus(item.status ?? 'IDEA');
    setNotes(item.notes ?? '');
  }, [item.id, item.title, item.category, item.target_date, item.status, item.notes]);

  const triggerFeedback = (msg = '✓ Gespeichert') => {
    setSaveFeedback(msg);
    setTimeout(() => {
      setSaveFeedback((prev) => (prev === msg ? '' : prev));
    }, 2200);
  };

  const handleFieldSave = async (patch) => {
    setSaving(true);
    const ok = await onUpdate(item.id, patch);
    setSaving(false);
    if (ok) triggerFeedback();
  };

  const handleAppendDetail = async (e) => {
    e?.preventDefault();
    const text = quickDetail.trim();
    if (!text || saving) return;

    const stamp = getTodayDDMM();
    const newLine = `• [${stamp}] ${text}`;
    const updatedNotes = notes.trim() ? `${notes.trimEnd()}\n${newLine}` : newLine;

    setNotes(updatedNotes);
    setQuickDetail('');
    setSaving(true);
    const ok = await onUpdate(item.id, { notes: updatedNotes });
    setSaving(false);
    if (ok) triggerFeedback('+ Detail angehängt');
  };

  const statusMeta = getStatusMeta(status);
  const formattedTargetDate = formatDateBadge(targetDate);
  const isDirtyNotes = (notes ?? '') !== (item.notes ?? '');
  const isDirtyTitle = (title ?? '') !== (item.title ?? '');

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800/90 bg-[#141517] p-4 shadow-md hover:border-zinc-700/80 transition">
      {/* Top Bar: Badges + Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Dropdown */}
          <select
            value={status}
            onChange={(e) => {
              const next = e.target.value;
              setStatus(next);
              handleFieldSave({ status: next });
            }}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider cursor-pointer focus:outline-none ${statusMeta.badgeClass}`}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-200">
                {opt.label}
              </option>
            ))}
          </select>

          {/* Category Dropdown */}
          <select
            value={category}
            onChange={(e) => {
              const next = e.target.value;
              setCategory(next);
              handleFieldSave({ category: next });
            }}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-mono font-bold cursor-pointer focus:outline-none ${getCategoryStyle(category)}`}
          >
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat} className="bg-zinc-900 text-zinc-200">
                {cat}
              </option>
            ))}
            {!CATEGORY_OPTIONS.includes(category) && category ? (
              <option value={category} className="bg-zinc-900 text-zinc-200">
                {category}
              </option>
            ) : null}
          </select>

          {/* Target Date Badge + Picker */}
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-[11px] font-mono text-amber-300">
            <span>📅</span>
            {formattedTargetDate ? (
              <span className="font-bold">{formattedTargetDate}</span>
            ) : (
              <span className="text-zinc-500">Kein Ziel-Datum</span>
            )}
            <input
              type="date"
              value={targetDate}
              onChange={(e) => {
                const next = e.target.value;
                setTargetDate(next);
                handleFieldSave({ target_date: next || null });
              }}
              title="Ziel-Datum (target_date) ändern"
              className="ml-1 w-6 cursor-pointer bg-transparent text-[10px] text-amber-200 opacity-75 hover:opacity-100 focus:outline-none"
            />
            {targetDate && (
              <button
                type="button"
                title="Datum entfernen"
                onClick={() => {
                  setTargetDate('');
                  handleFieldSave({ target_date: null });
                }}
                className="text-[10px] text-zinc-400 hover:text-red-300"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Right Status / Save Feedback / Delete */}
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-[10px] font-mono text-amber-400 animate-pulse">
              Speichert…
            </span>
          )}
          {!saving && saveFeedback && (
            <span className="text-[10px] font-mono text-[#00ff66] font-bold">
              {saveFeedback}
            </span>
          )}
          {item.updated_at && (
            <span className="text-[10px] font-mono text-zinc-500" title="Zuletzt aktualisiert">
              🕒 {new Date(item.updated_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            onClick={() => onDelete(item.id, title)}
            title="Eintrag löschen"
            className="rounded-lg p-1 text-xs text-zinc-500 hover:bg-red-500/20 hover:text-red-400 transition"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Inline Editable Title */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (isDirtyTitle && title.trim()) {
              handleFieldSave({ title: title.trim() });
            }
          }}
          placeholder="Titel des Roadmap-Eintrags…"
          className="w-full rounded-xl border border-transparent bg-transparent px-2 py-1 text-base font-bold text-white hover:border-zinc-700/80 focus:border-[#00ff66] focus:bg-zinc-900 focus:outline-none transition"
        />
        {isDirtyTitle && (
          <button
            type="button"
            onClick={() => handleFieldSave({ title: title.trim() })}
            className="shrink-0 rounded-lg bg-[#00ff66] px-2.5 py-1 text-[10px] font-mono font-bold text-black hover:bg-[#00ff66]/90"
          >
            Titel speichern
          </button>
        )}
      </div>

      {/* Multiline Notes with Auto-Save onBlur + Save Button */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            Notizen & Details (notes)
          </span>
          {isDirtyNotes && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleFieldSave({ notes })}
              className="rounded-md bg-[#00ff66] px-2.5 py-0.5 text-[10px] font-mono font-bold text-black hover:bg-[#00ff66]/90"
            >
              ✓ Notiz speichern
            </button>
          )}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (isDirtyNotes) {
              handleFieldSave({ notes });
            }
          }}
          rows={Math.min(10, Math.max(3, (notes.match(/\n/g)?.length ?? 0) + 2))}
          placeholder="Notizen, Zwischenstände oder Architektur-Details…"
          className="w-full resize-y rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-200 leading-relaxed placeholder-zinc-600 focus:border-[#00ff66]/60 focus:bg-zinc-950 focus:outline-none font-sans"
        />
      </div>

      {/* Quick "+ Detail anhängen" Input */}
      <form onSubmit={handleAppendDetail} className="flex items-center gap-2 pt-1">
        <input
          type="text"
          value={quickDetail}
          onChange={(e) => setQuickDetail(e.target.value)}
          placeholder={`+ Detail anhängen (wird als "• [${getTodayDDMM()}] ..." unten angefügt)…`}
          className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-[#00ff66] focus:bg-zinc-900 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!quickDetail.trim() || saving}
          className="shrink-0 rounded-xl border border-[#00ff66]/40 bg-[#00ff66]/15 px-3 py-1.5 text-xs font-mono font-bold text-[#00ff66] hover:bg-[#00ff66]/25 disabled:opacity-40 transition"
        >
          + Detail anhängen
        </button>
      </form>
    </div>
  );
}

export default function IntranetRoadmap() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Filter & Grouping State
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupByMode, setGroupByMode] = useState('none'); // 'none' | 'status' | 'category'

  // Quick-Inbox State
  const [inboxOpen, setInboxOpen] = useState(true);
  const [inboxText, setInboxText] = useState('');
  const [inboxBusy, setInboxBusy] = useState(false);

  // Manual New Entry Modal / Bar
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Architektur');
  const [newStatus, setNewStatus] = useState('PLANNED');
  const [newTargetDate, setNewTargetDate] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Load items from public.admin_roadmap
  const fetchRoadmap = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: readErr } = await supabase
        .from('admin_roadmap')
        .select('*')
        .order('target_date', { ascending: true, nullsFirst: false })
        .order('updated_at', { ascending: false });

      if (readErr) {
        setError(`Fehler beim Laden von admin_roadmap: ${readErr.message}`);
        setItems([]);
      } else {
        setItems(data ?? []);
      }
    } catch (err) {
      setError(err.message || 'Unerwarteter Fehler beim Laden der Roadmap.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoadmap();
  }, [fetchRoadmap]);

  // Update single item
  const handleUpdateItem = async (id, patch) => {
    setError('');
    const nowIso = new Date().toISOString();
    const payload = { ...patch, updated_at: nowIso };

    // Optimistic update
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...payload } : item))
    );

    const { error: upErr } = await supabase
      .from('admin_roadmap')
      .update(payload)
      .eq('id', id);

    if (upErr) {
      setError(`Speichern fehlgeschlagen: ${upErr.message}`);
      fetchRoadmap();
      return false;
    }
    return true;
  };

  // Delete single item
  const handleDeleteItem = async (id, title) => {
    if (!window.confirm(`Roadmap-Eintrag "${title || id}" wirklich löschen?`)) return;
    setError('');

    const { error: delErr } = await supabase
      .from('admin_roadmap')
      .delete()
      .eq('id', id);

    if (delErr) {
      setError(`Löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== id));
    setNotice(`Eintrag "${title}" wurde gelöscht.`);
  };

  // Create manual entry
  const handleCreateManual = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setError('');

    const nowIso = new Date().toISOString();
    const payload = {
      title: newTitle.trim(),
      category: newCategory,
      status: newStatus,
      target_date: newTargetDate || null,
      notes: newNotes.trim() || '',
      updated_at: nowIso,
    };

    const { data, error: insErr } = await supabase
      .from('admin_roadmap')
      .insert(payload)
      .select('*')
      .maybeSingle();

    if (insErr) {
      setError(`Anlegen fehlgeschlagen: ${insErr.message}`);
      return;
    }

    if (data) {
      setItems((prev) => [data, ...prev]);
    } else {
      fetchRoadmap();
    }

    setNewTitle('');
    setNewNotes('');
    setNewTargetDate('');
    setShowNewForm(false);
    setNotice(`Neues Thema "${payload.title}" wurde angelegt.`);
  };

  // Parse Quick-Inbox lines for live preview and execution
  const parsedInboxLines = useMemo(() => {
    const rawLines = String(inboxText ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    return rawLines.map((line, index) => {
      // Fall A: + [Suchbegriff] Text...
      const matchA = line.match(/^\+\s*\[\s*([^\]]+?)\s*\]\s*(.+)$/);
      if (matchA) {
        const searchTerm = matchA[1].trim();
        const detailText = matchA[2].trim();
        const targetItem = items.find((it) =>
          String(it.title ?? '').toLowerCase().includes(searchTerm.toLowerCase())
        );
        return {
          index,
          raw: line,
          type: 'APPEND',
          searchTerm,
          detailText,
          targetItem: targetItem || null,
        };
      }

      // Fall B: * [Kategorie | YYYY-MM-DD] Titel: Notiz  (Datum & Notiz optional)
      const matchB = line.match(/^\*\s*\[\s*([^\]]+?)\s*\]\s*(.+)$/);
      if (matchB) {
        const bracketContent = matchB[1].trim();
        const restContent = matchB[2].trim();

        let rawCat = bracketContent;
        let rawDate = null;

        if (bracketContent.includes('|')) {
          const parts = bracketContent.split('|').map((p) => p.trim());
          rawCat = parts[0] || 'Architektur';
          const dateCandidate = parts[1] || '';
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateCandidate)) {
            rawDate = dateCandidate;
          } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateCandidate)) {
            const [d, m, y] = dateCandidate.split('.');
            rawDate = `${y}-${m}-${d}`;
          }
        }

        const colonIdx = restContent.indexOf(':');
        let parsedTitle = restContent;
        let parsedNote = '';
        if (colonIdx !== -1) {
          parsedTitle = restContent.slice(0, colonIdx).trim();
          parsedNote = restContent.slice(colonIdx + 1).trim();
        }

        const category = normalizeCategory(rawCat);
        const defaultStatus =
          category === 'Verworfen'
            ? 'REJECTED'
            : rawDate
              ? 'PLANNED'
              : 'IDEA';

        return {
          index,
          raw: line,
          type: 'CREATE',
          category,
          targetDate: rawDate,
          title: parsedTitle,
          notes: parsedNote,
          status: defaultStatus,
        };
      }

      return {
        index,
        raw: line,
        type: 'UNKNOWN',
      };
    });
  }, [inboxText, items]);

  // Execute Quick-Inbox Import
  const handleProcessInbox = async () => {
    if (!parsedInboxLines.length || inboxBusy) return;

    setInboxBusy(true);
    setError('');
    setNotice('');

    let appendedCount = 0;
    let createdCount = 0;
    const errors = [];
    const nowIso = new Date().toISOString();

    // Working copy of items so multiple '+ [SameTopic]' lines in one batch accumulate properly
    const localItemsMap = new Map(items.map((it) => [it.id, { ...it }]));

    try {
      for (const entry of parsedInboxLines) {
        if (entry.type === 'APPEND') {
          const target = [...localItemsMap.values()].find((it) =>
            String(it.title ?? '').toLowerCase().includes(entry.searchTerm.toLowerCase())
          );

          if (!target) {
            errors.push(`Kein bestehendes Thema gefunden für Suchbegriff "[${entry.searchTerm}]"`);
            continue;
          }

          const currentNotes = String(target.notes ?? '').trimEnd();
          const updatedNotes = currentNotes
            ? `${currentNotes}\n- ${entry.detailText}`
            : `- ${entry.detailText}`;

          const { error: upErr } = await supabase
            .from('admin_roadmap')
            .update({ notes: updatedNotes, updated_at: nowIso })
            .eq('id', target.id);

          if (upErr) {
            errors.push(`Fehler beim Anhängen an "${target.title}": ${upErr.message}`);
          } else {
            target.notes = updatedNotes;
            target.updated_at = nowIso;
            localItemsMap.set(target.id, target);
            appendedCount += 1;
          }
        } else if (entry.type === 'CREATE') {
          const newRow = {
            title: entry.title,
            category: entry.category,
            target_date: entry.targetDate || null,
            status: entry.status,
            notes: entry.notes || '',
            updated_at: nowIso,
          };

          const { data: inserted, error: insErr } = await supabase
            .from('admin_roadmap')
            .insert(newRow)
            .select('*')
            .maybeSingle();

          if (insErr) {
            errors.push(`Fehler beim Anlegen von "${entry.title}": ${insErr.message}`);
          } else {
            if (inserted?.id) {
              localItemsMap.set(inserted.id, inserted);
            }
            createdCount += 1;
          }
        } else {
          errors.push(`Zeile nicht erkannt (erwartet "+ [Suchbegriff] ..." oder "* [Kategorie | Datum] Titel: Notiz"): "${entry.raw}"`);
        }
      }

      await fetchRoadmap();

      if (errors.length > 0) {
        setError(errors.join(' | '));
      }
      if (appendedCount > 0 || createdCount > 0) {
        setNotice(
          `⚡ Quick-Inbox verarbeitet: ${createdCount} neue Themen angelegt, ${appendedCount} Ergänzungen angehängt.`
        );
        if (errors.length === 0) {
          setInboxText('');
        }
      }
    } catch (err) {
      setError(`Fehler beim Verarbeiten der Quick-Inbox: ${err.message}`);
    } finally {
      setInboxBusy(false);
    }
  };

  // Filtered and Sorted Items (target_date chronologically at the top)
  const filteredAndSortedItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = items.filter((item) => {
      if (filterStatus !== 'ALL' && item.status !== filterStatus) return false;
      if (filterCategory !== 'ALL' && item.category !== filterCategory) return false;
      if (q) {
        const hay = `${item.title ?? ''} ${item.notes ?? ''} ${item.category ?? ''} ${item.status ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const hasDateA = Boolean(a.target_date);
      const hasDateB = Boolean(b.target_date);

      if (hasDateA && !hasDateB) return -1;
      if (!hasDateA && hasDateB) return 1;
      if (hasDateA && hasDateB) {
        const cmpDate = String(a.target_date).localeCompare(String(b.target_date));
        if (cmpDate !== 0) return cmpDate;
      }

      const timeA = a.updated_at ? Date.parse(a.updated_at) : 0;
      const timeB = b.updated_at ? Date.parse(b.updated_at) : 0;
      return timeB - timeA;
    });
  }, [items, filterStatus, filterCategory, searchQuery]);

  // Counts for filter badges
  const statusCounts = useMemo(() => {
    const counts = { ALL: items.length };
    for (const s of STATUS_OPTIONS) counts[s.value] = 0;
    for (const item of items) {
      const st = item.status || 'IDEA';
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
  }, [items]);

  const categoryCounts = useMemo(() => {
    const counts = { ALL: items.length };
    for (const c of CATEGORY_OPTIONS) counts[c] = 0;
    for (const item of items) {
      const cat = item.category || 'Architektur';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [items]);

  // Grouped view if enabled
  const groupedSections = useMemo(() => {
    if (groupByMode === 'status') {
      return STATUS_OPTIONS.map((st) => ({
        key: st.value,
        title: st.label,
        items: filteredAndSortedItems.filter((i) => (i.status || 'IDEA') === st.value),
      })).filter((g) => g.items.length > 0);
    }
    if (groupByMode === 'category') {
      const allCats = [...new Set([...CATEGORY_OPTIONS, ...filteredAndSortedItems.map((i) => i.category).filter(Boolean)])];
      return allCats
        .map((cat) => ({
          key: cat,
          title: cat,
          items: filteredAndSortedItems.filter((i) => (i.category || 'Architektur') === cat),
        }))
        .filter((g) => g.items.length > 0);
    }
    return [{ key: 'ALL', title: null, items: filteredAndSortedItems }];
  }, [groupByMode, filteredAndSortedItems]);

  return (
    <div className="flex flex-col gap-5 text-zinc-200">
      {/* Notice & Error Banners */}
      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-[#00ff66]/30 bg-[#00ff66]/10 px-4 py-2.5 text-xs text-[#00ff66]">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="text-zinc-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="text-zinc-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* ==================== 1. QUICK-INBOX (Google Keep / Gemini Import-Box) ==================== */}
      <div className="rounded-2xl border border-[#00ff66]/30 bg-[#121413] p-4 shadow-lg">
        <div
          onClick={() => setInboxOpen((prev) => !prev)}
          className="flex cursor-pointer select-none items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">⚡</span>
            <div>
              <h2 className="text-sm font-bold text-white">
                Quick-Inbox (Aus Google Keep / Gemini einfügen)
              </h2>
              <p className="text-[11px] font-mono text-zinc-400">
                <span className="text-[#00ff66]">+ [Suchbegriff] Text…</span> ergänzt bestehendes Thema ·{' '}
                <span className="text-sky-300">* [Kategorie | YYYY-MM-DD] Titel: Notiz</span> legt neues Thema an
              </p>
            </div>
          </div>
          <span className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-mono text-zinc-300">
            {inboxOpen ? '▲ Einklappen' : '▼ Aufklappen'}
          </span>
        </div>

        {inboxOpen && (
          <div className="mt-3 flex flex-col gap-3 border-t border-zinc-800/80 pt-3">
            <textarea
              value={inboxText}
              onChange={(e) => setInboxText(e.target.value)}
              rows={4}
              placeholder={
                '+ [Projekt Asia] Glossar für Eigennamen anlegen\n* [Architektur | 2026-11-15] Neues Feature: Beschreibung der Idee\n* [Hub & Content] Trophy-Radar Widget: Kurze Notiz'
              }
              className="w-full resize-y rounded-xl border border-zinc-700/80 bg-zinc-950/90 p-3 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-[#00ff66] focus:outline-none"
            />

            {/* Live Parser Preview */}
            {parsedInboxLines.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-2.5 text-[11px] font-mono flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                  Vorschau ({parsedInboxLines.length} Zeilen erkannt):
                </span>
                {parsedInboxLines.map((line) => (
                  <div key={line.index} className="flex items-center gap-2 truncate">
                    {line.type === 'APPEND' ? (
                      <>
                        <span className="rounded bg-[#00ff66]/15 px-1.5 py-0.5 text-[10px] text-[#00ff66] border border-[#00ff66]/30">
                          + ERGÄNZUNG
                        </span>
                        <span className="text-zinc-300">
                          Suchbegriff <strong className="text-white">&quot;{line.searchTerm}&quot;</strong> →{' '}
                          {line.targetItem ? (
                            <span className="text-[#00ff66]">✓ Treffer: &quot;{line.targetItem.title}&quot;</span>
                          ) : (
                            <span className="text-red-400">⚠ Kein Thema gefunden!</span>
                          )}
                        </span>
                      </>
                    ) : line.type === 'CREATE' ? (
                      <>
                        <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300 border border-sky-500/30">
                          * NEU
                        </span>
                        <span className="text-zinc-300">
                          [{line.category}{line.targetDate ? ` | 📅 ${line.targetDate}` : ''}] <strong className="text-white">{line.title}</strong>
                          {line.notes ? ` — ${line.notes}` : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300 border border-red-500/30">
                          ? UNBEKANNT
                        </span>
                        <span className="text-zinc-400">{line.raw}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowNewForm((prev) => !prev)}
                className="rounded-xl border border-zinc-700 bg-zinc-800/90 px-3 py-2 text-xs font-mono text-zinc-300 hover:border-zinc-500 hover:text-white transition"
              >
                {showNewForm ? '✕ Manuelles Formular schließen' : '➕ Einzelnes Thema per Formular anlegen'}
              </button>

              <button
                type="button"
                disabled={inboxBusy || parsedInboxLines.length === 0}
                onClick={handleProcessInbox}
                className="flex items-center gap-2 rounded-xl bg-[#00ff66] px-4 py-2 text-xs font-bold text-black hover:bg-[#00ff66]/90 disabled:opacity-40 transition shadow-lg shadow-[#00ff66]/10"
              >
                <span>⚡</span>
                <span>{inboxBusy ? 'Sortiere ein…' : 'In Datenbank einsortieren'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Optional Manual Form */}
      {showNewForm && (
        <form
          onSubmit={handleCreateManual}
          className="rounded-2xl border border-zinc-700 bg-[#141618] p-4 flex flex-col gap-3"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Neuen Roadmap-Eintrag anlegen
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Titel des Themas…"
              className="sm:col-span-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-mono text-zinc-200 focus:border-[#00ff66] focus:outline-none"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-mono text-zinc-200 focus:border-[#00ff66] focus:outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={newTargetDate}
                onChange={(e) => setNewTargetDate(e.target.value)}
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:border-[#00ff66] focus:outline-none"
              />
            </div>
          </div>
          <textarea
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            rows={2}
            placeholder="Optionale Start-Notizen…"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#00ff66] px-4 py-1.5 text-xs font-bold text-black hover:bg-[#00ff66]/90"
            >
              ✓ Anlegen
            </button>
          </div>
        </form>
      )}

      {/* ==================== 2. FILTER & GRUPPIERUNGS-LEISTE ==================== */}
      <div className="rounded-2xl border border-zinc-800 bg-[#121314] p-3.5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mr-1">
              Status:
            </span>
            <button
              type="button"
              onClick={() => setFilterStatus('ALL')}
              className={`rounded-xl border px-2.5 py-1 text-[11px] font-mono font-bold transition ${
                filterStatus === 'ALL'
                  ? 'border-[#00ff66]/50 bg-[#00ff66]/15 text-[#00ff66]'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Alle ({statusCounts.ALL || 0})
            </button>
            {STATUS_OPTIONS.map((st) => (
              <button
                key={st.value}
                type="button"
                onClick={() => setFilterStatus(st.value)}
                className={`rounded-xl border px-2.5 py-1 text-[11px] font-mono font-bold transition ${
                  filterStatus === st.value
                    ? st.badgeClass
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {st.label} ({statusCounts[st.value] || 0})
              </button>
            ))}
          </div>

          {/* Search + GroupBy + Refresh */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Themen & Notizen durchsuchen…"
              className="w-48 sm:w-60 rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
            />
            <select
              value={groupByMode}
              onChange={(e) => setGroupByMode(e.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-mono text-zinc-300 focus:border-[#00ff66] focus:outline-none"
              title="Gruppierung wählen"
            >
              <option value="none">Ansicht: Chronologisch (Datum oben)</option>
              <option value="status">Gruppieren nach: Status</option>
              <option value="category">Gruppieren nach: Kategorie</option>
            </select>
            <button
              type="button"
              onClick={fetchRoadmap}
              className="rounded-xl border border-zinc-700 bg-zinc-800 p-1.5 text-xs text-zinc-300 hover:text-[#00ff66]"
              title="Neu laden"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-800/70 pt-2.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mr-1">
            Kategorie:
          </span>
          <button
            type="button"
            onClick={() => setFilterCategory('ALL')}
            className={`rounded-xl border px-2.5 py-1 text-[11px] font-mono font-bold transition ${
              filterCategory === 'ALL'
                ? 'border-[#00ff66]/50 bg-[#00ff66]/15 text-[#00ff66]'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Alle Kategorien
          </button>
          {CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              className={`rounded-xl border px-2.5 py-1 text-[11px] font-mono font-bold transition ${
                filterCategory === cat
                  ? getCategoryStyle(cat)
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {cat} ({categoryCounts[cat] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* ==================== 3. ROADMAP KARTEN-LISTE ==================== */}
      {loading ? (
        <div className="flex h-48 items-center justify-center font-mono text-sm text-zinc-500 animate-pulse">
          Lade Roadmap &amp; Ideen…
        </div>
      ) : filteredAndSortedItems.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-[#121314] px-6 py-12 text-center">
          <p className="text-sm font-bold text-white">Keine Einträge für diesen Filter gefunden</p>
          <p className="mt-1 text-xs text-zinc-500">
            Nutze die ⚡ Quick-Inbox oben oder wähle einen anderen Status-/Kategorie-Filter.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groupedSections.map((section) => (
            <div key={section.key} className="flex flex-col gap-3">
              {section.title && (
                <div className="flex items-center gap-2 border-b border-zinc-800 pb-1.5 px-1">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                    {section.title}
                  </h3>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
                    {section.items.length}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                {section.items.map((item) => (
                  <RoadmapCard
                    key={item.id}
                    item={item}
                    onUpdate={handleUpdateItem}
                    onDelete={handleDeleteItem}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
