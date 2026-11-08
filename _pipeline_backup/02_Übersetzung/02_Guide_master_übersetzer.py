#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
02_Guide_Uebersetzer_Master.py
Konsolidierte 4-Stufen-Übersetzungs-Pipeline (Inkl. 72h-Fast-Lane für neue Tages-Guides & Locale-Key-Normalisierung)
"""

import os
import re
import sys
import json
import time
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv, find_dotenv
from supabase import create_client, Client

_ROOT_ENV = Path(r"C:\Temp\TrophyBase\.env")
if _ROOT_ENV.exists():
    load_dotenv(_ROOT_ENV, override=True)
else:
    _parent_envs = [p / ".env" for p in Path(__file__).resolve().parents if (p / ".env").exists()]
    load_dotenv(_parent_envs[0] if _parent_envs else find_dotenv(), override=True)

# =============================================================================
# WELLEN-KONFIGURATION (Hier umschalten oder per CLI übergeben: python skript.py wave2)
# =============================================================================
WAVES = {
    "wave1": ["de", "en", "es", "pt", "fr", "it", "nl", "pl", "ru", "sv", "fi", "ar"],
    "wave2": ["fr", "it", "nl", "pl", "ru", "sv", "fi", "ar"],
    "wave3": ["ja", "ko", "zh-hans", "zh-hant"],
    "all": [
        "de",
        "en",
        "es",
        "pt",
        "fr",
        "it",
        "nl",
        "pl",
        "ru",
        "sv",
        "fi",
        "ar",
        "ja",
        "ko",
        "zh-hans",
        "zh-hant",
    ],
}

ACTIVE_WAVE = os.getenv("TRANSLATION_WAVE", "wave2")
AUTO_PUBLISH = True

WEBSITE_SUPPORTED_LOCALES = {
    "ar",
    "ja",
    "en",
    "fr",
    "es",
    "de",
    "it",
    "nl",
    "pt",
    "pl",
    "ru",
    "ko",
    "zh-hant",
    "zh-hans",
    "fi",
    "sv",
}

DRIP_FEED_TYPES = {"Evergreen", "Premium", "Standard"}

# Kosten-Wächter
MAX_BUDGET_EUR = float(os.getenv("MAX_BUDGET_EUR", 125.00))
COST_PER_1M_INPUT_EUR = 0.15
COST_PER_1M_OUTPUT_EUR = 0.60
SPENT_EUR = 0.0

MAX_LANGS_PER_API_CALL = 4
CATEGORY_BATCH_SIZE = 80
STEM_BATCH_SIZE = 90
TIP_BATCH_SIZE = 25
PAUSE_BETWEEN_CALLS_SEC = 1.0

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
GEMINI_API_KEY = (
    os.getenv("GEMINI_API_KEY")
    or os.getenv("GOOGLE_API_KEY")
    or os.getenv("VITE_GEMINI_API_KEY")
)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )
if not GEMINI_API_KEY:
    sys.exit("❌ Fehler: GEMINI_API_KEY fehlt in der .env!")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

STATIC_STORY_TIP = {
    "de": "Automatisch im Spielverlauf erhaltbar.",
    "en": "Unlocked automatically through story progression.",
    "es": "Se desbloquea automáticamente durante la historia.",
    "pt": "Desbloqueado automaticamente durante a história.",
    "fr": "Se débloque automatiquement au cours de l'histoire.",
    "it": "Si sblocca automaticamente proseguendo nella storia.",
    "nl": "Wordt automatisch ontgrendeld tijdens het verhaal.",
    "pl": "Odblokowywane automatycznie w trakcie fabuły.",
    "ru": "Открывается автоматически по мере прохождения сюжета.",
    "sv": "Låses upp automatiskt under berättelsens gång.",
    "fi": "Avautuu automaattisesti tarinan edetessä.",
    "ar": "يتم فتحها تلقائياً أثناء التقدم في القصة.",
    "ja": "ストーリー進行で自動的に獲得できます。",
    "ko": "스토리 진행 중 자동으로 획득할 수 있습니다.",
    "zh-hans": "随主线剧情推进自动解锁。",
    "zh-hant": "隨主線劇情推進自動解鎖。",
}

STATIC_COLLECTIBLE_TIP = {
    "de": "Sammelobjekt. Nutze für die exakten Fundorte bitte unseren separaten TrophyBase-Sammelguide.",
    "en": "Collectible. For exact locations, please refer to our separate TrophyBase collectible guide.",
    "es": "Coleccionable. Para conocer las ubicaciones exactas, consulta nuestra guía de coleccionables en TrophyBase.",
    "pt": "Colecionável. Para as localizações exatas, consulte o nosso guia de colecionáveis no TrophyBase.",
    "fr": "Objet à collectionner. Pour les emplacements exacts, consultez notre guide des collectibles TrophyBase.",
    "it": "Collezionabile. Per le posizioni esatte, consulta la nostra guida ai collezionabili su TrophyBase.",
    "nl": "Verzamelobject. Raadpleeg onze aparte TrophyBase-verzamelgids voor de exacte locaties.",
    "pl": "Znajdźka. Dokładne lokalizacje znajdziesz w naszym osobnym poradniku znajdziek TrophyBase.",
    "ru": "Коллекционный предмет. Точное расположение смотрите в нашем отдельном гиде по сбору на TrophyBase.",
    "sv": "Samlarobjekt. För exakta platser, se vår separata samlarguide på TrophyBase.",
    "fi": "Keräilyesine. Tarkat sijainnit löydät erillisestä TrophyBase-keräilyoppaastamme.",
    "ar": "مقتنيات. لمعرفة المواقع الدقيقة، يرجى مراجعة دليل المقتنيات المنفصل على TrophyBase.",
    "ja": "収集品。正確な入手場所については、別枠のTrophyBase収集品ガイドをご参照ください。",
    "ko": "수집품. 정확한 위치는 별도의 TrophyBase 수집품 가이드를 참고하세요.",
    "zh-hans": "收集品。关于确切位置，请参阅我们独立的 TrophyBase 收集品指南。",
    "zh-hant": "收集品。關於確切位置，請參閱我們獨立的 TrophyBase 收集品指南。",
}

STATIC_SERVERTOT_TIP = {
    "de": "Wegen Serverabschaltung nicht mehr möglich.",
    "en": "No longer obtainable due to server shutdown.",
    "es": "Ya no se puede obtener debido al cierre de los servidores.",
    "pt": "Não pode mais ser obtido devido ao desligamento dos servidores.",
    "fr": "Ne peut plus être obtenu en raison de la fermeture des serveurs.",
    "it": "Non più ottenibile a causa della chiusura dei server.",
    "nl": "Niet meer verkrijgbaar vanwege het uitschakelen van de servers.",
    "pl": "Niemożliwe do zdobycia z powodu wyłączenia serwerów.",
    "ru": "Больше невозможно получить из-за отключения серверов.",
    "sv": "Går inte längre att få på grund av nedstängda servrar.",
    "fi": "Ei enää saatavilla palvelinten sulkemisen vuoksi.",
    "ar": "لم يعد من الممكن الحصول عليها بسبب إغلاق الخوادم.",
    "ja": "サーバー終了のため、現在は獲得できません。",
    "ko": "서버 종료로 인해 더 이상 획득할 수 없습니다.",
    "zh-hans": "由于服务器已关停，目前已无法获得。",
    "zh-hant": "由於伺服器已關停，目前已無法獲得。",
}

COUNTER_TOKEN_RE = re.compile(r"(^\d+\.(?=\s)|\b\d+\s*/\s*\d+\b|#\d+|\b\d+\b)")

PRIORITY_ORDER = {
    "Premium": 1,  # Premium & Evergreen zuerst!
    "Evergreen": 2,
    "Standard": 3,
    "easy_platin": 4,
    "Servertot": 5,
}


class QuotaExhaustedError(Exception):
    """Wird ausgelöst, wenn die Gemini API dauerhaft HTTP 429/503 liefert oder das Budget erreicht ist."""


def normalize_lang_key(raw_key: str) -> str:
    """Verhindert Endlosschleifen durch Gemini-Varianten wie 'zh-Hans', 'zh_hant' oder 'pt-BR'."""
    k = str(raw_key or "").strip().lower().replace("_", "-")
    if k in ("pt-br", "pt-pt"):
        return "pt"
    if k in ("zh-cn", "zh-sg", "zh-hans"):
        return "zh-hans"
    if k in ("zh-tw", "zh-hk", "zh-hant"):
        return "zh-hant"
    return k


def normalize_lang_dict(d: dict) -> dict:
    if not isinstance(d, dict):
        return {}
    return {normalize_lang_key(k): v for k, v in d.items()}


def is_locale_done_in_status(status_map: dict, lg: str) -> bool:
    """Prüft sowohl 'guide_zh-hans' als auch 'guide_zh_hans'."""
    if not isinstance(status_map, dict):
        return False
    norm = normalize_lang_key(lg)
    underscored = norm.replace("-", "_")
    return status_map.get(f"guide_{norm}") in ("PUBLISHED", "READY") or status_map.get(
        f"guide_{underscored}"
    ) in ("PUBLISHED", "READY")


def is_fast_lane_new_release(status_map: dict, hours: int = 72) -> tuple[bool, float]:
    """Erkennt deine ~18 täglichen Neuerscheinungen anhand des SQL-Triggers 'de_published_at'."""
    if not isinstance(status_map, dict):
        return False, 0.0
    raw_ts = status_map.get("de_published_at")
    if not raw_ts:
        return False, 0.0
    try:
        dt = datetime.fromisoformat(str(raw_ts).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        return (dt >= cutoff), dt.timestamp()
    except Exception:
        return False, 0.0


def execute_with_retry(request_builder, retries: int = 4):
    for attempt in range(retries):
        try:
            return request_builder.execute()
        except Exception as exc:
            if attempt == retries - 1:
                raise
            wait = 3 * (attempt + 1)
            print(
                f"   ⏳ Supabase Timeout/Lock ({exc}) -> Retry {attempt + 1}/{retries} in {wait}s..."
            )
            time.sleep(wait)


def chunk_langs(
    langs: list[str], size: int = MAX_LANGS_PER_API_CALL
) -> list[list[str]]:
    return [langs[i : i + size] for i in range(0, len(langs), size)]


def mask_counters(text: str) -> tuple[str, list[str]]:
    s = str(text or "").strip()
    tokens = []

    def _repl(match):
        idx = len(tokens)
        tokens.append(match.group(0))
        return f"{{{idx}}}"

    masked = COUNTER_TOKEN_RE.sub(_repl, s)
    return masked, tokens


def unmask_counters(masked_translation: str, tokens: list[str]) -> str:
    res = str(masked_translation or "").strip()
    for idx, tok in enumerate(tokens):
        res = res.replace(f"{{{idx}}}", tok)
    res = re.sub(r"\[\[(\d+)\]\]", r"[\1]", res)
    res = re.sub(r"\(\[(\d+)\]\)", r"[\1]", res)
    res = re.sub(r"(\d+)\.\.", r"\1.", res)
    return res


def detect_source_lang(status_map: dict) -> str | None:
    if not isinstance(status_map, dict):
        return None
    for preferred in ("de", "en", "es", "pt"):
        if str(status_map.get(f"guide_{preferred}") or "").upper() == "PUBLISHED":
            return preferred
    for k, v in status_map.items():
        if k.startswith("guide_") and str(v or "").upper() == "PUBLISHED":
            return k.replace("guide_", "")
    return None


def pick_field_source(val_map: dict, preferred_lang: str = "de") -> tuple[str, str]:
    """
    Findet für JEDES JSONB-Feld einzeln heraus, in welcher Sprache der Originaltext liegt!
    - Bei Guide-Zeilen von spanischen/brasilianischen Creatorn findet es ('es', '...') bzw. ('pt', '...').
    - Bei Guide-Tipps & Beschreibung aus 06.1 findet es ('de', '...') bzw. ('en', '...').
    """
    if not isinstance(val_map, dict):
        return preferred_lang, ""
    for cand in (preferred_lang, "de", "en", "es", "pt", "fr", "it", "pl", "ru", "ja"):
        txt = str(val_map.get(cand) or "").strip()
        if txt:
            return cand, txt
    for k, v in val_map.items():
        txt = str(v or "").strip()
        if txt:
            return normalize_lang_key(k), txt
    return preferred_lang, ""


def primary_game_type(raw_spiel_typ: str) -> str:
    parts = [p.strip() for p in str(raw_spiel_typ or "").split(",") if p.strip()]
    if "Servertot" in parts:
        return "Servertot"
    for p in parts:
        if p in ("Premium", "Evergreen", "Standard", "easy_platin"):
            return p
    return parts[0] if parts else "Standard"


def fetch_published_games_queue(target_langs: list[str]) -> list[dict]:
    all_games = []
    page_size = 1000
    offset = 0
    while True:
        res = execute_with_retry(
            supabase.table("games")
            .select("id, spieltitel, spiel_typ, status, published_locales")
            .neq("published_locales", "[]")
            .order("id")
            .range(offset, offset + page_size - 1)
        )
        batch = res.data or []
        all_games.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    queue = []
    for g in all_games:
        raw_type = str(g.get("spiel_typ") or "").strip()
        low_type = raw_type.lower()
        if "quickwin" in low_type or "unlesbar" in low_type:
            continue
        status = g.get("status") if isinstance(g.get("status"), dict) else {}
        src_lang = detect_source_lang(status)
        if not src_lang:
            continue

        # WICHTIG: Wenn das Spiel auf ES/PT veröffentlicht wurde, muss es auch dann in die Queue,
        # wenn DE/EN noch nicht PUBLISHED sind ODER in ES/PT noch die deutschen Guide-Tipps/Beschreibung fehlen!
        needs_work = any(
            not is_locale_done_in_status(status, lg) for lg in target_langs
        )
        if needs_work or src_lang not in ("de", "en"):
            queue.append(g)

    def _sort_key(x: dict):
        st = x.get("status") if isinstance(x.get("status"), dict) else {}
        g_type = primary_game_type(x.get("spiel_typ"))
        is_fresh, pub_ts = is_fast_lane_new_release(st, hours=72)
        # 1. Echte Guides (Premium/Evergreen/Standard), die in den letzten 72h neu veröffentlicht wurden -> ÜBERHOLSPUR!
        fast_lane_rank = 0 if (is_fresh and g_type in DRIP_FEED_TYPES) else 1
        title_str = str(
            (x.get("spieltitel") or {}).get("de")
            or (x.get("spieltitel") or {}).get("en")
            or ""
        )
        return (
            fast_lane_rank,
            -pub_ts if fast_lane_rank == 0 else 0,
            PRIORITY_ORDER.get(g_type, 99),
            title_str,
        )

    queue.sort(key=_sort_key)
    return queue


def fetch_all_guide_rows(game_id: str) -> list[dict]:
    all_rows = []
    page_size = 1000
    offset = 0
    while True:
        res = execute_with_retry(
            supabase.table("game_guides")
            .select("*")
            .eq("game_id", game_id)
            .order("id")
            .range(offset, offset + page_size - 1)
        )
        batch = res.data or []
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return all_rows


def bulk_save_guide_rows(rows_to_update: list[dict]):
    if not rows_to_update:
        return
    chunk_size = 250
    for i in range(0, len(rows_to_update), chunk_size):
        chunk = rows_to_update[i : i + chunk_size]
        try:
            execute_with_retry(
                supabase.rpc("tb_bulk_update_guide_translations", {"p_rows": chunk})
            )
        except Exception:
            for r in chunk:
                execute_with_retry(
                    supabase.table("game_guides")
                    .update(
                        {
                            "Spiel_region": r["Spiel_region"],
                            "chronological_group": r["chronological_group"],
                            "category_group": r["category_group"],
                            "boss_group": r["boss_group"],
                            "item_name": r["item_name"],
                            "translation_status": r["translation_status"],
                        }
                    )
                    .eq("id", r["id"])
                )


def apply_translations_and_save(
    guide_rows: list[dict],
    source_lang: str,
    target_langs: list[str],
    loc_translations: dict,
    group_translations: dict,
    stem_translations: dict,
) -> int:
    rows_to_save = []
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    for row in guide_rows:
        changed = False
        loc_map = (
            dict(row.get("Spiel_region") or {})
            if isinstance(row.get("Spiel_region"), dict)
            else {}
        )
        chrono_map = (
            dict(row.get("chronological_group") or {})
            if isinstance(row.get("chronological_group"), dict)
            else {}
        )
        cat_map = (
            dict(row.get("category_group") or {})
            if isinstance(row.get("category_group"), dict)
            else {}
        )
        boss_map = (
            dict(row.get("boss_group") or {})
            if isinstance(row.get("boss_group"), dict)
            else {}
        )
        item_map = (
            dict(row.get("item_name") or {})
            if isinstance(row.get("item_name"), dict)
            else {}
        )

        _, loc_src = pick_field_source(loc_map, source_lang)
        if loc_src and loc_src in loc_translations:
            for raw_lg, val in (loc_translations[loc_src] or {}).items():
                lg = normalize_lang_key(raw_lg)
                if val and not str(loc_map.get(lg) or "").strip():
                    loc_map[lg] = str(val).strip()
                    changed = True

        for col_map in (chrono_map, cat_map, boss_map):
            _, c_src = pick_field_source(col_map, source_lang)
            if c_src and c_src in group_translations:
                for raw_lg, val in (group_translations[c_src] or {}).items():
                    lg = normalize_lang_key(raw_lg)
                    if val and not str(col_map.get(lg) or "").strip():
                        col_map[lg] = str(val).strip()
                        changed = True

        _, item_src = pick_field_source(item_map, source_lang)
        if item_src:
            stem, tokens = mask_counters(item_src)
            if stem in stem_translations:
                for raw_lg, val in (stem_translations[stem] or {}).items():
                    lg = normalize_lang_key(raw_lg)
                    if val and not str(item_map.get(lg) or "").strip():
                        item_map[lg] = unmask_counters(val, tokens)
                        changed = True

        still_missing = [
            lg for lg in target_langs if not str(item_map.get(lg) or "").strip()
        ]
        new_t_status = {
            "stage": "done" if not still_missing else "partial",
            "missing_langs": still_missing,
            "updated_at": now_iso,
        }

        if changed:
            row["Spiel_region"] = loc_map if loc_map else None
            row["chronological_group"] = chrono_map if chrono_map else None
            row["category_group"] = cat_map if cat_map else None
            row["boss_group"] = boss_map if boss_map else None
            row["item_name"] = item_map
            row["translation_status"] = new_t_status
            rows_to_save.append(
                {
                    "id": row["id"],
                    "Spiel_region": row["Spiel_region"],
                    "chronological_group": row["chronological_group"],
                    "category_group": row["category_group"],
                    "boss_group": row["boss_group"],
                    "item_name": item_map,
                    "translation_status": new_t_status,
                }
            )

    if rows_to_save:
        bulk_save_guide_rows(rows_to_save)
    return len(rows_to_save)


def call_gemini_json(
    system_prompt: str, user_payload: dict | list, retries: int = 5
) -> dict | list:
    global SPENT_EUR
    if SPENT_EUR >= MAX_BUDGET_EUR:
        raise QuotaExhaustedError(
            f"Budget-Limit von {MAX_BUDGET_EUR:.2f} € erreicht ({SPENT_EUR:.4f} €)."
        )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    body = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [
            {
                "role": "user",
                "parts": [{"text": json.dumps(user_payload, ensure_ascii=False)}],
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }

    for attempt in range(retries):
        try:
            res = requests.post(url, json=body, timeout=180)
            if res.status_code == 200:
                time.sleep(PAUSE_BETWEEN_CALLS_SEC)
                data = res.json()
                usage = data.get("usageMetadata") or {}
                in_tok = int(usage.get("promptTokenCount") or 0)
                out_tok = int(usage.get("candidatesTokenCount") or 0)
                SPENT_EUR += (in_tok / 1_000_000) * COST_PER_1M_INPUT_EUR + (
                    out_tok / 1_000_000
                ) * COST_PER_1M_OUTPUT_EUR

                text = (
                    data.get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text", "{}")
                )
                return json.loads(text)

            err_msg = res.text[:400]
            try:
                err_msg = json.dumps(res.json().get("error", {}), ensure_ascii=False)
            except Exception:
                pass

            if res.status_code == 429 and any(
                k in err_msg.lower()
                for k in ("perday", "per_day", "free_tier", "billing details")
            ):
                print(f"\n🛑 HARTES GOOGLE-QUOTA-LIMIT (HTTP 429):\n{err_msg}\n")
                raise QuotaExhaustedError("API-Tageslimit für diesen Key erschöpft.")

            if res.status_code in (429, 500, 502, 503, 504):
                wait = min(60, 6 * (2**attempt))
                print(
                    f"   ⏳ Gemini HTTP {res.status_code} -> warte {wait}s (Versuch {attempt + 1}/{retries})..."
                )
                time.sleep(wait)
                continue

            print(f"   ⚠️ Gemini HTTP {res.status_code}: {err_msg}")
            break
        except QuotaExhaustedError:
            raise
        except Exception as exc:
            wait = 5 * (attempt + 1)
            print(
                f"   ⚠️ Gemini API-Fehler (Versuch {attempt + 1}/{retries}): {exc} – warte {wait}s..."
            )
            time.sleep(wait)

    raise QuotaExhaustedError(f"Alle {retries} Versuche fehlgeschlagen.")


def set_game_guide_status(game_id: str, lang: str, target_status: str):
    g_res = execute_with_retry(
        supabase.table("games").select("status").eq("id", game_id).limit(1)
    )
    row = (g_res.data or [None])[0]
    if not row:
        return

    status_map = (
        dict(row.get("status") or {}) if isinstance(row.get("status"), dict) else {}
    )
    norm_lg = normalize_lang_key(lang)
    current_val = status_map.get(f"guide_{norm_lg}")
    if current_val == "PUBLISHED" and target_status == "READY":
        return

    status_map[f"guide_{norm_lg}"] = target_status
    execute_with_retry(
        supabase.table("games").update({"status": status_map}).eq("id", game_id)
    )


def run_pipeline_for_game(game_id: str, wave_targets: list[str]) -> bool:
    g_res = execute_with_retry(
        supabase.table("games").select("*").eq("id", game_id).limit(1)
    )
    game = (g_res.data or [None])[0]
    if not game:
        print(f"❌ Spiel {game_id} nicht gefunden.")
        return True

    titles = game.get("spieltitel") if isinstance(game.get("spieltitel"), dict) else {}
    game_title = titles.get("de") or titles.get("en") or game_id
    g_type = primary_game_type(game.get("spiel_typ"))
    pub_locs = (
        game.get("published_locales")
        if isinstance(game.get("published_locales"), list)
        else []
    )
    # Drip-Feed (READY) NUR für neue Spiele (<= 1 Sprache live, z.B. frisch auf DE freigegeben).
    # Ist das Spiel bereits mehrsprachig live (>= 2 Sprachen in published_locales), gehen Nachzügler-Sprachen (wie sv/fi) sofort auf PUBLISHED!
    already_international = len(pub_locs) >= 2
    use_drip_feed = (
        (g_type in DRIP_FEED_TYPES)
        and bool(game.get("is_indexable", True))
        and (not already_international)
    )

    status_map = game.get("status") if isinstance(game.get("status"), dict) else {}
    source_lang = detect_source_lang(status_map) or "de"

    # Alle Sprachen der aktuellen Welle prüfen (inkl. source_lang wie 'es', falls dort noch die DE-Tipps/Beschreibung fehlen,
    # und inkl. 'de'/'en', falls dort noch die spanischen Guide-Zeilen fehlen!)
    # Basis-Sprachen ('de', 'en') IMMER mitprüfen, unabhängig von der gewählten Welle!
    # Selbst wenn guide_en schon PUBLISHED ist: Stufe 3B übersetzt nur echte Lücken
    # (wo guide_tip->>'en' oder beschreibung->>'en' noch leer ist) und überschreibt nichts Bestehendes!
    candidate_langs = list(dict.fromkeys(["de", "en", source_lang] + list(wave_targets)))
    active_targets = [
        lg for lg in candidate_langs
        if lg in ("de", "en") or not is_locale_done_in_status(status_map, lg)
    ]
        
    
    if not active_targets:
        return True

    is_fresh, _ = is_fast_lane_new_release(status_map, hours=72)
    lane_badge = "⚡ FAST-LANE (NEU)" if (is_fresh and use_drip_feed) else "📦 BACKLOG"

    print(f"\n=================================================================")
    print(
        f"🎮 [{lane_badge} | {g_type}] {game_title} ({source_lang.upper()} -> {active_targets} | "
        f"Ziel: {'READY (Drip-Feed)' if use_drip_feed else 'SOFORT PUBLISHED'})"
    )
    print(f"=================================================================")

    ach_res = execute_with_retry(
        supabase.table("game_achievements").select("*").eq("game_id", game_id)
    )
    achievements = ach_res.data or []
    ach_by_id = {
        str(a.get("platform_achievement_id")).strip(): a for a in achievements
    }

    try:
        s1 = execute_with_retry(
            supabase.rpc("tb_apply_stage1_sql_for_game", {"p_game_id": game_id})
        )
        if s1.data:
            print(
                f"⚡ Stufe 1 (SQL-Sync & Glossar): {s1.data} Zeilen direkt in SQL aktualisiert."
            )
    except Exception as exc:
        print(f"⚠️ Stufe 1 Hinweis: {exc}")

    guide_rows = fetch_all_guide_rows(game_id)
    print(f"📋 Guide-Zeilen: {len(guide_rows)} | Aktive Zielsprachen: {active_targets}")

    loc_translations: dict[str, dict] = {}
    group_translations: dict[str, dict] = {}
    stem_translations: dict[str, dict] = {}

    try:
        # STUFE 2: SPALTEN
        unique_locs: dict[str, set] = {}
        unique_groups: dict[str, dict] = {}

        for row in guide_rows:
            loc_map = (
                row.get("Spiel_region")
                if isinstance(row.get("Spiel_region"), dict)
                else {}
            )
            loc_src = str(
                loc_map.get(source_lang) or loc_map.get("de") or loc_map.get("en") or ""
            ).strip()
            if loc_src:
                missing = [
                    lg
                    for lg in active_targets
                    if not str(loc_map.get(lg) or "").strip()
                ]
                if missing:
                    unique_locs.setdefault(loc_src, set()).update(missing)

            for col in ("chronological_group", "category_group", "boss_group"):
                col_map = row.get(col) if isinstance(row.get(col), dict) else {}
                col_src = str(
                    col_map.get(source_lang)
                    or col_map.get("de")
                    or col_map.get("en")
                    or ""
                ).strip()
                if not col_src:
                    continue
                missing = [
                    lg
                    for lg in active_targets
                    if not str(col_map.get(lg) or "").strip()
                ]
                if missing:
                    tid = str(row.get("trophy_id") or "").strip()
                    entry = unique_groups.setdefault(
                        col_src, {"missing": set(), "trophy_ids": set()}
                    )
                    entry["missing"].update(missing)
                    if tid and tid in ach_by_id:
                        entry["trophy_ids"].add(tid)

        if unique_locs or unique_groups:
            print(
                f"🏛️ Stufe 2 (Spalten): Übersetze {len(unique_locs)} Gebiete & {len(unique_groups)} Gruppen/Bosse..."
            )
            sys_prompt_cols = (
                f"You are an expert video game localization engine translating in-game region names (`locations`) "
                f"and guide chapter/category/boss headers (`categories`) for '{game_title}' from '{source_lang}'.\n"
                "CRITICAL RULES:\n"
                "1. Input has `locations` and `categories` as JSON objects with numeric string keys ('0', '1', ...).\n"
                "2. Use 100% official in-game localization terms of '{game_title}' (use exact target_langs keys like 'pt', 'zh-hans', 'zh-hant').\n"
                "3. Return strictly JSON with keys `locations` and `categories`, mapping each numeric key ('0', '1', ...) to `{lang: translated_string}`."
                "4. For German ('de'), keep established gaming terms natural: keep 'Walkthrough', 'Playthrough', 'Speedrun', 'Level', 'Boss', 'Quest', 'Gameplay', 'Cutscene', 'Checkpoint', 'DLC', 'New Game+', and translate 'Trophy/Achievement Guide' as 'Trophäen-Guide' / 'Achievement-Guide'.\n"
            )

            for lang_slice in chunk_langs(active_targets):
                loc_items = [
                    (k, sorted(v & set(lang_slice)))
                    for k, v in unique_locs.items()
                    if v & set(lang_slice)
                ]
                for i in range(0, len(loc_items), CATEGORY_BATCH_SIZE):
                    chunk = loc_items[i : i + CATEGORY_BATCH_SIZE]
                    payload_locs = {
                        str(idx): {"text": k, "target_langs": langs}
                        for idx, (k, langs) in enumerate(chunk)
                    }
                    res = call_gemini_json(
                        sys_prompt_cols, {"locations": payload_locs, "categories": {}}
                    )
                    if isinstance(res, dict):
                        out_locs = res.get("locations") or res
                        for idx, (orig_k, _) in enumerate(chunk):
                            t_map = out_locs.get(str(idx)) or out_locs.get(orig_k)
                            if isinstance(t_map, dict):
                                loc_translations.setdefault(orig_k, {}).update(
                                    normalize_lang_dict(t_map)
                                )

                grp_items = [
                    (k, info, sorted(info["missing"] & set(lang_slice)))
                    for k, info in unique_groups.items()
                    if info["missing"] & set(lang_slice)
                ]
                for i in range(0, len(grp_items), CATEGORY_BATCH_SIZE):
                    chunk = grp_items[i : i + CATEGORY_BATCH_SIZE]
                    payload_grps = {}
                    for idx, (src_text, info, slice_missing) in enumerate(chunk):
                        trophy_context = {}
                        for tid in info["trophy_ids"]:
                            ach = ach_by_id[tid]
                            t_names = ach.get("trophy_name") or {}
                            t_descs = ach.get("trophy_desc") or {}
                            for lg in [source_lang, "en"] + slice_missing:
                                lk = (
                                    "zh"
                                    if lg.startswith("zh") and lg not in t_names
                                    else lg
                                )
                                if t_names.get(lk) or t_descs.get(lk):
                                    trophy_context[lg] = (
                                        f"{t_names.get(lk, '')} — {t_descs.get(lk, '')}".strip(
                                            " —"
                                        )
                                    )
                        payload_grps[str(idx)] = {
                            "text": src_text,
                            "target_langs": slice_missing,
                            "trophy_context": trophy_context,
                        }
                    res = call_gemini_json(
                        sys_prompt_cols, {"locations": {}, "categories": payload_grps}
                    )
                    if isinstance(res, dict):
                        out_grps = res.get("categories") or res
                        for idx, (orig_k, _, _) in enumerate(chunk):
                            t_map = out_grps.get(str(idx)) or out_grps.get(orig_k)
                            if isinstance(t_map, dict):
                                group_translations.setdefault(orig_k, {}).update(
                                    normalize_lang_dict(t_map)
                                )

            apply_translations_and_save(
                guide_rows,
                source_lang,
                active_targets,
                loc_translations,
                group_translations,
                stem_translations,
            )

        # STUFE 3A: ZEILEN (item_name)
        unique_stems: dict[str, dict] = {}
        for row in guide_rows:
            item_map = (
                row.get("item_name") if isinstance(row.get("item_name"), dict) else {}
            )
            item_src = str(
                item_map.get(source_lang)
                or item_map.get("de")
                or item_map.get("en")
                or ""
            ).strip()
            if not item_src:
                continue
            missing = [
                lg for lg in active_targets if not str(item_map.get(lg) or "").strip()
            ]
            if not missing:
                continue
            stem, _ = mask_counters(item_src)
            tid = str(row.get("trophy_id") or "").strip()
            cat_map = (
                row.get("category_group")
                if isinstance(row.get("category_group"), dict)
                else {}
            )
            chrono_map = (
                row.get("chronological_group")
                if isinstance(row.get("chronological_group"), dict)
                else {}
            )
            boss_map = (
                row.get("boss_group") if isinstance(row.get("boss_group"), dict) else {}
            )
            cat_src = str(
                cat_map.get(source_lang)
                or chrono_map.get(source_lang)
                or boss_map.get(source_lang)
                or cat_map.get("de")
                or chrono_map.get("de")
                or ""
            ).strip()
            entry = unique_stems.setdefault(
                stem, {"missing": set(), "trophy_id": tid, "category": cat_src}
            )
            entry["missing"].update(missing)

        if unique_stems:
            for lang_slice in chunk_langs(active_targets):
                stem_list = [
                    (stem_text, info, sorted(info["missing"] & set(lang_slice)))
                    for stem_text, info in unique_stems.items()
                    if info["missing"] & set(lang_slice)
                ]
                if not stem_list:
                    continue
                total_batches = (
                    len(stem_list) + STEM_BATCH_SIZE - 1
                ) // STEM_BATCH_SIZE
                print(
                    f"📝 Stufe 3A (Guide-Zeilen für {lang_slice}): {len(stem_list)} Stämme ({total_batches} Pakete)..."
                )

                for b_idx, i in enumerate(
                    range(0, len(stem_list), STEM_BATCH_SIZE), start=1
                ):
                    chunk = stem_list[i : i + STEM_BATCH_SIZE]
                    payload_items = {}
                    index_to_stem = {}
                    for idx, (stem_text, info, slice_missing) in enumerate(chunk):
                        key = str(idx)
                        index_to_stem[key] = stem_text
                        tid = info["trophy_id"]
                        t_ctx = {}
                        if tid and tid in ach_by_id:
                            t_names = ach_by_id[tid].get("trophy_name") or {}
                            t_descs = ach_by_id[tid].get("trophy_desc") or {}
                            for lg in [source_lang, "en"] + slice_missing:
                                lk = (
                                    "zh"
                                    if lg.startswith("zh") and lg not in t_names
                                    else lg
                                )
                                if t_names.get(lk) or t_descs.get(lk):
                                    t_ctx[lg] = (
                                        f"{t_names.get(lk, '')} ({t_descs.get(lk, '')})"
                                    )
                        payload_items[key] = {
                            "stem": stem_text,
                            "context_group": info["category"],
                            "target_langs": slice_missing,
                            "trophy_context": t_ctx,
                        }

                    sys_prompt_items = (
                        f"You are translating checklist steps and item names for the video game '{game_title}' from '{source_lang}'.\n"
                        "CRITICAL RULES:\n"
                        "1. Input is a JSON object with numeric string keys ('0', '1', ...).\n"
                        "2. Use the 100% official in-game localization of '{game_title}'.\n"
                        "3. Keep placeholders like `{0}` or `{1}` in their exact position. Do NOT add extra brackets.\n"
                        "4. Return strictly a JSON object with the EXACT same keys ('0', '1', ...), where each value is `{lang: translated_string}` using the exact requested language codes."
                        "5. For German ('de'), keep established gaming terms natural: keep 'Walkthrough', 'Playthrough', 'Speedrun', 'Level', 'Boss', 'Quest', 'Gameplay', 'Cutscene', 'Checkpoint', 'DLC', 'New Game+', and translate 'Trophy/Achievement Guide' as 'Trophäen-Guide' / 'Achievement-Guide'.\n"
                    )
                    chunk_res = call_gemini_json(sys_prompt_items, payload_items)
                    if isinstance(chunk_res, dict):
                        for key, trans_map in chunk_res.items():
                            original_stem = index_to_stem.get(str(key)) or (
                                key if key in unique_stems else None
                            )
                            if original_stem and isinstance(trans_map, dict):
                                if "translations" in trans_map and isinstance(
                                    trans_map["translations"], dict
                                ):
                                    trans_map = trans_map["translations"]
                                stem_translations.setdefault(original_stem, {}).update(
                                    normalize_lang_dict(trans_map)
                                )

                    saved_now = apply_translations_and_save(
                        guide_rows,
                        source_lang,
                        active_targets,
                        loc_translations,
                        group_translations,
                        stem_translations,
                    )
                    print(
                        f"      ✅ Paket {b_idx}/{total_batches} gesichert ({saved_now} Zeilen | Budget: {SPENT_EUR:.4f} €)."
                    )

        # STUFE 3B: SPIEL-BESCHREIBUNG, STATUS-ERKLÄRUNG, GUIDE_TIP & LANG (JETZT MIT CHUNKING!)
        fresh_g = execute_with_retry(
            supabase.table("games")
            .select("beschreibung, status_explanation_localized")
            .eq("id", game_id)
            .limit(1)
        )
        fresh_row = (fresh_g.data or [game])[0]
        desc_map = (
            dict(fresh_row.get("beschreibung") or {})
            if isinstance(fresh_row.get("beschreibung"), dict)
            else {}
        )
        exp_map = (
            dict(fresh_row.get("status_explanation_localized") or {})
            if isinstance(fresh_row.get("status_explanation_localized"), dict)
            else {}
        )

        desc_de = str(desc_map.get("de") or "").strip()
        desc_en = str(desc_map.get("en") or "").strip()
        exp_de = str(exp_map.get("de") or "").strip()
        exp_en = str(exp_map.get("en") or "").strip()

        missing_desc_langs = [
            lg
            for lg in active_targets
            if (desc_de or desc_en) and not str(desc_map.get(lg) or "").strip()
        ]
        missing_exp_langs = [
            lg
            for lg in active_targets
            if (exp_de or exp_en) and not str(exp_map.get(lg) or "").strip()
        ]

        if missing_desc_langs or missing_exp_langs:
            print(
                f"📖 Übersetze Beschreibung ({len(missing_desc_langs)} Spr.) & Kurz-Status ({len(missing_exp_langs)} Spr.)..."
            )
            for lang_slice in chunk_langs(active_targets):
                slice_desc = [lg for lg in missing_desc_langs if lg in lang_slice]
                slice_exp = [lg for lg in missing_exp_langs if lg in lang_slice]
                if not slice_desc and not slice_exp:
                    continue
                meta_res = call_gemini_json(
                    f"Translate the editorial trophy guide description (`beschreibung`) and short status summary (`status_explanation`) "
                    f"for '{game_title}' 1:1 into `target_langs`. Return strictly JSON with keys `beschreibung` and `status_explanation`.",
                    {
                        "beschreibung": {
                            "de": desc_de,
                            "en": desc_en,
                            "target_langs": slice_desc,
                        },
                        "status_explanation": {
                            "de": exp_de,
                            "en": exp_en,
                            "target_langs": slice_exp,
                        },
                    },
                )
                if isinstance(meta_res, dict):
                    for raw_lg, val in (meta_res.get("beschreibung") or {}).items():
                        norm_lg = normalize_lang_key(raw_lg)
                        if (
                            norm_lg in active_targets
                            and val
                            and not str(desc_map.get(norm_lg) or "").strip()
                        ):
                            desc_map[norm_lg] = str(val).strip()

                    for raw_lg, val in (
                        meta_res.get("status_explanation") or {}
                    ).items():
                        norm_lg = normalize_lang_key(raw_lg)
                        if (
                            norm_lg in active_targets
                            and val
                            and not str(exp_map.get(norm_lg) or "").strip()
                        ):
                            exp_map[norm_lg] = str(val).strip()

            execute_with_retry(
                supabase.table("games")
                .update(
                    {"beschreibung": desc_map, "status_explanation_localized": exp_map}
                )
                .eq("id", game_id)
            )

        # Kurz-Tipps (guide_tip) & Lang-Tipps ("Guide-Tip-lang")
        for tip_col, label in (
            ("guide_tip", "Kurz-Tipps"),
            ("Guide-Tip-lang", "Lang-Tipps"),
        ):
            tips_to_translate = []
            static_updates = []

            for ach in achievements:
                tid = str(ach.get("platform_achievement_id")).strip()
                raw_val = ach.get(tip_col)
                if isinstance(raw_val, str) and raw_val.strip().startswith("{"):
                    try:
                        raw_val = json.loads(raw_val)
                    except Exception:
                        raw_val = {}
                tip_map = dict(raw_val) if isinstance(raw_val, dict) else {}
                tip_de = str(tip_map.get("de") or "").strip()
                tip_en = str(tip_map.get("en") or "").strip()
                if not (tip_de or tip_en):
                    continue

                missing_t = [
                    lg
                    for lg in active_targets
                    if not str(tip_map.get(lg) or "").strip()
                ]
                if not missing_t:
                    continue

                if tip_col == "guide_tip":
                    low_de = tip_de.lower()
                    if (
                        low_de == STATIC_STORY_TIP["de"].lower()
                        or tip_en.lower() == STATIC_STORY_TIP["en"].lower()
                    ):
                        for lg in missing_t:
                            if STATIC_STORY_TIP.get(lg):
                                tip_map[lg] = STATIC_STORY_TIP[lg]
                        ach[tip_col] = tip_map
                        static_updates.append((tid, tip_map))
                        continue
                    if (
                        low_de == STATIC_COLLECTIBLE_TIP["de"].lower()
                        or tip_en.lower() == STATIC_COLLECTIBLE_TIP["en"].lower()
                    ):
                        for lg in missing_t:
                            if STATIC_COLLECTIBLE_TIP.get(lg):
                                tip_map[lg] = STATIC_COLLECTIBLE_TIP[lg]
                        ach[tip_col] = tip_map
                        static_updates.append((tid, tip_map))
                        continue
                    if low_de.rstrip(".!") == STATIC_SERVERTOT_TIP["de"].lower().rstrip(
                        ".!"
                    ) or tip_en.lower().rstrip(".!") == STATIC_SERVERTOT_TIP[
                        "en"
                    ].lower().rstrip(
                        ".!"
                    ):
                        for lg in missing_t:
                            if STATIC_SERVERTOT_TIP.get(lg):
                                tip_map[lg] = STATIC_SERVERTOT_TIP[lg]
                        ach[tip_col] = tip_map
                        static_updates.append((tid, tip_map))
                        continue

                tips_to_translate.append(
                    {
                        "trophy_id": tid,
                        "de": tip_de,
                        "en": tip_en,
                        "target_langs": missing_t,
                        "trophy_names": ach.get("trophy_name") or {},
                    }
                )

            if static_updates:
                print(
                    f"⚡ {len(static_updates)} Standard-{label} deterministisch in 0ms übersetzt..."
                )
                for tid, t_map in static_updates:
                    execute_with_retry(
                        supabase.table("game_achievements")
                        .update({tip_col: t_map})
                        .eq("game_id", game_id)
                        .eq("platform_achievement_id", tid)
                    )

            if tips_to_translate:
                print(
                    f"💡 Übersetze {len(tips_to_translate)} individuelle {label} (`{tip_col}`) via Gemini..."
                )
                for lang_slice in chunk_langs(active_targets):
                    slice_items = [
                        {
                            **item,
                            "target_langs": sorted(
                                set(item["target_langs"]) & set(lang_slice)
                            ),
                        }
                        for item in tips_to_translate
                        if set(item["target_langs"]) & set(lang_slice)
                    ]
                    for i in range(0, len(slice_items), TIP_BATCH_SIZE):
                        chunk = slice_items[i : i + TIP_BATCH_SIZE]
                        payload_tips = {item["trophy_id"]: item for item in chunk}
                        sys_prompt_tips = (
                            f"Translate each trophy tip for '{game_title}' strictly 1:1 into `target_langs`.\n"
                            "Do NOT invent new tips or alter the strategy. Use official localized trophy/item names from `trophy_names`.\n"
                            "Return a JSON object mapping each `trophy_id` key to `{lang: translated_tip}`."
                        )
                        tip_res = call_gemini_json(sys_prompt_tips, payload_tips)
                        if isinstance(tip_res, dict):
                            for item in chunk:
                                tid = item["trophy_id"]
                                translations = tip_res.get(tid) or (
                                    tip_res
                                    if len(chunk) == 1
                                    and any(lg in tip_res for lg in lang_slice)
                                    else {}
                                )
                                if (
                                    not isinstance(translations, dict)
                                    or not translations
                                ):
                                    continue
                                ach = ach_by_id[tid]
                                current_map = (
                                    dict(ach.get(tip_col))
                                    if isinstance(ach.get(tip_col), dict)
                                    else {}
                                )
                                for raw_lg, val in translations.items():
                                    lg = normalize_lang_key(raw_lg)
                                    if (
                                        lg in active_targets
                                        and val
                                        and not str(current_map.get(lg) or "").strip()
                                    ):
                                        current_map[lg] = str(val).strip()
                                ach[tip_col] = current_map
                                execute_with_retry(
                                    supabase.table("game_achievements")
                                    .update({tip_col: current_map})
                                    .eq("game_id", game_id)
                                    .eq("platform_achievement_id", tid)
                                )

    except QuotaExhaustedError as q_err:
        print(
            f"\n⚠️ Lauf kontrolliert pausiert ({q_err}). Alle bisherigen Pakete sind in Supabase gespeichert!"
        )
        return False

    # STUFE 4: VOLLSTÄNDIGKEITS-PRÜFUNG & STATUS-VERGABE
    rpc_auto_publish = AUTO_PUBLISH and (not use_drip_feed)
    print(
        f"🏁 Stufe 4 (Prüfung | Ziel-Status: {'READY' if use_drip_feed else 'PUBLISHED'} | Budget: {SPENT_EUR:.4f} €):"
    )

    for lg in active_targets:
        if lg not in WEBSITE_SUPPORTED_LOCALES:
            print(
                f"   [{lg.upper()}] 💾 Texte in DB gespeichert (Locale noch nicht im Website-Router aktiv)"
            )
            continue

        chk = execute_with_retry(
            supabase.rpc(
                "tb_check_and_publish_locale",
                {
                    "p_game_id": game_id,
                    "p_target_lang": lg,
                    "p_auto_publish": rpc_auto_publish,
                },
            )
        )
        res_data = chk.data or {}
        ok = res_data.get("ok")
        missing_total = res_data.get("total_missing")
        details = res_data.get("missing")

        if ok and AUTO_PUBLISH:
            if use_drip_feed:
                set_game_guide_status(game_id, lg, "READY")
                status_icon = "⏳ READY (Warteschlange für Drip-Feed, 0 Lücken)"
            else:
                status_icon = "✅ PUBLISHED (Sofort live, 0 Lücken)"
        elif ok:
            status_icon = "✅ GEPRÜFT (0 Lücken)"
        else:
            status_icon = f"⚠️ Noch {missing_total} Lücken: {details}"

        print(f"   [{lg.upper()}] {status_icon}")

    return True


if __name__ == "__main__":
    arg = sys.argv[1].strip() if len(sys.argv) > 1 else ""
    if arg in WAVES:
        target_langs = WAVES[arg]
        single_game_id = sys.argv[2].strip() if len(sys.argv) > 2 else ""
    else:
        target_langs = WAVES.get(ACTIVE_WAVE, WAVES["wave2"])
        single_game_id = arg

    if single_game_id:
        run_pipeline_for_game(single_game_id, target_langs)
    else:
        queue = fetch_published_games_queue(target_langs)
        print(
            f"🚀 {len(queue)} veröffentlichte Spiele in der Queue für {target_langs}."
        )
        for idx, g in enumerate(queue, start=1):
            t_map = g.get("spieltitel") if isinstance(g.get("spieltitel"), dict) else {}
            t_name = t_map.get("de") or t_map.get("en") or g["id"]
            print(f"\n[{idx}/{len(queue)}] Bearbeite: {t_name} ({g.get('spiel_typ')})")
            ok = run_pipeline_for_game(g["id"], target_langs)
            if not ok:
                print(
                    "🛑 Skript beendet (Quota-/Budget-Pause). Beim nächsten Start geht es genau hier weiter!"
                )
                break
