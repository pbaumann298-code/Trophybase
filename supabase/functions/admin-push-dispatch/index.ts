import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tb-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_EMAILS = new Set(["master@trophybase.app"]);
const VAPID_SUBJECT = "mailto:master@trophybase.app";

const encoder = new TextEncoder();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength || aBytes.byteLength === 0) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  const clean = input.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = clean + "===".slice((clean.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, arr) => sum + arr.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.byteLength;
  }
  return out;
}

async function hkdfDeriveBytes(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  byteLength: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    ikm,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info,
    },
    keyMaterial,
    byteLength * 8,
  );
  return new Uint8Array(bits);
}

async function createVapidAuthHeader(
  endpoint: string,
  vapidPublicKeyB64Url: string,
  vapidPrivateJwk: JsonWebKey,
  subject: string,
): Promise<string> {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const headerB64 = bytesToBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payloadB64 = bytesToBase64Url(encoder.encode(JSON.stringify({ aud, exp, sub: subject })));
  const signingInput = `${headerB64}.${payloadB64}`;

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    vapidPrivateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const sigBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    encoder.encode(signingInput),
  );

  const jwt = `${signingInput}.${bytesToBase64Url(new Uint8Array(sigBuffer))}`;
  return `vapid t=${jwt}, k=${vapidPublicKeyB64Url}`;
}

async function encryptWebPushAes128Gcm(
  plaintext: string,
  uaPublicB64Url: string,
  authSecretB64Url: string,
): Promise<Uint8Array> {
  const uaPublicBytes = base64UrlToBytes(uaPublicB64Url);
  const authSecretBytes = base64UrlToBytes(authSecretB64Url);

  if (uaPublicBytes.byteLength !== 65) {
    throw new Error(`Ungültige p256dh-Länge (${uaPublicBytes.byteLength})`);
  }
  if (authSecretBytes.byteLength !== 16) {
    throw new Error(`Ungültige auth-Länge (${authSecretBytes.byteLength})`);
  }

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const asKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeyPair.publicKey));
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaPublicKey },
      asKeyPair.privateKey,
      256,
    ),
  );

  const keyInfo = concatBytes(
    encoder.encode("WebPush: info\0"),
    uaPublicBytes,
    asPublicRaw,
  );
  const ikm = await hkdfDeriveBytes(ecdhSecret, authSecretBytes, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cekBytes = await hkdfDeriveBytes(
    ikm,
    salt,
    encoder.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonceBytes = await hkdfDeriveBytes(
    ikm,
    salt,
    encoder.encode("Content-Encoding: nonce\0"),
    12,
  );

  const aesKey = await crypto.subtle.importKey("raw", cekBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const paddedRecord = concatBytes(encoder.encode(plaintext), new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonceBytes, tagLength: 128 },
      aesKey,
      paddedRecord,
    ),
  );

  const rsBuf = new Uint8Array(4);
  new DataView(rsBuf.buffer).setUint32(0, 4096, false);
  const idLenBuf = new Uint8Array([asPublicRaw.byteLength]);

  return concatBytes(salt, rsBuf, idLenBuf, asPublicRaw, ciphertext);
}

function extractGameTitle(rawTitle: unknown): string {
  if (!rawTitle) return "Unbekanntes Spiel";
  if (typeof rawTitle === "object" && !Array.isArray(rawTitle)) {
    const obj = rawTitle as Record<string, unknown>;
    const candidate = obj.de || obj.en || Object.values(obj).find((v) => typeof v === "string" && v.trim());
    return candidate ? String(candidate).trim() : "Unbekanntes Spiel";
  }
  const str = String(rawTitle).trim();
  if (!str) return "Unbekanntes Spiel";
  if (str.startsWith("{")) {
    try {
      return extractGameTitle(JSON.parse(str));
    } catch {
      return str;
    }
  }
  return str;
}

function formatPosition(record: Record<string, unknown>): string {
  const explicit = String(record.display_key ?? "").trim();
  if (explicit) return explicit;
  const type = String(record.content_type ?? "").trim();
  const key = String(record.content_key ?? "").trim();
  const field = String(record.field_name ?? "").trim();
  if (type === "trophy") return key ? `Trophäe #${key}` : "Trophäe";
  if (type === "guide_step" || type === "guide_item" || type === "item_name" || type === "boss") {
    return key ? `Guide #${key}` : `Guide (${field || "Eintrag"})`;
  }
  if (type === "game") return field ? `Spiel · ${field}` : "Spiel";
  return field || type || "Meldung";
}

function buildCommunityReportNotification(record: Record<string, unknown>) {
  const reportId = record.id ?? "?";
  const gameTitle = extractGameTitle(record.spieltitel);
  const lang = String(record.language_code ?? "de").trim().toUpperCase() || "DE";
  const pos = formatPosition(record);
  const suggestionRaw = String(record.suggested_text ?? "").replace(/\s+/g, " ").trim();
  const suggestionPreview = suggestionRaw.length > 120
    ? `${suggestionRaw.slice(0, 117)}…`
    : suggestionRaw;

  return {
    title: `🚨 Report #${reportId} · ${gameTitle}`,
    body: suggestionPreview
      ? `${lang} · ${pos} — „${suggestionPreview}“`
      : `${lang} · ${pos}`,
    url: "/admin-apps/reports/",
    tag: `tb-report-${reportId}`,
    icon: "/icons/apps/reports-192.png",
    badge: "/icons/apps/reports-192.png",
    topic: "community_reports",
    reportId,
  };
}

