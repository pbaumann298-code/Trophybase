import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../pages/supabaseClient';
import { TABLES, GAME_FK, GAME_PK, GAME_STRUCT, GAME_TYPE, parseGameTypes } from '../../lib/gameSchema';
import AdminGameTypeSelect from '../AdminGameTypeSelect';
import { getYouTubeEmbedUrl, parseTimecodeToSeconds, buildVideoUrlWithTimestamp } from '../../utils/videoUrl';
import { GUIDE_PUBLICATION, guideStatusKey, parseStatusMap } from '../../lib/guidePublication';
import { setIntranetGameType, saveTrophyGuideTip } from '../../lib/intranetGameEdits';
import { localeOptions } from '../../lib/uiStrings';

function getLocalizedTitle(spieltitel) {
  if (!spieltitel) return 'Unbenanntes Spiel';
  if (typeof spieltitel === 'string') return spieltitel;
  return spieltitel.de || spieltitel.en || Object.values(spieltitel)[0] || 'Unbenanntes Spiel';
}

function getLocalizedCover(coverUrl) {
  if (!coverUrl) return '';
  if (typeof coverUrl === 'string') return coverUrl;
  return coverUrl.de || coverUrl.en || Object.values(coverUrl)[0] || '';
}

function getLocalizedItemName(itemName) {
  if (!itemName) return '';
  if (typeof itemName === 'string') return itemName;
  return itemName.de || itemName.en || Object.values(itemName)[0] || '';
}

function getLocalizedTrophyName(trophyName) {
  if (!trophyName) return '';
  if (typeof trophyName === 'string') return trophyName;
  return trophyName.de || trophyName.en || Object.values(trophyName)[0] || '';
}

function getLocalizedTrophyDesc(trophyDesc, lang = 'de') {
  if (!trophyDesc) return '';
  if (typeof trophyDesc === 'string') return trophyDesc;
  if (typeof trophyDesc === 'object') {
    return trophyDesc[lang] || trophyDesc.de || trophyDesc.en || Object.values(trophyDesc)[0] || '';
  }
  return '';
}

function getLocalizedGuideTip(guideTip, lang = 'de') {
  if (!guideTip) return '';
  if (typeof guideTip === 'string') return guideTip;
  if (typeof guideTip === 'object') {
    return guideTip[lang] || guideTip.de || guideTip.en || Object.values(guideTip)[0] || '';
  }
  return '';
}

