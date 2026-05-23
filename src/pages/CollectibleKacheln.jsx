import React from 'react';
import { useState } from 'react';

// Wandelt YouTube-Links in das korrekte Einbettungsformat um
const getEmbedUrl = (url) => {
  if (!url) return null;
  if (url.includes('youtube.com/embed/')) return url;

  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);

  return (match && match[2].length === 11)
    ? `https://www.youtube.com/embed/${match[2]}`
    : url;
};

// HIER GEÄNDERT: Nimmt jetzt die Fortschrittsdaten von der Hauptseite entgegen
function CollectiblesSection({ collectiblesData, progressPercent, completedCount, totalCount }) {
  // Zustand für ausgeblendete Gegenstände (IDs)
  const [hiddenItems, setHiddenItems] = useState({});

  // Funktion zum Umschalten der Sichtbarkeit
  const toggleItem = (itemId) => {
    setHiddenItems(prev => ({
      ...prev,
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // Daten nach "category_group" gruppieren
  const groupedCollectibles = collectiblesData.reduce((acc, item) => {
    const group = item.category_group || "Allgemein";
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  return (
    <div className="collectibles-tab" style={{ padding: '0px', color: '#fff' }}>

      {/* NEU: DIE FORTSCHRITTSBAR AUS BILD 1 JETZT OBEN IM GUIDE */}
      <div style={{
        backgroundColor: '#1a1b1c',
        padding: '20px',
        borderRadius: '16px',
        border: '1px solid #27272a',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginBottom: '8px', fontSize: '12px', fontFamily: 'monospace' }}>
          <span style={{ color: '#a1a1aa', textTransform: 'uppercase', tracking: '0.05em' }}>Gesamtfortschritt</span>
          <span style={{ color: '#00ff66', fontWeight: 'bold', fontSize: '14px', marginLeft: 'auto' }}>
            {progressPercent}% ({completedCount}/{totalCount})
          </span>
        </div>
        <div style={{ width: '100%', backgroundColor: '#27272a', height: '10px', borderRadius: '9999px', overflow: 'hidden' }}>
          <div
            style={{
              backgroundColor: '#00ff66',
              height: '100%',
              borderRadius: '9999px',
              transition: 'all 500ms ease-in-out',
              boxShadow: '0 0 8px rgba(0,255,102,0.5)',
              width: `${progressPercent}%`
            }}
          ></div>
        </div>
      </div>

      {Object.entries(groupedCollectibles).map(([groupName, items]) => (
        <div
          key={groupName}
          className="category-box"
          style={{
            backgroundColor: '#1a1b1c', // Einheitliches dunkles Anthrazit wie im Hub
            border: '1px solid #27272a', // Zinc-800 Rahmenfarbe
            borderRadius: '16px',
            marginBottom: '30px',
            overflow: 'hidden'
          }}
        >
          {/* HEADER DES KASTENS - HIER FARBE GEÄNDERT AUF EDLES ANTHRAZIT + GRÜN */}
          <h3 style={{
            color: '#00ff66', // Dein neues Cyberpunk-Grün statt altem Standard-Grün
            margin: 0,
            padding: '15px 20px',
            backgroundColor: '#121314', // Sehr dunkler, edler Header-Hintergrund
            borderBottom: '1px solid #27272a',
            fontSize: '14px',
            fontFamily: 'monospace',
            textTransform: 'uppercase',
            tracking: '0.05em'
          }}>
            📍 {groupName}
          </h3>

          {/* DER 40/60 SPLIT */}
          <div style={{ display: 'flex', minHeight: '300px', flexWrap: 'wrap' }}>

            {/* LINKER TEIL: Die Tabelle (40%) */}
            <div style={{
              flex: '1 1 40%',
              minWidth: '300px',
              padding: '15px',
              borderRight: '1px solid #27272a',
              overflowY: 'auto',
              maxHeight: '400px'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ color: '#71717a', fontSize: '11px', textTransform: 'uppercase', fontFamily: 'monospace' }}>
                    <th style={{ padding: '8px' }}>Sammelgegenstand</th>
                    <th style={{ padding: '8px', width: '80px' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isHidden = hiddenItems[item.id];

                    // HIER DIE KORREKTUR: Wir prüfen, ob dieser Gegenstand (oder die trophy_id) 
                    // in den freigeschalteten Trophäen existiert. (Falls du 'unlockedTrophies' mitübergibst)
                    // Wenn du das erst mal nur lokal testen willst, nutzen wir den Haken passend zum Auge:
                    const isChecked = isHidden; // Ein Haken wird gesetzt, wenn wir es "erledigt/ausgeblendet" haben

                    return (
                      <tr key={item.id} style={{
                        borderBottom: '1px solid #27272a',
                        opacity: isHidden ? 0.3 : 1,
                        textDecoration: isHidden ? 'line-through' : 'none'
                      }}>
                        <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="checkbox"
                              // HIER GEÄNDERT: Reagiert jetzt synchron auf das Auge/den Status
                              checked={!!isHidden}
                              onChange={() => toggleItem(item.id)} // Jetzt auch klickbar!
                              style={{ accentColor: '#00ff66', cursor: 'pointer' }}
                            />
                            <button
                              onClick={() => toggleItem(item.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00ff66', fontSize: '14px' }}
                            >
                              {isHidden ? '👁️‍🗨️' : '👁️'}
                            </button>
                            <span style={{ fontSize: '13px', color: isHidden ? '#71717a' : '#e4e4e7' }}>{item.item_name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px', verticalAlign: 'top', color: '#a1a1aa' }}>
                          <code style={{ fontSize: '11px', fontFamily: 'monospace', backgroundColor: '#27272a', padding: '2px 6px', borderRadius: '4px' }}>
                            {item.timestamp}
                          </code>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* RECHTER TEIL: Das Video (60%) */}
            <div style={{
              flex: '1 1 60%',
              minWidth: '350px',
              padding: '10px',
              backgroundColor: '#121314',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {items.find(i => !hiddenItems[i.id])?.video_url ? (
                <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', height: 0 }}>
                  <iframe
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '8px' }}
                    src={getEmbedUrl(items.find(i => !hiddenItems[i.id]).video_url)}
                    title={groupName}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  ></iframe>
                </div>
              ) : (
                <div style={{ color: '#71717a', fontSize: '12px', textAlign: 'center', fontFamily: 'monospace' }}>
                  Kein Video für diesen Abschnitt verfügbar oder alle Gegenstände ausgeblendet.
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export const CollectibleKacheln = CollectiblesSection;