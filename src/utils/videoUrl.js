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
 * YouTube-Video-ID aus Watch-/Embed-/Shorts-/youtu.be-URLs.
 * @param {string} url
 * @returns {string|null}
 */
export function getYouTubeVideoId(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  const match = raw.match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|shorts\/|watch\?.*?v=))([a-zA-Z0-9_-]{11})/,
  );
  return match?.[1] ?? null;
}

/**
 * Vorschaubilder ohne Embed/Cookies (i.ytimg.com).
 * Erste URL ist die schärfste Variante; fehlende maxres-Bilder sind oft ein Mini-Platzhalter.
 * @param {string} videoId
 * @returns {string[]}
 */
export function getYouTubeThumbnailUrls(videoId) {
  const id = String(videoId ?? '').trim();
  if (!id) return [];
  return [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hq720.jpg`,
    `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  ];
}

/**
 * YouTube-Embed-URL mit optionalem Startzeitpunkt (Sekunden).
 * @param {string} url
 * @param {string|number|null|undefined} timecode
 * @param {{ autoplay?: boolean }} [options]
 */
export function getYouTubeEmbedUrl(url, timecode, { autoplay = false } = {}) {
  if (!url) return null;

  const videoId = getYouTubeVideoId(url);
  let embedUrl = videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}`
    : String(url).replace('youtube.com/embed/', 'youtube-nocookie.com/embed/');

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
