import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  allowYoutubeEmbeds,
  declineOptionalMedia,
  MEDIA_CONSENT_EVENT,
  readMediaConsent,
  revokeYoutubeConsent,
} from '../lib/mediaConsent';

const MediaConsentContext = createContext(null);

export function MediaConsentProvider({ children }) {
  const [consent, setConsent] = useState(() =>
    typeof window === 'undefined' ? { youtube: false, affiliates: false, decided: false } : readMediaConsent(),
  );

  useEffect(() => {
    const onChange = (event) => {
      setConsent(event?.detail ?? readMediaConsent());
    };
    window.addEventListener(MEDIA_CONSENT_EVENT, onChange);
    return () => window.removeEventListener(MEDIA_CONSENT_EVENT, onChange);
  }, []);

  const allowYoutube = useCallback(() => {
    setConsent(allowYoutubeEmbeds());
  }, []);

  const declineOptional = useCallback(() => {
    setConsent(declineOptionalMedia());
  }, []);

  const revokeYoutube = useCallback(() => {
    setConsent(revokeYoutubeConsent());
  }, []);

  const value = useMemo(
    () => ({
      youtube: consent.youtube,
      affiliates: consent.affiliates,
      decided: consent.decided,
      allowYoutube,
      declineOptional,
      revokeYoutube,
    }),
    [consent, allowYoutube, declineOptional, revokeYoutube],
  );

  return <MediaConsentContext.Provider value={value}>{children}</MediaConsentContext.Provider>;
}

export function useMediaConsent() {
  const ctx = useContext(MediaConsentContext);
  if (!ctx) {
    return {
      youtube: false,
      affiliates: false,
      decided: false,
      allowYoutube: () => {},
      declineOptional: () => {},
      revokeYoutube: () => {},
    };
  }
  return ctx;
}
