import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { useLocale } from '../context/LocaleContext';
import { isAdminUser } from '../lib/adminAccess';
import TrophyTypeIcon from '../components/TrophyTypeIcon';
import { normalizeTrophyType, TROPHY_TYPE } from '../lib/trophyTypes';

const SEEN_TROPHIES_STORAGE_KEY = 'tb_seen_platform_trophies';

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(dateStr);
  }
}

function formatNum(val) {
  const n = Number(val ?? 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('de-DE');
}

export function PlatformTrophiesPage({ onBack, sessionUser = null }) {
  const { globalLocale } = useLocale();
  const isAdmin = isAdminUser(sessionUser);

  const [trophies, setTrophies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [toast, setToast] = useState(null);

  const checkAndTriggerToast = useCallback(
    (dataList) => {
      if (!Array.isArray(dataList)) return;
      try {
        const rawSeen = typeof window !== 'undefined' ? localStorage.getItem(SEEN_TROPHIES_STORAGE_KEY) : null;
        let seenArr = [];
        if (rawSeen) {
          try {
            seenArr = JSON.parse(rawSeen);
          } catch {
            seenArr = [];
          }
        }
        const seenSet = new Set(seenArr.map((v) => String(v)));

        const newlyUnlocked = dataList.filter(
          (t) => t?.is_unlocked && !seenSet.has(String(t.id ?? t.trophy_id ?? t.platform_achievement_id)),
        );

        if (newlyUnlocked.length > 0) {
          const newest = newlyUnlocked[0];
          const isDe = globalLocale === 'de';
          const title =
            (isDe ? newest.title_de : newest.title_en) ||
            newest.title_de ||
            newest.title_en ||
            'Trophäe';

          setToast({ title });
          window.setTimeout(() => setToast(null), 5000);
        }

        const nextSeenSet = new Set(seenSet);
        for (const t of dataList) {
          if (t?.is_unlocked) {
            nextSeenSet.add(String(t.id ?? t.trophy_id ?? t.platform_achievement_id));
          }
        }
        if (typeof window !== 'undefined') {
          localStorage.setItem(SEEN_TROPHIES_STORAGE_KEY, JSON.stringify([...nextSeenSet]));
        }
      } catch (err) {
        console.warn('Fehler bei Pling-Toast:', err);
      }
    },
    [globalLocale],
  );

  const fetchPlatformTrophies = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setErrorMsg(null);

      try {
        const { data, error } = await supabase.rpc('tb_get_platform_trophies', {
          p_force_refresh: forceRefresh,
        });

        if (error) {
          console.error('tb_get_platform_trophies Error:', error);
          setErrorMsg(error.message || 'Fehler beim Laden der Plattform-Trophäen');
        } else if (Array.isArray(data)) {
          setTrophies(data);
          checkAndTriggerToast(data);
        } else {
          setTrophies([]);
        }
      } catch (err) {
        console.error('tb_get_platform_trophies Exception:', err);
        setErrorMsg(err?.message || 'Fehler beim Laden der Plattform-Trophäen');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [checkAndTriggerToast],
  );

  useEffect(() => {
    fetchPlatformTrophies(false);
  }, [fetchPlatformTrophies]);

  const typeCounts = useMemo(() => {
    const counts = {
      [TROPHY_TYPE.PLATINUM]: { unlocked: 0, total: 0 },
      [TROPHY_TYPE.GOLD]: { unlocked: 0, total: 0 },
      [TROPHY_TYPE.SILVER]: { unlocked: 0, total: 0 },
      [TROPHY_TYPE.BRONZE]: { unlocked: 0, total: 0 },
    };

    for (const t of trophies) {
      const type = normalizeTrophyType(t.trophy_type);
      if (counts[type]) {
        counts[type].total += 1;
        if (t.is_unlocked) {
          counts[type].unlocked += 1;
        }
      }
    }
    return counts;
  }, [trophies]);

  const unlockedCount = useMemo(() => trophies.filter((t) => t.is_unlocked).length, [trophies]);
  const totalCount = trophies.length;
  const overallPct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 text-gray-200">
      {/* 🔔 PlayStation-Style "Pling!" Toast */}
      {toast && (
        <div
          className="fixed top-20 right-4 sm:right-6 z-[100] max-w-md bg-[#18191a] border-2 border-[#00ff66]/70 text-white px-5 py-4 rounded-2xl shadow-2xl shadow-black/80 flex items-center gap-4 animate-bounce sm:animate-none transition-all duration-300"
          role="status"
          aria-live="polite"
        >
          <div className="text-3xl flex-shrink-0 animate-pulse">🏆</div>
          <div>
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#00ff66]">
              Plattform-Trophäe freigeschaltet!
            </div>
            <div className="text-sm font-bold text-zinc-100 mt-0.5">{toast.title}</div>
          </div>
        </div>
      )}

      {/* Back button & Header */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        {typeof onBack === 'function' ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-zinc-400 hover:text-white transition bg-[#1a1b1c] hover:bg-[#252628] border border-zinc-800 px-3.5 py-2 rounded-xl"
          >
            ← Zurück
          </button>
        ) : <div />}

        {isAdmin && (
          <button
            type="button"
            disabled={refreshing || loading}
            onClick={() => fetchPlatformTrophies(true)}
            className="inline-flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-[#00ff66] bg-[#00ff66]/10 hover:bg-[#00ff66]/20 border border-[#00ff66]/40 px-4 py-2 rounded-xl transition disabled:opacity-50"
          >
            {refreshing ? '🔄 Aktualisiere…' : '🔄 Live-Stand prüfen'}
          </button>
        )}
      </div>

      {/* Kopf-Kachel (PlayStation-Profil-Stil) */}
      <div className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-6 mb-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#00ff66]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏆</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                TrophyBase Platinliste V1
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 font-mono">
              Der Weg zur 100%-Plattform – Live-Meilensteine direkt aus der Datenbank
            </p>
          </div>

          {/* Stufen-Zähler & Gesamt-Fortschritt */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#121314] p-4 rounded-xl border border-zinc-800/80">
            {[
              { type: TROPHY_TYPE.PLATINUM, label: 'Platin' },
              { type: TROPHY_TYPE.GOLD, label: 'Gold' },
              { type: TROPHY_TYPE.SILVER, label: 'Silber' },
              { type: TROPHY_TYPE.BRONZE, label: 'Bronze' },
            ].map(({ type, label }) => {
              const stat = typeCounts[type] || { unlocked: 0, total: 0 };
              return (
                <div key={type} className="flex items-center gap-3 p-2 rounded-lg bg-[#1a1b1c]/60 border border-zinc-800/50">
                  <TrophyTypeIcon type={type} size={28} />
                  <div>
                    <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{label}</div>
                    <div className="text-sm font-bold font-mono text-zinc-200">
                      {stat.unlocked} <span className="text-zinc-600 font-normal">/ {stat.total}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Gesamter Fortschrittsbalken */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-zinc-400 font-semibold uppercase tracking-wider">Gesamt-Fortschritt</span>
              <span className="text-[#00ff66] font-bold">
                {unlockedCount} / {totalCount} ({overallPct}%)
              </span>
            </div>
            <div className="w-full h-3 bg-[#121314] rounded-full overflow-hidden border border-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-[#00ff66]/80 to-[#00ff66] transition-all duration-500 rounded-full"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Fehler / Lade-Anzeige */}
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl mb-6 text-sm font-mono">
          ⚠️ {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-zinc-500 font-mono text-sm animate-pulse">
          Plattform-Trophäen werden geladen…
        </div>
      ) : (
        <div className="space-y-4">
          {trophies.map((trophy, idx) => {
            const isUnlocked = Boolean(trophy.is_unlocked);
            const isSecret = Boolean(trophy.is_secret);
            const isDe = globalLocale === 'de';

            const title =
              (isDe ? trophy.title_de : trophy.title_en) ||
              trophy.title_de ||
              trophy.title_en ||
              '—';

            const desc =
              (isDe ? trophy.desc_de : trophy.desc_en) ||
              trophy.desc_de ||
              trophy.desc_en ||
              '';

            const curVal = Number(trophy.current_value ?? 0);
            const targetVal = Number(trophy.target_value ?? 1);
            const rawPct = trophy.progress_pct ?? (targetVal > 0 ? (curVal / targetVal) * 100 : 0);
            const progressPct = Math.min(100, Math.max(0, Math.round(Number(rawPct))));

            return (
              <div
                key={trophy.id ?? trophy.trophy_id ?? idx}
                className={`rounded-2xl p-4 sm:p-5 transition flex flex-col sm:flex-row gap-4 sm:items-center justify-between ${
                  isUnlocked
                    ? 'border border-[#00ff66]/40 bg-[#00ff66]/5 shadow-lg shadow-[#00ff66]/5'
                    : 'border border-zinc-800 bg-[#1a1b1c]'
                }`}
              >
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <div className="mt-0.5 flex-shrink-0">
                    <TrophyTypeIcon type={trophy.trophy_type} size={36} />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3
                        className={`text-base font-bold ${
                          isUnlocked ? 'text-[#00ff66]' : 'text-zinc-100'
                        }`}
                      >
                        {title}
                      </h3>

                      {isUnlocked && (
                        <span className="inline-flex items-center gap-1 bg-[#00ff66]/15 text-[#00ff66] border border-[#00ff66]/30 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold uppercase tracking-wider">
                          ✓ FREIGESCHALTET {trophy.unlocked_at ? `(${formatDate(trophy.unlocked_at)})` : ''}
                        </span>
                      )}

                      {isSecret && !isUnlocked && (
                        <span className="inline-flex items-center gap-1 bg-zinc-800 text-amber-400/90 border border-amber-500/30 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold uppercase tracking-wider">
                          ❓ Geheime Trophäe
                        </span>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                      {isSecret && !isUnlocked
                        ? 'Schalte weitere Meilensteine auf TrophyBase frei, um diese Trophäe zu enthüllen.'
                        : desc}
                    </p>
                  </div>
                </div>

                {/* Fortschrittsanzeige für offene Trophäen */}
                {!isUnlocked && (
                  <div className="sm:w-64 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/80">
                    {isSecret ? (
                      <div className="text-right text-xs font-mono text-zinc-500 italic">
                        Fortschritt verborgen
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs font-mono">
                          <span className="text-zinc-400">
                            {formatNum(curVal)} / {formatNum(targetVal)}
                          </span>
                          <span className="text-zinc-300 font-bold">{progressPct}%</span>
                        </div>
                        <div className="w-full h-2 bg-[#121314] rounded-full overflow-hidden border border-zinc-800">
                          <div
                            className="h-full bg-zinc-400 rounded-full transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PlatformTrophiesPage;