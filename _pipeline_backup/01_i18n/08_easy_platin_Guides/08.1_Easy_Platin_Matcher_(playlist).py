import os
import sys
import json
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
PLAYLISTS_FILE = os.path.join(_BASE_DIR, "playlists.txt")
EXCEL_OUTPUT_FILE = os.path.join(_BASE_DIR, "QA_Video_Discovery.xlsx")

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


def get_open_games() -> List[Dict[str, Any]]:
    """
    Lädt ALLE Spiele (auch bereits PUBLISHED und Servertot mit Offline-Anteil),
    damit 08.1 alle Creator-Kandidaten sammelt und die Auswahl/Vorabprüfung
    später sauber im Intranet ('staging_game_guides') stattfindet.
    """
    print(
        "🔄 Lade gesamten Spielekatalog aus Supabase (inkl. PUBLISHED & Servertot)..."
    )
    all_games = fetch_all_supabase_rows(
        "games",
        "id, platform_game_id, spieltitel, status, spiel_typ, anzahl_trophaeen, total_online_trophies",
    )

    usable_games = []
    for g in all_games:
        spiel_typ = str(g.get("spiel_typ") or "").lower()
        if "unlesbar" in spiel_typ:
            continue

        # Servertot nur kappen, wenn das Spiel fast ausschließlich aus Online-Trophäen besteht
        if "servertot" in spiel_typ:
            total_t = int(g.get("anzahl_trophaeen") or 0)
            online_t = int(g.get("total_online_trophies") or 0)
            if total_t > 0 and online_t >= (total_t - 2):
                continue

        usable_games.append(g)

    print(
        f"📊 {len(all_games)} Spiele gesamt -> {len(usable_games)} für Creator-Matching aktiv."
    )
    return usable_games


# --- HYBRID MATCHER V3 ---


