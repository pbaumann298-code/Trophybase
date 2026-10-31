import os
import sys
import json
import re
from urllib.parse import quote_plus
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
EXCEL_OUTPUT_FILE = os.path.join(_BASE_DIR, "QA_Video_Discovery.xlsx")
SCANNED_LOG_FILE = os.path.join(_BASE_DIR, "target_hunter_scanned_ids.json")

# --- BATCH-LIMITS ---
MAX_GAMES_PER_RUN = 50  # Maximal 50 offene Spiele pro Durchlauf prüfen
MAX_OFFERS_PER_GAME = (
    5  # Maximal 5 Guide-Angebote (Videos/Playlists mit Timestamps) pro Spiel
)
MIN_TIMESTAMPS_REQUIRED = (
    2  # Mindestens 2 Timestamps nötig, damit ein Angebot aufgenommen wird
)

ROMAN_MAP = {
    "x": "10",
    "ix": "9",
    "viii": "8",
    "vii": "7",
    "vi": "6",
    "v": "5",
    "iv": "4",
    "iii": "3",
    "ii": "2",
    "i": "1",
}


# --- 1. SUPABASE ABGLEICH (GAMES vs. GUIDES + STAGING) ---


def extract_npwr_list(val: Any) -> List[str]:
    if isinstance(val, list):
        return [str(x).strip("[]'\" ") for x in val if x]
    if isinstance(val, str):
        cleaned = val.strip()
        if cleaned.startswith("[") and cleaned.endswith("]"):
            try:
                parsed = json.loads(cleaned)
                return [str(x).strip("[]'\" ") for x in parsed if x]
            except Exception:
                pass
        return [cleaned.strip("[]'\" ")] if cleaned else []
    return []


def parse_dict_safely(val: Any) -> dict:
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        cleaned = val.strip()
        if cleaned.startswith("{"):
            try:
                parsed = json.loads(cleaned)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass
    return {}


def fetch_all_supabase_rows(
    table_name: str, select_query: str, order_col: str = "id"
) -> List[Dict[str, Any]]:
    all_data = []
    limit = 1000
    offset = 0
    while True:
        query = supabase.table(table_name).select(select_query)
        if table_name == "games":
            query = query.or_("spiel_typ.is.null,spiel_typ.neq.Unlesbar")
        if order_col:
            query = query.order(order_col)
        res = query.range(offset, offset + limit - 1).execute()
        data = res.data or []
        if not data:
            break
        all_data.extend(data)
        if len(data) < limit:
            break
        offset += limit
    return all_data


def load_scanned_no_hit_ids() -> set:
    """Lädt Spiel-IDs, bei denen in früheren Läufen 0 Treffer auf YouTube gefunden wurden."""
    if os.path.exists(SCANNED_LOG_FILE):
        try:
            with open(SCANNED_LOG_FILE, "r", encoding="utf-8") as f:
                return set(json.load(f))
        except Exception:
            pass
    return set()


