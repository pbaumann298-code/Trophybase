import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { useLocale } from '../context/LocaleContext';
import {
  getYouTubeEmbedUrl,
  getYouTubeVideoId,
  isPublicVideoUrl,
  resolveProductionVideoAndNote,
} from '../utils/videoUrl';
import YouTubeEmbed, { YouTubeThumb, YoutubePlayIcon } from '../components/YouTubeEmbed';
import { useVisibility } from '../context/VisibilityContext';
import { useGuideVideo } from '../context/GuideVideoContext';
import { guideProgressKey } from '../lib/guideProgressStorage';
import { buildGuideGroupTree } from '../lib/guideData';
import Reportable from '../components/Reportable';
import TrophyArtwork from '../components/TrophyArtwork';

function cleanGuideRowId(item) {
  const raw = String(item?.guide_id || item?.id || '').trim();
  return raw.replace(/^(?:walkthrough|collectible|boss|guide-s\d+)-/, '');
}

function ProductionInlineRowEditor({
  item,
  prodNote,
  videoUrl,
  onSave,
}) {
  const [noteVal, setNoteVal] = useState(prodNote || '');
  const [urlVal, setUrlVal] = useState(videoUrl || '');
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setNoteVal(prodNote || '');
  }, [prodNote]);

  useEffect(() => {
    setUrlVal(videoUrl || '');
  }, [videoUrl]);

  const commit = async (nextNoteRaw, nextUrlRaw) => {
    const nextNote = String(nextNoteRaw ?? '').trim();
    const nextUrl = String(nextUrlRaw ?? '').trim();
    if (nextNote === String(prodNote ?? '').trim() && nextUrl === String(videoUrl ?? '').trim()) {
      return;
    }
    setSaving(true);
    setErrorMsg('');
    setSavedOk(false);
    const err = await onSave(item, nextNote, nextUrl);
    setSaving(false);
    if (err) {
      setErrorMsg(err.message || 'Fehler beim Speichern');
    } else {
      setSavedOk(true);
      window.setTimeout(() => setSavedOk(false), 1800);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const hasNote = Boolean(noteVal.trim());
  const hasValidUrl = isPublicVideoUrl(urlVal);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
         alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
        marginLeft: 'auto',
      }}
    >
      {hasNote && (
        <span
          title={`Take / Rohdatei: ${noteVal.trim()}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 7px',
            borderRadius: '5px',
            fontSize: '11px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            backgroundColor: 'rgba(245, 158, 11, 0.16)',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            color: '#fcd34d',
            whiteSpace: 'nowrap',
          }}
        >
          🎬 {noteVal.trim()}
        </span>
      )}

      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          backgroundColor: hasNote ? 'rgba(245, 158, 11, 0.1)' : '#121314',
          border: hasNote ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid #27272a',
          borderRadius: '6px',
          padding: '2px 6px',
        }}
        title="🎬 Take / Rohdatei (prod_note, z. B. 03_Erde, 14:20)"
      >
        <span style={{ fontSize: '11px' }} aria-hidden>
          🎬
        </span>
        <input
          type="text"
          value={noteVal}
          placeholder="Take / Rohdatei (z. B. 03_Erde, 14:20)"
          onChange={(e) => setNoteVal(e.target.value)}
          onBlur={() => commit(noteVal, urlVal)}
          onKeyDown={handleKeyDown}
          disabled={saving}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: hasNote ? '#fde68a' : '#e4e4e7',
            fontFamily: 'monospace',
            fontSize: '11px',
            width: '155px',
          }}
        />
      </label>

      {hasValidUrl && (
        <span
          title={`YouTube-URL verknüpft: ${urlVal.trim()}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            padding: '2px 7px',
            borderRadius: '5px',
            fontSize: '11px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            backgroundColor: 'rgba(0, 255, 102, 0.14)',
            border: '1px solid rgba(0, 255, 102, 0.45)',
            color: '#00ff66',
            whiteSpace: 'nowrap',
          }}
        >
          ✅ Verlinkt
        </span>
      )}

      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          backgroundColor: hasValidUrl ? 'rgba(0, 255, 102, 0.08)' : '#121314',
          border: hasValidUrl ? '1px solid rgba(0, 255, 102, 0.38)' : '1px solid #27272a',
          borderRadius: '6px',
          padding: '2px 6px',
        }}
        title="🔗 YouTube-URL (video_url)"
      >
        <span style={{ fontSize: '11px' }} aria-hidden>
          {hasValidUrl ? '✅' : '🔗'}
        </span>
        <input
          type="text"
          value={urlVal}
          placeholder="YouTube-URL…"
          onChange={(e) => setUrlVal(e.target.value)}
          onBlur={() => commit(noteVal, urlVal)}
          onKeyDown={handleKeyDown}
          disabled={saving}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: hasValidUrl ? '#00ff66' : '#e4e4e7',
            fontFamily: 'monospace',
            fontSize: '11px',
            width: '150px',
          }}
        />
      </label>

      {saving && (
        <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#a1a1aa' }}>…</span>
      )}
      {savedOk && !saving && (
        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#00ff66' }} title="Gespeichert">
          ✓
        </span>
      )}
      {errorMsg && (
        <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#f87171' }} title={errorMsg}>
          ⚠️ {errorMsg}
        </span>
      )}
    </div>
  );
}

