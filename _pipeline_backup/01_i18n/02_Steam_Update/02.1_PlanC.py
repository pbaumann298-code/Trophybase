#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
02.1_Steam_Catalog_Harvester.py (v5 - Age-Gate-Bypass, robuster HTML-Parser & Store-Fallback)
  Starten mit:
    python 02.1_Steam_Catalog_Harvester.py --achievements
"""

import os
import sys
import re
import time
import html
import requests
from pathlib import Path
from dotenv import load_dotenv, find_dotenv
from supabase import create_client, Client

_ROOT_ENV = Path(r"C:\Temp\TrophyBase\.env")
if _ROOT_ENV.exists():
    load_dotenv(_ROOT_ENV, override=True)
else:
    _parent_envs = [p / ".env" for p in Path(__file__).resolve().parents if (p / ".env").exists()]
    load_dotenv(_parent_envs[0] if _parent_envs else find_dotenv(), override=True)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
STEAM_API_KEY = (os.getenv("STEAM_API_KEY") or "").strip()

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

http_session = requests.Session()
http_session.headers.update(
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
    }
)
# WICHTIG: Umgeht alle 16+/18+ Age-Gates auf steamcommunity.com & store.steampowered.com!
for domain in ("steamcommunity.com", "store.steampowered.com"):
    http_session.cookies.set("birthtime", "283993201", domain=domain)
    http_session.cookies.set("lastagecheckage", "1-January-1979", domain=domain)
    http_session.cookies.set("wants_mature_content", "1", domain=domain)
    http_session.cookies.set("mature_content", "1", domain=domain)

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
    s = str(s or "").lower().strip()
    s = re.sub(
        r"\b(ps4|ps5|ps3|ps vita|playstation|edition|remastered|director's cut)\b",
        "",
        s,
    )
    s = re.sub(r"[^a-z0-9äöüß]+", "", s)
    return s


def parse_achieve_blocks_from_html(raw_html: str) -> list[dict]:
    """
    Robuster Block-Parser für steamcommunity.com/stats/.../achievements.
    Funktioniert auch bei versteckten Achievements (ohne <h5>) und neuem Valve-DOM!
    """
    if not raw_html or "achieveRow" not in raw_html:
        return []

    parts = re.split(
        r'<div\s+class=["\'][^"\']*\bachieveRow\b[^"\']*["\'][^>]*>',
        raw_html,
        flags=re.I,
    )[1:]
    rows = []

    for block in parts:
        h3_m = re.search(r"<h3[^>]*>(.*?)</h3>", block, re.S | re.I)
        if not h3_m:
            continue
        title = html.unescape(re.sub(r"<[^>]+>", "", h3_m.group(1))).strip()
        if not title:
            continue

        h5_m = re.search(r"<h5[^>]*>(.*?)</h5>", block, re.S | re.I)
        desc = (
            html.unescape(re.sub(r"<[^>]+>", "", h5_m.group(1))).strip() if h5_m else ""
        )

        img_m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', block, re.I)
        icon_url = img_m.group(1).strip() if img_m else ""

        pct_m = re.search(
            r'class=["\']achievePercent["\'][^>]*>\s*([0-9.,]+)\s*%', block, re.I
        )
        pct_val = None
        if pct_m:
            try:
                pct_val = round(float(pct_m.group(1).replace(",", ".")), 2)
            except Exception:
                pct_val = None

        rows.append(
            {
                "displayName": title,
                "description": desc,
                "icon": icon_url,
                "percent": pct_val,
            }
        )
    return rows


def fetch_public_community_achievements(app_id: int, steam_lang: str) -> list[dict]:
    url = f"https://steamcommunity.com/stats/{app_id}/achievements/"
    try:
        r = http_session.get(
            url, params={"l": steam_lang}, timeout=12, allow_redirects=True
        )
        if r.status_code != 200:
            return []
        return parse_achieve_blocks_from_html(r.text)
    except Exception:
        return []


def fetch_store_highlighted_achievements(app_id: int, steam_lang: str) -> list[dict]:
    """Fallback über store.steampowered.com/api/appdetails, falls die Community-Seite gesperrt ist."""
    url = "https://store.steampowered.com/api/appdetails"
    try:
        r = http_session.get(
            url, params={"appids": app_id, "l": steam_lang, "cc": "DE"}, timeout=10
        )
        if r.status_code != 200:
            return []
        data = (r.json().get(str(app_id)) or {}).get("data") or {}
        highlighted = (data.get("achievements") or {}).get("highlighted") or []
        return [
            {
                "displayName": str(h.get("name") or "").strip(),
                "description": "",
                "icon": str(h.get("path") or "").strip(),
                "percent": None,
            }
            for h in highlighted
            if h.get("name")
        ]
    except Exception:
        return []


def fetch_schema_keyless_or_keyed(
    app_id: int, langs_to_fetch: list[str], pct_map: dict, psn_list: list[dict]
) -> tuple[dict[str, dict], list[str]]:
    schemas_by_lang: dict[str, dict] = {}

    # 1. PLAN A: Offizielle Steam Web API (falls Key vorhanden)
    if STEAM_API_KEY:
        for lang_code in langs_to_fetch:
            steam_lang = STEAM_LANG_MAP[lang_code]
            url = (
                f"https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/"
                f"?key={STEAM_API_KEY}&appid={app_id}&l={steam_lang}"
            )
            try:
                r_sch = http_session.get(url, timeout=10)
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
        if all_api_names:
            return schemas_by_lang, all_api_names

    # 2. PLAN B.1: Öffentliche Steam-Community-Seite (mit Age-Gate-Cookies & neuem Block-Parser)
    en_rows = fetch_public_community_achievements(app_id, "english")
    if en_rows:
        api_names = [f"ACH_{idx + 1:03d}" for idx in range(len(en_rows))]
        schemas_by_lang["en"] = {
            api_names[i]: {
                "name": api_names[i],
                "displayName": row["displayName"],
                "description": row["description"],
                "icon": row["icon"],
                "icongray": row["icon"],
                "hidden": 1 if not row["description"] else 0,
            }
            for i, row in enumerate(en_rows)
        }
        for i, row in enumerate(en_rows):
            if row["percent"] is not None:
                pct_map[api_names[i]] = row["percent"]

        for lang_code in langs_to_fetch:
            if lang_code == "en":
                continue
            loc_rows = fetch_public_community_achievements(
                app_id, STEAM_LANG_MAP[lang_code]
            )
            if len(loc_rows) == len(en_rows):
                schemas_by_lang[lang_code] = {
                    api_names[i]: {
                        "name": api_names[i],
                        "displayName": loc_rows[i]["displayName"],
                        "description": loc_rows[i]["description"],
                        "icon": loc_rows[i]["icon"] or en_rows[i]["icon"],
                    }
                    for i in range(len(en_rows))
                }
        return schemas_by_lang, api_names

    # 3. PLAN B.2: Wenn die Community-Seite gesperrt/redirected ist (wie manchmal bei Square Enix),
    #    nutzen wir GetGlobalAchievementPercentagesForApp + Sony-Trophäen-Abgleich + Store-Highlights!
    if pct_map and psn_list:
        api_names = list(pct_map.keys())
        # Wenn die Anzahl der Steam-Achievements zur Anzahl der Sony-Trophäen (ohne Platin) passt
        # oder die internen api_names den Sony-Namen ähneln:
        en_store = fetch_store_highlighted_achievements(app_id, "english")
        de_store = fetch_store_highlighted_achievements(app_id, "german")
        store_by_norm = {normalize_compare_str(x["displayName"]): x for x in en_store}

        schemas_by_lang["en"] = {}
        schemas_by_lang["de"] = {}

        for idx, api_key in enumerate(api_names):
            norm_key = normalize_compare_str(api_key)
            matched_psn = None
            for pt in psn_list:
                n_obj = pt.get("trophy_name") or {}
                if isinstance(n_obj, dict):
                    if (
                        normalize_compare_str(n_obj.get("en")) == norm_key
                        or normalize_compare_str(n_obj.get("de")) == norm_key
                    ):
                        matched_psn = pt
                        break
            if not matched_psn and len(api_names) == len(psn_list):
                matched_psn = psn_list[idx]

            if matched_psn:
                n_obj = matched_psn.get("trophy_name") or {}
                d_obj = matched_psn.get("trophy_desc") or {}
                en_title = (
                    (n_obj.get("en") or n_obj.get("de") or api_key)
                    if isinstance(n_obj, dict)
                    else api_key
                )
                de_title = (
                    (n_obj.get("de") or en_title)
                    if isinstance(n_obj, dict)
                    else api_key
                )
                en_desc = (d_obj.get("en") or "") if isinstance(d_obj, dict) else ""
                de_desc = (
                    (d_obj.get("de") or en_desc) if isinstance(d_obj, dict) else ""
                )
                st_hit = store_by_norm.get(normalize_compare_str(en_title)) or {}
                icon_u = st_hit.get("icon") or matched_psn.get("icon_url") or ""
            else:
                en_title = api_key
                de_title = api_key
                en_desc = ""
                de_desc = ""
                icon_u = ""

            schemas_by_lang["en"][api_key] = {
                "name": api_key,
                "displayName": en_title,
                "description": en_desc,
                "icon": icon_u,
                "icongray": icon_u,
                "hidden": 0,
            }
            schemas_by_lang["de"][api_key] = {
                "name": api_key,
                "displayName": de_title,
                "description": de_desc,
                "icon": icon_u,
                "icongray": icon_u,
                "hidden": 0,
            }
        return schemas_by_lang, api_names

    return {}, []


def step2_fetch_achievements_and_fingerprint(
    limit_apps: int = 500, fetch_all_16_langs: bool = False
):
    mode_str = (
        "🔑 PLAN A (Mit Steam API-Key)"
        if STEAM_API_KEY
        else "⚡ PLAN B v5 (Keyless + AgeGate-Bypass)"
    )
    print(f"🚀 Starte Stufe 2 im Modus: {mode_str}")

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
        f"🏆 Lade Achievements ({', '.join(langs_to_fetch)}) & prüfe Sony-Fingerabdruck für {len(apps)} Steam-Spiele...\n"
    )

    for idx, app in enumerate(apps, 1):
        app_id = app["app_id"]
        linked_gid = app.get("linked_game_id")

        # 1. PSN-Trophäen vorab laden (für Abgleich & Fallback)
        psn_list = []
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
                psn_list.append(pt)
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
                        if len(norm_d) >= 10:
                            psn_by_norm_desc[norm_d] = pt

        # 2. Globale Seltenheits-Prozente holen (öffentlich ohne Key)
        pct_map = {}
        try:
            r_pct = http_session.get(
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

        # 3. Schema holen
        schemas_by_lang, all_api_names = fetch_schema_keyless_or_keyed(
            app_id, langs_to_fetch, pct_map, psn_list
        )

        if not all_api_names:
            # WICHTIG: Niemals auf NO_ACHIEVEMENTS setzen, wenn Steam sagt achievement_count > 0!
            print(
                f"  ⏸️ [{idx}/{len(apps)}] [{app['title']}] (AppID {app_id}): Community-Seite geschützt (benötigt API-Key), überspringe..."
            )
            continue

        en_map = schemas_by_lang.get("en") or {}
        de_map = schemas_by_lang.get("de") or en_map

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

            matched_pt = (
                psn_by_norm_name.get(normalize_compare_str(name_en))
                or psn_by_norm_name.get(normalize_compare_str(name_de))
                or (
                    psn_by_norm_desc.get(normalize_compare_str(desc_en))
                    if desc_en
                    else None
                )
                or (
                    psn_by_norm_desc.get(normalize_compare_str(desc_de))
                    if desc_de
                    else None
                )
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
                matched_tid = str(matched_pt.get("platform_achievement_id") or "").strip() or None
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
                    if isinstance(psn_names, dict) and psn_names.get(lc):
                        if not name_jsonb.get(lc):
                            name_jsonb[lc] = psn_names[lc]
                    if isinstance(psn_descs, dict) and psn_descs.get(lc):
                        if (
                            not desc_jsonb.get(lc)
                            or "hidden" in desc_jsonb.get(lc, "").lower()
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
        time.sleep(0.4)


if __name__ == "__main__":
    all_langs = "--all-langs" in sys.argv
    step2_fetch_achievements_and_fingerprint(
        limit_apps=500, fetch_all_16_langs=all_langs
    )
