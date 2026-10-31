#!/usr/bin/env python3
"""
04.2_steam_enricher.py_Sprachen_Genre_Entwickler.py
Holt kostenlos über Steam Store API + SteamSpy API:
1. Echte In-Game-Sprachen (Text & Audio) -> games.game_locales
2. Saubere Publisher & Entwickler -> games.publisher / games.entwickler
3. NEU: Hochauflösendes Steam-Cover (600x900 Box-Art + header_image Fallback),
   wenn das Spiel noch kein gültiges Cover in games.cover_url hat!
4. Alle 26 offiziellen Startseiten-Tags -> games.home_tags (via RPC tb_set_home_tags_from_model)
5. FIX: Tote Spalte 'genre' komplett entfernt (schreibt in sub_genres + home_tags).
"""

import os
import re
import sys
import time
import html
import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

DELAY_BETWEEN_GAMES = 1.0

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
http_session = requests.Session()

STEAM_LANG_MAP = {
    "german": "de",
    "deutsch": "de",
    "english": "en",
    "englisch": "en",
    "french": "fr",
    "französisch": "fr",
    "spanish - spain": "es",
    "spanisch - spanien": "es",
    "spanish - latin america": "es",
    "spanisch - lateinamerika": "es",
    "italian": "it",
    "italienisch": "it",
    "dutch": "nl",
    "niederländisch": "nl",
    "portuguese - portugal": "pt",
    "portugiesisch - portugal": "pt",
    "portuguese - brazil": "pt",
    "brasilianisches portugiesisch": "pt",
    "russian": "ru",
    "russisch": "ru",
    "japanese": "ja",
    "japanisch": "ja",
    "korean": "ko",
    "koreanisch": "ko",
    "simplified chinese": "zh-hans",
    "chinesisch (vereinfacht)": "zh-hans",
    "traditional chinese": "zh-hant",
    "chinesisch (traditionell)": "zh-hant",
    "finnish": "fi",
    "finnisch": "fi",
    "swedish": "sv",
    "schwedisch": "sv",
    "polish": "pl",
    "polnisch": "pl",
    "turkish": "tr",
    "türkisch": "tr",
    "arabic": "ar",
    "arabisch": "ar",
}

# Mapping auf alle 26 offiziellen Slugs aus src/lib/homeTagDefs.js
HOME_TAG_RULES = {
    "soulslike": ["soulslike", "souls-like"],
    "open_world": ["open world", "sandbox"],
    "family": ["family friendly", "lego", "cozy", "cute"],
    "indie": ["indie"],
    "racing": ["racing", "driving", "combat racing", "automobile sim"],
    "fps": ["fps", "first-person", "boomer shooter", "arena shooter"],
    "tps": ["third-person shooter", "third person"],
    "loot_shooter": ["looter shooter"],
    "tactics": [
        "strategy",
        "turn-based tactics",
        "turn-based strategy",
        "rts",
        "tower defense",
        "tactical",
    ],
    "coop_mp": ["co-op", "online co-op", "local co-op", "multiplayer", "pvp"],
    "roguelike": ["roguelike", "roguelite", "action roguelike", "bullet heaven"],
    "rpg": ["rpg", "jrpg", "action rpg", "crpg", "party-based rpg"],
    "action_adventure": [
        "action-adventure",
        "hack and slash",
        "stealth",
        "character action game",
    ],
    "survival_horror": ["survival horror", "horror", "zombies", "survival"],
    "platformer": [
        "platformer",
        "2d platformer",
        "3d platformer",
        "precision platformer",
        "metroidvania",
    ],
    "fighting": ["fighting", "2d fighter", "3d fighter", "beat 'em up"],
    "sports": ["sports", "football (soccer)", "basketball", "skateboarding", "golf"],
    "simulation": [
        "simulation",
        "farming sim",
        "city builder",
        "life sim",
        "management",
    ],
    "hidden_object": ["hidden object"],
    "visual_novel": ["visual novel"],
    "fmv": ["fmv"],
    "point_and_click": ["point & click"],
    "mystery_crime": ["detective", "mystery", "investigation", "crime", "noir"],
    "scifi_cyberpunk": ["sci-fi", "cyberpunk", "space", "mechs"],
    "otome_romance": ["otome", "dating sim", "romance"],
    "psych_horror": ["psychological horror"],
}

EDITION_STRIP = re.compile(
    r"\b(remastered|remake|definitive|complete|director'?s cut|goty|game of the year|edition|collection|bundle|ps4|ps5|playstation)\b",
    re.I,
)


