import React, { useState } from 'react';
import { getYouTubeEmbedUrl } from '../utils/videoUrl';
import { useVisibility } from '../context/VisibilityContext';

/**
 * Generisches 40/60 Split-Screen-Layout.
 * @param {'chronological_group'|'category_group'|'boss_name'} groupByField
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
}) {
  const { toggleHidden, isHidden, getEntryState, itemKey } = useVisibility();
  const [expandedGroups, setExpandedGroups] = useState({});
  const [activeVideos, setActiveVideos] = useState({});

  const groupedItems = itemsData.reduce((acc, item) => {
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
  };

  return (
    <div className="collectibles-tab" style={{ padding: '0px', color: '#fff' }}>
      <div
        style={{
          backgroundColor: '#1a1b1c',
          padding: '20px',
          borderRadius: '16px',
          border: '1px solid #27272a',
          marginBottom: '24px',
        }}
      >
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
        const visibleItems = items.filter((item) =>
          getEntryState(itemKey(item.id)).visible,
        );
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
                {isExpanded ? '▼' : '▶'}
              </span>
            </button>

            {isExpanded && (
              <div style={{ display: 'flex', minHeight: '300px', flexWrap: 'wrap' }}>
                <div
                  style={{
                    flex: '1 1 40%',
                    minWidth: '300px',
                    padding: '15px',
                    borderRight: '1px solid #27272a',
                    overflowY: 'auto',
                    maxHeight: '400px',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr
                        style={{
                          color: '#71717a',
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          fontFamily: 'monospace',
                        }}
                      >
                        <th style={{ padding: '8px' }}>{nameColumnHeader}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const visKey = itemKey(item.id);
                        const { visible, dimmed } = getEntryState(visKey);
                        if (!visible) return null;

                        const displayName = getDisplayName(item);
                        const userHidden = isHidden(visKey);
                        const isActive = activeVideo?.itemId === item.id;
                        const hasVideo = !!item.video_url;

                        return (
                          <tr
                            key={item.id}
                            style={{
                              borderBottom: '1px solid #27272a',
                              opacity: dimmed ? 0.3 : 1,
                              backgroundColor: isActive ? 'rgba(0, 255, 102, 0.06)' : 'transparent',
                            }}
                          >
                            <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                                    color: dimmed
                                      ? '#71717a'
                                      : isActive
                                        ? '#00ff66'
                                        : hasVideo
                                          ? '#e4e4e7'
                                          : '#a1a1aa',
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    flexWrap: 'wrap',
                                    textAlign: 'left',
                                    fontWeight: isActive ? 'bold' : 'normal',
                                  }}
                                  onMouseEnter={(e) => {
                                    if (hasVideo && !dimmed) {
                                      e.currentTarget.style.color = '#00ff66';
                                      e.currentTarget.style.textDecoration = 'underline';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.textDecoration = 'none';
                                    if (!isActive) {
                                      e.currentTarget.style.color = dimmed
                                        ? '#71717a'
                                        : hasVideo
                                          ? '#e4e4e7'
                                          : '#a1a1aa';
                                    } else {
                                      e.currentTarget.style.color = '#00ff66';
                                    }
                                  }}
                                >
                                  {displayName}
                                  {renderNameAddon ? renderNameAddon(item, dimmed) : null}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div
                  style={{
                    flex: '1 1 60%',
                    minWidth: '350px',
                    padding: '10px',
                    backgroundColor: '#121314',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {embedUrl ? (
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        paddingBottom: '56.25%',
                        height: 0,
                      }}
                    >
                      <iframe
                        key={`${groupName}-${activeVideo?.itemId || 'default'}-${embedUrl}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          borderRadius: '8px',
                        }}
                        src={embedUrl}
                        title={activeItem ? getDisplayName(activeItem) : groupName}
                        frameBorder="0"
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
                      {activeVideo ? emptyVideoMessage : 'Klicke auf ein Item, um das Video hier abzuspielen.'}
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

/**
 * game_guides – generisch für Reiter 1 (chronological_group) und Reiter 2 (category_group).
 */
export function CollectibleKacheln({
  collectiblesData,
  progressPercent,
  completedCount,
  totalCount,
  groupByField = 'category_group',
  groupHeaderIcon = '📍',
  emptyVideoMessage = 'Klicke auf ein Item mit Video – der Player erscheint hier.',
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
    />
  );
}

/** game_bosses – Boss-Übersicht (Reiter 3), boss_name + Trophäen-Hinweis */
export function BossKacheln({ bossesData, progressPercent, completedCount, totalCount }) {
  const renderTrophyBadge = (item, dimmed) => {
    if (item.is_trophy_relevant !== 'Ja') return null;
    return (
      <span
        title="Dieser Boss liefert direkt eine Sony-Trophäe"
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
      getDisplayName={(item) => item.boss_name}
      nameColumnHeader="Bossgegner"
      renderNameAddon={renderTrophyBadge}
      emptyVideoMessage="Klicke auf einen Boss mit Video – der Player erscheint hier."
      groupHeaderIcon="⚔️"
      groupByField="boss_name"
    />
  );
}

export default CollectibleKacheln;
