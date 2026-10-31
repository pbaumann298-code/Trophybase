#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
07.0_Trophy_Video_Queue_Worker.py (Nachfolger von 00_TimeStemps_export_in_Excel-Guidedatei.py)
Verarbeitet auf der Website eingetragene Trophäen-Sammelvideos aus 'trophy_video_scrape_queue':
- Zieht Kapitel oder Description-Timestamps via yt-dlp (inkl. Playlist-Support).
- Versieht JEDE extrahierte Zeile sofort mit der richtigen trophy_id & dem Trophäennamen als Gruppe.
- Schiebt alles direkt in 'staging_game_guides' (Entwürfe-Tab im Intranet) zur finalen Sichtung & Freigabe!
"""

import os
import re
import sys
import json
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


def extract_numeric_trophy_id(raw_tid: Any) -> int | None:
    matches = re.findall(r"\d+", str(raw_tid or ""))
    return int(matches[-1]) if matches else None


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
    """Ermittelt die höchste bestehende guide_id in staging_game_guides + game_guides für dieses Spiel."""
    max_id = 0
    for table in ("staging_game_guides", "game_guides"):
        res = supabase.table(table).select("guide_id").eq("game_id", game_id).execute()
        for r in res.data or []:
            m = re.search(r"\d+", str(r.get("guide_id") or ""))
            if m:
                max_id = max(max_id, int(m.group(0)))
    return max_id


def process_queue():
    res = (
        supabase.table("trophy_video_scrape_queue")
        .select("*")
        .eq("status", "PENDING")
        .order("created_at")
        .execute()
    )
    jobs = res.data or []
    if not jobs:
        print("✅ Keine offenen Video-Aufträge in 'trophy_video_scrape_queue'.")
        return

    print(
        f"🚀 Verarbeite {len(jobs)} Trophäen-Video-Aufträge aus der Website-Queue...\n"
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

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        for job in jobs:
            job_id = job["id"]
            game_id = job["game_id"]
            video_url = str(job["video_url"]).strip()
            raw_tid = job["trophy_id"]
            num_tid = extract_numeric_trophy_id(raw_tid)
            trophy_name = str(job.get("trophy_name") or f"Trophäe #{raw_tid}").strip()
            group_name = str(job.get("custom_group_name") or trophy_name).strip()
            target_col = job.get("target_group_col") or "category_group"

            # NPWR aus games holen, falls im Job leer
            npwr = str(job.get("platform_game_id") or "").strip()
            if not npwr:
                g_res = (
                    supabase.table("games")
                    .select("platform_game_id")
                    .eq("id", game_id)
                    .limit(1)
                    .execute()
                )
                if g_res.data:
                    raw_p = g_res.data[0].get("platform_game_id")
                    npwr = (
                        raw_p[0]
                        if isinstance(raw_p, list) and raw_p
                        else str(raw_p or "")
                    )

            print(f"📺 [{trophy_name} | Trophy #{num_tid}] Scanne: {video_url}")
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

                next_gid = get_next_guide_id_offset(game_id) + 1
                staging_rows = []

                for it in items:
                    row_payload = {
                        "game_id": game_id,
                        "platform_game_id": npwr or str(game_id),
                        "creator_name": it["creator_name"],
                        "creator_input_url": video_url,
                        "guide_id": next_gid,
                        # staging_game_guides hat NOT NULL auf chronological_group:
                        "chronological_group": (
                            group_name
                            if target_col == "chronological_group"
                            else "Sammelobjekte"
                        ),
                        "category_group": (
                            group_name if target_col == "category_group" else None
                        ),
                        "boss_group": (
                            group_name if target_col == "boss_group" else None
                        ),
                        "video_chapter": it["video_title"],
                        "item_name": it["label"],
                        "timestamp": it["timestamp"],
                        "video_url": f"{it['base_video_url']}&t={it['seconds']}s",
                        "trophy_id": num_tid,
                        "is_trophy_relevant": "Ja",
                    }
                    staging_rows.append(row_payload)
                    next_gid += 1

                supabase.table("staging_game_guides").upsert(
                    staging_rows, on_conflict="game_id,creator_name,video_url,timestamp"
                ).execute()

                supabase.table("trophy_video_scrape_queue").update(
                    {
                        "status": "DONE",
                        "extracted_count": len(staging_rows),
                        "error_msg": None,
                        "processed_at": datetime.now(timezone.utc).isoformat(),
                    }
                ).eq("id", job_id).execute()

                print(
                    f"   ✅ {len(staging_rows)} Schritte mit trophy_id={num_tid} & Gruppe '{group_name}' in Entwürfe (staging_game_guides) geladen!"
                )
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
