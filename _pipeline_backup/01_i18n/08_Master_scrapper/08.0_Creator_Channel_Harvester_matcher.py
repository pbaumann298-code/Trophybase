#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
08.1_Creator_und_Playlist_Matcher.py (Stufe 1 -> QA_Video_Discovery.xlsx)
Vereint 08.1 + 07.1 (Publisher-Erkennung) + 07.2 (Supabase content_creators):
- KEIN Blind-Upload in die DB! Schreibt alle Treffer zur Sichtprüfung in 'QA_Video_Discovery.xlsx'.
- Harter Vorab-Filter gegen Creator-Müll (Reaction, Unboxing, Let's Play, Stream, Review, Shorts, Trailer).
- Berechnet vorab die Spalte 'target_queue' ('MULTI_TAB' vs. 'STAGING') für 08.3.
"""

import os
import re
import sys
import json
from typing import Any, Dict, List, Optional, Set, Tuple
import yt_dlp
import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PLAYLISTS_FILE = os.path.join(_BASE_DIR, "playlists.txt")
EXCEL_OUTPUT_FILE = os.path.join(_BASE_DIR, "QA_Video_Discovery.xlsx")

MAX_CHANNEL_VIDEOS = int(os.getenv("MAX_CHANNEL_VIDEOS", 350))

DEFAULT_SIGNATURE_TAGS = [
    "trophy", "trophies", "guide", "walkthrough", "platinum", "platin", "100%", "collectibles", "all locations"
]

# Harter Türsteher gegen Creator-Müll im Videotitel
TRASH_VIDEO_RE = re.compile(
    r"\b("
    r"unboxing|reaction|reacts|review|tier\s*list|ranking|podcast|interview|"
    r"trailer|teaser|announcement|reveal|demo\s+gameplay|beta\s+gameplay|"
    r"first\s+impressions|angespielt|meinung|fazit|kritik|news|update\s+patch|"
    r"livestream|live\s+stream|stream\s+vod|twitch\s+vod|let'?s\s+play|"
    r"blind\s+playthrough|first\s+time\s+playing|new\s+at\s+ps|ps\s+plus\s+extra|"
    r"worth\s+it|before\s+you\s+buy|soundtrack|ost\b|speedrun\s+wr"
    r")\b",
    re.I,
)

# Erlaubt Episoden/Parts NUR, wenn gleichzeitig ein Guide/Walkthrough/Collectible-Begriff im Titel steht
GUIDE_SIGNAL_RE = re.compile(
    r"\b(trophy|trophies|platinum|platin|guide|100%|walkthrough|collectibles?|locations?|all\s+chapters|full\s+game)\b",
    re.I,
)
LETS_PLAY_EPISODE_RE = re.compile(r"\b(let'?s\s*play|ep\.?\s*\d+|episode\s+\d+|part\s+\d+|folge\s+\d+|#\d+)\b", re.I)

ROMAN_MAP = {
    "x": "10", "ix": "9", "viii": "8", "vii": "7", "vi": "6",
    "v": "5", "iv": "4", "iii": "3", "ii": "2", "i": "1",
}


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
        return dict(val)
    if isinstance(val, str) and val.strip().startswith("{"):
        try:
            parsed = json.loads(val.strip())
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return {}


def fetch_all_supabase_rows(table_name: str, select_query: str, order_col: str = "id") -> List[Dict[str, Any]]:
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


def predict_target_queue(spiel_typ: str, guide_typ: str, is_playlist: bool = False) -> str:
    """Schlägt vorab für die Excel vor, ob das Spiel in MULTI_TAB oder STAGING gehört."""
    st_low = str(spiel_typ or "").lower()
    g_typ = str(guide_typ or "").strip().upper()

    if "quickwin" in st_low or ("easy_platin" in st_low and "evergreen" not in st_low and "premium" not in st_low):
        return "STAGING"
    if "evergreen" in st_low or "premium" in st_low or g_typ in ("S", "A") or is_playlist:
        return "MULTI_TAB"
    return "STAGING"


def is_trash_video(video_entry: dict, video_title: str) -> bool:
    """Filtert Creator-Müll (Reactions, Unboxings, Streams, Shorts, Let's Plays) hart aus."""
    if not video_title or "[Private" in video_title or "[Deleted" in video_title:
        return True

    # 1. Livestreams & vergangene Streams sofort raus
    live_status = str(video_entry.get("live_status") or "").lower()
    if live_status in ("is_live", "was_live", "is_upcoming", "post_live"):
        return True

    # 2. YouTube Shorts (< 60s oder /shorts/ in URL) raus
    duration = video_entry.get("duration")
    raw_url = str(video_entry.get("url") or video_entry.get("webpage_url") or "")
    if "/shorts/" in raw_url or (isinstance(duration, (int, float)) and 0 < duration < 60):
        return True

    # 3. Blacklist-Begriffe (Reaction, Unboxing, Review, Stream, Trailer...)
    if TRASH_VIDEO_RE.search(video_title):
        return True

    # 4. Endlos-Let's-Plays ("Part 14", "Episode 7") ohne Guide/Walkthrough/Trophy-Signalwort ablehnen
    if LETS_PLAY_EPISODE_RE.search(video_title) and not GUIDE_SIGNAL_RE.search(video_title):
        return True

    return False


def load_known_publishers() -> List[str]:
    pubs = {
        "Gamuzumi", "Winged Cloud", "ThiGames", "Webnetic", "RandomSpin",
        "Zakym", "Smash Games", "Nostra", "Ratalaika Games", "EastAsiaSoft",
        "Sometimes You", "Powgi", "Lightwood Games", "Artifex Mundi", "Smobile",
    }
    try:
        res_defs = supabase.table("quickwin_publisher_defs").select("publisher").execute()
        for r in res_defs.data or []:
            if r.get("publisher"):
                pubs.add(str(r["publisher"]).strip())
    except Exception:
        pass
    return sorted(pubs, key=len, reverse=True)


def detect_publisher_in_text(text: str, known_pubs: List[str]) -> Optional[str]:
    if not text:
        return None
    t_low = text.lower()
    for pub in known_pubs:
        if re.search(rf"\b{re.escape(pub.lower())}\b", t_low):
            return pub
    return None


def load_creator_sources() -> List[Dict[str, Any]]:
    """Lädt aktive Creator aus Supabase (content_creators) + Links aus playlists.txt."""
    sources = []
    seen_urls = set()

    try:
        res = (
            supabase.table("content_creators")
            .select("id, channel_name, youtube_url, signature_tags, is_active")
            .eq("is_active", True)
            .execute()
        )
        for c in res.data or []:
            url = str(c.get("youtube_url") or "").strip()
            if not url:
                continue
            raw_tags = c.get("signature_tags")
            tags = (
                [str(t).lower() for t in raw_tags if t]
                if isinstance(raw_tags, list) and len(raw_tags) > 0
                else DEFAULT_SIGNATURE_TAGS
            )
            sources.append(
                {
                    "creator_id": c["id"],
                    "creator_name": str(c.get("channel_name") or "Unbekannt").strip(),
                    "input_url": url,
                    "tags": tags,
                }
            )
            seen_urls.add(url.lower().rstrip("/"))
    except Exception as e:
        print(f"⚠️ Hinweis beim Laden von content_creators: {e}")

    if os.path.exists(PLAYLISTS_FILE):
        with open(PLAYLISTS_FILE, "r", encoding="utf-8") as f:
            for line in f:
                raw = line.strip()
                if not raw or raw.startswith("#"):
                    continue
                norm = raw.lower().rstrip("/")
                if norm in seen_urls:
                    continue
                seen_urls.add(norm)
                sources.append(
                    {
                        "creator_id": None,
                        "creator_name": None,
                        "input_url": raw,
                        "tags": [],
                    }
                )

    print(f"📡 {len(sources)} Quellen geladen (content_creators + playlists.txt).")
    return sources


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

    g_clean = clean_game_title(game_title)
    v_clean = clean_video_core_title(video_title)
    if not g_clean or not v_clean:
        return False

    g_words = g_clean.split()
    v_words = v_clean.split()

    if len(g_words) == 1 or len(g_clean) <= 5:
        return g_clean == v_clean

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
    if v_clean.startswith(g_clean + " "):
        return True
    return False


def classify_sort_tuple(video_title: str) -> Tuple[int, int, int]:
    vt_norm = re.sub(r"\b(level|chapter|episode|part)\s+([0-9])o\b", r"\1 \g<2>0", video_title, flags=re.I)
    vt_low = vt_norm.lower()
    sub_type = 2 if re.search(r"\b(all\s+hidden\s+objects|hidden\s+collectibles|collectibles\s+guide)\b", vt_low) else 1
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
    vid = raw_id if (len(raw_id) == 11 and not raw_id.startswith(("PL", "UU", "FL", "RD"))) else ""
    if not vid:
        m = re.search(r"(?:v=|/|youtu\.be/|shorts/|embed/)([a-zA-Z0-9_-]{11})(?:[&?/#]|$)", raw_url)
        if m:
            vid = m.group(1)
    return f"https://www.youtube.com/watch?v={vid}" if vid else ""


def build_games_search_index() -> Dict[str, List[Dict[str, Any]]]:
    print("🔄 Lade Spielekatalog & baue Schnellsuch-Index auf...")
    all_games = fetch_all_supabase_rows(
        "games",
        "id, platform_game_id, spieltitel, status, spiel_typ, guide_typ, publisher, anzahl_trophaeen, total_online_trophies",
    )
    by_first_word: Dict[str, List[Dict[str, Any]]] = {}

    for g in all_games:
        spiel_typ = str(g.get("spiel_typ") or "")
        st_low = spiel_typ.lower()
        g_typ = str(g.get("guide_typ") or "").strip().upper()

        if "unlesbar" in st_low:
            continue
        # Reine D-Selbstläufer (außer Quickwin/easy_platin) brauchen keinen Video-Guide
        if g_typ == "D" and "quickwin" not in st_low and "easy_platin" not in st_low:
            continue
        # Reine Online-Servertot-Leichen kappen
        if "servertot" in st_low:
            tot = int(g.get("anzahl_trophaeen") or 0)
            onl = int(g.get("total_online_trophies") or 0)
            if tot > 0 and onl >= (tot - 2):
                continue

        titles = parse_dict_safely(g.get("spieltitel"))
        t_en = (titles.get("en") or "").strip()
        t_de = (titles.get("de") or "").strip()
        c_en = clean_game_title(t_en) if t_en else ""
        c_de = clean_game_title(t_de) if t_de else ""
        if not c_en and not c_de:
            continue

        npwrs = extract_npwr_list(g.get("platform_game_id"))
        status_obj = parse_dict_safely(g.get("status"))
        has_existing_guide = bool(
            status_obj.get("guides") == "HAS_VIDEO" or status_obj.get("guide_de") == "PUBLISHED"
        )

        entry = {
            "game_id": g["id"],
            "npwr_id": npwrs[0] if npwrs else "",
            "all_npwrs": ", ".join(npwrs),
            "display_title": t_en or t_de or "Unbekannt",
            "t_en": t_en,
            "t_de": t_de,
            "spiel_typ": spiel_typ or "Standard",
            "guide_typ": g_typ or "?",
            "publisher": g.get("publisher") or "",
            "has_existing_guide": "JA (Upgrade)" if has_existing_guide else "NEIN (Neu)",
        }

        keys = set()
        for c in (c_en, c_de):
            words = [w for w in c.split() if not w.isdigit()]
            if words:
                keys.add(words[0])
                if words[0] in {"the", "a", "an", "der", "die", "das"} and len(words) > 1:
                    keys.add(words[1])
        for k in keys:
            by_first_word.setdefault(k, []).append(entry)

    return by_first_word


def match_title_against_index(
    title_to_match: str, games_index: Dict[str, List[Dict[str, Any]]]
) -> Optional[Dict[str, Any]]:
    v_core = clean_video_core_title(title_to_match)
    v_words = [w for w in v_core.split() if not w.isdigit()]
    if not v_words:
        return None

    candidates = list(games_index.get(v_words[0], []))
    if v_words[0] in {"the", "a", "an", "der", "die", "das"} and len(v_words) > 1:
        candidates.extend(games_index.get(v_words[1], []))

    seen_gids = set()
    for cand in candidates:
        gid = cand["game_id"]
        if gid in seen_gids:
            continue
        seen_gids.add(gid)
        if is_hybrid_match(cand["t_en"], title_to_match) or is_hybrid_match(cand["t_de"], title_to_match):
            return cand
    return None


def run_stage1_discovery():
    sources = load_creator_sources()
    if not sources:
        sys.exit("❌ Keine Quellen in content_creators oder playlists.txt gefunden.")

    known_pubs = load_known_publishers()
    games_index = build_games_search_index()

    ydl_opts = {
        "extract_flat": True,
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": True,
        "playlistend": MAX_CHANNEL_VIDEOS,
        "js_runtimes": {"node": {}},
    }

    raw_matches = []
    filtered_trash_count = 0

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        for src in sources:
            raw_url = src["input_url"].rstrip("/")
            tags = src.get("tags") or []
            is_channel = ("@" in raw_url or "/channel/" in raw_url or "/c/" in raw_url) and "playlist?list=" not in raw_url

            # 1. Kanal-Quellen: Playlists-Tab UND Videos-Tab prüfen
            if is_channel:
                base_ch_url = re.sub(r"/(videos|playlists|streams|shorts)$", "", raw_url)

                # A) Playlists des Creators
                pl_tab = f"{base_ch_url}/playlists"
                print(f"📂 Scanne Kanal-Playlists: {pl_tab}")
                pl_info = ydl.extract_info(pl_tab, download=False)
                if pl_info:
                    cname = src["creator_name"] or pl_info.get("uploader") or pl_info.get("channel") or "Unbekannt"
                    for pl_entry in pl_info.get("entries") or []:
                        if not pl_entry:
                            continue
                        pl_title = pl_entry.get("title") or ""
                        if tags and not any(t in pl_title.lower() for t in tags):
                            continue
                        cand = match_title_against_index(pl_title, games_index)
                        if not cand:
                            continue

                        pl_id = pl_entry.get("id") or pl_entry.get("url") or ""
                        pl_url = pl_id if str(pl_id).startswith("http") else f"https://www.youtube.com/playlist?list={pl_id}"
                        pl_data = ydl.extract_info(pl_url, download=False)
                        pl_vids = (pl_data.get("entries") or []) if pl_data else []

                        for v in pl_vids:
                            if not v:
                                continue
                            v_title = v.get("title") or ""
                            if is_trash_video(v, v_title):
                                filtered_trash_count += 1
                                continue
                            v_url = extract_clean_video_url(v)
                            if not v_url:
                                continue
                            det_pub = detect_publisher_in_text(pl_title, known_pubs) or detect_publisher_in_text(v_title, known_pubs) or cand["publisher"]
                            raw_matches.append(
                                {
                                    "target_queue": predict_target_queue(cand["spiel_typ"], cand["guide_typ"], is_playlist= len(pl_vids) >= 3),
                                    "creator_name": cname,
                                    "creator_id": src["creator_id"] or "",
                                    "creator_input_url": pl_url,
                                    "npwr_id": cand["npwr_id"],
                                    "all_npwrs": cand["all_npwrs"],
                                    "game_id": cand["game_id"],
                                    "game_title": cand["display_title"],
                                    "spiel_typ": cand["spiel_typ"],
                                    "guide_typ": cand["guide_typ"],
                                    "publisher": det_pub,
                                    "existing_guide": cand["has_existing_guide"],
                                    "video_title": v_title,
                                    "video_url": v_url,
                                    "_sort": classify_sort_tuple(v_title),
                                }
                            )

                # B) Einzelvideos des Creators
                vid_tab = f"{base_ch_url}/videos"
                print(f"📥 Scanne Kanal-Videos: {vid_tab}")
                v_info = ydl.extract_info(vid_tab, download=False)
                if v_info:
                    cname = src["creator_name"] or v_info.get("uploader") or v_info.get("channel") or "Unbekannt"
                    for video in v_info.get("entries") or []:
                        if not video:
                            continue
                        v_title = video.get("title") or ""
                        if is_trash_video(video, v_title):
                            filtered_trash_count += 1
                            continue
                        if tags and not any(t in v_title.lower() for t in tags):
                            continue
                        v_url = extract_clean_video_url(video)
                        if not v_url:
                            continue
                        cand = match_title_against_index(v_title, games_index)
                        if cand:
                            det_pub = detect_publisher_in_text(v_title, known_pubs) or cand["publisher"]
                            raw_matches.append(
                                {
                                    "target_queue": predict_target_queue(cand["spiel_typ"], cand["guide_typ"], is_playlist=False),
                                    "creator_name": cname,
                                    "creator_id": src["creator_id"] or "",
                                    "creator_input_url": base_ch_url,
                                    "npwr_id": cand["npwr_id"],
                                    "all_npwrs": cand["all_npwrs"],
                                    "game_id": cand["game_id"],
                                    "game_title": cand["display_title"],
                                    "spiel_typ": cand["spiel_typ"],
                                    "guide_typ": cand["guide_typ"],
                                    "publisher": det_pub,
                                    "existing_guide": cand["has_existing_guide"],
                                    "video_title": v_title,
                                    "video_url": v_url,
                                    "_sort": classify_sort_tuple(v_title),
                                }
                            )

            # 2. Direkte Playlist-Links aus playlists.txt
            else:
                target_url = raw_url if raw_url.startswith("http") else f"https://www.youtube.com/playlist?list={raw_url}"
                print(f"📥 Scanne Direkt-Playlist: {target_url}")
                info = ydl.extract_info(target_url, download=False)
                if not info:
                    continue
                cname = src["creator_name"] or info.get("uploader") or info.get("channel") or "Unbekannt"
                pl_title = info.get("title") or ""
                entries = info.get("entries") or []
                for video in entries:
                    if not video:
                        continue
                    v_title = video.get("title") or ""
                    if is_trash_video(video, v_title):
                        filtered_trash_count += 1
                        continue
                    v_url = extract_clean_video_url(video)
                    if not v_url:
                        continue
                    cand = match_title_against_index(v_title, games_index)
                    if cand:
                        det_pub = detect_publisher_in_text(pl_title, known_pubs) or detect_publisher_in_text(v_title, known_pubs) or cand["publisher"]
                        raw_matches.append(
                            {
                                "target_queue": predict_target_queue(cand["spiel_typ"], cand["guide_typ"], is_playlist=False),
                                "creator_name": cname,
                                "creator_id": src["creator_id"] or "",
                                "creator_input_url": target_url,
                                "npwr_id": cand["npwr_id"],
                                "all_npwrs": cand["all_npwrs"],
                                "game_id": cand["game_id"],
                                "game_title": cand["display_title"],
                                "spiel_typ": cand["spiel_typ"],
                                "guide_typ": cand["guide_typ"],
                                "publisher": det_pub,
                                "existing_guide": cand["has_existing_guide"],
                                "video_title": v_title,
                                "video_url": v_url,
                                "_sort": classify_sort_tuple(v_title),
                            }
                        )

    if not raw_matches:
        print(f"ℹ️ Keine Treffer gefunden ({filtered_trash_count} Trash-/Stream-/Let's-Play-Videos vorab ausgefiltert).")
        return

    df = pd.DataFrame(raw_matches)
    df = df.drop_duplicates(subset=["game_id", "video_url"])
    df = df.sort_values(by=["target_queue", "creator_name", "game_title", "_sort"]).drop(columns=["_sort"])

    df.to_excel(EXCEL_OUTPUT_FILE, index=False)
    print(f"\n🛡️ {filtered_trash_count} Müll-Videos (Reactions, Unboxings, Streams, Let's Plays) automatisch abgeblockt!")
    print(f"✅ {len(df)} saubere Guide-Kandidaten in '{os.path.basename(EXCEL_OUTPUT_FILE)}' gespeichert!")
    print("👉 SCHRITT 1 FERTIG: Jetzt in Excel kurz prüfen/ausdünnen und danach '08.3_Excel_Upload_nach_Subabase.py' starten.")


if __name__ == "__main__":
    run_stage1_discovery()