#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
04.9_Quickwin_MiniPublisher_Audit.py
Filtert aus allen 'Quickwin'-Spielen nur die Mini-Publisher (<= 7 Spiele im Quickwin-Topf) heraus
und prüft per Gemini 3.5 Flash im Batch, ob es echte Shovelware ('Quickwin') ist oder ob das Spiel
als 'Easy Platin' bzw. 'Standard' befreit werden muss.
"""

import os
import sys
import json
import time
from collections import defaultdict
from dotenv import load_dotenv
from supabase import create_client, Client
from google import genai
from google.genai import types

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY or not GEMINI_API_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY oder GEMINI_API_KEY fehlt in .env!"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
ai_client = genai.Client(api_key=GEMINI_API_KEY)

MODEL_ID = "gemini-3.5-flash"
MAX_GAMES_PER_MINI_PUBLISHER = (
    7  # Publisher mit >= 8 Quickwins gelten als bestätigte Massen-Quickwin-Studios
)
BATCH_SIZE = 25


def fetch_all_quickwins():
    print("🔄 Lade alle Spiele mit spiel_typ = 'Quickwin'...")
    rows = []
    offset = 0
    limit = 1000
    while True:
        res = (
            supabase.table("games")
            .select("id, spieltitel, publisher, entwickler, spiel_typ")
            .eq("spiel_typ", "Quickwin")
            .range(offset, offset + limit - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    print(f"📦 {len(rows)} Quickwin-Spiele geladen.")
    return rows


def filter_mini_publisher_candidates(games: list[dict]) -> list[dict]:
    by_pub = defaultdict(list)
    for g in games:
        pub = str(g.get("publisher") or "").strip()
        pub_key = pub.lower() if pub else "__unknown__"
        by_pub[pub_key].append(g)

    candidates = []
    skipped_publishers = 0
    for pub_key, pub_games in by_pub.items():
        # Massen-Publisher (> 7 Quickwins) überspringen
        if pub_key != "__unknown__" and len(pub_games) > MAX_GAMES_PER_MINI_PUBLISHER:
            skipped_publishers += 1
            continue
        candidates.extend(pub_games)

    print(
        f"🎯 Filter-Ergebnis: {len(candidates)} Kandidaten von Mini-/Unbekannt-Publishern "
        f"({skipped_publishers} große Quickwin-Publisher automatisch übersprungen).\n"
    )
    return candidates


def classify_batch_with_gemini(batch: list[dict]) -> list[dict]:
    payload_items = []
    for g in batch:
        t_obj = g.get("spieltitel") if isinstance(g.get("spieltitel"), dict) else {}
        title = t_obj.get("de") or t_obj.get("en") or "Unbenannt"
        payload_items.append(
            {
                "id": g["id"],
                "title": title,
                "publisher": g.get("publisher") or "Unbekannt",
                "developer": g.get("entwickler") or "Unbekannt",
            }
        )

    prompt = (
        "Du bist ein PlayStation-Katalog-Kurator für TrophyBase.\n"
        "Prüfe folgende Spiele, die aktuell als 'Quickwin' (Shovelware / 1-5 Minuten-Platin / Asset-Flip / Jumping-Food / Quiz-Clone / Clicker) eingestuft sind.\n"
        "Entscheide für jedes Spiel streng:\n"
        "- 'Quickwin': Wenn es typische Shovelware, 1-Dollar-Platinbait, Jumping/Stroke/Quiz/Breakout-Asset-Flip oder ein 5-Minuten-Trash-Spiel ist.\n"
        "- 'Easy Platin': Wenn es ein echtes, vollwertiges Indie-/Adventure-/Puzzle-/Rennspiel mit leichter Platin (ca. 1 bis 10 Stunden, z.B. Cat Quest, Road 96, What Remains of Edith Finch, echte Point&Click- oder Story-Indies) ist.\n"
        "- 'Standard': Wenn es ein normales, vollwertiges Spiel oder AA/AAA-Titel ist, der fälschlicherweise in Quickwins gelandet ist.\n\n"
        "Antworte AUSSCHLIESSLICH als JSON-Array im Format:\n"
        '[{"id": "<uuid>", "new_type": "Quickwin" | "Easy Platin" | "Standard", "reason": "<kurze Begründung max 8 Wörter>"}]\n\n'
        f"Spiele:\n{json.dumps(payload_items, ensure_ascii=False)}"
    )

    resp = ai_client.models.generate_content(
        model=MODEL_ID,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )
    try:
        return json.loads(resp.text or "[]")
    except Exception as e:
        print(f"  ⚠️ JSON-Parse-Fehler: {e}")
        return []


def main():
    dry_run = "--apply" not in sys.argv
    if dry_run:
        print(
            "ℹ️ DRY-RUN aktiv (keine DB-Schreibzugriffe). Starte mit '--apply', um Änderungen direkt zu speichern.\n"
        )

    all_quickwins = fetch_all_quickwins()
    candidates = filter_mini_publisher_candidates(all_quickwins)
    if not candidates:
        return

    by_id = {g["id"]: g for g in candidates}
    freed_count = 0

    for i in range(0, len(candidates), BATCH_SIZE):
        batch = candidates[i : i + BATCH_SIZE]
        print(
            f"🤖 Prüfe Batch {i // BATCH_SIZE + 1} ({i + 1}..{min(i + BATCH_SIZE, len(candidates))} / {len(candidates)})..."
        )
        results = classify_batch_with_gemini(batch)

        for r in results:
            gid = r.get("id")
            new_type = str(r.get("new_type") or "Quickwin").strip()
            reason = str(r.get("reason") or "").strip()
            game = by_id.get(gid)
            if not game or new_type == "Quickwin":
                continue

            t_obj = (
                game.get("spieltitel")
                if isinstance(game.get("spieltitel"), dict)
                else {}
            )
            title = t_obj.get("de") or t_obj.get("en") or gid
            pub = game.get("publisher") or "-"
            print(
                f"  🔓 BEFREIT: '{title}' (Publisher: {pub}) -> {new_type} ({reason})"
            )
            freed_count += 1

            if not dry_run:
                patch = {
                    "spiel_typ": (
                        "Standard"
                        if new_type in ("Standard", "Easy Platin")
                        else new_type
                    )
                }
                tags = list(game.get("home_tags") or [])
                if new_type == "Easy Platin" and "easy-platins" not in [
                    t.lower() for t in tags
                ]:
                    tags.append("easy-platins")
                    patch["home_tags"] = tags
                supabase.table("games").update(patch).eq("id", gid).execute()

        time.sleep(0.5)

    print(
        f"\n✅ Fertig! {freed_count} von {len(candidates)} Spielen wurden aus dem Quickwin-Topf befreit."
    )


if __name__ == "__main__":
    main()
