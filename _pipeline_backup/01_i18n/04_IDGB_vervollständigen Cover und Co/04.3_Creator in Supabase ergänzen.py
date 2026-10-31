#!/usr/bin/env python3
"""
04.3_Creator in Supabase ergänzen.py
Verknüpft YouTube-Videos in game_guides mit public.content_creators:
- Schreibt direkt in game_guides.creator_id (inkl. edit_unlocked = True für gesperrte Spiele).
- Nutzt stabiles .limit(1).execute() statt JS-maybeSingle().
- Setzt games.status.guides = 'HAS_VIDEO'.
"""

import os
import re
import sys
import time
import json
from typing import Optional, Dict, Any, Tuple
from dotenv import load_dotenv
import requests
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
CREATOR_CACHE: Dict[str, str] = {}


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


def resolve_youtube_creator(url: str) -> Optional[Tuple[str, str]]:
    if not url or ("youtube.com" not in url and "youtu.be" not in url):
        return None

    handle_match = re.search(r"youtube\.com/@([a-zA-Z0-9_\-\.]+)", url)
    if handle_match and not any(param in url for param in ["watch", "playlist"]):
        handle = handle_match.group(1)
        return handle, f"https://www.youtube.com/@{handle}"

    oembed_endpoint = (
        f"https://www.youtube.com/oembed?url={requests.utils.quote(url)}&format=json"
    )
    try:
        res = requests.get(oembed_endpoint, timeout=6)
        if res.status_code == 200:
            data = res.json()
            channel_name = data.get("author_name")
            channel_url = data.get("author_url")
            if channel_name and channel_url:
                return channel_name.strip(), channel_url.strip()
    except Exception:
        pass

    if handle_match:
        handle = handle_match.group(1)
        return handle, f"https://www.youtube.com/@{handle}"
    return None


def get_or_create_creator(channel_name: str, channel_url: str) -> Optional[str]:
    cache_key = channel_url.lower()
    if cache_key in CREATOR_CACHE:
        return CREATOR_CACHE[cache_key]

    res = (
        supabase.table("content_creators")
        .select("id")
        .eq("youtube_url", channel_url)
        .limit(1)
        .execute()
    )
    if not res.data:
        res = (
            supabase.table("content_creators")
            .select("id")
            .ilike("channel_name", channel_name)
            .limit(1)
            .execute()
        )

    if res.data:
        creator_id = res.data[0]["id"]
        CREATOR_CACHE[cache_key] = creator_id
        return creator_id

    payload = {
        "channel_name": channel_name,
        "youtube_url": channel_url,
        "signature_tags": [],
        "is_active": True,
    }
    insert_res = supabase.table("content_creators").insert(payload).execute()
    if insert_res.data:
        creator_id = insert_res.data[0]["id"]
        CREATOR_CACHE[cache_key] = creator_id
        print(f"  [+] Neuer Creator angelegt: {channel_name} ({channel_url})")
        return creator_id
    return None


def mark_game_has_video(game_id: str) -> str:
    """Liest games.status sicher mit .limit(1) und setzt status.guides = 'HAS_VIDEO'."""
    g_res = (
        supabase.table("games")
        .select("spieltitel, status")
        .eq("id", game_id)
        .limit(1)
        .execute()
    )
    g_data = g_res.data[0] if g_res.data else {}
    titel_raw = g_data.get("spieltitel")
    title = (
        (titel_raw.get("de") or titel_raw.get("en") or game_id[:8])
        if isinstance(titel_raw, dict)
        else str(titel_raw or game_id[:8])
    )

    status_obj = parse_dict_safely(g_data.get("status"))
    if status_obj.get("guides") != "HAS_VIDEO":
        status_obj["guides"] = "HAS_VIDEO"
        supabase.table("games").update({"status": status_obj}).eq(
            "id", game_id
        ).execute()

    return title


def process_creator_pipeline():
    print(
        "🔍 Suche Guide-Zeilen in 'game_guides' ohne creator_id, aber mit video_url..."
    )
    last_id = None
    batch_size = 500
    game_to_url: Dict[str, str] = {}

    while True:
        query = (
            supabase.table("game_guides")
            .select("id, game_id, video_url")
            .is_("creator_id", "null")
            .not_.is_("video_url", "null")
            .neq("video_url", "")
            .order("id")
            .limit(batch_size)
        )
        if last_id:
            query = query.gt("id", last_id)

        res = query.execute()
        rows = res.data or []
        if not rows:
            break

        for r in rows:
            last_id = r["id"]
            gid = r.get("game_id")
            vurl = str(r.get("video_url") or "").strip()
            if gid and vurl.startswith("http") and gid not in game_to_url:
                game_to_url[gid] = vurl

    print(f"📦 {len(game_to_url)} Spiele mit unverknüpften Video-Guides gefunden.\n")

    updated_games = 0
    for game_id, sample_url in game_to_url.items():
        creator_info = resolve_youtube_creator(sample_url)
        if not creator_info:
            continue

        channel_name, channel_url = creator_info
        creator_id = get_or_create_creator(channel_name, channel_url)
        if not creator_id:
            continue

        try:
            supabase.table("game_guides").update(
                {"creator_id": creator_id, "edit_unlocked": True}
            ).eq("game_id", game_id).is_("creator_id", "null").execute()

            title = mark_game_has_video(game_id)
            updated_games += 1
            print(
                f"[✅] {title} ({game_id[:8]}…) -> Creator '{channel_name}' verknüpft (HAS_VIDEO)"
            )
            time.sleep(0.08)
        except Exception as e:
            print(f"[❌] Fehler bei Spiel {game_id}: {e}")

    print(
        f"\n🏁 Fertig! {updated_games} Spiele mit Creator-IDs in game_guides aktualisiert."
    )


if __name__ == "__main__":
    process_creator_pipeline()