def save_scanned_no_hit_id(game_id: Any, scanned_set: set):
    scanned_set.add(str(game_id))
    with open(SCANNED_LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(list(scanned_set), f, indent=2)


PRIORITY_BY_TYPE = {
    "evergreen": 1,
    "premium": 2,
    "easy_platin": 3,
    "standard": 4,
    "servertot": 5,
}
PRIORITY_BY_GUIDE_TYP = {"S": 1, "A": 2, "B": 3, "C": 4}


def get_open_games_batch(max_games: int = MAX_GAMES_PER_RUN) -> List[Dict[str, Any]]:
    """
    Sucht Spiele, die noch kein Video haben (auch wenn sie bereits als Text/Radar PUBLISHED sind
    oder Servertot mit Offline-Story sind), und holt bis zu 5 Creator-Angebote nach staging_game_guides.
    """
    print(
        "🔄 Lade Spiele für YouTube-Aufwertung (inkl. PUBLISHED ohne Video & Offline-Servertot)..."
    )
    all_games = fetch_all_supabase_rows(
        "games",
        "id, platform_game_id, spieltitel, status, spiel_typ, guide_typ, anzahl_trophaeen, total_online_trophies",
    )
    all_staging = fetch_all_supabase_rows(
        "staging_game_guides", "game_id", order_col=""
    )
    staging_game_ids = {str(r["game_id"]) for r in all_staging if r.get("game_id")}
    already_scanned_empty = load_scanned_no_hit_ids()

    candidates = []
    for g in all_games:
        gid = str(g.get("id") or "")
        if not gid or gid in staging_game_ids or gid in already_scanned_empty:
            continue

        status_obj = parse_dict_safely(g.get("status"))
        # Überspringe nur Spiele, die bereits einen fertigen VIDEO-Guide haben
        if status_obj.get("guides") == "HAS_VIDEO":
            continue

        st_low = str(g.get("spiel_typ") or "").strip().lower()
        if "unlesbar" in st_low or "quickwin" in st_low:
            continue

        g_typ = str(g.get("guide_typ") or "").strip().upper()
        if g_typ == "D":
            continue

        # Servertot-Prüfung: Nur kappen, wenn keine nennenswerten Offline-Trophäen existieren
        if "servertot" in st_low:
            total_t = int(g.get("anzahl_trophaeen") or 0)
            online_t = int(g.get("total_online_trophies") or 0)
            if total_t > 0 and online_t >= (total_t - 2):
                continue

        titles = parse_dict_safely(g.get("spieltitel"))
        t_en = (titles.get("en") or "").strip()
        t_de = (titles.get("de") or "").strip()
        if not t_en and not t_de:
            continue

        g_npwrs = extract_npwr_list(g.get("platform_game_id"))
        primary_st = (
            "servertot" if "servertot" in st_low else st_low.split(",")[0].strip()
        )
        prio_tuple = (
            PRIORITY_BY_TYPE.get(primary_st, 8),
            PRIORITY_BY_GUIDE_TYP.get(g_typ, 8),
        )

        candidates.append(
            {
                "game_id": gid,
                "npwr_id": g_npwrs[0] if g_npwrs else "",
                "all_npwrs": ", ".join(g_npwrs),
                "display_title": t_en or t_de,
                "t_en": t_en,
                "t_de": t_de,
                "_prio": prio_tuple,
            }
        )

    candidates.sort(key=lambda x: (x["_prio"], x["display_title"]))
    print(
        f"📊 {len(candidates)} Spiele bereit für Video-Aufwertung -> Starte Top-{min(max_games, len(candidates))} Batch.\n"
    )
    return candidates[:max_games]


# --- 2. HYBRID MATCHER V3 & SORTIERUNG (AUS 08.1) ---


def clean_game_title(game_title: str) -> str:
    text = game_title.lower()
    text = re.sub(r"[™®©\n\r]", " ", text)
    text = re.sub(
        r"\b(ce|collector'?s?\s+edition|remastered|deluxe\s+edition|definitive\s+edition|ps4|ps5)\b",
        " ",
        text,
    )
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    words = text.split()
    if len(words) >= 2 and words[-1] in ROMAN_MAP:
        words[-1] = ROMAN_MAP[words[-1]]
    return " ".join(words)


def clean_video_core_title(video_title: str) -> str:
    text = video_title.lower()
    text = re.sub(r"\b(level|chapter|episode|part)\s+([0-9])o\b", r"\1 \g<2>0", text)
    text = re.sub(
        r"(?i)\s*[-–—|]\s*.*?\b(platinum|trophy|guide|walkthrough|100%|unedited|gameplay|first \d+ minutes|no commentary)\b.*$",
        "",
        text,
    )
    cutoff_pattern = (
        r"\b(bonus\s+chapter|all\s+chapters|stories\s+all\s+chapters|stories\s+chapter|"
        r"chapter\s+\d+|episode\s+\d+|level\s+\d+|part\s+\d+|case\s+\d+|"
        r"f2p|full\s+gameplay|full\s+game|full\s+stars|all\s+stars|all\s+hidden|"
        r"gameplay\s+walkthrough|platinum\s+trophy|trophy\s+guide|walkthrough\s+guide|"
        r"walkthrough|collectibles\s+guide|all\s+collectibles|with\s+memories|grind\s+to\s+platinum)\b.*$"
    )
    text = re.sub(cutoff_pattern, " ", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    words = text.split()
    if len(words) >= 2 and words[-1] in ROMAN_MAP:
        words[-1] = ROMAN_MAP[words[-1]]
    return " ".join(words)


def _stem_tokens(words: List[str]) -> List[str]:
    res = []
    for w in words:
        if w in {"the", "a", "an", "of", "s"}:
            continue
        if len(w) > 4 and w.endswith("s"):
            w = w[:-1]
        res.append(w)
    return res


def is_hybrid_match(game_title: str, video_title: str) -> bool:
    if not game_title or not video_title:
        return False

    if re.search(
        r"\b(demo\s+gameplay|trailer|new\s+at\s+ps|ps\s+plus\s+extra|tier\s+list|review|reaction)\b",
        video_title,
        re.I,
    ):
        return False

    g_clean = clean_game_title(game_title)
    v_clean = clean_video_core_title(video_title)
    if not g_clean or not v_clean:
        return False

    g_words = g_clean.split()
    v_words = v_clean.split()

    if len(g_words) == 1 or len(g_clean) <= 5:
        return g_clean == v_clean or g_clean in v_words[:2]

    g_nums = [w for w in g_words if w.isdigit()]
    v_prefix_words = v_words[: len(g_words) + 1]
    v_nums_in_prefix = [w for w in v_prefix_words if w.isdigit()]

    if g_nums == ["1"] and not v_nums_in_prefix and len(g_words) >= 3:
        g_base = " ".join([w for w in g_words if w != "1"])
        if v_clean.startswith(g_base + " "):
            return True
    elif not g_nums and v_nums_in_prefix == ["1"] and len(g_words) >= 2:
        if v_clean.startswith(g_clean + " 1"):
            return True

    if g_nums != v_nums_in_prefix:
        g_stem = _stem_tokens([w for w in g_words if not w.isdigit()])
        v_stem = _stem_tokens([w for w in v_words if not w.isdigit()])
        if len(g_stem) >= 3 and g_stem == v_stem:
            return True
        return False

    if g_clean == v_clean or _stem_tokens(g_words) == _stem_tokens(v_words):
        return True

    if v_clean.startswith(g_clean + " ") or g_clean in v_clean:
        return True

    return False


def matches_game(cand: Dict[str, Any], yt_title: str) -> bool:
    return is_hybrid_match(cand["t_en"], yt_title) or is_hybrid_match(
        cand["t_de"], yt_title
    )


def classify_sort_tuple(video_title: str) -> Tuple[int, int, int]:
    vt_norm = re.sub(
        r"\b(level|chapter|episode|part)\s+([0-9])o\b",
        r"\1 \g<2>0",
        video_title,
        flags=re.I,
    )
    vt_low = vt_norm.lower()
    sub_type = (
        2
        if re.search(
            r"\b(all\s+hidden\s+objects|hidden\s+collectibles|collectibles\s+guide)\b",
            vt_low,
        )
        else 1
    )

    if "bonus chapter" in vt_low or "secret room" in vt_low:
        return (3, 999, sub_type)
    if re.search(r"\ball\s+chapters\b", vt_low):
        return (1, 0, sub_type)
    m = re.search(r"\b(chapter|episode|level|part|case)\s*(\d+)\b", vt_low)
    if m:
        return (2, int(m.group(2)), sub_type)
    return (1, 1, sub_type)


def extract_clean_video_url(entry: dict) -> str:
    raw_id = str(entry.get("id") or "").strip()
    raw_url = str(entry.get("url") or entry.get("webpage_url") or "").strip()
    vid = ""
    if len(raw_id) == 11 and not raw_id.startswith(("PL", "UU", "FL", "RD")):
        vid = raw_id
    else:
        match = re.search(
            r"(?:v=|/|youtu\.be/|shorts/|embed/)([a-zA-Z0-9_-]{11})(?:[&?/#]|$)",
            raw_url,
        )
        if match:
            vid = match.group(1)
    if vid and not vid.startswith(("PL", "UU", "FL", "RD")):
        return f"https://www.youtube.com/watch?v={vid}"
    return ""


# --- 3. TIMESTAMP-QUICK-CHECK & TARGET-SUCHE ---


def count_video_timestamps(video_url: str, ydl_full) -> Tuple[int, str]:
    """Prüft schnell, ob ein Video mindestens MIN_TIMESTAMPS_REQUIRED Kapitel/Timestamps besitzt."""
    try:
        info = ydl_full.extract_info(video_url, download=False)
        if not info:
            return 0, "Unbekannt"

        creator = info.get("uploader") or info.get("channel") or "Unbekannt"

        # 1. Native YouTube Chapters
        chapters = info.get("chapters")
        if (
            chapters
            and isinstance(chapters, list)
            and len(chapters) >= MIN_TIMESTAMPS_REQUIRED
        ):
            return len(chapters), creator

        # 2. Description Regex (identisch zu 08.2)
        desc = info.get("description") or ""
        if desc:
            ts_hits = 0
            for line in desc.splitlines():
                m = re.search(
                    r"(?:^|\s|\[|\()(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*[-–—to]+\s*\d{1,2}:\d{2}(?::\d{2})?)?(?:\]|\)|\s|$)\s*[-–—:|]*\s*(.+)",
                    line,
                )
                if m:
                    label_raw = m.group(2).strip()
                    if (
                        label_raw
                        and "http://" not in label_raw
                        and "https://" not in label_raw
                    ):
                        ts_hits += 1
            if ts_hits >= MIN_TIMESTAMPS_REQUIRED:
                return ts_hits, creator

    except Exception:
        pass
    return 0, "Unbekannt"


def hunt_offers_for_game(
    game: Dict[str, Any], ydl_flat, ydl_full, max_offers: int = MAX_OFFERS_PER_GAME
) -> List[Dict[str, Any]]:
    """
    Sucht bis zu `max_offers` verschiedene Angebote (Videos oder Playlists mit Timestamps) für 1 Spiel.
    Gibt die Zeilen exakt im Schema für `08.2_Excel_Upload_nach_Subabase.py` zurück.
    """
    search_title = game["t_en"] or game["t_de"]
    discovered_rows = []
    seen_video_urls = set()
    offers_found = 0

    # --- SCHRITT A: Einzelvideo-Guides suchen (Top 10 Treffer prüfen) ---
    queries = [
        f"ytsearch8:{search_title} Trophy Guide Collectibles Walkthrough",
        f"ytsearch5:{search_title} Full Game Walkthrough All Chapters",
    ]

    for q in queries:
        if offers_found >= max_offers:
            break
        try:
            res = ydl_flat.extract_info(q, download=False)
            entries = res.get("entries") or [] if res else []
        except Exception:
            entries = []

        for entry in entries:
            if offers_found >= max_offers or not entry:
                break

            vid_title = entry.get("title") or ""
            duration = entry.get("duration") or 0
            vid_url = extract_clean_video_url(entry)

            if not vid_url or vid_url in seen_video_urls or duration < 120:
                continue
            if not matches_game(game, vid_title):
                continue

            ts_count, creator_name = count_video_timestamps(vid_url, ydl_full)
            if ts_count >= MIN_TIMESTAMPS_REQUIRED:
                seen_video_urls.add(vid_url)
                offers_found += 1
                print(
                    f"      ✅ Angebot #{offers_found} [VIDEO | {ts_count} TS]: {creator_name} -> '{vid_title[:55]}'"
                )
                discovered_rows.append(
                    {
                        "creator_name": creator_name,
                        "creator_input_url": vid_url,
                        "npwr_id": game["npwr_id"],
                        "all_npwrs": game["all_npwrs"],
                        "game_id": game["game_id"],
                        "game_title": game["display_title"],
                        "video_title": vid_title,
                        "video_url": vid_url,
                        "offer_type": "SINGLE_VIDEO",
                        "timestamp_preview_count": ts_count,
                        "_sort": classify_sort_tuple(vid_title),
                    }
                )

    # --- SCHRITT B: Playlist-Guides suchen (falls noch keine 5 Angebote voll sind) ---
    if offers_found < max_offers:
        pl_search_url = (
            f"https://www.youtube.com/results?search_query="
            f"{quote_plus(search_title + ' Trophy Guide Walkthrough')}&sp=EgIQAw%253D%253D"
        )
        try:
            pl_res = ydl_flat.extract_info(pl_search_url, download=False)
            pl_entries = (pl_res.get("entries") or [])[:4] if pl_res else []
        except Exception:
            pl_entries = []

        for pl in pl_entries:
            if offers_found >= max_offers or not pl:
                break

            pl_id = pl.get("id") or pl.get("url") or ""
            pl_title = pl.get("title") or ""
            if not pl_id or not matches_game(game, pl_title):
                continue

            pl_url = (
                pl_id
                if str(pl_id).startswith("http")
                else f"https://www.youtube.com/playlist?list={pl_id}"
            )

            try:
                pl_data = ydl_flat.extract_info(pl_url, download=False)
                pl_videos = (pl_data.get("entries") or []) if pl_data else []
            except Exception:
                pl_videos = []

            if len(pl_videos) < 2 or len(pl_videos) > 80:
                continue

            # Prüfe das erste gültige Video der Playlist auf Timestamps
            first_valid_vid = None
            for v in pl_videos[:3]:
                v_url = extract_clean_video_url(v or {})
                if v_url:
                    first_valid_vid = v_url
                    break

            if not first_valid_vid:
                continue

            ts_count, creator_name = count_video_timestamps(first_valid_vid, ydl_full)
            if creator_name == "Unbekannt":
                creator_name = (
                    pl_data.get("uploader") or pl_data.get("channel") or "Unbekannt"
                )

            if ts_count >= MIN_TIMESTAMPS_REQUIRED:
                offers_found += 1
                added_in_pl = 0
                for v in pl_videos:
                    if not v:
                        continue
                    v_title = v.get("title") or ""
                    v_url = extract_clean_video_url(v)
                    if (
                        not v_url
                        or v_url in seen_video_urls
                        or "[Private" in v_title
                        or "[Deleted" in v_title
                    ):
                        continue
                    seen_video_urls.add(v_url)
                    added_in_pl += 1
                    discovered_rows.append(
                        {
                            "creator_name": creator_name,
                            "creator_input_url": pl_url,
                            "npwr_id": game["npwr_id"],
                            "all_npwrs": game["all_npwrs"],
                            "game_id": game["game_id"],
                            "game_title": game["display_title"],
                            "video_title": v_title,
                            "video_url": v_url,
                            "offer_type": f"PLAYLIST ({len(pl_videos)} Vids)",
                            "timestamp_preview_count": ts_count,
                            "_sort": classify_sort_tuple(v_title),
                        }
                    )
                if added_in_pl > 0:
                    print(
                        f"      ✅ Angebot #{offers_found} [PLAYLIST | {added_in_pl} Vids | ~{ts_count} TS]: {creator_name} -> '{pl_title[:50]}'"
                    )

    return discovered_rows


# --- 4. MAIN DISCOVERY PIPELINE ---


def run_target_discovery():
    open_batch = get_open_games_batch(MAX_GAMES_PER_RUN)
    if not open_batch:
        print("✅ Keine offenen Spiele mehr übrig!")
        return

    ydl_flat_opts = {
        "extract_flat": True,
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": True,
        "js_runtimes": {"node": {}},
    }

    ydl_full_opts = {
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

    all_discovered_rows = []
    scanned_empty_set = load_scanned_no_hit_ids()

    with yt_dlp.YoutubeDL(ydl_flat_opts) as ydl_flat, yt_dlp.YoutubeDL(
        ydl_full_opts
    ) as ydl_full:
        for idx, game in enumerate(open_batch, start=1):
            print(
                f"[{idx:02d}/{len(open_batch)}] 🎯 Suche bis zu {MAX_OFFERS_PER_GAME} Angebote für: '{game['display_title']}' (ID: {game['game_id']})"
            )
            game_rows = hunt_offers_for_game(
                game, ydl_flat, ydl_full, MAX_OFFERS_PER_GAME
            )

            if game_rows:
                all_discovered_rows.extend(game_rows)
                # Laufendes Zwischenspeichern in die Excel nach jedem Spiel mit Treffern
                df_temp = pd.DataFrame(all_discovered_rows)
                df_temp = df_temp.drop_duplicates(subset=["game_id", "video_url"])
                df_temp = df_temp.sort_values(
                    by=["game_title", "creator_name", "_sort"]
                ).drop(columns=["_sort"])
                df_temp.to_excel(EXCEL_OUTPUT_FILE, index=False)
            else:
                print(
                    f"      ❌ Keine Guides mit Timestamps gefunden (wird beim nächsten Lauf übersprungen)."
                )
                save_scanned_no_hit_id(game["game_id"], scanned_empty_set)

    if not all_discovered_rows:
        print("\nℹ️ In diesem 50er-Batch wurden keine Guides mit Timestamps gefunden.")
        return

    print(
        f"\n🏁 FERTIG! {len(all_discovered_rows)} Video-Zeilen in '{os.path.basename(EXCEL_OUTPUT_FILE)}' gespeichert!"
    )
    print(
        "👉 Nächster Schritt: In 'QA_Video_Discovery.xlsx' kurz die besten Angebote behalten, Rest löschen -> und direkt dein '08.2_Excel_Upload_nach_Subabase.py' starten!"
    )


if __name__ == "__main__":
    run_target_discovery()
