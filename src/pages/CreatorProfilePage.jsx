import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useLocale } from '../context/LocaleContext';
import AccountDeleteCard from '../components/AccountDeleteCard';
import CreatorShowcaseGrid from '../components/creator/CreatorShowcaseGrid';
import CreatorWatchlistPanel from '../components/creator/CreatorWatchlistPanel';
import LoginMethodDropdown from '../components/LoginMethodDropdown';
import { creatorPublicPath, parseCreatorPath } from '../lib/creatorPage';
import { isSafeYoutubeChannelUrl } from '../lib/contentCreators';
import {
  fetchCreatorBySlug,
  fetchCreatorGames,
  prepareCreatorYoutubeClaim,
  prepareCreatorYoutubeOptOut,
  signatureTagsToList,
  updateMyCreatorProfile,
  updateMyCreatorShowcase,
  verifyCreatorYoutubeBio,
  verifyCreatorYoutubeOptOut,
} from '../lib/creatorQueries';
import { navigateToHome, writeAppPath } from '../lib/routeUtils';
import { applyPathCanonical } from '../lib/seoHead';
import { pickLocalized } from '../lib/translationUtils';
import { LOCALE_META, localeOptions } from '../lib/uiStrings';

const MAX_BIO_CHARS = 500;
const MAX_BIO_LINES = 8;
const CREATOR_BIO_LOCALES = localeOptions();

