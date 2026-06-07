/**
 * Konvertiert MM:SS oder HH:MM:SS in Sekunden.
 * @param {string|number|null|undefined} timecode
 * @returns {number|null}
 */
export function parseTimecodeToSeconds(timecode) {
  if (timecode == null || timecode === '') return null;
  if (typeof timecode === 'number' && !Number.isNaN(timecode)) {
    return Math.max(0, Math.floor(timecode));
  }

  const raw = String(timecode).trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) return parseInt(raw, 10);

  const parts = raw.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;

  if (parts.length === 2) {
    const [mm, ss] = parts;
    return mm * 60 + ss;
  }
  if (parts.length === 3) {
    const [hh, mm, ss] = parts;
    return hh * 3600 + mm * 60 + ss;
  }

  return null;
}

/**
 * Hängt YouTube-Zeitstempel an (t= Sekunden).
 * @param {string} url
 * @param {string|number|null|undefined} timecode
 */
export function buildVideoUrlWithTimestamp(url, timecode) {
  if (!url) return '';
  const seconds = parseTimecodeToSeconds(timecode);
  if (seconds == null || seconds <= 0) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${seconds}`;
}
