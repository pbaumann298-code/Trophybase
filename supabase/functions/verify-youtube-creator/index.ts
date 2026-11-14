import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const YOUTUBE_CONSENT_COOKIE = "SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmRlIAEaBgiA_LyaBg";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

interface ParsedYoutubeTarget {
  handle: string | null;
  channelId: string | null;
  videoId: string | null;
  rawUrl: string;
}

function parseYoutubeTarget(rawUrl: string, existingChannelId: string | null): ParsedYoutubeTarget {
  const cleanId = existingChannelId?.trim() || null;
  const out: ParsedYoutubeTarget = {
    handle: null,
    channelId: cleanId && cleanId.startsWith("UC") ? cleanId : null,
    videoId: null,
    rawUrl: rawUrl.trim(),
  };

  if (!out.rawUrl) return out;

  try {
    const u = new URL(out.rawUrl);
    const host = u.hostname.toLowerCase();
    const path = u.pathname;

    if (host === "youtu.be") {
      const vid = path.split("/").filter(Boolean)[0];
      if (vid) out.videoId = vid;
      return out;
    }

    if (path === "/watch") {
      const v = u.searchParams.get("v");
      if (v) out.videoId = v;
      return out;
    }

    const handleMatch = path.match(/^\/(@[A-Za-z0-9._-]+)/);
    if (handleMatch) {
      out.handle = decodeURIComponent(handleMatch[1]);
      return out;
    }

    const chMatch = path.match(/^\/channel\/(UC[A-Za-z0-9_-]+)/);
    if (chMatch) {
      out.channelId = chMatch[1];
      return out;
    }
  } catch {
    /* ignore URL parse error */
  }
  return out;
}

interface ResolvedChannelMeta {
  description: string;
  channelId: string | null;
  avatarUrl: string | null;
  canonicalUrl: string | null;
  source: "youtube_api" | "youtube_html";
}

async function fetchViaYoutubeApi(
  target: ParsedYoutubeTarget,
  apiKey: string,
): Promise<ResolvedChannelMeta | null> {
  if (!apiKey) return null;

  let channelId = target.channelId;
  const handle = target.handle;

  try {
    if (!channelId && !handle && target.videoId) {
      const vRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(target.videoId)}&key=${encodeURIComponent(apiKey)}`,
      );
      if (vRes.ok) {
        const vJson = await vRes.json();
        channelId = vJson?.items?.[0]?.snippet?.channelId || null;
      }
    }

    let chUrl = "";
    if (channelId) {
      chUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`;
    } else if (handle) {
      chUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${encodeURIComponent(handle)}&key=${encodeURIComponent(apiKey)}`;
    } else {
      return null;
    }

    const chRes = await fetch(chUrl);
    if (!chRes.ok) return null;
    const chJson = await chRes.json();
    const item = chJson?.items?.[0];
    if (!item?.snippet) return null;

    const snippet = item.snippet;
    const thumbs = snippet.thumbnails || {};
    const avatarUrl = thumbs?.high?.url || thumbs?.medium?.url || thumbs?.default?.url || null;
    const customUrl = typeof snippet.customUrl === "string" && snippet.customUrl.trim()
      ? snippet.customUrl.trim()
      : null;
    const canonicalUrl = customUrl
      ? `https://www.youtube.com/${customUrl.startsWith("@") ? customUrl : `@${customUrl}`}`
      : (item.id ? `https://www.youtube.com/channel/${item.id}` : null);

    return {
      description: String(snippet.description ?? ""),
      channelId: item.id || channelId || null,
      avatarUrl,
      canonicalUrl,
      source: "youtube_api",
    };
  } catch {
    return null;
  }
}

