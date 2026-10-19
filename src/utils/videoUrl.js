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
 * Startzeit aus YouTube-URLs (?t=90, ?t=1m30s, ?start=90, #t=30).
 * @param {string} url
 * @returns {number|null}
 */
export function extractYouTubeStartSeconds(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return null;

  let param = '';
  try {
    const parsed = new URL(raw);
    param = parsed.searchParams.get('t')
      || parsed.searchParams.get('start')
      || '';
    if (!param && parsed.hash) {
      const hashMatch = parsed.hash.match(/[?&]?t=([^&]+)/i);
      if (hashMatch) param = decodeURIComponent(hashMatch[1]);
    }
  } catch {
    const loose = raw.match(/[?&#](?:t|start)=([^&#]+)/i);
    if (loose) param = decodeURIComponent(loose[1]);
  }

  if (!param) return null;
  const cleaned = String(param).trim().replace(/s$/i, '');
  const hms = cleaned.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+))?$/i);
  if (hms && (hms[1] || hms[2] || /[hm]/i.test(cleaned))) {
    const hours = parseInt(hms[1] || '0', 10);
    const mins = parseInt(hms[2] || '0', 10);
    const secs = parseInt(hms[3] || '0', 10);
    return hours * 3600 + mins * 60 + secs;
  }
  return parseTimecodeToSeconds(cleaned);
}

/**
 * YouTube-Embed-URL mit optionalem Startzeitpunkt (Sekunden).
 * Fehlt `timecode`, wird `t`/`start` aus der Quell-URL übernommen.
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
  const seconds = parseTimecodeToSeconds(timecode) ?? extractYouTubeStartSeconds(url);
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

/**
 * Formatiert Sekunden als MM:SS oder HH:MM:SS.
 * @param {number} seconds
 * @returns {string}
 */
export function formatSecondsToTimecode(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  if (hh > 0) {
    return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

/**
 * YouTube-URL und Zeitstempel für game_achievements normalisieren.
 * `t`/`start` aus der URL wandern in timestamp; die gespeicherte URL bleibt ohne Startzeit.
 * @param {string} url
 * @param {string|number|null|undefined} timestamp
 * @returns {{ video_url: string, timestamp: string, error: Error|null }}
 */
export function normalizeTrophyVideoInput(url, timestamp) {
  const rawUrl = String(url ?? '').trim();
  let ts = String(timestamp ?? '').trim();
  if (!rawUrl) {
    return { video_url: '', timestamp: '', error: null };
  }

  const videoId = getYouTubeVideoId(rawUrl);
  if (!videoId) {
    return {
      video_url: rawUrl,
      timestamp: ts,
      error: new Error('Nur YouTube-URLs werden unterstützt.'),
    };
  }

  if (!ts) {
    const fromUrl = extractYouTubeStartSeconds(rawUrl);
    if (fromUrl != null && fromUrl > 0) ts = formatSecondsToTimecode(fromUrl);
  } else if (parseTimecodeToSeconds(ts) == null) {
    return {
      video_url: rawUrl,
      timestamp: ts,
      error: new Error('Zeitstempel als MM:SS oder HH:MM:SS angeben.'),
    };
  }

  return {
    video_url: `https://www.youtube.com/watch?v=${videoId}`,
    timestamp: ts,
    error: null,
  };
}
