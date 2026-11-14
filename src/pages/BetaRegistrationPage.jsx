import { useEffect } from 'react';
import { supabase } from './supabaseClient';
import { fetchMyCreatorProfile, isAdminUser } from '../lib/adminAccess';

/**
 * Legacy-Route `/beta`: leitet nahtlos auf das zentrale Login-Tor `/intranet.html`
 * bzw. bei bestehender Session direkt auf das passende Ziel weiter.
 */
function BetaRegistrationPage({ sessionUser }) {
  useEffect(() => {
    let cancelled = false;

    async function redirectFromLegacyBeta() {
      if (!sessionUser) {
        window.location.replace('/intranet.html');
        return;
      }
      if (isAdminUser(sessionUser, { allowPublic: true, ignoreGuestSimulation: true })) {
        window.location.replace('/intranet.html');
        return;
      }
      const creator = await fetchMyCreatorProfile(supabase, 2000);
      if (cancelled) return;
      window.location.replace(creator?.id ? '/profile?tab=creator' : '/profile');
    }

    redirectFromLegacyBeta();
    return () => {
      cancelled = true;
    };
  }, [sessionUser]);

  return (
    <div className="tb-fill-screen w-full flex items-center justify-center bg-[#121314] px-4 py-12 font-mono text-sm text-zinc-400">
      Weiterleitung zum Login…
    </div>
  );
}

export default BetaRegistrationPage;
