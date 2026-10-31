#!/usr/bin/env python3
"""
04.5_Spiel_Typ_Klassifizierer.py (Ehemals 05_Trends_youtube.py)
Klassifiziert offene Spiele direkt in public.games (ohne Excel-Umweg):
1. Deterministischer Vorab-Check gegen public.quickwin_publisher_defs -> 'Quickwin'.
2. KI-Batch-Klassifizierung (Evergreen, Premium, Standard, easy_platin, Quickwin)
   anhand von Titel, Studio/Publisher, Release-Jahr, Trophäenanzahl & Sub-Genres.
3. Berechnet automatisch is_indexable (True für Evergreen/Premium/Standard, False für Quickwin/easy_platin)
   und setzt status.overall = 'ARCHIVED' bei reinen Nischen-/Archiv-Titeln.
"""

import os
import re
import sys
import json
import time
from typing import List, Literal, Any
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from google import genai
from google.genai import types
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("YOUTUBE_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )
if not GEMINI_API_KEY:
    sys.exit("❌ Fehler: GEMINI_API_KEY fehlt in der .env!")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
ai_client = genai.Client(api_key=GEMINI_API_KEY)
MODEL_ID = "gemini-2.5-flash"

BATCH_SIZE = 40
INDEXABLE_TYPES = {"Evergreen", "Premium", "Standard"}


class ClassifiedGame(BaseModel):
    game_id: str = Field(description="Exakte UUID des Spiels aus dem Input")
    spiel_typ: Literal[
        "Evergreen", "Premium", "Standard", "easy_platin", "Quickwin"
    ] = Field(
        description=(
            "'Evergreen' = Große Dauerbrenner-Franchises & Meilensteine (GTA, Souls, Resident Evil, God of War, Assassin's Creed, Final Fantasy, Witcher, etc.). "
            "'Premium' = Aktuelle Hype-/AAA-/AA-Releases (2024-2026) oder große Remaster mit hohem Suchinteresse. "
            "'Standard' = Reguläre, vollwertige Spiele (ältere Jahrgänge oder Nischentitel). "
            "'easy_platin' = Kurze, echte Indie-/Story-Spiele (Visual Novels, Wimmelbild/Hidden Object von Artifex Mundi, FMV, Point & Click) mit sehr leichter Platin. "
            "'Quickwin' = Reine 5-Minuten-Micro-Spiele / Shovelware (Jumping Food, Stroke the Animal, Quiz-Clone, 1-Euro-Platin)."
        )
    )
    is_archived: bool = Field(
        default=False,
        description="TRUE nur bei völlig obskuren uralten PS3/Vita-Nischentiteln ohne jedes heutige Suchvolumen.",
    )


class ClassificationBatchResponse(BaseModel):
    items: List[ClassifiedGame]


def parse_dict_safely(val: Any) -> dict:
    if isinstance(val, dict):
        return dict(val)
    if isinstance(val, str) and val.strip().startswith("{"):
        try:
            parsed = json.loads(val.strip())
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return {}


def normalize_brand_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(name or "").lower())


def load_quickwin_publisher_keys() -> set[str]:
    """Lädt die bekannten Quickwin-Publisher aus public.quickwin_publisher_defs."""
    keys = set()
    try:
        res = (
            supabase.table("quickwin_publisher_defs")
            .select("match_key, publisher")
            .execute()
        )
        for row in res.data or []:
            if row.get("match_key"):
                keys.add(normalize_brand_key(row["match_key"]))
            if row.get("publisher"):
                keys.add(normalize_brand_key(row["publisher"]))
    except Exception as e:
        print(f"⚠️ Hinweis: quickwin_publisher_defs konnte nicht geladen werden: {e}")
    return {k for k in keys if len(k) >= 3}


def extract_title(spieltitel_raw: Any) -> str:
    if isinstance(spieltitel_raw, dict):
        return str(
            spieltitel_raw.get("de")
            or spieltitel_raw.get("en")
            or next(iter(spieltitel_raw.values()), "")
        ).strip()
    if isinstance(spieltitel_raw, str):
        return spieltitel_raw.strip()
    return ""


