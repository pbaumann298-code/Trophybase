const STORAGE_KEY = 'tb_media_consent';
export const MEDIA_CONSENT_EVENT = 'tb_media_consent';

/** @typedef {{ youtube: boolean, affiliates: boolean, decided: boolean }} MediaConsent */

function emptyConsent() {
  return { youtube: false, affiliates: false, decided: false };
}

export function readMediaConsent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyConsent();
    const parsed = JSON.parse(raw);
    return {
      youtube: Boolean(parsed?.youtube),
      affiliates: Boolean(parsed?.affiliates),
      decided: Boolean(parsed?.decided) || Boolean(parsed?.youtube) || Boolean(parsed?.affiliates),
    };
  } catch {
    return emptyConsent();
  }
}

function persist(next) {
  const value = {
    youtube: Boolean(next.youtube),
    affiliates: Boolean(next.affiliates),
    decided: true,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MEDIA_CONSENT_EVENT, { detail: value }));
  }
  return value;
}

export function allowYoutubeEmbeds() {
  const current = readMediaConsent();
  return persist({ ...current, youtube: true, decided: true });
}

export function declineOptionalMedia() {
  return persist({ youtube: false, affiliates: false, decided: true });
}

export function revokeYoutubeConsent() {
  return persist({ youtube: false, affiliates: false, decided: true });
}
