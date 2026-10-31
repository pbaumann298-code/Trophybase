#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
06.1_de_en_veredler.py (Kombinierte DE + EN Sparse-JSON Edition)
Vereint 06.1 (DE) und 06.2 (EN) in einem einzigen Durchgang:
- Generiert Spielbeschreibung (DE + EN) und Trophäen-Tipps (DE + EN) in 1 Call!
- Spart ~50% Input-Tokens und 1 kompletten DB-Durchlauf gegenüber getrennten Skripten.
- Unterstützt den neuen Spieltyp 'easy_platin'.
- 'Servertot' überschreibt spiel_typ hart als Totenschein und setzt is_indexable = False.
"""

import os
import json
import re
import sys
import time
from typing import Any, Optional
from google import genai
from google.genai import types
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
PAGE_LIMIT = 200
MAX_TROPHIES_PER_CALL = 75  # Ideale Batch-Größe für gleichzeitige DE+EN Ausgabe
DELAY_BETWEEN_CALLS_SEC = 0.25

ALLOWED_SPIEL_TYPEN = [
    "Evergreen",
    "Premium",
    "Standard",
    "easy_platin",
    "Servertot",
    "Evergreen, easy_platin",
    "Evergreen, Servertot",
    "Premium, easy_platin",
    "Premium, Servertot",
    "Standard, easy_platin",
    "Standard, Quickwin",
    "Standard, Servertot",
]

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in .env")
if not API_KEY:
    sys.exit("❌ Fehler: GEMINI_API_KEY fehlt in .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
client = genai.Client(api_key=API_KEY)

SERVERTOT_RE = re.compile(
    r"(server\s*(sind\s+|wurden\s+)?(abgeschaltet|offline|down|geschlossen)|"
    r"serverabschaltung|wegen\s+abgeschalteter\s+server|"
    r"platin\s+(ist\s+)?nicht\s+mehr\s+(möglich|machbar|erreichbar|erspielbar)|"
    r"nicht\s+mehr\s+erspielbar|"
    r"servers?\s*(have\s+been\s+|are\s+)?(shut\s*down|offline|closed|discontinued)|"
    r"unobtainable\s+due\s+to\s+server)",
    re.I,
)


def parse_dict_safely(val: Any) -> dict:
    if isinstance(val, dict):
        return dict(val)
    if isinstance(val, str):
        cleaned = val.strip()
        if cleaned.startswith("{"):
            try:
                parsed = json.loads(cleaned)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass
    return {}


def extract_lang_text(val: Any, lang: str, fallback: str = "en") -> str:
    if not val:
        return ""
    parsed = parse_dict_safely(val)
    if parsed:
        return str(
            parsed.get(lang) or parsed.get(fallback) or next(iter(parsed.values()), "")
        ).strip()
    return str(val).strip()


SYSTEM_INSTRUCTION = """Du bist ein zweisprachiger (DE + EN) Leitfaden-Redakteur für TrophyBase.
Antworte AUSSCHLIESSLICH als valides, kompaktes JSON-Objekt.

AUSGABE-FORMAT (SPARSE JSON):
{
  "desc_de": "Prägnante deutsche Spielbeschreibung (3-5 Sätze zu Genre, Gameplay-Loop, Platin-Struktur) oder null",
  "desc_en": "Punchy, idiomatic English game description (3-5 sentences on genre, core loop, platinum structure) or null",
  "servertot": false,
  "t": {
    "<trophy_id>": [["<tag_code>", ...], "<guide_tip_de_oder_null>", "<guide_tip_en_oder_null>"]
  }
}

KRITISCHE SPARSE-REGEL FÜR "t":
- Nimm eine <trophy_id> NUR DANN in "t" auf, wenn sie mindestens einen Tag-Code ODER einen echten Tipp hat!
- Hat eine Trophäe KEINE Tags und KEINEN Mehrwert-Tipp, LASS SIE KOMPLETT WEG!