function normalizeCreatorBioInput(raw, { trimEdges = false } = {}) {
  let text = String(raw ?? '').replace(/\r\n?/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  const lines = text.split('\n');
  if (lines.length > MAX_BIO_LINES) {
    text = `${lines.slice(0, MAX_BIO_LINES).join('\n')}`;
  }
  if (trimEdges) {
    text = text.trim();
  }
  return text.slice(0, MAX_BIO_CHARS);
}

const SOCIAL_PLATFORMS = [
  { key: 'twitch', label: 'Twitch', placeholder: 'https://www.twitch.tv/...' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://www.instagram.com/...' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://www.tiktok.com/@...' },
  { key: 'discord', label: 'Discord', placeholder: 'https://discord.gg/...' },
  { key: 'x', label: 'X / Twitter', placeholder: 'https://x.com/...' },
  { key: 'website', label: 'Website', placeholder: 'https://...' },
];

function safeHttps(value) {
  try {
    const parsed = new URL(String(value ?? '').trim());
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]).join('');
  return (letters || '?').toUpperCase();
}

function copyFor(locale) {
  if (locale === 'de') {
    return {
      games: 'Spiele',
      languages: 'Sprachversionen',
      youtube: 'YouTube-Kanal',
      missing: 'Dieser Creator ist nicht verfügbar.',
      loading: 'Creator wird geladen…',
      gamesLoading: 'Spiele werden geladen…',
      invite: 'Creator-Seite übernehmen (YouTube-Verifizierung)',
      inviteBody:
        'Unten siehst du alle Spiele auf TrophyBase, die deine Videos nutzen. Übernimm dieses Profil kostenlos per kurzem Code in deiner YouTube-Kanalinfo.',
      selfClaimTrigger: 'Ist das dein YouTube-Kanal? Seite übernehmen',
      optOutTrigger: 'Kein Interesse / Opt-Out',
      optOutTitle: 'Kanal austragen (Opt-Out ohne Konto)',
      optOutBody:
        'Du möchtest nicht auf TrophyBase gelistet werden? Kein Konto nötig: Setze diesen Einmal-Code kurz für 10 Sekunden in deine YouTube-Kanalbeschreibung. So stellen wir sicher, dass niemand Fremdes deinen Kanal missbräuchlich austrägt.',
      optOutOfflineLabel:
        'Auch alle bereits verknüpften Guides & Video-Links meines Kanals sofort offline nehmen und Kanal für künftige Importe sperren',
      optOutVerifyBtn: '🚫 YouTube-Bio prüfen & Opt-Out dauerhaft ausführen',
      optOutDoneMsg:
        'Opt-Out bestätigt. Dein Kanal wurde gesperrt und verknüpfte Inhalte wurden gemäß deiner Auswahl entfernt.',
      backToClaim: '← Zurück zur Profil-Übernahme',
      google: 'Mit Google anmelden',
      discord: 'Mit Discord anmelden',
      twitch: 'Mit Twitch anmelden',
      emailToggle: 'Per E-Mail (Magic-Link) anmelden',
      emailSend: 'Anmelde-Link senden',
      emailSent: 'Anmelde-Link wurde gesendet! Bitte prüfe dein Postfach.',
      stepBioTitle: 'Schritt 2: Code kurz in deine YouTube-Kanalbeschreibung setzen',
      stepBioHint:
        'Füge diesen Code an beliebiger Stelle in deine YouTube-Kanalbeschreibung ein und klicke auf „Jetzt prüfen“. Direkt danach kannst du den Code wieder aus deiner Bio löschen.',
      copyCode: 'Kopieren',
      copied: 'Kopiert!',
      newCode: 'Neuer Code',
      openChannel: 'Meinen YouTube-Kanal öffnen ↗',
      verifyBtn: '✅ YouTube-Bio jetzt prüfen & Seite übernehmen',
      verifying: 'Prüfe YouTube-Kanalbeschreibung…',
      verifiedFlash: 'Kanal erfolgreich verifiziert! Das Profil gehört jetzt dir.',
      claimed: 'Verifiziertes Creator-Profil',
      preview: 'Auch unveröffentlichte Guides anzeigen',
      inactive: 'Dieses Profil ist nicht öffentlich.',
      manageToggle: '⚙️ Profil, Social-Links & Google-Indexierung anpassen (optional)',
      bioLabel: 'Kurzbeschreibung (einfach in deiner Sprache schreiben – Zeilenumbrüche erlaubt)',
      bioLangLabel: 'Sprache / Flagge',
      bioPlaceholder: 'Kurze Vorstellung deines Kanals (max. 500 Zeichen, Enter für Absätze)…',
      avatarLabel: 'Avatar-Bild-URL (https://, optional)',
      youtubeLabel: 'YouTube-Kanal-URL',
      indexLabel: 'Meine Creator-Seite öffentlich für Suchmaschinen (Google & Co.) freigeben',
      indexHint:
        'Standardmäßig ist diese Seite auf „noindex“ gesetzt. Erst mit deiner aktiven Freigabe wird sie bei Google auffindbar.',
      saveBtn: 'Änderungen speichern',
      savingBtn: 'Speichere…',
      savedMsg: 'Profil gespeichert.',
    };
  }
  return {
    games: 'Games',
    languages: 'Language versions',
    youtube: 'YouTube channel',
    missing: 'This creator is not available.',
    loading: 'Loading creator…',
    gamesLoading: 'Loading games…',
    invite: 'Claim this creator page (YouTube verification)',
    inviteBody:
      'Below are all games on TrophyBase featuring your videos. Claim this profile by placing a short verification code in your YouTube channel description.',
    selfClaimTrigger: 'Is this your YouTube channel? Claim page',
    optOutTrigger: 'Not interested / Opt out',
    optOutTitle: 'Remove channel (Opt-Out without account)',
    optOutBody:
      'Prefer not to be listed on TrophyBase? No account required: temporarily place this one-time code in your YouTube channel description for 10 seconds so nobody else can abuse opt-out on your behalf.',
    optOutOfflineLabel:
      'Also take all currently linked guides & video links offline immediately and block future imports',
    optOutVerifyBtn: '🚫 Verify YouTube bio & permanently opt out',
    optOutDoneMsg:
      'Opt-out confirmed. Your channel has been blocked and linked content updated according to your selection.',
    backToClaim: '← Back to profile claim',
    google: 'Continue with Google',
    discord: 'Continue with Discord',
    twitch: 'Continue with Twitch',
    emailToggle: 'Sign in via Email (Magic Link)',
    emailSend: 'Send sign-in link',
    emailSent: 'Sign-in link sent! Please check your inbox.',
    stepBioTitle: 'Step 2: Temporarily add this code to your YouTube channel description',
    stepBioHint:
      'Paste this code anywhere in your YouTube channel description and click “Verify now”. You can remove it right after verification.',
    copyCode: 'Copy',
    copied: 'Copied!',
    newCode: 'New code',
    openChannel: 'Open my YouTube channel ↗',
    verifyBtn: '✅ Verify YouTube bio & claim profile',
    verifying: 'Checking YouTube channel description…',
    verifiedFlash: 'Channel verified! This creator profile is now linked to your account.',
    claimed: 'Verified creator profile',
    preview: 'Also show unpublished guides',
    inactive: 'This profile is not public.',
    manageToggle: '⚙️ Customize profile, social links & Google indexing (optional)',
    bioLabel: 'Short bio (write in your own language – line breaks supported)',
    bioLangLabel: 'Language / Flag',
    bioPlaceholder: 'Briefly introduce your channel (max 500 characters, press Enter for line breaks)…',
    avatarLabel: 'Avatar image URL (https://, optional)',
    youtubeLabel: 'YouTube channel URL',
    indexLabel: 'Allow search engines (Google, etc.) to index my creator page',
    indexHint:
      'By default this page is set to “noindex”. It only becomes searchable on Google once you actively opt in.',
    saveBtn: 'Save changes',
    savingBtn: 'Saving…',
    savedMsg: 'Profile saved.',
  };
}

function buildEditDraft(creator, fallbackLocale = 'de') {
  const picked = pickLocalized(creator?.bio, fallbackLocale);
  const resolvedLang = LOCALE_META[picked.locale]
    ? picked.locale
    : LOCALE_META[fallbackLocale]
      ? fallbackLocale
      : 'de';
  const socialsObj =
    creator?.social_links && typeof creator.social_links === 'object'
      ? creator.social_links
      : {};
  return {
    bioText: normalizeCreatorBioInput(picked.text),
    bioLang: resolvedLang,
    avatarUrl: String(creator?.avatar_url ?? ''),
    youtube: String(socialsObj.youtube || creator?.youtube_url || ''),
    twitch: String(socialsObj.twitch ?? ''),
    instagram: String(socialsObj.instagram ?? ''),
    tiktok: String(socialsObj.tiktok ?? ''),
    discord: String(socialsObj.discord ?? ''),
    x: String(socialsObj.x ?? ''),
    website: String(socialsObj.website ?? ''),
    isPublicIndexed: Boolean(creator?.is_public_indexed),
  };
}

function CreatorProfilePage({
  sessionUser = null,
  isAdmin = false,
  authLoading = false,
  onOpenGame,
  onBack,
  onOpenInProfile,
  embeddedSlug = '',
  embeddedInProfile = false,
}) {
  const { globalLocale } = useLocale();
  const copy = copyFor(globalLocale);
  const parsed = embeddedInProfile ? null : parseCreatorPath(window.location.pathname);
  const slug = (embeddedInProfile ? embeddedSlug : parsed?.slug || '').trim().toLowerCase();
  const urlClaimToken = embeddedInProfile
    ? ''
    : new URLSearchParams(window.location.search).get('claim')?.trim() || '';
  const claimStorageKey = slug ? `tb_creator_claim:${slug}` : '';
  const storedClaimToken = (() => {
    if (!claimStorageKey || typeof window === 'undefined') return '';
    try {
      return window.localStorage.getItem(claimStorageKey) || '';
    } catch {
      return '';
    }
  })();
  const claimToken = urlClaimToken || storedClaimToken;

  const [pathTick, setPathTick] = useState(0);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [manualClaimOpen, setManualClaimOpen] = useState(false);

  const [verificationCode, setVerificationCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifySuccess, setVerifySuccess] = useState('');
  const [claimError, setClaimError] = useState('');

  const [optOutOpen, setOptOutOpen] = useState(false);
  const [optOutCode, setOptOutCode] = useState('');
  const [optOutCodeLoading, setOptOutCodeLoading] = useState(false);
  const [optOutCopied, setOptOutCopied] = useState(false);
  const [optOutOffline, setOptOutOffline] = useState(true);
  const [optOutBusy, setOptOutBusy] = useState(false);
  const [optOutError, setOptOutError] = useState('');
  const [optOutDone, setOptOutDone] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);
  const [editForm, setEditForm] = useState(() => buildEditDraft(null));
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [showcaseSaving, setShowcaseSaving] = useState(false);
  const [showcaseNotice, setShowcaseNotice] = useState('');
  const [showcaseError, setShowcaseError] = useState('');

  const [profile, setProfile] = useState({
    slug,
    creator: null,
    status: slug ? 'loading' : 'missing',
  });
  const [gameState, setGameState] = useState({
    key: '',
    games: [],
    stats: { gameCount: 0, languageVersions: 0 },
    loading: false,
  });

  const creator = profile.creator;
  const isOwner = Boolean(sessionUser?.id && creator?.user_id && sessionUser.id === creator.user_id);
  const isUnclaimed = Boolean(creator && !creator.user_id);
  const canEdit = isOwner || isAdmin;
  const canPreview = isOwner || isAdmin;
  const hidden = Boolean(
    creator && profile.slug === slug && creator.is_active === false && !isOwner && !isAdmin,
  );
  const waitingForAuth = Boolean(creator && creator.is_active === false && authLoading && !isAdmin);
  const scope = canPreview && includeDrafts ? 'all' : 'locale';
  const gameKey =
    !creator || profile.slug !== slug || hidden || waitingForAuth
      ? ''
      : `${creator.id}:${globalLocale}:${scope}`;

  const showTakeoverPanel =
    isUnclaimed && (Boolean(claimToken) || manualClaimOpen || Boolean(sessionUser?.id && !isAdmin));

  useEffect(() => {
    if (!claimStorageKey || !urlClaimToken) return;
    try {
      window.localStorage.setItem(claimStorageKey, urlClaimToken);
    } catch {
      /* ignore storage errors */
    }
  }, [claimStorageKey, urlClaimToken]);

  useEffect(() => {
    if (embeddedInProfile) return undefined;
    const onPop = () => setPathTick((value) => value + 1);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [embeddedInProfile]);

  useEffect(() => {
    if (embeddedInProfile) return undefined;
    const name = creator?.channel_name?.trim();
    const previous = document.title;
    document.title = name ? `${name} · TrophyBase` : 'Creator · TrophyBase';
    return () => {
      document.title = previous;
    };
  }, [creator?.channel_name, embeddedInProfile]);

  // Rechtssicherer SEO-Schutz: Indexierung NUR nach aktivem Creator-Opt-In (`is_public_indexed === true`)!
  useEffect(() => {
    if (embeddedInProfile || !slug) return;
    const canonical = creatorPublicPath(globalLocale, slug);
    const shouldNoIndex = Boolean(claimToken) || !creator?.is_public_indexed;
    applyPathCanonical(canonical, { noIndex: shouldNoIndex });
  }, [embeddedInProfile, slug, globalLocale, claimToken, creator?.is_public_indexed]);

  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;
    fetchCreatorBySlug(supabase, slug).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        setProfile({ slug, creator: null, status: 'missing' });
      } else {
        setProfile({ slug, creator: data, status: 'ready' });
        setEditForm(buildEditDraft(data, globalLocale));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug, pathTick, globalLocale]);

  useEffect(() => {
    if (!gameKey || !creator?.id) return undefined;
    let cancelled = false;
    fetchCreatorGames(supabase, creator.id, {
      locale: globalLocale,
      scope,
    }).then(({ data, stats: nextStats }) => {
      if (cancelled) return;
      setGameState({
        key: gameKey,
        games: data ?? [],
        stats: nextStats || { gameCount: 0, languageVersions: 0 },
        loading: false,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [gameKey, creator?.id, globalLocale, scope]);

  const loadOrRefreshCode = useCallback(
    async (regenerate = false) => {
      if (!slug || !sessionUser?.id) return;
      setCodeLoading(true);
      setClaimError('');
      const { data, error } = await prepareCreatorYoutubeClaim(supabase, {
        slug,
        claimToken,
        regenerate,
      });
      setCodeLoading(false);
      if (error) {
        setClaimError(error.message || 'Prüfcode konnte nicht erzeugt werden.');
        return;
      }
      if (data?.code) {
        setVerificationCode(String(data.code));
      }
    },
    [slug, sessionUser?.id, claimToken],
  );

  useEffect(() => {
    if (!showTakeoverPanel || !sessionUser?.id || verificationCode || !slug) {
      return undefined;
    }
    let cancelled = false;
    prepareCreatorYoutubeClaim(supabase, {
      slug,
      claimToken,
      regenerate: false,
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setClaimError(error.message || 'Prüfcode konnte nicht erzeugt werden.');
        return;
      }
      if (data?.code) {
        setVerificationCode(String(data.code));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [showTakeoverPanel, sessionUser?.id, verificationCode, slug, claimToken]);

  if (profile.slug !== slug) {
    setProfile({ slug, creator: null, status: slug ? 'loading' : 'missing' });
  }
  if (gameState.key !== gameKey) {
    setGameState({
      key: gameKey,
      games: [],
      stats: { gameCount: 0, languageVersions: 0 },
      loading: Boolean(gameKey),
    });
  }

  const cleanRedirectUrl = `${window.location.origin}${window.location.pathname}`;

  const openOptOutFlow = async () => {
    setOptOutOpen(true);
    setOptOutError('');
    if (optOutCode || !slug) return;
    setOptOutCodeLoading(true);
    const { data, error } = await prepareCreatorYoutubeOptOut(supabase, { slug });
    setOptOutCodeLoading(false);
    if (error) {
      setOptOutError(error.message || 'Opt-Out-Code konnte nicht geladen werden.');
      return;
    }
    if (data?.code) {
      setOptOutCode(String(data.code));
    }
  };

  const handleCopyOptOutCode = async () => {
    if (!optOutCode) return;
    try {
      await navigator.clipboard.writeText(optOutCode);
      setOptOutCopied(true);
      window.setTimeout(() => setOptOutCopied(false), 1800);
    } catch {
      /* ignore clipboard error */
    }
  };

  const handleConfirmOptOut = async () => {
    if (!slug || optOutBusy) return;
    setOptOutBusy(true);
    setOptOutError('');
    const { data, error } = await verifyCreatorYoutubeOptOut(supabase, {
      slug,
      takeGuidesOffline: optOutOffline,
    });
    setOptOutBusy(false);

    if (error) {
      setOptOutError(error.message || 'Opt-Out fehlgeschlagen.');
      return;
    }
    if (!data?.opted_out) {
      setOptOutError(
        data?.message ||
          data?.error ||
          'Der Opt-Out-Code wurde noch nicht in deiner YouTube-Kanalbeschreibung gefunden.',
      );
      return;
    }

    if (claimStorageKey) {
      try {
        window.localStorage.removeItem(claimStorageKey);
      } catch {
        /* ignore storage error */
      }
    }
    setOptOutDone(true);
  };

  const handleCopyCode = async () => {
    if (!verificationCode) return;
    try {
      await navigator.clipboard.writeText(verificationCode);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      /* ignore clipboard error */
    }
  };

  const handleVerifyYoutube = async () => {
    setVerifyBusy(true);
    setClaimError('');
    setVerifySuccess('');
    const { data, error } = await verifyCreatorYoutubeBio(supabase, { slug });
    setVerifyBusy(false);

    if (error) {
      setClaimError(error.message || 'Verifizierung fehlgeschlagen.');
      return;
    }
    if (!data?.verified) {
      setClaimError(
        data?.message ||
          data?.error ||
          'Der Prüfcode wurde noch nicht in deiner YouTube-Kanalbeschreibung gefunden.',
      );
      return;
    }

    setProfile((prev) => {
      if (!prev.creator) return prev;
      const updated = {
        ...prev.creator,
        user_id: sessionUser?.id ?? prev.creator.user_id,
        verified_at: new Date().toISOString(),
        avatar_url: data.avatar_url || prev.creator.avatar_url,
        youtube_url: data.youtube_url || prev.creator.youtube_url,
      };
      setEditForm(buildEditDraft(updated, globalLocale));
      return { ...prev, creator: updated };
    });

    setVerifySuccess(copy.verifiedFlash);
    setEditorOpen(true);

    if (claimStorageKey) {
      try {
        window.localStorage.removeItem(claimStorageKey);
      } catch {
        /* ignore storage errors */
      }
    }
    if (urlClaimToken) {
      const params = new URLSearchParams(window.location.search);
      params.delete('claim');
      const qs = params.toString();
      const path = creatorPublicPath(globalLocale, slug);
      writeAppPath(qs ? `${path}?${qs}` : path, { replace: true });
    }
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setSaveBusy(true);
    setSaveError('');
    setSaveSuccess('');

    const cleanBio = normalizeCreatorBioInput(editForm.bioText, { trimEdges: true });
    const bioLangKey = LOCALE_META[editForm.bioLang] ? editForm.bioLang : 'de';
    const bioPayload = cleanBio ? { [bioLangKey]: cleanBio } : {};

    const socialsPayload = {};
    if (editForm.youtube.trim()) socialsPayload.youtube = editForm.youtube.trim();
    for (const item of SOCIAL_PLATFORMS) {
      const val = String(editForm[item.key] ?? '').trim();
      if (val) socialsPayload[item.key] = val;
    }

    const { data, error } = await updateMyCreatorProfile(supabase, {
      slug,
      bio: bioPayload,
      avatarUrl: editForm.avatarUrl.trim() || null,
      socialLinks: socialsPayload,
      isPublicIndexed: editForm.isPublicIndexed,
    });

    setSaveBusy(false);
    if (error) {
      setSaveError(error.message || 'Speichern fehlgeschlagen.');
      return;
    }

    if (data && typeof data === 'object') {
      setProfile((prev) => ({
        ...prev,
        creator: { ...prev.creator, ...data },
      }));
      setEditForm(buildEditDraft(data, globalLocale));
    }
    setSaveSuccess(copy.savedMsg);
  };

  const handleSaveShowcase = async (nextConfig) => {
    if (!slug || showcaseSaving) return;
    setShowcaseSaving(true);
    setShowcaseError('');
    setShowcaseNotice('');
    const { data, error } = await updateMyCreatorShowcase(supabase, {
      slug,
      showcaseConfig: nextConfig,
    });
    setShowcaseSaving(false);
    if (error) {
      setShowcaseError(error.message || 'Layout konnte nicht gespeichert werden.');
      return;
    }
    if (data && typeof data === 'object') {
      setProfile((prev) => ({
        ...prev,
        creator: { ...prev.creator, ...data },
      }));
    } else {
      setProfile((prev) => ({
        ...prev,
        creator: prev.creator ? { ...prev.creator, showcase_config: nextConfig } : prev.creator,
      }));
    }
    setShowcaseNotice(
      globalLocale === 'de'
        ? '✓ Seiten-Layout für alle Besucher gespeichert.'
        : '✓ Public layout saved for all visitors.',
    );
  };

  const profileStatus = profile.slug === slug ? profile.status : slug ? 'loading' : 'missing';
  if (profileStatus === 'loading' || waitingForAuth) {
    return <p className="px-4 py-16 text-center text-sm text-zinc-500">{copy.loading}</p>;
  }

  if (optOutDone) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <div className="rounded-2xl border border-zinc-800 bg-[#141517] p-6 space-y-4">
          <p className="text-sm font-medium text-[#00ff66] leading-relaxed">{copy.optOutDoneMsg}</p>
          <button
            type="button"
            onClick={() => navigateToHome(globalLocale)}
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-mono text-zinc-200 hover:border-[#00ff66]/40 hover:text-[#00ff66] cursor-pointer"
          >
            ← TrophyBase
          </button>
        </div>
      </div>
    );
  }

  if (profileStatus === 'missing' || hidden || !creator) {
    return (
      <div className={embeddedInProfile ? 'w-full py-8' : 'mx-auto w-full max-w-3xl px-4 py-16'}>
        {!embeddedInProfile ? (
          <button
            type="button"
            onClick={onBack}
            className="mb-6 text-xs font-mono text-zinc-500 hover:text-[#00ff66] cursor-pointer"
          >
            ← TrophyBase
          </button>
        ) : null}
        <p className="text-sm text-zinc-400">{hidden ? copy.inactive : copy.missing}</p>
      </div>
    );
  }

  const publicCardPath = creatorPublicPath(globalLocale, creator.slug || slug);
  const publicCardFullUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${publicCardPath}` : publicCardPath;

  const handleCopyPublicUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicCardFullUrl);
      setCopiedPublicUrl(true);
      window.setTimeout(() => setCopiedPublicUrl(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const avatar = safeHttps(creator.avatar_url);
  const youtube = isSafeYoutubeChannelUrl(creator.youtube_url) ? creator.youtube_url : '';
  const bioPicked = pickLocalized(creator.bio, globalLocale);
  const bioMeta = bioPicked.text ? LOCALE_META[bioPicked.locale] || null : null;
  const tags = signatureTagsToList(creator.signature_tags);
  const socialObj =
    creator.social_links && typeof creator.social_links === 'object' ? creator.social_links : {};
  const activeSocials = SOCIAL_PLATFORMS.map((p) => ({
    ...p,
    url: safeHttps(socialObj[p.key]),
  })).filter((p) => Boolean(p.url));

  return (
    <article
      className={
        embeddedInProfile
          ? 'w-full min-w-0 pt-2'
          : 'mx-auto w-full max-w-7xl min-w-0 px-4 sm:px-6 py-8'
      }
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        {embeddedInProfile ? (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={publicCardPath}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-zinc-700 bg-[#121314] px-3 py-1.5 text-xs font-mono text-zinc-200 hover:border-[#00ff66]/40 hover:text-[#00ff66] no-underline transition"
            >
              {globalLocale === 'de'
                ? '🌐 Öffentliche Creator-Seite öffnen ↗'
                : '🌐 Open public creator page ↗'}
            </a>
            <button
              type="button"
              onClick={handleCopyPublicUrl}
              className="rounded-xl border border-zinc-800 bg-[#121314] px-3 py-1.5 text-xs font-mono text-zinc-400 hover:border-zinc-600 hover:text-white cursor-pointer transition"
            >
              {copiedPublicUrl
                ? copy.copied
                : globalLocale === 'de'
                  ? '🔗 Link kopieren'
                  : '🔗 Copy link'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-mono text-zinc-500 hover:text-[#00ff66] cursor-pointer"
          >
            ← TrophyBase
          </button>
        )}

        {!embeddedInProfile && isOwner ? (
          <a
            href="/profile?tab=creator"
            onClick={(e) => {
              e.preventDefault();
              if (onOpenInProfile) {
                onOpenInProfile();
              } else {
                writeAppPath('/profile?tab=creator');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }
            }}
            className="rounded-xl border border-[#00ff66]/40 bg-[#00ff66]/10 px-3 py-1.5 text-xs font-mono font-bold text-[#00ff66] hover:bg-[#00ff66]/20 no-underline transition"
          >
            {globalLocale === 'de'
              ? '🏆 Im eigenen Profil öffnen →'
              : '🏆 Manage in my profile →'}
          </a>
        ) : null}

        {isUnclaimed && !showTakeoverPanel && !optOutOpen ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setManualClaimOpen(true)}
              className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-1.5 text-xs font-mono text-zinc-300 hover:border-[#00ff66]/40 hover:text-[#00ff66] cursor-pointer"
            >
              {copy.selfClaimTrigger}
            </button>
            <button
              type="button"
              onClick={openOptOutFlow}
              className="rounded-xl border border-zinc-800 bg-transparent px-2.5 py-1.5 text-[11px] font-mono text-zinc-500 hover:border-red-500/40 hover:text-red-300 cursor-pointer"
            >
              {copy.optOutTrigger}
            </button>
          </div>
        ) : null}
      </div>

      {verifySuccess ? (
        <div className="mb-6 rounded-2xl border border-[#00ff66]/40 bg-[#00ff66]/10 px-4 py-3 text-sm font-medium text-[#00ff66]">
          {verifySuccess}
        </div>
      ) : null}

      {isUnclaimed && optOutOpen ? (
        <section className="mb-6 rounded-2xl border border-red-500/35 bg-[#161213] p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-red-200">{copy.optOutTitle}</h2>
            <button
              type="button"
              onClick={() => setOptOutOpen(false)}
              className="text-xs font-mono text-zinc-400 hover:text-white cursor-pointer"
            >
              {copy.backToClaim}
            </button>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed">{copy.optOutBody}</p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-2 font-mono text-base font-extrabold tracking-widest text-red-200">
              {optOutCodeLoading ? '…' : optOutCode || 'TB-OPT-····'}
            </span>
            <button
              type="button"
              onClick={handleCopyOptOutCode}
              disabled={!optOutCode}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-mono text-zinc-200 hover:border-red-400/50 cursor-pointer disabled:opacity-50"
            >
              {optOutCopied ? copy.copied : `📋 ${copy.copyCode}`}
            </button>
            {youtube ? (
              <a
                href={youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 no-underline hover:bg-red-500/20"
              >
                {copy.openChannel}
              </a>
            ) : null}
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-[#0d0e10] p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={optOutOffline}
              onChange={(e) => setOptOutOffline(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-zinc-300 leading-snug">{copy.optOutOfflineLabel}</span>
          </label>

          <div>
            <button
              type="button"
              onClick={handleConfirmOptOut}
              disabled={optOutBusy || !optOutCode}
              className="rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50 cursor-pointer"
            >
              {optOutBusy ? copy.verifying : copy.optOutVerifyBtn}
            </button>
          </div>

          {optOutError ? <p className="text-xs text-red-300">{optOutError}</p> : null}
        </section>
      ) : showTakeoverPanel ? (
        <section className="mb-6 rounded-2xl border border-[#00ff66]/35 bg-[#121614] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-white">{copy.invite}</h2>
              <p className="mt-1 text-sm text-zinc-300 leading-relaxed">{copy.inviteBody}</p>
            </div>
            <button
              type="button"
              onClick={openOptOutFlow}
              className="shrink-0 rounded-lg border border-zinc-800 bg-[#0d0f0e] px-2.5 py-1.5 text-[11px] font-mono text-zinc-400 hover:border-red-500/40 hover:text-red-300 cursor-pointer"
            >
              {copy.optOutTrigger}
            </button>
          </div>

          {!sessionUser ? (
            <div className="mt-4">
              <LoginMethodDropdown
                locale={globalLocale}
                redirectTo={cleanRedirectUrl}
                compact
              />
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-[#0d0f0e] p-3.5 sm:p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-[#00ff66] font-mono">
                {copy.stepBioTitle}
              </p>
              <p className="text-xs text-zinc-300 leading-relaxed">{copy.stepBioHint}</p>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-xl border border-[#00ff66]/50 bg-[#00ff66]/10 px-4 py-2 font-mono text-base font-extrabold tracking-widest text-[#00ff66]">
                  {codeLoading ? '…' : verificationCode || 'TB-····'}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  disabled={!verificationCode}
                  className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-mono text-zinc-200 hover:border-[#00ff66]/40 cursor-pointer"
                >
                  {copiedCode ? copy.copied : `📋 ${copy.copyCode}`}
                </button>
                <button
                  type="button"
                  onClick={() => loadOrRefreshCode(true)}
                  disabled={codeLoading}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs font-mono text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  🔄 {copy.newCode}
                </button>
                {youtube ? (
                  <a
                    href={youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 no-underline hover:bg-red-500/20"
                  >
                    {copy.openChannel}
                  </a>
                ) : null}
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleVerifyYoutube}
                  disabled={verifyBusy || !verificationCode}
                  className="rounded-xl bg-[#00ff66] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#121314] disabled:opacity-50 cursor-pointer"
                >
                  {verifyBusy ? copy.verifying : copy.verifyBtn}
                </button>
              </div>
            </div>
          )}

          {claimError ? <p className="mt-3 text-xs text-red-300">{claimError}</p> : null}
        </section>
      ) : null}

      <header className="mb-6 flex flex-wrap items-center gap-4">
        {avatar ? (
          <img
            src={avatar}
            alt=""
            className="h-16 w-16 rounded-full border border-zinc-700 object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#00ff66]/40 bg-[#00ff66]/10 text-lg font-bold text-[#00ff66]">
            {initials(creator.channel_name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-white">{creator.channel_name}</h1>
            {creator.user_id ? (
              <span className="rounded-full border border-[#00ff66]/40 bg-[#00ff66]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#00ff66]">
                ✓ {copy.claimed}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            <span className="font-semibold text-zinc-200">{gameState.stats.gameCount}</span>{' '}
            {copy.games}
            <span className="mx-2 text-zinc-600">·</span>
            <span className="font-semibold text-zinc-200">{gameState.stats.languageVersions}</span>{' '}
            {copy.languages}
          </p>
          {bioPicked.text ? (
            <div className="mt-2.5 flex items-start gap-2 max-w-2xl">
              {bioMeta ? (
                <span
                  title={bioMeta.label}
                  className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-700/80 bg-zinc-900/90 px-1.5 py-0.5 text-[11px] font-mono text-zinc-300 select-none"
                >
                  <span>{bioMeta.flag}</span>
                  <span>{bioMeta.short}</span>
                </span>
              ) : null}
              <p className="whitespace-pre-line break-words text-sm leading-relaxed text-zinc-300">
                {bioPicked.text}
              </p>
            </div>
          ) : null}
          {tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="home-tile-badge text-zinc-300 border-zinc-600/50">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {youtube ? (
            <a
              href={youtube}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-xl bg-[#ff0000] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white no-underline hover:bg-[#e00000]"
            >
              {copy.youtube}
            </a>
          ) : null}
          {activeSocials.map((item) => (
            <a
              key={item.key}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 no-underline hover:border-[#00ff66]/40 hover:text-white"
            >
              {item.label} ↗
            </a>
          ))}
        </div>
      </header>

      {canEdit ? (
        <section className="mb-6 rounded-2xl border border-zinc-800 bg-[#121315] p-4">
          <button
            type="button"
            onClick={() => setEditorOpen((prev) => !prev)}
            className="flex w-full items-center justify-between text-left text-xs font-mono font-bold text-zinc-200 hover:text-[#00ff66] cursor-pointer"
          >
            <span>{copy.manageToggle}</span>
            <span className="text-zinc-500">{editorOpen ? '▲' : '▼'}</span>
          </button>

          {editorOpen ? (
            <form onSubmit={handleSaveProfile} className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-zinc-400">{copy.bioLabel}</span>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
                      <span className="sr-only">{copy.bioLangLabel}</span>
                      <select
                        value={editForm.bioLang}
                        onChange={(e) => setEditForm((f) => ({ ...f, bioLang: e.target.value }))}
                        aria-label={copy.bioLangLabel}
                        className="rounded-lg border border-zinc-700 bg-[#0c0d0f] px-2 py-1 text-xs font-mono text-zinc-200 focus:border-[#00ff66]/50 focus:outline-hidden cursor-pointer"
                      >
                        {CREATOR_BIO_LOCALES.map((opt) => (
                          <option key={opt.code} value={opt.code}>
                            {opt.flag} {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                      {editForm.bioText.length} / {MAX_BIO_CHARS}
                    </span>
                  </div>
                </div>
                <textarea
                  rows={4}
                  maxLength={MAX_BIO_CHARS}
                  value={editForm.bioText}
                  placeholder={copy.bioPlaceholder}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      bioText: normalizeCreatorBioInput(e.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-[#0c0d0f] px-3 py-2.5 text-xs leading-relaxed text-zinc-200 focus:border-[#00ff66]/40 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-mono text-zinc-400">{copy.youtubeLabel}</span>
                  <input
                    type="url"
                    value={editForm.youtube}
                    onChange={(e) => setEditForm((f) => ({ ...f, youtube: e.target.value }))}
                    placeholder="https://www.youtube.com/@..."
                    className="w-full rounded-xl border border-zinc-800 bg-[#0c0d0f] px-3 py-2 text-xs text-zinc-200 focus:border-[#00ff66]/40 focus:outline-hidden"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-mono text-zinc-400">{copy.avatarLabel}</span>
                  <input
                    type="url"
                    value={editForm.avatarUrl}
                    onChange={(e) => setEditForm((f) => ({ ...f, avatarUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-zinc-800 bg-[#0c0d0f] px-3 py-2 text-xs text-zinc-200 focus:border-[#00ff66]/40 focus:outline-hidden"
                  />
                </label>
                {SOCIAL_PLATFORMS.map((p) => (
                  <label key={p.key} className="block space-y-1">
                    <span className="text-[11px] font-mono text-zinc-400">{p.label} (optional)</span>
                    <input
                      type="url"
                      value={editForm[p.key]}
                      onChange={(e) => setEditForm((f) => ({ ...f, [p.key]: e.target.value }))}
                      placeholder={p.placeholder}
                      className="w-full rounded-xl border border-zinc-800 bg-[#0c0d0f] px-3 py-2 text-xs text-zinc-200 focus:border-[#00ff66]/40 focus:outline-hidden"
                    />
                  </label>
                ))}
              </div>

              <label className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-[#0c0d0f] p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.isPublicIndexed}
                  onChange={(e) => setEditForm((f) => ({ ...f, isPublicIndexed: e.target.checked }))}
                  className="mt-0.5"
                />
                <span className="space-y-0.5">
                  <span className="block text-xs font-semibold text-white">{copy.indexLabel}</span>
                  <span className="block text-[11px] text-zinc-400 leading-snug">
                    {copy.indexHint}
                  </span>
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saveBusy}
                  className="rounded-xl bg-[#00ff66] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#121314] disabled:opacity-50 cursor-pointer"
                >
                  {saveBusy ? copy.savingBtn : copy.saveBtn}
                </button>
                {saveSuccess ? <span className="text-xs text-[#00ff66]">{saveSuccess}</span> : null}
                {saveError ? <span className="text-xs text-red-300">{saveError}</span> : null}
              </div>

              {isOwner && !isAdmin && !embeddedInProfile ? (
                <div className="pt-3 border-t border-zinc-800/80">
                  <AccountDeleteCard
                    locale={globalLocale}
                    linkedCreators={[creator]}
                    onDeleted={() => navigateToHome(globalLocale)}
                  />
                </div>
              ) : null}
            </form>
          ) : null}
        </section>
      ) : null}

      {/* Gekaperter Creator-Bereich: Watchlist + schlanke "Spiele ohne Guide"-Suche */}
      {canEdit ? (
        <CreatorWatchlistPanel
          creatorId={creator.id}
          locale={globalLocale}
          onOpenGame={onOpenGame}
        />
      ) : null}

      {canPreview ? (
        <label className="mb-4 flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={includeDrafts}
            onChange={(event) => setIncludeDrafts(event.target.checked)}
          />
          {copy.preview}
        </label>
      ) : null}

      {gameState.loading ? (
        <p className="text-sm text-zinc-500">{copy.gamesLoading}</p>
      ) : (
        <CreatorShowcaseGrid
          games={gameState.games}
          creatorId={creator.id}
          creatorName={creator.channel_name}
          showcaseConfig={creator.showcase_config}
          canCustomize={canEdit}
          isOwnerView={Boolean(isOwner || embeddedInProfile)}
          savingShowcase={showcaseSaving}
          showcaseNotice={showcaseNotice}
          showcaseError={showcaseError}
          onSaveShowcase={handleSaveShowcase}
          locale={globalLocale}
          onOpenGame={onOpenGame}
          showDraftState={canPreview && includeDrafts}
        />
      )}
    </article>
  );
}

export default CreatorProfilePage;
