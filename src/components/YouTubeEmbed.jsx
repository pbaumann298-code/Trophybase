import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { useMediaConsent } from '../context/MediaConsentContext';
import { useLocale } from '../context/LocaleContext';
import {
  getYouTubeThumbnailUrls,
  getYouTubeVideoId,
  parseYouTubeEmbedStartSeconds,
} from '../utils/videoUrl';

export function YoutubePlayIcon({ className = 'youtube-play-icon' }) {
  return (
    <svg viewBox="0 0 68 48" className={className} aria-hidden="true">
      <path
        fill="#ff0000"
        d="M66.5 7.7c-.8-2.9-3.1-5.2-6-6C55.1.4 34 .4 34 .4S12.9.4 7.5 1.7c-2.9.8-5.2 3.1-6 6C0 13.1 0 24 0 24s0 10.9 1.5 16.3c.8 2.9 3.1 5.2 6 6C12.9 47.6 34 47.6 34 47.6s21.1 0 26.5-1.3c2.9-.8 5.2-3.1 6-6C68 34.9 68 24 68 24s0-10.9-1.5-16.3z"
      />
      <path fill="#fff" d="M45 24 27 14v20z" />
    </svg>
  );
}

export function YouTubeThumb({ url, videoId, alt = '', className = 'youtube-embed__thumb' }) {
  const id = videoId || getYouTubeVideoId(url);
  const urls = getYouTubeThumbnailUrls(id);
  const [level, setLevel] = useState(0);

  if (!id || urls.length === 0) return null;

  const src = urls[Math.min(level, urls.length - 1)];

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth < 200 && level < urls.length - 1) {
          setLevel((current) => current + 1);
        }
      }}
      onError={() => {
        setLevel((current) => Math.min(current + 1, urls.length - 1));
      }}
    />
  );
}

const YouTubeEmbed = forwardRef(function YouTubeEmbed({ src, title = 'YouTube-Video' }, ref) {
  const { youtube, allowYoutube } = useMediaConsent();
  const { t } = useLocale();
  const [loadedSrc, setLoadedSrc] = useState('');
  const iframeRef = useRef(null);
  const currentTimeRef = useRef(0);
  const lastSyncAtRef = useRef(0);
  const playerStateRef = useRef(-1);
  const playerId = useId();
  const videoId = getYouTubeVideoId(src);

  useEffect(() => {
    currentTimeRef.current = parseYouTubeEmbedStartSeconds(src);
    lastSyncAtRef.current = 0;
    playerStateRef.current = -1;
  }, [src]);

  useEffect(() => {
    if (!youtube || !src) return undefined;
    const handleMessage = (event) => {
      const win = iframeRef.current?.contentWindow;
      if (!win || event.source !== win) return;
      let payload = event.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== 'object') return;
      const info = payload.info;
      if (info && typeof info === 'object') {
        if (typeof info.currentTime === 'number' && Number.isFinite(info.currentTime)) {
          currentTimeRef.current = info.currentTime;
          lastSyncAtRef.current = Date.now();
        }
        if (typeof info.playerState === 'number') {
          playerStateRef.current = info.playerState;
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [youtube, src]);

  useImperativeHandle(
    ref,
    () => ({
      rewind(seconds = 15) {
        const step = Math.max(1, Number(seconds) || 15);
        const now = Date.now();
        let baseTime = currentTimeRef.current;
        if (baseTime === 0 && lastSyncAtRef.current === 0) {
          baseTime = parseYouTubeEmbedStartSeconds(src);
        } else if (playerStateRef.current === 1 && lastSyncAtRef.current > 0) {
          baseTime += Math.max(0, (now - lastSyncAtRef.current) / 1000);
        }
        const target = Math.max(0, baseTime - step);
        currentTimeRef.current = target;
        lastSyncAtRef.current = now;
        const win = iframeRef.current?.contentWindow;
        if (win) {
          win.postMessage(
            JSON.stringify({
              event: 'command',
              func: 'seekTo',
              args: [Math.floor(target), true],
              id: playerId,
              channel: 'widget',
            }),
            '*',
          );
        }
        return target;
      },
    }),
    [playerId, src],
  );

  if (!src) return null;

  const iframeReady = youtube && loadedSrc === src;
  const showThumb = Boolean(videoId) && (!youtube || !iframeReady);

  const handleIframeLoad = () => {
    setLoadedSrc(src);
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      JSON.stringify({ event: 'listening', id: playerId, channel: 'widget' }),
      '*',
    );
    win.postMessage(
      JSON.stringify({
        event: 'command',
        func: 'addEventListener',
        args: ['onStateChange'],
        id: playerId,
        channel: 'widget',
      }),
      '*',
    );
  };

  return (
    <div className="youtube-embed">
      {showThumb ? <YouTubeThumb videoId={videoId} alt="" /> : null}

      {!youtube ? (
        <div className="youtube-consent-gate">
          <p>{t('consentYoutubeGate')}</p>
          <button type="button" onClick={allowYoutube}>
            <YoutubePlayIcon />
            {t('consentYoutubeLoad')}
          </button>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onLoad={handleIframeLoad}
        />
      )}
    </div>
  );
});

YouTubeEmbed.displayName = 'YouTubeEmbed';

export default YouTubeEmbed;