def fetch_untyped_games() -> list[dict]:
    """
    Holt paginiert alle Spiele, bei denen spiel_typ noch NULL oder leer ist.
    Bereits kategorisierte Spiele (z. B. Servertot, Quickwin, Evergreen) bleiben unangetastet!
    """
    print("📥 Suche Spiele ohne 'spiel_typ' in public.games...")
    untyped = []
    last_id = None
    limit = 1000

    while True:
        query = (
            supabase.table("games")
            .select(
                "id, spieltitel, hardware, release_jahr, entwickler, publisher, "
                "anzahl_trophaeen, sub_genres, home_tags, spiel_typ, status"
            )
            .or_("spiel_typ.is.null,spiel_typ.eq.")
            .order("id")
            .limit(limit)
        )
        if last_id:
            query = query.gt("id", last_id)

        res = query.execute()
        rows = res.data or []
        if not rows:
            break

        for r in rows:
            last_id = r["id"]
            if str(r.get("spiel_typ") or "").strip():
                continue
            status_obj = parse_dict_safely(r.get("status"))
            if status_obj.get("trophies") == "ZERO_TROPHIES":
                continue
            titel = extract_title(r.get("spieltitel"))
            if not titel or titel == "Unbenannt":
                continue
            untyped.append(r)

        if len(rows) < limit:
            break

    print(f"📦 {len(untyped)} offene Spiele ohne 'spiel_typ' gefunden.\n")
    return untyped


def classify_batch_via_gemini(batch: list[dict]) -> List[ClassifiedGame]:
    payload = []
    for g in batch:
        payload.append(
            {
                "game_id": g["id"],
                "title": extract_title(g.get("spieltitel")),
                "hardware": g.get("hardware") or "PS4",
                "release_year": g.get("release_jahr"),
                "developer": g.get("entwickler"),
                "publisher": g.get("publisher"),
                "trophy_count": g.get("anzahl_trophaeen"),
                "genres": g.get("sub_genres") or g.get("home_tags") or [],
            }
        )

    prompt = f"""
Du bist Chef-Katalog-Kurator für TrophyBase.app.
Ordne jedem Spiel in dieser Liste exakt einen 'spiel_typ' zu:

1. 'Evergreen': Bekannte große Franchises & Dauerbrenner (Souls, GTA, Assassin's Creed, Resident Evil, Final Fantasy, Call of Duty, God of War, Uncharted, Tomb Raider, LEGO, Witcher, Elder Scrolls, Far Cry, Battlefield, Monster Hunter, Persona, Yakuza/Like a Dragon, etc.).
2. 'Premium': Relevante neuere Vollpreis-/AA-/AAA-Titel & bekannte Indie-Hits (insb. 2024-2026) mit aktivem Interesse.
3. 'Standard': Normale, echte Spiele (Mid-Tier, ältere PS3/PS4-Spiele, normale Sport-/Renn-/Actionspiele), die weder riesige Evergreens noch 5-Minuten-Shovelware sind.
4. 'easy_platin': Echte, kurze Spiele mit sehr leichter Platin: Visual Novels, Wimmelbild-Spiele (Artifex Mundi), FMV-Spiele, kurze Point-&-Click-Adventures.
5. 'Quickwin': Reine Trophäen-Shovelware / 5-Minuten-Platin-Müll (z.B. 'The Jumping...', 'Stroke the...', 'Quiz...', billigste Asset-Flips mit 12-70 Goldtrophäen).

Setze 'is_archived' nur dann auf true, wenn es ein völlig obskurer Alt-Titel (z.B. unbekanntes PS3/Vita-Spiel) ohne relevantes Suchvolumen ist.

Spiele-Input:
{json.dumps(payload, ensure_ascii=False)}
"""

    for attempt in range(3):
        try:
            response = ai_client.models.generate_content(
                model=MODEL_ID,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ClassificationBatchResponse,
                    temperature=0.1,
                ),
            )
            parsed = ClassificationBatchResponse.model_validate_json(response.text)
            return parsed.items
        except Exception as e:
            print(f"  ⚠️ Gemini-Batch-Fehler (Versuch {attempt + 1}/3): {e}")
            time.sleep(2.0 * (attempt + 1))
    return []


