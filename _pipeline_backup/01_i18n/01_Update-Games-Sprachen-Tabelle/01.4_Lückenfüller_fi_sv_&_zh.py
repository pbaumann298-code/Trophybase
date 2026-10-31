#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
01.4_sony_missing_langs_backfill.py
Gezielter Delta-Läufer (analog zu 01.3_trophy-Icons.py):
- Sucht über 'tb_get_games_missing_sony_langs' alle PROCESSED-Spiele, denen noch Sprachen
  aus dem 17er-Set (insb. fi, sv, zh-hans, zh-hant, ar, tr) fehlen.
- Fragt bei Sony NUR die fehlenden Sprachen ab (statt alle 17 neu zu laden!).
- Priorisiert PUBLISHED-Guides -> Evergreen/Premium -> Katalog.
- Merged die neuen Sprach-Keys per Bulk-RPC 'tb_merge_sony_lang_backfill' verlustfrei in
  games.spieltitel und game_achievements (trophy_name, trophy_desc, spielname).
"""

import os
import sys
import time
import json
import threading
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv
from psnawp_api import PSNAWP
from supabase import create_client, Client

load_dotenv()

MAX_WORKERS = 5
DELAY_BETWEEN_GAMES = 0.45
TOKEN_MAX_AGE_SECONDS = 45 * 60

TARGET_LANGUAGES = {
    "en": "en-US",
    "de": "de-DE",
    "fr": "fr-FR",
    "es": "es-ES",
    "it": "it-IT",
    "nl": "nl-NL",
    "pt": "pt-BR",
    "pl": "pl-PL",
    "ru": "ru-RU",
    "ja": "ja-JP",
    "ko": "ko-KR",
    "zh-hant": "zh-Hant",
    "zh-hans": "zh-Hans",
    "fi": "fi-FI",
    "sv": "sv-SE",
    "tr": "tr-TR",
    "ar": "ar-AE",
}

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
token_lock = threading.Lock()


def get_valid_access_token(force_refresh: bool = False) -> str:
    """Thread-sicherer Sony OAuth-Handshake (alle 45 Min. oder bei HTTP 401)."""
    global psnawp, current_token, token_timestamp
    with token_lock:
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
        online_id = client.online_id

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


def normalize_trophy_group_id(raw) -> str:
    gid = str(raw or "default").strip() or "default"
    return "default" if gid.lower() in ("all", "base") else gid


def parse_trophy_group_names(meta: dict, fallback_title: str) -> dict:
    names = {}
    title = str((meta or {}).get("trophyTitleName") or fallback_title or "").strip()
    for grp in (meta or {}).get("trophyGroups") or []:
        if not isinstance(grp, dict):
            continue
        gid = normalize_trophy_group_id(grp.get("trophyGroupId"))
        gname = str(grp.get("trophyGroupName") or "").strip() or title
        if gname:
            names[gid] = gname
    if title and "default" not in names:
        names["default"] = title
    return names


def apply_zh_fallback(lang_map: dict) -> dict:
    if not isinstance(lang_map, dict):
        return {}
    zh_val = lang_map.get("zh-hans") or lang_map.get("zh-hant") or lang_map.get("zh")
    if zh_val:
        lang_map.setdefault("zh", zh_val)
        lang_map.setdefault("zh-hans", zh_val)
        lang_map.setdefault("zh-hant", zh_val)
    return lang_map


def sony_get(url: str, accept_lang: str, service: str, retries: int = 3):
    for attempt in range(retries):
        token = get_valid_access_token(force_refresh=False)
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept-Language": accept_lang,
            "User-Agent": "Mozilla/5.0",
        }
        try:
            res = requests.get(
                url, headers=headers, params={"npServiceName": service}, timeout=8
            )
            if res.status_code == 200:
                return res
            if res.status_code == 401:
                get_valid_access_token(force_refresh=True)
                continue
            if res.status_code in (400, 404):
                return res
            if res.status_code == 429:
                time.sleep(2.0 * (attempt + 1))
                continue
        except requests.RequestException:
            time.sleep(1.5 * (attempt + 1))
    return None


def fetch_missing_lang_worker(
    lang_key: str, accept_lang: str, npwr_id: str, service: str, fallback_title: str
):
    url_meta = f"https://m.np.playstation.com/api/trophy/v1/npCommunicationIds/{npwr_id}/trophyGroups"
    res_meta = sony_get(url_meta, accept_lang, service)

    loc_title = fallback_title
    group_names = {}
    if res_meta and res_meta.status_code == 200:
        meta = res_meta.json() or {}
        loc_title = str(meta.get("trophyTitleName") or fallback_title).strip()
        group_names = parse_trophy_group_names(meta, loc_title)

    url_trophies = f"https://m.np.playstation.com/api/trophy/v1/npCommunicationIds/{npwr_id}/trophyGroups/all/trophies"
    res_trophies = sony_get(url_trophies, accept_lang, service)

    if not res_trophies or res_trophies.status_code != 200:
        return None

    return {
        "lang_key": lang_key,
        "title": loc_title,
        "group_names": group_names,
        "trophies": res_trophies.json().get("trophies", []),
    }


def backfill_game_languages(game: dict) -> tuple[int, list[str], bool]:
    game_uuid = game["id"]
    npwr_list = extract_npwr_list(game.get("platform_game_id"))
    hw = str(game.get("hardware") or "").upper()
    existing_titles = (
        dict(game.get("spieltitel")) if isinstance(game.get("spieltitel"), dict) else {}
    )
    title_en = existing_titles.get("en") or existing_titles.get("de") or "Unbenannt"
    missing_langs = [
        lg for lg in (game.get("missing_langs") or []) if lg in TARGET_LANGUAGES
    ]

    if not npwr_list or not missing_langs:
        supabase.rpc(
            "tb_merge_sony_lang_backfill",
            {"p_game_id": game_uuid, "p_titles": existing_titles, "p_achievements": []},
        ).execute()
        return 0, [], True

    primary_npwr = npwr_list[0]
    services = (
        ["trophy", "trophy2"]
        if any(x in hw for x in ("PS3", "VITA", "PSP"))
        else ["trophy2", "trophy"]
    )

    # 1. Service-Typ mit der ersten fehlenden Sprache ermitteln (spart Extra-Check-Request!)
    first_lang = missing_langs[0]
    first_accept = TARGET_LANGUAGES[first_lang]
    service = None
    saw_404 = False

    url_probe = f"https://m.np.playstation.com/api/trophy/v1/npCommunicationIds/{primary_npwr}/trophyGroups"
    for svc in services:
        res_check = sony_get(url_probe, first_accept, svc)
        if res_check and res_check.status_code == 200:
            service = svc
            break
        if res_check and res_check.status_code in (400, 404):
            saw_404 = True

    if not service:
        if saw_404:
            # Falls NPWR bei Sony komplett offline ist, mit bestehenden Titeln als DONE markieren
            supabase.rpc(
                "tb_merge_sony_lang_backfill",
                {
                    "p_game_id": game_uuid,
                    "p_titles": apply_zh_fallback(existing_titles),
                    "p_achievements": [],
                },
            ).execute()
            return 0, [], True
        return 0, [], False

    new_titles = dict(existing_titles)
    ach_patches: dict[str, dict] = {}
    fetched_langs = []

    with ThreadPoolExecutor(
        max_workers=min(MAX_WORKERS, len(missing_langs))
    ) as executor:
        futures = {
            executor.submit(
                fetch_missing_lang_worker,
                l_key,
                TARGET_LANGUAGES[l_key],
                primary_npwr,
                service,
                title_en,
            ): l_key
            for l_key in missing_langs
        }

        for future in as_completed(futures):
            res = future.result()
            if not res:
                continue
            l_key = res["lang_key"]
            fetched_langs.append(l_key)

            if res["title"]:
                new_titles[l_key] = res["title"]

            group_names = res.get("group_names") or {}
            for t in res["trophies"]:
                tid = str(t["trophyId"])
                group_id = normalize_trophy_group_id(t.get("trophyGroupId"))
                if tid not in ach_patches:
                    ach_patches[tid] = {
                        "tid": tid,
                        "names": {},
                        "descs": {},
                        "group_names": {},
                    }

                t_name = t.get("trophyName") or fallback_val(existing_titles, title_en)
                t_desc = t.get("trophyDetail") or ""
                if t_name:
                    ach_patches[tid]["names"][l_key] = t_name
                if t_desc:
                    ach_patches[tid]["descs"][l_key] = t_desc

                pack_name = group_names.get(group_id) or group_names.get("default")
                if pack_name:
                    ach_patches[tid]["group_names"][l_key] = pack_name

    # Falls keine einzige Sprache geladen werden konnte (temporärer Sony-Ausfall) -> nicht als DONE markieren
    if not fetched_langs:
        return 0, [], False

    # Sicherheitsnetz: Falls eine Sprache von Sony leer geliefert wurde, mit EN/ZH auffüllen,
    # damit das Spiel sauber alle 17 Keys besitzt.
    apply_zh_fallback(new_titles)
    en_fallback_title = new_titles.get("en") or title_en
    for req_l in missing_langs:
        new_titles.setdefault(req_l, en_fallback_title)

    ach_payload = []
    for tid, item in ach_patches.items():
        apply_zh_fallback(item["names"])
        apply_zh_fallback(item["descs"])
        apply_zh_fallback(item["group_names"])
        ach_payload.append(item)

    res_rpc = supabase.rpc(
        "tb_merge_sony_lang_backfill",
        {
            "p_game_id": game_uuid,
            "p_titles": new_titles,
            "p_achievements": ach_payload,
        },
    ).execute()

    updated_rows = res_rpc.data if isinstance(res_rpc.data, int) else len(ach_payload)
    return updated_rows, sorted(fetched_langs), True


def fallback_val(d: dict, default: str) -> str:
    return str(d.get("en") or d.get("de") or default).strip()


def main():
    get_valid_access_token(force_refresh=True)
    total_games = 0
    total_trophies = 0

    print(
        "🚀 Starte Sony 17-Sprachen-Lückenfüller (PUBLISHED -> Evergreen/Premium -> Katalog)..."
    )

    while True:
        res = supabase.rpc(
            "tb_get_games_missing_sony_langs", {"p_limit": 150}
        ).execute()
        games = res.data or []

        if not games:
            print(
                f"\n🏁 Komplett fertig! {total_games} Spiele auf alle 17 Sprachen nachgezogen ({total_trophies} Trophäen aktualisiert)."
            )
            break

        print(f"\n📦 Lade Batch mit {len(games)} Spielen...")

        for game in games:
            titles = (
                game.get("spieltitel")
                if isinstance(game.get("spieltitel"), dict)
                else {}
            )
            titel = titles.get("de") or titles.get("en") or "Unbenannt"
            g_status = game.get("guide_status") or "KATALOG"
            missing = game.get("missing_langs") or []

            try:
                updated_cnt, langs_done, ok = backfill_game_languages(game)
                if ok:
                    total_games += 1
                    total_trophies += updated_cnt
                    print(
                        f"  🌍 [{g_status}] {titel[:42]}: +{len(langs_done)} Spr. ({', '.join(langs_done)}) -> {updated_cnt} Trophäen ({total_games} Spiele gesamt)"
                    )
                else:
                    print(
                        f"  ⏭️ [{g_status}] {titel[:42]}: Übersprungen wegen temporärem Sony-Fehler (fehlend: {missing})"
                    )
            except Exception as e:
                print(f"  ❌ [{g_status}] Fehler bei {titel[:42]}: {e}")

            time.sleep(DELAY_BETWEEN_GAMES)


if __name__ == "__main__":
    main()
