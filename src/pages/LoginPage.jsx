import React, { useState } from 'react';
import { supabase } from './supabaseClient';

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // ─── KLASSISCHER EMAIL/PASSWORT LOGIN ────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  // ─── CENTRAL SOCIAL LOGIN (Der Supabase-Zaubertrick) ──────────────────
  const handleSocialLogin = async (providerName) => {
    setLoading(false);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: providerName,
        options: {
          // Schickt den Nutzer nach dem Login auf der Drittanbieter-Seite 
          // vollautomatisch zurück auf deine TrophyBase-Adresse
          redirectTo: window.location.origin, 
        },
      });
      if (error) throw error;
    } catch (err) {
      alert(`Fehler beim Login mit ${providerName}: ${err.message}`);
    }
  };

  return (
    <div className="max-w-sm mx-auto w-full bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-8 shadow-2xl my-auto">
      
      {/* Überschrift */}
      <h3 className="text-lg font-bold text-white text-center mb-6">
        Alpha-Tester Login
      </h3>

      {/* ─── BLOCK 1: SOCIAL LOGINS ─── */}
      <div className="flex flex-col gap-2.5 mb-6">
        
        {/* DISCORD */}
        <button
          onClick={() => handleSocialLogin('discord')}
          className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2"
        >
          <span>Anmelden mit Discord</span>
        </button>

        {/* GOOGLE */}
        <button
          onClick={() => handleSocialLogin('google')}
          className="w-full bg-white hover:bg-zinc-100 text-zinc-900 text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2"
        >
          <span>Anmelden mit Google</span>
        </button>

        {/* APPLE */}
        <button
          onClick={() => handleSocialLogin('apple')}
          className="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2"
        >
          <span>Anmelden mit Apple</span>
        </button>

        {/* FACEBOOK */}
        <button
          onClick={() => handleSocialLogin('facebook')}
          className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2"
        >
          <span>Anmelden mit Facebook</span>
        </button>

      </div>

      {/* Visueller Trenner zwischen Social & Passwort */}
      <div className="flex items-center my-6 text-zinc-600">
        <div className="flex-1 border-t border-zinc-800"></div>
        <span className="px-3 text-[10px] uppercase font-bold tracking-wider">oder klassisch</span>
        <div className="flex-1 border-t border-zinc-800"></div>
      </div>

      {/* ─── BLOCK 2: KLASSISCHER EMAIL-LOGIN ─── */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
            E-Mail Adresse
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-[#121314] border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700"
            placeholder="tester@trophybase.de"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
            Passwort
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-[#121314] border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700"
            placeholder="••••"
          />
        </div>

        <button
          type="submit"
          className="bg-[#00ff66] hover:bg-[#00e65c] text-black font-semibold text-xs py-2.5 rounded-xl transition mt-2 shadow-[0_0_15px_rgba(0,255,102,0.15)]"
        >
          Einloggen
        </button>
      </form>

    </div>
  );
}

export default LoginPage;