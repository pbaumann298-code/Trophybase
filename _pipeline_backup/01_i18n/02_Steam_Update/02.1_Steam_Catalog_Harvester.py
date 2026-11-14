#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
02.1_Steam_Catalog_Harvester.py (v4 - Full-Catalog Restlos-Edition)

Holt den kompletten Steam-Spielekatalog über die offizielle Steam Web API,
verknüpft automatisch Sony-Gegenstücke, filtert Spiele ohne Achievements parallel vor
und zieht restlos alle Achievements inkl. Seltenheit, FSK & Sony-Fingerabdruck.

Aufrufe:
  Komplett-Durchmarsch (Standard):  python 02.1_Steam_Catalog_Harvester.py
  Nur Stufe 1A (Katalog-Dump):      python 02.1_Steam_Catalog_Harvester.py --seed
  Nur Stufe 1B (Achievement-Radar): python 02.1_Steam_Catalog_Harvester.py --scan
  Nur Stufe 2  (Achievements):      python 02.1_Steam_Catalog_Harvester.py --achievements
  Alle 16 Sprachen direkt ziehen:   python 02.1_Steam_Catalog_Harvester.py --achievements --all-langs
  Store-Metadaten/FSK nachziehen:   python 02.1_Steam_Catalog_Harvester.py --enrich
