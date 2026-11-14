import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { useLocale } from '../context/LocaleContext';
import {
  getYouTubeEmbedUrl,
  getYouTubeVideoId,
  isPublicVideoUrl,
  resolveProductionVideoAndNote,
} from '../utils/videoUrl';
import YouTubeEmbed, { YouTubeThumb, YoutubePlayIcon } from '../components/YouTubeEmbed';
import VideoRewindButton from '../components/VideoRewindButton';
import { useGuideVideo } from '../context/GuideVideoContext';
import { guideProgressKey } from '../lib/guideProgressStorage';
import { buildGuideGroupTree } from '../lib/guideData';
import {
  COMPLETED_TROPHY_STYLE,
  GUIDE_ROW_ORDER,
  VIDEO_TIMESTAMP_LAYOUT,
  useUserPreferences,
} from '../lib/userPreferences';
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
  const nextNote = prodNote || '';
  const nextUrl = videoUrl || '';
  const [prevNote, setPrevNote] = useState(nextNote);
  const [prevUrl, setPrevUrl] = useState(nextUrl);
  const [noteVal, setNoteVal] = useState(nextNote);
  const [urlVal, setUrlVal] = useState(nextUrl);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (nextNote !== prevNote) {
    setPrevNote(nextNote);
    setNoteVal(nextNote);
  }
  if (nextUrl !== prevUrl) {
    setPrevUrl(nextUrl);
    setUrlVal(nextUrl);
  }

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
    /** Das Trophäenbild sitzt im Namens- bzw. Aktionsbereich, darf also nicht klickbar sein. */
    const renderTrophyArt = (trophy, size = 28) => {
      if (!trophy) return null;
      const name = String(trophy.trophy_name ?? '').trim();
      return (
        <TrophyArtwork
          trophy={trophy}
          size={size}
          className="rounded-md"
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
            borderInlineStart: '2px solid rgba(0, 255, 102, 0.3)',
            backgroundColor: 'rgba(9, 9, 11, 0.5)',
            borderStartStartRadius: 0,
            borderEndStartRadius: 0,
            borderStartEndRadius: '6px',
            borderEndEndRadius: '6px',
            fontSize: '11px',
            lineHeight: 1.6,
            color: '#a1a1aa',
            textAlign: 'start',
          }}
        >
          {name && (
            <span
              style={{
                color: '#00ff66',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                marginInlineEnd: '6px',
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
            marginTop: '4px',
            padding: '6px 10px',
            borderInlineStart: '2px solid rgba(0, 255, 102, 0.3)',
            backgroundColor: 'rgba(9, 9, 11, 0.5)',
            borderStartStartRadius: 0,
            borderEndStartRadius: 0,
            borderStartEndRadius: '6px',
            borderEndEndRadius: '6px',
            fontSize: '11px',
            lineHeight: 1.6,
            color: '#a1a1aa',
            textAlign: 'start',
          }}
        >
          {name && (
            <span
              style={{
                color: '#00ff66',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                marginInlineEnd: '6px',
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
 * @param {'chronological_group'|'category_group'|'boss_group'} groupByField
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
  /** Kachel-Überschrift weglassen: die umgebende Zeile ist schon die Gruppe. */
  hideGroupHeader = false,
  /** Admin: Schritt löschen (item) => void|Promise */
  onDeleteStep = null,
  /** Admin / Creator: Produktions-/Roadmap-Modus */
  isAdmin = false,
  isCreator = false,
  isDraftMode = false,
  onProductionMetaSaved = null,
  videoLayoutFlexClass = '',
}) {
  const { globalLocale, t } = useLocale();
  const isRtl = globalLocale === 'ar';
  const {
    videoTimestampLayout,
    setVideoTimestampLayout,
    completedTrophyStyle,
    guideRowOrder,
  } = useUserPreferences();
  const { notifyVideoStarted, notifyVideoCleared } = useGuideVideo();
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedLocalisations, setExpandedLocalisations] = useState({});
  const [activeVideos, setActiveVideos] = useState({});
  const splitPlayerRefs = useRef(new Map());
  const singlePlayerRef = useRef(null);
  const setGroupPlayerRef = useCallback(
    (groupKey) => (inst) => {
      if (inst) splitPlayerRefs.current.set(groupKey, inst);
      else splitPlayerRefs.current.delete(groupKey);
    },
    [],
  );
  const videoSide = videoTimestampLayout === VIDEO_TIMESTAMP_LAYOUT.VIDEO_LEFT ? 'left' : 'right';
  const customVideoFlexClass =
    videoLayoutFlexClass &&
    videoLayoutFlexClass !== 'lg:flex-row' &&
    videoLayoutFlexClass !== 'lg:flex-row-reverse'
      ? videoLayoutFlexClass
      : '';
  const resolvedVideoFlexClass =
    customVideoFlexClass ||
    (videoSide === 'left'
      ? (isRtl ? 'lg:flex-row' : 'lg:flex-row-reverse')
      : (isRtl ? 'lg:flex-row-reverse' : 'lg:flex-row'));
  const effectiveHideCompleted =
    hideCompleted || completedTrophyStyle === COMPLETED_TROPHY_STYLE.HIDE;
  const canEditProduction = Boolean(isAdmin || isCreator);
  const forceProdMode = Boolean(canEditProduction && (isDraftMode || isCreator));
  const [prevForceProdMode, setPrevForceProdMode] = useState(forceProdMode);
  const [productionMode, setProductionMode] = useState(forceProdMode);
  if (forceProdMode !== prevForceProdMode) {
    setPrevForceProdMode(forceProdMode);
    if (forceProdMode) setProductionMode(true);
  }
  const [localProdOverrides, setLocalProdOverrides] = useState({});
  /** 'all' | 'open' | 'recorded' | 'linked' */
  const [prodStatusFilter, setProdStatusFilter] = useState('all');
  const [prodTakeQuery, setProdTakeQuery] = useState('');

  const toggleVideoSide = useCallback(() => {
    const nextLayout =
      videoTimestampLayout === VIDEO_TIMESTAMP_LAYOUT.VIDEO_LEFT
        ? VIDEO_TIMESTAMP_LAYOUT.TIMESTAMPS_LEFT
        : VIDEO_TIMESTAMP_LAYOUT.VIDEO_LEFT;
    setVideoTimestampLayout(nextLayout);
  }, [videoTimestampLayout, setVideoTimestampLayout]);

  const renderVideoSideToggleButton = () => (
    <button
      type="button"
      onClick={toggleVideoSide}
      title="Split-Screen-Anordnung zwischen Items und Video tauschen"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 10px',
        borderRadius: '8px',
        fontSize: '11px',
        fontFamily: 'monospace',
        fontWeight: 'bold',
        cursor: 'pointer',
        backgroundColor: '#121314',
        border: '1px solid #27272a',
        color: '#e4e4e7',
        transition: 'border-color 150ms ease, color 150ms ease',
      }}
    >
      {videoSide === 'right' ? '⇄ Items links | Video rechts' : '⇄ Video links | Items rechts'}
    </button>
  );

  const showProdTools = Boolean(canEditProduction && productionMode);

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

  const isProdItemMatch = useCallback(
    (item) => {
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
    },
    [showProdTools, prodStatusFilter, prodTakeQuery, getItemProdStatus],
  );

  const isItemShown = (item) => {
    if (effectiveHideCompleted && isItemCompleted(item)) return false;
    if (!isProdItemMatch(item)) return false;
    return true;
  };

  // Gebiets-Ebene (localisation) über den Gruppen-Kacheln.
  // Wir bauen den Gruppenbaum vor dem hideCompleted-Filter, damit Status
  // (doneCount / totalCount / isAllCompleted) korrekt berechnet werden kann.
  const prodFilteredItems = useMemo(
    () => normalizedItemsData.filter(isProdItemMatch),
    [normalizedItemsData, isProdItemMatch],
  );

  const localisationSections = buildGuideGroupTree(prodFilteredItems, groupByField);
  const hasSingleLocalisation = localisationSections.length === 1;
  const isSingleVideoGuide =
    prodFilteredItems.length === 1 && isPublicVideoUrl(prodFilteredItems[0]?.video_url);
  const singleItem = isSingleVideoGuide ? prodFilteredItems[0] : null;
  const singleGroupKey = '__single_video_guide__';
  const singleVideoHidden = Boolean(
    isSingleVideoGuide && effectiveHideCompleted && isItemCompleted(singleItem),
  );

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
      [groupKey]: { itemId: item.id, embedUrl, seekKey: Date.now() },
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
    const allGroupKeys = items.map((item) => guideProgressKey(item));
    const groupTotalCount = items.length;
    const groupDoneCount = items.filter((item) => isItemCompleted(item)).length;
    const isGroupAllCompleted = groupTotalCount > 0 && groupDoneCount === groupTotalCount;

    if (effectiveHideCompleted && isGroupAllCompleted) return null;

    const visibleTableItems = items.filter(isItemShown);
    if (items.length === 0) return null;
    if (hideGroupHeader && visibleTableItems.length === 0) return null;

    const activeVideo = activeVideos[group.key];
    const activeItem = activeVideo ? items.find((i) => i.id === activeVideo.itemId) : null;
    const embedUrl = activeVideo?.embedUrl ?? null;
    const previewItem =
      visibleTableItems.find((item) => isPublicVideoUrl(item.video_url)) ||
      items.find((item) => isPublicVideoUrl(item.video_url));
    const previewVideoId = previewItem ? getYouTubeVideoId(previewItem.video_url) : null;

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
          <div
            role="button"
            tabIndex={0}
            onClick={() => toggleGroup(group.key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleGroup(group.key);
              }
            }}
            aria-expanded={isExpanded}
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
              textAlign: 'start',
              opacity: isGroupAllCompleted && completedTrophyStyle === COMPLETED_TROPHY_STYLE.DIM ? 0.65 : 1,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
              {typeof toggleCompleted === 'function' && (
                <input
                  type="checkbox"
                  checked={isGroupAllCompleted}
                  onChange={() => {}}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCompleted(allGroupKeys, !isGroupAllCompleted);
                  }}
                  style={{
                    accentColor: '#00ff66',
                    cursor: 'pointer',
                    width: '16px',
                    height: '16px',
                    flexShrink: 0,
                  }}
                  aria-label={isGroupAllCompleted ? 'Gruppe als offen markieren' : 'Gruppe als erledigt markieren'}
                />
              )}
              {groupHeaderIcon}
              {gameId ? (
                <Reportable
                  as="span"
                  source={gameId}
                  type={reportEntityType}
                  reportKey={group.name}
                  field={groupByField}
                  style={{ textDecoration: isGroupAllCompleted ? 'line-through' : 'none' }}
                >
                  {group.name}
                </Reportable>
              ) : (
                <span style={{ textDecoration: isGroupAllCompleted ? 'line-through' : 'none' }}>
                  {group.name}
                </span>
              )}
              {renderGroupAddon ? renderGroupAddon(items) : null}
              <span
                style={{
                  color: isGroupAllCompleted ? '#00ff66' : '#71717a',
                  fontSize: '11px',
                  fontWeight: isGroupAllCompleted ? 'bold' : 'normal',
                }}
              >
                {isGroupAllCompleted
                  ? `✓ ${groupDoneCount}/${groupTotalCount}`
                  : `(${groupDoneCount}/${groupTotalCount})`}
              </span>
            </span>
            <span style={{ color: '#71717a', fontSize: '12px' }} aria-hidden>
              {isExpanded ? '▲' : '▼'}
            </span>
          </div>
        )}

        {isExpanded && (
          <div
            className={`guide-split guide-split--expanded flex flex-col ${resolvedVideoFlexClass} ${
              videoSide === 'left' ? 'guide-split--video-left' : 'guide-split--video-right'
            }`}
          >
            <div className="guide-split__list">
              {groupTipNode}
              <div className="guide-split__table">
                <div
                  className="guide-split__thead border-b border-zinc-800 pb-1.5 text-[11px] font-mono uppercase text-zinc-500"
                >
                  {nameColumnHeader}
                </div>
                <div role="list" className="divide-y divide-zinc-800/80">
                  {visibleTableItems.map((item) => {
                    const progressKey = guideProgressKey(item);
                    const isCompleted = isItemCompleted(item);
                    const displayName = getDisplayName(item);
                    const reportKey = String(item.guide_sequence ?? item.sort_order ?? '');
                    const isActive = activeVideo?.itemId === item.id;
                    const hasVideo = isPublicVideoUrl(item.video_url);
                    const rowDimmed =
                      isCompleted && completedTrophyStyle === COMPLETED_TROPHY_STYLE.DIM;
                    const isCheckboxRight = guideRowOrder === GUIDE_ROW_ORDER.CHECKBOX_RIGHT;
                    const addonNode = renderNameAddon ? renderNameAddon(item, rowDimmed) : null;

                    const checkboxEl =
                      typeof toggleCompleted === 'function' ? (
                        <input
                          type="checkbox"
                          checked={isCompleted}
                          onChange={() => toggleCompleted(progressKey)}
                          className={`${
                            isCheckboxRight ? 'w-5 h-5' : 'w-4 h-4'
                          } shrink-0 cursor-pointer accent-[#00ff66]`}
                          aria-label={
                            isCompleted ? 'Als offen markieren' : 'Als erledigt markieren'
                          }
                        />
                      ) : null;

                    const timestampLabel = hasVideo ? `▶ ${item.timestamp}` : item.timestamp;
                    const timestampPill = item.timestamp ? (
                      <span
                        className={`tb-bidi-isolate inline-block whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                          isActive
                            ? 'border-[#00ff66]/50 bg-[#00ff66]/15 text-[#00ff66]'
                            : hasVideo
                              ? 'border-zinc-700 bg-[#121314] text-[#00ff66] hover:border-[#00ff66]/40'
                              : 'border-zinc-800 bg-[#121314] text-zinc-400'
                        }`}
                      >
                        {gameId && reportKey ? (
                          <Reportable
                            as="span"
                            source={gameId}
                            type={reportEntityType}
                            reportKey={reportKey}
                            field="timestamp"
                          >
                            {timestampLabel}
                          </Reportable>
                        ) : (
                          timestampLabel
                        )}
                      </span>
                    ) : null;

                    const timestampNode = timestampPill ? (
                      hasVideo ? (
                        <button
                          type="button"
                          onClick={() => selectItemVideo(group.key, item)}
                          className="shrink-0 bg-transparent border-0 p-0 cursor-pointer"
                        >
                          {timestampPill}
                        </button>
                      ) : (
                        timestampPill
                      )
                    ) : null;

                    const actionCol = (
                      <div className="flex flex-col items-center justify-between self-stretch gap-1.5">
                        {addonNode ? (
                          <div className="flex items-center justify-center shrink-0">
                            {addonNode}
                          </div>
                        ) : null}
                        <div className="mt-auto flex items-center justify-center pt-0.5">
                          {checkboxEl}
                        </div>
                      </div>
                    );

                    const textCol = (
                      <div className="min-w-0 self-start text-start flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => selectItemVideo(group.key, item)}
                            disabled={!hasVideo}
                            className={`bg-transparent border-0 p-0 text-start text-[13px] break-words ${
                              hasVideo ? 'cursor-pointer' : 'cursor-default'
                            } ${isActive ? 'font-bold text-[#00ff66]' : ''} ${
                              rowDimmed
                                ? 'text-zinc-500 line-through'
                                : !isActive
                                  ? hasVideo
                                    ? 'text-zinc-200'
                                    : 'text-zinc-400'
                                  : ''
                            } ${isCompleted && !rowDimmed ? 'line-through' : ''}`}
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
                              className="shrink-0 bg-transparent border-0 px-0.5 text-base leading-none text-zinc-500 hover:text-zinc-200 cursor-pointer"
                              aria-label="Schritt löschen"
                              title="Schritt löschen"
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                        {renderRowDetail ? renderRowDetail(item, rowDimmed, rowTipCtx) : null}
                      </div>
                    );

                    const timeCol = (
                      <div
                        className={`flex flex-col justify-between self-stretch gap-1.5 ${
                          isCheckboxRight ? 'items-start' : 'items-end'
                        }`}
                      >
                        <div className={`flex w-full ${isCheckboxRight ? 'justify-start' : 'justify-end'}`}>
                          {timestampNode}
                        </div>
                        {isActive && embedUrl ? (
                          <VideoRewindButton
                            onRewind={(seconds) => splitPlayerRefs.current.get(group.key)?.rewind(seconds)}
                            className="mt-auto"
                          />
                        ) : null}
                      </div>
                    );

                    const rowGridClass = isCheckboxRight
                      ? 'grid grid-cols-[minmax(5.75rem,18%)_minmax(0,1fr)_minmax(2.5rem,7%)]'
                      : 'grid grid-cols-[minmax(2.5rem,7%)_minmax(0,1fr)_minmax(5.75rem,18%)]';

                    return (
                      <div
                        key={item.id}
                        role="listitem"
                        className={`guide-split__row ${rowGridClass} gap-x-2 items-stretch ${
                          rowDimmed ? 'opacity-45' : ''
                        }`}
                        style={{
                          backgroundColor: isActive ? 'rgba(0, 255, 102, 0.06)' : 'transparent',
                        }}
                      >
                        {isCheckboxRight ? (
                          <>
                            {timeCol}
                            {textCol}
                            {actionCol}
                          </>
                        ) : (
                          <>
                            {actionCol}
                            {textCol}
                            {timeCol}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="guide-split__video">
              <div className="guide-split__video-inner">
                {embedUrl ? (
                  <YouTubeEmbed
                    ref={setGroupPlayerRef(group.key)}
                    key={`${group.key}-${activeVideo?.itemId || 'default'}-${embedUrl}-${activeVideo?.seekKey || 0}`}
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
    const allSectionItems = section.groups.flatMap((g) => g.items);
    const allSectionKeys = allSectionItems.map((item) => guideProgressKey(item));
    const sectionTotalCount = allSectionItems.length;
    const sectionDoneCount = allSectionItems.filter((item) => isItemCompleted(item)).length;
    const isSectionAllCompleted = sectionTotalCount > 0 && sectionDoneCount === sectionTotalCount;

    if (effectiveHideCompleted && isSectionAllCompleted) return null;
    if (sectionTotalCount === 0) return null;

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
        <div
          role="button"
          tabIndex={0}
          className="guide-localisation__header"
          onClick={() => toggleLocalisation(section.localisation)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleLocalisation(section.localisation);
            }
          }}
          aria-expanded={isExpanded}
          style={{
            opacity:
              isSectionAllCompleted && completedTrophyStyle === COMPLETED_TROPHY_STYLE.DIM
                ? 0.65
                : 1,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', minWidth: 0, flexWrap: 'wrap' }}>
            {typeof toggleCompleted === 'function' && (
              <input
                type="checkbox"
                checked={isSectionAllCompleted}
                onChange={() => {}}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCompleted(allSectionKeys, !isSectionAllCompleted);
                }}
                style={{
                  accentColor: '#00ff66',
                  cursor: 'pointer',
                  width: '16px',
                  height: '16px',
                  flexShrink: 0,
                }}
                aria-label={isSectionAllCompleted ? 'Gebiet als offen markieren' : 'Gebiet als erledigt markieren'}
              />
            )}
            <span>
              {localisationHeaderIcon}{' '}
              {gameId ? (
                <Reportable
                  as="span"
                  source={gameId}
                  type={reportEntityType}
                  reportKey={section.localisation}
                  field="spiel_region"
                  style={{ textDecoration: isSectionAllCompleted ? 'line-through' : 'none' }}
                >
                  {section.localisation}
                </Reportable>
              ) : (
                <span style={{ textDecoration: isSectionAllCompleted ? 'line-through' : 'none' }}>
                  {section.localisation}
                </span>
              )}
              <span
                className="guide-localisation__count"
                style={{
                  color: isSectionAllCompleted ? '#00ff66' : undefined,
                  fontWeight: isSectionAllCompleted ? 'bold' : 'normal',
                }}
              >
                {isSectionAllCompleted
                  ? `✓ (${section.groups.length} · ${sectionDoneCount}/${sectionTotalCount})`
                  : `(${section.groups.length} · ${sectionDoneCount}/${sectionTotalCount})`}
              </span>
            </span>
          </span>
          <span className="guide-localisation__chevron" aria-hidden>
            {isExpanded ? '▲' : '▼'}
          </span>
        </div>

        {isExpanded && (
          <div className="guide-localisation__body">{section.groups.map(renderGroupBox)}</div>
        )}
      </div>
    );
  };

  const renderSingleVideoGuide = () => {
    if (!singleItem) return null;
    const isCompleted = isItemCompleted(singleItem);
    const rowDimmed = isCompleted && completedTrophyStyle === COMPLETED_TROPHY_STYLE.DIM;
    const isCheckboxRight = guideRowOrder === GUIDE_ROW_ORDER.CHECKBOX_RIGHT;
    const displayName = getDisplayName(singleItem);
    const reportKey = String(singleItem.guide_sequence ?? singleItem.sort_order ?? '');
    const activeVideo = activeVideos[singleGroupKey];
    const embedUrl = activeVideo?.embedUrl ?? null;
    const previewVideoId = getYouTubeVideoId(singleItem.video_url);
    const groupTipNode = renderGroupDetail ? renderGroupDetail([singleItem]) : null;
    const rowTipCtx = { sharedGroupTip: Boolean(groupTipNode) };
    const singleAddon = renderNameAddon ? renderNameAddon(singleItem, rowDimmed) : null;
    const nameNode =
      gameId && reportKey ? (
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
      );

    const singleCheckboxEl =
      typeof toggleCompleted === 'function' ? (
        <input
          type="checkbox"
          checked={isCompleted}
          onChange={() => toggleCompleted(guideProgressKey(singleItem))}
          className={`${isCheckboxRight ? 'h-5 w-5' : 'h-4 w-4'} shrink-0 cursor-pointer accent-[#00ff66]`}
          aria-label={isCompleted ? 'Als offen markieren' : 'Als erledigt markieren'}
        />
      ) : null;

    const singleActionCol = (
      <div className="flex flex-col items-center justify-between self-stretch gap-1.5">
        {singleAddon ? <div className="flex items-center justify-center shrink-0">{singleAddon}</div> : null}
        <div className="mt-auto flex items-center justify-center pt-0.5">{singleCheckboxEl}</div>
      </div>
    );

    const singleTextCol = (
      <div className="min-w-0 self-start text-start flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => selectItemVideo(singleGroupKey, singleItem)}
            className={`min-w-0 bg-transparent border-0 p-0 text-start text-sm font-bold text-white sm:text-base cursor-pointer ${
              isCompleted ? 'line-through' : ''
            } ${rowDimmed ? 'opacity-45' : ''}`}
          >
            {nameNode}
          </button>
          {renderRowAction ? renderRowAction(singleItem, rowDimmed, rowTipCtx) : null}
          {showProdTools ? (
            <ProductionInlineRowEditor
              item={singleItem}
              prodNote={singleItem.prod_note}
              videoUrl={singleItem.video_url}
              onSave={handleSaveProductionMeta}
            />
          ) : null}
          {typeof onDeleteStep === 'function' ? (
            <button
              type="button"
              onClick={() => onDeleteStep(singleItem)}
              className="shrink-0 bg-transparent border-0 px-0.5 text-base leading-none text-zinc-500 hover:text-zinc-200 cursor-pointer"
              aria-label="Schritt löschen"
              title="Schritt löschen"
            >
              ×
            </button>
          ) : null}
        </div>
        {renderRowDetail ? renderRowDetail(singleItem, rowDimmed, rowTipCtx) : null}
      </div>
    );

    const singleTimestampChip = singleItem.timestamp ? (
      <button
        type="button"
        onClick={() => selectItemVideo(singleGroupKey, singleItem)}
        className="tb-bidi-isolate shrink-0 whitespace-nowrap rounded border border-zinc-700 bg-[#121314] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#00ff66] hover:border-[#00ff66]/40 cursor-pointer"
      >
        ▶ {singleItem.timestamp}
      </button>
    ) : null;

    const singleTimeCol = (
      <div
        className={`flex flex-col justify-between self-stretch gap-1.5 ${
          isCheckboxRight ? 'items-start' : 'items-end'
        }`}
      >
        <div className={`flex w-full ${isCheckboxRight ? 'justify-start' : 'justify-end'}`}>
          {singleTimestampChip}
        </div>
        {embedUrl ? (
          <VideoRewindButton
            onRewind={(seconds) => singlePlayerRef.current?.rewind(seconds)}
            className="mt-auto"
          />
        ) : null}
      </div>
    );

    const singleRowGrid = isCheckboxRight
      ? 'grid grid-cols-[minmax(5.75rem,18%)_minmax(0,1fr)_minmax(2.75rem,7%)]'
      : 'grid grid-cols-[minmax(2.75rem,7%)_minmax(0,1fr)_minmax(5.75rem,18%)]';

    return (
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#121314]">
        <div className={`${singleRowGrid} gap-x-2.5 sm:gap-x-3 items-stretch border-b border-zinc-800 bg-[#121314] px-3.5 py-3`}>
          {isCheckboxRight ? (
            <>
              {singleTimeCol}
              {singleTextCol}
              {singleActionCol}
            </>
          ) : (
            <>
              {singleActionCol}
              {singleTextCol}
              {singleTimeCol}
            </>
          )}
        </div>
        {groupTipNode}
        <div className="mx-auto w-full max-w-4xl bg-[#121314] p-3 sm:p-4">
          <div className="single-video-stage relative aspect-video w-full overflow-hidden rounded-xl border border-zinc-800 bg-black">
            {embedUrl ? (
              <YouTubeEmbed
                ref={singlePlayerRef}
                key={`${singleGroupKey}-${singleItem.id}-${embedUrl}-${activeVideo?.seekKey || 0}`}
                src={embedUrl}
                title={displayName}
              />
            ) : (
              <button
                type="button"
                className="youtube-poster"
                onClick={() => selectItemVideo(singleGroupKey, singleItem)}
              >
                <YouTubeThumb videoId={previewVideoId} alt="" className="youtube-poster__thumb" />
                <span className="youtube-poster__play">
                  <YoutubePlayIcon />
                </span>
                <span className="youtube-poster__hint">{t('videoPosterHintPreview')}</span>
              </button>
            )}
          </div>
        </div>
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
              {canEditProduction && (
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
              {!isSingleVideoGuide ? renderVideoSideToggleButton() : null}
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

        {embedInAccordion && (
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
              {canEditProduction && (
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {!isSingleVideoGuide ? renderVideoSideToggleButton() : null}
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

      {isSingleVideoGuide
        ? singleVideoHidden
          ? null
          : renderSingleVideoGuide()
        : localisationSections.map(renderLocalisationSection)}
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
  isCreator = false,
  isDraftMode = false,
  onProductionMetaSaved = null,
  videoLayoutFlexClass = '',
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
      isCreator={isCreator}
      isDraftMode={isDraftMode}
      onProductionMetaSaved={onProductionMetaSaved}
      videoLayoutFlexClass={videoLayoutFlexClass}
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
  isCreator = false,
  isDraftMode = false,
  onProductionMetaSaved = null,
  videoLayoutFlexClass = '',
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
          justifyContent: 'center',
          fontSize: '12px',
          lineHeight: 1,
          color: dimmed ? '#4ade80' : '#00ff66',
          backgroundColor: 'rgba(0, 255, 102, 0.12)',
          border: '1px solid rgba(0, 255, 102, 0.35)',
          padding: '4px 5px',
          borderRadius: '6px',
          opacity: dimmed ? 0.7 : 1,
        }}
        aria-label={t('bossTrophyBadge')}
      >
        <span aria-hidden>🏆</span>
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
      groupByField="boss_group"
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
      isCreator={isCreator}
      isDraftMode={isDraftMode}
      onProductionMetaSaved={onProductionMetaSaved}
      videoLayoutFlexClass={videoLayoutFlexClass}
    />
  );
}

export default CollectibleKacheln;
