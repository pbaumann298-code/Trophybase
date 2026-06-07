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

/**
 * YouTube-Embed-URL mit optionalem Startzeitpunkt (Sekunden).
 * @param {string} url
 * @param {string|number|null|undefined} timecode
 * @param {{ autoplay?: boolean }} [options]
 */
export function getYouTubeEmbedUrl(url, timecode, { autoplay = false } = {}) {
  if (!url) return null;

  let embedUrl = url;
  if (!url.includes('youtube.com/embed/')) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    embedUrl =
      match && match[2].length === 11
        ? `https://www.youtube.com/embed/${match[2]}`
        : url;
  }

  const params = new URLSearchParams();
  const seconds = parseTimecodeToSeconds(timecode);
  if (seconds != null && seconds > 0) params.set('start', String(seconds));
  if (autoplay) {
    params.set('autoplay', '1');
    params.set('rel', '0');
  }

  const query = params.toString();
  if (!query) return embedUrl;

  const sep = embedUrl.includes('?') ? '&' : '?';
  return `${embedUrl}${sep}${query}`;
}