"""

import os
import sys
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import requests
from requests.adapters import HTTPAdapter
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

SUPABASE_URL = (os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or "").strip()
SUPABASE_KEY = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
STEAM_API_KEY = (os.getenv("STEAM_API_KEY") or "").strip().strip('"').strip("'")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!")

if not STEAM_API_KEY:
    sys.exit("❌ Fehler: STEAM_API_KEY fehlt in der .env!")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

http_session = requests.Session()
_adapter = HTTPAdapter(pool_connections=24, pool_maxsize=24)
http_session.mount("https://", _adapter)
http_session.mount("http://", _adapter)
http_session.headers.update(
    {
        "User-Agent": "TrophyBaseCatalogHarvester/4.0",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
    }
)

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


def fetch_all_rows(table_name: str, columns: str, page_size: int = 1000) -> list[dict]:
    """Lädt paginiert alle Zeilen einer Supabase-Tabelle (> 1.000 Zeilen sicher)."""
    rows: list[dict] = []
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


def extract_steam_fsk(details: dict) -> int | None:
    """
    Liest aus Steam appdetails (cc=DE) zuerst USK / steam_germany,
    fällt sonst auf PEGI / DEJUS / CSRR / required_age zurück und normiert streng auf {0, 6, 12, 16, 18}.
    """
    if not isinstance(details, dict):
        return None

    raw_age = None
    ratings = details.get("ratings")
    if isinstance(ratings, dict):
        for agency in ("usk", "steam_germany", "pegi", "dejus", "csrr"):
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
            if num > 0:
                raw_age = num

    if raw_age is None:
        return None

    if raw_age >= 18:
        return 18
    if raw_age >= 16:
        return 16
    if raw_age >= 12:
        return 12
    if raw_age >= 6:
        return 6
    return 0


def parse_store_metadata(details: dict) -> dict:
    """Extrahiert saubere Katalog-Metadaten für catalog_steam_games aus appdetails."""
    meta: dict = {}
    if not isinstance(details, dict):
        return meta

    fsk_val = extract_steam_fsk(details)
    if fsk_val is not None:
        meta["fsk"] = fsk_val

    devs = [str(d).strip() for d in (details.get("developers") or []) if str(d).strip()]
    pubs = [str(p).strip() for p in (details.get("publishers") or []) if str(p).strip()]
    if devs:
        meta["developer"] = ", ".join(devs)[:500]
    if pubs:
        meta["publisher"] = ", ".join(pubs)[:500]

    header_img = str(details.get("header_image") or "").strip()
    if header_img:
        meta["cover_url"] = header_img

    rel = details.get("release_date")
    if isinstance(rel, dict):
        meta["is_unreleased"] = bool(rel.get("coming_soon"))
        raw_date = str(rel.get("date") or "").strip()
        if raw_date:
            meta["release_date_raw"] = raw_date[:120]
            ym = re.search(r"\b(19\d{2}|20\d{2})\b", raw_date)
            if ym:
                meta["release_year"] = int(ym.group(1))

    return meta


_store_cooldown_until: float = 0.0


def fetch_steam_app_details(app_id: int, respect_cooldown: bool = True) -> dict | None:
    """Lädt Store-Metadaten mit automatischem Cooldown-Schutz bei HTTP 429."""
    global _store_cooldown_until
    now = time.time()
    if respect_cooldown and now < _store_cooldown_until:
        return None

    url = f"https://store.steampowered.com/api/appdetails?appids={app_id}&cc=DE&l=german"
    try:
        r = http_session.get(url, timeout=10)
        if r.status_code == 429:
            _store_cooldown_until = time.time() + 90.0
            return None
        if r.status_code != 200:
            return None
        payload = r.json().get(str(app_id), {})
        if not payload.get("success"):
            return None
        return payload.get("data") or {}
    except Exception:
        return None


# ==============================================================================
# STUFE 1A: KOMPLETTER STEAM-KATALOG-DUMP (IStoreService/GetAppList/v1)
# ==============================================================================
def step1a_seed_full_steam_catalog():
    print("\n" + "=" * 78)
    print("🌍 STUFE 1A: Lade kompletten Steam-Spielekatalog (IStoreService/GetAppList/v1)")
    print("=" * 78)

    steam_apps: dict[int, str] = {}
    last_appid = 0
    page = 0

    while True:
        page += 1
        url = (
            "https://api.steampowered.com/IStoreService/GetAppList/v1/"
            f"?key={STEAM_API_KEY}"
            "&include_games=true"
            "&include_dlc=false"
            "&include_software=false"
            "&include_videos=false"
            "&include_hardware=false"
            f"&max_results=50000&last_appid={last_appid}"
        )
        r = http_session.get(url, timeout=30)
        if r.status_code != 200:
            sys.exit(
                f"❌ GetAppList fehlgeschlagen (HTTP {r.status_code}): {r.text[:200]}"
            )

        resp = (r.json() or {}).get("response") or {}
        apps_batch = resp.get("apps") or []
        for a in apps_batch:
            aid = a.get("appid")
            name = str(a.get("name") or "").strip()
            if aid and name:
                steam_apps[int(aid)] = name

        print(
            f"  📦 Seite {page}: +{len(apps_batch):,} Apps geladen (Gesamt: {len(steam_apps):,})"
        )
        if not resp.get("have_more_results") or not resp.get("last_appid"):
            break
        last_appid = int(resp["last_appid"])

    # Sony-Spiele laden für direkte Verknüpfung (steam_app_id + eindeutiger Titel)
    print("  🔗 Lade Sony-Katalog (public.games) für automatischen Brücken-Abgleich...")
    psn_games = fetch_all_rows("games", "id,spieltitel,steam_app_id,hardware")
    psn_by_steam_id: dict[int, dict] = {}
    psn_by_norm_title: dict[str, list[str]] = {}

    for g in psn_games:
        gid = g["id"]
        hw = str(g.get("hardware") or "").upper()
        sid = g.get("steam_app_id")
        titel_obj = g.get("spieltitel") or {}
        de_t = str(titel_obj.get("de") or "").strip() if isinstance(titel_obj, dict) else ""
        en_t = str(titel_obj.get("en") or "").strip() if isinstance(titel_obj, dict) else ""
        fallback_title = en_t or de_t or f"Steam App {sid}"

        if sid is not None:
            sid_int = int(sid)
            prev = psn_by_steam_id.get(sid_int)
            # PS5 bevorzugen, falls PS4 & PS5 dieselbe steam_app_id teilen
            if not prev or ("PS5" in hw and "PS5" not in prev["hw"]):
                psn_by_steam_id[sid_int] = {
                    "id": gid,
                    "hw": hw,
                    "title": fallback_title,
                }
            if sid_int not in steam_apps and fallback_title:
                steam_apps[sid_int] = fallback_title

        for t_candidate in (en_t, de_t):
            norm_t = normalize_compare_str(t_candidate)
            if len(norm_t) >= 4:
                lst = psn_by_norm_title.setdefault(norm_t, [])
                if gid not in lst:
                    lst.append(gid)

    print("  🗄️ Prüfe bereits vorhandene Einträge in catalog_steam_games...")
    existing_rows = fetch_all_rows(
        "catalog_steam_games", "app_id,linked_game_id,crawl_status"
    )
    existing_map: dict[int, dict] = {
        int(r["app_id"]): {
            "linked_game_id": r.get("linked_game_id"),
            "crawl_status": r.get("crawl_status"),
        }
        for r in existing_rows
    }

    # 1. Fehlende Sony-Verknüpfungen bei bereits existierenden Steam-Spielen nachtragen
    relinked_count = 0
    for aid, info in existing_map.items():
        if info["linked_game_id"] is not None:
            continue
        direct_hit = psn_by_steam_id.get(aid)
        target_gid = direct_hit["id"] if direct_hit else None
        if not target_gid:
            st_title = steam_apps.get(aid, "")
            candidates = psn_by_norm_title.get(normalize_compare_str(st_title)) or []
            if len(candidates) == 1:
                target_gid = candidates[0]
        if target_gid:
            upd_link: dict = {"linked_game_id": target_gid}
            # Falls Achievements schon ohne Sony-Link geladen waren: nochmal kurz durch Stufe 2 für Sony-Vererbung!
            if info["crawl_status"] == "ACHIEVEMENTS_LOADED":
                upd_link["crawl_status"] = "CATALOG_ONLY"
            supabase.table("catalog_steam_games").update(upd_link).eq(
                "app_id", aid
            ).execute()
            relinked_count += 1

    if relinked_count:
        print(f"  ✅ {relinked_count:,} bestehende Steam-Spiele nachträglich mit Sony verknüpft!")

    # 2. Alle neuen Steam-Spiele einfügen
    new_rows: list[dict] = []
    for aid, title in steam_apps.items():
        if aid in existing_map:
            continue

        direct_hit = psn_by_steam_id.get(aid)
        linked_gid = direct_hit["id"] if direct_hit else None
        if not linked_gid:
            candidates = psn_by_norm_title.get(normalize_compare_str(title)) or []
            if len(candidates) == 1:
                linked_gid = candidates[0]

        new_rows.append(
            {
                "app_id": aid,
                "title": title,
                "cover_url": f"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{aid}/header.jpg",
                "linked_game_id": linked_gid,
                "match_status": "AUTO_CANDIDATE" if linked_gid else "UNLINKED",
                "crawl_status": "DISCOVERED",
                "achievement_count": 0,
            }
        )

    print(f"  🚀 Schreibe {len(new_rows):,} neue Steam-Spiele in catalog_steam_games...")
    batch_size = 1000
    for i in range(0, len(new_rows), batch_size):
        chunk = new_rows[i : i + batch_size]
        supabase.table("catalog_steam_games").upsert(
            chunk, on_conflict="app_id", ignore_duplicates=True
        ).execute()
        done = min(i + batch_size, len(new_rows))
        if done % 10000 == 0 or done == len(new_rows):
            print(f"    -> {done:,} / {len(new_rows):,} gespeichert")

    print(
        f"✅ Stufe 1A abgeschlossen! Gesamt-Katalog umfasst jetzt ~{len(existing_map) + len(new_rows):,} Steam-Spiele.\n"
    )


# ==============================================================================
# STUFE 1B: PARALLELER ACHIEVEMENT-RADAR (0 API-Key-Verbrauch!)
# ==============================================================================
def _probe_app_has_achievements(app_id: int) -> tuple[int, str, int]:
    """
    Prüft blitzschnell über GetGlobalAchievementPercentagesForApp (keyless!),
    ob ein Steam-Spiel überhaupt Achievements besitzt.
    Rückgabe: (app_id, status: 'WITH_ACH' | 'NO_ACH' | 'SKIP', count)
    """
    url = f"https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid={app_id}"
    try:
        r = http_session.get(url, timeout=10)
        if r.status_code == 403 or r.status_code == 400:
            return (app_id, "NO_ACH", 0)
        if r.status_code == 200:
            ach_list = (
                (r.json() or {}).get("achievementpercentages", {}).get("achievements")
                or []
            )
            if len(ach_list) > 0:
                return (app_id, "WITH_ACH", len(ach_list))
            # Selten (z. B. Pre-Release mit 0 Freischaltungen): 1x Schema gegenprüfen
            sch_url = (
                "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/"
                f"?key={STEAM_API_KEY}&appid={app_id}&l=english"
            )
            rs = http_session.get(sch_url, timeout=10)
            if rs.status_code == 200:
                sch_ach = (
                    (rs.json() or {})
                    .get("game", {})
                    .get("availableGameStats", {})
                    .get("achievements")
                    or []
                )
                if len(sch_ach) > 0:
                    return (app_id, "WITH_ACH", len(sch_ach))
                return (app_id, "NO_ACH", 0)
            return (app_id, "SKIP", 0)
        return (app_id, "SKIP", 0)
    except Exception:
        return (app_id, "SKIP", 0)


def step1b_scan_discovered_for_achievements(workers: int = 12, wave_size: int = 500):
    print("\n" + "=" * 78)
    print(f"📡 STUFE 1B: Paralleler Achievement-Radar ({workers} Worker, 0 Key-Quota)")
    print("=" * 78)

    total_scanned = 0
    total_with_ach = 0
    total_no_ach = 0
    t_start = time.time()
    skip_attempts: dict[int, int] = {}
    deferred_ids: set[int] = set()

    while True:
        # Sony-verknüpfte Spiele zuerst prüfen, danach neueste Steam-AppIDs zuerst
        res = (
            supabase.table("catalog_steam_games")
            .select("app_id,linked_game_id")
            .eq("crawl_status", "DISCOVERED")
            .not_.is_("linked_game_id", "null")
            .order("app_id", desc=True)
            .limit(wave_size + len(deferred_ids))
            .execute()
        )
        batch = [
            r for r in (res.data or []) if int(r["app_id"]) not in deferred_ids
        ][:wave_size]
        if not batch:
            q = (
                supabase.table("catalog_steam_games")
                .select("app_id,linked_game_id")
                .eq("crawl_status", "DISCOVERED")
                .order("app_id", desc=True)
                .limit(wave_size + len(deferred_ids))
            )
            res = q.execute()
            batch = [
                r for r in (res.data or []) if int(r["app_id"]) not in deferred_ids
            ][:wave_size]

        if not batch:
            break

        app_ids = [int(r["app_id"]) for r in batch]
        no_ach_ids: list[int] = []
        with_ach_payload: list[dict] = []
        skipped = 0

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(_probe_app_has_achievements, aid): aid for aid in app_ids
            }
            for fut in as_completed(futures):
                aid, verdict, cnt = fut.result()
                if verdict == "NO_ACH":
                    no_ach_ids.append(aid)
                elif verdict == "WITH_ACH":
                    with_ach_payload.append({"app_id": aid, "achievement_count": cnt})
                else:
                    skipped += 1
                    skip_attempts[aid] = skip_attempts.get(aid, 0) + 1
                    if skip_attempts[aid] >= 2:
                        deferred_ids.add(aid)

        if no_ach_ids or with_ach_payload:
            supabase.rpc(
                "tb_bulk_update_steam_scan",
                {
                    "p_no_ach_ids": no_ach_ids,
                    "p_with_ach": with_ach_payload,
                },
            ).execute()

        total_scanned += len(no_ach_ids) + len(with_ach_payload)
        total_with_ach += len(with_ach_payload)
        total_no_ach += len(no_ach_ids)
        elapsed = max(time.time() - t_start, 0.1)
        rate = total_scanned / elapsed

        print(
            f"  📡 Gescannt: {total_scanned:,} ({rate:.1f}/s) | "
            f"🏆 Mit Achievements: +{len(with_ach_payload)} (Gesamt: {total_with_ach:,}) | "
            f"⚪ Ohne: +{len(no_ach_ids)} (Gesamt: {total_no_ach:,})"
            + (f" | ⏸️ Retry später: {skipped}" if skipped else "")
        )

        # Falls Steam kurz drosselt (fast alles SKIP), 10s durchatmen
        if skipped > len(app_ids) // 2:
            print("  ⏳ Kurze Verschnaufpause (10s) wegen Steam-Drosselung...")
            time.sleep(10.0)

    print(
        f"✅ Stufe 1B abgeschlossen! Neu als Achievement-Spiele erkannt: {total_with_ach:,}"
        + (f" ({len(deferred_ids)} temporär übersprungen)." if deferred_ids else ".")
        + "\n"
    )


# ==============================================================================
# STUFE 2: RESTLOSER ACHIEVEMENT-, FSK- & FINGERABDRUCK-HARVESTER
# ==============================================================================
def step2_fetch_achievements_and_fingerprint(
    batch_size: int = 250,
    fetch_all_16_langs: bool = False,
):
    langs_to_fetch = list(STEAM_LANG_MAP.keys()) if fetch_all_16_langs else ["en", "de"]
    print("\n" + "=" * 78)
    print(
        f"🏆 STUFE 2: Restloser Achievement-Harvester (Sprachen direkt: {', '.join(langs_to_fetch)})"
    )
    print("=" * 78)

    total_processed = 0
    wave_num = 0
    transient_attempts: dict[int, int] = {}
    deferred_stage2_ids: set[int] = set()

    while True:
        wave_num += 1
        # Priorität 1: Mit Sony-Spiel verknüpfte Steam-Spiele
        res = (
            supabase.table("catalog_steam_games")
            .select("*")
            .eq("crawl_status", "CATALOG_ONLY")
            .not_.is_("linked_game_id", "null")
            .order("app_id", desc=True)
            .limit(batch_size + len(deferred_stage2_ids))
            .execute()
        )
        apps = [
            r for r in (res.data or []) if int(r["app_id"]) not in deferred_stage2_ids
        ][:batch_size]
        is_priority_wave = bool(apps)

        if not apps:
            # Priorität 2: Alle verbleibenden reinen Steam-Spiele
            res = (
                supabase.table("catalog_steam_games")
                .select("*")
                .eq("crawl_status", "CATALOG_ONLY")
                .order("app_id", desc=True)
                .limit(batch_size + len(deferred_stage2_ids))
                .execute()
            )
            apps = [
                r
                for r in (res.data or [])
                if int(r["app_id"]) not in deferred_stage2_ids
            ][:batch_size]

        if not apps:
            break

        mode_lbl = "🔗 Sony-Brücke" if is_priority_wave else "🎮 Steam-Exklusiv/Unverknüpft"
        print(f"\n--- Welle {wave_num} ({mode_lbl}: {len(apps)} Spiele) ---")

        for idx, app in enumerate(apps, 1):
            app_id = int(app["app_id"])
            linked_gid = app.get("linked_game_id")

            # Optional Store-Metadaten (FSK, Entwickler, Publisher, Release-Jahr) mitnehmen,
            # solange store.steampowered.com nicht im Cooldown ist.
            store_meta: dict = {}
            if app.get("fsk") is None or not app.get("developer"):
                details = fetch_steam_app_details(app_id, respect_cooldown=True)
                if details:
                    store_meta = parse_store_metadata(details)

            # 1. Globale Seltenheits-Prozente holen
            pct_map: dict[str, float] = {}
            try:
                r_pct = http_session.get(
                    f"https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid={app_id}",
                    timeout=10,
                )
                if r_pct.status_code == 200:
                    for p in (
                        (r_pct.json() or {})
                        .get("achievementpercentages", {})
                        .get("achievements")
                        or []
                    ):
                        if "name" in p:
                            pct_map[p["name"]] = round(float(p.get("percent") or 0.0), 2)
            except Exception:
                pass

            # 2. Schema in den gewünschten Sprachen über den Steam-API-Key abrufen
            schemas_by_lang: dict[str, dict] = {}
            quota_hit = False
            transient_error = False

            for lang_code in langs_to_fetch:
                steam_lang = STEAM_LANG_MAP[lang_code]
                url = (
                    "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/"
                    f"?key={STEAM_API_KEY}&appid={app_id}&l={steam_lang}"
                )
                try:
                    r_sch = http_session.get(url, timeout=12)
                    if r_sch.status_code == 429:
                        quota_hit = True
                        break
                    if r_sch.status_code >= 500:
                        transient_error = True
                        break
                    if r_sch.status_code == 200:
                        ach_list = (
                            (r_sch.json() or {})
                            .get("game", {})
                            .get("availableGameStats", {})
                            .get("achievements")
                            or []
                        )
                        schemas_by_lang[lang_code] = {
                            a["name"]: a for a in ach_list if "name" in a
                        }
                except Exception:
                    transient_error = True
                    break

            if quota_hit:
                print(
                    "\n⚠️ Steam Web API meldet HTTP 429 (Tageslimit von 100.000 Key-Calls erreicht oder kurze Drosselung)."
                    "\n   Fortschritt ist 100 % gespeichert – einfach später denselben Befehl erneut starten!"
                )
                return

            if transient_error and not schemas_by_lang:
                transient_attempts[app_id] = transient_attempts.get(app_id, 0) + 1
                if transient_attempts[app_id] >= 2:
                    deferred_stage2_ids.add(app_id)
                print(
                    f"  ⏸️ [{idx}/{len(apps)}] [{app['title']}] (AppID {app_id}): Kurzzeitiger API-Fehler, bleibt für später in Queue."
                )
                continue

            en_map = schemas_by_lang.get("en") or {}
            de_map = schemas_by_lang.get("de") or en_map
            all_api_names = list(en_map.keys() or de_map.keys())

            if not all_api_names:
                empty_upd = {"crawl_status": "NO_ACHIEVEMENTS", "achievement_count": 0}
                empty_upd.update(store_meta)
                supabase.table("catalog_steam_games").update(empty_upd).eq(
                    "app_id", app_id
                ).execute()
                total_processed += 1
                print(
                    f"  ⚪ [{idx}/{len(apps)}] [{app['title']}] (AppID {app_id}): Keine Achievements im Schema -> NO_ACHIEVEMENTS"
                )
                continue

            # 3. PSN-Trophäen zum Abgleich & Vererben laden
            psn_by_norm_name: dict[str, dict] = {}
            psn_by_norm_desc: dict[str, dict] = {}
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

            ach_rows: list[dict] = []
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
                    matched_tid = (
                        str(matched_pt.get("platform_achievement_id") or "").strip()
                        or None
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
                    }
                )

            for i in range(0, len(ach_rows), 200):
                supabase.table("catalog_steam_achievements").upsert(
                    ach_rows[i : i + 200], on_conflict="app_id,api_name"
                ).execute()

            if linked_gid:
                confidence = round((matched_hits / max(len(ach_rows), 1)) * 100.0, 2)
                new_match_status = (
                    "VERIFIED"
                    if confidence >= 80.0
                    else ("AUTO_CANDIDATE" if confidence >= 30.0 else "SEPARATE_STACK")
                )
                note = f"{matched_hits}/{len(ach_rows)} Sony-Match ({confidence}%) | {unmatched_count} Abweichler"
            else:
                confidence = None
                new_match_status = "UNLINKED"
                note = f"{len(ach_rows)} Steam-Achievements (unverknüpft)"

            update_payload = {
                "achievement_count": len(ach_rows),
                "crawl_status": "ACHIEVEMENTS_LOADED",
                "match_confidence": confidence,
                "match_status": new_match_status,
                "match_notes": note,
            }
            update_payload.update(store_meta)

            supabase.table("catalog_steam_games").update(update_payload).eq(
                "app_id", app_id
            ).execute()

            # Falls per Titel verknüpft und Fingerprint >= 80% VERIFIED: steam_app_id auch in public.games sichern
            if linked_gid and new_match_status == "VERIFIED":
                supabase.table("games").update({"steam_app_id": app_id}).eq(
                    "id", linked_gid
                ).is_("steam_app_id", "null").execute()

            total_processed += 1
            if linked_gid:
                badge = (
                    "🟢 VERIFIED"
                    if new_match_status == "VERIFIED"
                    else (
                        "🟡 TEIL-MATCH"
                        if new_match_status == "AUTO_CANDIDATE"
                        else "🔴 EIGENER STACK"
                    )
                )
            else:
                badge = "🔵 STEAM-SOLO"

            print(
                f"  [{total_processed:,} | {idx}/{len(apps)}] {badge} [{app['title']}] (AppID {app_id}): {note}"
            )
            time.sleep(0.2)

    print(
        f"\n🎉 Stufe 2 komplett abgeschlossen! Verarbeitete Spiele in diesem Lauf: {total_processed:,}."
    )


# ==============================================================================
# OPTIONAL: STORE-METADATEN & FSK NACHZIEHEN (--enrich)
# ==============================================================================
def step3_enrich_missing_store_metadata(batch_size: int = 200):
    print("\n" + "=" * 78)
    print("🏷️  OPTIONAL (--enrich): Fehlende Entwickler/Publisher/Release/FSK nachziehen")
    print("=" * 78)

    updated = 0
    while True:
        res = (
            supabase.table("catalog_steam_games")
            .select("app_id,title,developer,fsk")
            .eq("crawl_status", "ACHIEVEMENTS_LOADED")
            .is_("developer", "null")
            .order("app_id", desc=True)
            .limit(batch_size)
            .execute()
        )
        rows = res.data or []
        if not rows:
            break

        for r in rows:
            aid = int(r["app_id"])
            details = fetch_steam_app_details(aid, respect_cooldown=False)
            if details:
                meta = parse_store_metadata(details)
                if not meta.get("developer"):
                    meta["developer"] = "—"
                supabase.table("catalog_steam_games").update(meta).eq(
                    "app_id", aid
                ).execute()
                updated += 1
                print(
                    f"  [{updated:,}] 🏷️  [{r['title']}] (AppID {aid}) -> Dev: {meta.get('developer')}, FSK: {meta.get('fsk')}"
                )
            else:
                # Nicht gefunden / im Store entfernt -> markieren, damit die Schleife nicht hängt
                supabase.table("catalog_steam_games").update({"developer": "—"}).eq(
                    "app_id", aid
                ).execute()
            time.sleep(1.35)

    print(f"✅ Store-Enrichment fertig ({updated:,} Spiele aktualisiert).")


if __name__ == "__main__":
    args = set(sys.argv[1:])
    all_langs = "--all-langs" in args
    mode_flags = args & {"--seed", "--scan", "--achievements", "--enrich", "--full"}

    # Ohne Modus-Flag (oder mit --full) läuft automatisch das komplette Restlos-Programm durch!
    run_full = not mode_flags or "--full" in mode_flags

    try:
        if run_full or "--seed" in mode_flags:
            step1a_seed_full_steam_catalog()

        if run_full or "--scan" in mode_flags:
            step1b_scan_discovered_for_achievements()

        if run_full or "--achievements" in mode_flags:
            step2_fetch_achievements_and_fingerprint(fetch_all_16_langs=all_langs)

        if "--enrich" in mode_flags:
            step3_enrich_missing_store_metadata()

    except KeyboardInterrupt:
        print(
            "\n⏹️ Manuell pausiert (Strg+C). Alle bisherigen Fortschritte sind in Supabase gespeichert – "
            "beim nächsten Start geht es nahtlos an genau dieser Stelle weiter!"
        )