function TrophyTypeBadge({ type }) {
  const t = String(type ?? '').toLowerCase();
  let bg = 'bg-amber-700/30 text-amber-300 border-amber-600/40';
  let label = 'Bronze';
  if (t.includes('silver') || t.includes('silber')) {
    bg = 'bg-slate-400/30 text-slate-200 border-slate-400/40';
    label = 'Silber';
  } else if (t.includes('gold')) {
    bg = 'bg-yellow-500/30 text-yellow-300 border-yellow-500/40';
    label = 'Gold';
  } else if (t.includes('platin') || t.includes('platinum')) {
    bg = 'bg-cyan-400/30 text-cyan-200 border-cyan-400/40';
    label = 'Platin';
  }
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-mono font-bold border ${bg}`}>
      {label}
    </span>
  );
}

function TrophyDraftItem({ trophy, activeRowId, trophyLang, onAssign, onSaveGuideTip }) {
  const trophyId = trophy.platform_achievement_id || trophy.id;
  const nameStr = getLocalizedTrophyName(trophy.trophy_name);
  const descStr = getLocalizedTrophyDesc(trophy.trophy_desc ?? trophy.trophy_description, trophyLang);
  const tipStr = getLocalizedGuideTip(trophy.guide_tip, trophyLang);

  const [isEditingTip, setIsEditingTip] = useState(false);
  const [tipDraft, setTipDraft] = useState(tipStr);
  const [savingTip, setSavingTip] = useState(false);

  useEffect(() => {
    setTipDraft(tipStr);
  }, [tipStr]);

  const handleCommit = async () => {
    if (tipDraft.trim() === tipStr.trim()) {
      setIsEditingTip(false);
      return;
    }
    setSavingTip(true);
    await onSaveGuideTip(trophyId, tipDraft);
    setSavingTip(false);
    setIsEditingTip(false);
  };

  return (
    <div className="group flex flex-col gap-2 rounded-xl border border-zinc-800/80 bg-[#161718] p-2.5 hover:border-zinc-700 hover:bg-zinc-800/50 transition">
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {trophy.icon_url ? (
            <img
              src={trophy.icon_url}
              alt=""
              className="h-8 w-8 shrink-0 rounded bg-zinc-800 object-cover"
            />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded bg-zinc-800 flex items-center justify-center text-[10px]">
              🏆
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs font-bold text-white truncate leading-tight">{nameStr || trophyId}</p>
              <TrophyTypeBadge type={trophy.trophy_type} />
            </div>
            <p className="text-[9px] font-mono text-zinc-400 truncate mt-0.5">
              ID: <span className="text-zinc-300">{trophyId}</span>
            </p>
          </div>
        </div>

        {/* Quick Assign Button */}
        {activeRowId && (
          <button
            type="button"
            onClick={() => onAssign(trophyId)}
            title="Trophy ID der aktiven Zeile zuordnen"
            className="shrink-0 rounded bg-[#00ff66]/15 px-2 py-1 text-[10px] font-mono font-bold text-[#00ff66] hover:bg-[#00ff66]/30 border border-[#00ff66]/30"
          >
            + Assign
          </button>
        )}
      </div>

      {/* Trophy Description (trophy_desc) */}
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-2 text-[11px] font-sans">
        <span className="mb-0.5 block font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-500">
          Beschreibung:
        </span>
        {descStr ? (
          <p className="italic text-zinc-300 leading-relaxed">{descStr}</p>
        ) : (
          <p className="text-[10px] italic text-zinc-600">(Keine Beschreibung)</p>
        )}
      </div>

      {/* Guide Tip (guide_tip) */}
      <div className="rounded-lg border border-[#00ff66]/20 bg-[#00ff66]/5 p-2 text-[11px]">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#00ff66]">
            💡 Guide-Tipp ({trophyLang.toUpperCase()}):
          </span>
          {!isEditingTip && (
            <button
              type="button"
              onClick={() => setIsEditingTip(true)}
              className="font-mono text-[9px] text-zinc-400 hover:text-[#00ff66] underline transition"
            >
              {tipStr ? '✏️ Bearbeiten' : '+ Tipp hinzufügen'}
            </button>
          )}
        </div>

        {isEditingTip ? (
          <div className="flex flex-col gap-1.5 mt-1">
            <textarea
              value={tipDraft}
              onChange={(e) => setTipDraft(e.target.value)}
              rows={2}
              placeholder="Guide-Tipp eingeben…"
              disabled={savingTip}
              className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-[#00ff66] focus:outline-none font-sans"
            />
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                disabled={savingTip}
                onClick={() => {
                  setTipDraft(tipStr);
                  setIsEditingTip(false);
                }}
                className="rounded px-2 py-0.5 font-mono text-[10px] text-zinc-400 hover:text-white bg-zinc-800"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={savingTip}
                onClick={handleCommit}
                className="rounded px-2.5 py-0.5 font-mono text-[10px] font-bold text-black bg-[#00ff66] hover:bg-[#00ff66]/90 flex items-center gap-1"
              >
                {savingTip ? 'Speichert…' : '✓ Speichern'}
              </button>
            </div>
          </div>
        ) : tipStr ? (
          <p className="font-sans text-xs italic text-zinc-200 leading-relaxed whitespace-pre-wrap">
            {tipStr}
          </p>
        ) : (
          <p className="font-mono text-[10px] italic text-zinc-500">
            Kein Tipp hinterlegt.
          </p>
        )}
      </div>
    </div>
  );
}

export default function IntranetDrafts() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Queue data
  const [stagingRows, setStagingRows] = useState([]);
  const [gamesMap, setGamesMap] = useState(new Map());
  const [filterQuery, setFilterQuery] = useState('');

  // Selection
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [selectedCreatorName, setSelectedCreatorName] = useState(null);
  const [activeRowId, setActiveRowId] = useState(null);

  // Video Player state
  const [activeVideoUrl, setActiveVideoUrl] = useState('');
  const [activeTimestamp, setActiveTimestamp] = useState('');

  // Parallel Trophies
  const [gameTrophies, setGameTrophies] = useState([]);
  const [loadingTrophies, setLoadingTrophies] = useState(false);
  const [trophyLang, setTrophyLang] = useState('de');

  // Busy action state
  const [actionBusy, setActionBusy] = useState(false);

  // Approval Modal State
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveLocale, setApproveLocale] = useState('');
  const [selectedGameTypes, setSelectedGameTypes] = useState([]);

  // Load staging queue
  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let allRows = [];
      let from = 0;
      const PAGE_SIZE = 1000;

      while (true) {
        const { data: rows, error: readError } = await supabase
          .from('staging_game_guides')
          .select('*')
          .range(from, from + PAGE_SIZE - 1);

        if (readError) {
          setError(`Fehler beim Laden von staging_game_guides: ${readError.message}`);
          setStagingRows([]);
          setLoading(false);
          return;
        }

        const chunk = rows ?? [];
        allRows = allRows.concat(chunk);
        if (chunk.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      setStagingRows(allRows);

      // Extract unique game_ids
      const gameIds = [...new Set(allRows.map((r) => r.game_id).filter(Boolean))];

      if (gameIds.length > 0) {
        const CHUNK_SIZE = 100;
        const allGames = [];

        for (let i = 0; i < gameIds.length; i += CHUNK_SIZE) {
          const chunkIds = gameIds.slice(i, i + CHUNK_SIZE);
          const { data: gamesData, error: gamesError } = await supabase
            .from(TABLES.games)
            .select('id, platform_game_id, spieltitel, cover_url, publisher, entwickler, spiel_typ, anzahl_trophaeen')
            .in('id', chunkIds);

          if (gamesError) {
            console.error('Fehler beim Laden der Spiele-Details:', gamesError.message);
          } else if (gamesData) {
            allGames.push(...gamesData);
          }
        }

        const map = new Map(allGames.map((g) => [g.id, g]));
        setGamesMap(map);
      } else {
        setGamesMap(new Map());
      }
    } catch (err) {
      setError(err.message || 'Unerwarteter Fehler beim Laden der Queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Group staging rows by game_id
  const gameGroups = useMemo(() => {
    const groups = new Map();
    for (const row of stagingRows) {
      if (!row.game_id) continue;
      const list = groups.get(row.game_id) || [];
      list.push(row);
      groups.set(row.game_id, list);
    }
    return groups;
  }, [stagingRows]);

  // List of games in queue
  const queueGamesList = useMemo(() => {
    const list = [];
    for (const [gameId, rows] of gameGroups.entries()) {
      const game = gamesMap.get(gameId) || { id: gameId };
      const title = getLocalizedTitle(game.spieltitel);
      const creators = new Set(rows.map((r) => r.creator_name || 'Unbekannt'));

      list.push({
        gameId,
        game,
        title,
        platformGameId: game.platform_game_id || (Array.isArray(game.platform_game_id) ? game.platform_game_id[0] : '—'),
        creatorCount: creators.size,
        rowCount: rows.length,
        coverUrl: getLocalizedCover(game.cover_url),
      });
    }

    list.sort((a, b) => a.title.localeCompare(b.title, 'de'));
    return list;
  }, [gameGroups, gamesMap]);

  // Filtered Queue List
  const filteredQueueList = useMemo(() => {
    if (!filterQuery.trim()) return queueGamesList;
    const q = filterQuery.toLowerCase().trim();
    return queueGamesList.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        String(item.platformGameId).toLowerCase().includes(q)
    );
  }, [queueGamesList, filterQuery]);

  // Set default selection when queue loads or changes
  useEffect(() => {
    if (queueGamesList.length > 0) {
      if (!selectedGameId || !gameGroups.has(selectedGameId)) {
        setSelectedGameId(queueGamesList[0].gameId);
      }
    } else {
      setSelectedGameId(null);
      setSelectedCreatorName(null);
    }
  }, [queueGamesList, selectedGameId, gameGroups]);

  // Current game's rows
  const currentGameRows = useMemo(() => {
    if (!selectedGameId) return [];
    return gameGroups.get(selectedGameId) || [];
  }, [selectedGameId, gameGroups]);

  // Group current game rows by creator_name
  const creatorGroups = useMemo(() => {
    const map = new Map();
    for (const row of currentGameRows) {
      const creator = row.creator_name || 'Unbekannter Creator';
      const list = map.get(creator) || [];
      list.push(row);
      map.set(creator, list);
    }
    return map;
  }, [currentGameRows]);

  // Creator Tabs info
  const creatorTabs = useMemo(() => {
    const tabs = [];
    for (const [creatorName, rows] of creatorGroups.entries()) {
      const videos = new Set(
        rows.map((r) => {
          const rawUrl = r.video_url || r.video_chapter || r.id;
          return String(rawUrl).split('&t=')[0].split('?t=')[0];
        })
      );
      tabs.push({
        creatorName,
        videoCount: videos.size,
        rowCount: rows.length,
        rows,
      });
    }
    return tabs;
  }, [creatorGroups]);

  // Keep creator selection valid
  useEffect(() => {
    if (creatorTabs.length > 0) {
      if (!selectedCreatorName || !creatorGroups.has(selectedCreatorName)) {
        setSelectedCreatorName(creatorTabs[0].creatorName);
      }
    } else {
      setSelectedCreatorName(null);
    }
  }, [creatorTabs, selectedCreatorName, creatorGroups]);

  // Current creator's rows sorted by guide_id ASC
  const currentCreatorRows = useMemo(() => {
    if (!selectedCreatorName) return [];
    const rows = creatorGroups.get(selectedCreatorName) || [];
    return [...rows].sort((a, b) => {
      const numA = Number.parseInt(String(a.guide_id ?? '').replace(/\D/g, ''), 10) || 0;
      const numB = Number.parseInt(String(b.guide_id ?? '').replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });
  }, [selectedCreatorName, creatorGroups]);

  // Set initial video player URL when creator changes
  useEffect(() => {
    if (currentCreatorRows.length > 0) {
      const firstWithVideo = currentCreatorRows.find((r) => r.video_url) || currentCreatorRows[0];
      if (firstWithVideo) {
        setActiveVideoUrl(firstWithVideo.video_url || '');
        setActiveTimestamp(firstWithVideo.timestamp || '');
      }
    } else {
      setActiveVideoUrl('');
      setActiveTimestamp('');
    }
  }, [selectedCreatorName, currentCreatorRows]);

  // Selected game details
  const selectedGame = useMemo(() => {
    if (!selectedGameId) return null;
    return gamesMap.get(selectedGameId) || null;
  }, [selectedGameId, gamesMap]);

  // Load trophies for selected game
  useEffect(() => {
    if (!selectedGameId) {
      setGameTrophies([]);
      return;
    }

    let cancelled = false;
    async function loadTrophies() {
      setLoadingTrophies(true);
      const { data, error: trophyErr } = await supabase
        .from(TABLES.achievements)
        .select('*')
        .eq(GAME_FK, selectedGameId)
        .order('platform_achievement_id', { ascending: true });

      if (cancelled) return;
      setLoadingTrophies(false);

      if (trophyErr) {
        console.error('Fehler beim Laden der Trophäen:', trophyErr.message);
        setGameTrophies([]);
        return;
      }
      setGameTrophies(data ?? []);
    }

    loadTrophies();
    return () => {
      cancelled = true;
    };
  }, [selectedGameId]);

  // Jump to next game in queue
  const jumpToNextGame = useCallback(
    (currentId) => {
      const remainingList = queueGamesList.filter((item) => item.gameId !== currentId);
      if (remainingList.length > 0) {
        setSelectedGameId(remainingList[0].gameId);
      } else {
        setSelectedGameId(null);
        setSelectedCreatorName(null);
      }
    },
    [queueGamesList]
  );

  // Jump to next creator or next game
  const jumpToNextCreatorOrGame = useCallback(
    (currentId, currentCreator) => {
      const remainingCreators = creatorTabs.filter((t) => t.creatorName !== currentCreator);
      if (remainingCreators.length > 0) {
        setSelectedCreatorName(remainingCreators[0].creatorName);
      } else {
        jumpToNextGame(currentId);
      }
    },
    [creatorTabs, jumpToNextGame]
  );

  // --- ACTIONS ---

  // 1. Schnell-Löschen komplettes Spiel aus Liste oder Action-Bar
  const handleDeleteWholeGame = async (gameId) => {
    if (!gameId || actionBusy) return;
    if (!window.confirm('Möchtest du alle Entwürfe für dieses Spiel komplett löschen?')) return;

    setActionBusy(true);
    setNotice('');
    setError('');

    const { error: delErr } = await supabase
      .from('staging_game_guides')
      .delete()
      .eq('game_id', gameId);

    setActionBusy(false);

    if (delErr) {
      setError(`Löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }

    setNotice('Spiel wurde aus der Staging Queue gelöscht.');
    jumpToNextGame(gameId);
    fetchQueue();
  };

  // 2. Creator verwerfen
  const handleDiscardCreator = async () => {
    if (!selectedGameId || !selectedCreatorName || actionBusy) return;
    if (!window.confirm(`Möchtest du alle Einträge von Creator "${selectedCreatorName}" löschen?`)) return;

    setActionBusy(true);
    setNotice('');
    setError('');

    const { error: delErr } = await supabase
      .from('staging_game_guides')
      .delete()
      .eq('game_id', selectedGameId)
      .eq('creator_name', selectedCreatorName);

    setActionBusy(false);

    if (delErr) {
      setError(`Creator verwerfen fehlgeschlagen: ${delErr.message}`);
      return;
    }

    setNotice(`Einträge für "${selectedCreatorName}" wurden verworfen.`);
    jumpToNextCreatorOrGame(selectedGameId, selectedCreatorName);
    fetchQueue();
  };

  // Open approval modal
  const handleOpenApproveModal = () => {
    if (!selectedGameId || !selectedCreatorName || actionBusy) return;
    setApproveLocale('');
    setSelectedGameTypes(parseGameTypes(selectedGame?.spiel_typ));
    setShowApproveModal(true);
  };

  // 3. Creator freigeben (Ingest-Workflow: Ingame_guides schreiben, games.status updaten, Staging clearen)
  const handleApproveCreatorConfirm = async () => {
    if (!selectedGameId || !selectedCreatorName || actionBusy || !approveLocale || selectedGameTypes.length === 0) return;

    setActionBusy(true);
    setNotice('');
    setError('');

    try {
      // 1. Spieltyp speichern, falls gewählt/geändert
      const { error: typeErr } = await setIntranetGameType(supabase, selectedGameId, selectedGameTypes);
      if (typeErr) {
        console.warn('Fehler beim Speichern des Spiel-Typs im Freigabe-Modal:', typeErr.message);
      } else {
        setGamesMap((prev) => {
          const next = new Map(prev);
          const current = next.get(selectedGameId);
          if (current) next.set(selectedGameId, { ...current, spiel_typ: selectedGameTypes.join(', ') });
          return next;
        });
      }

      let success = false;

      // Versuche zuerst RPC approve_staging_guide mit p_locale
      const { error: rpcErr } = await supabase.rpc('approve_staging_guide', {
        p_game_id: selectedGameId,
        p_creator_name: selectedCreatorName,
        p_locale: approveLocale,
      });

      if (!rpcErr) {
        success = true;
      } else {
        console.warn('RPC approve_staging_guide nicht verfügbar / fehlgeschlagen, nutze regulären JS Ingest-Workflow:', rpcErr.message);

        // 1. Creator in content_creators auflösen oder neu anlegen
        let creatorId = null;
        if (selectedCreatorName) {
          const { data: existingCreator } = await supabase
            .from(TABLES.contentCreators)
            .select('id')
            .ilike('channel_name', selectedCreatorName.trim())
            .maybeSingle();

          if (existingCreator?.id) {
            creatorId = existingCreator.id;
          } else {
            const sampleRowWithUrl = currentCreatorRows.find((r) => r.creator_input_url);
            const inputUrl = sampleRowWithUrl?.creator_input_url || '';
            const { data: newCreator } = await supabase
              .from(TABLES.contentCreators)
              .insert({ channel_name: selectedCreatorName.trim(), youtube_url: inputUrl })
              .select('id')
              .maybeSingle();

            if (newCreator?.id) {
              creatorId = newCreator.id;
            }
          }
        }

        // 2. Mappe Staging-Zeilen in game_guides
        const toLocalized = (val) => {
          if (!val) return null;
          if (typeof val === 'object') return val;
          const str = String(val).trim();
          return str ? { [approveLocale]: str } : null;
        };

        const parseGuideIdNum = (val) => {
          const digits = String(val ?? '').replace(/\D/g, '');
          return digits ? Number.parseInt(digits, 10) : null;
        };

        const parseTrophyIdNum = (val) => {
          const digits = String(val ?? '').replace(/\D/g, '');
          return digits ? Number.parseInt(digits, 10) : null;
        };

        const rowsToApprove = currentCreatorRows.map((r) => ({
          game_id: r.game_id,
          platform_game_id: r.platform_game_id || null,
          guide_id: parseGuideIdNum(r.guide_id),
          item_name: toLocalized(r.item_name),
          chronological_group: toLocalized(r.chronological_group),
          video_chapter: toLocalized(r.video_chapter),
          timestamp: r.timestamp || null,
          video_url: r.video_url || null,
          trophy_id: parseTrophyIdNum(r.trophy_id),
          is_trophy_relevant: r.is_trophy_relevant || null,
          creator_id: creatorId,
          sheet_type: Array.isArray(r.sheet_type) && r.sheet_type.length > 0 ? r.sheet_type : [1],
        }));

        const { error: insertErr } = await supabase.from(TABLES.guides).insert(rowsToApprove);

        if (insertErr) {
          setActionBusy(false);
          setError(`Freigabe fehlgeschlagen: ${insertErr.message}`);
          return;
        }

        // 3. games.status aktualisieren (guide_<locale> = DONE, guides = HAS_VIDEO)
        const { data: current } = await supabase
          .from(TABLES.games)
          .select(GAME_STRUCT.status)
          .eq(GAME_PK, selectedGameId)
          .maybeSingle();

        const statusMap = { ...parseStatusMap(current?.[GAME_STRUCT.status]) };
        const statusKey = guideStatusKey(approveLocale);
        if (String(statusMap[statusKey] ?? '').trim().toUpperCase() !== GUIDE_PUBLICATION.PUBLISHED) {
          statusMap[statusKey] = GUIDE_PUBLICATION.DONE;
        }

        const hasVideo = rowsToApprove.some((r) => Boolean(r.video_url));
        if (hasVideo) {
          statusMap.guides = 'HAS_VIDEO';
        }

        await supabase
          .from(TABLES.games)
          .update({ [GAME_STRUCT.status]: statusMap })
          .eq(GAME_PK, selectedGameId);

        success = true;
      }

      if (success) {
        // Lösche ALLE Staging-Einträge für dieses Spiel aus staging_game_guides und springe zum nächsten Spiel
        const { error: deleteStagingErr } = await supabase
          .from('staging_game_guides')
          .delete()
          .eq('game_id', selectedGameId);

        if (deleteStagingErr) {
          console.error('Fehler beim Säubern der Staging Queue:', deleteStagingErr.message);
        }

        setShowApproveModal(false);
        setActionBusy(false);
        setNotice(`Guide von Creator "${selectedCreatorName}" erfolgreich in [${approveLocale.toUpperCase()}] freigegeben!`);
        jumpToNextGame(selectedGameId);
        fetchQueue();
      }
    } catch (err) {
      setActionBusy(false);
      setError(`Unerwarteter Fehler bei der Freigabe: ${err.message}`);
    }
  };

  // 4. Einzelne Zeile löschen
  const handleDeleteRow = async (rowId) => {
    if (!rowId || actionBusy) return;

    const { error: delErr } = await supabase
      .from('staging_game_guides')
      .delete()
      .eq('id', rowId);

    if (delErr) {
      setError(`Zeile löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }

    fetchQueue();
  };

  // 5. Ganzes Video / Chapter entfernen
  const handleDeleteVideoChapter = async (videoChapter, videoUrl) => {
    if (!selectedGameId || !selectedCreatorName || actionBusy) return;
    if (!window.confirm('Möchtest du alle Zeilen dieses Videos / Chapters für diesen Creator löschen?')) return;

    setActionBusy(true);
    let query = supabase
      .from('staging_game_guides')
      .delete()
      .eq('game_id', selectedGameId)
      .eq('creator_name', selectedCreatorName);

    if (videoUrl) {
      query = query.eq('video_url', videoUrl);
    } else if (videoChapter) {
      query = query.eq('video_chapter', videoChapter);
    }

    const { error: delErr } = await query;
    setActionBusy(false);

    if (delErr) {
      setError(`Video/Chapter löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }

    fetchQueue();
  };

  // Helper: Synchronisiert video_url mit neuem Timestamp
  const updateVideoUrlTimestamp = (url, newTimestamp) => {
    if (!url) return url;
    const seconds = parseTimecodeToSeconds(newTimestamp);
    if (seconds == null) {
      // Wenn Ungültig/Leer, lassen wir URL unberührt oder entfernen &t= Param wenn gewünscht
      return url;
    }
    const cleanUrl = url.replace(/([?&]t=)[^&]*/, '');
    const separator = cleanUrl.includes('?') ? '&' : '?';
    return `${cleanUrl}${separator}t=${seconds}s`;
  };

  // 6. Zeilen-Eigenschaft inline updaten
  const handleUpdateRowField = async (rowId, field, value) => {
    let dbValue = value;
    let updates = { [field]: value };

    if (field === 'guide_id') {
      const digits = String(value ?? '').replace(/\D/g, '');
      dbValue = digits ? Number.parseInt(digits, 10) : null;
      updates = { guide_id: dbValue };
    } else if (field === 'trophy_id') {
      const digits = String(value ?? '').replace(/\D/g, '');
      dbValue = digits ? Number.parseInt(digits, 10) : null;
      updates = { trophy_id: dbValue };
    } else if (field === 'timestamp') {
      const targetRow = stagingRows.find((r) => r.id === rowId);
      const newVideoUrl = updateVideoUrlTimestamp(targetRow?.video_url, value);
      updates = {
        timestamp: value,
        video_url: newVideoUrl,
      };
    }

    // Optimistic UI update
    setStagingRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, ...updates } : r))
    );

    const { error: updateErr } = await supabase
      .from('staging_game_guides')
      .update(updates)
      .eq('id', rowId);

    if (updateErr) {
      console.error(`Fehler beim Speichern von ${field}:`, updateErr.message);
      fetchQueue();
    }
  };

  // 7. 1-Klick-Reparatur für Zeitspannen im Item-Namen
  const handleCleanItemTimes = async () => {
    if (!currentCreatorRows.length || actionBusy) return;

    setActionBusy(true);
    setError('');
    setNotice('');

    try {
      const rowsToUpdate = [];

      for (const row of currentCreatorRows) {
        const rawName = typeof row.item_name === 'string' ? row.item_name : (row.item_name?.de || row.item_name?.en || '');
        let nameStr = rawName.trim();
        let cleanTime = row.timestamp;
        let newVideoUrl = row.video_url;
        let isModified = false;

        // a) Prüfe Regex auf Uhrzeit am Ende des Item-Namens
        const match = nameStr.match(/[:\s-]*(\d{1,2}:\s*\d{2}(?::\s*\d{2})?)\s*$/);
        if (match) {
          const rawTime = match[1];
          // Säubere Leerzeichen in der Zeit, z.B. "00: 02:17" -> "00:02:17" oder "02: 17" -> "02:17"
          cleanTime = rawTime.replace(/\s+/g, '');
          newVideoUrl = updateVideoUrlTimestamp(row.video_url, cleanTime);
          nameStr = nameStr.replace(/[:\s-]*\d{1,2}:\s*\d{2}(?::\s*\d{2})?\s*$/, '').trim();
          isModified = true;
        }

        // b) Zeilen mit item_name === '<Untitled Chapter...>' werden sauber in "Start" umbenannt
        if (/^<Untitled Chapter.*>/i.test(nameStr)) {
          nameStr = 'Start';
          isModified = true;
        }

        if (isModified) {
          const newItemName = typeof row.item_name === 'object' && row.item_name !== null
            ? { ...row.item_name, de: nameStr, en: nameStr }
            : nameStr;

          rowsToUpdate.push({
            id: row.id,
            item_name: newItemName,
            timestamp: cleanTime,
            video_url: newVideoUrl,
          });
        }
      }

      // Execute updates if any
      for (const updateObj of rowsToUpdate) {
        const { error: upErr } = await supabase
          .from('staging_game_guides')
          .update({
            item_name: updateObj.item_name,
            timestamp: updateObj.timestamp,
            video_url: updateObj.video_url,
          })
          .eq('id', updateObj.id);
        if (upErr) throw new Error(`Update fehlgeschlagen für Zeile ${updateObj.id}: ${upErr.message}`);
      }

      setNotice(
        `Bereinigung abgeschlossen: ${rowsToUpdate.length} Zeilen in Items bereinigt / umbenannt.`
      );
      await fetchQueue();
    } catch (err) {
      setError(`Fehler bei der Bereinigung: ${err.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  // 8. Trophy ID zuweisen
  const handleAssignTrophyToActiveRow = (trophyId) => {
    if (!activeRowId) return;
    handleUpdateRowField(activeRowId, 'trophy_id', trophyId);
    handleUpdateRowField(activeRowId, 'is_trophy_relevant', 'Ja');
  };

  // 9. Guide-Tipp für Trophäe in DB speichern
  const handleSaveTrophyGuideTip = async (platformAchievementId, newTipText) => {
    if (!selectedGameId || !platformAchievementId) return;
    const { error: err } = await saveTrophyGuideTip(
      supabase,
      selectedGameId,
      platformAchievementId,
      trophyLang,
      newTipText
    );

    if (err) {
      console.error('Fehler beim Speichern des Guide-Tipps:', err.message);
      setError(`Trophäen-Tipp konnte nicht gespeichert werden: ${err.message}`);
      return;
    }

    setNotice(`Guide-Tipp für Trophäe "${platformAchievementId}" [${trophyLang.toUpperCase()}] gespeichert.`);
    setGameTrophies((prev) =>
      prev.map((t) => {
        if (t.platform_achievement_id === platformAchievementId || t.id === platformAchievementId) {
          let currentMap = {};
          if (typeof t.guide_tip === 'object' && t.guide_tip !== null && !Array.isArray(t.guide_tip)) {
            currentMap = { ...t.guide_tip };
          } else if (typeof t.guide_tip === 'string' && t.guide_tip) {
            currentMap = { de: t.guide_tip };
          }

          if (newTipText.trim()) {
            currentMap[trophyLang] = newTipText.trim();
          } else {
            delete currentMap[trophyLang];
          }

          return { ...t, guide_tip: currentMap };
        }
        return t;
      })
    );
  };

  // Video embed URL
  const currentEmbedUrl = useMemo(() => {
    if (!activeVideoUrl) return null;
    return getYouTubeEmbedUrl(activeVideoUrl, activeTimestamp, { autoplay: false });
  }, [activeVideoUrl, activeTimestamp]);

  return (
    <div className="flex flex-col gap-4 text-zinc-200">
      {/* Top Banner / Notice */}
      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-[#00ff66]/30 bg-[#00ff66]/10 px-4 py-2.5 text-xs text-[#00ff66]">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {loading && queueGamesList.length === 0 ? (
        <div className="flex h-64 items-center justify-center font-mono text-sm text-zinc-500 animate-pulse">
          Lade Entwürfe-Queue…
        </div>
      ) : queueGamesList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-[#121314] px-6 py-16 text-center">
          <span className="text-4xl">🎉</span>
          <h2 className="mt-3 text-lg font-bold text-white">Keine offenen Entwürfe</h2>
          <p className="mt-1 text-xs text-zinc-400 max-w-sm leading-relaxed">
            Die Staging Queue (<span className="font-mono text-zinc-300">staging_game_guides</span>) ist aktuell leer.
          </p>
          <button
            type="button"
            onClick={fetchQueue}
            className="mt-4 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-200 hover:border-[#00ff66]/40 hover:text-[#00ff66]"
          >
            🔄 Queue neu laden
          </button>
        </div>
      ) : (
        /* High-Density 3-Spalten Layout */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
          
          {/* ==================== A. LINKIE SPALTE: Spiele-Queue (3 Cols) ==================== */}
          <div className="lg:col-span-3 flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-[#121314] p-3 max-h-[calc(100vh-160px)] overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5 px-1">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Spiele-Queue</h3>
                <p className="text-[10px] text-zinc-500 font-mono">
                  {filteredQueueList.length} Spiele ({stagingRows.length} Zeilen)
                </p>
              </div>
              <button
                type="button"
                onClick={fetchQueue}
                title="Queue aktualisieren"
                className="rounded-lg border border-zinc-700 bg-zinc-800 p-1.5 text-xs text-zinc-400 hover:text-[#00ff66]"
              >
                🔄
              </button>
            </div>

            {/* Filter Input */}
            <input
              type="text"
              placeholder="Spiele filtern…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900/90 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-[#00ff66] focus:outline-none"
            />

            {/* Queue List */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
              {filteredQueueList.map((item) => {
                const isSelected = item.gameId === selectedGameId;
                return (
                  <div
                    key={item.gameId}
                    onClick={() => setSelectedGameId(item.gameId)}
                    className={`group relative flex items-center justify-between gap-2 rounded-xl border p-2 cursor-pointer transition select-none ${
                      isSelected
                        ? 'border-[#00ff66]/50 bg-[#00ff66]/10 text-white'
                        : 'border-zinc-800/80 bg-[#17181a] hover:border-zinc-700 hover:bg-zinc-800/60 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.coverUrl ? (
                        <img
                          src={item.coverUrl}
                          alt={item.title}
                          className="h-10 w-8 shrink-0 rounded object-cover bg-zinc-800"
                        />
                      ) : (
                        <div className="h-10 w-8 shrink-0 rounded bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-600 font-mono">
                          🎮
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold leading-tight truncate">{item.title}</p>
                        <p className="text-[10px] font-mono text-zinc-400 truncate">{item.platformGameId}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-[9px] font-mono text-zinc-500">
                          <span>▶ {item.creatorCount} Creator</span>
                          <span>·</span>
                          <span>📄 {item.rowCount} Zeilen</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Delete Game Button */}
                    <button
                      type="button"
                      title="Komplettes Spiel verworfen/löschen"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWholeGame(item.gameId);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-red-500/20 hover:text-red-400"
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ==================== B & C. MITTLERE SPALTE: Detail & Creator Guide (6 Cols) ==================== */}
          <div className="lg:col-span-6 flex flex-col gap-3 min-w-0">
            
            {selectedGame ? (
              <>
                {/* B. GAME-HEADER & CREATOR TABS & VIDEO PLAYER */}
                <div className="rounded-2xl border border-zinc-800 bg-[#121314] p-4 flex flex-col gap-4">
                  
                  {/* Header Top: Cover + Game Details + Video Player */}
                  <div className="flex flex-wrap sm:flex-nowrap gap-4 items-start justify-between">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {getLocalizedCover(selectedGame.cover_url) ? (
                        <img
                          src={getLocalizedCover(selectedGame.cover_url)}
                          alt="Cover"
                          className="h-20 w-16 shrink-0 rounded-lg object-cover shadow-md border border-zinc-700/60"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                          {selectedGame.platform_game_id || 'ID unbekannt'}
                        </p>
                        <h2 className="text-base font-bold text-white truncate leading-snug">
                          {getLocalizedTitle(selectedGame.spieltitel)}
                        </h2>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {selectedGame.publisher || selectedGame.entwickler || 'Publisher N/A'}
                        </p>

                        {/* Spiel-Typ Multi-Select Dropdown */}
                        <div className="mt-2.5 flex items-center gap-2">
                          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Spiel-Typ:</span>
                          <AdminGameTypeSelect
                            gameId={selectedGame.id}
                            gameType={selectedGame.spiel_typ}
                            onSaved={(savedType) => {
                              setGamesMap((prev) => {
                                const next = new Map(prev);
                                const current = next.get(selectedGame.id);
                                if (current) next.set(selectedGame.id, { ...current, spiel_typ: savedType });
                                return next;
                              });
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Compact Video Player (Sticky Top Right) */}
                    <div className="w-full sm:w-56 shrink-0 flex flex-col gap-1">
                      <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-zinc-800 bg-black">
                        {currentEmbedUrl ? (
                          <iframe
                            src={currentEmbedUrl}
                            title="YouTube Preview"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="h-full w-full border-0"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center text-[10px] font-mono text-zinc-500">
                            <span>▶ Kein Video geladen</span>
                            <span className="text-[9px] text-zinc-600 mt-1">Klicke auf eine Zeile/Timestamp</span>
                          </div>
                        )}
                      </div>
                      {activeTimestamp ? (
                        <span className="text-[10px] font-mono text-center text-[#00ff66]">
                          ▶ Position: {activeTimestamp}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Creator Tabs */}
                  {creatorTabs.length > 0 && (
                    <div className="border-t border-zinc-800/80 pt-3">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                        Creator in der Queue ({creatorTabs.length}):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {creatorTabs.map((tab) => {
                          const isActive = tab.creatorName === selectedCreatorName;
                          return (
                            <button
                              key={tab.creatorName}
                              type="button"
                              onClick={() => setSelectedCreatorName(tab.creatorName)}
                              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-mono transition ${
                                isActive
                                  ? 'bg-[#00ff66]/15 text-[#00ff66] border border-[#00ff66]/40 font-bold'
                                  : 'bg-zinc-800/80 text-zinc-300 border border-zinc-700/60 hover:bg-zinc-700'
                              }`}
                            >
                              <span>▶ {tab.creatorName}</span>
                              <span className="rounded bg-zinc-900/60 px-1.5 py-0.5 text-[10px] text-zinc-400">
                                {tab.videoCount} Videos | {tab.rowCount} Zeilen
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* C. GUIDE-ZEILEN TABELLE (SUPER COMPACT HIGH-DENSITY) */}
                <div className="rounded-2xl border border-zinc-800 bg-[#121314] p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                        Guide-Zeilen ({currentCreatorRows.length})
                      </h4>
                      <button
                        type="button"
                        disabled={actionBusy || currentCreatorRows.length === 0}
                        onClick={handleCleanItemTimes}
                        title="Entfernt <Untitled Chapter 1> und extrahiert Uhrzeiten aus Item-Namen"
                        className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 transition disabled:opacity-50"
                      >
                        ⚡ Zeiten in Items bereinigen
                      </button>
                    </div>
                    {activeRowId && (
                      <span className="text-[10px] font-mono text-[#00ff66]">
                        ✓ Aktive Zeile ausgewählt (Trophäen-Zuordnung bereit)
                      </span>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] font-mono border-collapse min-w-[650px] sm:min-w-0">
                      <thead>
                        <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
                          <th className="py-2 px-1 w-8 sm:w-10">ID</th>
                          <th className="py-2 px-1">Item / Bezeichnung</th>
                          <th className="py-2 px-1 w-24">Gruppe</th>
                          <th className="py-2 px-1 w-28">Zeit</th>
                          <th className="py-2 px-1 w-32 sm:w-40">Chapter / Info</th>
                          <th className="py-2 px-1 w-20 sm:w-24">Trophy ID</th>
                          <th className="py-2 px-1 w-12 text-right">Aktion</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {currentCreatorRows.map((row) => {
                          const isActive = row.id === activeRowId;
                          const itemNameStr = getLocalizedItemName(row.item_name);
                          const groupStr = getLocalizedItemName(row.chronological_group);
                          const chapterStr = getLocalizedItemName(row.video_chapter);

                          return (
                            <tr
                              key={row.id}
                              onClick={() => setActiveRowId(row.id)}
                              className={`transition cursor-pointer ${
                                isActive ? 'bg-[#00ff66]/10' : 'hover:bg-zinc-800/40'
                              }`}
                            >
                              {/* guide_id */}
                              <td className="py-1 px-1">
                                <input
                                  type="text"
                                  value={row.guide_id ?? ''}
                                  onChange={(e) => handleUpdateRowField(row.id, 'guide_id', e.target.value)}
                                  className="w-8 sm:w-10 rounded border border-transparent bg-transparent px-0.5 py-0.5 text-zinc-300 hover:border-zinc-700 focus:border-[#00ff66] focus:bg-zinc-900 focus:outline-none"
                                />
                              </td>

                              {/* item_name */}
                              <td className="py-1 px-1">
                                <input
                                  type="text"
                                  value={itemNameStr}
                                  onChange={(e) => handleUpdateRowField(row.id, 'item_name', e.target.value)}
                                  className="w-full min-w-[7rem] sm:min-w-[8rem] rounded border border-transparent bg-transparent px-1 py-0.5 font-sans text-xs font-medium text-white hover:border-zinc-700 focus:border-[#00ff66] focus:bg-zinc-900 focus:outline-none"
                                />
                              </td>

                              {/* chronological_group */}
                              <td className="py-1 px-1">
                                <input
                                  type="text"
                                  value={groupStr}
                                  onChange={(e) => handleUpdateRowField(row.id, 'chronological_group', e.target.value)}
                                  className="w-full min-w-[4rem] sm:min-w-[5rem] rounded border border-transparent bg-transparent px-1 py-0.5 text-zinc-300 hover:border-zinc-700 focus:border-[#00ff66] focus:bg-zinc-900 focus:outline-none"
                                />
                              </td>

                              {/* timestamp */}
                              <td className="py-1 px-1 whitespace-nowrap">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveRowId(row.id);
                                      if (row.video_url) setActiveVideoUrl(row.video_url);
                                      if (row.timestamp) setActiveTimestamp(row.timestamp);
                                    }}
                                    title="Video an dieser Position abspielen"
                                    className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-[#00ff66] hover:bg-[#00ff66]/20 border border-zinc-700"
                                  >
                                    ▶
                                  </button>
                                  <input
                                    type="text"
                                    value={row.timestamp ?? ''}
                                    onChange={(e) => handleUpdateRowField(row.id, 'timestamp', e.target.value)}
                                    placeholder="0:00"
                                    className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-[10px] font-mono text-[#00ff66] hover:border-zinc-700 focus:border-[#00ff66] focus:bg-zinc-900 focus:outline-none"
                                  />
                                </div>
                              </td>

                              {/* video_chapter */}
                              <td
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveRowId(row.id);
                                  if (row.video_url) setActiveVideoUrl(row.video_url);
                                  if (row.timestamp) setActiveTimestamp(row.timestamp);
                                }}
                                className="py-1 px-1 text-zinc-400 text-[10px] w-32 sm:w-40 break-words line-clamp-2 cursor-pointer hover:text-white hover:underline"
                                title={`${chapterStr || '—'} (Klicken zum Abspielen)`}
                              >
                                {chapterStr || '—'}
                              </td>

                              {/* trophy_id */}
                              <td className="py-1 px-1">
                                <input
                                  type="text"
                                  placeholder="—"
                                  value={row.trophy_id ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleUpdateRowField(row.id, 'trophy_id', val);
                                    handleUpdateRowField(row.id, 'is_trophy_relevant', val ? 'Ja' : null);
                                  }}
                                  className={`w-full rounded border px-1 py-0.5 text-[10px] focus:outline-none ${
                                    row.trophy_id
                                      ? 'border-[#00ff66]/40 bg-[#00ff66]/10 text-[#00ff66] font-bold'
                                      : 'border-transparent bg-transparent text-zinc-400 hover:border-zinc-700 focus:border-[#00ff66] focus:bg-zinc-900'
                                  }`}
                                />
                              </td>

                              {/* Actions */}
                              <td className="py-1 px-1 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-0.5">
                                  <button
                                    type="button"
                                    title="Ganzes Video / Chapter entfernen"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteVideoChapter(row.video_chapter, row.video_url);
                                    }}
                                    className="rounded p-1 text-[10px] text-zinc-500 hover:bg-amber-500/20 hover:text-amber-400"
                                  >
                                    🎬
                                  </button>
                                  <button
                                    type="button"
                                    title="Zeile löschen"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteRow(row.id);
                                    }}
                                    className="rounded p-1 text-zinc-500 hover:bg-red-500/20 hover:text-red-400"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* E. ACTION-BAR (Freigeben vs. Löschen) */}
                <div className="sticky bottom-4 z-40 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-[#121314]/95 backdrop-blur-md p-3 shadow-xl">
                  <div className="flex items-center gap-2">
                    {/* [✓ Diesen Creator freigeben] (Grün) */}
                    <button
                      type="button"
                      disabled={actionBusy || currentCreatorRows.length === 0}
                      onClick={handleOpenApproveModal}
                      className="flex items-center gap-2 rounded-xl bg-[#00ff66] px-4 py-2.5 text-xs font-bold text-black hover:bg-[#00ff66]/90 disabled:opacity-50 transition shadow-lg shadow-[#00ff66]/10"
                    >
                      <span>✓</span>
                      <span>Diesen Creator freigeben</span>
                    </button>

                    {/* [✕ Creator verwerfen] (Orange) */}
                    {creatorTabs.length > 1 && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={handleDiscardCreator}
                        className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 transition"
                      >
                        <span>✕</span>
                        <span>Creator verwerfen</span>
                      </button>
                    )}
                  </div>

                  {/* [🗑️ Komplettes Spiel löschen] (Rot) */}
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => handleDeleteWholeGame(selectedGameId)}
                    className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition"
                  >
                    <span>🗑️</span>
                    <span>Komplettes Spiel löschen</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-2xl border border-zinc-800 bg-[#121314] text-xs font-mono text-zinc-500">
                Wähle ein Spiel aus der linken Liste aus.
              </div>
            )}
          </div>

          {/* ==================== D. RECHTE SPALTE: Parallele Trophäen-Ansicht (3 Cols) ==================== */}
          <div className="lg:col-span-3 flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-[#121314] p-3 max-h-[calc(100vh-160px)] overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5 px-1 flex-wrap gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Trophäen ({gameTrophies.length})</h3>
                <p className="text-[10px] text-zinc-500 font-mono">
                  Referenz-Abgleich & Tipps
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <select
                  value={trophyLang}
                  onChange={(e) => setTrophyLang(e.target.value)}
                  className="rounded bg-zinc-900 border border-zinc-700 px-1.5 py-0.5 text-[10px] font-mono text-zinc-200 focus:border-[#00ff66] focus:outline-none"
                  title="Sprache für Trophäentexte & Tipps"
                >
                  <option value="de">DE 🇩🇪</option>
                  <option value="en">EN 🇬🇧</option>
                  <option value="es">ES 🇪🇸</option>
                  <option value="fr">FR 🇫🇷</option>
                  <option value="it">IT 🇮🇹</option>
                  <option value="ja">JA 🇯🇵</option>
                  <option value="pt">PT 🇵🇹</option>
                </select>
                {activeRowId && (
                  <span className="text-[9px] font-mono text-[#00ff66] bg-[#00ff66]/10 px-1.5 py-0.5 rounded border border-[#00ff66]/30">
                    Zuordnung bereit
                  </span>
                )}
              </div>
            </div>

            {loadingTrophies ? (
              <div className="py-8 text-center text-xs font-mono text-zinc-500 animate-pulse">
                Trophäen laden…
              </div>
            ) : gameTrophies.length === 0 ? (
              <div className="py-8 text-center text-xs font-mono text-zinc-500">
                Keine Trophäen für dieses Spiel in DB.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
                {gameTrophies.map((trophy) => (
                  <TrophyDraftItem
                    key={trophy.platform_achievement_id || trophy.id}
                    trophy={trophy}
                    activeRowId={activeRowId}
                    trophyLang={trophyLang}
                    onAssign={handleAssignTrophyToActiveRow}
                    onSaveGuideTip={handleSaveTrophyGuideTip}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Guide-Freigabe Bestätigen Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#16181a] p-5 shadow-2xl flex flex-col gap-4 text-zinc-200">
            <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Guide-Freigabe bestätigen
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Spiels: <span className="text-white font-medium">{getLocalizedTitle(selectedGame?.spieltitel)}</span>
                  <br />
                  Creator: <span className="text-[#00ff66] font-mono">{selectedCreatorName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="text-zinc-500 hover:text-white text-base leading-none p-1"
              >
                ✕
              </button>
            </div>

            {/* Pflichtfeld 1: Guide-Sprache */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span>1. Target Guide-Sprache (Pflichtfeld)</span>
                {approveLocale ? (
                  <span className="text-[10px] font-mono text-[#00ff66] font-bold">✓ {approveLocale.toUpperCase()} gewählt</span>
                ) : (
                  <span className="text-[10px] font-mono text-amber-400">Sprache wählen!</span>
                )}
              </label>

              {/* Schnellwahl Buttons */}
              <div className="flex flex-wrap gap-1.5">
                {['de', 'en', 'es', 'fr', 'ja', 'pt', 'it'].map((code) => {
                  const isSelected = approveLocale === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setApproveLocale(code)}
                      className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold uppercase transition ${
                        isSelected
                          ? 'bg-[#00ff66] text-black border border-[#00ff66]'
                          : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white'
                      }`}
                    >
                      {code}
                    </button>
                  );
                })}
              </div>

              {/* Alle weiteren Sprachen Dropdown */}
              <select
                value={approveLocale}
                onChange={(e) => setApproveLocale(e.target.value)}
                className="mt-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 font-mono focus:border-[#00ff66] focus:outline-none"
              >
                <option value="">-- Alle Sprachen durchsuchen --</option>
                {localeOptions().map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.flag} {opt.label} ({opt.code.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {/* Pflichtfeld 2: Spiel-Typ */}
            <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
              <label className="text-xs font-bold text-zinc-300 flex items-center justify-between">
                <span>2. Spiel-Typ (Max. 2, Mind. 1)</span>
                <span className="text-[10px] font-mono text-zinc-500">
                  {selectedGameTypes.length}/2 gewählt
                </span>
              </label>

              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-zinc-900/60 rounded-xl border border-zinc-800">
                {Object.values(GAME_TYPE).map((type) => {
                  const isChecked = selectedGameTypes.includes(type);
                  const isDisabled = !isChecked && selectedGameTypes.length >= 2;

                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        if (isChecked) {
                          setSelectedGameTypes((prev) => prev.filter((t) => t !== type));
                        } else if (selectedGameTypes.length < 2) {
                          setSelectedGameTypes((prev) => [...prev, type]);
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-mono text-[11px] transition ${
                        isChecked
                          ? 'bg-[#00ff66]/20 text-[#00ff66] border border-[#00ff66]/50 font-bold'
                          : isDisabled
                            ? 'opacity-30 cursor-not-allowed bg-zinc-800 text-zinc-500 border border-transparent'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white'
                      }`}
                    >
                      <span>{isChecked ? '✓' : '+'}</span>
                      <span>{type}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3 mt-1">
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                Abbrechen
              </button>

              <button
                type="button"
                disabled={actionBusy || !approveLocale || selectedGameTypes.length === 0}
                onClick={handleApproveCreatorConfirm}
                className="flex items-center gap-1.5 rounded-xl bg-[#00ff66] px-4 py-2 text-xs font-bold text-black hover:bg-[#00ff66]/90 disabled:opacity-40 transition shadow-lg shadow-[#00ff66]/10"
              >
                <span>✓</span>
                <span>
                  {approveLocale ? `Jetzt in [${approveLocale.toUpperCase()}] freigegeben` : 'Sprache wählen…'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
