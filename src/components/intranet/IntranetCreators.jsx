import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import { LocaleProvider, useLocale } from '../../context/LocaleContext';
import CreatorShowcaseGrid from '../creator/CreatorShowcaseGrid';
import { setAdminReturnFlag } from '../../lib/adminAccess';
import { creatorPublicPath } from '../../lib/creatorPage';
import { slugify } from '../../lib/gameSlug';
import { isSafeYoutubeChannelUrl } from '../../lib/contentCreators';
import { intranetGameHref } from '../../lib/intranetQueries';
import { withGuideTabParam } from '../../lib/routeUtils';
import {
  blacklistCreator,
  createAdminCreator,
  fetchAdminCreators,
  fetchCreatorGames,
  isYoutubeChannelBlacklisted,
  parseSignatureTagsInput,
  rotateCreatorClaimToken,
  saveAdminCreator,
} from '../../lib/creatorQueries';

const FIELD_CLASS =
  'bg-[#121314] border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-hidden focus:border-[#00ff66]/40 w-full';

const STATUS_LABEL = {
  open: 'Offen',
  contacted: 'Kontaktiert',
  approved: 'Freigegeben',
  claimed: 'Verknüpft',
  opted_out: 'Abgelehnt',
};

const STATUS_CLASS = {
  open: 'bg-zinc-500/15 text-zinc-300 border-zinc-600/40',
  contacted: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  claimed: 'bg-[#00ff66]/15 text-[#00ff66] border-[#00ff66]/30',
  opted_out: 'bg-red-500/15 text-red-300 border-red-500/30',
};

function emptyForm() {
  return {
    id: null,
    channel_name: '',
    slug: '',
    youtube_url: '',
    avatar_url: '',
    signature_tags: '',
    is_active: true,
    auto_approve: false,
    outreach_status: 'open',
    contact_email: '',
    instagram_url: '',
    internal_notes: '',
    claim_token: '',
    claimed_at: null,
    is_contacted: false,
    contacted_at: '',
    is_blacklisted: false,
    blacklist_reason: '',
    user_id: null,
    game_count: null,
  };
}

function todayIsoDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formFromCreator(creator) {
  if (!creator) return emptyForm();
  return {
    ...emptyForm(),
    ...creator,
    signature_tags: (creator.signature_tags ?? []).join('\n'),
    youtube_url: creator.youtube_url || '',
    avatar_url: creator.avatar_url || '',
    contact_email: creator.contact_email || '',
    instagram_url: creator.instagram_url || '',
    internal_notes: creator.internal_notes || '',
    claim_token: creator.claim_token || '',
    contacted_at: String(creator.contacted_at ?? '').slice(0, 10),
    is_contacted: Boolean(creator.is_contacted),
    is_blacklisted: Boolean(creator.is_blacklisted),
    blacklist_reason: creator.blacklist_reason || '',
  };
}

function preferredCreator(creators) {
  return creators.find((creator) => (
    creator.slug === 'ratrophies'
    || creator.channel_name.trim().toLowerCase() === 'ratrophies'
  )) || creators[0] || null;
}

function safeHttps(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function validateForm(form) {
  if (!form.channel_name.trim()) return 'Kanalname fehlt.';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
    return 'Slug: nur Kleinbuchstaben, Ziffern und Bindestriche.';
  }
  if (!form.youtube_url.trim() || !isSafeYoutubeChannelUrl(form.youtube_url.trim())) {
    return 'YouTube-URL muss https://youtube.com, youtu.be oder m.youtube.com sein.';
  }
  if (form.avatar_url.trim() && !safeHttps(form.avatar_url)) {
    return 'Avatar-URL muss mit https:// beginnen.';
  }
  if (form.contact_email.trim() && !form.contact_email.includes('@')) {
    return 'Kontakt-E-Mail sieht unvollständig aus.';
  }
  if (form.instagram_url.trim() && !safeHttps(form.instagram_url)) {
    return 'Instagram-URL muss mit https:// beginnen.';
  }
  return '';
}