def update_game_type_in_db(game_row: dict, spiel_typ: str, is_archived: bool = False):
    gid = game_row["id"]
    is_indexable = spiel_typ in INDEXABLE_TYPES
    status_obj = parse_dict_safely(game_row.get("status"))

    if is_archived and spiel_typ == "Standard":
        status_obj["overall"] = "ARCHIVED"
    elif status_obj.get("overall") != "ARCHIVED":
        status_obj["overall"] = "ACTIVE"

    update_payload = {
        "spiel_typ": spiel_typ,
        "is_indexable": is_indexable,
        "status": status_obj,
    }
    supabase.table("games").update(update_payload).eq("id", gid).execute()


def main():
    qw_publishers = load_quickwin_publisher_keys()
    untyped_games = fetch_untyped_games()

    if not untyped_games:
        print("🏁 Alle Spiele in der Datenbank haben bereits einen 'spiel_typ'!")
        return

    ai_queue = []
    counts = {
        "Evergreen": 0,
        "Premium": 0,
        "Standard": 0,
        "easy_platin": 0,
        "Quickwin": 0,
        "archived": 0,
    }

    # Schritt 1: Deterministischer Quickwin-Check über quickwin_publisher_defs (0 Token!)
    print(
        "⚡ Prüfe Spiele gegen bekannte Quickwin-Publisher (quickwin_publisher_defs)..."
    )
    for g in untyped_games:
        pub_key = normalize_brand_key(g.get("publisher") or "")
        dev_key = normalize_brand_key(g.get("entwickler") or "")

        if (pub_key and pub_key in qw_publishers) or (
            dev_key and dev_key in qw_publishers
        ):
            try:
                update_game_type_in_db(g, "Quickwin", is_archived=False)
                counts["Quickwin"] += 1
                print(
                    f"  ⚡ [Quickwin-Allowlist] {extract_title(g.get('spieltitel'))} ({g.get('publisher') or g.get('entwickler')})"
                )
            except Exception as e:
                print(f"  ❌ DB-Fehler bei {g['id']}: {e}")
        else:
            ai_queue.append(g)

    print(
        f"\n🤖 Starte Gemini-Klassifizierung für {len(ai_queue)} verbleibende Spiele in {BATCH_SIZE}er-Batches...\n"
    )

    lookup = {g["id"]: g for g in ai_queue}

    for i in range(0, len(ai_queue), BATCH_SIZE):
        batch = ai_queue[i : i + BATCH_SIZE]
        print(f" -> Batch {i + 1}..{i + len(batch)} von {len(ai_queue)}...")

        results = classify_batch_via_gemini(batch)
        for item in results:
            game_row = lookup.get(item.game_id)
            if not game_row:
                continue

            try:
                update_game_type_in_db(game_row, item.spiel_typ, item.is_archived)
                counts[item.spiel_typ] = counts.get(item.spiel_typ, 0) + 1
                if item.is_archived:
                    counts["archived"] += 1
                title = extract_title(game_row.get("spieltitel"))
                arch_tag = " [ARCHIVED]" if item.is_archived else ""
                print(f"    [✅ {item.spiel_typ}]{arch_tag} {title}")
            except Exception as e:
                print(f"    [❌ DB-Fehler] {item.game_id}: {e}")

        time.sleep(0.3)

    print("\n📊 Klassifizierung abgeschlossen (Direkt in Supabase gespeichert):")
    print(f"   ⭐ Evergreen:   {counts['Evergreen']}")
    print(f"   🔥 Premium:     {counts['Premium']}")
    print(
        f"   🎮 Standard:    {counts['Standard']} (davon {counts['archived']} archiviert)"
    )
    print(f"   🥂 easy_platin: {counts['easy_platin']}")
    print(f"   ⚡ Quickwin:    {counts['Quickwin']}")


if __name__ == "__main__":
    main()