def normalize_title(title: str) -> str:
    s = str(title or "").lower()
    s = re.sub(r"[®™©]", " ", s)
    s = re.sub(r"\([^)]*\)", " ", s)
    s = EDITION_STRIP.sub(" ", s)
    s = re.sub(r"[^a-z0-9äöüß]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def find_steam_app_id(title_en: str, title_de: str) -> int | None:
    for query_title in dict.fromkeys([title_en, title_de]):
        if not query_title or query_title == "Unbenannt":
            continue
        clean_query = re.sub(r"[®™©]", "", query_title).strip()
        url = "https://store.steampowered.com/api/storesearch/"
        try:
            res = http_session.get(
                url, params={"term": clean_query, "l": "english", "cc": "US"}, timeout=8
            )
            if res.status_code != 200:
                continue
            items = (res.json() or {}).get("items") or []
            if not items:
                continue

            wanted = normalize_title(query_title)
            for item in items:
                cand = normalize_title(item.get("name", ""))
                if cand and cand == wanted:
                    return int(item["id"])

            if len(wanted) >= 5:
                for item in items[:3]:
                    cand = normalize_title(item.get("name", ""))
                    if cand.startswith(wanted) or wanted.startswith(cand):
                        return int(item["id"])
        except requests.RequestException:
            continue
    return None


def resolve_steam_cover_url(app_id: int, details: dict) -> str | None:
    """
    Prüft zuerst das hochauflösende vertikale Steam-Box-Cover (600x900, wie PS4/PS5-Cover).
    Fällt sonst auf library_600x900.jpg oder header_image zurück.
    """
    candidates = [
        f"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{app_id}/library_600x900_2x.jpg",
        f"https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/library_600x900_2x.jpg",
        f"https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/library_600x900.jpg",
    ]
    for url in candidates:
        try:
            r = http_session.head(url, timeout=4)
            if r.status_code == 200:
                return url
        except requests.RequestException:
            continue

    header = str((details or {}).get("header_image") or "").strip()
    if header.startswith("http"):
        return header.split("?")[0]
    return None


def parse_steam_languages(raw_html: str) -> tuple[list[str], list[str]]:
    if not raw_html:
        return [], []
    main_part = raw_html.split("<br>")[0]
    text_langs = set()
    audio_langs = set()

    for token in main_part.split(","):
        has_audio = "<strong>*</strong>" in token or "*" in token
        clean = (
            re.sub(r"<[^>]+>", "", html.unescape(token))
            .replace("*", "")
            .strip()
            .lower()
        )
        code = STEAM_LANG_MAP.get(clean)
        if code:
            text_langs.add(code)
            if has_audio:
                audio_langs.add(code)

    return sorted(text_langs), sorted(audio_langs)


def fetch_steam_details(app_id: int) -> dict | None:
    url = "https://store.steampowered.com/api/appdetails"
    try:
        res = http_session.get(
            url, params={"appids": app_id, "l": "english", "cc": "US"}, timeout=8
        )
        if res.status_code != 200:
            return None
        payload = (res.json() or {}).get(str(app_id)) or {}
        if not payload.get("success"):
            return None
        return payload.get("data") or {}
    except requests.RequestException:
        return None


def fetch_steamspy_tags(app_id: int) -> list[str]:
    url = "https://steamspy.com/api.php"
    try:
        res = http_session.get(
            url, params={"request": "appdetails", "appid": app_id}, timeout=8
        )
        if res.status_code != 200:
            return []
        tags_dict = (res.json() or {}).get("tags") or {}
        if not isinstance(tags_dict, dict):
            return []
        sorted_tags = sorted(tags_dict.items(), key=lambda x: int(x[1]), reverse=True)
        return [str(k).strip() for k, _ in sorted_tags[:12]]
    except Exception:
        return []


def derive_home_tags(tags: list[str], steam_genres: list[str]) -> list[str]:
    tag_set = {t.lower() for t in (tags + steam_genres)}
    found = []
    for slug, triggers in HOME_TAG_RULES.items():
        if any(t in tag_set for t in triggers):
            found.append(slug)
    return found[:3]


def detect_trophy_native_locales(game_uuid: str) -> list[str]:
    res = (
        supabase.table("game_achievements")
        .select("trophy_name, trophy_desc")
        .eq("game_id", game_uuid)
        .limit(15)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return []

    native = {"en"}
    for r in rows:
        names = r.get("trophy_name") if isinstance(r.get("trophy_name"), dict) else {}
        descs = r.get("trophy_desc") if isinstance(r.get("trophy_desc"), dict) else {}
        en_n = str(names.get("en") or "").strip()
        en_d = str(descs.get("en") or "").strip()
        for lang in set(list(names.keys()) + list(descs.keys())):
            val_n = str(names.get(lang) or "").strip()
            val_d = str(descs.get(lang) or "").strip()
            if (val_n and val_n != en_n) or (val_d and val_d != en_d):
                native.add("zh-hans" if lang == "zh" else lang)
    return sorted(native)


def has_usable_cover(cover_obj: dict | None, cover_status: str | None) -> bool:
    if cover_status == "invalid":
        return False
    if not isinstance(cover_obj, dict):
        return False
    url = str(cover_obj.get("de") or cover_obj.get("en") or "").strip()
    return url.startswith("http")


def enrich_game(game: dict):
    game_uuid = game["id"]
    titles = game.get("spieltitel") if isinstance(game.get("spieltitel"), dict) else {}
    title_en = str(titles.get("en") or titles.get("de") or "Unbenannt").strip()
    title_de = str(titles.get("de") or title_en).strip()
    status_obj = dict(game.get("status") or {})

    app_id = game.get("steam_app_id") or find_steam_app_id(title_en, title_de)
    trophy_locales = detect_trophy_native_locales(game_uuid)

    if not app_id:
        status_obj["steam"] = "NOT_ON_STEAM"
        locales_payload = {
            "text": trophy_locales,
            "audio": [],
            "source": "trophies_only",
        }
        supabase.table("games").update(
            {"status": status_obj, "game_locales": locales_payload}
        ).eq("id", game_uuid).execute()
        print(
            f"  ⚪ [{title_de}] Nicht auf Steam -> Trophy-Sprachen ({len(trophy_locales)})."
        )
        return

    details = fetch_steam_details(app_id)
    tags = fetch_steamspy_tags(app_id)

    if not details:
        status_obj["steam"] = "DELISTED"
        locales_payload = {
            "text": trophy_locales,
            "audio": [],
            "source": "trophies_only",
        }
        supabase.table("games").update(
            {
                "steam_app_id": app_id,
                "status": status_obj,
                "game_locales": locales_payload,
            }
        ).eq("id", game_uuid).execute()
        print(
            f"  ⚠️ [{title_de}] AppID {app_id} delisted -> Trophy-Sprachen ({len(trophy_locales)})."
        )
        return

    steam_text, steam_audio = parse_steam_languages(
        details.get("supported_languages", "")
    )
    combined_text_locales = sorted(set(steam_text) | set(trophy_locales))

    developers = [str(d).strip() for d in (details.get("developers") or []) if d]
    publishers = [str(p).strip() for p in (details.get("publishers") or []) if p]
    steam_genres = [
        str(g.get("description", "")).strip()
        for g in (details.get("genres") or [])
        if isinstance(g, dict) and g.get("description")
    ]

    status_obj["steam"] = "COMPLETED"
    update_payload = {
        "steam_app_id": app_id,
        "status": status_obj,
        "game_locales": {
            "text": combined_text_locales,
            "audio": steam_audio,
            "source": "steam+trophies",
        },
        "sub_genres": (tags or steam_genres)[:10],
    }

    if publishers and not str(game.get("publisher") or "").strip():
        update_payload["publisher"] = publishers[0]
    if developers and not str(game.get("entwickler") or "").strip():
        update_payload["entwickler"] = developers[0]

    # NEU: Steam-Cover holen, wenn das Spiel noch kein Cover hat oder das Cover invalid war!
    current_cover = (
        game.get("cover_url") if isinstance(game.get("cover_url"), dict) else {}
    )
    current_cover_status = game.get("cover_status")
    cover_added = False

    if not has_usable_cover(current_cover, current_cover_status):
        steam_cover = resolve_steam_cover_url(app_id, details)
        if steam_cover:
            next_cover = dict(current_cover)
            next_cover["de"] = steam_cover
            next_cover["en"] = steam_cover
            update_payload["cover_url"] = next_cover
            update_payload["cover_status"] = "unverified"
            update_payload["cover_notes"] = None
            cover_added = True

    supabase.table("games").update(update_payload).eq("id", game_uuid).execute()

    home_tags = derive_home_tags(tags, steam_genres)
    if home_tags and not game.get("home_tags_locked"):
        try:
            supabase.rpc(
                "tb_set_home_tags_from_model",
                {"p_id": game_uuid, "p_tags": home_tags},
            ).execute()
        except Exception:
            pass

    cover_msg = " + 🖼️ Cover gesetzt!" if cover_added else ""
    print(
        f"  ✅ [{title_de}] AppID={app_id} | Pub='{publishers[0] if publishers else '—'}' "
        f"| Tags={home_tags} | Sprachen={len(combined_text_locales)}{cover_msg}"
    )


def fetch_next_batch(limit: int = 100) -> list[dict]:
    # WICHTIG: Ohne tote Spalte 'genre', dafür mit 'cover_url, cover_status'
    cols = "id, spieltitel, entwickler, publisher, home_tags_locked, status, steam_app_id, cover_url, cover_status"
    for guide_state in ("PUBLISHED", "FERTIG"):
        res = (
            supabase.table("games")
            .select(cols)
            .eq("status->>guide_de", guide_state)
            .is_("status->>steam", "null")
            .limit(limit)
            .execute()
        )
        if res.data:
            return res.data

    res = (
        supabase.table("games")
        .select(cols)
        .is_("status->>steam", "null")
        .limit(limit)
        .execute()
    )
    return res.data or []


def main():
    print(
        "🚀 Starte Steam-Metadaten-, Cover- & Sprach-Enricher (PUBLISHED -> FERTIG -> Rest)..."
    )
    total = 0
    while True:
        batch = fetch_next_batch(100)
        if not batch:
            print(
                f"\n🏁 Alle Spiele mit Steam-Metadaten angereichert ({total} verarbeitet)."
            )
            break

        print(f"\n📦 Verarbeite Batch mit {len(batch)} Spielen...")
        for game in batch:
            enrich_game(game)
            total += 1
            time.sleep(DELAY_BETWEEN_GAMES)


if __name__ == "__main__":
    main()