/**
 * Verknüpfung Guide-Eintrag → Trophäe.
 *
 * game_guides.trophy_id trägt die platform_achievement_id der Trophäe, zu der
 * ein Sammelgegenstand oder Boss gehört. Bisher lag die Verbindung nur in der
 * Datenbank; hier wird daraus das Trophäenbild in der Zeile plus ein
 * ausklappbarer Langtipp.
 *
 * @param {Map<string, object>} trophyById Schlüssel: platform_achievement_id
 */
function useTrophyRowExtras(trophyById) {
  const [expanded, setExpanded] = useState(() => new Set());

  const toggle = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const trophyFor = useCallback(
    (item) => {
      if (!trophyById || trophyById.size === 0) return null;
      const key = String(item?.trophy_id ?? '').trim();
      return key ? trophyById.get(key) ?? null : null;
    },
    [trophyById],
  );

  return useMemo(() => {
    /** Das Trophäenbild sitzt im Namens-Button, darf also nicht klickbar sein. */
    const renderTrophyArt = (trophy, size = 20) => {
      if (!trophy) return null;
      const name = String(trophy.trophy_name ?? '').trim();
      return (
        <TrophyArtwork
          trophy={trophy}
          size={size}
          className="rounded-sm"
          title={name ? `Trophäe: ${name}` : 'Zugehörige Trophäe'}
        />
      );
    };

    const trophyIdOf = (trophy) =>
      String(trophy?.platform_achievement_id ?? trophy?.trophy_id ?? '').trim();

    /**
     * Homogene Gruppe: alle Einträge zeigen auf dieselbe Trophäe.
     * @returns {{ trophy: object, tip: string }|null}
     */
    const sharedGroupTrophy = (items) => {
      const validItems = (items ?? []).filter((item) => String(item?.trophy_id ?? '').trim());
      if (validItems.length === 0) return null;
      const trophies = validItems.map(trophyFor).filter(Boolean);
      if (trophies.length !== validItems.length) return null;
      const ids = new Set(trophies.map(trophyIdOf).filter(Boolean));
      if (ids.size !== 1) return null;
      const trophy = trophies[0];
      const tip = String(trophy?.guide_tip_long ?? '').trim();
      return tip ? { trophy, tip } : { trophy, tip: '' };
    };

    const renderNameAddon = (item) => renderTrophyArt(trophyFor(item));

    /**
     * Gruppenkachel (z. B. „Waffe“ / „Jägerwerkzeuge“): Icon nur, wenn alle
     * verknüpften Einträge auf dieselbe Trophäe zeigen. Gemischte Gruppen
     * (Bosse) bleiben ohne Header-Bild – dort sitzt das Icon an der Zeile.
     */
    const renderGroupAddon = (items) => {
      const shared = sharedGroupTrophy(items);
      if (!shared) return null;
      return renderTrophyArt(shared.trophy, 22);
    };

    /**
     * Einmaliger Lang-Tipp im geöffneten Gruppenkopf, wenn die ganze Gruppe
     * dieselbe Trophäe teilt. Sonst null → Tipps bleiben an den Zeilen.
     */
    const renderGroupDetail = (items) => {
      const shared = sharedGroupTrophy(items);
      if (!shared?.tip) return null;
      const name = String(shared.trophy.trophy_name ?? '').trim();
      return (
        <div
          style={{
            margin: '0 16px 10px',
            padding: '8px 12px',
            borderLeft: '2px solid rgba(0, 255, 102, 0.3)',
            backgroundColor: 'rgba(9, 9, 11, 0.5)',
            borderRadius: '0 6px 6px 0',
            fontSize: '11px',
            lineHeight: 1.6,
            color: '#a1a1aa',
          }}
        >
          {name && (
            <span
              style={{
                color: '#00ff66',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                marginRight: '6px',
              }}
            >
              {name}:
            </span>
          )}
          {shared.tip}
        </div>
      );
    };

    const renderRowAction = (item, _dimmed, ctx = {}) => {
      if (ctx.sharedGroupTip) return null;
      const trophy = trophyFor(item);
      const tip = String(trophy?.guide_tip_long ?? '').trim();
      if (!tip) return null;

      const isOpen = expanded.has(item.id);
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggle(item.id);
          }}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Trophäen-Tipp einklappen' : 'Trophäen-Tipp ausklappen'}
          title={isOpen ? 'Tipp einklappen' : 'Tipp ausklappen'}
          style={{
            background: 'none',
            border: 'none',
            padding: '0 2px',
            cursor: 'pointer',
            color: isOpen ? '#00ff66' : '#a1a1aa',
            fontSize: '11px',
            lineHeight: 1,
            flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 150ms ease',
          }}
        >
          ▼
        </button>
      );
    };

    const renderRowDetail = (item, _dimmed, ctx = {}) => {
      if (ctx.sharedGroupTip) return null;
      if (!expanded.has(item.id)) return null;
      const trophy = trophyFor(item);
      const tip = String(trophy?.guide_tip_long ?? '').trim();
      if (!tip) return null;

      const name = String(trophy.trophy_name ?? '').trim();
      return (
        <div
          style={{
            marginLeft: '26px',
            padding: '6px 10px',
            borderLeft: '2px solid rgba(0, 255, 102, 0.3)',
            backgroundColor: 'rgba(9, 9, 11, 0.5)',
            borderRadius: '0 6px 6px 0',
            fontSize: '11px',
            lineHeight: 1.6,
            color: '#a1a1aa',
          }}
        >
          {name && (
            <span
              style={{
                color: '#00ff66',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                marginRight: '6px',
              }}
            >
              {name}:
            </span>
          )}
          {tip}
        </div>
      );
    };

    return {
      renderNameAddon,
      renderGroupAddon,
      renderGroupDetail,
      renderRowAction,
      renderRowDetail,
    };
  }, [trophyFor, expanded, toggle]);
}