async function verifyAdminBearerToken(req: Request): Promise<string | null> {
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
  const email = String(user?.email ?? "").trim().toLowerCase();
  if (!ADMIN_EMAILS.has(email)) return null;
  return email;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    return jsonResponse({ error: "Missing SUPABASE_DB_URL" }, 500);
  }

  const sql = postgres(dbUrl, { prepare: false, max: 1 });

  try {
    const secretRows = await sql<{ name: string; decrypted_secret: string }[]>`
      SELECT name, decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name IN ('tb_vapid_public_key', 'tb_vapid_private_jwk', 'tb_push_webhook_secret')
    `;

    const secretMap = new Map(secretRows.map((r) => [r.name, r.decrypted_secret]));
    const vapidPublicKey = secretMap.get("tb_vapid_public_key") || "";
    const vapidPrivateRaw = secretMap.get("tb_vapid_private_jwk") || "";
    const expectedWebhookSecret = secretMap.get("tb_push_webhook_secret") || "";

    if (!vapidPublicKey || !vapidPrivateRaw || !expectedWebhookSecret) {
      return jsonResponse({ error: "Push secrets incomplete in Vault" }, 500);
    }

    const incomingWebhookSecret = req.headers.get("x-tb-webhook-secret") || "";
    const isWebhookAuth = incomingWebhookSecret.length > 0 &&
      timingSafeEqualStr(incomingWebhookSecret, expectedWebhookSecret);

    let adminEmail: string | null = null;
    if (!isWebhookAuth) {
      adminEmail = await verifyAdminBearerToken(req);
      if (!adminEmail) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
    }

    const payload = await req.json().catch(() => ({}));
    const action = String(payload?.action ?? payload?.event ?? "");

    let notificationPayload: Record<string, unknown>;
    let targetEndpointFilter: string | null = null;
    let topicFilter = "community_reports";

    if (action === "test") {
      targetEndpointFilter = typeof payload?.endpoint === "string" && payload.endpoint.trim()
        ? payload.endpoint.trim()
        : null;
      notificationPayload = {
        title: "🔔 TrophyBase Push aktiv!",
        body: "Test erfolgreich – neue Community Reports klingeln ab sofort direkt hier an.",
        url: "/admin-apps/reports/",
        tag: `tb-test-${Date.now()}`,
        icon: "/icons/apps/reports-192.png",
        badge: "/icons/apps/reports-192.png",
        topic: "test",
      };
    } else if (action === "community_report_created" && payload?.record) {
      notificationPayload = buildCommunityReportNotification(
        payload.record as Record<string, unknown>,
      );
      topicFilter = "community_reports";
    } else {
      return jsonResponse({ ok: true, skipped: true, reason: `Unhandled action: ${action}` });
    }

    const subscriptions = targetEndpointFilter
      ? await sql<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
          SELECT id, endpoint, p256dh, auth
          FROM public.admin_push_subscriptions
          WHERE is_active = true
            AND endpoint = ${targetEndpointFilter}
        `
      : await sql<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
          SELECT id, endpoint, p256dh, auth
          FROM public.admin_push_subscriptions
          WHERE is_active = true
            AND (${action === "test"} OR ${topicFilter} = ANY(topics))
        `;

    if (subscriptions.length === 0) {
      return jsonResponse({ ok: true, delivered: 0, failed: 0, total: 0 });
    }

    const vapidPrivateJwk = JSON.parse(vapidPrivateRaw) as JsonWebKey;
    const messageString = JSON.stringify(notificationPayload);

    let delivered = 0;
    let failed = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const encryptedBody = await encryptWebPushAes128Gcm(
            messageString,
            sub.p256dh,
            sub.auth,
          );
          const authorization = await createVapidAuthHeader(
            sub.endpoint,
            vapidPublicKey,
            vapidPrivateJwk,
            VAPID_SUBJECT,
          );

          const pushRes = await fetch(sub.endpoint, {
            method: "POST",
            headers: {
              Authorization: authorization,
              "Content-Type": "application/octet-stream",
              "Content-Encoding": "aes128gcm",
              "Content-Length": String(encryptedBody.byteLength),
              TTL: "86400",
              Urgency: "high",
            },
            body: encryptedBody,
          });

          if (pushRes.status >= 200 && pushRes.status < 300) {
            delivered += 1;
            await sql`
              UPDATE public.admin_push_subscriptions
              SET last_sent_at = now(), last_error = null
              WHERE id = ${sub.id}
            `;
          } else if (pushRes.status === 404 || pushRes.status === 410) {
            failed += 1;
            await sql`
              UPDATE public.admin_push_subscriptions
              SET is_active = false, last_error = ${`Abgelaufen (HTTP ${pushRes.status})`}
              WHERE id = ${sub.id}
            `;
          } else {
            failed += 1;
            const errText = (await pushRes.text().catch(() => "")).slice(0, 200);
            await sql`
              UPDATE public.admin_push_subscriptions
              SET last_error = ${`HTTP ${pushRes.status}: ${errText}`}
              WHERE id = ${sub.id}
            `;
          }
        } catch (err) {
          failed += 1;
          const msg = err instanceof Error ? err.message.slice(0, 200) : "Unbekannter Push-Fehler";
          await sql`
            UPDATE public.admin_push_subscriptions
            SET last_error = ${msg}
            WHERE id = ${sub.id}
          `;
        }
      }),
    );

    return jsonResponse({
      ok: true,
      delivered,
      failed,
      total: subscriptions.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return jsonResponse({ error: message }, 500);
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
});
