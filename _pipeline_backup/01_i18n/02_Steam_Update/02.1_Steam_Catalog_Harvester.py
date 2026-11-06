#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
02.1_Steam_Catalog_Harvester.py (v2 - Synchron mit 16 TrophyBase-Locales & Exakt-Matching)
  1. Katalog füllen:                 python 02.1_Steam_Catalog_Harvester.py --seed
  2. Achievements + Fingerabdruck:   python 02.1_Steam_Catalog_Harvester.py --achievements
  3. 16 Sprachen für Unmatched:      python 02.1_Steam_Catalog_Harvester.py --achievements --all-langs
"""

import os
import sys
import re
import time
import urllib.parse
import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
STEAM_API_KEY = os.getenv("STEAM_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Exakt deine 16 TrophyBase-Locales -> Offizielle Valve Steamworks API-Sprachcodes
STEAM_LANG_MAP = {
    "de": "german",
    "en": "english",
    "es": "spanish",
    "pt": "brazilian",
    "fr": "french",
    "it": "italian",
    "nl": "dutch",
    "pl": "polish",
    "ru": "russian",
    "sv": "swedish",
    "fi": "finnish",
    "ar": "arabic",
    "ja": "japanese",
    "ko": "koreana",
    "zh-hans": "schinese",
    "zh-hant": "tchinese",
}


def normalize_compare_str(s: str) -> str:
    """Normiert Trophäen-/Spielnamen für den Fingerabdruck-Vergleich."""
    s = str(s or "").lower().strip()
    s = re.sub(r"\b(ps4|ps5|ps3|ps vita|playstation|edition|remastered)\b", "", s)
    s = re.sub(r"[^a-z0-9äöüß]+", "", s)
    return s


def search_steam_store_for_title(title: str) -> list[dict]:
    q = urllib.parse.quote(title.strip())
    url = f"https://store.steampowered.com/api/storesearch/?term={q}&l=german&cc=DE"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            return []
        return r.json().get("items") or []
    except Exception:
        return []


def fetch_steam_app_details(app_id: int) -> dict | None:
    url = (
        f"https://store.steampowered.com/api/appdetails?appids={app_id}&cc=DE&l=german"
    )
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            return None
        payload = r.json().get(str(app_id), {})
        if not payload.get("success"):
            return None
        return payload.get("data") or {}
    except Exception:
        return None


def step1_seed_catalog_from_games(limit_games: int = 5000):
    print("🚀 Stufe 1: Suche Steam-Katalog-Einträge für unseren Spiele-Bestand...")

    existing_res = (
        supabase.table("catalog_steam_games").select("linked_game_id, app_id").execute()
    )
    already_linked = {
        r["linked_game_id"]
        for r in (existing_res.data or [])
        if r.get("linked_game_id")
    }
    known_app_ids = {
        int(r["app_id"]) for r in (existing_res.data or []) if r.get("app_id")
    }

    games_res = (
        supabase.table("games")
        .select("id, spieltitel, release_jahr, publisher, entwickler, spiel_typ")
        .neq("spiel_typ", "Unlesbar")
        .limit(limit_games)
        .execute()
    )
    games = [g for g in (games_res.data or []) if g["id"] not in already_linked]
    print(f"📦 Prüfe {len(games)} Spiele gegen den Steam-Katalog...\n")

    inserted = 0
    for idx, g in enumerate(games, 1):
        t_obj = g.get("spieltitel") if isinstance(g.get("spieltitel"), dict) else {}
        title = (t_obj.get("en") or t_obj.get("de") or "").strip()
        if not title or len(title) < 2:
            continue

        hits = search_steam_store_for_title(title)
        if not hits:
            time.sleep(0.4)
            continue

        norm_target = normalize_compare_str(title)
        # Bevorzuge exakte Namens-Treffer!
        exact_hits = [
            h
            for h in hits[:5]
            if h.get("type") == "app"
            and normalize_compare_str(h.get("name")) == norm_target
        ]
        candidates = (
            exact_hits
            if exact_hits
            else [h for h in hits[:1] if h.get("type") == "app"]
        )

        linked_already_for_this_game = False
        for cand in candidates:
            app_id = int(cand["id"])
            if app_id in known_app_ids:
                continue

            details = fetch_steam_app_details(app_id)
            if not details or details.get("type") != "game":
                continue

            steam_title = details.get("name") or cand.get("name") or title
            is_exact_title = normalize_compare_str(steam_title) == norm_target

            ach_total = int((details.get("achievements") or {}).get("total") or 0)
            rel_info = details.get("release_date") or {}
            rel_date_str = str(rel_info.get("date") or "")
            year_match = re.search(r"\b(19\d\d|20\d\d)\b", rel_date_str)
            rel_year = int(year_match.group(1)) if year_match else None
            is_unreleased = bool(rel_info.get("coming_soon"))

            devs = ", ".join(details.get("developers") or [])[:200] or None
            pubs = ", ".join(details.get("publishers") or [])[:200] or None
            cover = (
                details.get("header_image")
                or f"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{app_id}/library_600x900.jpg"
            )

            # Verhindert, dass Teil 2 / Spin-offs dieselbe linked_game_id bekommen!
            should_link = is_exact_title and not linked_already_for_this_game
            if should_link:
                linked_already_for_this_game = True

            row = {
                "app_id": app_id,
                "title": steam_title,
                "release_year": rel_year,
                "release_date_raw": rel_date_str,
                "is_unreleased": is_unreleased,
                "developer": devs,
                "publisher": pubs,
                "cover_url": cover,
                "achievement_count": ach_total,
                "linked_game_id": g["id"] if should_link else None,
                "match_status": "AUTO_CANDIDATE" if should_link else "UNLINKED",
                "crawl_status": "CATALOG_ONLY" if ach_total > 0 else "NO_ACHIEVEMENTS",
            }
            supabase.table("catalog_steam_games").upsert(
                row, on_conflict="app_id"
            ).execute()
            known_app_ids.add(app_id)
            inserted += 1
            print(
                f"  [{idx}/{len(games)}] ✅ Steam AppID {app_id}: '{row['title']}' ({rel_year or '?'}) | {ach_total} Achievements"
            )
            time.sleep(0.5)

    print(
        f"\n🎯 Stufe 1 fertig: {inserted} Steam-Spiele sicher in 'catalog_steam_games' angelegt."
    )


def step2_fetch_achievements_and_fingerprint(
    limit_apps: int = 100, fetch_all_16_langs: bool = False
):
    if not STEAM_API_KEY:
        sys.exit(
            "❌ Fehler: STEAM_API_KEY fehlt in der .env für Stufe 2 (--achievements)!"
        )

    res = (
        supabase.table("catalog_steam_games")
        .select("*")
        .eq("crawl_status", "CATALOG_ONLY")
        .gt("achievement_count", 0)
        .limit(limit_apps)
        .execute()
    )
    apps = res.data or []
    langs_to_fetch = list(STEAM_LANG_MAP.keys()) if fetch_all_16_langs else ["en", "de"]
    print(
        f"🏆 Stufe 2: Lade Achievements ({', '.join(langs_to_fetch)}) & prüfe Fingerabdruck für {len(apps)} Steam-Spiele...\n"
    )

    for app in apps:
        app_id = app["app_id"]
        linked_gid = app.get("linked_game_id")

        # 1. Globale Seltenheits-Prozente holen
        pct_map = {}
        try:
            r_pct = requests.get(
                f"https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid={app_id}",
                timeout=10,
            )
            if r_pct.status_code == 200:
                for p in (
                    r_pct.json().get("achievementpercentages", {}).get("achievements")
                    or []
                ):
                    pct_map[p["name"]] = round(float(p.get("percent") or 0.0), 2)
        except Exception:
            pass

        # 2. Schema in den gewünschten Sprachen abrufen
        schemas_by_lang = {}
        for lang_code in langs_to_fetch:
            steam_lang = STEAM_LANG_MAP[lang_code]
            url = (
                f"https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/"
                f"?key={STEAM_API_KEY}&appid={app_id}&l={steam_lang}"
            )
            try:
                r_sch = requests.get(url, timeout=10)
                if r_sch.status_code == 200:
                    ach_list = (
                        r_sch.json()
                        .get("game", {})
                        .get("availableGameStats", {})
                        .get("achievements")
                        or []
                    )
                    schemas_by_lang[lang_code] = {
                        a["name"]: a for a in ach_list if "name" in a
                    }
            except Exception:
                pass

        en_map = schemas_by_lang.get("en") or {}
        de_map = schemas_by_lang.get("de") or en_map
        all_api_names = list(en_map.keys() or de_map.keys())

        if not all_api_names:
            supabase.table("catalog_steam_games").update(
                {"crawl_status": "NO_ACHIEVEMENTS"}
            ).eq("app_id", app_id).execute()
            continue

        # 3. PSN-Trophäen (inkl. aller 16 fertigen Sprachen!) zum Abgleich & Vererben laden
        psn_by_norm_name = {}
        if linked_gid:
            psn_res = (
                supabase.table("game_achievements")
                .select("trophy_id, name, trophy_desc, guide_tip, rarity_label")
                .eq("game_id", linked_gid)
                .execute()
            )
            for pt in psn_res.data or []:
                if str(pt.get("rarity_label") or "").lower() == "platinum":
                    continue
                n_obj = pt.get("name") if isinstance(pt.get("name"), dict) else {}
                for loc_val in (n_obj.get("de"), n_obj.get("en")):
                    norm_n = normalize_compare_str(loc_val)
                    if norm_n:
                        psn_by_norm_name[norm_n] = pt

        ach_rows = []
        matched_hits = 0
        for api_name in all_api_names:
            a_en = en_map.get(api_name) or {}
            a_de = de_map.get(api_name) or a_en

            name_de = str(a_de.get("displayName") or "").strip()
            name_en = str(a_en.get("displayName") or name_de).strip()
            desc_de = str(a_de.get("description") or "").strip()
            desc_en = str(a_en.get("description") or desc_de).strip()

            matched_pt = psn_by_norm_name.get(
                normalize_compare_str(name_en)
            ) or psn_by_norm_name.get(normalize_compare_str(name_de))

            # Start-JSONB mit den echten Steam-Werten
            name_jsonb = {"en": name_en, "de": name_de}
            desc_jsonb = {"en": desc_en, "de": desc_de}

            # Falls alle 16 Sprachen von Steam geladen wurden: Nur echte Übersetzungen übernehmen!
            for lc in langs_to_fetch:
                if lc in ("en", "de"):
                    continue
                a_lc = (schemas_by_lang.get(lc) or {}).get(api_name) or {}
                n_lc = str(a_lc.get("displayName") or "").strip()
                d_lc = str(a_lc.get("description") or "").strip()
                if n_lc and n_lc != name_en:
                    name_jsonb[lc] = n_lc
                if d_lc and d_lc != desc_en:
                    desc_jsonb[lc] = d_lc

            # TURBO: Wenn mit PSN-Trophäe gematcht, erben wir alle fehlenden der 16 Sprachen direkt aus PSN!
            matched_tid = None
            tip_jsonb = {}
            if matched_pt:
                matched_hits += 1
                matched_tid = str(matched_pt["trophy_id"])
                psn_names = (
                    matched_pt.get("name")
                    if isinstance(matched_pt.get("name"), dict)
                    else {}
                )
                psn_descs = (
                    matched_pt.get("trophy_desc")
                    if isinstance(matched_pt.get("trophy_desc"), dict)
                    else {}
                )
                psn_tips = (
                    matched_pt.get("guide_tip")
                    if isinstance(matched_pt.get("guide_tip"), dict)
                    else {}
                )
                tip_jsonb = dict(psn_tips)
                for lc in STEAM_LANG_MAP.keys():
                    if lc not in name_jsonb and psn_names.get(lc):
                        name_jsonb[lc] = psn_names[lc]
                    if lc not in desc_jsonb and psn_descs.get(lc):
                        desc_jsonb[lc] = psn_descs[lc]

            ach_rows.append(
                {
                    "app_id": app_id,
                    "api_name": api_name,
                    "name": name_jsonb,
                    "trophy_desc": desc_jsonb,
                    "guide_tip": tip_jsonb,
                    "icon_url": a_en.get("icon") or a_de.get("icon"),
                    "icon_gray_url": a_en.get("icongray") or a_de.get("icongray"),
                    "is_hidden": bool(a_en.get("hidden")),
                    "global_percent": pct_map.get(api_name),
                    "matched_psn_trophy_id": matched_tid,
                }
            )

        for i in range(0, len(ach_rows), 200):
            supabase.table("catalog_steam_achievements").upsert(
                ach_rows[i : i + 200], on_conflict="app_id,api_name"
            ).execute()

        confidence = round((matched_hits / max(len(ach_rows), 1)) * 100.0, 2)
        new_match_status = (
            "VERIFIED"
            if confidence >= 80.0
            else ("AUTO_CANDIDATE" if confidence >= 30.0 else "SEPARATE_STACK")
        )
        note = f"{matched_hits}/{len(ach_rows)} Achievements stimmen namentlich mit PSN überein ({confidence}%)"

        supabase.table("catalog_steam_games").update(
            {
                "achievement_count": len(ach_rows),
                "crawl_status": "ACHIEVEMENTS_LOADED",
                "match_confidence": confidence,
                "match_status": new_match_status,
                "match_notes": note,
            }
        ).eq("app_id", app_id).execute()

        badge = (
            "🟢 VERIFIED"
            if new_match_status == "VERIFIED"
            else (
                "🟡 CHECK" if new_match_status == "AUTO_CANDIDATE" else "🔴 ABWEICHEND"
            )
        )
        print(f"  {badge} [{app['title']}] (AppID {app_id}): {note}")
        time.sleep(0.5)


if __name__ == "__main__":
    if "--achievements" in sys.argv:
        all_langs = "--all-langs" in sys.argv
        step2_fetch_achievements_and_fingerprint(
            limit_apps=200, fetch_all_16_langs=all_langs
        )
    else:
        step1_seed_catalog_from_games(limit_games=5000)
