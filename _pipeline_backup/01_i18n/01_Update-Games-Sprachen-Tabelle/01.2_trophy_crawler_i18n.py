#!/usr/bin/env python3
"""
01.2_trophy_crawler_i18n.py
Mehrsprachiger Sony Trophy & DLC Harvester (inkl. Token-Engine aus 01.3):
- Nutzt den 45-Minuten Proaktiv-Refresh + HTTP-401 Auto-Recovery aus 01.3.
- Unterstützt alle 15 TrophyBase-Zielsprachen inkl. fi, sv, zh-hans & zh-hant (Regel 6).
- Schreibt DLC-Gruppennamen in game_achievements.spielname (JSONB).
- Überschreibt bei Recrawls keine bestehenden redaktionellen spieltitel-Einträge.
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
import re

load_dotenv()

MAX_WORKERS = 5
DELAY_BETWEEN_GAMES = 0.6
TOKEN_MAX_AGE_SECONDS = 45 * 60

# Alle 15 unterstützten TrophyBase-Locales + tr/ar für Rohdaten-Bestand
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
    if gid.lower() in ("all", "base"):
        return "default"
    return gid


def parse_trophy_group_names(meta: dict, fallback_title: str) -> dict:
    """Extrahiert trophyGroups[].trophyGroupName inkl. default (Hauptspiel)."""
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
    """Regel 6: Stellt sicher, dass zh, zh-hans und zh-hant sich gegenseitig auffüllen."""
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


def fetch_language_worker(
    lang_key: str, accept_lang: str, npwr_id: str, service: str, title_en: str
):
    url_meta = f"https://m.np.playstation.com/api/trophy/v1/npCommunicationIds/{npwr_id}/trophyGroups"
    res_meta = sony_get(url_meta, accept_lang, service)

    loc_title = title_en
    group_names = {}
    if res_meta and res_meta.status_code == 200:
        meta = res_meta.json() or {}
        loc_title = str(meta.get("trophyTitleName") or title_en).strip()
        group_names = parse_trophy_group_names(meta, loc_title)

    url_trophies = f"https://m.np.playstation.com/api/trophy/v1/npCommunicationIds/{npwr_id}/trophyGroups/all/trophies"
    res_trophies = sony_get(url_trophies, accept_lang, service)

    if not res_trophies or res_trophies.status_code != 200:
        return {
            "lang_key": lang_key,
            "title": loc_title,
            "group_names": group_names,
            "trophies": [],
            "is_fallback": True,
        }

    return {
        "lang_key": lang_key,
        "title": loc_title,
        "group_names": group_names,
        "trophies": res_trophies.json().get("trophies", []),
        "is_fallback": False,
    }


def harvest_game(game: dict):
    game_uuid = game["id"]
    npwr_list = extract_npwr_list(game.get("platform_game_id"))
    status_obj = (
        dict(game.get("status")) if isinstance(game.get("status"), dict) else {}
    )
    hw = str(game.get("hardware") or "").upper()

    if not npwr_list:
        print(f" ⏭️ Überspringe {game_uuid}: Keine platform_game_id vorhanden.")
        return

    primary_npwr = npwr_list[0]
    existing_titles = (
        dict(game.get("spieltitel")) if isinstance(game.get("spieltitel"), dict) else {}
    )
    title_en = existing_titles.get("en") or existing_titles.get("de") or "Unbenannt"

    print(
        f"\n💎 Ernte Details für: {primary_npwr} ({len(npwr_list)} Stacks, '{title_en}')..."
    )

    services = (
        ["trophy", "trophy2"]
        if any(x in hw for x in ("PS3", "VITA", "PSP"))
        else ["trophy2", "trophy"]
    )

    url_check = f"https://m.np.playstation.com/api/trophy/v1/npCommunicationIds/{primary_npwr}/trophyGroups"
    service = None
    base_meta = None
    saw_404 = False

    for svc in services:
        res_check = sony_get(url_check, "en-US", svc)
        if res_check and res_check.status_code == 200:
            service = svc
            base_meta = res_check.json()
            break
        if res_check and res_check.status_code in (400, 404):
            saw_404 = True

    if not service:
        if saw_404:
            status_obj["trophies"] = "ZERO_TROPHIES"
            supabase.table("games").update(
                {"status": status_obj, "anzahl_trophaeen": 0}
            ).eq("id", game_uuid).execute()
            print(
                f"  💀 {primary_npwr} liefert 404 auf beiden Services -> ZERO_TROPHIES."
            )
        else:
            print(
                f"  ⚠️ Temporärer API-Fehler für {primary_npwr}. Überspringe sicherheitshalber."
            )
        return

    defined_trophies = base_meta.get("definedTrophies", {}) if base_meta else {}
    total_trophies = sum(defined_trophies.values()) if defined_trophies else 0

    if total_trophies == 0:
        status_obj["trophies"] = "ZERO_TROPHIES"
        supabase.table("games").update(
            {"status": status_obj, "anzahl_trophaeen": 0}
        ).eq("id", game_uuid).execute()
        print(f"  💀 {primary_npwr} hat 0 Trophäen -> ZERO_TROPHIES.")
        return

    title_en = str(base_meta.get("trophyTitleName") or title_en).strip()
    spieltitel_map = dict(existing_titles)
    trophies_localization_map = {}
    verified_languages = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(
                fetch_language_worker,
                l_key,
                accept_l,
                primary_npwr,
                service,
                title_en,
            ): l_key
            for l_key, accept_l in TARGET_LANGUAGES.items()
        }

        for future in as_completed(futures):
            try:
                res = future.result()
                if not res:
                    continue

                l_key = res["lang_key"]
                if res["title"]:
                    spieltitel_map[l_key] = res["title"]

                if not res["is_fallback"]:
                    verified_languages.append(l_key)

                group_names = res.get("group_names") or {}
                for t in res["trophies"]:
                    tid = str(t["trophyId"])
                    group_id = normalize_trophy_group_id(t.get("trophyGroupId"))
                    icon_url = str(
                        t.get("trophyIconUrl") or t.get("icon_url") or ""
                    ).strip()

                    if tid not in trophies_localization_map:
                        trophies_localization_map[tid] = {
                            "names": {},
                            "descs": {},
                            "group_names": {},
                            "type": str(t.get("trophyType", "BRONZE")).upper(),
                            "hidden": "Ja" if t.get("trophyHidden", False) else "Nein",
                            "group": group_id,
                            "icon_url": icon_url,
                        }
                    elif icon_url and not trophies_localization_map[tid].get(
                        "icon_url"
                    ):
                        trophies_localization_map[tid]["icon_url"] = icon_url

                    if t.get("trophyName"):
                        trophies_localization_map[tid]["names"][l_key] = t.get(
                            "trophyName"
                        )
                    if t.get("trophyDetail"):
                        trophies_localization_map[tid]["descs"][l_key] = t.get(
                            "trophyDetail"
                        )

                    pack_name = group_names.get(group_id) or group_names.get("default")
                    if pack_name:
                        trophies_localization_map[tid]["group_names"][l_key] = pack_name
            except Exception as exc:
                print(f"  ⚠️ Thread-Fehler: {exc}")

    spieltitel_map.setdefault("en", title_en)
    apply_zh_fallback(spieltitel_map)

    try:
        status_obj["trophies"] = "PROCESSED"

        supabase.table("games").update(
            {
                "status": status_obj,
                "anzahl_trophaeen": total_trophies,
                "spieltitel": spieltitel_map,
            }
        ).eq("id", game_uuid).execute()

        if trophies_localization_map:
            ach_bulk = []
            for tid, t_data in trophies_localization_map.items():
                ach_bulk.append(
                    {
                        "game_id": game_uuid,
                        "platform_game_id": primary_npwr,
                        "platform_achievement_id": tid,
                        "trophy_type": t_data["type"],
                        "ist_versteckt": t_data["hidden"],
                        "trophy_gruppe": t_data["group"],
                        "trophy_name": apply_zh_fallback(t_data["names"]),
                        "trophy_desc": apply_zh_fallback(t_data["descs"]),
                        "spielname": apply_zh_fallback(t_data.get("group_names") or {}),
                        "icon_url": t_data.get("icon_url") or "",
                        "original_locale": "en",
                    }
                )

            supabase.table("game_achievements").upsert(
                ach_bulk, on_conflict="game_id,platform_achievement_id"
            ).execute()

        print(
            f"  💾 {primary_npwr} (+{len(npwr_list)-1} Stacks) gespeichert ({len(verified_languages)} Sprachen, {total_trophies} Trophäen)."
        )
    except Exception as e:
        print(f"  ❌ DB-Schreibfehler bei {primary_npwr}: {e}")


def normalize_title_key(title: str) -> str:
    import re

    s = str(title or "").lower()
    s = re.sub(r"[®™©]", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def merge_hardware_str(hw1: str, hw2: str) -> str:
    raw = f"{hw1 or ''}/{hw2 or ''}".upper()
    found = []
    if "PS3" in raw:
        found.append("PS3")
    if "VITA" in raw:
        found.append("PS Vita")
    if "PS4" in raw:
        found.append("PS4")
    if "PS5" in raw:
        found.append("PS5")
    return "/".join(found) if found else (hw1 or hw2 or "PS4/PS5")


def deduplicate_pending_discovered_games():
    """
    Fasst frisch vom Scout angelegte Mehrfach-Stacks (gleicher Titel, noch ungeerntet)
    automatisch zusammen:
    1. Löscht zuerst die Klon-Zeilen, BEVOR die Master-Hardware auf PS4/PS5 gehoben wird
       (verhindert Unique-Constraint-Crash 23505 auf games_hardware_slug_idx!).
    2. Falls bereits ein älteres Spiel mit exakt demselben Slug/Titel in games existiert,
       werden die neuen NPWRs direkt an den bestehenden Datensatz angehängt.
    """
    print("🧹 Prüfe offene DISCOVERED-Spiele auf Multi-Region-Stacks (Auto-Merge)...")
    res = (
        supabase.table("games")
        .select(
            "id, platform_game_id, hardware, spieltitel, slug, status, anzahl_trophaeen, published_locales"
        )
        .eq("status->>discovery", "DISCOVERED")
        .or_("status->>trophies.is.null,status->>trophies.neq.PROCESSED")
        .order("created_at")
        .limit(2000)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return

    by_title: dict[str, list[dict]] = {}
    for r in rows:
        status = r.get("status") or {}
        if status.get("trophies") in ("PROCESSED", "ZERO_TROPHIES"):
            continue
        if r.get("published_locales"):
            continue
        t_obj = r.get("spieltitel") if isinstance(r.get("spieltitel"), dict) else {}
        t_en = t_obj.get("en") or t_obj.get("de") or ""
        t_key = normalize_title_key(t_en)
        if not t_key or t_key == "unbenannt":
            continue
        by_title.setdefault(t_key, []).append(r)

    merged_groups = 0
    deleted_clones = 0

    for t_key, group in by_title.items():
        # Alle NPWRs und Hardware-Segmente dieser offenen Gruppe einsammeln
        master = group[0]
        master_id = master["id"]
        combined_npwrs = extract_npwr_list(master.get("platform_game_id"))
        combined_hw = str(master.get("hardware") or "PS4")
        clone_ids = []

        for clone in group[1:]:
            m_cnt = master.get("anzahl_trophaeen")
            c_cnt = clone.get("anzahl_trophaeen")
            if m_cnt and c_cnt and m_cnt != c_cnt:
                continue

            for npwr in extract_npwr_list(clone.get("platform_game_id")):
                if npwr not in combined_npwrs:
                    combined_npwrs.append(npwr)
            combined_hw = merge_hardware_str(combined_hw, clone.get("hardware"))
            clone_ids.append(clone["id"])

        # Prüfen, ob in der DB bereits ein älteres (bereits geerntetes) Spiel mit demselben Slug existiert
        existing_target = None
        base_slug = master.get("slug") or re.sub(r"[^a-z0-9]+", "-", t_key).strip("-")
        if base_slug:
            ex_res = (
                supabase.table("games")
                .select("id, platform_game_id, hardware, spiel_typ, anzahl_trophaeen")
                .eq("slug", base_slug)
                .not_.in_("id", [g["id"] for g in group])
                .limit(5)
                .execute()
            )
            for cand in ex_res.data or []:
                if "servertot" in str(cand.get("spiel_typ") or "").lower():
                    continue
                m_cnt = master.get("anzahl_trophaeen")
                cand_cnt = cand.get("anzahl_trophaeen")
                if m_cnt and cand_cnt and m_cnt != cand_cnt:
                    continue
                existing_target = cand
                break

        title_display = (master.get("spieltitel") or {}).get("en", t_key)

        # FALL A: Es gibt bereits ein fertiges Hauptspiel mit diesem Slug -> Alle offenen dahin mergen!
        if existing_target:
            target_id = existing_target["id"]
            target_npwrs = extract_npwr_list(existing_target.get("platform_game_id"))
            for npwr in combined_npwrs:
                if npwr not in target_npwrs:
                    target_npwrs.append(npwr)
            target_hw = merge_hardware_str(existing_target.get("hardware"), combined_hw)
            all_open_ids = [master_id] + clone_ids

            try:
                # 1. ZUERST alle offenen Dubletten löschen (macht den Unique-Index frei!)
                supabase.table("games").delete().in_("id", all_open_ids).execute()
                # 2. DANN das bestehende Hauptspiel updaten
                supabase.table("games").update(
                    {"platform_game_id": target_npwrs, "hardware": target_hw}
                ).eq("id", target_id).execute()

                merged_groups += 1
                deleted_clones += len(all_open_ids)
                print(
                    f"  🔗 Bestands-Merge: '{title_display}' -> an bestehendes Spiel ({target_hw}) angehängt ({len(all_open_ids)} Dubletten entfernt)."
                )
                continue
            except Exception as e:
                print(f"  ⚠️ Fehler beim Bestands-Merge von '{title_display}': {e}")
                continue

        # FALL B: Normales Bündeln mehrerer neuer DISCOVERED-Zeilen
        if not clone_ids:
            continue

        try:
            # 1. WICHTIG: ZUERST die Klon-Zeilen löschen, damit (ps5, slug) frei wird!
            supabase.table("games").delete().in_("id", clone_ids).execute()

            # 2. DANN erst die Master-Zeile auf die kombinierte Hardware + NPWR-Liste heben
            supabase.table("games").update(
                {"platform_game_id": combined_npwrs, "hardware": combined_hw}
            ).eq("id", master_id).execute()

            merged_groups += 1
            deleted_clones += len(clone_ids)
            print(
                f"  🔗 Auto-Merge: '{title_display}' -> {len(combined_npwrs)} Stacks ({', '.join(combined_npwrs)}) gebündelt ({len(clone_ids)} Klone entfernt)."
            )
        except Exception as e:
            print(f"  ⚠️ Fehler beim Auto-Merge von '{title_display}': {e}")

    if merged_groups > 0:
        print(
            f"✅ {merged_groups} Spiele gebündelt, {deleted_clones} redundante Klon-Zeilen bereinigt!\n"
        )
    else:
        print("✅ Keine offenen Duplikat-Stacks gefunden.\n")


def main():
    get_valid_access_token(force_refresh=True)
    deduplicate_pending_discovered_games()  # <-- Zieht Sigi & Co. sofort zusammen!
    get_valid_access_token(force_refresh=True)
    last_id = None
    batch_size = 500

    print("🔄 Starte Trophy Harvester (Keyset-Pagination)...")

    while True:
        query = (
            supabase.table("games")
            .select("id, platform_game_id, hardware, spieltitel, status")
            .eq("status->>discovery", "DISCOVERED")
            .or_("status->>trophies.is.null,status->>trophies.neq.PROCESSED")
            .order("id")
            .limit(batch_size)
        )

        if last_id:
            query = query.gt("id", last_id)

        res = query.execute()
        records = res.data or []

        if not records:
            print("\n🏁 Keine weiteren offenen Spiele ohne Trophäen gefunden.")
            break

        print(f"\n📦 Verarbeite Batch mit {len(records)} Spielen...")

        for game in records:
            last_id = game["id"]
            status = game.get("status") or {}

            if status.get("trophies") in ("PROCESSED", "ZERO_TROPHIES"):
                continue

            harvest_game(game)
            time.sleep(DELAY_BETWEEN_GAMES)


if __name__ == "__main__":
    main()
