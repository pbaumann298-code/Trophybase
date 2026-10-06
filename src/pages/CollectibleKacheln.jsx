import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import { getYouTubeEmbedUrl, getYouTubeVideoId } from '../utils/videoUrl';
import YouTubeEmbed, { YouTubeThumb, YoutubePlayIcon } from '../components/YouTubeEmbed';
import { useVisibility } from '../context/VisibilityContext';
import { useGuideVideo } from '../context/GuideVideoContext';
import { guideProgressKey } from '../lib/guideProgressStorage';
import { buildGuideGroupTree } from '../lib/guideData';
import Reportable from '../components/Reportable';
import TrophyArtwork from '../components/TrophyArtwork';

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

    const renderNameAddon = (item) => renderTrophyArt(trophyFor(item));

    /**
     * Gruppenkachel (z. B. „Waffe“ / „Jägerwerkzeuge“): Icon nur, wenn alle
     * verknüpften Einträge auf dieselbe Trophäe zeigen. Gemischte Gruppen
     * (Bosse) bleiben ohne Header-Bild – dort sitzt das Icon an der Zeile.
     */
    const renderGroupAddon = (items) => {
      const trophies = (items ?? []).map(trophyFor).filter(Boolean);
      if (trophies.length === 0) return null;
      const ids = new Set(
        trophies.map((trophy) =>
          String(trophy.platform_achievement_id ?? trophy.trophy_id ?? '').trim(),
        ),
      );
      if (ids.size !== 1) return null;
      return renderTrophyArt(trophies[0], 22);
    };

    const renderRowAction = (item) => {
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

    const renderRowDetail = (item) => {
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

    return { renderNameAddon, renderGroupAddon, renderRowAction, renderRowDetail };
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
}) {
  const { t } = useLocale();
  const { toggleHidden, isHidden, getEntryState, itemKey } = useVisibility();
  const { notifyVideoStarted, notifyVideoCleared } = useGuideVideo();
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedLocalisations, setExpandedLocalisations] = useState({});
  const [activeVideos, setActiveVideos] = useState({});

  // Fortschritt/Sichtbarkeit hängen an der guide_id, damit ein in zwei Reitern
  // gelisteter Eintrag (sheet_types [1, 2]) nur einmal abgehakt werden muss.
  const isItemCompleted = (item) => !!completedItems[guideProgressKey(item)];

  const isItemShown = (item) => {
    if (hideCompleted && isItemCompleted(item)) return false;
    return getEntryState(itemKey(guideProgressKey(item))).visible;
  };

  // Gebiets-Ebene (localisation) über den Gruppen-Kacheln. Fehlt sie – oder
  // gilt sie in diesem Reiter nicht – liefert buildGuideGroupTree einen
  // Abschnitt mit leerem Namen; dann wird flach gerendert.
  const localisationSections = buildGuideGroupTree(itemsData.filter(isItemShown), groupByField);
  const hasSingleLocalisation = localisationSections.length === 1;

  const isLocalisationExpanded = (localisation) =>
    expandedLocalisations[localisation] ?? hasSingleLocalisation;

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
    if (!item.video_url) return;
    const embedUrl = getYouTubeEmbedUrl(item.video_url, item.timestamp, { autoplay: true });
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
    const isExpanded = !!expandedGroups[group.key];
    const items = group.items;
    const activeVideo = activeVideos[group.key];
    const activeItem = activeVideo ? items.find((i) => i.id === activeVideo.itemId) : null;
    const embedUrl = activeVideo?.embedUrl ?? null;
    const previewItem = items.find((item) => item.video_url);
    const previewVideoId = previewItem ? getYouTubeVideoId(previewItem.video_url) : null;

    if (items.length === 0) return null;

    return (
      <div
        key={group.key}
        className="category-box"
        style={{
          backgroundColor: '#1a1b1c',
          border: '1px solid #27272a',
          borderRadius: '16px',
          marginBottom: '16px',
          overflow: 'hidden',
        }}
      >
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

        {isExpanded && (
          <div className="guide-split guide-split--expanded">
            <div className="guide-split__list">
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
                    const reportKey = String(item[reportKeyField] ?? item.id ?? '');
                    const userHidden = isHidden(visKey);
                    const isActive = activeVideo?.itemId === item.id;
                    const hasVideo = !!item.video_url;
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                            {renderRowAction ? renderRowAction(item, rowDimmed) : null}
                          </div>
                          {renderRowDetail ? renderRowDetail(item, rowDimmed) : null}
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
                        : 'Klicke auf ein Item oder das Vorschaubild, um das Video zu laden.'}
                    </span>
                  </button>
                ) : (
                  <div className="youtube-consent-gate">
                    {activeVideo
                      ? emptyVideoMessage
                      : 'Klicke auf ein Item, um das Video hier abzuspielen.'}
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
    if (!section.localisation) {
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

        {embedInAccordion && typeof setHideCompleted === 'function' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
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
  emptyVideoMessage = 'Klicke auf ein Item mit Video – der Player erscheint hier.',
  listTitle = 'Guide-Checkliste',
  hideCompleted,
  setHideCompleted,
  completedItems,
  toggleCompleted,
  embedInAccordion = false,
  gameId = '',
  reportEntityType = 'guide_item',
  trophyById,
}) {
  const { renderNameAddon, renderGroupAddon, renderRowAction, renderRowDetail } =
    useTrophyRowExtras(trophyById);

  return (
    <SplitScreenGuideKacheln
      itemsData={collectiblesData}
      getDisplayName={(item) => item.item_name}
      nameColumnHeader="Sammelgegenstand"
      renderNameAddon={renderNameAddon}
      renderGroupAddon={renderGroupAddon}
      renderRowAction={renderRowAction}
      renderRowDetail={renderRowDetail}
      emptyVideoMessage={emptyVideoMessage}
      groupHeaderIcon={groupHeaderIcon}
      localisationHeaderIcon={localisationHeaderIcon}
      groupByField={groupByField}
      listTitle={listTitle}
      hideCompleted={hideCompleted}
      setHideCompleted={setHideCompleted}
      completedItems={completedItems}
      toggleCompleted={toggleCompleted}
      embedInAccordion={embedInAccordion}
      gameId={gameId}
      reportEntityType={reportEntityType}
      reportKeyField="guide_id"
    />
  );
}

export function BossKacheln({
  bossesData,
  listTitle = 'Boss-Checkliste',
  hideCompleted,
  setHideCompleted,
  completedItems,
  toggleCompleted,
  embedInAccordion = false,
  gameId = '',
  trophyById,
}) {
  const trophyExtras = useTrophyRowExtras(trophyById);

  // Liegt eine verknüpfte Trophäe vor, gewinnt ihr Bild. Ohne trophy_id bleibt
  // nur die allgemeine Marke „hier gibt es eine Trophäe".
  const renderTrophyBadge = (item, dimmed) => {
    const artwork = trophyExtras.renderNameAddon(item, dimmed);
    if (artwork) return artwork;

    if (item.is_trophy_relevant !== 'Ja') return null;
    return (
      <span
        title="Dieser Boss liefert direkt eine Trophäe"
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
        Trophäe
      </span>
    );
  };

  return (
    <SplitScreenGuideKacheln
      itemsData={bossesData}
      getDisplayName={(item) => item.item_name || item.boss_name}
      nameColumnHeader="Bossgegner"
      renderNameAddon={renderTrophyBadge}
      renderGroupAddon={trophyExtras.renderGroupAddon}
      renderRowAction={trophyExtras.renderRowAction}
      renderRowDetail={trophyExtras.renderRowDetail}
      emptyVideoMessage="Klicke auf einen Boss mit Video – der Player erscheint hier."
      groupHeaderIcon="⚔️"
      localisationHeaderIcon="🗺️"
      groupByField="chronological_group"
      listTitle={listTitle}
      hideCompleted={hideCompleted}
      setHideCompleted={setHideCompleted}
      completedItems={completedItems}
      toggleCompleted={toggleCompleted}
      embedInAccordion={embedInAccordion}
      gameId={gameId}
      reportEntityType="boss"
      reportKeyField="guide_id"
    />
  );
}

export default CollectibleKacheln;