async function fetchViaPublicChannelPage(
  target: ParsedYoutubeTarget,
): Promise<ResolvedChannelMeta | null> {
  try {
    let channelPageUrl = "";
    if (target.handle) {
      channelPageUrl = `https://www.youtube.com/${target.handle}`;
    } else if (target.channelId) {
      channelPageUrl = `https://www.youtube.com/channel/${target.channelId}`;
    } else if (target.videoId) {
      const watchRes = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(target.videoId)}`, {
        headers: {
          Cookie: YOUTUBE_CONSENT_COOKIE,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8",
        },
      });
      if (watchRes.ok) {
        const watchHtml = await watchRes.text();
        const ownerMatch = watchHtml.match(/"ownerProfileUrl":"(https:\/\/www\.youtube\.com\/@[^"]+)"/);
        const chIdMatch = watchHtml.match(/"channelId":"(UC[A-Za-z0-9_-]+)"/);
        if (ownerMatch) {
          channelPageUrl = ownerMatch[1];
        } else if (chIdMatch) {
          channelPageUrl = `https://www.youtube.com/channel/${chIdMatch[1]}`;
        }
      }
    } else if (target.rawUrl.startsWith("https://")) {
      channelPageUrl = target.rawUrl;
    }

    if (!channelPageUrl) return null;

    const sep = channelPageUrl.includes("?") ? "&" : "?";
    const res = await fetch(`${channelPageUrl}${sep}hl=de&cbrd=1`, {
      headers: {
        Cookie: YOUTUBE_CONSENT_COOKIE,
        "Cache-Control": "no-cache",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    let description = "";
    let channelId: string | null = target.channelId;
    let avatarUrl: string | null = null;
    let canonicalUrl: string | null = null;

    const metaBlockMatch = html.match(/"channelMetadataRenderer":(\{"title":.*?\}),"microformatDataRenderer"/);
    if (metaBlockMatch) {
      try {
        const meta = JSON.parse(metaBlockMatch[1]);
        if (typeof meta.description === "string") {
          description = meta.description;
        }
        if (typeof meta.externalId === "string" && meta.externalId.startsWith("UC")) {
          channelId = meta.externalId;
        }
        if (typeof meta.vanityChannelUrl === "string" && meta.vanityChannelUrl.startsWith("http")) {
          canonicalUrl = meta.vanityChannelUrl.replace(/^http:/, "https:");
        }
        const thumb = meta.avatar?.thumbnails?.[0]?.url;
        if (typeof thumb === "string" && thumb.startsWith("https://")) {
          avatarUrl = thumb;
        }
      } catch {
        /* fallback to regex below */
      }
    }

    if (!description) {
      const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i) ||
        html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
      if (ogDesc) {
        description = ogDesc[1]
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
      }
    }

    if (!avatarUrl) {
      const ogImg = html.match(/<meta\s+property="og:image"\s+content="(https:\/\/[^"]+)"/i);
      if (ogImg) avatarUrl = ogImg[1];
    }

    if (!channelId) {
      const extMatch = html.match(/"externalId":"(UC[A-Za-z0-9_-]+)"/);
      if (extMatch) channelId = extMatch[1];
    }

    if (!canonicalUrl) {
      const ogUrl = html.match(/<meta\s+property="og:url"\s+content="(https:\/\/www\.youtube\.com\/[^"]+)"/i);
      if (ogUrl) canonicalUrl = ogUrl[1];
    }

    return {
      description,
      channelId,
      avatarUrl,
      canonicalUrl,
      source: "youtube_html",
    };
  } catch {
    return null;
  }
}

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: anonKey,
    },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return typeof user?.id === "string" ? user.id : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const uid = await getAuthenticatedUserId(req);
  if (!uid) {
    return jsonResponse({ error: "Bitte melde dich zuerst an." }, 401);
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    return jsonResponse({ error: "Missing SUPABASE_DB_URL" }, 500);
  }

  const body = await req.json().catch(() => ({}));
  const slug = String(body?.slug ?? "").trim().toLowerCase();
  if (!slug) {
    return jsonResponse({ error: "Creator-Slug fehlt." }, 400);
  }

  const sql = postgres(dbUrl, { prepare: false, max: 1 });

  try {
    const rows = await sql<{
      id: string;
      channel_name: string;
      slug: string;
      youtube_url: string | null;
      youtube_channel_id: string | null;
      avatar_url: string | null;
      user_id: string | null;
      is_active: boolean;
      is_blacklisted: boolean;
      outreach_status: string | null;
      pending_claim_user_id: string | null;
      pending_verification_code: string | null;
      pending_code_created_at: string | null;
    }[]>`
      SELECT
        c.id,
        c.channel_name,
        c.slug,
        c.youtube_url,
        c.youtube_channel_id,
        c.avatar_url,
        c.user_id,
        coalesce(c.is_active, true) AS is_active,
        coalesce(c.is_blacklisted, false) AS is_blacklisted,
        o.outreach_status,
        o.pending_claim_user_id,
        o.pending_verification_code,
        o.pending_code_created_at
      FROM public.content_creators c
      LEFT JOIN public.creator_outreach_admin o ON o.creator_id = c.id
      WHERE c.slug = ${slug}
      LIMIT 1
    `;

    const creator = rows[0];
    if (!creator || !creator.is_active || creator.is_blacklisted || creator.outreach_status === "opted_out") {
      return jsonResponse({ error: "Creator-Profil nicht verfügbar." }, 404);
    }

    if (creator.user_id && creator.user_id !== uid) {
      return jsonResponse({ error: "Dieses Creator-Profil ist bereits verknüpft." }, 409);
    }

    const expectedCode = String(creator.pending_verification_code ?? "").trim().toUpperCase();
    if (!expectedCode || creator.pending_claim_user_id !== uid) {
      return jsonResponse({
        ok: false,
        verified: false,
        error: "Kein aktiver Prüfcode für dein Konto gefunden. Bitte lade die Seite kurz neu.",
      }, 400);
    }

    const secretRows = await sql<{ decrypted_secret: string }[]>`
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'tb_youtube_api_key'
      LIMIT 1
    `;
    const youtubeApiKey = secretRows[0]?.decrypted_secret || "";

    const target = parseYoutubeTarget(creator.youtube_url || "", creator.youtube_channel_id);

    let resolved = await fetchViaYoutubeApi(target, youtubeApiKey);
    let found = Boolean(resolved && resolved.description.toUpperCase().includes(expectedCode));

    if (!found) {
      const htmlResolved = await fetchViaPublicChannelPage(target);
      if (htmlResolved) {
        resolved = htmlResolved;
        found = htmlResolved.description.toUpperCase().includes(expectedCode);
      }
    }

    if (!resolved) {
      return jsonResponse({
        ok: false,
        verified: false,
        message: "Der YouTube-Kanal konnte gerade nicht ausgelesen werden. Bitte prüfe die hinterlegte Kanal-URL oder versuche es in ein paar Sekunden erneut.",
      });
    }

    if (!found) {
      return jsonResponse({
        ok: false,
        verified: false,
        message: `Der Code ${expectedCode} wurde noch nicht in deiner YouTube-Kanalbeschreibung gefunden. Bitte auf YouTube speichern und nach 5–10 Sekunden erneut prüfen.`,
      });
    }

    const nextAvatar = (creator.avatar_url && creator.avatar_url.trim())
      ? creator.avatar_url.trim()
      : (resolved.avatarUrl || null);
    const nextChannelId = resolved.channelId || creator.youtube_channel_id || null;
    const nextYoutubeUrl = (creator.youtube_url && creator.youtube_url.includes("/@"))
      ? creator.youtube_url
      : (resolved.canonicalUrl || creator.youtube_url);

    await sql`
      UPDATE public.content_creators
      SET user_id = ${uid},
          verified_at = now(),
          avatar_url = ${nextAvatar},
          youtube_channel_id = ${nextChannelId},
          youtube_url = ${nextYoutubeUrl},
          updated_at = now()
      WHERE id = ${creator.id}
    `;

    await sql`
      INSERT INTO public.creator_outreach_admin (
        creator_id, outreach_status, claim_token, claimed_at,
        pending_claim_user_id, pending_verification_code, pending_code_created_at, updated_at
      )
      VALUES (
        ${creator.id}, 'claimed', NULL, now(),
        NULL, NULL, NULL, now()
      )
      ON CONFLICT (creator_id) DO UPDATE
      SET outreach_status = 'claimed',
          claim_token = NULL,
          claimed_at = now(),
          pending_claim_user_id = NULL,
          pending_verification_code = NULL,
          pending_code_created_at = NULL,
          updated_at = now()
    `;

    return jsonResponse({
      ok: true,
      verified: true,
      source: resolved.source,
      avatar_url: nextAvatar,
      youtube_channel_id: nextChannelId,
      youtube_url: nextYoutubeUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Interner Fehler";
    return jsonResponse({ error: message }, 500);
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
});
