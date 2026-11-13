import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useLocale } from '../context/LocaleContext';
import CreatorShowcaseGrid from '../components/creator/CreatorShowcaseGrid';
import { creatorPublicPath, parseCreatorPath } from '../lib/creatorPage';
import { isSafeYoutubeChannelUrl } from '../lib/contentCreators';
import {
  claimCreatorProfile,
  fetchCreatorBySlug,
  fetchCreatorGames,
  signatureTagsToList,
} from '../lib/creatorQueries';
import { writeAppPath } from '../lib/routeUtils';
import { localizeJsonField } from '../lib/translationUtils';

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
      invite: 'Einladung zu diesem Creator-Profil',
      inviteBody: 'Melde dich an und verknüpfe den Kanal mit deinem TrophyBase-Account.',
      google: 'Mit Google anmelden',
      discord: 'Mit Discord anmelden',
      claim: 'Kanal jetzt mit meinem Account verknüpfen',
      claiming: 'Verknüpfe…',
      claimed: 'Dein verknüpftes Creator-Profil',
      preview: 'Auch unveröffentlichte Guides anzeigen',
      inactive: 'Dieses Profil ist nicht öffentlich.',
    };
  }
  return {
    games: 'Games',
    languages: 'Language versions',
    youtube: 'YouTube channel',
    missing: 'This creator is not available.',
    loading: 'Loading creator…',
    gamesLoading: 'Loading games…',
    invite: 'Invitation to this creator profile',
    inviteBody: 'Sign in and link the channel to your TrophyBase account.',
    google: 'Continue with Google',
    discord: 'Continue with Discord',
    claim: 'Link this channel to my account',
    claiming: 'Linking…',
    claimed: 'Your linked creator profile',
    preview: 'Also show unpublished guides',
    inactive: 'This profile is not public.',
  };
}

