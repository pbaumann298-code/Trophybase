import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { linkSocialIdentity } from '../lib/trophyBaseAuth';

const PROVIDERS = [
  { id: 'discord', label: 'Mit Discord verknüpfen', className: 'bg-[#5865F2] hover:bg-[#4752C4] text-white' },
  { id: 'google', label: 'Mit Google verknüpfen', className: 'bg-white hover:bg-zinc-100 text-zinc-900' },
  { id: 'apple', label: 'Mit Apple verknüpfen', className: 'bg-zinc-800 hover:bg-zinc-700 text-white' },
  { id: 'facebook', label: 'Mit Facebook verknüpfen', className: 'bg-[#1877F2] hover:bg-[#166FE5] text-white' },
];

function SocialLinkPage({ sessionUser, onLogout }) {
  const [linking, setLinking] = useState(null);

  const handleLink = async (provider) => {
    setLinking(provider);
    try {
      const result = await linkSocialIdentity(supabase, provider);
      if (!result.ok) {
        throw result.error ?? new Error('Verknüpfung fehlgeschlagen');
      }
      // Bei Erfolg: Browser-Redirect zum OAuth-Provider (linkIdentity)
    } catch (err) {
      alert(`Verknüpfung mit ${provider} fehlgeschlagen: ${err.message}`);
      setLinking(null);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-6 shadow-xl">
        <div className="w-12 h-12 rounded-full bg-[#00ff66]/10 flex items-center justify-center text-xl mb-4 mx-auto">
          🔗
        </div>
        <h2 className="text-xl font-bold text-white text-center mb-1">Account verknüpfen</h2>
        <p className="text-xs text-zinc-400 text-center mb-6 max-w-sm mx-auto leading-relaxed">
          Schritt 2: Deine Session ist aktiv. Verknüpfe mindestens einen Social-Login mit
          {sessionUser?.email ? (
            <>
              {' '}
              <span className="font-mono text-zinc-300">{sessionUser.email}</span>
            </>
          ) : (
            ' deinem Zugang'
          )}
          , um die Wartungssperre dauerhaft zu umgehen.
        </p>

        <div className="flex flex-col gap-2.5">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              type="button"
              disabled={!!linking}
              onClick={() => handleLink(provider.id)}
              className={`w-full text-xs font-semibold py-2.5 rounded-xl transition disabled:opacity-50 ${provider.className}`}
            >
              {linking === provider.id ? 'Weiterleitung …' : provider.label}
            </button>
          ))}
        </div>

        <p className="text-[10px] text-zinc-600 text-center mt-4 font-mono">
          Nutzt linkIdentity() · Manual Linking in Supabase muss aktiv sein
        </p>

        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="w-full mt-4 text-xs text-zinc-500 hover:text-zinc-300 transition bg-transparent border-none cursor-pointer"
          >
            Mit anderem Account anmelden
          </button>
        )}
      </div>
    </div>
  );
}

export default SocialLinkPage;
