import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { isBetaTester, signInWithBetaTesterKeys } from '../lib/betaAccess';

function TrophyBaseLogo() {
  return (
    <div className="text-2xl sm:text-3xl font-bold text-center mb-10">
      <span className="text-white">TrophyBase</span>
      <span className="text-[#00ff66]">.app</span>
    </div>
  );
}

function ensureBetaUrl() {
  if (window.location.pathname !== '/beta') {
    window.history.pushState({}, '', '/beta');
  }
}

/**
 * Beta-Zugang: Tester-ID (Tester_XXXXX) + Passwort aus public.beta_testers.
 * Alte E-Mail-Registrierung + invite_keys entfällt hier.
 */
function BetaRegistrationPage({ sessionUser, onSessionEstablished, onComplete }) {
  const [testerId, setTesterId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState('');

  useEffect(() => {
    ensureBetaUrl();
    if (sessionUser && isBetaTester(sessionUser)) {
      onComplete?.();
    }
  }, [sessionUser, onComplete]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setInfo('');

    const result = await signInWithBetaTesterKeys(supabase, testerId, password);
    setLoading(false);

    if (!result.ok) {
      setInfo(result.message);
      return;
    }

    onSessionEstablished?.(result.user);
    onComplete?.();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#121314] px-4 py-12">
      <div className="w-full max-w-sm">
        <TrophyBaseLogo />

        <form
          onSubmit={handleSubmit}
          className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-8 shadow-2xl flex flex-col gap-4"
        >
          <p className="text-xs text-zinc-500 text-center mb-1">Beta-Zugang</p>
          <p className="text-xs text-zinc-400 text-center leading-relaxed mb-2">
            Gib deine persönliche <span className="font-mono text-zinc-300">Tester-ID</span> und
            das zugehörige Passwort ein (beides aus der Beta-Mail).
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              Tester-ID
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              spellCheck={false}
              value={testerId}
              onChange={(e) => setTesterId(e.target.value)}
              className="bg-[#121314] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200 font-mono focus:outline-hidden focus:border-[#00ff66]/40 w-full"
              placeholder="Tester_A9k2M"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              Passwort
            </label>
            <div className="relative w-full">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-[#121314] border border-zinc-800 rounded-xl pl-4 pr-12 py-2.5 text-sm text-zinc-200 font-mono focus:outline-hidden focus:border-[#00ff66]/40 w-full"
                placeholder="Beta-Passwort"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition text-sm select-none"
                title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-[#00ff66] hover:bg-[#00e65c] disabled:opacity-50 text-black font-semibold text-sm py-2.5 rounded-xl transition mt-2 shadow-[0_0_15px_rgba(0,255,102,0.15)]"
          >
            {loading ? 'Wird geprüft …' : 'Beta starten'}
          </button>

          {info ? (
            <p className="text-xs text-amber-400/90 text-center leading-relaxed">{info}</p>
          ) : null}
        </form>

        <p className="mt-6 text-[11px] text-zinc-600 text-center leading-relaxed">
          Social-Logins (Google / Discord) kommen als Nächstes – bis dahin reicht der Beta-Key.
        </p>

        <nav className="mt-6 flex justify-center gap-4 text-[11px] text-zinc-600">
          <a href="/impressum" className="hover:text-zinc-300 transition">
            Impressum
          </a>
          <a href="/datenschutz" className="hover:text-zinc-300 transition">
            Datenschutz
          </a>
        </nav>
      </div>
    </div>
  );
}

export default BetaRegistrationPage;
