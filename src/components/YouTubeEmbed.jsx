import React, { useState } from 'react';
import { useMediaConsent } from '../context/MediaConsentContext';
import { useLocale } from '../context/LocaleContext';
import { getYouTubeThumbnailUrls, getYouTubeVideoId } from '../utils/videoUrl';

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

function YouTubeEmbed({ src, title = 'YouTube-Video' }) {
  const { youtube, allowYoutube } = useMediaConsent();
  const { t } = useLocale();
  const [iframeReady, setIframeReady] = useState(false);
  const videoId = getYouTubeVideoId(src);

  if (!src) return null;

  const showThumb = Boolean(videoId) && (!youtube || !iframeReady);

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
          src={src}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onLoad={() => setIframeReady(true)}
        />
      )}
    </div>
  );
}

export default YouTubeEmbed;
