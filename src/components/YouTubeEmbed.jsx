import React from 'react';
import { useMediaConsent } from '../context/MediaConsentContext';
import { useLocale } from '../context/LocaleContext';

function YouTubeEmbed({ src, title = 'YouTube-Video' }) {
  const { youtube, allowYoutube } = useMediaConsent();
  const { t } = useLocale();

  if (!src) return null;

  if (!youtube) {
    return (
      <div className="youtube-consent-gate">
        <p>{t('consentYoutubeGate')}</p>
        <button type="button" onClick={allowYoutube}>
          {t('consentYoutubeLoad')}
        </button>
      </div>
    );
  }

  return (
    <iframe
      src={src}
      title={title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}

export default YouTubeEmbed;
