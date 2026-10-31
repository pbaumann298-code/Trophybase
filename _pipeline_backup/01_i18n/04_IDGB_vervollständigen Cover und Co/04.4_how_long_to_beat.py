import os
import sys
import re
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
import requests
import time
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TWITCH_CLIENT_ID = os.getenv("TWITCH_CLIENT_ID")
TWITCH_CLIENT_SECRET = os.getenv("TWITCH_CLIENT_SECRET")

if not all([SUPABASE_URL, SUPABASE_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET]):
    sys.exit(
        "❌ Fehler: SUPABASE_* oder TWITCH_* Umgebungsvariablen fehlen in der .env"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

PS_PLATFORMS = {9: "PS3", 48: "PS4", 167: "PS5", 46: "PS Vita", 38: "PSP"}
ALL_PS_IDS = tuple(PS_PLATFORMS.keys())


def get_igdb_token() -> str:
    res = requests.post(
        "https://id.twitch.tv/oauth2/token",
        params={
            "client_id": TWITCH_CLIENT_ID,
            "client_secret": TWITCH_CLIENT_SECRET,
            "grant_type": "client_credentials",
        },
        timeout=10,
    )
    res.raise_for_status()
    return res.json()["access_token"]


def clean_title(title: str) -> str:
    t = re.sub(r"[\®\™\©]", "", title)
    t = re.sub(r"\(.*?\)", "", t)
    if " - " in t:
        t = t.split(" - ")[0]
    blacklist = [
        "Additional Trophies",
        "Trophies",
        "Expansion",
        "Add-on",
        "Addon",
        "Console Edition",
        "Expansion Pack",
        "DLC Suite",
        "DLC",
        "The Game",
        "Game",
    ]
    for word in blacklist:
        t = re.sub(rf"\b{word}\b", "", t, flags=re.IGNORECASE)
    if ":" in t:
        parts = t.split(":")
        if len(parts[1].strip().split()) > 3:
            t = parts[0]
    return " ".join(t.split()).strip()


def normalize_string(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "", text).lower()


def extract_primary_title(spieltitel_json: Any) -> Optional[str]:
    if isinstance(spieltitel_json, dict):
        return (
            spieltitel_json.get("de")
            or spieltitel_json.get("en")
            or (next(iter(spieltitel_json.values())) if spieltitel_json else None)
        )
    if isinstance(spieltitel_json, str):
        return spieltitel_json
    return None


def search_igdb_match(title: str, token: str) -> Optional[int]:
    """Sucht deterministisch nach einem Match auf PlayStation-Plattformen ohne LLM."""
    url = "https://api.igdb.com/v4/games"
    headers = {"Client-ID": TWITCH_CLIENT_ID, "Authorization": f"Bearer {token}"}
    cleaned = clean_title(title)
    ps_filter = f"({','.join(map(str, ALL_PS_IDS))})"

    query = f"""
    search "{cleaned}";
    fields id, name, platforms.id;
    where platforms = {ps_filter};
    limit 5;
    """

    # ZWINGEND: IGDB Rate Limit (max. 4 Req/Sec) respektieren
    time.sleep(0.26)

    res = requests.post(url, headers=headers, data=query, timeout=10)
    if res.status_code != 200:
        return None

    candidates = res.json() or []
    norm_local = normalize_string(title)

    # 1. Exakter Match
    for c in candidates:
        if normalize_string(c.get("name", "")) == norm_local:
            return c["id"]

    # 2. Match mit bereinigtem Titel
    norm_cleaned = normalize_string(cleaned)
    for c in candidates:
        if normalize_string(c.get("name", "")) == norm_cleaned:
            return c["id"]

    return None


def fetch_time_to_beats(
    igdb_ids: List[int], token: str
) -> Dict[int, Dict[str, Optional[float]]]:
    """Holt Time-to-Beat-Daten über den isolierten IGDB v4 Endpoint '/game_time_to_beats'."""
    if not igdb_ids:
        return {}

    headers = {"Client-ID": TWITCH_CLIENT_ID, "Authorization": f"Bearer {token}"}
    mapping: Dict[int, Dict[str, Optional[float]]] = {}

    def to_hours(seconds: Optional[int]) -> Optional[float]:
        if seconds and seconds > 0:
            return round(seconds / 3600.0, 1)
        return None

    ids_str = ",".join(map(str, set(igdb_ids)))

    # 1. Hole Games für Parent-Child Relationen (Remasters, Editions)
    games_url = "https://api.igdb.com/v4/games"
    query_games = f"""
    fields id, version_parent, parent_game;
    where id = ({ids_str});
    limit 500;
    """
    res_games = requests.post(games_url, headers=headers, data=query_games, timeout=15)

    if res_games.status_code != 200:
        print(f"❌ IGDB API Fehler bei /games: {res_games.text}")
        return {}

    parent_to_children: Dict[int, List[int]] = {}
    all_target_ids = set(igdb_ids)

    for g in res_games.json():
        gid = g["id"]
        p_id = g.get("version_parent") or g.get("parent_game")
        if p_id:
            parent_to_children.setdefault(p_id, []).append(gid)
            all_target_ids.add(p_id)

    # 2. Hole Time-to-Beat-Daten für Original-IDs und deren Parents via isoliertem Endpoint
    ttb_url = "https://api.igdb.com/v4/game_time_to_beats"
    target_ids_str = ",".join(map(str, all_target_ids))

    query_ttb = f"""
    fields game_id, normally, completely;
    where game_id = ({target_ids_str});
    limit 500;
    """
    res_ttb = requests.post(ttb_url, headers=headers, data=query_ttb, timeout=15)

    if res_ttb.status_code != 200:
        print(f"❌ IGDB API Fehler bei /game_time_to_beats: {res_ttb.text}")
        return {}

    ttb_dict = {}
    for entry in res_ttb.json():
        g_id = entry.get("game_id")
        if not g_id:
            continue

        norm = to_hours(entry.get("normally"))
        comp = to_hours(entry.get("completely"))
        if norm or comp:
            ttb_dict[g_id] = {"normally": norm, "completely": comp}

    # 3. Zuweisung lokal auflösen (Direkt oder via Parent Fallback)
    for gid in igdb_ids:
        # Direkter Treffer
        if gid in ttb_dict:
            mapping[gid] = ttb_dict[gid]
            continue

        # Parent-Fallback
        for p_id, children in parent_to_children.items():
            if gid in children and p_id in ttb_dict:
                mapping[gid] = ttb_dict[p_id]
                break

    return mapping


def sync_playtimes():
    token = get_igdb_token()
    last_id = None
    batch_size = 200
    processed_count = 0
    updated_count = 0

    print("⚡ Starte Time-to-Beat Synchronisation (Direct API, No LLM)...\n")

    while True:
        query = (
            supabase.table("games")
            .select("id, platform_game_id, hardware, igdb_id, spieltitel, status")
            .or_("status->>time_to_beat.is.null,status->>time_to_beat.neq.COMPLETED")
            .order("id")
            .limit(batch_size)
        )
        if last_id:
            query = query.gt("id", last_id)

        res = query.execute()
        records = res.data or []
        if not records:
            print(
                f"\n🏁 Fertig. {processed_count} geprüft, {updated_count} aktualisiert."
            )
            break

        print(f"🔍 Batch mit {len(records)} Games ab ID {last_id or 'START'}...")

        resolved_batch_ids: Dict[str, int] = {}
        for r in records:
            last_id = r["id"]
            processed_count += 1
            raw_igdb = r.get("igdb_id")

            if raw_igdb and str(raw_igdb).isdigit():
                resolved_batch_ids[r["id"]] = int(raw_igdb)
            else:
                title = extract_primary_title(r.get("spieltitel"))
                if title:
                    found_id = search_igdb_match(title, token)
                    if found_id:
                        resolved_batch_ids[r["id"]] = found_id

        unique_igdb_ids = list(set(resolved_batch_ids.values()))
        times_map = fetch_time_to_beats(unique_igdb_ids, token)

        for r in records:
            game_id = r["id"]
            status_obj = r.get("status") if isinstance(r.get("status"), dict) else {}
            title = extract_primary_title(r.get("spieltitel")) or game_id

            if game_id not in resolved_batch_ids:
                status_obj["time_to_beat"] = "NO_IGDB"
                supabase.table("games").update({"status": status_obj}).eq(
                    "id", game_id
                ).execute()
                print(f"[❌] {title}: Keine IGDB-ID gefunden.")
                continue

            igdb_id = resolved_batch_ids[game_id]
            time_data = times_map.get(igdb_id)

            payload: Dict[str, Any] = {
                "igdb_id": str(igdb_id),
            }

            if not time_data or (
                time_data.get("normally") is None
                and time_data.get("completely") is None
            ):
                status_obj["time_to_beat"] = "NO_DATA"
                payload["status"] = status_obj
                payload["spielzeit_hauptstory"] = None
                payload["spielzeit_komplettierer"] = None
                print(
                    f"[⚠] {title} (IGDB: {igdb_id}): Keine Zeiten bei IGDB/HLTB hinterlegt."
                )
            else:
                status_obj["time_to_beat"] = "COMPLETED"
                status_obj.pop("time_to_beat_reason", None)
                payload["status"] = status_obj
                payload["spielzeit_hauptstory"] = time_data.get("normally")
                payload["spielzeit_komplettierer"] = time_data.get("completely")
                print(
                    f"[✅] {title} (IGDB: {igdb_id}): Main={payload['spielzeit_hauptstory']}h | 100%={payload['spielzeit_komplettierer']}h"
                )

            supabase.table("games").update(payload).eq("id", game_id).execute()
            updated_count += 1


if __name__ == "__main__":
    sync_playtimes()