def clean_game_title(game_title: str) -> str:
    text = game_title.lower()
    text = re.sub(r"[™®©\n\r]", " ", text)
    text = re.sub(
        r"\b(ce|collector'?s?\s+edition|remastered|deluxe\s+edition|definitive\s+edition)\b",
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
        r"walkthrough|collectibles\s+guide|with\s+memories|grind\s+to\s+platinum)\b.*$"
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

    # Sofort-Filter für typischen YouTube-News/Demo-Müll im Videotitel
    if re.search(
        r"\b(demo\s+gameplay|trailer|new\s+at\s+ps|ps\s+plus\s+extra|tier\s+list|review)\b",
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
    """Sortiert Videos innerhalb eines Spiels: 1. Main/Full -> 2. Chapter/Level 1..N -> 3. Bonus."""
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


def resolve_input_sources(input_urls: List[str], ydl) -> List[Dict[str, str]]:
    sources = []
    for raw in input_urls:
        url = raw.strip()
        if "@" in url or "/channel/" in url or "/c/" in url:
            base = url.rstrip("/")
            target = base if base.endswith("/videos") else f"{base}/videos"
            sources.append({"url": target, "input_url": base})
        else:
            if not url.startswith("http"):
                url = f"https://www.youtube.com/playlist?list={url}"
            sources.append({"url": url, "input_url": url})
    return sources


def prepare_games_index(
    open_games: List[Dict[str, Any]],
) -> Dict[str, List[Dict[str, Any]]]:
    """Berechnet alle 15.749 Spieltitel EINMAL vor und gruppiert sie nach Startwort."""
    print("⚡ Baue Schnellsuch-Index für offene Spiele auf...")
    by_first_word: Dict[str, List[Dict[str, Any]]] = {}

    for game in open_games:
        titles = parse_dict_safely(game.get("spieltitel"))
        t_en = titles.get("en", "")
        t_de = titles.get("de", "")

        c_en = clean_game_title(t_en) if t_en else ""
        c_de = clean_game_title(t_de) if t_de else ""
        if not c_en and not c_de:
            continue

        npwrs = extract_npwr_list(game.get("platform_game_id"))
        entry = {
            "game_id": game.get("id"),
            "npwr_id": npwrs[0] if npwrs else "",
            "all_npwrs": ", ".join(npwrs),
            "display_title": t_en or t_de or "Unbekannt",
            "t_en": t_en,
            "t_de": t_de,
        }

        keys = set()
        for c in (c_en, c_de):
            words = [w for w in c.split() if not w.isdigit()]
            if words:
                keys.add(words[0])
                # Falls Titel mit Artikel beginnt ("The Walking Dead"), auch unter 2. Wort indexieren
                if (
                    words[0] in {"the", "a", "an", "der", "die", "das"}
                    and len(words) > 1
                ):
                    keys.add(words[1])

        for k in keys:
            by_first_word.setdefault(k, []).append(entry)

    return by_first_word


def run_stage1_discovery():
    if not os.path.exists(PLAYLISTS_FILE):
        sys.exit(f"❌ '{PLAYLISTS_FILE}' nicht gefunden.")

    with open(PLAYLISTS_FILE, "r", encoding="utf-8") as f:
        input_urls = [
            line.strip()
            for line in f
            if line.strip() and not line.strip().startswith("#")
        ]

    open_games = get_open_games()
    # HIER WIRD DER INDEX EINMALIG GEBAUT:
    games_index = prepare_games_index(open_games)

    ydl_opts = {
        "extract_flat": True,
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": True,
        "js_runtimes": {"node": {}},
    }
    raw_matches = []

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        sources = resolve_input_sources(input_urls, ydl)
        for src in sources:
            print(f"📥 Scanne Quelle: {src['url']}")
            info = ydl.extract_info(src["url"], download=False)
            if not info:
                continue
            creator_name = info.get("uploader") or info.get("channel") or "Unbekannt"

            entries = info.get("entries") or []
            print(f"   🔎 Prüfe {len(entries)} Videos gegen Index...")

            for video in entries:
                if not video:
                    continue
                vid_title = video.get("title", "")
                if not vid_title or "[Private" in vid_title or "[Deleted" in vid_title:
                    continue
                vid_url = extract_clean_video_url(video)
                if not vid_url:
                    continue

                # 1. Video-Titel einmal vorreinigen & Startwort bestimmen
                v_core = clean_video_core_title(vid_title)
                v_words = [w for w in v_core.split() if not w.isdigit()]
                if not v_words:
                    continue

                # 2. Nur die ~5-30 passenden Kandidaten aus dem Index holen statt 15.749 Spiele!
                candidates = list(games_index.get(v_words[0], []))
                if (
                    v_words[0] in {"the", "a", "an", "der", "die", "das"}
                    and len(v_words) > 1
                ):
                    candidates.extend(games_index.get(v_words[1], []))

                seen_gids = set()
                for cand in candidates:
                    gid = cand["game_id"]
                    if gid in seen_gids:
                        continue
                    seen_gids.add(gid)

                    if is_hybrid_match(cand["t_en"], vid_title) or is_hybrid_match(
                        cand["t_de"], vid_title
                    ):
                        raw_matches.append(
                            {
                                "creator_name": creator_name,
                                "creator_input_url": src["input_url"],
                                "npwr_id": cand["npwr_id"],
                                "all_npwrs": cand["all_npwrs"],
                                "game_id": gid,
                                "game_title": cand["display_title"],
                                "video_title": vid_title,
                                "video_url": vid_url,
                                "_sort": classify_sort_tuple(vid_title),
                            }
                        )
                        break

    if not raw_matches:
        print("ℹ️ Keine Treffer gefunden.")
        return

    df = pd.DataFrame(raw_matches)
    df = df.drop_duplicates(subset=["game_id", "video_url"])
    df = df.sort_values(by=["creator_name", "game_title", "_sort"]).drop(
        columns=["_sort"]
    )

    df.to_excel(EXCEL_OUTPUT_FILE, index=False)
    print(
        f"\n✅ {len(df)} Videos in '{os.path.basename(EXCEL_OUTPUT_FILE)}' gespeichert!"
    )
    print("👉 Jetzt in Excel Müll-Zeilen rauswerfen und danach Skript 2 starten.")


if __name__ == "__main__":
    run_stage1_discovery()
