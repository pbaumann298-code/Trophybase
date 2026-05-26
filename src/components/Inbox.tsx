import React, { useEffect, useState } from 'react';
import { supabase } from '../pages/supabaseClient';
import { getProp } from '../utils/recordHelpers';

function RewardCodeBox({ code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback ignored */
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-[#00ff66]/30 bg-gradient-to-r from-[#00ff66]/10 via-[#121314] to-[#121314] p-3 sm:p-4">
      <p className="text-[10px] font-mono uppercase tracking-wider text-[#00ff66] mb-2">
        Dein Gutschein-Code
      </p>
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <code className="flex-1 min-w-0 text-sm sm:text-base font-mono font-bold text-white tracking-widest break-all">
          {code}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="flex-shrink-0 text-xs font-bold uppercase tracking-wider bg-[#00ff66] hover:bg-[#00ee55] text-zinc-950 px-3 py-2 rounded-lg transition"
        >
          {copied ? 'Kopiert ✓' : 'Kopieren'}
        </button>
      </div>
    </div>
  );
}

function Inbox({ sessionUser, setCurrentView }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionUser?.id) {
      setMessages([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadInbox() {
      setLoading(true);
      setError(null);

      const { data, error: inboxError } = await supabase
        .from('user_inbox')
        .select('*')
        .eq('user_id', sessionUser.id)
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (inboxError) {
        setError(inboxError.message);
        setMessages([]);
      } else {
        setMessages(data || []);
      }
      setLoading(false);
    }

    loadInbox();
    return () => {
      cancelled = true;
    };
  }, [sessionUser?.id]);

  const isUnread = (msg) => {
    const read = msg.is_read ?? msg.isRead ?? msg.read;
    return read !== true && read !== 'true' && read !== 1;
  };

  const markAsRead = async (messageId) => {
    const { error: updateError } = await supabase
      .from('user_inbox')
      .update({ is_read: true })
      .eq('id', messageId)
      .eq('user_id', sessionUser.id);

    if (!updateError) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, is_read: true } : msg
        )
      );
    }
  };

  const unreadCount = messages.filter(isUnread).length;

  if (!sessionUser) {
    return (
      <div className="w-full max-w-2xl min-w-0 mx-auto px-4 sm:px-6 pt-8">
        <p className="text-sm text-zinc-500 text-center">
          Bitte melde dich an, um dein Postfach zu öffnen.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl min-w-0 overflow-x-hidden mx-auto px-4 sm:px-6 md:px-8 pt-8 pb-12 box-border">
      <button
        type="button"
        onClick={() => setCurrentView('home')}
        className="text-[#00ff66] mb-6 flex items-center gap-1 text-xs uppercase tracking-wider font-bold hover:underline bg-transparent border-none cursor-pointer p-0"
      >
        ← Zurück zum Dashboard
      </button>

      <header className="mb-6">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#00ff66] border border-[#00ff66]/20 bg-[#00ff66]/10 px-2 py-0.5 rounded">
          Postfach
        </span>
        <h1 className="mt-2 text-2xl font-extrabold text-white tracking-tight">Nachrichten</h1>
        {!loading && unreadCount > 0 && (
          <p className="text-xs text-zinc-500 mt-1 font-mono">
            {unreadCount} ungelesen
          </p>
        )}
      </header>

      {loading && (
        <p className="text-xs text-zinc-500 italic">Nachrichten werden geladen…</p>
      )}

      {!loading && error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-900/40 rounded-lg p-3">
          Postfach konnte nicht geladen werden: {error}
        </p>
      )}

      {!loading && !error && messages.length === 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-[#1a1b1c] p-8 text-center">
          <p className="text-sm text-zinc-500">Dein Postfach ist leer.</p>
        </div>
      )}

      {!loading && !error && messages.length > 0 && (
        <ul className="flex flex-col gap-3">
          {messages.map((msg) => {
            const unread = isUnread(msg);
            const title = getProp(msg, ['title', 'subject', 'betreff']) || 'Nachricht';
            const body = getProp(msg, ['body', 'message', 'content', 'text']);
            const rewardCode = getProp(msg, ['reward_code', 'rewardCode', 'code']);
            const createdAt = getProp(msg, ['created_at', 'createdAt']);

            return (
              <li key={msg.id}>
                <article
                  className={`rounded-2xl border p-4 sm:p-5 transition ${
                    unread
                      ? 'border-[#00ff66]/25 bg-[#1a1b1c] shadow-[0_0_20px_rgba(0,255,102,0.06)]'
                      : 'border-zinc-800 bg-[#1a1b1c]/80 opacity-90'
                  }`}
                >
                  <div className="flex gap-3 min-w-0">
                    <span
                      className={`mt-1.5 w-2.5 h-2.5 flex-shrink-0 rounded-full ${
                        unread
                          ? 'bg-[#00ff66] shadow-[0_0_8px_#00ff66]'
                          : 'bg-transparent'
                      }`}
                      aria-hidden={!unread}
                      title={unread ? 'Ungelesen' : undefined}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="text-sm font-bold text-zinc-100 break-words">
                          {title}
                        </h2>
                        {createdAt && (
                          <time
                            className="text-[10px] font-mono text-zinc-500 flex-shrink-0"
                            dateTime={createdAt}
                          >
                            {new Date(createdAt).toLocaleDateString('de-DE')}
                          </time>
                        )}
                      </div>

                      {body && (
                        <p className="text-sm text-zinc-400 mt-2 leading-relaxed break-words whitespace-pre-wrap">
                          {body}
                        </p>
                      )}

                      {rewardCode && <RewardCodeBox code={rewardCode} />}

                      {unread && (
                        <button
                          type="button"
                          onClick={() => markAsRead(msg.id)}
                          className="mt-3 text-[10px] font-mono uppercase tracking-wider text-zinc-500 hover:text-[#00ff66] transition bg-transparent border-none cursor-pointer p-0"
                        >
                          Als gelesen markieren
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default Inbox;
