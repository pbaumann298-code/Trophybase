#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
06.2_ai_trophy_desc_translator.py
Spiel-atomarer AI-Übersetzer für fehlende Sony-Trophäenbeschreibungen (trophy_desc -> ai_translation).
Unterstützt nativ Google Cloud VERTEX AI (zum Ziehen des 269-€-Cloud-Startguthabens!) sowie AI Studio Fallback.

.env Konfiguration für Vertex AI (empfohlen für Startguthaben):
  VERTEX_PROJECT_ID=deine-gcp-projekt-id
  VERTEX_LOCATION=us-central1
  GOOGLE_APPLICATION_CREDENTIALS=C:\\Temp\\TrophyBase\\vertex-sa.json
  GEMINI_MODEL=gemini-3.8-flash

Schnelltest (prüft, ob wirklich Vertex AI genutzt wird):
  python "06.2_ai_trophy_desc_translator.py" --test-vertex

Produktivlauf über Vertex AI (mit 5 parallelen Workern):
  python "06.2_ai_trophy_desc_translator.py" --require-vertex --published-only --langs de --workers 5
  python "06.2_ai_trophy_desc_translator.py" --require-vertex --all-catalog --langs de,fr,es,it,pt,nl,pl --workers 6
"""

import argparse
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from dotenv import find_dotenv, load_dotenv
from google import genai
from google.genai import types
from supabase import Client, create_client

_ROOT_ENV = Path(r"C:\Temp\TrophyBase\.env")
if _ROOT_ENV.exists():
    load_dotenv(_ROOT_ENV, override=True)
else:
    _parent_envs = [p / ".env" for p in Path(__file__).resolve().parents if (p / ".env").exists()]
    load_dotenv(_parent_envs[0] if _parent_envs else find_dotenv(), override=True)


def clean_env(name: str, default: str = "") -> str:
    val = os.getenv(name, default) or default
    return val.strip().strip('"').strip("'").strip()


MODEL_NAME = clean_env("VERTEX_MODEL") or clean_env("GEMINI_FLASH_LITE_MODEL") or clean_env("GEMINI_MODEL", "gemini-3.8-flash")
SUPABASE_URL = clean_env("SUPABASE_URL") or clean_env("VITE_SUPABASE_URL")
SUPABASE_KEY = clean_env("SUPABASE_SERVICE_ROLE_KEY")

VERTEX_PROJECT_ID = clean_env("VERTEX_PROJECT_ID") or clean_env("GOOGLE_CLOUD_PROJECT")
VERTEX_LOCATION = clean_env("VERTEX_LOCATION", "us-central1")
SA_KEY_PATH = clean_env("GOOGLE_APPLICATION_CREDENTIALS")
API_KEY = clean_env("GEMINI_API_KEY") or clean_env("GOOGLE_API_KEY")

SUPPORTED_UI_LANGS = [
    "de", "fr", "es", "it", "pt", "nl", "pl",
    "ru", "sv", "fi", "ja", "ko", "zh-hans", "zh-hant", "ar",
]

SYSTEM_INSTRUCTION = """Du bist ein präziser Videospiel-Lokalisierer für PlayStation-Trophäenbeschreibungen auf TrophyBase.
Übersetze jede englische Trophäenbeschreibung idiomatisch, knapp und spielgetreu in die angeforderten Zielsprachen.

REGELN:
1. Antworte AUSSCHLIESSLICH als valides JSON-Objekt im Format:
   {"<idx>": {"<lang>": "<übersetzung>", ...}, ...}
