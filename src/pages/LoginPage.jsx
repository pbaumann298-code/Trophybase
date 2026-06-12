import React, { useState } from 'react';
import { normalizeEmail } from '../lib/maintenanceAccess';

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); // Schalter für das Auge

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(normalizeEmail(email), password.trim());
  };

  return (
    <div className="max-w-sm mx-auto w-full bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-8 shadow-2xl my-auto">
      
      <h3 className="text-lg font-bold text-white text-center mb-6">
        Alpha-Tester Login
      </h3>

      <p className="text-xs text-zinc-500 text-center mb-6 leading-relaxed">
        Schritt 1: Melde dich mit deinem temporären Tester- oder Creator-Zugang an. Im nächsten
        Schritt verknüpfst du einen Social-Login.
      </p>

      {/* EMAIL & PASSWORT FORMULAR */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
            E-Mail Adresse
          </label>
          <input
            type="email"
            required
            autoComplete="off" // ⛔ Verhindert das automatische Reinklatschen durch den Browser
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-[#121314] border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700 w-full"
            placeholder="Deine Tester-Mail eingeben"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
            Passwort
          </label>
          <div className="relative w-full">
            <input
              type={showPassword ? "text" : "password"} // 👁️ Schaltet dynamisch den Typ um!
              required
              autoComplete="new-password" // ⛔ Blockiert zähen Passwort-Autofill
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-[#121314] border border-zinc-800 rounded-xl pl-4 pr-12 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700 w-full"
              placeholder="Passwort eingeben"
            />
            {/* Das klickbare Auge rechts im Feld */}
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition text-sm select-none"
              title={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
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