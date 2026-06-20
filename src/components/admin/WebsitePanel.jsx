import React from 'react';
import { setAdminReturnFlag } from '../../lib/adminAccess';

function WebsitePanel() {
  const openWebsite = () => {
    setAdminReturnFlag(true);
    window.location.href = '/';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Website-Vorschau</h2>
        <p className="text-sm text-zinc-500">
          Öffne die normale TrophyBase-Website in derselben Session. Im Header erscheint ein
          Button „Admin“, um hierher zurückzukehren.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-[#1a1b1c] p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <p className="text-sm text-zinc-300 font-mono">https://www.trophybase.app/</p>
          <p className="text-xs text-zinc-500 mt-1">Gleicher Supabase-Login · Wartungsmodus wird umgangen (Admin)</p>
        </div>
        <button
          type="button"
          onClick={openWebsite}
          className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-[#00ff66] text-[#121314] text-sm font-bold hover:bg-[#00dd55] transition"
        >
          Website öffnen
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-[#121314] p-4 text-xs text-zinc-500">
        Tipp: Nach dem Öffnen kannst du Guides und Trophäen live prüfen, während du Meldungen
        in einem zweiten Tab bearbeitest.
      </div>
    </div>
  );
}

export default WebsitePanel;