/**
 * Generisches 40/60 Split-Screen-Layout.
 * @param {'chronological_group'|'category_group'} groupByField
 */
function SplitScreenGuideKacheln({
  itemsData = [],
  getDisplayName,
  nameColumnHeader,
  renderNameAddon,
  /** Icon auf der Gruppenkachel, wenn die ganze Gruppe eine Trophäe teilt. */
  renderGroupAddon,
  /** Einmaliger Lang-Tipp oben im geöffneten Gruppenkopf (homogene trophy_id). */
  renderGroupDetail,
  /** Interaktives Element neben dem Namen – gehört NICHT in den Namens-Button. */
  renderRowAction,
  /** Aufklappbarer Block unter der Zeile. */
  renderRowDetail,
  emptyVideoMessage,
  groupHeaderIcon = '📍',
  localisationHeaderIcon = '🗺️',
  groupByField = 'category_group',
  listTitle = 'Guide-Checkliste',
  hideCompleted = false,
  setHideCompleted,
  completedItems = {},
  toggleCompleted,
  embedInAccordion = false,
  gameId = '',
  reportEntityType = 'guide_item',
  reportKeyField = 'guide_id',
  /** Kachel-Überschrift weglassen: die umgebende Zeile ist schon die Gruppe. */
  hideGroupHeader = false,
  /** Admin: Schritt löschen (item) => void|Promise */
  onDeleteStep = null,
  /** Admin: Produktions-/Roadmap-Modus */
  isAdmin = false,
  isDraftMode = false,
  onProductionMetaSaved = null,
}) {
  const { t } = useLocale();
  const { toggleHidden, isHidden, getEntryState, itemKey } = useVisibility();
  const { notifyVideoStarted, notifyVideoCleared } = useGuideVideo();
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedLocalisations, setExpandedLocalisations] = useState({});
  const [activeVideos, setActiveVideos] = useState({});
  const [productionMode, setProductionMode] = useState(() => Boolean(isAdmin && isDraftMode));
  const [localProdOverrides, setLocalProdOverrides] = useState({});
  /** 'all' | 'open' | 'recorded' | 'linked' */
  const [prodStatusFilter, setProdStatusFilter] = useState('all');
  const [prodTakeQuery, setProdTakeQuery] = useState('');

  useEffect(() => {
    if (isAdmin && isDraftMode) {
      setProductionMode(true);
    }
  }, [isAdmin, isDraftMode]);

  const showProdTools = Boolean(isAdmin && productionMode);

  const normalizedItemsData = useMemo(
    () =>
      (itemsData ?? []).map((item) => {
        const rowId = cleanGuideRowId(item);
        const override = rowId ? localProdOverrides[rowId] : null;
        const rawVideo = override?.video_url !== undefined ? override.video_url : item?.video_url;
        const rawNote = override?.prod_note !== undefined ? override.prod_note : item?.prod_note;
        const { video_url: safeVideoUrl, prod_note: safeProdNote } = resolveProductionVideoAndNote(
          rawVideo,
          rawNote,
        );
        return {
          ...item,
          video_url: safeVideoUrl,
          prod_note: safeProdNote,
        };
      }),
    [itemsData, localProdOverrides],
  );

  const getItemProdStatus = useCallback((item) => {
    const hasVideo = isPublicVideoUrl(item?.video_url);
    const hasNote = Boolean(String(item?.prod_note ?? '').trim());
    if (hasVideo) return 'linked';
    if (hasNote) return 'recorded';
    return 'open';
  }, []);

  const prodCounts = useMemo(() => {
    let open = 0;
    let recorded = 0;
    let linked = 0;
    for (const item of normalizedItemsData) {
      const status = getItemProdStatus(item);
      if (status === 'linked') linked += 1;
      else if (status === 'recorded') recorded += 1;
      else open += 1;
    }
    return {
      total: normalizedItemsData.length,
      open,
      recorded,
      linked,
    };
  }, [normalizedItemsData, getItemProdStatus]);

  const distinctTakes = useMemo(() => {
    const set = new Set();
    for (const item of normalizedItemsData) {
      const raw = String(item?.prod_note ?? '').trim();
      if (!raw) continue;
      const baseTake = raw.split(',')[0].trim();
      if (baseTake) set.add(baseTake);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
  }, [normalizedItemsData]);

  const handleSaveProductionMeta = useCallback(
    async (item, nextProdNote, nextVideoUrl) => {
      const rowId = cleanGuideRowId(item);
      if (!rowId) return new Error('Keine gültige Guide-Zeilen-ID gefunden.');
      const { video_url: safeVideoUrl, prod_note: safeProdNote } = resolveProductionVideoAndNote(
        nextVideoUrl,
        nextProdNote,
      );
      const { error } = await supabase.rpc('tb_update_guide_production_meta', {
        p_guide_row_id: rowId,
        p_prod_note: safeProdNote,
        p_video_url: safeVideoUrl,
      });
      if (error) return error;

      setLocalProdOverrides((prev) => ({
        ...prev,
        [rowId]: { prod_note: safeProdNote, video_url: safeVideoUrl },
      }));
      onProductionMetaSaved?.(rowId, { prod_note: safeProdNote, video_url: safeVideoUrl });
      return null;
    },
    [onProductionMetaSaved],
  );

  // Fortschritt/Sichtbarkeit hängen an der guide_id, damit ein in zwei Reitern
  // gelisteter Eintrag (sheet_types [1, 2]) nur einmal abgehakt werden muss.
  const isItemCompleted = (item) => !!completedItems[guideProgressKey(item)];

  const isProdFilterActive =
    showProdTools && (prodStatusFilter !== 'all' || Boolean(prodTakeQuery.trim()));

  const isItemShown = (item) => {
    if (hideCompleted && isItemCompleted(item)) return false;
    if (!getEntryState(itemKey(guideProgressKey(item))).visible) return false;
    if (showProdTools) {
      if (prodStatusFilter !== 'all' && getItemProdStatus(item) !== prodStatusFilter) {
        return false;
      }
      const needle = prodTakeQuery.trim().toLowerCase();
      if (needle) {
        const note = String(item?.prod_note ?? '').toLowerCase();
        if (!note.includes(needle)) return false;
      }
    }
    return true;
  };

  // Gebiets-Ebene (localisation) über den Gruppen-Kacheln. Fehlt sie – oder
  // gilt sie in diesem Reiter nicht – liefert buildGuideGroupTree einen
  // Abschnitt mit leerem Namen; dann wird flach gerendert.
  const localisationSections = buildGuideGroupTree(
    normalizedItemsData.filter(isItemShown),
    groupByField,
  );
  const hasSingleLocalisation = localisationSections.length === 1;

  const isLocalisationExpanded = (localisation) =>
    isProdFilterActive || (expandedLocalisations[localisation] ?? hasSingleLocalisation);

  const toggleLocalisation = (localisation) => {
    setExpandedLocalisations((prev) => ({
      ...prev,
      [localisation]: !(prev[localisation] ?? hasSingleLocalisation),
    }));
  };

  const toggleGroup = (groupKey) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const selectItemVideo = (groupKey, item) => {
    if (!isPublicVideoUrl(item.video_url)) return;
    const embedUrl = getYouTubeEmbedUrl(item.video_url, item.timestamp, { autoplay: true });
    if (!embedUrl) return;
    setActiveVideos((prev) => ({
      ...prev,
      [groupKey]: { itemId: item.id, embedUrl },
    }));
    notifyVideoStarted();
  };

  const hasAnyActiveVideo = Object.values(activeVideos).some((v) => v?.embedUrl);

  useEffect(() => {
    if (!hasAnyActiveVideo) {
      notifyVideoCleared();
    }
  }, [hasAnyActiveVideo, notifyVideoCleared]);

  useEffect(() => () => notifyVideoCleared(), [notifyVideoCleared]);

  const renderGroupBox = (group) => {
    const isExpanded = hideGroupHeader || isProdFilterActive || !!expandedGroups[group.key];
    const items = group.items;
    const activeVideo = activeVideos[group.key];
    const activeItem = activeVideo ? items.find((i) => i.id === activeVideo.itemId) : null;
    const embedUrl = activeVideo?.embedUrl ?? null;
    const previewItem = items.find((item) => isPublicVideoUrl(item.video_url));
    const previewVideoId = previewItem ? getYouTubeVideoId(previewItem.video_url) : null;

    if (items.length === 0) return null;

    const groupTipNode = renderGroupDetail ? renderGroupDetail(items) : null;
    const rowTipCtx = { sharedGroupTip: Boolean(groupTipNode) };

    return (
      <div
        key={group.key}
        className="category-box"
        style={
          hideGroupHeader
            ? { marginBottom: '8px', overflow: 'hidden' }
            : {
                backgroundColor: '#1a1b1c',
                border: '1px solid #27272a',
                borderRadius: '16px',
                marginBottom: '16px',
                overflow: 'hidden',
              }
        }
      >
        {!hideGroupHeader && (
        <button
          type="button"
          onClick={() => toggleGroup(group.key)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            color: '#00ff66',
            margin: 0,
            padding: '15px 20px',
            backgroundColor: '#121314',
            border: 'none',
            borderBottom: isExpanded ? '1px solid #27272a' : 'none',
            fontSize: '14px',
            fontFamily: 'monospace',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            {groupHeaderIcon} {group.name}
            {renderGroupAddon ? renderGroupAddon(items) : null}
            <span style={{ color: '#71717a', fontSize: '11px' }}>({items.length})</span>
          </span>
          <span style={{ color: '#71717a', fontSize: '12px' }} aria-hidden>
            {isExpanded ? '▲' : '▼'}
          </span>
        </button>
        )}

        {isExpanded && (
          <div className="guide-split guide-split--expanded">
            <div className="guide-split__list">
              {groupTipNode}
              <table className="guide-split__table">
                <thead className="guide-split__thead">
                  <tr
                    style={{
                      color: '#71717a',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      fontFamily: 'monospace',
                    }}
                  >
                    <th>{nameColumnHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const progressKey = guideProgressKey(item);
                    const visKey = itemKey(progressKey);
                    const { dimmed } = getEntryState(visKey);
                    const isCompleted = isItemCompleted(item);
                    const displayName = getDisplayName(item);
                    const reportKey = String(item.guide_sequence ?? item.sort_order ?? '');
                    const userHidden = isHidden(visKey);
                    const isActive = activeVideo?.itemId === item.id;
                    const hasVideo = isPublicVideoUrl(item.video_url);
                    const rowDimmed = dimmed || isCompleted;

                    return (
                      <tr
                        key={item.id}
                        className="guide-split__row"
                        style={{
                          opacity: rowDimmed ? 0.6 : 1,
                          backgroundColor: isActive ? 'rgba(0, 255, 102, 0.06)' : 'transparent',
                        }}
                      >
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              flexWrap: showProdTools ? 'wrap' : 'nowrap',
                            }}
                          >
                            {typeof toggleCompleted === 'function' && (
                              <input
                                type="checkbox"
                                checked={isCompleted}
                                onChange={() => toggleCompleted(progressKey)}
                                style={{
                                  accentColor: '#00ff66',
                                  cursor: 'pointer',
                                  width: '16px',
                                  height: '16px',
                                  flexShrink: 0,
                                }}
                                aria-label={
                                  isCompleted ? 'Als offen markieren' : 'Als erledigt markieren'
                                }
                              />
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleHidden(visKey);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: userHidden ? '#71717a' : '#00ff66',
                                fontSize: '14px',
                                flexShrink: 0,
                              }}
                              aria-label={userHidden ? 'Eintrag einblenden' : 'Eintrag ausblenden'}
                              title={userHidden ? 'Einblenden' : 'Ausblenden'}
                            >
                              {userHidden ? '👁️‍🗨️' : '👁️'}
                            </button>
                            <button
                              type="button"
                              onClick={() => selectItemVideo(group.key, item)}
                              disabled={!hasVideo}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: hasVideo ? 'pointer' : 'default',
                                fontSize: '13px',
                                color: rowDimmed
                                  ? '#71717a'
                                  : isActive
                                    ? '#00ff66'
                                    : hasVideo
                                      ? '#e4e4e7'
                                      : '#a1a1aa',
                                textDecoration: isCompleted ? 'line-through' : 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                flexWrap: 'wrap',
                                textAlign: 'left',
                                fontWeight: isActive ? 'bold' : 'normal',
                              }}
                            >
                              {gameId && reportKey ? (
                                <Reportable
                                  as="span"
                                  source={gameId}
                                  type={reportEntityType}
                                  reportKey={reportKey}
                                  field="name"
                                >
                                  {displayName}
                                </Reportable>
                              ) : (
                                displayName
                              )}
                              {renderNameAddon ? renderNameAddon(item, rowDimmed) : null}
                            </button>
                            {renderRowAction ? renderRowAction(item, rowDimmed, rowTipCtx) : null}
                            {showProdTools && (
                              <ProductionInlineRowEditor
                                item={item}
                                prodNote={item.prod_note}
                                videoUrl={item.video_url}
                                onSave={handleSaveProductionMeta}
                              />
                            )}
                            {typeof onDeleteStep === 'function' ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteStep(item);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: '#71717a',
                                  fontSize: '16px',
                                  lineHeight: 1,
                                  padding: '0 2px',
                                  flexShrink: 0,
                                }}
                                aria-label="Schritt löschen"
                                title="Schritt löschen"
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                          {renderRowDetail ? renderRowDetail(item, rowDimmed, rowTipCtx) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="guide-split__video">
              <div className="guide-split__video-inner">
                {embedUrl ? (
                  <YouTubeEmbed
                    key={`${group.key}-${activeVideo?.itemId || 'default'}-${embedUrl}`}
                    src={embedUrl}
                    title={activeItem ? getDisplayName(activeItem) : group.name}
                  />
                ) : previewVideoId ? (
                  <button
                    type="button"
                    className="youtube-poster"
                    onClick={() => selectItemVideo(group.key, previewItem)}
                  >
                    <YouTubeThumb videoId={previewVideoId} alt="" className="youtube-poster__thumb" />
                    <span className="youtube-poster__play">
                      <YoutubePlayIcon />
                    </span>
                    <span className="youtube-poster__hint">
                      {activeVideo
                        ? emptyVideoMessage
                        : t('videoPosterHintPreview')}
                    </span>
                  </button>
                ) : (
                  <div className="youtube-consent-gate">
                    {activeVideo
                      ? emptyVideoMessage
                      : t('videoPosterHintItem')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderLocalisationSection = (section) => {
    if (section.itemCount === 0) return null;
    if (hideGroupHeader || !section.localisation) {
      return (
        <React.Fragment key="guide-section-ungrouped">
          {section.groups.map(renderGroupBox)}
        </React.Fragment>
      );
    }

    const isExpanded = isLocalisationExpanded(section.localisation);

    return (
      <div key={section.localisation} className="guide-localisation">
        <button
          type="button"
          className="guide-localisation__header"
          onClick={() => toggleLocalisation(section.localisation)}
          aria-expanded={isExpanded}
        >
          <span>
            {localisationHeaderIcon} {section.localisation}
            <span className="guide-localisation__count">
              ({section.groups.length} · {section.itemCount})
            </span>
          </span>
          <span className="guide-localisation__chevron" aria-hidden>
            {isExpanded ? '▲' : '▼'}
          </span>
        </button>

        {isExpanded && (
          <div className="guide-localisation__body">{section.groups.map(renderGroupBox)}</div>
        )}
      </div>
    );
  };

  return (
    <div className={`collectibles-tab guide-landscape-root ${embedInAccordion ? '' : ''}`} style={{ padding: '0px', color: '#fff' }}>
      <div
        style={
          embedInAccordion
            ? { marginBottom: '16px' }
            : {
                backgroundColor: '#1a1b1c',
                padding: '20px',
                borderRadius: '16px',
                border: '1px solid #27272a',
                marginBottom: '24px',
              }
        }
      >
        {!embedInAccordion && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: '13px',
                fontWeight: 'bold',
                color: '#a1a1aa',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {listTitle}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setProductionMode((prev) => !prev)}
                  aria-pressed={productionMode}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 10px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    cursor: 'pointer',
                    backgroundColor: productionMode ? 'rgba(245, 158, 11, 0.16)' : '#121314',
                    border: productionMode
                      ? '1px solid rgba(245, 158, 11, 0.5)'
                      : '1px solid #27272a',
                    color: productionMode ? '#fcd34d' : '#a1a1aa',
                  }}
                >
                  🎬 Produktions-Modus {productionMode ? 'AN' : 'AUS'}
                </button>
              )}
              {typeof setHideCompleted === 'function' && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#a1a1aa',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={hideCompleted}
                    onChange={(e) => setHideCompleted(e.target.checked)}
                    style={{
                      accentColor: '#00ff66',
                      cursor: 'pointer',
                      width: '16px',
                      height: '16px',
                    }}
                  />
                  {t('hideCompleted')}
                </label>
              )}
            </div>
          </div>
        )}

        {embedInAccordion && (isAdmin || typeof setHideCompleted === 'function') && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              marginBottom: '12px',
            }}
          >
            <div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setProductionMode((prev) => !prev)}
                  aria-pressed={productionMode}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 10px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    cursor: 'pointer',
                    backgroundColor: productionMode ? 'rgba(245, 158, 11, 0.16)' : '#121314',
                    border: productionMode
                      ? '1px solid rgba(245, 158, 11, 0.5)'
                      : '1px solid #27272a',
                    color: productionMode ? '#fcd34d' : '#a1a1aa',
                  }}
                >
                  🎬 Produktions-Modus {productionMode ? 'AN' : 'AUS'}
                </button>
              )}
            </div>
            {typeof setHideCompleted === 'function' && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={hideCompleted}
                  onChange={(e) => setHideCompleted(e.target.checked)}
                  style={{
                    accentColor: '#00ff66',
                    cursor: 'pointer',
                    width: '16px',
                    height: '16px',
                  }}
                />
                {t('hideCompleted')}
              </label>
            )}
          </div>
        )}

        {showProdTools && (
          <div
            style={{
              backgroundColor: '#121314',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                {[
                  {
                    id: 'all',
                    label: `Gesamt: ${prodCounts.total}`,
                    title: 'Alle Guide-Zeilen anzeigen',
                    activeBg: 'rgba(228, 228, 231, 0.14)',
                    activeBorder: '#a1a1aa',
                    activeColor: '#ffffff',
                  },
                  {
                    id: 'open',
                    label: `🎥 Noch offen (weder Take noch Video): ${prodCounts.open}`,
                    title: 'Noch offen: weder prod_note noch YouTube-URL gepflegt',
                    activeBg: 'rgba(248, 113, 113, 0.15)',
                    activeBorder: 'rgba(248, 113, 113, 0.55)',
                    activeColor: '#fca5a5',
                  },
                  {
                    id: 'recorded',
                    label: `📝 Abgedreht / Im Schnitt (hat prod_note, noch keine YouTube-URL): ${prodCounts.recorded}`,
                    title: 'Abgedreht / Im Schnitt: hat prod_note, aber noch keine YouTube-URL',
                    activeBg: 'rgba(245, 158, 11, 0.18)',
                    activeBorder: 'rgba(245, 158, 11, 0.6)',
                    activeColor: '#fcd34d',
                  },
                  {
                    id: 'linked',
                    label: `✅ Fertig verlinkt (hat YouTube-URL): ${prodCounts.linked}`,
                    title: 'Fertig verlinkt: hat gültige YouTube-URL',
                    activeBg: 'rgba(0, 255, 102, 0.14)',
                    activeBorder: 'rgba(0, 255, 102, 0.55)',
                    activeColor: '#00ff66',
                  },
                ].map((btn) => {
                  const active = prodStatusFilter === btn.id;
                  return (
                    <button
                      key={btn.id}
                      type="button"
                      title={btn.title}
                      onClick={() =>
                        setProdStatusFilter((prev) =>
                          prev === btn.id && btn.id !== 'all' ? 'all' : btn.id,
                        )
                      }
                      style={{
                        padding: '5px 10px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        fontWeight: active ? 'bold' : 'normal',
                        cursor: 'pointer',
                        backgroundColor: active ? btn.activeBg : '#1a1b1c',
                        border: active ? `1px solid ${btn.activeBorder}` : '1px solid #27272a',
                        color: active ? btn.activeColor : '#d4d4d8',
                        transition: 'all 120ms ease',
                      }}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#1a1b1c',
                    border: prodTakeQuery.trim()
                      ? '1px solid rgba(245, 158, 11, 0.55)'
                      : '1px solid #27272a',
                    borderRadius: '8px',
                    padding: '4px 8px',
                  }}
                >
                  <span style={{ fontSize: '11px' }} aria-hidden>
                    🎬
                  </span>
                  <input
                    type="text"
                    value={prodTakeQuery}
                    onChange={(e) => setProdTakeQuery(e.target.value)}
                    placeholder='Take filtern (z. B. "03_Erde")…'
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: '#fde68a',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      width: '185px',
                    }}
                  />
                  {prodTakeQuery && (
                    <button
                      type="button"
                      onClick={() => setProdTakeQuery('')}
                      title="Take-Filter zurücksetzen"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#a1a1aa',
                        cursor: 'pointer',
                        fontSize: '13px',
                        lineHeight: 1,
                        padding: 0,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {distinctTakes.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '5px' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    color: '#71717a',
                    textTransform: 'uppercase',
                    marginRight: '4px',
                  }}
                >
                  Takes:
                </span>
                {distinctTakes.map((take) => {
                  const active = prodTakeQuery.trim().toLowerCase() === take.toLowerCase();
                  return (
                    <button
                      key={take}
                      type="button"
                      onClick={() => setProdTakeQuery(active ? '' : take)}
                      style={{
                        padding: '2px 7px',
                        borderRadius: '5px',
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        fontWeight: active ? 'bold' : 'normal',
                        cursor: 'pointer',
                        backgroundColor: active
                          ? 'rgba(245, 158, 11, 0.25)'
                          : 'rgba(245, 158, 11, 0.08)',
                        border: active
                          ? '1px solid rgba(245, 158, 11, 0.7)'
                          : '1px solid rgba(245, 158, 11, 0.3)',
                        color: '#fcd34d',
                      }}
                    >
                      🎬 {take}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {localisationSections.map(renderLocalisationSection)}
    </div>
  );
}

export function CollectibleKacheln({
  collectiblesData,
  groupByField = 'category_group',
  groupHeaderIcon = '📍',
  localisationHeaderIcon = '🗺️',
  emptyVideoMessage,
  listTitle,
  hideCompleted,
  setHideCompleted,
  completedItems,
  toggleCompleted,
  embedInAccordion = false,
  gameId = '',
  reportEntityType = 'guide_item',
  trophyById,
  hideGroupHeader = false,
  onDeleteStep = null,
  isAdmin = false,
  isDraftMode = false,
  onProductionMetaSaved = null,
}) {
  const { t } = useLocale();
  const {
    renderNameAddon,
    renderGroupAddon,
    renderGroupDetail,
    renderRowAction,
    renderRowDetail,
  } = useTrophyRowExtras(trophyById);

  return (
    <SplitScreenGuideKacheln
      itemsData={collectiblesData}
      getDisplayName={(item) => item.item_name}
      nameColumnHeader={t('collectibleColumn')}
      renderNameAddon={renderNameAddon}
      renderGroupAddon={renderGroupAddon}
      renderGroupDetail={renderGroupDetail}
      renderRowAction={renderRowAction}
      renderRowDetail={renderRowDetail}
      emptyVideoMessage={emptyVideoMessage || t('videoEmptyCollectible')}
      groupHeaderIcon={groupHeaderIcon}
      localisationHeaderIcon={localisationHeaderIcon}
      groupByField={groupByField}
      listTitle={listTitle || t('completion')}
      hideCompleted={hideCompleted}
      setHideCompleted={setHideCompleted}
      completedItems={completedItems}
      toggleCompleted={toggleCompleted}
      embedInAccordion={embedInAccordion}
      gameId={gameId}
      reportEntityType={reportEntityType}
      reportKeyField="guide_id"
      hideGroupHeader={hideGroupHeader}
      onDeleteStep={onDeleteStep}
      isAdmin={isAdmin}
      isDraftMode={isDraftMode}
      onProductionMetaSaved={onProductionMetaSaved}
    />
  );
}

export function BossKacheln({
  bossesData,
  listTitle,
  hideCompleted,
  setHideCompleted,
  completedItems,
  toggleCompleted,
  embedInAccordion = false,
  gameId = '',
  trophyById,
  onDeleteStep = null,
  isAdmin = false,
  isDraftMode = false,
  onProductionMetaSaved = null,
}) {
  const { t } = useLocale();
  const trophyExtras = useTrophyRowExtras(trophyById);

  // Liegt eine verknüpfte Trophäe vor, gewinnt ihr Bild. Ohne trophy_id bleibt
  // nur die allgemeine Marke „hier gibt es eine Trophäe".
  const renderTrophyBadge = (item, dimmed) => {
    const artwork = trophyExtras.renderNameAddon(item, dimmed);
    if (artwork) return artwork;

    if (item.is_trophy_relevant !== 'Ja') return null;
    return (
      <span
        title={t('bossTrophyTitle')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          fontSize: '10px',
          fontWeight: 'bold',
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: dimmed ? '#4ade80' : '#00ff66',
          backgroundColor: 'rgba(0, 255, 102, 0.12)',
          border: '1px solid rgba(0, 255, 102, 0.35)',
          padding: '1px 5px',
          borderRadius: '4px',
          opacity: dimmed ? 0.7 : 1,
        }}
      >
        <span aria-hidden>🏆</span>
        {t('bossTrophyBadge')}
      </span>
    );
  };

  return (
    <SplitScreenGuideKacheln
      itemsData={bossesData}
      getDisplayName={(item) => item.item_name || item.boss_name}
      nameColumnHeader={t('bossColumn')}
      renderNameAddon={renderTrophyBadge}
      renderGroupAddon={trophyExtras.renderGroupAddon}
      renderGroupDetail={trophyExtras.renderGroupDetail}
      renderRowAction={trophyExtras.renderRowAction}
      renderRowDetail={trophyExtras.renderRowDetail}
      emptyVideoMessage={t('videoEmptyBoss')}
      groupHeaderIcon="⚔️"
      localisationHeaderIcon="🗺️"
      groupByField="chronological_group"
      listTitle={listTitle || t('bosses')}
      hideCompleted={hideCompleted}
      setHideCompleted={setHideCompleted}
      completedItems={completedItems}
      toggleCompleted={toggleCompleted}
      embedInAccordion={embedInAccordion}
      gameId={gameId}
      reportEntityType="boss"
      reportKeyField="guide_id"
      onDeleteStep={onDeleteStep}
      isAdmin={isAdmin}
      isDraftMode={isDraftMode}
      onProductionMetaSaved={onProductionMetaSaved}
    />
  );
}

export default CollectibleKacheln;
