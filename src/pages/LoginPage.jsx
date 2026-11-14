import { useState } from 'react';
import { supabase } from './supabaseClient';
import { normalizeEmail } from '../lib/maintenanceAccess';

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [oauthBusy, setOauthBusy] = useState('');
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicSent, setMagicSent] = useState('');
  const [oauthError, setOauthError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(normalizeEmail(email), password.trim());
  };

  const handleOAuth = async (provider) => {
    setOauthError('');
    setOauthBusy(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setOauthError(error.message || 'Social-Login fehlgeschlagen.');
      setOauthBusy('');
    }
  };

  const handleMagicLink = async () => {
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setOauthError('Bitte gib unten deine E-Mail-Adresse ein.');
      return;
    }
    setMagicBusy(true);
    setOauthError('');
    setMagicSent('');
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { emailRedirectTo: window.location.origin },
    });
    setMagicBusy(false);
    if (error) {
      setOauthError(error.message || 'Magic-Link konnte nicht gesendet werden.');
      return;
    }
    setMagicSent('Anmelde-Link gesendet! Bitte prüfe dein E-Mail-Postfach.');
  };

  return (
    <div className="max-w-sm mx-auto w-full bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-8 shadow-2xl my-auto">
      <h3 className="text-lg font-bold text-white text-center mb-2">
        Anmelden bei TrophyBase
      </h3>

      <p className="text-xs text-zinc-500 text-center mb-5 leading-relaxed">
        Melde dich schnell per Social-Login oder mit E-Mail an.
      </p>

      <div className="flex flex-col gap-2 mb-5">
        <button
          type="button"
          disabled={Boolean(oauthBusy)}
          onClick={() => handleOAuth('google')}
          className="w-full rounded-xl bg-white hover:bg-zinc-100 disabled:opacity-50 py-2.5 text-xs font-bold text-zinc-900 transition cursor-pointer"
        >
          {oauthBusy === 'google' ? 'Weiterleitung…' : 'Mit Google anmelden'}
        </button>
        <button
          type="button"
          disabled={Boolean(oauthBusy)}
          onClick={() => handleOAuth('discord')}
          className="w-full rounded-xl bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 py-2.5 text-xs font-bold text-white transition cursor-pointer"
        >
          {oauthBusy === 'discord' ? 'Weiterleitung…' : 'Mit Discord anmelden'}
        </button>
        <button
          type="button"
          disabled={Boolean(oauthBusy)}
          onClick={() => handleOAuth('twitch')}
          className="w-full rounded-xl bg-[#9146FF] hover:bg-[#772CE8] disabled:opacity-50 py-2.5 text-xs font-bold text-white transition cursor-pointer"
        >
          {oauthBusy === 'twitch' ? 'Weiterleitung…' : 'Mit Twitch anmelden'}
        </button>
      </div>

      {oauthError ? (
        <p className="text-xs text-red-400 text-center mb-4">{oauthError}</p>
      ) : null}
      {magicSent ? (
        <p className="text-xs text-[#00ff66] text-center mb-4">{magicSent}</p>
      ) : null}

      <div className="relative flex items-center justify-center my-4">
        <div className="w-full border-t border-zinc-800" />
        <span className="bg-[#1a1b1c] px-3 text-[10px] uppercase tracking-wider font-mono text-zinc-500">
          oder E-Mail
        </span>
        <div className="w-full border-t border-zinc-800" />
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
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-[#121314] border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-200 focus:outline-hidden focus:border-zinc-700 w-full"
            placeholder="deine@email.de"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
            Passwort (optional bei Magic-Link)
          </label>
          <div className="relative w-full">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-[#121314] border border-zinc-800 rounded-xl pl-4 pr-12 py-2 text-sm text-zinc-200 focus:outline-hidden focus:border-zinc-700 w-full"
              placeholder="Passwort eingeben"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition text-sm select-none"
              title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="bg-[#00ff66] hover:bg-[#00e65c] text-black font-semibold text-xs py-2.5 rounded-xl transition mt-1 shadow-[0_0_15px_rgba(0,255,102,0.15)] cursor-pointer"
        >
          Mit Passwort einloggen
        </button>
        <button
          type="button"
          disabled={magicBusy}
          onClick={handleMagicLink}
          className="border border-zinc-700 bg-zinc-900 hover:border-zinc-500 disabled:opacity-50 text-zinc-200 font-semibold text-xs py-2.5 rounded-xl transition cursor-pointer"
        >
          {magicBusy ? 'Sende Link…' : 'Ohne Passwort per E-Mail-Link anmelden'}
        </button>
      </form>
    </div>
  );
}

export default LoginPage;