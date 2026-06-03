import React, { useState } from 'react';

/** Wandelt YouTube-Links in das korrekte Einbettungsformat um */
const getEmbedUrl = (url) => {
  if (!url) return null;
  if (url.includes('youtube.com/embed/')) return url;

  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);

  return match && match[2].length === 11
    ? `https://www.youtube.com/embed/${match[2]}`
    : url;
};

/**
 * Generisches 40/60 Split-Screen-Layout für Sheet 1 (Kapitel), Sheet 2 (Kategorien)
 * und Sheet 3 (Boss-Kämpfe). Gruppierung immer über item.category_group.
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
}) {
  const [hiddenItems, setHiddenItems] = useState({});

  const toggleItem = (itemId) => {
    setHiddenItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const groupedItems = itemsData.reduce((acc, item) => {
    const group = item.category_group || 'Allgemein';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

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
        const visibleItem = items.find((i) => !hiddenItems[i.id]);
        const activeVideoUrl = visibleItem?.video_url;

        return (
          <div
            key={groupName}
            className="category-box"
            style={{
              backgroundColor: '#1a1b1c',
              border: '1px solid #27272a',
              borderRadius: '16px',
              marginBottom: '30px',
              overflow: 'hidden',
            }}
          >
            <h3
              style={{
                color: '#00ff66',
                margin: 0,
                padding: '15px 20px',
                backgroundColor: '#121314',
                borderBottom: '1px solid #27272a',
                fontSize: '14px',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {groupHeaderIcon} {groupName}
            </h3>

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
                      <th style={{ padding: '8px', width: '80px' }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const isHidden = hiddenItems[item.id];
                      const displayName = getDisplayName(item);

                      return (
                        <tr
                          key={item.id}
                          style={{
                            borderBottom: '1px solid #27272a',
                            opacity: isHidden ? 0.3 : 1,
                            textDecoration: isHidden ? 'line-through' : 'none',
                          }}
                        >
                          <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                type="checkbox"
                                checked={!!isHidden}
                                onChange={() => toggleItem(item.id)}
                                style={{ accentColor: '#00ff66', cursor: 'pointer' }}
                              />
                              <button
                                type="button"
                                onClick={() => toggleItem(item.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: '#00ff66',
                                  fontSize: '14px',
                                }}
                                aria-label={isHidden ? 'Eintrag einblenden' : 'Eintrag ausblenden'}
                              >
                                {isHidden ? '👁️‍🗨️' : '👁️'}
                              </button>
                              <span
                                style={{
                                  fontSize: '13px',
                                  color: isHidden ? '#71717a' : '#e4e4e7',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                {displayName}
                                {renderNameAddon ? renderNameAddon(item, isHidden) : null}
                              </span>
                            </div>
                          </td>
                          <td
                            style={{
                              padding: '10px 8px',
                              verticalAlign: 'top',
                              color: '#a1a1aa',
                            }}
                          >
                            <code
                              style={{
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                backgroundColor: '#27272a',
                                padding: '2px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              {item.timestamp}
                            </code>
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
                {activeVideoUrl ? (
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      paddingBottom: '56.25%',
                      height: 0,
                    }}
                  >
                    <iframe
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        borderRadius: '8px',
                      }}
                      src={getEmbedUrl(activeVideoUrl)}
                      title={groupName}
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
                    }}
                  >
                    {emptyVideoMessage}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Sheet 1 (Kapitel) & Sheet 2 (Item-Kategorien) – generisch über category_group */
export function CollectibleKacheln({
  collectiblesData,
  progressPercent,
  completedCount,
  totalCount,
}) {
  return (
    <SplitScreenGuideKacheln
      itemsData={collectiblesData}
      progressPercent={progressPercent}
      completedCount={completedCount}
      totalCount={totalCount}
      getDisplayName={(item) => item.item_name}
      nameColumnHeader="Sammelgegenstand"
      emptyVideoMessage="Kein Video für diesen Abschnitt verfügbar oder alle Gegenstände ausgeblendet."
      groupHeaderIcon="📍"
    />
  );
}

/** Sheet 3 – Boss-Kämpfe (gleiches Layout, boss_name + Trophäen-Hinweis) */
export function BossKacheln({ bossesData, progressPercent, completedCount, totalCount }) {
  const renderTrophyBadge = (item, isHidden) => {
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
          color: isHidden ? '#4ade80' : '#00ff66',
          backgroundColor: 'rgba(0, 255, 102, 0.12)',
          border: '1px solid rgba(0, 255, 102, 0.35)',
          padding: '1px 5px',
          borderRadius: '4px',
          opacity: isHidden ? 0.7 : 1,
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
      emptyVideoMessage="Kein Video für diesen Abschnitt verfügbar oder alle Bosse ausgeblendet."
      groupHeaderIcon="⚔️"
    />
  );
}

export default CollectibleKacheln;
