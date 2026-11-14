#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
08.3_Excel_Upload_nach_Subabase.py (Komplettversion inkl. Smart-Router & Auto-Spracherkennung)
- Liest die geprüfte 'QA_Video_Discovery.xlsx' (aus 08.1 oder 08.2).
- Zieht Timestamps via yt-dlp und speichert vor dem Upload ein lokales Crash-Backup.
- Erkennt automatisch die Quellsprache des Creators (pt, es, fr, de, ru, ja, ko, zh-hans, ar, en).
- Routet automatisch zwischen 'staging_game_guides' (kleine Guides) und
  'game_guides_rohmaterial' (Multi-Tab für Evergreen/Premium/S/A/große Playlists).
"""

import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple
import yt_dlp
import pandas as pd
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

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_EXCEL_FILE = os.path.join(_BASE_DIR, "QA_Video_Discovery.xlsx")
FINAL_EXCEL_BACKUP = os.path.join(_BASE_DIR, "QA_Final_Staging_Rows.xlsx")


def clean_str(val: Any) -> str:
    if pd.isna(val) or val is None:
        return ""
    s = str(val).strip()
    return "" if s.lower() in ("nan", "none") else s


def detect_text_locale(sample_text: str) -> str:
    """
    Erkennt automatisch die Sprache der extrahierten Kapitel-/Item-Namen
    (z. B. Brasilianisch/Portugiesisch 'pt', Spanisch 'es', Französisch 'fr', Deutsch 'de').
    """
    t = str(sample_text or "").lower()
    if not t:
        return "en"

    # 1. Eindeutige nicht-lateinische Schriftsysteme
    if re.search(r"[а-яё]", t):
        return "ru"
    if re.search(r"[ぁ-んァ-ン]", t):
        return "ja"
    if re.search(r"[가-힣]", t):
        return "ko"
    if re.search(r"[\u4e00-\u9fff]", t):
        return "zh-hans"
    if re.search(r"[\u0600-\u06ff]", t):
        return "ar"

    # 2. Portugiesisch / Brasilianisch
    if re.search(
        r"(ã|õ|ção|ções|\btroféu|\btrofeus|\bcolecionáveis|\bcolecionaveis|\bcapítulo|\binício|\bchefe\b|\bmissão)",
        t,
    ):
        return "pt"

    # 3. Spanisch
    if re.search(r"(ñ|¿|¡|\btrofeo|\bcoleccionables|\bjefe\b|\bmisión|\bcapítulo)", t):
        return "es"

    # 4. Französisch
    if re.search(
        r"(\btrophée|\bchapitre|\btous les\b|\btoutes les\b|\bdébut\b|\bsoluce\b)", t
    ):
        return "fr"

    # 4.5 Polnisch
    if re.search(
        r"([ąćęłńóśźż]|\b(poradnik|trofeum|trofea|rozdział|rozdzial|część|czesc|wspomnienie|znajdźki|znajdzki|wszystkie|misja)\b)",
        t,
    ):
        return "pl"

    # 5. Deutsch
    if re.search(
        r"(ä|ö|ü|ß|\bsammelobjekte|\bkapitel\b|\btrophäe|\bhauptspiel\b|\blösung\b)", t
    ):
        return "de"

    return "en"


def should_route_to_multitab(
    explicit_queue: str,
    spiel_typ: str,
    guide_typ: str,
    video_count: int,
    row_count: int,
) -> bool:
    """Entscheidet, ob das Paket nach Multi-Tab (game_guides_rohmaterial) oder Staging gehört."""
    eq = explicit_queue.upper()
    if eq == "MULTI_TAB":
        return True
    if eq == "STAGING" and video_count < 3 and row_count <= 45:
        return False

    st_low = spiel_typ.lower()
    g_typ = guide_typ.upper()

    if "quickwin" in st_low or (
        "easy_platin" in st_low
        and "evergreen" not in st_low
        and "premium" not in st_low
    ):
        return False
    if "evergreen" in st_low or "premium" in st_low or g_typ in ("S", "A"):
        return True
    if video_count >= 3 or row_count > 45:
        return True
    return False


def classify_and_sort_key(video_title: str) -> Tuple[int, int, int, str]:
    """Liefert (bucket, chapter_num, sub_type, clean_label) für korrekte Kapitelreihenfolge."""
    vt_norm = re.sub(
        r"\b(level|chapter|episode|part)\s+([0-9])o\b",
        r"\1 \g<2>0",
        video_title,
        flags=re.I,
    )
    vt_low = vt_norm.lower()

    is_collectible = bool(
        re.search(
            r"\b(all\s+hidden\s+objects|hidden\s+collectibles|collectibles\s+guide)\b",
            vt_low,
        )
    )
    sub_type = 2 if is_collectible else 1
    suffix_label = " (Collectibles)" if is_collectible else ""

    if "bonus chapter" in vt_low or "secret room" in vt_low:
        return (3, 999, sub_type, f"Bonus Chapter{suffix_label}")

    if re.search(r"\ball\s+chapters\b", vt_low):
        return (1, 0, sub_type, f"Full Game (All Chapters){suffix_label}")

    m = re.search(r"\b(chapter|episode|level|part|case)\s*(\d+)\b", vt_low)
    if m:
        kind = m.group(1).capitalize()
        num = int(m.group(2))
        return (2, num, sub_type, f"{kind} {num}{suffix_label}")

    return (1, 1, sub_type, f"Main Walkthrough{suffix_label}")


def format_seconds_to_mmss(seconds: int) -> str:
    seconds = max(0, int(seconds))
    hrs = seconds // 3600
    mins = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{hrs:02d}:{mins:02d}:{secs:02d}" if hrs > 0 else f"{mins:02d}:{secs:02d}"


def parse_time_str_to_seconds(t_str: str) -> int:
    parts = [int(p) for p in t_str.strip().split(":")]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return 0


def clean_extracted_chapter(raw_label: str, fallback_sec: int) -> Tuple[int, str]:
    """
    Repariert YouTube-Chapters, bei denen der Creator 'Level 1: 00:00:10 - 02:10' geschrieben hat
    und YouTube fälschlich '02:10' als Startzeit und 'Level 1: 00:00:10' als Titel genommen hat.
    """
    label = raw_label.strip()
    m_end_time = re.search(r"[:\s\-–—]+(\d{1,2}:\s*\d{2}(?::\s*\d{2})?)\s*$", label)
    if m_end_time:
        time_str_clean = re.sub(r"\s+", "", m_end_time.group(1))
        extracted_sec = parse_time_str_to_seconds(time_str_clean)
        if extracted_sec < fallback_sec or fallback_sec == 0:
            clean_lbl = label[: m_end_time.start()].strip(" :-–—")
            if clean_lbl:
                return extracted_sec, clean_lbl

    m_range_start = re.match(
        r"^(\d{1,2}:\s*\d{2}(?::\s*\d{2})?)\s*[-–—]+\s*(.+)$", label
    )
    if m_range_start:
        clean_lbl = m_range_start.group(2).strip(" :-–—")
        if clean_lbl:
            return fallback_sec, clean_lbl

    return fallback_sec, label


def fetch_video_timestamps(video_url: str, ydl_full) -> List[Dict[str, Any]]:
    try:
        info = ydl_full.extract_info(video_url, download=False)
        if not info:
            return []

        # 1. Native YouTube Chapters (<Untitled Chapter 1> -> "Start")
        chapters = info.get("chapters")
        if chapters and isinstance(chapters, list) and len(chapters) > 1:
            result = []
            seen_secs = set()
            for i, ch in enumerate(chapters):
                raw_title = str(ch.get("title") or f"Part {i+1}").strip()
                if raw_title.lower().startswith("<untitled chapter"):
                    raw_title = "Start"

                raw_sec = int(ch.get("start_time") or 0)
                fixed_sec, fixed_label = clean_extracted_chapter(raw_title, raw_sec)

                if fixed_sec not in seen_secs:
                    seen_secs.add(fixed_sec)
                    result.append(
                        {
                            "seconds": fixed_sec,
                            "timestamp": format_seconds_to_mmss(fixed_sec),
                            "label": fixed_label[:120],
                        }
                    )
                elif (
                    fixed_sec == 0
                    and result
                    and result[0]["label"] == "Start"
                    and fixed_label != "Start"
                ):
                    result[0]["label"] = fixed_label[:120]

            if len(result) >= 2:
                result.sort(key=lambda x: x["seconds"])
                return result

        # 2. Fallback: Timestamps aus Description parsen
        desc = info.get("description") or ""
        if not desc:
            return []

        parsed_ts = []
        seen_secs = set()
        for line in desc.splitlines():
            m = re.search(
                r"(?:^|\s|\[|\()(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*[-–—to]+\s*\d{1,2}:\d{2}(?::\d{2})?)?(?:\]|\)|\s|$)\s*[-–—:|]*\s*(.+)",
                line,
            )
            if m:
                t_raw, label_raw = m.group(1), m.group(2).strip()
                if not label_raw or "http://" in label_raw or "https://" in label_raw:
                    continue
                sec = parse_time_str_to_seconds(t_raw)
                fixed_sec, fixed_label = clean_extracted_chapter(label_raw, sec)
                if fixed_sec not in seen_secs:
                    seen_secs.add(fixed_sec)
                    parsed_ts.append(
                        {
                            "seconds": fixed_sec,
                            "timestamp": format_seconds_to_mmss(fixed_sec),
                            "label": fixed_label[:120],
                        }
                    )

        if len(parsed_ts) >= 2:
            parsed_ts.sort(key=lambda x: x["seconds"])
            if parsed_ts[0]["seconds"] > 0:
                parsed_ts.insert(
                    0,
                    {
                        "seconds": 0,
                        "timestamp": "00:00",
                        "label": "Start",
                    },
                )
            return parsed_ts

    except Exception as e:
        print(f"   ⚠️ Fehler beim Timestamp-Abruf ({video_url}): {e}")

    return []


def push_rows_to_supabase(rows: List[Dict[str, Any]]):
    """
    Entfernt In-Batch-Duplikate, erkennt automatisch die Creator-Sprache (z. B. 'pt', 'es', 'fr', 'de')
    und routet jedes Spiel-Paket entweder nach 'staging_game_guides' oder 'game_guides_rohmaterial'.
    """
    grouped_rows: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    for r in rows:
        row_copy = dict(r)
        for k, v in row_copy.items():
            if pd.isna(v):
                row_copy[k] = None
        g_key = (
            str(row_copy.get("game_id") or ""),
            str(row_copy.get("creator_name") or ""),
        )
        if g_key[0]:
            grouped_rows.setdefault(g_key, []).append(row_copy)

    staging_count = 0
    multitab_count = 0

    for (gid, cname), bundle_rows in grouped_rows.items():
        # 1. Deduplizierung pro (game_id, creator_name, video_url, timestamp)
        deduped_map: Dict[Tuple[str, str, str, str], Dict[str, Any]] = {}
        unique_videos = set()
        for r in bundle_rows:
            base_v = str(r.get("video_url") or "").split("&t=")[0]
            if base_v:
                unique_videos.add(base_v)
            d_key = (
                gid,
                cname,
                str(r.get("video_url") or ""),
                str(r.get("timestamp") or ""),
            )
            if d_key not in deduped_map:
                deduped_map[d_key] = r

        clean_rows = list(deduped_map.values())
        for idx_r, r in enumerate(clean_rows, start=1):
            r["guide_id"] = idx_r

        first_row = clean_rows[0]
        explicit_queue = clean_str(first_row.get("_target_queue"))
        excel_pub = clean_str(first_row.get("_publisher"))
        creator_id = clean_str(first_row.get("_creator_id")) or None

        # 2. Spiel-Metadaten (spiel_typ, guide_typ, publisher, status) aus DB prüfen
        g_res = (
            supabase.table("games")
            .select("spiel_typ, guide_typ, publisher, status")
            .eq("id", gid)
            .limit(1)
            .execute()
        )
        g_db = (g_res.data or [{}])[0]
        spiel_typ = clean_str(first_row.get("_spiel_typ")) or str(
            g_db.get("spiel_typ") or ""
        )
        guide_typ = clean_str(first_row.get("_guide_typ")) or str(
            g_db.get("guide_typ") or ""
        )

        if excel_pub and not g_db.get("publisher"):
            try:
                supabase.table("games").update({"publisher": excel_pub}).eq(
                    "id", gid
                ).execute()
            except Exception:
                pass

        # 3. Quellsprache anhand der Kapitel-/Item-Namen automatisch erkennen
        sample_str = " ".join(
            f"{r.get('item_name') or ''} {r.get('video_chapter') or ''}"
            for r in clean_rows[:20]
        )
        src_lang = detect_text_locale(sample_str)

        # 4. Routing-Entscheidung: Multi-Tab vs. Staging
        use_multitab = should_route_to_multitab(
            explicit_queue, spiel_typ, guide_typ, len(unique_videos), len(clean_rows)
        )

        if use_multitab:
            safe_creator = re.sub(r"[^a-zA-Z0-9_-]", "_", cname)[:25]
            batch_key = f"qa_{str(gid)[:8]}_{safe_creator}_{int(time.time())}"
            roh_rows = []
            for r in clean_rows:
                roh_rows.append(
                    {
                        "batch_key": batch_key,
                        "batch_status": "MATCHED",
                        "game_id": gid,
                        "platform_game_id": r["platform_game_id"],
                        "creator_id": creator_id,
                        "creator_name": cname,
                        "playlist_url": r.get("creator_input_url"),
                        "guide_id": str(r["guide_id"]),
                        "sheet_type": [1],
                        "item_name": {src_lang: r["item_name"]},
                        "chronological_group": {src_lang: r["chronological_group"]},
                        "video_chapter": {src_lang: r["video_chapter"]},
                        "original_locale": src_lang,
                        "timestamp": r["timestamp"],
                        "video_url": r["video_url"],
                        "trophy_id": None,
                        "is_trophy_relevant": "Nein",
                    }
                )

            for i in range(0, len(roh_rows), 500):
                supabase.table("game_guides_rohmaterial").insert(
                    roh_rows[i : i + 500]
                ).execute()

            status_obj = (
                dict(g_db.get("status") or {})
                if isinstance(g_db.get("status"), dict)
                else {}
            )
            status_obj["rohmaterial"] = "PENDING_MULTI_TAB"
            supabase.table("games").update({"status": status_obj}).eq(
                "id", gid
            ).execute()
            multitab_count += 1
            print(
                f"   📦 [MULTI-TAB | Sprache: {src_lang.upper()}] {cname} ({gid[:8]}…): {len(roh_rows)} Zeilen -> game_guides_rohmaterial"
            )
        else:
            staging_payload = []
            for r in clean_rows:
                row_clean = {k: v for k, v in r.items() if not k.startswith("_")}
                if creator_id:
                    row_clean["creator_id"] = creator_id
                staging_payload.append(row_clean)

            for i in range(0, len(staging_payload), 500):
                supabase.table("staging_game_guides").upsert(
                    staging_payload[i : i + 500],
                    on_conflict="game_id,creator_name,video_url,timestamp",
                ).execute()
            staging_count += 1
            print(
                f"   📝 [STAGING | Sprache: {src_lang.upper()}] {cname} ({gid[:8]}…): {len(staging_payload)} Zeilen -> staging_game_guides"
            )

    # Erst NACH erfolgreichem Upload das lokale Backup aufräumen!
    if os.path.exists(FINAL_EXCEL_BACKUP):
        os.remove(FINAL_EXCEL_BACKUP)

    print(
        f"\n🏁 FERTIG! {staging_count} Paket(e) in Staging-Entwürfe, {multitab_count} Paket(e) in Multi-Tab (Rohmaterial) geladen."
    )


def run_stage2_enrich_and_upload():
    # Falls das Backup aus einem abgebrochenen Lauf existiert -> Direkt hochladen ohne neuen YouTube-Crawl!
    if os.path.exists(FINAL_EXCEL_BACKUP):
        print(
            f"⚡ Bestehendes Backup '{os.path.basename(FINAL_EXCEL_BACKUP)}' gefunden! Überspringe YouTube-Abfrage..."
        )
        df_backup = pd.read_excel(FINAL_EXCEL_BACKUP)
        staging_rows = df_backup.to_dict(orient="records")
        push_rows_to_supabase(staging_rows)
        return

    if not os.path.exists(INPUT_EXCEL_FILE):
        sys.exit(f"❌ Bereinigte Excel nicht gefunden: {INPUT_EXCEL_FILE}")

    df = pd.read_excel(INPUT_EXCEL_FILE)
    if df.empty:
        print("ℹ️ Excel ist leer. Abbruch.")
        return

    print(
        f"📂 Lese {len(df)} bereinigte Zeilen aus '{os.path.basename(INPUT_EXCEL_FILE)}'..."
    )

    # Gruppieren nach (game_id, creator_name)
    grouped: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for _, row in df.iterrows():
        gid = clean_str(row.get("game_id"))
        cname = clean_str(row.get("creator_name")) or "Unbekannt"
        if not gid:
            continue
        key = (gid, cname)
        if key not in grouped:
            grouped[key] = {
                "game_id": gid,
                "npwr_id": clean_str(row.get("npwr_id")) or gid,
                "game_title": clean_str(row.get("game_title")) or "Unbekannt",
                "creator_name": cname,
                "creator_id": clean_str(row.get("creator_id")) or None,
                "creator_input_url": clean_str(row.get("creator_input_url")) or None,
                "target_queue": clean_str(row.get("target_queue")),
                "spiel_typ": clean_str(row.get("spiel_typ")),
                "guide_typ": clean_str(row.get("guide_typ")),
                "publisher": clean_str(row.get("publisher")),
                "videos": [],
            }
        v_url = clean_str(row.get("video_url")).split("&t=")[0].strip()
        if v_url:
            grouped[key]["videos"].append(
                {
                    "video_title": clean_str(row.get("video_title")) or "Video",
                    "video_url": v_url,
                }
            )

    staging_rows = []

    ydl_opts = {
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": True,
        "simulate": True,
        "check_formats": False,
        "js_runtimes": {"node": {}},
        "extractor_args": {
            "youtube": {
                "player_skip": ["configs", "js"],
            }
        },
    }

    print(f"⏱️ Ziehe Timestamps & baue Guide-Zeilen für {len(grouped)} Spiel-Pakete...")
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        for (gid, cname), bundle in grouped.items():
            unique_vids = {v["video_url"]: v for v in bundle["videos"]}.values()
            enriched = []
            for v in unique_vids:
                b, num, st, clean_lbl = classify_and_sort_key(v["video_title"])
                enriched.append(
                    {**v, "b": b, "num": num, "st": st, "clean_label": clean_lbl}
                )

            enriched.sort(key=lambda x: (x["b"], x["num"], x["st"], x["video_title"]))

            guide_id_counter = 1
            multi_video = len(enriched) > 1
            print(f"   -> {bundle['game_title']} [{cname}] ({len(enriched)} Video(s))")

            for v in enriched:
                base_url = v["video_url"]
                ts_list = fetch_video_timestamps(base_url, ydl)

                if ts_list:
                    group_name = v["clean_label"] if multi_video else "Walkthrough"
                    for ts in ts_list:
                        staging_rows.append(
                            {
                                "game_id": bundle["game_id"],
                                "platform_game_id": bundle["npwr_id"],
                                "creator_name": cname,
                                "creator_input_url": bundle.get("creator_input_url")
                                or base_url,
                                "guide_id": guide_id_counter,
                                "chronological_group": group_name,
                                "video_chapter": v["video_title"],
                                "item_name": ts["label"],
                                "timestamp": ts["timestamp"],
                                "video_url": f"{base_url}&t={ts['seconds']}s",
                                "trophy_id": None,
                                "is_trophy_relevant": "Nein",
                                "_target_queue": bundle.get("target_queue"),
                                "_spiel_typ": bundle.get("spiel_typ"),
                                "_guide_typ": bundle.get("guide_typ"),
                                "_publisher": bundle.get("publisher"),
                                "_creator_id": bundle.get("creator_id"),
                            }
                        )
                        guide_id_counter += 1
                else:
                    item_val = v["clean_label"] if multi_video else bundle["game_title"]
                    staging_rows.append(
                        {
                            "game_id": bundle["game_id"],
                            "platform_game_id": bundle["npwr_id"],
                            "creator_name": cname,
                            "creator_input_url": bundle.get("creator_input_url")
                            or base_url,
                            "guide_id": guide_id_counter,
                            "chronological_group": "Walkthrough",
                            "video_chapter": v["video_title"],
                            "item_name": item_val,
                            "timestamp": "00:00",
                            "video_url": f"{base_url}&t=0s",
                            "trophy_id": None,
                            "is_trophy_relevant": "Nein",
                            "_target_queue": bundle.get("target_queue"),
                            "_spiel_typ": bundle.get("spiel_typ"),
                            "_guide_typ": bundle.get("guide_typ"),
                            "_publisher": bundle.get("publisher"),
                            "_creator_id": bundle.get("creator_id"),
                        }
                    )
                    guide_id_counter += 1

    # 1. Lokales Backup der finalen Zeilen speichern
    pd.DataFrame(staging_rows).to_excel(FINAL_EXCEL_BACKUP, index=False)
    print(
        f"\n💾 Finale Zeilen als Backup gespeichert: {os.path.basename(FINAL_EXCEL_BACKUP)} ({len(staging_rows)} Zeilen)"
    )

    # 2. Ab nach Supabase (Smart-Router: Staging vs. Multi-Tab)
    push_rows_to_supabase(staging_rows)


if __name__ == "__main__":
    run_stage2_enrich_and_upload()
