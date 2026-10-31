#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
10.1_Upload_Guide_i18n.py (Angepasst an Schema 10/2026 & DB-Trigger)
- Unterstützt das 3-Spalten-Gruppenprinzip (chronological_group [1], category_group [2], boss_group [3])
  kompatibel mit trg_auto_derive_sheet_type.
- Umgeht trg_protect_published_guides sauber über edit_unlocked = True & temporären Lock-Toggle bei Orphan-Deletes.
- Löst YouTube-URLs automatisch zu content_creators.id (creator_id) auf.
- Setzt games.status (guide_<lang> = FERTIG, guides = HAS_VIDEO) und entfernt das Spiel aus game_wiedervorlage.
"""

import gc
import json
import os
import re
import shutil
import sys
import time
import pandas as pd
import requests
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ARCHIV_DIR = os.path.join(_BASE_DIR, "Archiv_Fertig")
FEHLER_DIR = os.path.join(_BASE_DIR, "_Fehler_Nicht_Gefunden")

CHUNK_SIZE = 200
CREATOR_CACHE: dict[str, str] = {}


def extract_lang_from_filename(filename: str) -> str:
    """Erkennt _en, -es, _pt, _zh-hans etc. vor der Endung. Standard: 'de'."""
    match = re.search(
        r"[-_]\s*(zh-hans|zh-hant|[a-z]{2})\s*\.(xlsx|xls)$",
        filename,
        re.IGNORECASE,
    )
    return match.group(1).lower() if match else "de"


def normalize_npwr(raw_id) -> tuple[str | None, str | None]:
    if pd.isna(raw_id) or not raw_id:
        return None, None
    val = str(raw_id).strip().upper()
    match = re.search(r"(NPWR\d+)(?:_(\d+))?", val)
    if match:
        base = match.group(1)
        suffix = match.group(2) or "00"
        return base, f"{base}_{suffix}"
    return None, None


def parse_id_str(val) -> str | None:
    if pd.isna(val) or val is None:
        return None
    try:
        return str(int(float(val)))
    except (ValueError, TypeError):
        s = str(val).strip()
        return None if s.lower() == "nan" or s == "" else s


def clean_str(val) -> str | None:
    if pd.isna(val) or val is None:
        return None
    s = str(val).strip()
    return None if s.lower() == "nan" or s == "" else s


def clean_and_build_yt_url(base_url, timestamp_str) -> str | None:
    url = clean_str(base_url)
    if not url:
        return None
    # Falls in video_url nur ein Take-Name steht (z. B. "03_Erde"), keine URL bauen
    if not url.startswith("http") and "youtu" not in url:
        return None

    seconds = None
    ts = clean_str(timestamp_str)
    if ts:
        parts = ts.split(":")
        try:
            if len(parts) == 2:
                seconds = int(parts[0]) * 60 + int(parts[1])
            elif len(parts) == 3:
                seconds = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            elif ts.isdigit():
                seconds = int(ts)
        except ValueError:
            pass

    if seconds is not None:
        clean_url = re.sub(r"[?&]t=\d+s?", "", url)
        clean_url = re.sub(r"[?&]$", "", clean_url)
        sep = "&" if "?" in clean_url else "?"
        return f"{clean_url}{sep}t={seconds}s"

    return url


def merge_jsonb(existing_val, lang: str, new_val) -> dict:
    """Erhält bestehende Sprach-Keys im JSONB-Objekt."""
    result = dict(existing_val) if isinstance(existing_val, dict) else {}
    s = clean_str(new_val)
    if s:
        result[lang] = s
    return result


def resolve_creator_id_from_url(video_url: str | None) -> str | None:
    """Löst eine YouTube-URL über oEmbed auf und holt/erstellt die creator_id in content_creators."""
    if not video_url or (
        "youtube.com" not in video_url and "youtu.be" not in video_url
    ):
        return None

    base_vid = re.sub(r"[?&]t=\d+s?", "", video_url)
    if base_vid in CREATOR_CACHE:
        return CREATOR_CACHE[base_vid]

    try:
        oembed = f"https://www.youtube.com/oembed?url={requests.utils.quote(base_vid)}&format=json"
        r = requests.get(oembed, timeout=5)
        if r.status_code != 200:
            return None
        data = r.json()
        channel_name = str(data.get("author_name") or "").strip()
        channel_url = str(data.get("author_url") or "").strip()
        if not channel_name:
            return None

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
            cid = res.data[0]["id"]
            CREATOR_CACHE[base_vid] = cid
            return cid

        ins = (
            supabase.table("content_creators")
            .insert(
                {
                    "channel_name": channel_name,
                    "youtube_url": channel_url,
                    "signature_tags": [],
                    "is_active": True,
                }
            )
            .execute()
        )
        if ins.data:
            cid = ins.data[0]["id"]
            CREATOR_CACHE[base_vid] = cid
            print(f"  [+] Neuer Creator registriert: {channel_name}")
            return cid
    except Exception:
        pass
    return None


def determine_groups_and_sheet_types(
    chrono_val, cat_val, boss_val=None, is_boss_sheet: bool = False
) -> tuple[str | None, str | None, str | None, list[int]]:
    """
    3-Spalten-Gruppenprinzip (passend zum DB-Trigger trg_auto_derive_sheet_type):
    - chronological_group gefüllt -> Tab [1] (Walkthrough)
    - category_group gefüllt      -> Tab [2] (Sammelobjekte)
    - boss_group gefüllt          -> Tab [3] (Bosse)
    Wenn cat_val 'Bosse'/'Boss' heißt oder die Zeile aus Sheet 3 kommt, wandert der Gruppenname nach boss_group!
    """
    c_str = clean_str(chrono_val)
    cat_str = clean_str(cat_val)
    b_str = clean_str(boss_val)

    is_cat_boss = bool(
        cat_str and cat_str.lower() in ("bosse", "boss", "bosses", "jefes")
    )

    if is_boss_sheet or is_cat_boss:
        if not b_str:
            b_str = cat_str if (cat_str and not is_cat_boss) else (c_str or "Bosse")
        # Bosse dürfen niemals in category_group stehen, sonst macht der Trigger [2] daraus!
        cat_str = None

    types = []
    if c_str:
        types.append(1)
    if cat_str:
        types.append(2)
    if b_str:
        types.append(3)

    if not types:
        types.append(3 if is_boss_sheet else 1)

    return c_str, cat_str, b_str, sorted(set(types))


def fetch_all_game_guides(game_uuid: str) -> list[dict]:
    all_rows = []
    page_size = 1000
    offset = 0
    while True:
        res = (
            supabase.table("game_guides")
            .select("*")
            .eq("game_id", game_uuid)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        data = res.data or []
        all_rows.extend(data)
        if len(data) < page_size:
            break
        offset += page_size
    return all_rows


def resolve_game(excel_path: str) -> tuple[str | None, str | None]:
    detected_npwr = None
    game_uuid = None

    with pd.ExcelFile(excel_path) as xl:
        for sheet in xl.sheet_names:
            df = pd.read_excel(xl, sheet_name=sheet, nrows=5)
            df.columns = [str(c).strip().lower() for c in df.columns]

            if not detected_npwr and "platform_game_id" in df.columns:
                for raw in df["platform_game_id"].dropna():
                    base, full = normalize_npwr(raw)
                    if full or base:
                        detected_npwr = full or base
                        break

            if not game_uuid and "game_id" in df.columns:
                for g_id in df["game_id"].dropna():
                    g_str = str(g_id).strip()
                    if len(g_str) == 36 and "-" in g_str:
                        game_uuid = g_str
                        break

    if not detected_npwr:
        base_file = os.path.basename(excel_path)
        base, full = normalize_npwr(base_file)
        detected_npwr = full or base

    if game_uuid:
        res = (
            supabase.table("games").select("id").eq("id", game_uuid).limit(1).execute()
        )
        if res.data:
            return res.data[0]["id"], detected_npwr

    if detected_npwr:
        base, full = normalize_npwr(detected_npwr)
        for npwr in [full, base]:
            if not npwr:
                continue
            res = (
                supabase.table("games")
                .select("id")
                .filter("platform_game_id", "cs", f'["{npwr}"]')
                .limit(1)
                .execute()
            )
            if res.data:
                return res.data[0]["id"], detected_npwr

    return None, None


def safe_delete_guide_rows_by_ids(game_uuid: str, row_uuids: list[str]):
    """Entsperrt das Spiel kurzzeitig für strukturelle DELETEs (umgeht trg_protect_published_guides)."""
    if not row_uuids:
        return
    g_res = (
        supabase.table("games")
        .select("is_guide_locked, status, publishing_status, fortschritt")
        .eq("id", game_uuid)
        .limit(1)
        .execute()
    )
    g_row = (g_res.data or [{}])[0]
    was_locked = bool(g_row.get("is_guide_locked"))
    orig_status = (
        dict(g_row.get("status") or {}) if isinstance(g_row.get("status"), dict) else {}
    )
    orig_fortschritt = g_row.get("fortschritt")

    # Kurz entsperren, falls veröffentlicht
    temp_status = dict(orig_status)
    needs_temp_unlock = (
        was_locked
        or orig_fortschritt == "PUBLISHED"
        or any(
            str(v).upper() == "PUBLISHED"
            for k, v in temp_status.items()
            if k.startswith("guide_") or k == "publish_status"
        )
    )

    if needs_temp_unlock:
        for k in list(temp_status.keys()):
            if k.startswith("guide_") and str(temp_status[k]).upper() == "PUBLISHED":
                temp_status[k] = "FERTIG"
        temp_status["publish_status"] = "FERTIG"
        supabase.table("games").update(
            {"is_guide_locked": False, "status": temp_status, "fortschritt": "FERTIG"}
        ).eq("id", game_uuid).execute()

    try:
        for i in range(0, len(row_uuids), CHUNK_SIZE):
            chunk = row_uuids[i : i + CHUNK_SIZE]
            supabase.table("game_guides").delete().in_("id", chunk).execute()
    finally:
        if needs_temp_unlock:
            supabase.table("games").update(
                {
                    "is_guide_locked": was_locked,
                    "status": orig_status,
                    "fortschritt": orig_fortschritt,
                }
            ).eq("id", game_uuid).execute()


def upload_all_excels():
    os.makedirs(ARCHIV_DIR, exist_ok=True)
    os.makedirs(FEHLER_DIR, exist_ok=True)

    excel_files = [
        f
        for f in os.listdir(_BASE_DIR)
        if (f.endswith(".xlsx") or f.endswith(".xls"))
        and "Collectibles" not in f
        and not f.startswith("~$")
    ]

    if not excel_files:
        print("ℹ️ Keine neuen Excel-Dateien gefunden.")
        return

    excel_files.sort(
        key=lambda f: (
            1 if re.search(r"[-_]\s*[a-z]{2}\s*\.(xlsx|xls)$", f, re.IGNORECASE) else 0
        )
    )

    for file_name in excel_files:
        full_file_path = os.path.join(_BASE_DIR, file_name)
        lang = extract_lang_from_filename(file_name)
        is_master = lang == "de"

        print(f"\n==================================================")
        print(
            f"📂 Verarbeite: {file_name} [Modus: {'MASTER (DE)' if is_master else 'TRANSLATION (' + lang.upper() + ')'}]"
        )
        print(f"==================================================")

        game_uuid, file_npwr = resolve_game(full_file_path)
        if not game_uuid:
            print(f"❌ KEIN DB-MATCH in 'games'. Verschiebe nach {FEHLER_DIR}")
            dest = os.path.join(FEHLER_DIR, file_name)
            if os.path.exists(dest):
                os.remove(dest)
            shutil.move(full_file_path, dest)
            continue

        excel_obj = pd.ExcelFile(full_file_path)
        total_sheets = len(excel_obj.sheet_names)

        # ----------------------------------------------------
        # 1. Vorbestand laden (PAGINIERT) & Fremd-NPWRs eliminieren
        # ----------------------------------------------------
        achs_res = (
            supabase.table("game_achievements")
            .select("*")
            .eq("game_id", game_uuid)
            .execute()
        )
        existing_achs = {
            str(r["platform_achievement_id"]): r for r in (achs_res.data or [])
        }

        all_db_guides = fetch_all_game_guides(game_uuid)
        print(f"  📥 Vorbestand aus DB geladen: {len(all_db_guides)} Guides gefunden.")

        base_file, _ = normalize_npwr(file_npwr)
        other_npwr_ids = []
        same_npwr_rows = []

        for r in all_db_guides:
            db_base, _ = normalize_npwr(r.get("platform_game_id"))
            if db_base and base_file and db_base != base_file:
                other_npwr_ids.append(r["id"])
            else:
                same_npwr_rows.append(r)

        if other_npwr_ids:
            safe_delete_guide_rows_by_ids(game_uuid, other_npwr_ids)
            print(
                f"  🧹 Andere NPWR-Leichen gelöscht: {len(other_npwr_ids)} Einträge entfernt."
            )

        existing_guides = {
            str(r["guide_id"]): r for r in same_npwr_rows if r.get("guide_id")
        }

        # ----------------------------------------------------
        # REITER 0: Trophäen-Veredelung
        # ----------------------------------------------------
        df_trophies = pd.read_excel(full_file_path, sheet_name=0)
        df_trophies.columns = [str(c).strip().lower() for c in df_trophies.columns]

        id_col = (
            "platform_achievement_id"
            if "platform_achievement_id" in df_trophies.columns
            else "trophy_id"
        )
        ach_payloads = []
        any_video_found = False
        first_video_url = None

        for record in df_trophies.to_dict(orient="records"):
            t_id = parse_id_str(record.get(id_col))
            if not t_id:
                continue

            existing = existing_achs.get(t_id)
            if not existing:
                continue

            row_payload = {
                "game_id": game_uuid,
                "platform_achievement_id": t_id,
                "trophy_type": existing.get("trophy_type", "BRONZE"),
                "trophy_gruppe": existing.get("trophy_gruppe", "default"),
                "spielname": existing.get("spielname") or {},
                "ist_versteckt": existing.get("ist_versteckt"),
                "is_missable": existing.get("is_missable", False),
                "is_story_related": existing.get("is_story_related", False),
                "is_online": existing.get("is_online", False),
                "platform_game_id": file_npwr or existing.get("platform_game_id"),
            }

            tip_raw = record.get("guide_tip")
            row_payload["guide_tip"] = merge_jsonb(
                existing.get("guide_tip"), lang, tip_raw
            )

            long_tip_raw = record.get("guide-tip-lang") or record.get("guide_tip_long")
            if long_tip_raw is not None and pd.notna(long_tip_raw):
                row_payload["Guide-Tip-lang"] = merge_jsonb(
                    existing.get("Guide-Tip-lang"), lang, long_tip_raw
                )

            v_url_raw = record.get("video_url")
            v_time_raw = record.get("timestamp")
            built_url = clean_and_build_yt_url(v_url_raw, v_time_raw)
            if built_url:
                row_payload["video_url"] = built_url
                any_video_found = True
                if not first_video_url:
                    first_video_url = built_url
            else:
                row_payload["video_url"] = existing.get("video_url")

            ts_clean = clean_str(v_time_raw)
            row_payload["timestamp"] = (
                ts_clean if ts_clean else existing.get("timestamp")
            )

            ach_payloads.append(row_payload)

        if ach_payloads:
            for i in range(0, len(ach_payloads), CHUNK_SIZE):
                chunk = ach_payloads[i : i + CHUNK_SIZE]
                supabase.table("game_achievements").upsert(
                    chunk, on_conflict="game_id, platform_achievement_id"
                ).execute()
            print(
                f"  ✅ Sheet 0: {len(ach_payloads)} Trophäen ({lang.upper()}) veredelt."
            )

        # ----------------------------------------------------
        # REITER 1 & 3: Guides (inkl. 3-Spalten-Gruppenprinzip)
        # ----------------------------------------------------
        items_map = {}

        # Sheet 1: Hauptguide
        if total_sheets > 1:
            df_guides = pd.read_excel(full_file_path, sheet_name=1)
            if not df_guides.empty:
                df_guides.columns = [str(c).strip().lower() for c in df_guides.columns]

                for r in df_guides.to_dict(orient="records"):
                    raw_id = (
                        r.get("guide_id")
                        if pd.notna(r.get("guide_id"))
                        else r.get("boss_id")
                    )
                    guide_id = parse_id_str(raw_id)
                    raw_name = (
                        r.get("item_name")
                        if pd.notna(r.get("item_name"))
                        else r.get("boss_name")
                    )

                    if not guide_id or not clean_str(raw_name):
                        continue

                    c_str, cat_str, b_str, sheet_types = (
                        determine_groups_and_sheet_types(
                            r.get("chronological_group"),
                            r.get("category_group"),
                            r.get("boss_group"),
                            is_boss_sheet=False,
                        )
                    )

                    existing = existing_guides.get(guide_id, {})
                    raw_trophy_rel = clean_str(r.get("is_trophy_relevant"))
                    trophy_rel_str = (
                        raw_trophy_rel
                        if raw_trophy_rel
                        else existing.get("is_trophy_relevant", "Ja")
                    )

                    built_vurl = clean_and_build_yt_url(
                        r.get("video_url"), r.get("timestamp")
                    ) or existing.get("video_url")
                    if built_vurl:
                        any_video_found = True
                        if not first_video_url:
                            first_video_url = built_vurl

                    prod_note_val = clean_str(r.get("prod_note")) or existing.get(
                        "prod_note"
                    )

                    items_map[guide_id] = {
                        "id": existing.get("id"),
                        "game_id": game_uuid,
                        "platform_game_id": str(
                            file_npwr
                            or clean_str(r.get("platform_game_id"))
                            or existing.get("platform_game_id", "")
                        ).strip(),
                        "guide_id": guide_id,
                        "sheet_type": sheet_types,
                        "trophy_id": parse_id_str(r.get("trophy_id"))
                        or existing.get("trophy_id"),
                        "video_url": built_vurl,
                        "timestamp": clean_str(r.get("timestamp"))
                        or existing.get("timestamp"),
                        "prod_note": prod_note_val,
                        "is_trophy_relevant": trophy_rel_str,
                        "item_name": merge_jsonb(
                            existing.get("item_name"), lang, raw_name
                        ),
                        "chronological_group": (
                            merge_jsonb(
                                existing.get("chronological_group"), lang, c_str
                            )
                            if c_str or existing.get("chronological_group")
                            else None
                        ),
                        "category_group": (
                            merge_jsonb(existing.get("category_group"), lang, cat_str)
                            if cat_str or existing.get("category_group")
                            else None
                        ),
                        "boss_group": (
                            merge_jsonb(existing.get("boss_group"), lang, b_str)
                            if b_str or existing.get("boss_group")
                            else None
                        ),
                        "video_chapter": merge_jsonb(
                            existing.get("video_chapter"), lang, r.get("video_chapter")
                        ),
                        "localisation": merge_jsonb(
                            existing.get("localisation"), lang, r.get("localisation")
                        ),
                        "creator_id": existing.get("creator_id"),
                    }

        # Sheet 3: Bosse
        if total_sheets > 3:
            df_bosses = pd.read_excel(full_file_path, sheet_name=3)
            if not df_bosses.empty:
                df_bosses.columns = [str(c).strip().lower() for c in df_bosses.columns]

                for r in df_bosses.to_dict(orient="records"):
                    raw_id = (
                        r.get("boss_id")
                        if pd.notna(r.get("boss_id"))
                        else r.get("guide_id")
                    )
                    guide_id = parse_id_str(raw_id)
                    raw_name = (
                        r.get("boss_name")
                        if pd.notna(r.get("boss_name"))
                        else r.get("item_name")
                    )

                    if not guide_id or not clean_str(raw_name):
                        continue

                    c_str, _, b_str, sheet_types = determine_groups_and_sheet_types(
                        r.get("chronological_group"),
                        r.get("category_group"),
                        r.get("boss_group") or raw_name,
                        is_boss_sheet=True,
                    )

                    if guide_id in items_map:
                        item = items_map[guide_id]
                        st = set(item["sheet_type"])
                        st.discard(2)
                        st.add(3)
                        item["sheet_type"] = sorted(list(st))

                        item["item_name"] = merge_jsonb(
                            item["item_name"], lang, raw_name
                        )
                        if c_str:
                            item["chronological_group"] = merge_jsonb(
                                item["chronological_group"], lang, c_str
                            )
                        if b_str:
                            item["boss_group"] = merge_jsonb(
                                item["boss_group"], lang, b_str
                            )
                        item["category_group"] = None
                        item["video_chapter"] = merge_jsonb(
                            item["video_chapter"], lang, r.get("video_chapter")
                        )
                        item["localisation"] = merge_jsonb(
                            item["localisation"], lang, r.get("localisation")
                        )

                        if pd.notna(r.get("video_url")) and not item["video_url"]:
                            item["video_url"] = clean_and_build_yt_url(
                                r.get("video_url"), r.get("timestamp")
                            )
                        if pd.notna(r.get("timestamp")) and not item["timestamp"]:
                            item["timestamp"] = clean_str(r.get("timestamp"))
                        if pd.notna(r.get("trophy_id")) and not item["trophy_id"]:
                            item["trophy_id"] = parse_id_str(r.get("trophy_id"))
                    else:
                        existing = existing_guides.get(guide_id, {})
                        raw_trophy_rel = clean_str(r.get("is_trophy_relevant"))
                        trophy_rel_str = (
                            raw_trophy_rel
                            if raw_trophy_rel
                            else existing.get("is_trophy_relevant", "Ja")
                        )

                        built_vurl = clean_and_build_yt_url(
                            r.get("video_url"), r.get("timestamp")
                        ) or existing.get("video_url")
                        if built_vurl:
                            any_video_found = True
                            if not first_video_url:
                                first_video_url = built_vurl

                        items_map[guide_id] = {
                            "id": existing.get("id"),
                            "game_id": game_uuid,
                            "platform_game_id": str(
                                file_npwr
                                or clean_str(r.get("platform_game_id"))
                                or existing.get("platform_game_id", "")
                            ).strip(),
                            "guide_id": guide_id,
                            "sheet_type": sheet_types,
                            "trophy_id": parse_id_str(r.get("trophy_id"))
                            or existing.get("trophy_id"),
                            "video_url": built_vurl,
                            "timestamp": clean_str(r.get("timestamp"))
                            or existing.get("timestamp"),
                            "prod_note": clean_str(r.get("prod_note"))
                            or existing.get("prod_note"),
                            "is_trophy_relevant": trophy_rel_str,
                            "item_name": merge_jsonb(
                                existing.get("item_name"), lang, raw_name
                            ),
                            "chronological_group": (
                                merge_jsonb(
                                    existing.get("chronological_group"), lang, c_str
                                )
                                if c_str or existing.get("chronological_group")
                                else None
                            ),
                            "category_group": None,
                            "boss_group": (
                                merge_jsonb(existing.get("boss_group"), lang, b_str)
                                if b_str or existing.get("boss_group")
                                else None
                            ),
                            "video_chapter": merge_jsonb(
                                existing.get("video_chapter"),
                                lang,
                                r.get("video_chapter"),
                            ),
                            "localisation": merge_jsonb(
                                existing.get("localisation"),
                                lang,
                                r.get("localisation"),
                            ),
                            "creator_id": existing.get("creator_id"),
                        }

        # Creator automatisch über erste Video-URL auflösen
        resolved_creator_id = (
            resolve_creator_id_from_url(first_video_url) if first_video_url else None
        )
        if resolved_creator_id:
            for item in items_map.values():
                if not item.get("creator_id"):
                    item["creator_id"] = resolved_creator_id

        # ----------------------------------------------------
        # Orphan-Löschung (Nur im MASTER-Modus 'de')
        # ----------------------------------------------------
        if is_master:
            db_guide_ids = set(existing_guides.keys())
            current_excel_ids = set(items_map.keys())
            orphan_guide_ids = db_guide_ids - current_excel_ids

            if orphan_guide_ids:
                orphan_row_uuids = [
                    existing_guides[gid]["id"]
                    for gid in orphan_guide_ids
                    if existing_guides.get(gid, {}).get("id")
                ]
                safe_delete_guide_rows_by_ids(game_uuid, orphan_row_uuids)
                print(
                    f"  🧹 {len(orphan_row_uuids)} verwaiste Guides (Orphans) gelöscht."
                )

        # ----------------------------------------------------
        # Upload der Guides (Updates mit edit_unlocked = True!)
        # ----------------------------------------------------
        updates = [
            {**v, "edit_unlocked": True} for v in items_map.values() if v.get("id")
        ]
        inserts = [
            {k: v for k, v in item.items() if k != "id"}
            for item in items_map.values()
            if not item.get("id")
        ]

        if updates:
            for i in range(0, len(updates), CHUNK_SIZE):
                chunk = updates[i : i + CHUNK_SIZE]
                supabase.table("game_guides").upsert(chunk, on_conflict="id").execute()
            print(
                f"  ✅ Sheets 1 & 3: {len(updates)} bestehende Guides aktualisiert (inkl. edit_unlocked)."
            )

        if inserts:
            for i in range(0, len(inserts), CHUNK_SIZE):
                chunk = inserts[i : i + CHUNK_SIZE]
                supabase.table("game_guides").insert(chunk).execute()
            print(f"  ✅ Sheets 1 & 3: {len(inserts)} neue Guides eingefügt.")

        # ----------------------------------------------------
        # Spiel-Status auf games aktualisieren & Wiedervorlage räumen
        # ----------------------------------------------------
        g_res = (
            supabase.table("games")
            .select("status")
            .eq("id", game_uuid)
            .limit(1)
            .execute()
        )
        if g_res.data:
            status_map = dict(g_res.data[0].get("status") or {})
            guide_key = f"guide_{lang}"
            if str(status_map.get(guide_key) or "").upper() != "PUBLISHED":
                status_map[guide_key] = "FERTIG"
            if any_video_found:
                status_map["guides"] = "HAS_VIDEO"
            status_map.pop("rohmaterial", None)
            supabase.table("games").update({"status": status_map}).eq(
                "id", game_uuid
            ).execute()

        try:
            supabase.table("game_wiedervorlage").delete().eq("id", game_uuid).execute()
        except Exception:
            pass

        # ----------------------------------------------------
        # Windows-sichere Entkopplung & Archivierung
        # ----------------------------------------------------
        excel_obj.close()
        del excel_obj
        if "df_trophies" in locals():
            del df_trophies
        if "df_guides" in locals():
            del df_guides
        if "df_bosses" in locals():
            del df_bosses

        gc.collect()

        dest_path = os.path.join(ARCHIV_DIR, file_name)
        if os.path.exists(dest_path):
            try:
                os.remove(dest_path)
            except PermissionError:
                gc.collect()
                os.remove(dest_path)

        try:
            shutil.move(full_file_path, dest_path)
        except PermissionError:
            gc.collect()
            time.sleep(0.5)
            try:
                shutil.move(full_file_path, dest_path)
            except PermissionError:
                shutil.copy2(full_file_path, dest_path)
                try:
                    os.remove(full_file_path)
                except Exception:
                    pass

        print(f"🔒 Datei erfolgreich archiviert: {file_name}\n")


if __name__ == "__main__":
    upload_all_excels()