function CreatorProfilePage({
  sessionUser = null,
  isAdmin = false,
  authLoading = false,
  onOpenGame,
  onBack,
}) {
  const { globalLocale } = useLocale();
  const copy = copyFor(globalLocale);
  const parsed = parseCreatorPath(window.location.pathname);
  const slug = parsed?.slug || '';
  const claimToken = new URLSearchParams(window.location.search).get('claim')?.trim() || '';
  const [pathTick, setPathTick] = useState(0);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [claimState, setClaimState] = useState('');
  const [claimError, setClaimError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [profile, setProfile] = useState({ slug, creator: null, status: slug ? 'loading' : 'missing' });
  const [gameState, setGameState] = useState({
    key: '',
    games: [],
    stats: { gameCount: 0, languageVersions: 0 },
    loading: false,
  });
  const creator = profile.creator;
  const isOwner = Boolean(sessionUser?.id && creator?.user_id && sessionUser.id === creator.user_id);
  const canPreview = isOwner || isAdmin;
  const hidden = Boolean(creator && profile.slug === slug && creator.is_active === false && !isOwner && !isAdmin);
  const waitingForAuth = Boolean(creator && creator.is_active === false && authLoading && !isAdmin);
  const scope = canPreview && includeDrafts ? 'all' : 'locale';
  const gameKey = !creator || profile.slug !== slug || hidden || waitingForAuth
    ? ''
    : `${creator.id}:${globalLocale}:${scope}`;

  useEffect(() => {
    const onPop = () => setPathTick((value) => value + 1);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const name = creator?.channel_name?.trim();
    const previous = document.title;
    document.title = name ? `${name} · TrophyBase` : 'Creator · TrophyBase';
    return () => {
      document.title = previous;
    };
  }, [creator?.channel_name]);

  useEffect(() => {
    if (!slug) return undefined;
    let cancelled = false;
    fetchCreatorBySlug(supabase, slug).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) setProfile({ slug, creator: null, status: 'missing' });
      else setProfile({ slug, creator: data, status: 'ready' });
    });
    return () => {
      cancelled = true;
    };
  }, [slug, pathTick]);

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

  const signIn = async (provider) => {
    setLoginError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.href },
    });
    if (error) setLoginError(error.message || 'Anmeldung fehlgeschlagen.');
  };

  const claim = async () => {
    setClaimState('busy');
    setClaimError('');
    const { error } = await claimCreatorProfile(supabase, claimToken);
    if (error) {
      setClaimState('');
      setClaimError(error.message || 'Verknüpfung fehlgeschlagen.');
      return;
    }
    setProfile((prev) => ({
      ...prev,
      creator: prev.creator
        ? { ...prev.creator, user_id: sessionUser?.id ?? prev.creator.user_id }
        : prev.creator,
    }));
    setClaimState('done');
    const params = new URLSearchParams(window.location.search);
    params.delete('claim');
    const qs = params.toString();
    const path = creatorPublicPath(globalLocale, slug);
    writeAppPath(qs ? `${path}?${qs}` : path, { replace: true });
  };

  const profileStatus = profile.slug === slug ? profile.status : (slug ? 'loading' : 'missing');
  if (profileStatus === 'loading' || waitingForAuth) {
    return <p className="px-4 py-16 text-center text-sm text-zinc-500">{copy.loading}</p>;
  }

  if (profileStatus === 'missing' || hidden || !creator) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <button type="button" onClick={onBack} className="mb-6 text-xs font-mono text-zinc-500 hover:text-[#00ff66]">
          ← TrophyBase
        </button>
        <p className="text-sm text-zinc-400">{hidden ? copy.inactive : copy.missing}</p>
      </div>
    );
  }

  const avatar = safeHttps(creator.avatar_url);
  const youtube = isSafeYoutubeChannelUrl(creator.youtube_url) ? creator.youtube_url : '';
  const bio = localizeJsonField(creator.bio, globalLocale);
  const tags = signatureTagsToList(creator.signature_tags);
  const showInvite = Boolean(claimToken) && !isOwner;

  return (
    <article className="mx-auto w-full max-w-7xl min-w-0 px-4 sm:px-6 py-8">
      <button type="button" onClick={onBack} className="mb-6 text-xs font-mono text-zinc-500 hover:text-[#00ff66]">
        ← TrophyBase
      </button>

      {showInvite ? (
        <section className="mb-6 rounded-2xl border border-[#00ff66]/30 bg-[#00ff66]/10 p-4 sm:p-5">
          <h2 className="text-sm font-bold text-white">{copy.invite}</h2>
          <p className="mt-1 text-sm text-zinc-300">{copy.inviteBody}</p>
          {sessionUser ? (
            <button
              type="button"
              onClick={claim}
              disabled={claimState === 'busy'}
              className="mt-4 rounded-xl bg-[#00ff66] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#121314] disabled:opacity-50"
            >
              {claimState === 'busy' ? copy.claiming : copy.claim}
            </button>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => signIn('google')}
                className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-zinc-900"
              >
                {copy.google}
              </button>
              <button
                type="button"
                onClick={() => signIn('discord')}
                className="rounded-xl bg-[#5865F2] px-4 py-2.5 text-xs font-bold text-white"
              >
                {copy.discord}
              </button>
            </div>
          )}
          {loginError ? <p className="mt-3 text-xs text-red-300">{loginError}</p> : null}
          {claimError ? <p className="mt-3 text-xs text-red-300">{claimError}</p> : null}
        </section>
      ) : null}

      <header className="mb-8 flex flex-wrap items-center gap-4">
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
            {isOwner ? (
              <span className="rounded-full border border-[#00ff66]/40 bg-[#00ff66]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#00ff66]">
                {copy.claimed}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            <span className="font-semibold text-zinc-200">{gameState.stats.gameCount}</span>
            {' '}
            {copy.games}
            <span className="mx-2 text-zinc-600">·</span>
            <span className="font-semibold text-zinc-200">{gameState.stats.languageVersions}</span>
            {' '}
            {copy.languages}
          </p>
          {bio ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">{bio}</p> : null}
          {tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="home-tile-badge text-zinc-300 border-zinc-600/50">{tag}</span>
              ))}
            </div>
          ) : null}
        </div>
        {youtube ? (
          <a
            href={youtube}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-xl bg-[#ff0000] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white no-underline hover:bg-[#e00000]"
          >
            {copy.youtube}
          </a>
        ) : null}
      </header>

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
          locale={globalLocale}
          onOpenGame={onOpenGame}
          showDraftState={canPreview && includeDrafts}
        />
      )}
    </article>
  );
}

export default CreatorProfilePage;
