import React, { useEffect, useState } from 'react';
import { getYouTubeEmbedUrl } from '../utils/videoUrl';
import { useVisibility } from '../context/VisibilityContext';
import { useGuideVideo } from '../context/GuideVideoContext';
import { guideProgressKey } from '../lib/guideProgressStorage';
import Reportable from '../components/Reportable';

/**
 * Generisches 40/60 Split-Screen-Layout.
 * @param {'chronological_group'|'category_group'} groupByField
 */
function SplitScreenGuideKacheln({
  itemsData = [],
  progressPercent = 0,
  completedCount = 0,
  totalCount = 0,
  getDisplayName,
  nameColumnHeader,
  renderNameAddon,
  emptyVideoMessage,
  groupHeaderIcon = '📍',
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
  const { toggleHidden, isHidden, getEntryState, itemKey } = useVisibility();
  const { notifyVideoStarted, notifyVideoCleared } = useGuideVideo();
  const [expandedGroups, setExpandedGroups] = useState({});
  const [activeVideos, setActiveVideos] = useState({});

  // Fortschritt/Sichtbarkeit hängen an der guide_id, damit ein in zwei Reitern
  // gelisteter Eintrag (sheet_types [1, 2]) nur einmal abgehakt werden muss.
  const isItemCompleted = (item) => !!completedItems[guideProgressKey(item)];

  const isItemShown = (item) => {
    if (hideCompleted && isItemCompleted(item)) return false;
    return getEntryState(itemKey(guideProgressKey(item))).visible;
  };

  const groupedItems = itemsData.reduce((acc, item) => {
    if (!isItemShown(item)) return acc;
    const group =
      item[groupByField] ||
      (groupByField === 'chronological_group' ? item.category_group : item.chronological_group) ||
      'Allgemein';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  const toggleGroup = (groupName) => {
    setExpandedGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const selectItemVideo = (groupName, item) => {
    if (!item.video_url) return;
    const embedUrl = getYouTubeEmbedUrl(item.video_url, item.timestamp, { autoplay: true });
    setActiveVideos((prev) => ({
      ...prev,
      [groupName]: { itemId: item.id, embedUrl },
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
                Erledigte ausblenden
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
              Erledigte ausblenden
            </label>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}
        >
          <span style={{ color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Gesamtfortschritt
          </span>
          <span
            style={{
              color: '#00ff66',
              fontWeight: 'bold',
              fontSize: '14px',
              marginLeft: 'auto',
            }}
          >
            {progressPercent}% ({completedCount}/{totalCount})
          </span>
        </div>
        <div
          style={{
            width: '100%',
            backgroundColor: '#27272a',
            height: '10px',
            borderRadius: '9999px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              backgroundColor: '#00ff66',
              height: '100%',
              borderRadius: '9999px',
              transition: 'all 500ms ease-in-out',
              boxShadow: '0 0 8px rgba(0,255,102,0.5)',
              width: `${progressPercent}%`,
            }}
          />
        </div>
      </div>

      {Object.entries(groupedItems).map(([groupName, items]) => {
        const isExpanded = !!expandedGroups[groupName];
        const visibleItems = items.filter((item) => isItemShown(item));
        const activeVideo = activeVideos[groupName];
        const activeItem = activeVideo
          ? items.find((i) => i.id === activeVideo.itemId)
          : null;
        const embedUrl = activeVideo?.embedUrl ?? null;

        if (visibleItems.length === 0) return null;

        return (
          <div
            key={groupName}
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
              onClick={() => toggleGroup(groupName)}
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
              <span>
                {groupHeaderIcon} {groupName}
                <span style={{ color: '#71717a', marginLeft: '8px', fontSize: '11px' }}>
                  ({visibleItems.length})
                </span>
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
                        if (!isItemShown(item)) return null;

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
                                  aria-label={
                                    userHidden ? 'Eintrag einblenden' : 'Eintrag ausblenden'
                                  }
                                  title={userHidden ? 'Einblenden' : 'Ausblenden'}
                                >
                                  {userHidden ? '👁️‍🗨️' : '👁️'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => selectItemVideo(groupName, item)}
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
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="guide-split__video">
                  {embedUrl ? (
                    <div className="guide-split__video-inner">
                      <iframe
                        key={`${groupName}-${activeVideo?.itemId || 'default'}-${embedUrl}`}
                        src={embedUrl}
                        title={activeItem ? getDisplayName(activeItem) : groupName}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        color: '#71717a',
                        fontSize: '12px',
                        textAlign: 'center',
                        fontFamily: 'monospace',
                        padding: '0 16px',
                      }}
                    >
                      {activeVideo
                        ? emptyVideoMessage
                        : 'Klicke auf ein Item, um das Video hier abzuspielen.'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CollectibleKacheln({
  collectiblesData,
  progressPercent,
  completedCount,
  totalCount,
  groupByField = 'category_group',
  groupHeaderIcon = '📍',
  emptyVideoMessage = 'Klicke auf ein Item mit Video – der Player erscheint hier.',
  listTitle = 'Guide-Checkliste',
  hideCompleted,
  setHideCompleted,
  completedItems,
  toggleCompleted,
  embedInAccordion = false,
  gameId = '',
  reportEntityType = 'guide_item',
}) {
  return (
    <SplitScreenGuideKacheln
      itemsData={collectiblesData}
      progressPercent={progressPercent}
      completedCount={completedCount}
      totalCount={totalCount}
      getDisplayName={(item) => item.item_name}
      nameColumnHeader="Sammelgegenstand"
      emptyVideoMessage={emptyVideoMessage}
      groupHeaderIcon={groupHeaderIcon}
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
  progressPercent,
  completedCount,
  totalCount,
  listTitle = 'Boss-Checkliste',
  hideCompleted,
  setHideCompleted,
  completedItems,
  toggleCompleted,
  embedInAccordion = false,
  gameId = '',
}) {
  const renderTrophyBadge = (item, dimmed) => {
    const hasTrophy =
      Boolean(item.trophy_id) || item.is_trophy_relevant === 'Ja';
    if (!hasTrophy) return null;
    return (
      <span
        title={
          item.trophy_id
            ? `Trophäen-Referenz: ${item.trophy_id}`
            : 'Dieser Boss liefert direkt eine Trophäe'
        }
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
      progressPercent={progressPercent}
      completedCount={completedCount}
      totalCount={totalCount}
      getDisplayName={(item) => item.item_name || item.boss_name}
      nameColumnHeader="Bossgegner"
      renderNameAddon={renderTrophyBadge}
      emptyVideoMessage="Klicke auf einen Boss mit Video – der Player erscheint hier."
      groupHeaderIcon="⚔️"
      groupByField="category_group"
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
