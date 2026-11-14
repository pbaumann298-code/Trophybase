export const AUTH_STORAGE_KEY = 'tb-auth-token';

const ROOT_COOKIE_DOMAIN = '.trophybase.app';
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const COOKIE_CHUNK_SIZE = 2800;
const MAX_COOKIE_CHUNKS = 12;

export function isTrophyBaseCookieDomain() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const host = String(window.location.hostname || '').toLowerCase();
  if (window.location.protocol !== 'https:') return false;
  return host === 'trophybase.app' || host.endsWith('.trophybase.app');
}

function readCookieMap() {
  const map = new Map();
  if (typeof document === 'undefined' || !document.cookie) return map;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const name = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1);
    map.set(name, val);
  }
  return map;
}

function isLikelyJsonAuthKey(key) {
  return key === AUTH_STORAGE_KEY || (key.startsWith('sb-') && key.endsWith('-auth-token'));
}

export function readChunkedAuthCookie(key) {
  if (!isTrophyBaseCookieDomain()) return null;
  try {
    const cookies = readCookieMap();
    const chunks = [];
    for (let i = 0; i < MAX_COOKIE_CHUNKS; i += 1) {
      const chunkVal = cookies.get(`${key}.${i}`);
      if (chunkVal === undefined) break;
      chunks.push(chunkVal);
    }

    const joined = chunks.length > 0 ? chunks.join('') : cookies.get(key);
    if (!joined) return null;

    const decoded = decodeURIComponent(joined);
    if (isLikelyJsonAuthKey(key)) {
      const parsed = JSON.parse(decoded);
      if (!parsed || typeof parsed !== 'object') return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function writeChunkedAuthCookie(key, value) {
  if (!isTrophyBaseCookieDomain()) return;
  try {
    const encoded = encodeURIComponent(String(value ?? ''));
    const chunks = [];
    for (let offset = 0; offset < encoded.length; offset += COOKIE_CHUNK_SIZE) {
      chunks.push(encoded.slice(offset, offset + COOKIE_CHUNK_SIZE));
    }
    if (chunks.length > MAX_COOKIE_CHUNKS) return;

    const existing = readCookieMap();
    const attrs = `Domain=${ROOT_COOKIE_DOMAIN}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Secure; SameSite=Lax`;
    for (let i = 0; i < chunks.length; i += 1) {
      document.cookie = `${key}.${i}=${chunks[i]}; ${attrs}`;
    }

    const clearAttrs = `Domain=${ROOT_COOKIE_DOMAIN}; Path=/; Max-Age=0; Secure; SameSite=Lax`;
    if (existing.has(key)) {
      document.cookie = `${key}=; ${clearAttrs}`;
    }
    for (let j = chunks.length; j < MAX_COOKIE_CHUNKS; j += 1) {
      if (existing.has(`${key}.${j}`)) {
        document.cookie = `${key}.${j}=; ${clearAttrs}`;
      }
    }
  } catch {
    /* ignore cookie write restrictions */
  }
}

export function clearChunkedAuthCookie(key) {
  if (!isTrophyBaseCookieDomain()) return;
  try {
    const existing = readCookieMap();
    const clearAttrs = `Domain=${ROOT_COOKIE_DOMAIN}; Path=/; Max-Age=0; Secure; SameSite=Lax`;
    if (existing.has(key)) {
      document.cookie = `${key}=; ${clearAttrs}`;
    }
    for (let i = 0; i < MAX_COOKIE_CHUNKS; i += 1) {
      if (existing.has(`${key}.${i}`)) {
        document.cookie = `${key}.${i}=; ${clearAttrs}`;
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Hybrider Storage-Adapter für Supabase Auth:
 * Teilt die Session automatisch über `.trophybase.app`-Cookies zwischen Hauptdomain
 * (`trophybase.app`) und allen Admin-Subdomain-WebAPKs (`bugs.trophybase.app`, `drafts.trophybase.app`, …),
 * inklusive nahtloser Refresh-Token-Rotation und gemeinsamem Logout.
 */
export const sharedAuthStorage = {
  getItem(key) {
    const fromCookie = readChunkedAuthCookie(key);
    if (fromCookie) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          if (window.localStorage.getItem(key) !== fromCookie) {
            window.localStorage.setItem(key, fromCookie);
          }
        }
      } catch {
        /* ignore */
      }
      return fromCookie;
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const fromLocal = window.localStorage.getItem(key);
        if (fromLocal) {
          writeChunkedAuthCookie(key, fromLocal);
          return fromLocal;
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  },

  setItem(key, value) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {
      /* ignore */
    }
    writeChunkedAuthCookie(key, value);
  },

  removeItem(key) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
    clearChunkedAuthCookie(key);
  },
};