2. Eigennamen von Charakteren, Bossen, Orten oder Spielmodi sinnvoll beibehalten, sofern kein etablierter Standardbegriff existiert.
3. Keine Erklärungen, keine Tipps, kein Markdown – nur die reine Übersetzung der Trophäenbedingung!
"""


def build_genai_client(require_vertex: bool) -> tuple[genai.Client, bool]:
    """Initialisiert bevorzugt Vertex AI (zieht GCP-Startguthaben), sonst AI Studio."""
    if VERTEX_PROJECT_ID:
        if SA_KEY_PATH:
            sa_file = Path(SA_KEY_PATH)
            if not sa_file.exists():
                sys.exit(f"❌ GOOGLE_APPLICATION_CREDENTIALS Datei nicht gefunden: {sa_file}")
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(sa_file)
        client = genai.Client(
            vertexai=True,
            project=VERTEX_PROJECT_ID,
            location=VERTEX_LOCATION,
        )
        return client, True

    if require_vertex:
        sys.exit(
            "❌ --require-vertex ist aktiv, aber VERTEX_PROJECT_ID fehlt in C:\\Temp\\TrophyBase\\.env!\n"
            "   Bitte VERTEX_PROJECT_ID und GOOGLE_APPLICATION_CREDENTIALS eintragen."
        )

    if not API_KEY:
        sys.exit("❌ Weder VERTEX_PROJECT_ID noch GEMINI_API_KEY in .env gefunden!")

    return genai.Client(api_key=API_KEY), False


def parse_jsonb_dict(val: Any) -> dict[str, Any]:
    if isinstance(val, dict):
        return dict(val)
    if isinstance(val, str) and val.strip().startswith("{"):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return {}


def priority_key(game: dict[str, Any]) -> tuple[int, int, str]:
    is_pub = 0 if game.get("is_published") else 1
    st = str(game.get("spiel_typ") or "").lower()
    if "evergreen" in st:
        tier = 0
    elif "premium" in st:
        tier = 1
    elif "standard" in st:
        tier = 2
    else:
        tier = 3
    title_obj = parse_jsonb_dict(game.get("spieltitel"))
    title = str(title_obj.get("de") or title_obj.get("en") or "")
    return (is_pub, tier, title.lower())


def fetch_all_games(sb: Client, published_only: bool) -> list[dict[str, Any]]:
    games: list[dict[str, Any]] = []
    offset = 0
    page_size = 1000
    while True:
        q = sb.table("games").select("id, spieltitel, spiel_typ, is_published").range(offset, offset + page_size - 1)
        if published_only:
            q = q.eq("is_published", True)
        res = q.execute()
        batch = res.data or []
        games.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    games.sort(key=priority_key)
    return games


def translate_batch_with_gemini(
    ai_client: genai.Client,
    game_title: str,
    items: list[dict[str, Any]],
) -> dict[str, dict[str, str]]:
    payload = {
        "game": game_title,
        "items": {
            str(it["idx"]): {
                "trophy_name_en": it["name_en"],
                "trophy_desc_en": it["desc_en"],
                "target_langs": it["missing_langs"],
            }
            for it in items
        },
    }
    resp = ai_client.models.generate_content(
        model=MODEL_NAME,
        contents=json.dumps(payload, ensure_ascii=False),
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            temperature=0.15,
        ),
    )
    raw = (resp.text or "{}").strip()
    parsed = json.loads(raw)
    return parsed if isinstance(parsed, dict) else {}


def process_single_game(
    g: dict[str, Any],
    ai_client: genai.Client,
    target_langs: list[str],
    batch_size: int,
    tm_cache: dict[tuple[str, str], str],
    tm_lock: threading.Lock,
) -> tuple[bool, str, int, int]:
    """Übersetzt ein komplettes Spiel atomar. Eigenständiger Supabase-Client pro Thread."""
    sb_local: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    game_id = g["id"]
    title_dict = parse_jsonb_dict(g.get("spieltitel"))
    game_title = str(title_dict.get("de") or title_dict.get("en") or game_id)

    res = (
        sb_local.table("game_achievements")
        .select("platform_achievement_id, trophy_name, trophy_desc, ai_translation")
        .eq("game_id", game_id)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return (False, game_title, 0, 0)

    pending_rows: list[dict[str, Any]] = []
    local_harvest: dict[tuple[str, str], str] = {}

    for r in rows:
        desc_map = parse_jsonb_dict(r.get("trophy_desc"))
        ai_map = parse_jsonb_dict(r.get("ai_translation"))
        name_map = parse_jsonb_dict(r.get("trophy_name"))
        en_desc = str(desc_map.get("en") or "").strip()
        if len(en_desc) < 3:
            continue
        en_key = en_desc.lower()

        missing_for_row: list[str] = []
        for lang in target_langs:
            sony_val = str(desc_map.get(lang) or "").strip()
            ai_val = str(ai_map.get(lang) or "").strip()
            if sony_val and sony_val != en_desc:
                local_harvest[(en_key, lang)] = sony_val
            elif ai_val and ai_val != en_desc:
                local_harvest[(en_key, lang)] = ai_val
            else:
                missing_for_row.append(lang)

        if missing_for_row:
            pending_rows.append(
                {
                    "platform_achievement_id": r["platform_achievement_id"],
                    "name_en": str(name_map.get("en") or "").strip(),
                    "desc_en": en_desc,
                    "en_key": en_key,
                    "existing_ai": ai_map,
                    "missing_langs": missing_for_row,
                }
            )

    if local_harvest:
        with tm_lock:
            tm_cache.update(local_harvest)

    if not pending_rows:
        return (False, game_title, 0, 0)

    # Deduplizierung innerhalb des Spiels + Abgleich mit Cross-Game Translation Memory
    resolved_per_row: dict[str, dict[str, str]] = {}
    unique_ai_requests: dict[str, dict[str, Any]] = {}

    with tm_lock:
        for item in pending_rows:
            pid = str(item["platform_achievement_id"])
            resolved_per_row[pid] = dict(item["existing_ai"])
            still_missing: list[str] = []
            for lang in item["missing_langs"]:
                cached = tm_cache.get((item["en_key"], lang))
                if cached:
                    resolved_per_row[pid][lang] = cached
                else:
                    still_missing.append(lang)
            if still_missing:
                ek = item["en_key"]
                if ek not in unique_ai_requests:
                    unique_ai_requests[ek] = {
                        "en_key": ek,
                        "name_en": item["name_en"],
                        "desc_en": item["desc_en"],
                        "missing_langs": list(still_missing),
                    }
                else:
                    existing_langs = unique_ai_requests[ek]["missing_langs"]
                    for lang in still_missing:
                        if lang not in existing_langs:
                            existing_langs.append(lang)

    to_ask_ai = [
        {"idx": idx, **req}
        for idx, req in enumerate(unique_ai_requests.values())
    ]

    newly_translated: dict[tuple[str, str], str] = {}
    for start in range(0, len(to_ask_ai), batch_size):
        chunk = to_ask_ai[start : start + batch_size]
        ai_result = translate_batch_with_gemini(ai_client, game_title, chunk)
        for req in chunk:
            ans = ai_result.get(str(req["idx"])) or {}
            for lang in req["missing_langs"]:
                tr = str(ans.get(lang) or "").strip()
                if not tr:
                    raise RuntimeError(f"Leere Übersetzung ({lang}) bei '{req['desc_en'][:40]}'")
                newly_translated[(req["en_key"], lang)] = tr

    if newly_translated:
        with tm_lock:
            tm_cache.update(newly_translated)

    # Alle Zeilen des Spiels vervollständigen & geschlossen schreiben
    for item in pending_rows:
        pid = str(item["platform_achievement_id"])
        for lang in item["missing_langs"]:
            if lang not in resolved_per_row[pid]:
                resolved_per_row[pid][lang] = newly_translated[(item["en_key"], lang)]
        merged_ai = resolved_per_row[pid]
        locales_sorted = sorted(merged_ai.keys())
        (
            sb_local.table("game_achievements")
            .update(
                {
                    "ai_translation": merged_ai,
                    "ai_translated_locales": locales_sorted,
                    "is_auto_translated": True,
                }
            )
            .eq("game_id", game_id)
            .eq("platform_achievement_id", pid)
            .execute()
        )

    status_badge = "🟢 LIVE" if g.get("is_published") else "📦 KATALOG"
    return (True, f"{status_badge} [{game_title}]", len(pending_rows), len(to_ask_ai))


def main() -> None:
    parser = argparse.ArgumentParser(description="Spiel-atomarer AI-Übersetzer (Vertex AI + Startguthaben ready)")
    parser.add_argument("--test-vertex", action="store_true", help="Macht 1 Mini-Testcall über Vertex AI und beendet sich")
    parser.add_argument("--require-vertex", action="store_true", help="Erzwingt Vertex AI (bricht ab, falls nur AI-Studio-Key aktiv wäre)")
    parser.add_argument("--langs", default="de", help="Kommagetrennte Zielsprachen oder 'all' (Standard: de)")
    parser.add_argument("--published-only", action="store_true", default=False, help="Nur bereits live veröffentlichte Spiele")
    parser.add_argument("--all-catalog", action="store_true", default=False, help="Auch unveröffentlichte Katalog-Spiele einbeziehen")
    parser.add_argument("--limit-games", type=int, default=0, help="Maximale Anzahl zu übersetzender Spiele (0 = unbegrenzt)")
    parser.add_argument("--batch-size", type=int, default=60, help="Max. eindeutige Sätze pro Gemini-Call (Standard: 60)")
    parser.add_argument("--workers", type=int, default=0, help="Parallele Spiele-Worker (Standard: 4 bei Vertex AI, 1 bei API-Key)")
    args = parser.parse_args()

    ai_client, is_vertex = build_genai_client(require_vertex=(args.require_vertex or args.test_vertex))

    if is_vertex:
        print(
            f"☁️  MODUS: GOOGLE CLOUD VERTEX AI AKTIV!\n"
            f"   Projekt:  {VERTEX_PROJECT_ID}\n"
            f"   Region:   {VERTEX_LOCATION}\n"
            f"   Keyfile:  {SA_KEY_PATH or '(gcloud ADC)'}\n"
            f"   Modell:   {MODEL_NAME}\n"
            f"   Abrechnung zieht direkt vom Google-Cloud-Startguthaben (269 €)!"
        )
    else:
        print(f"🔑 MODUS: Google AI Studio API-Key (NICHT Vertex-Startguthaben) | Modell: {MODEL_NAME}")

    if args.test_vertex:
        print("\n🧪 Sende 1-Satz-Testanfrage an Vertex AI...")
        test_res = translate_batch_with_gemini(
            ai_client,
            "Five Nights at Freddy's",
            [{"idx": 0, "name_en": "One Night at Freddy's", "desc_en": "Survive the 1st night.", "missing_langs": ["de", "fr"]}],
        )
        print(f"✅ Antwort von Vertex AI ({MODEL_NAME}): {json.dumps(test_res, ensure_ascii=False)}")
        print("🎉 Perfekt eingerichtet! Du kannst jetzt den großen Lauf starten.")
        return

    if not SUPABASE_URL or not SUPABASE_KEY:
        sys.exit("❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!")

    if args.langs.strip().lower() == "all":
        target_langs = list(SUPPORTED_UI_LANGS)
    else:
        target_langs = [x.strip().lower() for x in args.langs.split(",") if x.strip().lower() in SUPPORTED_UI_LANGS]

    if not target_langs:
        sys.exit(f"❌ Keine gültigen Zielsprachen angegeben. Erlaubt: {', '.join(SUPPORTED_UI_LANGS)}")

    workers = args.workers if args.workers > 0 else (4 if is_vertex else 1)
    published_only = True if (args.published_only or not args.all_catalog) else False

    sb_main: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    games = fetch_all_games(sb_main, published_only=published_only)
    if args.limit_games > 0:
        # Hinweis: Filterung auf tatsächlich offene Spiele erfolgt beim Durchlauf; bei festem Limit arbeiten wir sequenziell genauer
        pass

    print(f"\n📚 {len(games)} Spiele geladen | Sprachen: {target_langs} | Parallele Worker: {workers}\n")

    tm_cache: dict[tuple[str, str], str] = {}
    tm_lock = threading.Lock()
    completed_games = 0
    updated_trophies_total = 0
    start_ts = time.time()

    if workers <= 1 or args.limit_games > 0:
        for g in games:
            try:
                did_work, label, row_cnt, ai_cnt = process_single_game(
                    g, ai_client, target_langs, args.batch_size, tm_cache, tm_lock
                )
            except Exception as exc:
                print(f"  ⚠️ Fehler bei Spiel {g.get('id')}: {exc}")
                continue
            if did_work:
                completed_games += 1
                updated_trophies_total += row_cnt
                print(f"  [{completed_games}] {label}: {row_cnt} Trophäen gespeichert ({ai_cnt} AI-Sätze nötig)")
                if args.limit_games and completed_games >= args.limit_games:
                    break
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(process_single_game, g, ai_client, target_langs, args.batch_size, tm_cache, tm_lock): g
                for g in games
            }
            for fut in as_completed(futures):
                g = futures[fut]
                try:
                    did_work, label, row_cnt, ai_cnt = fut.result()
                except Exception as exc:
                    print(f"  ⚠️ Fehler bei Spiel {g.get('id')}: {exc}")
                    continue
                if did_work:
                    completed_games += 1
                    updated_trophies_total += row_cnt
                    elapsed_min = max((time.time() - start_ts) / 60.0, 0.01)
                    print(
                        f"  [{completed_games}] {label}: {row_cnt} Trophäen "
                        f"({ai_cnt} AI-Sätze | Cache: {len(tm_cache)} | {completed_games / elapsed_min:.1f} Spiele/Min.)"
                    )

    print(f"\n✅ Fertig! {completed_games} komplette Spiele ({updated_trophies_total} Trophäen) in ai_translation gespeichert.")


if __name__ == "__main__":
    main()
