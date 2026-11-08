#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
02.1_Steam_Catalog_Harvester.py (v3 - Paginiert, Altersfreigaben, 600x900-Cover & PSN-Vererbung)
  1. Katalog + Ratings füllen:       python 02.1_Steam_Catalog_Harvester.py --seed
  2. Achievements + Fingerabdruck:   python 02.1_Steam_Catalog_Harvester.py --achievements
  3. 16 Sprachen für Abweichler:     python 02.1_Steam_Catalog_Harvester.py --achievements --all-langs
"""

import os
import sys
import re
import time
import urllib.parse
import requests
from pathlib import Path
from dotenv import load_dotenv, find_dotenv
from supabase import create_client, Client

_ROOT_ENV = Path(r"C:\Temp\TrophyBase\.env")
if _ROOT_ENV.exists():
    load_dotenv(_ROOT_ENV, override=True)
else:
    _parent_envs = [
        p / ".env" for p in Path(__file__).resolve().parents if (p / ".env").exists()
    ]
    load_dotenv(_parent_envs[0] if _parent_envs else find_dotenv(), override=True)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
STEAM_API_KEY = os.getenv("STEAM_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

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

RATING_BOARDS = (
    "usk",
    "pegi",
    "esrb",
    "cero",
    "grac",
    "dejus",
    "csrr",
    "steam_germany",
)


def fetch_all_rows(table_name: str, columns: str) -> list[dict]:
    """Umgeht das 1.000-Zeilen-Standardlimit von Supabase."""
    rows = []
    page_size = 1000
    offset = 0
    while True:
        res = (
            supabase.table(table_name)
            .select(columns)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def normalize_compare_str(s: str) -> str:
    s = str(s or "").lower().strip()
    s = re.sub(
        r"\b(ps4|ps5|ps3|ps vita|playstation|edition|remastered|director's cut)\b",
        "",
        s,
    )
    s = re.sub(r"[^a-z0-9äöüß]+", "", s)
    return s


def extract_steam_age_ratings(app_data: dict) -> tuple[dict, int | None]:
    raw_ratings = app_data.get("ratings") or {}
    clean_ratings = {}
    for board in RATING_BOARDS:
        info = raw_ratings.get(board)
        if isinstance(info, dict) and info.get("rating"):
            entry = {"rating": str(info["rating"]).strip().lower()}
            if info.get("descriptors"):
                desc = ", ".join(
                    line.strip()
                    for line in str(info["descriptors"]).splitlines()
                    if line.strip()
                )
                if desc:
                    entry["descriptors"] = desc
            clean_ratings[board] = entry

    usk_age = None
    for candidate_board in ("usk", "steam_germany", "pegi"):
        r_val = clean_ratings.get(candidate_board, {}).get("rating", "")
        if r_val.isdigit():
            num = int(r_val)
            if num in (0, 3, 6, 7, 12, 16, 18):
                usk_age = 0 if num == 3 else (6 if num == 7 else num)
                break

    if usk_age is None:
        req = str(app_data.get("required_age") or "").strip()
        if req.isdigit() and int(req) > 0:
            usk_age = int(req)

    return clean_ratings, usk_age


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


def extract_steam_fsk(details: dict) -> int | None:
    """
    Liest aus den Steam appdetails (cc=DE) zuerst die offizielle USK-Wertung,
    fällt sonst auf PEGI / DEJUS / required_age zurück und normiert streng auf {0, 6, 12, 16, 18}.
    """
    if not isinstance(details, dict):
        return None

    raw_age = None
    ratings = details.get("ratings")
    if isinstance(ratings, dict):
        for agency in ("usk", "pegi", "dejus", "csrr"):
            block = ratings.get(agency)
            if isinstance(block, dict) and block.get("rating") is not None:
                m = re.search(r"\d+", str(block.get("rating")))
                if m:
                    raw_age = int(m.group(0))
                    break

    if raw_age is None and details.get("required_age") is not None:
        m = re.search(r"\d+", str(details.get("required_age")))
        if m:
            num = int(m.group(0))
            # Steam liefert required_age=0 oft auch bei ungeprüften Spielen;
            # 0 nur akzeptieren, wenn explizit USK 0 vorlag.
            if num > 0:
                raw_age = num

    if raw_age is None:
        return None

    # Auf deutsche FSK/USK-Stufen (0, 6, 12, 16, 18) normieren (z. B. PEGI 3 -> 0, PEGI 7 -> 6, 17 -> 16)
    if raw_age >= 18:
        return 18
    if raw_age >= 16:
        return 16
    if raw_age >= 12:
        return 12
    if raw_age >= 6:
        return 6
    return 0


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


def step2_fetch_achievements_and_fingerprint(
    limit_apps: int = 500, fetch_all_16_langs: bool = False
):
    if not STEAM_API_KEY:
        sys.exit(
            "❌ Fehler: STEAM_API_KEY fehlt in der .env für Stufe 2 (--achievements)!"
        )

    # Priorisiere Spiele, die bereits mit einem unserer Sony-Spiele (linked_game_id) verknüpft sind!
    res = (
        supabase.table("catalog_steam_games")
        .select("*")
        .eq("crawl_status", "CATALOG_ONLY")
        .not_.is_("linked_game_id", "null")
        .gt("achievement_count", 0)
        .limit(limit_apps)
        .execute()
    )
    apps = res.data or []
    if not apps:
        # Fallback: Auch unverknüpfte Steam-Spiele abarbeiten, falls alle verknüpften fertig sind
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
        f"🏆 Stufe 2: Lade Achievements ({', '.join(langs_to_fetch)}) & prüfe Sony-Fingerabdruck für {len(apps)} Steam-Spiele...\n"
    )

    for idx, app in enumerate(apps, 1):
        app_id = app["app_id"]
        linked_gid = app.get("linked_game_id")

        # Optional: Falls age_ratings noch leer ist, kurz über appdetails nachziehen (inkl. USK!)
        if not app.get("age_ratings"):
            details = fetch_steam_app_details(app_id)
            if details:
                age_ratings, usk_age = extract_steam_age_ratings(details)
                if age_ratings or usk_age is not None:
                    supabase.table("catalog_steam_games").update(
                        {"age_ratings": age_ratings, "usk_age": usk_age}
                    ).eq("app_id", app_id).execute()
                    if linked_gid:
                        supabase.table("games").update(
                            {"age_ratings": age_ratings, "usk_age": usk_age}
                        ).eq("id", linked_gid).execute()

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

        # 3. PSN-Trophäen zum Abgleich & Vererben laden (trophy_name & platform_achievement_id)
        psn_by_norm_name = {}
        psn_by_norm_desc = {}
        if linked_gid:
            psn_res = (
                supabase.table("game_achievements")
                .select("*")
                .eq("game_id", linked_gid)
                .execute()
            )
            for pt in psn_res.data or []:
                r_lbl = str(pt.get("trophy_type") or "").lower()
                if r_lbl == "platinum":
                    continue
                n_obj = pt.get("trophy_name") or {}
                d_obj = pt.get("trophy_desc") or {}
                if isinstance(n_obj, dict):
                    for loc_val in (n_obj.get("de"), n_obj.get("en")):
                        norm_n = normalize_compare_str(loc_val)
                        if norm_n:
                            psn_by_norm_name[norm_n] = pt
                if isinstance(d_obj, dict):
                    for loc_val in (d_obj.get("de"), d_obj.get("en")):
                        norm_d = normalize_compare_str(loc_val)
                        if len(norm_d) >= 12:
                            psn_by_norm_desc[norm_d] = pt

        ach_rows = []
        matched_hits = 0
        unmatched_count = 0

        for api_name in all_api_names:
            a_en = en_map.get(api_name) or {}
            a_de = de_map.get(api_name) or a_en

            name_de = str(a_de.get("displayName") or "").strip()
            name_en = str(a_en.get("displayName") or name_de).strip()
            desc_de = str(a_de.get("description") or "").strip()
            desc_en = str(a_en.get("description") or desc_de).strip()

            # Match über Name (DE/EN) ODER identische Beschreibung (falls Name leicht abweicht)
            matched_pt = (
                psn_by_norm_name.get(normalize_compare_str(name_en))
                or psn_by_norm_name.get(normalize_compare_str(name_de))
                or psn_by_norm_desc.get(normalize_compare_str(desc_en))
                or psn_by_norm_desc.get(normalize_compare_str(desc_de))
            )

            name_jsonb = {"en": name_en, "de": name_de}
            desc_jsonb = {"en": desc_en, "de": desc_de}

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

            matched_tid = None
            tip_jsonb = {}
            long_tip_jsonb = None
            inherited_platform_game_id = None
            inherited_gruppe = None
            if matched_pt:
                matched_hits += 1
                matched_tid = (
                    str(matched_pt.get("platform_achievement_id") or "").strip() or None
                )
                inherited_platform_game_id = matched_pt.get("platform_game_id")
                inherited_gruppe = matched_pt.get("trophy_gruppe")
                psn_names = matched_pt.get("trophy_name") or {}
                psn_descs = matched_pt.get("trophy_desc") or {}
                psn_tips = matched_pt.get("guide_tip") or {}
                psn_long_tips = matched_pt.get("Guide-Tip-lang")
                if isinstance(psn_tips, dict):
                    tip_jsonb = dict(psn_tips)
                if isinstance(psn_long_tips, dict):
                    long_tip_jsonb = dict(psn_long_tips)
                for lc in STEAM_LANG_MAP.keys():
                    if (
                        isinstance(psn_names, dict)
                        and lc not in name_jsonb
                        and psn_names.get(lc)
                    ):
                        name_jsonb[lc] = psn_names[lc]
                    if (
                        isinstance(psn_descs, dict)
                        and lc not in desc_jsonb
                        and psn_descs.get(lc)
                    ):
                        desc_jsonb[lc] = psn_descs[lc]
            else:
                unmatched_count += 1

            ach_rows.append(
                {
                    "app_id": app_id,
                    "api_name": api_name,
                    "trophy_name": name_jsonb,
                    "trophy_desc": desc_jsonb,
                    "guide_tip": tip_jsonb,
                    "Guide-Tip-lang": long_tip_jsonb,
                    "platform_game_id": inherited_platform_game_id,
                    "trophy_gruppe": inherited_gruppe,
                    "icon_url": a_en.get("icon") or a_de.get("icon"),
                    "icon_gray_url": a_en.get("icongray") or a_de.get("icongray"),
                    "is_hidden": bool(a_en.get("hidden")),
                    "global_percent": pct_map.get(api_name),
                    "matched_psn_trophy_id": matched_tid,
                    "fsk": extract_steam_fsk(details),
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
        note = f"{matched_hits}/{len(ach_rows)} Sony-Match ({confidence}%) | {unmatched_count} Abweichler"

        supabase.table("catalog_steam_games").update(
            {
                "achievement_count": len(ach_rows),
                "crawl_status": "ACHIEVEMENTS_LOADED",
                "match_confidence": confidence,
                "match_status": new_match_status,
                "match_notes": note,
                "fsk": extract_steam_fsk(details),
            }
        ).eq("app_id", app_id).execute()

        badge = (
            "🟢 VERIFIED"
            if new_match_status == "VERIFIED"
            else (
                "🟡 TEIL-MATCH"
                if new_match_status == "AUTO_CANDIDATE"
                else "🔴 EIGENER STACK"
            )
        )
        print(
            f"  [{idx}/{len(apps)}] {badge} [{app['title']}] (AppID {app_id}): {note}"
        )
        time.sleep(0.35)


if __name__ == "__main__":
    if "--achievements" in sys.argv:
        all_langs = "--all-langs" in sys.argv
        step2_fetch_achievements_and_fingerprint(
            limit_apps=500, fetch_all_16_langs=all_langs
        )
    else:
        print(
            "💡 Tipp: Starte jetzt Stufe 2 mit: python 02.1_Steam_Catalog_Harvester.py --achievements"
        )
