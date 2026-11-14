import { useState } from 'react';
import IntranetGameSearch from '../../components/intranet/IntranetGameSearch';
import IntranetFollowups from '../../components/intranet/IntranetFollowups';
import { useAdminFollowups } from '../../hooks/useAdminFollowups';

export default function DatabaseView({ sessionUser, onOpenInDrafts }) {
  const [subTab, setSubTab] = useState('search'); // 'search' | 'followups'
  const { entries: followups } = useAdminFollowups(sessionUser?.id || null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSubTab('search')}
          className={`rounded-xl border px-3 py-1.5 text-xs font-mono font-bold transition cursor-pointer ${
            subTab === 'search'
              ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-300'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          🗄️ Spiele-Datenbank
        </button>
        <button
          type="button"
          onClick={() => setSubTab('followups')}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-mono font-bold transition cursor-pointer ${
            subTab === 'followups'
              ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <span>📌 Wiedervorlage</span>
          {followups.length > 0 && (
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
              {followups.length}
            </span>
          )}
        </button>
      </div>

      {/* Keep-Alive: Suche bleibt beim kurzen Blick in die Wiedervorlage erhalten */}
      <div className={subTab === 'search' ? 'block' : 'hidden'}>
        <IntranetGameSearch sessionUser={sessionUser} onOpenInDrafts={onOpenInDrafts} />
      </div>
      {subTab === 'followups' && (
        <IntranetFollowups sessionUser={sessionUser} onOpenInDrafts={onOpenInDrafts} />
      )}
    </div>
  );
}
