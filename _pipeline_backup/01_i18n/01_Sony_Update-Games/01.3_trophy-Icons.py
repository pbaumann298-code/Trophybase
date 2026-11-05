#!/usr/bin/env python3
"""
01.3_trophy-Icons.py
Holt ausschliesslich fehlende trophyIconUrls (1 Request pro Spiel statt 29).
- Laesst games.status (PROCESSED) unangetastet.
- Priorisiert PUBLISHED- und FERTIG-Guides zuerst.
- Erneuert das Sony-Access-Token automatisch alle 45 Minuten sowie bei HTTP 401.
"""

import os
import sys
import time
import json
import requests
from dotenv import load_dotenv
from psnawp_api import PSNAWP
from supabase import create_client, Client

load_dotenv()

DELAY_BETWEEN_GAMES = 0.35
TOKEN_MAX_AGE_SECONDS = 45 * 60  # Nach 45 Min. proaktiv erneuern (Sony-Limit = 60 Min.)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
NPSSO_TOKEN = os.getenv("PSN_NPSSO")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )
if not NPSSO_TOKEN:
    sys.exit("❌ Fehler: PSN_NPSSO fehlt in der .env!")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

psnawp = None
current_token = None
token_timestamp = 0.0


def get_valid_access_token(force_refresh: bool = False) -> str:
    """Führt exakt deinen funktionierenden Start-Handshake aus und wiederholt ihn alle 45 Min."""
    global psnawp, current_token, token_timestamp
    now = time.time()

    if (
        not force_refresh
        and current_token
        and (now - token_timestamp) < TOKEN_MAX_AGE_SECONDS
    ):
        return current_token

    print("⚡ Erzwinge frischen Sony OAuth-Handshake über PSNAWP...")
    psnawp = PSNAWP(NPSSO_TOKEN)
    client = psnawp.me()
    online_id = client.online_id  # <-- Erzwingt den echten Handshake bei Sony!

    if not psnawp.authenticator.token_response:
        raise RuntimeError("Sony Authenticator hat keine Token-Antwort geliefert.")

    token = psnawp.authenticator.token_response.get("access_token")
    if not token:
        raise RuntimeError("PSN Access Token ist leer.")

    current_token = token
    token_timestamp = time.time()
    print(f"✅ Frisches Token aktiv (authentifiziert als: {online_id}).\n")
    return current_token


def extract_npwr_list(raw_npwrs) -> list[str]:
    if isinstance(raw_npwrs, list):
        return [str(x).strip("[]'\" ") for x in raw_npwrs if x]
    if isinstance(raw_npwrs, str):
        cleaned = raw_npwrs.strip()
        if cleaned.startswith("[") and cleaned.endswith("]"):
            try:
                parsed = json.loads(cleaned)
                return [str(x).strip("[]'\" ") for x in parsed if x]
            except Exception:
                return [cleaned.strip("[]'\" ")]
        elif cleaned:
            return [cleaned.strip("[]'\" ")]
    return []


def fetch_trophies_once(npwr_id: str, service: str, retries: int = 3):
    url = f"https://m.np.playstation.com/api/trophy/v1/npCommunicationIds/{npwr_id}/trophyGroups/all/trophies"
    for attempt in range(retries):
        token = get_valid_access_token(force_refresh=False)
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept-Language": "en-US",
            "User-Agent": "Mozilla/5.0",
        }
        try:
            res = requests.get(
                url, headers=headers, params={"npServiceName": service}, timeout=8
            )
            if res.status_code == 200:
                return 200, res.json().get("trophies", [])
            if res.status_code == 401:
                print("  🔄 HTTP 401 von Sony – erzwinge sofortigen Token-Refresh...")
                get_valid_access_token(force_refresh=True)
                continue
            if res.status_code in (400, 404):
                return res.status_code, []
            if res.status_code == 429:
                wait = 2.5 * (attempt + 1)
                print(f"  ⏳ Rate-Limit (429), warte {wait:.1f}s...")
                time.sleep(wait)
                continue
            print(f"  ⚠️ [HTTP {res.status_code}] bei {npwr_id} ({service})")
            return res.status_code, None
        except requests.RequestException as exc:
            print(f"  ⚠️ Netzwerkfehler ({exc}), Versuch {attempt + 1}/{retries}...")
            time.sleep(1.5 * (attempt + 1))
    return 500, None


def fetch_icons_for_game(game: dict) -> tuple[int, bool]:
    game_uuid = game["id"]
    npwr_list = extract_npwr_list(game.get("platform_game_id"))
    hw = str(game.get("hardware") or "").upper()

    if not npwr_list:
        supabase.rpc(
            "tb_update_trophy_icons",
            {"p_game_id": game_uuid, "p_icons": {}, "p_mark_missing_as_none": True},
        ).execute()
        return 0, True

    primary_npwr = npwr_list[0]
    services = (
        ["trophy", "trophy2"]
        if any(x in hw for x in ("PS3", "VITA", "PSP"))
        else ["trophy2", "trophy"]
    )

    trophies = None
    final_status = None
    for svc in services:
        status, data = fetch_trophies_once(primary_npwr, svc)
        final_status = status
        if status == 200 and data:
            trophies = data
            break

    # Bei echtem Netzwerk-/Serverfehler (nicht 400/404) nicht als erledigt markieren
    if trophies is None and final_status not in (200, 400, 404):
        return 0, False

    icon_map = {}
    for t in trophies or []:
        tid = str(t.get("trophyId", "")).strip()
        icon = str(t.get("trophyIconUrl") or t.get("icon_url") or "").strip()
        if tid and icon.startswith("http"):
            icon_map[tid] = icon

    res = supabase.rpc(
        "tb_update_trophy_icons",
        {
            "p_game_id": game_uuid,
            "p_icons": icon_map,
            "p_mark_missing_as_none": True,
        },
    ).execute()

    updated_count = res.data if isinstance(res.data, int) else len(icon_map)
    return updated_count, True


def main():
    get_valid_access_token(force_refresh=True)
    total_games = 0
    total_icons = 0

    print("🚀 Starte schnellen Icon-Harvester (PUBLISHED -> FERTIG -> Rest)...")

    while True:
        res = supabase.rpc("tb_get_games_missing_icons", {"p_limit": 200}).execute()
        games = res.data or []

        if not games:
            print(
                f"\n🏁 Fertig! {total_games} Spiele geprüft, {total_icons} Icons gespeichert."
            )
            break

        print(f"\n📦 Lade Batch mit {len(games)} Spielen...")

        for game in games:
            titel = game.get("titel", "Unbenannt")
            g_status = game.get("guide_status") or "KATALOG"
            updated, ok = fetch_icons_for_game(game)
            if ok:
                total_games += 1
                total_icons += updated
                print(
                    f"  🖼️ [{g_status}] {titel}: {updated} Icons gespeichert ({total_games} Spiele gesamt)"
                )
            else:
                print(f"  ⏭️ [{g_status}] {titel}: Übersprungen wegen API-Fehler")

            time.sleep(DELAY_BETWEEN_GAMES)


if __name__ == "__main__":
    main()
