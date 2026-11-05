#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
07.0_Trophy_Video_Queue_Worker.py (Multi-Tab Rohmaterial Edition)
Verarbeitet auf der Website eingetragene Trophäen-Sammelvideos aus 'trophy_video_scrape_queue':
- Zieht Kapitel oder Description-Timestamps via yt-dlp (inkl. Playlist-Support).
- Versieht JEDE extrahierte Zeile sofort mit der richtigen trophy_id & dem Trophäennamen als Gruppe.
- Schreibt direkt als JSONB in 'game_guides_rohmaterial' (batch_status = 'OPEN') und setzt
  games.status.rohmaterial = 'PENDING_MULTI_TAB', damit das Spiel sofort in der Multi-Tab-Bearbeitung als offen erscheint!
"""

import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple
import yt_dlp
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def extract_numeric_trophy_id(raw_tid: Any) -> str | None:
    matches = re.findall(r"\d+", str(raw_tid or ""))
    return str(int(matches[-1])) if matches else None


def detect_text_locale(sample_text: str) -> str:
    t = str(sample_text or "").lower()
    if not t:
        return "de"
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
    if re.search(
        r"(ã|õ|ção|ções|\btroféu|\btrofeus|\bcolecionáveis|\bcolecionaveis|\bcapítulo|\binício|\bchefe\b)",
        t,
    ):
        return "pt"
    if re.search(r"(ñ|¿|¡|\btrofeo|\bcoleccionables|\bjefe\b|\bmisión|\bcapítulo)", t):
        return "es"
    if re.search(
        r"(\btrophée|\bchapitre|\btous les\b|\btoutes les\b|\bdébut\b|\bsoluce\b)", t
    ):
        return "fr"
    if re.search(
        r"(ä|ö|ü|ß|\bsammelobjekte|\bkapitel\b|\btrophäe|\bhauptspiel\b|\blösung\b)", t
    ):
        return "de"
    return "en"


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


def extract_timestamps_from_url(
    url: str, ydl: yt_dlp.YoutubeDL
) -> List[Dict[str, Any]]:
    """Extrahiert aus Einzelvideo oder Playlist alle Timestamps + Creator-Metadaten."""
    info = ydl.extract_info(url, download=False)
    if not info:
        return []

    entries = list(info["entries"]) if "entries" in info else [info]
    extracted_items = []

    for entry in entries:
        if not entry:
            continue
        vid_id = entry.get("id")
        video_url = (
            f"https://www.youtube.com/watch?v={vid_id}"
            if vid_id and len(str(vid_id)) == 11
            else (entry.get("webpage_url") or entry.get("url") or url)
        )
        video_title = str(entry.get("title") or "Video Guide").strip()
        creator_name = (
            entry.get("uploader")
            or entry.get("channel")
            or info.get("uploader")
            or info.get("channel")
            or "Unbekannt"
        )

        chapters = entry.get("chapters") or []
        parsed_ts = []
        seen_secs = set()

        if isinstance(chapters, list) and len(chapters) >= 1:
            for idx, ch in enumerate(chapters, start=1):
                raw_title = str(ch.get("title") or f"Objekt {idx}").strip()
                if raw_title.lower().startswith("<untitled chapter"):
                    raw_title = "Start"
                raw_sec = int(ch.get("start_time") or 0)
                fixed_sec, fixed_label = clean_extracted_chapter(raw_title, raw_sec)
                if fixed_sec not in seen_secs:
                    seen_secs.add(fixed_sec)
                    parsed_ts.append(
                        {
                            "seconds": fixed_sec,
                            "timestamp": format_seconds_to_mmss(fixed_sec),
                            "label": fixed_label[:120],
                        }
                    )
        else:
            desc = entry.get("description") or ""
            for line in desc.splitlines():
                m = re.search(
                    r"(?:^|\s|\[|\()(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*[-–—to]+\s*\d{1,2}:\d{2}(?::\d{2})?)?(?:\]|\)|\s|$)\s*[-–—:|]*\s*(.+)",
                    line,
                )
                if m:
                    t_raw, label_raw = m.group(1), m.group(2).strip()
                    if (
                        not label_raw
                        or "http://" in label_raw
                        or "https://" in label_raw
                    ):
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

        parsed_ts.sort(key=lambda x: x["seconds"])
        for ts in parsed_ts:
            extracted_items.append(
                {
                    "creator_name": str(creator_name).strip(),
                    "video_title": video_title,
                    "base_video_url": video_url.split("&t=")[0],
                    "seconds": ts["seconds"],
                    "timestamp": ts["timestamp"],
                    "label": ts["label"],
                }
            )

    return extracted_items


def get_next_guide_id_offset(game_id: str) -> int:
    """Ermittelt die höchste bestehende guide_id über alle 3 Guide-Tabellen für dieses Spiel."""
    max_id = 0
    for table in ("game_guides_rohmaterial", "staging_game_guides", "game_guides"):
        res = supabase.table(table).select("guide_id").eq("game_id", game_id).execute()
        for r in res.data or []:
            m = re.search(r"\d+", str(r.get("guide_id") or ""))
            if m:
                max_id = max(max_id, int(m.group(0)))
    return max_id


def resolve_sheet_type_for_col(target_col: str) -> list[int]:
    if target_col == "chronological_group":
        return [1]
    if target_col == "boss_group":
        return [3]
    return [2]


def process_queue():
    res = (
        supabase.table("trophy_video_scrape_queue")
        .select("*")
        .eq("status", "PENDING")
        .order("id")  # WICHTIG: Exakte Reihenfolge (Kapitel 1 -> 17) beibehalten!
        .execute()
    )
    jobs = res.data or []
    if not jobs:
        print("✅ Keine offenen Video-Aufträge in 'trophy_video_scrape_queue'.")
        return

    print(
        f"🚀 Verarbeite {len(jobs)} Video-Aufträge -> Direkt in Multi-Tab (game_guides_rohmaterial)...\n"
    )

    ydl_opts = {
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": True,
        "simulate": True,
        "check_formats": False,
        "js_runtimes": {"node": {}},
        "extractor_args": {"youtube": {"player_skip": ["configs", "js"]}},
    }

    # Gemeinsamer Batch-Key pro (game_id, creator), damit 17 Kapitel-Videos in 1 gemeinsamen Tab landen!
    session_ts = int(time.time())
    batch_key_by_game_creator: Dict[Tuple[str, str], str] = {}

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        for job in jobs:
            job_id = job["id"]
            game_id = job["game_id"]
            video_url = str(job["video_url"]).strip()
            raw_tid = job.get("trophy_id")
            str_tid = extract_numeric_trophy_id(raw_tid)
            # "0" bedeutet: Allgemeines Walkthrough-/Kapitel-Video ohne feste Einzel-Trophäe!
            if str_tid == "0":
                str_tid = None

            trophy_name = str(job.get("trophy_name") or "").strip()
            group_name = str(
                job.get("custom_group_name") or trophy_name or "Walkthrough"
            ).strip()
            target_col = job.get("target_group_col") or "chronological_group"

            g_res = (
                supabase.table("games")
                .select("platform_game_id, status")
                .eq("id", game_id)
                .limit(1)
                .execute()
            )
            g_row = (g_res.data or [{}])[0]

            npwr = str(job.get("platform_game_id") or "").strip()
            if not npwr:
                raw_p = g_row.get("platform_game_id")
                npwr = (
                    raw_p[0]
                    if isinstance(raw_p, list) and raw_p
                    else str(raw_p or game_id)
                )

            label_info = f"Trophy #{str_tid}" if str_tid else f"Gruppe '{group_name}'"
            print(f"📺 [{label_info}] Scanne: {video_url}")
            supabase.table("trophy_video_scrape_queue").update(
                {"status": "PROCESSING"}
            ).eq("id", job_id).execute()

            try:
                items = extract_timestamps_from_url(video_url, ydl)
                if not items:
                    supabase.table("trophy_video_scrape_queue").update(
                        {
                            "status": "ERROR",
                            "error_msg": "Keine Kapitel oder Timestamps im Video gefunden.",
                            "processed_at": datetime.now(timezone.utc).isoformat(),
                        }
                    ).eq("id", job_id).execute()
                    print("   ⚠️ Keine Timestamps im Video gefunden.")
                    continue

                sample_str = " ".join(
                    f"{it['label']} {it['video_title']}" for it in items[:20]
                )
                src_lang = detect_text_locale(sample_str)
                sheet_type_arr = resolve_sheet_type_for_col(target_col)
                next_gid = get_next_guide_id_offset(game_id) + 1

                # Falls im Job (trophy_name) ein Creator-Name mitgegeben wurde, bevorzugen, sonst aus YouTube
                first_creator = (
                    trophy_name
                    if (not str_tid and trophy_name)
                    else items[0]["creator_name"]
                )
                safe_creator = re.sub(r"[^a-zA-Z0-9_-]", "_", first_creator)[:20]

                b_key_tuple = (str(game_id), safe_creator)
                if b_key_tuple not in batch_key_by_game_creator:
                    batch_key_by_game_creator[b_key_tuple] = (
                        f"tvq_{str(game_id)[:8]}_{safe_creator}_{session_ts}"
                    )
                batch_key = batch_key_by_game_creator[b_key_tuple]

                group_jsonb = {"de": group_name, src_lang: group_name}

                roh_rows = []
                for it in items:
                    item_jsonb = {"de": it["label"], src_lang: it["label"]}
                    chap_jsonb = {"de": it["video_title"], src_lang: it["video_title"]}

                    roh_rows.append(
                        {
                            "batch_key": batch_key,
                            "batch_status": "OPEN",
                            "game_id": game_id,
                            "platform_game_id": npwr,
                            "creator_name": first_creator,
                            "playlist_url": video_url,
                            "guide_id": str(next_gid),
                            "sheet_type": sheet_type_arr,
                            "item_name": item_jsonb,
                            "chronological_group": (
                                group_jsonb
                                if target_col == "chronological_group"
                                else None
                            ),
                            "category_group": (
                                group_jsonb if target_col == "category_group" else None
                            ),
                            "boss_group": (
                                group_jsonb if target_col == "boss_group" else None
                            ),
                            "video_chapter": chap_jsonb,
                            "timestamp": it["timestamp"],
                            "video_url": f"{it['base_video_url']}&t={it['seconds']}s",
                            "trophy_id": str_tid,
                            "is_trophy_relevant": "Ja" if str_tid else "Nein",
                        }
                    )
                    next_gid += 1

                for i in range(0, len(roh_rows), 500):
                    supabase.table("game_guides_rohmaterial").insert(
                        roh_rows[i : i + 500]
                    ).execute()

                status_obj = (
                    dict(g_row.get("status") or {})
                    if isinstance(g_row.get("status"), dict)
                    else {}
                )
                status_obj["rohmaterial"] = "PENDING_MULTI_TAB"
                supabase.table("games").update({"status": status_obj}).eq(
                    "id", game_id
                ).execute()

                supabase.table("trophy_video_scrape_queue").update(
                    {
                        "status": "DONE",
                        "extracted_count": len(roh_rows),
                        "error_msg": None,
                        "processed_at": datetime.now(timezone.utc).isoformat(),
                    }
                ).eq("id", job_id).execute()

                print(
                    f"   ✅ {len(roh_rows)} Schritte (Gruppe '{group_name}' | Tab {sheet_type_arr}) "
                    f"direkt in Multi-Tab (game_guides_rohmaterial) geladen!"
                )
                time.sleep(1.2)
            except Exception as e:
                supabase.table("trophy_video_scrape_queue").update(
                    {
                        "status": "ERROR",
                        "error_msg": str(e)[:300],
                        "processed_at": datetime.now(timezone.utc).isoformat(),
                    }
                ).eq("id", job_id).execute()
                print(f"   ❌ Fehler: {e}")


if __name__ == "__main__":
    process_queue()