function StatusBadge({ status }) {
  const key = STATUS_LABEL[status] ? status : 'open';
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_CLASS[key]}`}>
      {STATUS_LABEL[key]}
    </span>
  );
}

function IntranetCreatorsBody() {
  const { globalLocale } = useLocale();
  const [creators, setCreators] = useState([]);
  const [gameCountsById, setGameCountsById] = useState({});
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [outreachWarning, setOutreachWarning] = useState('');
  const [notice, setNotice] = useState('');
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const [listFilter, setListFilter] = useState('all');
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState('');
  const [blacklistMode, setBlacklistMode] = useState('unlink');
  const [gamesReloadTick, setGamesReloadTick] = useState(0);

  const applyLoadedCreators = useCallback((rows, outreachError, selectId) => {
    setCreators(rows);
    setOutreachWarning(
      outreachError
        ? `Outreach-Daten nicht erreichbar (${outreachError.message || 'Lesefehler'}). Beim Speichern werden nur Stammdaten aktualisiert.`
        : '',
    );
    const next = (selectId && rows.find((creator) => creator.id === selectId)) || preferredCreator(rows);
    if (next) {
      setCreating(false);
      setSelectedId(next.id);
      setForm((prev) => formFromCreator({
        ...next,
        game_count: prev.id === next.id && typeof prev.game_count === 'number'
          ? prev.game_count
          : next.game_count,
      }));
      setSlugTouched(true);
    }
  }, []);

  const loadCreators = async (selectId) => {
    setError('');
    const { data, outreachError, error: loadError } = await fetchAdminCreators(supabase);
    if (loadError) {
      setCreators([]);
      setError(loadError.message || 'Creator konnten nicht geladen werden.');
      setLoading(false);
      return;
    }
    applyLoadedCreators(data ?? [], outreachError, selectId);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    fetchAdminCreators(supabase).then(({ data, outreachError, error: loadError }) => {
      if (cancelled) return;
      if (loadError) {
        setCreators([]);
        setError(loadError.message || 'Creator konnten nicht geladen werden.');
        setLoading(false);
        return;
      }
      applyLoadedCreators(data ?? [], outreachError, null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [applyLoadedCreators]);

  const gameKey = !form.id || creating
    ? ''
    : `${form.id}:${includeDrafts ? 'all' : 'live'}:${globalLocale}:${gamesReloadTick}`;
  const [gameState, setGameState] = useState({
    resolvedKey: '',
    games: [],
    error: '',
  });
  const gamesLoading = Boolean(gameKey) && gameState.resolvedKey !== gameKey;
  const visibleGames = gameState.resolvedKey === gameKey ? gameState.games : [];
  const gamesError = gameState.resolvedKey === gameKey ? gameState.error : '';

  useEffect(() => {
    if (!gameKey) return undefined;
    let cancelled = false;
    const creatorId = form.id;
    const scope = includeDrafts ? 'all' : 'live';
    fetchCreatorGames(supabase, creatorId, {
      locale: globalLocale,
      scope,
    }).then(({ data, stats, error: fetchError }) => {
      if (cancelled) return;
      // Fehler nur lokal im Spiele-Bereich — Creator-Liste/Formular bleiben intakt.
      setGameState({
        resolvedKey: gameKey,
        games: fetchError ? [] : (data ?? []),
        error: fetchError ? (fetchError.message || 'Spiele konnten nicht geladen werden.') : '',
      });
      if (!fetchError) {
        const linked = typeof stats?.linkedGameCount === 'number'
          ? stats.linkedGameCount
          : (data ?? []).length;
        setGameCountsById((prev) => (
          prev[creatorId] === linked ? prev : { ...prev, [creatorId]: linked }
        ));
        setCreators((prev) => prev.map((creator) => (
          creator.id === creatorId
            ? { ...creator, game_count: linked }
            : creator
        )));
        setForm((prev) => (
          prev.id === creatorId ? { ...prev, game_count: linked } : prev
        ));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [gameKey, form.id, includeDrafts, globalLocale]);

  useEffect(() => {
    if (!blacklistOpen || saving) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setBlacklistOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [blacklistOpen, saving]);

  const selectedCreator = useMemo(
    () => creators.find((creator) => creator.id === selectedId) || null,
    [creators, selectedId],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return creators.filter((creator) => {
      if (listFilter === 'blacklisted' && !creator.is_blacklisted) return false;
      if (listFilter === 'clear' && creator.is_blacklisted) return false;
      if (!needle) return true;
      return creator.channel_name.toLowerCase().includes(needle)
        || creator.slug.toLowerCase().includes(needle);
    });
  }, [creators, query, listFilter]);

  const toggleContacted = (event) => {
    const checked = event.target.checked;
    setForm((prev) => ({
      ...prev,
      is_contacted: checked,
      contacted_at: checked && !prev.contacted_at ? todayIsoDate() : prev.contacted_at,
      outreach_status: checked && prev.outreach_status === 'open' ? 'contacted' : prev.outreach_status,
    }));
    setNotice('');
  };

  const update = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'channel_name' && creating && !slugTouched) {
        next.slug = slugify(value);
      }
      return next;
    });
    setNotice('');
  };

  const selectCreator = (creator) => {
    const cachedCount = gameCountsById[creator.id] ?? creator.game_count;
    setCreating(false);
    setSelectedId(creator.id);
    setForm(formFromCreator({ ...creator, game_count: cachedCount }));
    setSlugTouched(true);
    setNotice('');
    setError('');
  };

  const startCreate = () => {
    setCreating(true);
    setForm(emptyForm());
    setSlugTouched(false);
    setNotice('');
    setError('');
  };

  const cancelCreate = () => {
    const fallback = selectedCreator || preferredCreator(creators);
    if (fallback) {
      selectCreator(fallback);
      return;
    }
    setCreating(false);
    setForm(emptyForm());
    setNotice('');
    setError('');
  };

  const syncClaimToken = (creatorId, token) => {
    setForm((prev) => (prev.id === creatorId ? { ...prev, claim_token: token } : prev));
    setCreators((prev) => prev.map((creator) => (
      creator.id === creatorId ? { ...creator, claim_token: token } : creator
    )));
  };

  const openIntranetGame = useCallback((entry, options) => {
    const base = intranetGameHref(entry);
    if (!base) return;
    const href = withGuideTabParam(base, options?.tab);
    setAdminReturnFlag(true);
    const opened = window.open(href, '_blank');
    if (!opened) {
      window.location.assign(href);
    }
  }, []);

  const save = async () => {
    const message = validateForm(form);
    if (message) {
      setError(message);
      return;
    }
    const blocked = await isYoutubeChannelBlacklisted(supabase, form.youtube_url);
    if (blocked.error) {
      setError(blocked.error.message || 'Blacklist-Prüfung fehlgeschlagen.');
      return;
    }
    if (blocked.blacklisted && blocked.id !== form.id) {
      setError(
        `Dieser YouTube-Kanal steht auf der Blacklist (${blocked.channelName}${blocked.reason ? `: ${blocked.reason}` : ''}).`,
      );
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      ...form,
      signature_tags: parseSignatureTagsInput(form.signature_tags),
    };
    const result = creating
      ? await createAdminCreator(supabase, payload)
      : await saveAdminCreator(supabase, form.id, payload, {
        skipOutreach: Boolean(outreachWarning),
      });
    setSaving(false);
    if (result.error) {
      const code = result.error.code;
      setError(code === '23505'
        ? 'Kanalname oder Slug ist schon vergeben.'
        : (result.error.message || 'Speichern fehlgeschlagen.'));
      return;
    }
    setNotice('Gespeichert.');
    await loadCreators(result.data?.id);
  };

  const rotateToken = async () => {
    if (!form.id) return;
    const targetId = form.id;
    setSaving(true);
    setError('');
    const { data, error: rotateError } = await rotateCreatorClaimToken(supabase, targetId);
    setSaving(false);
    if (rotateError) {
      setError(rotateError.message || 'Token konnte nicht erneuert werden.');
      return;
    }
    syncClaimToken(targetId, data?.claim_token || '');
    setNotice('Einladungs-Token erneuert. Der alte Link ist ungültig.');
  };

  const copyText = async (value, success) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(success);
      setError('');
    } catch {
      setError('Kopieren nicht möglich. Bitte den Link manuell markieren.');
    }
  };

  const publicUrl = () => {
    const slug = String(selectedCreator?.slug || form.slug || '').trim();
    if (!slug) return '';
    return `${window.location.origin}${creatorPublicPath(globalLocale, slug)}`;
  };

  const copyPublic = () => {
    const url = publicUrl();
    if (!url) {
      setError('Zuerst einen Slug speichern.');
      return;
    }
    copyText(url, 'Öffentliche Seite kopiert.');
  };

  const copyClaim = async () => {
    if (!form.id) {
      setError('Creator zuerst speichern.');
      return;
    }
    const base = publicUrl();
    if (!base) {
      setError('Zuerst einen Slug speichern.');
      return;
    }
    let token = form.claim_token;
    if (!token) {
      const targetId = form.id;
      setSaving(true);
      const rotated = await rotateCreatorClaimToken(supabase, targetId);
      setSaving(false);
      if (rotated.error || !rotated.data?.claim_token) {
        setError(rotated.error?.message || 'Einladungslink konnte nicht erzeugt werden.');
        return;
      }
      token = rotated.data.claim_token;
      syncClaimToken(targetId, token);
    }
    const url = `${base}?claim=${encodeURIComponent(token)}`;
    copyText(url, 'Einladungslink kopiert.');
  };

  const confirmBlacklist = async () => {
    if (!form.id) return;
    const targetId = form.id;
    const reason = blacklistReason.trim();
    if (!reason) {
      setError('Bitte einen Blacklist-Grund angeben.');
      return;
    }
    const destructive = blacklistMode === 'delete';
    const confirmed = window.confirm(
      destructive
        ? `„${form.channel_name}“ sperren, betroffene Spiele entsperren und alle seine Guide-Zeilen löschen? Der Creator-Datensatz bleibt erhalten.`
        : `„${form.channel_name}“ sperren und nur die Video-Verknüpfung lösen? Guide-Texte bleiben erhalten. Der Datensatz wird nicht gelöscht.`,
    );
    if (!confirmed) return;
    setSaving(true);
    setError('');
    const { error: blacklistError } = await blacklistCreator(supabase, targetId, {
      reason,
      mode: destructive ? 'delete' : 'unlink',
    });
    setSaving(false);
    if (blacklistError) {
      setError(blacklistError.message || 'Blacklist fehlgeschlagen.');
      return;
    }
    setBlacklistOpen(false);
    setBlacklistReason('');
    setGameCountsById((prev) => ({ ...prev, [targetId]: 0 }));
    setGamesReloadTick((tick) => tick + 1);
    setNotice(destructive
      ? 'Creator gesperrt. Zugeordnete Guide-Zeilen wurden gelöscht.'
      : 'Creator gesperrt. Video-Verknüpfung gelöst, Guide-Texte bleiben.');
    await loadCreators(targetId);
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Creator</h2>
        <p className="text-sm text-zinc-500 max-w-3xl leading-relaxed">
          Profile, Outreach und die Spiele, deren Guide-Videos über
          {' '}
          <span className="font-mono text-zinc-400">game_guide_creators</span>
          {' '}
          an diesem Kanal hängen.
        </p>
      </div>

      {error ? (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</p>
      ) : null}
      {outreachWarning ? (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">{outreachWarning}</p>
      ) : null}
      {notice ? (
        <p className="text-xs text-[#00ff66] bg-[#00ff66]/10 border border-[#00ff66]/25 rounded-lg px-3 py-2">{notice}</p>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)] gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-[#1a1b1c] p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              {loading ? 'Lade…' : `${creators.length} Creator`}
            </p>
            <button
              type="button"
              onClick={startCreate}
              className="rounded-lg bg-[#00ff66] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#121314]"
            >
              + Neuer Creator
            </button>
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name oder Slug"
            className={FIELD_CLASS}
          />
          <div className="flex flex-wrap gap-1">
            {[
              ['all', 'Alle'],
              ['clear', 'Ohne Blacklist'],
              ['blacklisted', 'Nur Blacklist'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setListFilter(value)}
                className={`rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  listFilter === value ? 'bg-red-500/15 text-red-300' : 'text-zinc-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-[28rem] overflow-y-auto space-y-1">
            {filtered.map((creator) => {
              const active = !creating && creator.id === selectedId;
              const shownCount = gameCountsById[creator.id] ?? creator.game_count;
              const hasCount = typeof shownCount === 'number';
              return (
                <button
                  key={creator.id}
                  type="button"
                  onClick={() => selectCreator(creator)}
                  className={`w-full rounded-xl border px-3 py-2 text-left ${
                    active
                      ? 'border-[#00ff66]/40 bg-[#00ff66]/10'
                      : 'border-transparent hover:bg-zinc-800/60'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-white">{creator.channel_name}</span>
                    <span className={`text-[10px] font-mono ${hasCount ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      {hasCount ? shownCount : '—'}
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge status={creator.outreach_status} />
                    {creator.is_blacklisted ? (
                      <span className="inline-flex rounded-full border border-red-500/50 bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
                        BLACKLIST
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
            {!loading && filtered.length === 0 ? (
              <p className="px-2 py-3 text-xs text-zinc-500">Kein Treffer.</p>
            ) : null}
          </div>
        </div>

        <form
          className="rounded-2xl border border-zinc-800 bg-[#1a1b1c] p-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white">
              {creating ? 'Neuer Creator' : (form.channel_name || 'Creator')}
            </h3>
            {!creating && form.id ? (
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge status={form.outreach_status} />
                {form.user_id ? (
                  <span className="inline-flex rounded-full border border-[#00ff66]/40 bg-[#00ff66]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#00ff66]">
                    Account verknüpft
                  </span>
                ) : null}
                {form.is_blacklisted ? (
                  <span className="inline-flex rounded-full border border-red-500/50 bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
                    BLACKLIST
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">channel_name</span>
              <input value={form.channel_name} onChange={update('channel_name')} className={FIELD_CLASS} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">slug</span>
              <input
                value={form.slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  update('slug')(event);
                }}
                className={FIELD_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">youtube_url</span>
              <input value={form.youtube_url} onChange={update('youtube_url')} className={FIELD_CLASS} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">avatar_url</span>
              <input value={form.avatar_url} onChange={update('avatar_url')} className={FIELD_CLASS} />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">signature_tags</span>
              <textarea
                value={form.signature_tags}
                onChange={update('signature_tags')}
                rows={3}
                placeholder="Ein Tag pro Zeile"
                className={FIELD_CLASS}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={form.is_active} onChange={update('is_active')} />
              is_active
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={form.auto_approve} onChange={update('auto_approve')} />
              auto_approve
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">outreach_status</span>
              <select value={form.outreach_status} onChange={update('outreach_status')} className={FIELD_CLASS}>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={Boolean(form.is_contacted)} onChange={toggleContacted} />
              Kontaktiert
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">contacted_at</span>
              <input
                type="date"
                value={form.contacted_at || ''}
                onChange={update('contacted_at')}
                className={FIELD_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">contact_email</span>
              <input value={form.contact_email} onChange={update('contact_email')} className={FIELD_CLASS} />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">instagram_url</span>
              <input value={form.instagram_url} onChange={update('instagram_url')} className={FIELD_CLASS} />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">internal_notes</span>
              <textarea
                value={form.internal_notes}
                onChange={update('internal_notes')}
                rows={3}
                className={FIELD_CLASS}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[#00ff66] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#121314] disabled:opacity-50"
            >
              {saving ? 'Speichert…' : 'Speichern'}
            </button>
            {creating ? (
              <button
                type="button"
                onClick={cancelCreate}
                disabled={saving}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:text-white disabled:opacity-50"
              >
                Abbrechen
              </button>
            ) : null}
            {!creating && publicUrl() ? (
              <a
                href={publicUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 no-underline hover:text-white"
              >
                Öffentliche Seite öffnen
              </a>
            ) : null}
            {!creating && form.id ? (
              <>
                <button
                  type="button"
                  onClick={copyPublic}
                  className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300"
                >
                  Seitenlink kopieren
                </button>
                <button
                  type="button"
                  onClick={copyClaim}
                  disabled={saving}
                  className="rounded-xl border border-[#00ff66]/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#00ff66] disabled:opacity-50"
                >
                  Einladungs-Link kopieren
                </button>
                <button
                  type="button"
                  onClick={rotateToken}
                  disabled={saving}
                  className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-400 disabled:opacity-50"
                >
                  Token rotieren
                </button>
                {!form.is_blacklisted ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBlacklistReason('');
                      setBlacklistMode('unlink');
                      setBlacklistOpen(true);
                    }}
                    disabled={saving}
                    className="rounded-xl border border-red-500/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-red-300 disabled:opacity-50"
                  >
                    Auf Blacklist setzen
                  </button>
                ) : null}
              </>
            ) : null}
            {form.is_blacklisted && form.blacklist_reason ? (
              <p className="text-xs text-red-300">Grund: {form.blacklist_reason}</p>
            ) : null}
          </div>
        </form>
      </div>

      {!creating && form.id ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-white">
              {includeDrafts ? 'Alle verknüpften Spiele' : 'Nur veröffentlichte Live-Guides'}
              {gamesLoading ? '' : ` · ${visibleGames.length}`}
            </h3>
            <div className="flex rounded-xl border border-zinc-800 p-1 text-[11px] font-bold uppercase tracking-wider">
              <button
                type="button"
                onClick={() => setIncludeDrafts(true)}
                className={`rounded-lg px-3 py-1.5 ${includeDrafts ? 'bg-[#00ff66]/15 text-[#00ff66]' : 'text-zinc-500'}`}
              >
                Inkl. Entwürfe
              </button>
              <button
                type="button"
                onClick={() => setIncludeDrafts(false)}
                className={`rounded-lg px-3 py-1.5 ${!includeDrafts ? 'bg-[#00ff66]/15 text-[#00ff66]' : 'text-zinc-500'}`}
              >
                Nur Live-Guides
              </button>
            </div>
          </div>
          {gamesLoading ? (
            <p className="text-sm text-zinc-500">Spiele werden geladen…</p>
          ) : gamesError ? (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
              {gamesError}
            </p>
          ) : (
            <CreatorShowcaseGrid
              games={visibleGames}
              creatorId={form.id}
              locale={globalLocale}
              onOpenGame={openIntranetGame}
              showDraftState={includeDrafts}
            />
          )}
        </div>
      ) : null}

      {blacklistOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4"
          onClick={() => {
            if (!saving) setBlacklistOpen(false);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="creator-blacklist-title"
            className="w-full max-w-lg space-y-4 rounded-2xl border border-red-500/30 bg-[#121314] p-5"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              confirmBlacklist();
            }}
          >
            <h3 id="creator-blacklist-title" className="text-base font-bold text-white">
              {form.channel_name} auf die Blacklist setzen
            </h3>
            <p className="text-sm text-zinc-400">
              Der Datensatz in content_creators bleibt erhalten, damit die Kanal-URL weiter als gesperrt erkannt wird.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">blacklist_reason</span>
              <textarea
                value={blacklistReason}
                onChange={(event) => setBlacklistReason(event.target.value)}
                rows={3}
                required
                className={FIELD_CLASS}
              />
            </label>
            <fieldset className="space-y-2 text-sm text-zinc-300">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="blacklist-mode"
                  checked={blacklistMode === 'unlink'}
                  onChange={() => setBlacklistMode('unlink')}
                />
                <span>Nur Creator sperren und die Video-Verknüpfung lösen. Guide-Texte bleiben.</span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="blacklist-mode"
                  checked={blacklistMode === 'delete'}
                  onChange={() => setBlacklistMode('delete')}
                />
                <span>Sperren und alle zugeordneten Guide-Zeilen löschen. Betroffene Spiele werden vorher entsperrt.</span>
              </label>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-red-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
              >
                {saving ? 'Sperrt…' : 'Jetzt sperren'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setBlacklistOpen(false)}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300 disabled:opacity-50"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function IntranetCreators() {
  return (
    <LocaleProvider>
      <IntranetCreatorsBody />
    </LocaleProvider>
  );
}

export default IntranetCreators;
