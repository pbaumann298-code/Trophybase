import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { isBetaTester, registerBetaAccount, redeemInviteKey } from '../lib/betaAccess';

function TrophyBaseLogo() {
  return (
    <div className="text-2xl sm:text-3xl font-bold text-center mb-10">
      <span className="text-white">TrophyBase</span>
      <span className="text-[#00ff66]">.app</span>
    </div>
  );
}

function BetaRegistrationPage({ sessionUser, onComplete }) {
  const [step, setStep] = useState('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userKey, setUserKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (!sessionUser) {
      setStep('register');
      return;
    }
    if (isBetaTester(sessionUser)) {
      onComplete?.();
      return;
    }
    setStep('invite-key');
  }, [sessionUser, onComplete]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setInfo('');

    const result = await registerBetaAccount(supabase, email, password);
    setLoading(false);

    if (!result.ok) {
      alert(result.message);
      return;
    }

    if (result.needsEmailConfirm) {
      setInfo(result.message);
      return;
    }

    setStep('invite-key');
  };

  const handleRedeemKey = async (e) => {
    e.preventDefault();
    setLoading(true);
    setInfo('');

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setLoading(false);
      alert('Bitte melde dich an, bevor du einen Key einlöst.');
      setStep('register');
      return;
    }

    const result = await redeemInviteKey(supabase, userKey, user.id);
    setLoading(false);

    if (!result.ok) {
      alert(result.message);
      return;
    }

    alert('Erfolgreich freigeschaltet! Willkommen bei TrophyBase.');
    onComplete?.();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#121314] px-4 py-12">
      <div className="w-full max-w-sm">
        <TrophyBaseLogo />

        {step === 'register' && (
          <form
            onSubmit={handleRegister}
            className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-8 shadow-2xl flex flex-col gap-4"
          >
            <p className="text-xs text-zinc-500 text-center mb-2">
              Beta-Registrierung · Schritt 1 von 2
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                E-Mail
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-[#121314] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700 w-full"
                placeholder="deine@email.de"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Passwort
              </label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-[#121314] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700 w-full"
                placeholder="Mindestens 6 Zeichen"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-[#00ff66] hover:bg-[#00e65c] disabled:opacity-50 text-black font-semibold text-sm py-2.5 rounded-xl transition mt-2 shadow-[0_0_15px_rgba(0,255,102,0.15)]"
            >
              {loading ? 'Wird registriert …' : 'Account erstellen'}
            </button>

            {info && (
              <p className="text-xs text-amber-400/90 text-center leading-relaxed">{info}</p>
            )}
          </form>
        )}

        {step === 'invite-key' && (
          <form
            onSubmit={handleRedeemKey}
            className="bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-8 shadow-2xl flex flex-col gap-4"
          >
            <p className="text-xs text-zinc-500 text-center mb-2">
              Beta-Freischaltung · Schritt 2 von 2
            </p>
            <p className="text-xs text-zinc-400 text-center leading-relaxed mb-2">
              Gib deinen persönlichen Beta-Key ein (z.&nbsp;B.{' '}
              <span className="font-mono text-zinc-300">tester1@trophybase</span>).
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Beta-Key
              </label>
              <input
                type="text"
                required
                autoComplete="off"
                value={userKey}
                onChange={(e) => setUserKey(e.target.value)}
                className="bg-[#121314] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200 font-mono focus:outline-none focus:border-[#00ff66]/40 w-full"
                placeholder="tester1@trophybase"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-[#00ff66] hover:bg-[#00e65c] disabled:opacity-50 text-black font-semibold text-sm py-2.5 rounded-xl transition mt-2 shadow-[0_0_15px_rgba(0,255,102,0.15)]"
            >
              {loading ? 'Wird geprüft …' : 'Key einlösen & starten'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default BetaRegistrationPage;
