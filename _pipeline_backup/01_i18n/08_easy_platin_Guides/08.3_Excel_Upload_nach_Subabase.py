import os
import sys
import re
from typing import Any, List, Dict, Tuple
import yt_dlp
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_EXCEL_FILE = os.path.join(_BASE_DIR, "QA_Video_Discovery.xlsx")
FINAL_EXCEL_BACKUP = os.path.join(_BASE_DIR, "QA_Final_Staging_Rows.xlsx")


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
                    # Falls ein echtes Kapitel durch Reparatur auf 00:00 fällt, überschreibe den Platzhalter "Start"
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
            # Falls der Creator keinen 00:00 Timestamp gesetzt hat (z.B. erster Timestamp erst bei 06:38),
            # fügen wir automatisch "Start" bei 00:00 ein, damit das Intro/Setup nicht verloren geht!
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
    """Entfernt In-Batch-Duplikate, korrigiert guide_id lückenlos und lädt hoch."""
    deduped_map: Dict[Tuple[str, str, str, str], Dict[str, Any]] = {}

    for r in rows:
        row_copy = dict(r)
        row_copy.pop("creator_input_url", None)
        for k, v in row_copy.items():
            if pd.isna(v):
                row_copy[k] = None

        # Exakter Schlüssel passend zum Unique-Index in Supabase
        key = (
            str(row_copy.get("game_id") or ""),
            str(row_copy.get("creator_name") or ""),
            str(row_copy.get("video_url") or ""),
            str(row_copy.get("timestamp") or ""),
        )
        # Behält bei doppelter Sekunde im selben Video den ersten Eintrag
        if key not in deduped_map:
            deduped_map[key] = row_copy

    clean_rows = list(deduped_map.values())

    # guide_id pro (game_id, creator_name) lückenlos neu durchnummerieren (falls ein Duplikat entfernt wurde)
    counters: Dict[Tuple[str, str], int] = {}
    for r in clean_rows:
        g_key = (str(r["game_id"]), str(r["creator_name"]))
        counters[g_key] = counters.get(g_key, 0) + 1
        r["guide_id"] = counters[g_key]

    removed = len(rows) - len(clean_rows)
    if removed > 0:
        print(
            f"🧹 {removed} doppelte Timestamp-Zeile(n) innerhalb des Batches entfernt."
        )

    print(
        f"🚀 Lade {len(clean_rows)} Zeilen nach Supabase (`staging_game_guides`) hoch..."
    )

    batch_size = 500
    for i in range(0, len(clean_rows), batch_size):
        batch = clean_rows[i : i + batch_size]
        supabase.table("staging_game_guides").upsert(
            batch, on_conflict="game_id,creator_name,video_url,timestamp"
        ).execute()


if os.path.exists(FINAL_EXCEL_BACKUP):
    os.remove(FINAL_EXCEL_BACKUP)
    print("🏁 FERTIG! Daten liegen bereit in deiner 'Entwürfe'-Ansicht.")


def run_stage2_enrich_and_upload():
    # Falls das Backup aus dem abgebrochenen Lauf schon existiert -> Direkt hochladen ohne neuen YouTube-Crawl!
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
        gid = str(row["game_id"]).strip()
        cname = str(row["creator_name"]).strip()
        key = (gid, cname)
        if key not in grouped:
            grouped[key] = {
                "game_id": gid,
                "npwr_id": str(row["npwr_id"]).strip(),
                "game_title": str(row["game_title"]).strip(),
                "creator_name": cname,
                "videos": [],
            }
        grouped[key]["videos"].append(
            {
                "video_title": str(row["video_title"]).strip(),
                "video_url": str(row["video_url"]).split("&t=")[0].strip(),
            }
        )

    staging_rows = []

    # Optimierte yt-dlp Optionen (nutzt Node.js, unterdrückt JS-Warnung & überspringt Video-Format-Checks)
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
                                "guide_id": guide_id_counter,
                                "chronological_group": group_name,
                                "video_chapter": v["video_title"],
                                "item_name": ts["label"],
                                "timestamp": ts["timestamp"],
                                "video_url": f"{base_url}&t={ts['seconds']}s",
                                "trophy_id": None,
                                "is_trophy_relevant": "Nein",
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
                            "guide_id": guide_id_counter,
                            "chronological_group": "Walkthrough",
                            "video_chapter": v["video_title"],
                            "item_name": item_val,
                            "timestamp": "00:00",
                            "video_url": f"{base_url}&t=0s",
                            "trophy_id": None,
                            "is_trophy_relevant": "Nein",
                        }
                    )
                    guide_id_counter += 1

    # 1. Lokales Backup der finalen Zeilen speichern
    pd.DataFrame(staging_rows).to_excel(FINAL_EXCEL_BACKUP, index=False)
    print(
        f"\n💾 Finale Zeilen als Backup gespeichert: {os.path.basename(FINAL_EXCEL_BACKUP)} ({len(staging_rows)} Zeilen)"
    )

    # 2. Ab nach Supabase in staging_game_guides
    push_rows_to_supabase(staging_rows)


if __name__ == "__main__":
    run_stage2_enrich_and_upload()
