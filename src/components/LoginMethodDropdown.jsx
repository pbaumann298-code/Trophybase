import { useEffect, useRef, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import { savePostLoginEntry } from '../lib/adminAccess';
import { normalizeEmail } from '../lib/maintenanceAccess';

const SOCIAL_OPTIONS = [
  {
    id: 'google',
    labelDe: 'Google',
    labelEn: 'Google',
    subDe: 'Direkt mit Google-Konto anmelden',
    subEn: 'Sign in with Google',
    badgeClass: 'bg-white text-zinc-900',
    badgeText: 'G',
  },
  {
    id: 'discord',
    labelDe: 'Discord',
    labelEn: 'Discord',
    subDe: 'Mit Discord-Account verbinden',
    subEn: 'Sign in with Discord',
    badgeClass: 'bg-[#5865F2] text-white',
    badgeText: 'D',
  },
  {
    id: 'twitch',
    labelDe: 'Twitch',
    labelEn: 'Twitch',
    subDe: 'Mit Twitch-Account verbinden',
    subEn: 'Sign in with Twitch',
    badgeClass: 'bg-[#9146FF] text-white',
    badgeText: 'T',
  },
];

/**
 * Kompaktes Dropdown-Menü "Login über" für alle Anmelde-Wege
 * (Google, Discord, Twitch, E-Mail-Link & optional E-Mail + Passwort).
 */
export default function LoginMethodDropdown({
  locale = 'de',
  redirectTo = '',
  onPasswordLogin = null,
  compact = false,
  postLoginEntry = '',
  externalError = '',
  passwordBusy = false,
}) {
  const isDe = locale !== 'en';
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMode, setActiveMode] = useState('');
  const [oauthBusy, setOauthBusy] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicSent, setMagicSent] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const wrapRef = useRef(null);

  const resolvedRedirect =
    redirectTo ||
    (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '');

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleOutside = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const triggerOAuth = async (provider) => {
    setMenuOpen(false);
    setErrorMsg('');
    setMagicSent('');
    setOauthBusy(provider);
    if (postLoginEntry) savePostLoginEntry(postLoginEntry);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: resolvedRedirect },
    });
    if (error) {
      setErrorMsg(error.message || (isDe ? 'Anmeldung fehlgeschlagen.' : 'Sign-in failed.'));
      setOauthBusy('');
    }
  };

  const selectEmailMode = (mode) => {
    setMenuOpen(false);
    setErrorMsg('');
    setMagicSent('');
    setActiveMode(mode);
  };

  const handleMagicSubmit = async (event) => {
    event.preventDefault();
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg(
        isDe ? 'Bitte gib eine gültige E-Mail-Adresse ein.' : 'Please enter a valid email address.',
      );
      return;
    }
    setMagicBusy(true);
    setErrorMsg('');
    setMagicSent('');
    if (postLoginEntry) savePostLoginEntry(postLoginEntry);
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { emailRedirectTo: resolvedRedirect },
    });
    setMagicBusy(false);
    if (error) {
      setErrorMsg(
        error.message ||
          (isDe ? 'Anmelde-Link konnte nicht gesendet werden.' : 'Could not send sign-in link.'),
      );
      return;
    }
    setMagicSent(
      isDe
        ? 'Anmelde-Link gesendet! Bitte prüfe dein E-Mail-Postfach.'
        : 'Sign-in link sent! Please check your inbox.',
    );
  };

  const handlePasswordSubmit = (event) => {
    event.preventDefault();
    if (typeof onPasswordLogin !== 'function') return;
    setErrorMsg('');
    onPasswordLogin(normalizeEmail(email), password.trim());
  };

  const selectedLabel = (() => {
    if (oauthBusy) {
      return isDe ? `Weiterleitung zu ${oauthBusy}…` : `Redirecting to ${oauthBusy}…`;
    }
    if (activeMode === 'magic') {
      return isDe ? 'Login über: E-Mail-Link' : 'Sign in via: Email link';
    }
    if (activeMode === 'password') {
      return isDe ? 'Login über: E-Mail & Passwort' : 'Sign in via: Email & password';
    }
    return isDe ? 'Login über' : 'Sign in via';
  })();

  return (
    <div ref={wrapRef} className={compact ? 'w-full max-w-xs' : 'w-full'}>
      <div className="relative">
        <button
          type="button"
          disabled={Boolean(oauthBusy)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#00ff66]/45 bg-[#121614] hover:border-[#00ff66] hover:bg-[#151b18] disabled:opacity-50 px-4 py-2.5 text-xs font-bold text-white transition cursor-pointer shadow-[0_0_15px_rgba(0,255,102,0.08)]"
        >
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#00ff66]" aria-hidden />
            <span>{selectedLabel}</span>
          </span>
          <span className="font-mono text-[11px] text-[#00ff66]">{menuOpen ? '▴' : '▾'}</span>
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-xl border border-zinc-700 bg-[#141517] p-1.5 shadow-2xl"
          >
            {SOCIAL_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="menuitem"
                onClick={() => triggerOAuth(opt.id)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-zinc-800/90 transition cursor-pointer"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-extrabold ${opt.badgeClass}`}
                >
                  {opt.badgeText}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-white">
                    {isDe ? opt.labelDe : opt.labelEn}
                  </span>
                  <span className="block text-[10px] text-zinc-400 truncate">
                    {isDe ? opt.subDe : opt.subEn}
                  </span>
                </span>
              </button>
            ))}

            <div className="my-1 border-t border-zinc-800" />

            <button
              type="button"
              role="menuitem"
              onClick={() => selectEmailMode('magic')}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-zinc-800/90 transition cursor-pointer ${
                activeMode === 'magic' ? 'bg-zinc-800/70' : ''
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-xs">
                ✉️
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-white">
                  {isDe ? 'E-Mail-Link (ohne Passwort)' : 'Email Magic Link'}
                </span>
                <span className="block text-[10px] text-zinc-400 truncate">
                  {isDe ? 'Einmal-Link per E-Mail zusenden' : 'Receive a one-click sign-in link'}
                </span>
              </span>
            </button>

            {typeof onPasswordLogin === 'function' ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => selectEmailMode('password')}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-zinc-800/90 transition cursor-pointer ${
                  activeMode === 'password' ? 'bg-zinc-800/70' : ''
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-xs">
                  🔑
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-white">
                    {isDe ? 'E-Mail & Passwort' : 'Email & Password'}
                  </span>
                  <span className="block text-[10px] text-zinc-400 truncate">
                    {isDe ? 'Klassischer Login mit Passwort' : 'Classic password sign-in'}
                  </span>
                </span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {activeMode === 'magic' ? (
        <form onSubmit={handleMagicSubmit} className="mt-3 flex flex-col gap-2.5 rounded-xl border border-zinc-800 bg-[#121314] p-3.5">
          <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
            {isDe ? 'E-Mail-Adresse für Anmelde-Link' : 'Email address for sign-in link'}
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="deine@email.de"
            className="w-full rounded-xl border border-zinc-800 bg-[#0c0d0f] px-3.5 py-2 text-xs text-zinc-200 focus:border-[#00ff66]/50 focus:outline-hidden"
          />
          <button
            type="submit"
            disabled={magicBusy}
            className="w-full rounded-xl bg-[#00ff66] hover:bg-[#00e65c] disabled:opacity-50 py-2 text-xs font-bold text-zinc-950 transition cursor-pointer"
          >
            {magicBusy
              ? isDe
                ? 'Sende Link…'
                : 'Sending link…'
              : isDe
                ? 'Anmelde-Link senden'
                : 'Send sign-in link'}
          </button>
        </form>
      ) : null}

      {activeMode === 'password' && typeof onPasswordLogin === 'function' ? (
        <form onSubmit={handlePasswordSubmit} className="mt-3 flex flex-col gap-3 rounded-xl border border-zinc-800 bg-[#121314] p-3.5">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
              {isDe ? 'E-Mail-Adresse' : 'Email address'}
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="deine@email.de"
              className="w-full rounded-xl border border-zinc-800 bg-[#0c0d0f] px-3.5 py-2 text-xs text-zinc-200 focus:border-[#00ff66]/50 focus:outline-hidden"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
              {isDe ? 'Passwort' : 'Password'}
            </label>
            <div className="relative w-full">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isDe ? 'Passwort eingeben' : 'Enter password'}
                className="w-full rounded-xl border border-zinc-800 bg-[#0c0d0f] pl-3.5 pr-10 py-2 text-xs text-zinc-200 focus:border-[#00ff66]/50 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs select-none cursor-pointer"
                title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={passwordBusy}
            className="w-full rounded-xl bg-[#00ff66] hover:bg-[#00e65c] disabled:opacity-50 py-2 text-xs font-bold text-zinc-950 transition cursor-pointer"
          >
            {passwordBusy ? (isDe ? 'Anmelden…' : 'Signing in…') : isDe ? 'Einloggen' : 'Sign in'}
          </button>
        </form>
      ) : null}

      {errorMsg || externalError ? (
        <p className="mt-2.5 text-xs text-red-400">{errorMsg || externalError}</p>
      ) : null}
      {magicSent ? <p className="mt-2.5 text-xs text-[#00ff66]">{magicSent}</p> : null}
    </div>
  );
}
