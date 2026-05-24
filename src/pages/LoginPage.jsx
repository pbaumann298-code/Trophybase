import React, { useState } from 'react';

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); // Schalter für das Auge

  const handleSubmit = (e) => {
    e.preventDefault();
    // Reicht die exakten eingetippten Werte an handleLogin in der App.jsx weiter
    onLogin(email, password); 
  };

  const handleSocialLogin = async (providerName) => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: providerName,
        options: {
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
      
      <h3 className="text-lg font-bold text-white text-center mb-6">
        Alpha-Tester Login
      </h3>

      {/* SOCIAL LOGINS */}
      <div className="flex flex-col gap-2.5 mb-6">
        <button onClick={() => handleSocialLogin('discord')} className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold py-2.5 rounded-xl transition">
          Anmelden mit Discord
        </button>
        <button onClick={() => handleSocialLogin('google')} className="w-full bg-white hover:bg-zinc-100 text-zinc-900 text-xs font-semibold py-2.5 rounded-xl transition">
          Anmelden mit Google
        </button>
        <button onClick={() => handleSocialLogin('apple')} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold py-2.5 rounded-xl transition">
          Anmelden mit Apple
        </button>
        <button onClick={() => handleSocialLogin('facebook')} className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white text-xs font-semibold py-2.5 rounded-xl transition">
          Anmelden mit Facebook
        </button>
      </div>

      <div className="flex items-center my-6 text-zinc-600">
        <div className="flex-1 border-t border-zinc-800"></div>
        <span className="px-3 text-[10px] uppercase font-bold tracking-wider">oder klassisch</span>
        <div className="flex-1 border-t border-zinc-800"></div>
      </div>

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