TAG-CODES (Array an Index 0):
- "s": story_automatic (unvermeidbar im Spielverlauf; bei Verzweigungen weglassen!)
- "m": missable (nur wenn neuer Spieldurchgang bei Verpassen nötig; bei Kapitelauswahl weglassen!)
- "c": collectible (Sammelaufgabe)
- "o": online (echter Online-/Koop-Zwang; Offline-Bot-Matches sind KEIN "o"!)
- "b": buggy (verifizierter Trophäen-Bug)
- "u": unobtainable_server_closed (wegen abgeschalteter Server permanent unmöglich -> setze dann auch "servertot": true)

REGELN FÜR DIE TIPPS (DE an Index 1, EN an Index 2):
1. TAUTOLOGIE-VERBOT: Niemals die Trophäen-Bedingung wiederholen oder umformulieren. Keine Floskeln ("Um diese Trophäe zu erhalten..." / "To unlock this trophy..."). Fehlt echtes Detailwissen (Taktik, Fundort, Trigger): ZWINGEND beide Tipps auf null setzen!
2. Wenn Tag "s" gesetzt ist (und nicht "u"): Beide Tipps einfach auf null setzen (unser System setzt den DE/EN Standard-Story-Text automatisch!).
3. Wenn Tag "c" gesetzt ist und kein kurzer Ingame-Trick (z.B. Kartenkauf) existiert: Beide Tipps einfach auf null setzen (unser System setzt den DE/EN Sammelguide-Verweis automatisch!).
4. Andere Trophäen mit Mehrwert: 1-3 präzise, lösungsorientierte Sätze auf Deutsch (Index 1) UND idiomatischem Gaming-Englisch (Index 2, nutze die englischen Originalbegriffe aus en_n / en_d!)."""


def fetch_all_game_trophies(game_id: str) -> list[dict]:
    try:
        res = (
            supabase.table("game_achievements")
            .select(
                "platform_achievement_id, trophy_name, trophy_desc, trophy_type, trophy_gruppe, guide_tip"
            )
            .eq("game_id", game_id)
            .order("platform_achievement_id")
            .execute()
        )
        return res.data or []
    except Exception as e:
        print(f"❌ DB-Fehler bei Trophäen für {game_id}: {e}")
        return []


def bulk_update_achievements(rows_to_update: list[dict]):
    if not rows_to_update:
        return
    chunk_size = 250
    for i in range(0, len(rows_to_update), chunk_size):
        chunk = rows_to_update[i : i + chunk_size]
        try:
            supabase.rpc(
                "tb_bulk_update_achievements_refinement", {"p_rows": chunk}
            ).execute()
        except Exception:
            for r in chunk:
                supabase.table("game_achievements").update(
                    {
                        "is_story_related": r["is_story_related"],
                        "is_missable": r["is_missable"],
                        "is_online": r["is_online"],
                        "guide_tip": r["guide_tip"],
                    }
                ).eq("game_id", r["game_id"]).eq(
                    "platform_achievement_id", r["platform_achievement_id"]
                ).execute()


def call_gemini_dual_sparse(
    title_de: str,
    title_en: str,
    hardware: str,
    trophies_chunk: list[dict],
    need_desc_de: bool,
    need_desc_en: bool,
    max_retries: int = 5,
) -> Optional[dict]:
    compact_list = []
    for t in trophies_chunk:
        tid = str(t["platform_achievement_id"]).strip()
        n_de = extract_lang_text(t.get("trophy_name"), "de", "en")
        n_en = extract_lang_text(t.get("trophy_name"), "en", "de")
        d_de = extract_lang_text(t.get("trophy_desc"), "de", "en")
        d_en = extract_lang_text(t.get("trophy_desc"), "en", "de")

        item = {"id": tid, "de_n": n_de, "de_d": d_de}
        # Englische Sony-Namen nur mitsenden, wenn sie von DE abweichen (spart Input-Tokens!)
        if n_en != n_de or d_en != d_de:
            item["en_n"] = n_en
            item["en_d"] = d_en
        compact_list.append(item)

    desc_hint = (
        f"desc_de={'GENERIEREN' if need_desc_de else 'null'}, "
        f"desc_en={'GENERIEREN' if need_desc_en else 'null'}"
    )
    user_prompt = (
        f"SPIEL (DE): {title_de} | GAME (EN): {title_en} ({hardware}) | {desc_hint}\n"
        f"TROPHÄEN ({len(compact_list)}):\n"
        f"{json.dumps(compact_list, ensure_ascii=False)}"
    )

    delay = 4.0
    for attempt in range(1, max_retries + 1):
        try:
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    temperature=0.0,
                    response_mime_type="application/json",
                ),
            )
            raw_text = (response.text or "{}").strip()
            return json.loads(raw_text)
        except Exception as e:
            err_str = str(e)
            if (
                any(
                    c in err_str
                    for c in ["503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "500"]
                )
                and attempt < max_retries
            ):
                print(
                    f"   ⏳ [Rate-Limit / Lastspitze] Warte {delay:.1f}s (Versuch {attempt}/{max_retries})..."
                )
                time.sleep(delay)
                delay = min(60.0, delay * 2.0)
            else:
                print(f"   ❌ Gemini-Fehler (Versuch {attempt}): {e}")
                return None
    return None


def apply_servertot_check(
    update_payload: dict, all_texts: list[str], explicit_flag: bool = False
) -> dict:
    """Totenschein: Überschreibt spiel_typ hart mit 'Servertot' und nimmt das Spiel aus dem Index."""
    combined = " ".join([t for t in all_texts if t])
    if explicit_flag or SERVERTOT_RE.search(combined):
        update_payload["spiel_typ"] = "Servertot"
        update_payload["is_indexable"] = False
    return update_payload


def format_prefixed_tip(
    raw_tip: str,
    lang: str,
    is_unobt: bool,
    is_miss: bool,
    is_onl: bool,
    is_bug: bool,
) -> str:
    clean_tip = raw_tip.strip()
    low = clean_tip.lower()
    prefixes = []

    if lang == "de":
        if is_unobt and "server" not in low:
            prefixes.append("Wegen Serverabschaltung nicht mehr möglich!")
        if is_miss and "verpassbar" not in low:
            prefixes.append("Verpassbar!")
        if is_onl and "online" not in low:
            prefixes.append("Online.")
        if is_bug and "verbuggt" not in low:
            prefixes.append("Verbuggt.")
    else:
        if is_unobt and "server" not in low:
            prefixes.append("No longer obtainable due to server shutdown!")
        if is_miss and "missable" not in low:
            prefixes.append("Missable!")
        if is_onl and "online" not in low:
            prefixes.append("Online.")
        if is_bug and "bug" not in low and "glitch" not in low:
            prefixes.append("Bugged.")

    p_str = f"{' '.join(prefixes)} " if prefixes else ""
    return f"{p_str}{clean_tip}".strip()


def run_refinement_pipeline():
    last_id = None
    total_processed = 0
    total_refined = 0

    print(f"🚀 Starte KOMBINIERTE DE+EN SPARSE-Veredelung (Modell: {MODEL_NAME})...\n")

    while True:
        query = (
            supabase.table("games")
            .select("id, spieltitel, beschreibung, hardware, status, spiel_typ")
            .eq("status->>trophies", "PROCESSED")
            .or_(
                "status->>refinement.is.null,status->>refinement.not.in.(VEREDELT,NO_TROPHIES)"
            )
            .in_("spiel_typ", ALLOWED_SPIEL_TYPEN)
            .order("id")
            .limit(PAGE_LIMIT)
        )

        if last_id:
            query = query.gt("id", last_id)

        records = query.execute().data or []
        if not records:
            print(
                f"\n🏁 Pipeline abgeschlossen: {total_processed} geprüft, {total_refined} zweisprachig (DE+EN) veredelt."
            )
            break

        for game in records:
            game_id = game["id"]
            last_id = game_id

            status_obj = parse_dict_safely(game.get("status"))
            if status_obj.get("refinement") in ("VEREDELT", "NO_TROPHIES"):
                continue

            total_processed += 1
            title_de = (
                extract_lang_text(game.get("spieltitel"), "de", "en")
                or "Unbenanntes Spiel"
            )
            title_en = extract_lang_text(game.get("spieltitel"), "en", "de") or title_de
            hardware = game.get("hardware") or "PlayStation"

            all_trophies = fetch_all_game_trophies(game_id)
            if not all_trophies:
                print(
                    f"  [-] {title_de} (ID: {game_id}): Keine Trophäen. Überspringe..."
                )
                status_obj["refinement"] = "NO_TROPHIES"
                supabase.table("games").update({"status": status_obj}).eq(
                    "id", game_id
                ).execute()
                continue

            total_batches = (
                len(all_trophies) + MAX_TROPHIES_PER_CALL - 1
            ) // MAX_TROPHIES_PER_CALL
            print(
                f"🎮 [{total_processed}] {title_de} ({len(all_trophies)} Trophäen in {total_batches} DE+EN Call(s))..."
            )

            game_success = True
            current_desc = parse_dict_safely(game.get("beschreibung")).copy()
            collected_texts = []
            server_shutdown_flag = False
            missable_count = 0
            online_count = 0
            bulk_ach_updates = []

            for i in range(0, len(all_trophies), MAX_TROPHIES_PER_CALL):
                chunk = all_trophies[i : i + MAX_TROPHIES_PER_CALL]
                need_desc_de = not bool(current_desc.get("de"))
                need_desc_en = not bool(current_desc.get("en"))

                res = call_gemini_dual_sparse(
                    title_de,
                    title_en,
                    hardware,
                    chunk,
                    need_desc_de,
                    need_desc_en,
                )
                if not isinstance(res, dict):
                    print("   ❌ Kein valides JSON von Gemini erhalten!")
                    game_success = False
                    break

                if res.get("servertot") is True:
                    server_shutdown_flag = True

                desc_de = res.get("desc_de") or res.get("desc")
                if need_desc_de and isinstance(desc_de, str) and desc_de.strip():
                    current_desc["de"] = desc_de.strip()
                    collected_texts.append(desc_de.strip())

                desc_en = res.get("desc_en")
                if need_desc_en and isinstance(desc_en, str) and desc_en.strip():
                    current_desc["en"] = desc_en.strip()
                    collected_texts.append(desc_en.strip())

                raw_t_map = res.get("t") if isinstance(res.get("t"), dict) else {}
                norm_t_map = {}
                for k, v in raw_t_map.items():
                    ks = str(k).strip()
                    norm_t_map[ks] = v
                    if ks.isdigit():
                        norm_t_map[str(int(ks))] = v

                for t in chunk:
                    tid = str(t["platform_achievement_id"]).strip()
                    hit = norm_t_map.get(tid) or (
                        norm_t_map.get(str(int(tid))) if tid.isdigit() else None
                    )

                    tags_list = []
                    raw_tip_de = None
                    raw_tip_en = None

                    if isinstance(hit, list) and len(hit) >= 1:
                        tags_list = hit[0] if isinstance(hit[0], list) else []
                        if len(hit) > 1 and isinstance(hit[1], str):
                            raw_tip_de = hit[1]
                        if len(hit) > 2 and isinstance(hit[2], str):
                            raw_tip_en = hit[2]
                    elif isinstance(hit, dict):
                        tags_list = hit.get("tags") or []
                        raw_tip_de = hit.get("tip_de") or hit.get("tip")
                        raw_tip_en = hit.get("tip_en")

                    tag_set = {str(x).lower().strip() for x in tags_list}
                    is_story = "s" in tag_set or "story" in tag_set
                    is_miss = "m" in tag_set or "missable" in tag_set
                    is_coll = "c" in tag_set or "collectible" in tag_set
                    is_onl = "o" in tag_set or "online" in tag_set
                    is_bug = "b" in tag_set or "buggy" in tag_set
                    is_unobt = "u" in tag_set or "unobtainable" in tag_set

                    if is_miss:
                        missable_count += 1
                    if is_onl:
                        online_count += 1
                    if is_unobt:
                        server_shutdown_flag = True

                    final_tip_de = None
                    final_tip_en = None

                    if is_story and not is_unobt:
                        final_tip_de = "Automatisch im Spielverlauf erhaltbar."
                        final_tip_en = (
                            "Unlocked automatically through story progression."
                        )
                    elif is_coll and not raw_tip_de and not is_unobt:
                        final_tip_de = "Sammelobjekt. Nutze für die exakten Fundorte bitte unseren separaten TrophyBase-Sammelguide."
                        final_tip_en = "Collectible. For exact locations, please refer to our separate TrophyBase collectible guide."
                    elif is_unobt and not raw_tip_de:
                        final_tip_de = "Wegen Serverabschaltung nicht mehr möglich."
                        final_tip_en = "No longer obtainable due to server shutdown."
                    else:
                        if raw_tip_de and raw_tip_de.strip():
                            final_tip_de = format_prefixed_tip(
                                raw_tip_de, "de", is_unobt, is_miss, is_onl, is_bug
                            )
                            collected_texts.append(final_tip_de)
                        if raw_tip_en and raw_tip_en.strip():
                            final_tip_en = format_prefixed_tip(
                                raw_tip_en, "en", is_unobt, is_miss, is_onl, is_bug
                            )
                            collected_texts.append(final_tip_en)

                    t_tip = parse_dict_safely(t.get("guide_tip")).copy()
                    if final_tip_de:
                        t_tip["de"] = final_tip_de
                    else:
                        t_tip.pop("de", None)

                    if final_tip_en:
                        t_tip["en"] = final_tip_en
                    else:
                        t_tip.pop("en", None)

                    bulk_ach_updates.append(
                        {
                            "game_id": game_id,
                            "platform_achievement_id": t["platform_achievement_id"],
                            "is_story_related": is_story,
                            "is_missable": is_miss,
                            "is_online": is_onl,
                            "guide_tip": t_tip if t_tip else None,
                        }
                    )

                if total_batches > 1:
                    time.sleep(DELAY_BETWEEN_CALLS_SEC)

            if game_success:
                bulk_update_achievements(bulk_ach_updates)

                status_obj["refinement"] = "VEREDELT"
                status_obj["refinement_en"] = "VEREDELT"
                status_obj.pop("refinement_reason", None)

                game_update_payload = {
                    "beschreibung": current_desc,
                    "status": status_obj,
                    "total_missable_trophies": missable_count,
                    "total_online_trophies": online_count,
                    "has_missable_trophies": missable_count > 0,
                    "has_online_trophies": online_count > 0,
                }

                game_update_payload = apply_servertot_check(
                    game_update_payload,
                    collected_texts
                    + [current_desc.get("de", ""), current_desc.get("en", "")],
                    explicit_flag=server_shutdown_flag,
                )

                supabase.table("games").update(game_update_payload).eq(
                    "id", game_id
                ).execute()
                total_refined += 1
                tips_de_cnt = sum(
                    1
                    for u in bulk_ach_updates
                    if u["guide_tip"] and u["guide_tip"].get("de")
                )
                tips_en_cnt = sum(
                    1
                    for u in bulk_ach_updates
                    if u["guide_tip"] and u["guide_tip"].get("en")
                )
                typ_info = (
                    " -> 💀 TOTENSCHEIN: UMGESTELLT AUF SERVERTOT!"
                    if game_update_payload.get("spiel_typ") == "Servertot"
                    and game.get("spiel_typ") != "Servertot"
                    else ""
                )
                print(
                    f"   ✅ [DE+EN VEREDELT] {title_de} (DE: {tips_de_cnt}, EN: {tips_en_cnt} Tipps){typ_info}"
                )
            else:
                status_obj["refinement"] = "FAILED"
                supabase.table("games").update({"status": status_obj}).eq(
                    "id", game_id
                ).execute()
                print(f"   ⚠️ [FAILED] {title_de}")


if __name__ == "__main__":
    run_refinement_pipeline()
