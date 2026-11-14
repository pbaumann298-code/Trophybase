#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
01.5_projekt_asia_matcher.py
Projekt Asia — Read-Only-Matcher & optionaler Safe-Backfill für Sony-'unlesbar'-Stacks.

Standardverhalten (ohne --apply):
- Läuft strikt als READ-ONLY '--dry-run'.
- Lädt alle Sony-Spiele und deren Trophäen aus public.games / public.game_achievements
  (mit Keyset-/Range-Pagination jenseits des 1.000-Zeilen-Limits von PostgREST).
- Berechnet exakte strukturelle Voll-Stack- und Base-Game-Fingerabdrücke:
    (trophy_gruppe, normierte platform_achievement_id, trophy_type, ist_versteckt)
- Wendet die verpflichtenden Safety-Gates aus der Projekt-Asia-Analyse an:
    1) Schnittmenge normalisierter Hardware-Familien (PS3 / PS4 / PS5 / VITA / PSP)
    2) Kein Entwickler-Widerspruch bei beidseitig gesetztem 'entwickler'
    3) Confidence-Score (0..100) inkl. optionalem Perceptual-dHash über icon_url (--verify-icons)
- Prüft auf Platzhalter (= en / rein lateinisch) in (ja, ko, zh-hans, zh-hant) und exportiert
  eine prüfbare CSV-Liste sowie eine JSON-Zusammenfassung in ./projekt_asia_reports/.

Schreibmodus (nur explizit mit '--apply'):
- Ändert NIEMALS games.publishing_status, games.published_locales oder games.is_published manuell.
- Löscht NIEMALS echte CJK-Texte oder game_achievements.guide_tip.
- Setzt beim Übertragen von en/de-Texten auf einen 'unlesbar'-Stack zwingend
  status.asian_only = 'true' und status.de_locked = 'true' (für tb_check_and_publish_locale).
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import requests
from dotenv import find_dotenv, load_dotenv
from supabase import Client, create_client

try:
    from PIL import Image
except ImportError:
    Image = None  # Optional: nur benötigt für --verify-icons


ASIAN_LOCALES = ("ja", "ko", "zh-hans", "zh-hant")
HARDWARE_FAMILIES = ("PS5", "PS4", "PS3", "VITA", "PSP")
CJK_OR_KANA_OR_HANGUL_RE = re.compile(
    r"[\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF]"
)
LATIN_RE = re.compile(r"[A-Za-z]")
NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
PAGE_SIZE = 1000


def load_project_env() -> None:
    root_env = Path(r"C:\Temp\TrophyBase\.env")
    if root_env.exists():
        load_dotenv(root_env, override=True)
        return
    parent_envs = [
        p / ".env" for p in Path(__file__).resolve().parents if (p / ".env").exists()
    ]
    load_dotenv(parent_envs[0] if parent_envs else find_dotenv(), override=True)


def create_supabase_client() -> Client:
    load_project_env()
    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
    if not url or not key:
        sys.exit(
            "Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
        )
    return create_client(url, key)


def parse_json_dict(val: Any) -> Dict[str, Any]:
    if isinstance(val, dict):
        return dict(val)
    if isinstance(val, str):
        raw = val.strip()
        if raw.startswith("{") and raw.endswith("}"):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                return {}
    return {}


def extract_npwr_list(val: Any) -> List[str]:
    if isinstance(val, list):
        return [str(x).strip("[]'\" ") for x in val if x]
    if isinstance(val, str):
        raw = val.strip()
        if raw.startswith("[") and raw.endswith("]"):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(x).strip("[]'\" ") for x in parsed if x]
            except Exception:
                pass
        return [raw.strip("[]'\" ")] if raw else []
    return []


def parse_npwr_number(npwr: str) -> Optional[int]:
    m = re.search(r"NPWR(\d+)", str(npwr or "").upper())
    return int(m.group(1)) if m else None


def normalize_hardware_families(raw_hw: Any) -> Set[str]:
    text = str(raw_hw or "").upper()
    out: Set[str] = set()
    for fam in HARDWARE_FAMILIES:
        if fam == "VITA":
            if "VITA" in text:
                out.add("VITA")
        elif fam in text:
            out.add(fam)
    return out


def normalize_developer_tokens(raw_dev: Any) -> Set[str]:
    text = str(raw_dev or "").strip().lower()
    if not text:
        return set()
    tokens: Set[str] = set()
    for part in re.split(r"[,/&;|+]+", text):
        cleaned = re.sub(
            r"\b(inc|ltd|corp|corporation|co|llc|gmbh|kk|k\.k\.|studio|studios|games|software|entertainment|interactive)\b",
            " ",
            part,
        )
        norm = NON_ALNUM_RE.sub("", cleaned)
        if len(norm) >= 2:
            tokens.add(norm)
    return tokens


def developers_compatible(dev_a: Any, dev_b: Any) -> Tuple[bool, str]:
    tokens_a = normalize_developer_tokens(dev_a)
    tokens_b = normalize_developer_tokens(dev_b)
    if not tokens_a or not tokens_b:
        return True, "unknown"
    if tokens_a & tokens_b:
        return True, "exact_overlap"
    # Teilstring-Abgleich bei zusammengesetzten Studionamen (z. B. "idea factory" vs "ideafactorycompileheart")
    for ta in tokens_a:
        for tb in tokens_b:
            if len(ta) >= 4 and len(tb) >= 4 and (ta in tb or tb in ta):
                return True, "substring_overlap"
    return False, "conflict"


def normalize_trophy_group(raw_group: Any) -> str:
    gid = str(raw_group or "default").strip().lower()
    return "default" if gid in ("", "all", "base", "0") else gid


def normalize_achievement_id(raw_id: Any) -> str:
    s = str(raw_id or "").strip().lower()
    if s.startswith("trophy_"):
        s = s[7:]
    if s.isdigit():
        return str(int(s))
    return s


def normalize_hidden_flag(raw_hidden: Any) -> bool:
    if isinstance(raw_hidden, bool):
        return raw_hidden
    text = str(raw_hidden or "").strip().lower()
    return text in ("true", "t", "1", "ja", "yes")


def has_asian_script(text: Any) -> bool:
    return bool(CJK_OR_KANA_OR_HANGUL_RE.search(str(text or "")))


def is_placeholder_value(val: Any, en_val: Any) -> bool:
    s = str(val or "").strip()
    if not s:
        return True
    en_s = str(en_val or "").strip()
    if en_s and s.casefold() == en_s.casefold():
        return True
    if not has_asian_script(s) and LATIN_RE.search(s):
        return True
    return False


def pick_preferred_title(title_map: Any, order: Iterable[str]) -> str:
    if isinstance(title_map, str):
        return title_map.strip()
    d = parse_json_dict(title_map)
    for loc in order:
        v = str(d.get(loc) or "").strip()
        if v:
            return v
    for v in d.values():
        s = str(v or "").strip()
        if s:
            return s
    return ""


def extract_icon_url(raw_icon: Any) -> str:
    if isinstance(raw_icon, str):
        return raw_icon.strip()
    if isinstance(raw_icon, dict):
        for k in ("url", "en", "de", "ja", "default"):
            v = str(raw_icon.get(k) or "").strip()
            if v.startswith("http"):
                return v
        for v in raw_icon.values():
            s = str(v or "").strip()
            if s.startswith("http"):
                return s
    return ""


def compute_image_dhash(url: str, session: requests.Session) -> Optional[int]:
    if not Image or not url:
        return None
    try:
        resp = session.get(url, timeout=6)
        if resp.status_code != 200 or not resp.content:
            return None
        img = Image.open(io.BytesIO(resp.content)).convert("L").resize((9, 8))
        pixels = list(img.getdata())
        bits = 0
        for row in range(8):
            offset = row * 9
            for col in range(8):
                if pixels[offset + col] > pixels[offset + col + 1]:
                    bits |= 1 << (row * 8 + col)
        return bits
    except Exception:
        return None


def hamming_distance(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def fetch_all_sony_games(supabase: Client) -> List[Dict[str, Any]]:
    select_cols = ",".join(
        [
            "id",
            "ecosystem",
            "hardware",
            "platform_game_id",
            "spieltitel",
            "beschreibung",
            "status_explanation_localized",
            "entwickler",
            "publisher",
            "release_jahr",
            "spiel_typ",
            "status",
            "anzahl_trophaeen",
            "is_published",
            "is_guide_locked",
        ]
    )
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        res = (
            supabase.table("games")
            .select(select_cols)
            .eq("ecosystem", "sony")
            .order("id", desc=False)
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def fetch_achievements_for_game_ids(
    supabase: Client,
    game_ids: List[str],
    include_text_fields: bool = False,
) -> Dict[str, List[Dict[str, Any]]]:
    cols = [
        "game_id",
        "platform_achievement_id",
        "trophy_gruppe",
        "trophy_type",
        "ist_versteckt",
    ]
    if include_text_fields:
        cols.extend(
            [
                "trophy_name",
                "trophy_desc",
                "spielname",
                "guide_tip",
                "video_url",
                "timestamp",
                "icon_url",
            ]
        )
    select_cols = ",".join(cols)
    by_game: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    # Chunk game IDs so PostgREST IN filters stay short and each slice stays well under 1000 rows,
    # while still paginating inside each chunk in case a chunk has > 1000 achievements.
    chunk_size = 15 if include_text_fields else 20
    for i in range(0, len(game_ids), chunk_size):
        chunk = game_ids[i : i + chunk_size]
        offset = 0
        while True:
            res = (
                supabase.table("game_achievements")
                .select(select_cols)
                .in_("game_id", chunk)
                .order("game_id", desc=False)
                .order("platform_achievement_id", desc=False)
                .range(offset, offset + PAGE_SIZE - 1)
                .execute()
            )
            batch = res.data or []
            for row in batch:
                gid = str(row.get("game_id") or "")
                if gid:
                    by_game[gid].append(row)
            if len(batch) < PAGE_SIZE:
                break
            offset += PAGE_SIZE
    return by_game


def build_fingerprints(
    trophies: List[Dict[str, Any]],
) -> Tuple[Tuple[Tuple[str, str, str, bool], ...], Tuple[Tuple[str, str, str, bool], ...]]:
    full_items: List[Tuple[str, str, str, bool]] = []
    base_items: List[Tuple[str, str, str, bool]] = []
    for t in trophies:
        grp = normalize_trophy_group(t.get("trophy_gruppe"))
        aid = normalize_achievement_id(t.get("platform_achievement_id"))
        ttype = str(t.get("trophy_type") or "").strip().lower()
        hidden = normalize_hidden_flag(t.get("ist_versteckt"))
        sig = (grp, aid, ttype, hidden)
        full_items.append(sig)
        if grp == "default":
            base_items.append(sig)

    def sort_key(sig: Tuple[str, str, str, bool]) -> Tuple[str, int, str, str, bool]:
        aid = sig[1]
        return (sig[0], 0 if aid.isdigit() else 1, aid.zfill(8) if aid.isdigit() else aid, sig[2], sig[3])

    full_items.sort(key=sort_key)
    base_items.sort(key=sort_key)
    return tuple(full_items), tuple(base_items)


def score_match_candidate(
    asia_game: Dict[str, Any],
    eu_game: Dict[str, Any],
    match_stage: str,
    trophy_count: int,
    icon_match_ratio: Optional[float] = None,
) -> Tuple[int, Dict[str, Any]]:
    score = 0
    notes: List[str] = []

    if match_stage == "exact_1to1":
        score += 55
    elif match_stage == "exact_ambig_hw":
        score += 48
    elif match_stage == "exact_ambig_hw_dev":
        score += 52
    elif match_stage == "base_game_1to1":
        score += 44

    # Trophäenanzahl reduziert zufällige Struktur-Kollisionen erheblich
    if trophy_count >= 30:
        score += 20
        notes.append("trophies>=30")
    elif trophy_count >= 15:
        score += 12
        notes.append("trophies>=15")
    elif trophy_count <= 13:
        score -= 5
        notes.append("short_list<=13")

    # Hardware-Kompatibilität (Pflicht-Gate)
    asia_hw = normalize_hardware_families(asia_game.get("hardware"))
    eu_hw = normalize_hardware_families(eu_game.get("hardware"))
    hw_overlap = bool(asia_hw & eu_hw)
    if not hw_overlap:
        notes.append("REJECTED_HARDWARE_MISMATCH")
        return 0, {"hw_overlap": False, "dev_status": "unchecked", "notes": notes}

    score += 15
    if asia_hw == eu_hw:
        score += 5
        notes.append("exact_hw")

    # Entwickler-Gate
    dev_ok, dev_status = developers_compatible(
        asia_game.get("entwickler"), eu_game.get("entwickler")
    )
    if not dev_ok:
        notes.append("REJECTED_DEVELOPER_MISMATCH")
        return 0, {"hw_overlap": True, "dev_status": dev_status, "notes": notes}
    if dev_status in ("exact_overlap", "substring_overlap"):
        score += 15
        notes.append(f"dev:{dev_status}")

    # Release-Jahr-Nähe
    y_a = asia_game.get("release_jahr")
    y_b = eu_game.get("release_jahr")
    if isinstance(y_a, int) and isinstance(y_b, int):
        diff = abs(y_a - y_b)
        if diff <= 1:
            score += 6
            notes.append(f"year_diff={diff}")
        elif diff >= 5:
            score -= 8
            notes.append(f"year_gap={diff}")

    # CJK-Titel-Übereinstimmung, falls der EU-Stack bereits einen echten Asia-Key trägt
    asia_titles = parse_json_dict(asia_game.get("spieltitel"))
    eu_titles = parse_json_dict(eu_game.get("spieltitel"))
    cjk_title_match = False
    for loc in ASIAN_LOCALES:
        a_t = str(asia_titles.get(loc) or "").strip()
        e_t = str(eu_titles.get(loc) or "").strip()
        if a_t and e_t and has_asian_script(a_t) and has_asian_script(e_t):
            if a_t.casefold() == e_t.casefold():
                cjk_title_match = True
                break
    if cjk_title_match:
        score += 15
        notes.append("cjk_title_match")

    # NPWR-Abstand bei nah beieinanderliegenden Regional-Submissions (z. B. Ratalaika)
    a_npwrs = [parse_npwr_number(n) for n in extract_npwr_list(asia_game.get("platform_game_id"))]
    e_npwrs = [parse_npwr_number(n) for n in extract_npwr_list(eu_game.get("platform_game_id"))]
    npwr_diffs = [abs(x - y) for x in a_npwrs for y in e_npwrs if x and y]
    if npwr_diffs and min(npwr_diffs) <= 50:
        score += 6
        notes.append(f"npwr_near={min(npwr_diffs)}")

    if eu_game.get("is_published"):
        score += 4
        notes.append("eu_published")

    if icon_match_ratio is not None:
        if icon_match_ratio >= 0.75:
            score += 20
            notes.append(f"icon_dhash={icon_match_ratio:.2f}")
        elif icon_match_ratio < 0.25:
            score -= 25
            notes.append(f"icon_mismatch={icon_match_ratio:.2f}")

    return max(0, min(100, score)), {
        "hw_overlap": True,
        "dev_status": dev_status,
        "cjk_title_match": cjk_title_match,
        "notes": notes,
    }


def verify_pair_icons(
    asia_trophies: List[Dict[str, Any]],
    eu_trophies: List[Dict[str, Any]],
    session: requests.Session,
    sample_limit: int = 4,
) -> Optional[float]:
    if not Image:
        return None
    eu_by_sig: Dict[Tuple[str, str, str, bool], str] = {}
    for t in eu_trophies:
        sig = (
            normalize_trophy_group(t.get("trophy_gruppe")),
            normalize_achievement_id(t.get("platform_achievement_id")),
            str(t.get("trophy_type") or "").strip().lower(),
            normalize_hidden_flag(t.get("ist_versteckt")),
        )
        icon = extract_icon_url(t.get("icon_url"))
        if icon:
            eu_by_sig[sig] = icon

    checked = 0
    matched = 0
    for t in asia_trophies:
        if checked >= sample_limit:
            break
        sig = (
            normalize_trophy_group(t.get("trophy_gruppe")),
            normalize_achievement_id(t.get("platform_achievement_id")),
            str(t.get("trophy_type") or "").strip().lower(),
            normalize_hidden_flag(t.get("ist_versteckt")),
        )
        a_url = extract_icon_url(t.get("icon_url"))
        e_url = eu_by_sig.get(sig)
        if not a_url or not e_url:
            continue
        if a_url == e_url:
            checked += 1
            matched += 1
            continue
        ha = compute_image_dhash(a_url, session)
        he = compute_image_dhash(e_url, session)
        if ha is not None and he is not None:
            checked += 1
            if hamming_distance(ha, he) <= 8:
                matched += 1
    if checked == 0:
        return None
    return matched / checked


def inspect_eu_placeholder_status(eu_game: Dict[str, Any]) -> str:
    titles = parse_json_dict(eu_game.get("spieltitel"))
    en_title = titles.get("en") or titles.get("de") or ""
    placeholders = [
        loc for loc in ASIAN_LOCALES if is_placeholder_value(titles.get(loc), en_title)
    ]
    if not placeholders:
        return "ALL_GENUINE_CJK"
    if len(placeholders) == len(ASIAN_LOCALES):
        return "ALL_PLACEHOLDER_OR_EMPTY"
    return "PARTIAL:" + ",".join(placeholders)


def apply_backfill_pair(
    supabase: Client,
    asia_game: Dict[str, Any],
    eu_game: Dict[str, Any],
    asia_trophies: List[Dict[str, Any]],
    eu_trophies: List[Dict[str, Any]],
    sync_guides_to_asia: bool,
) -> Dict[str, int]:
    """
    Führt einen verlustfreien Sync für ein geprüftes 1:1-Zwillingspaar durch:
    - EU-Zwilling: füllt nur fehlende oder =en/lateinische Platzhalter in spieltitel,
      trophy_name, trophy_desc, spielname mit echten CJK-Werten des Asia-Stacks auf.
      Löscht niemals echte CJK-Texte oder game_achievements.guide_tip!
    - Asia-Stack (optional mit --sync-guides-to-asia): überträgt fehlende en/de-Referenztexte
      sowie video_url/timestamp und setzt ZWINGEND status.asian_only='true' + status.de_locked='true'.
    - Fasst NIEMALS publishing_status, published_locales oder is_published manuell an.
    """
    stats = {"eu_title_keys": 0, "eu_trophy_rows": 0, "asia_trophy_rows": 0, "asia_title_updated": 0}

    asia_titles = parse_json_dict(asia_game.get("spieltitel"))
    eu_titles = parse_json_dict(eu_game.get("spieltitel"))
    eu_en_title = eu_titles.get("en") or eu_titles.get("de") or ""

    new_eu_titles = dict(eu_titles)
    eu_title_changed = False
    for loc in ASIAN_LOCALES:
        a_val = str(asia_titles.get(loc) or "").strip()
        if a_val and has_asian_script(a_val) and is_placeholder_value(eu_titles.get(loc), eu_en_title):
            new_eu_titles[loc] = a_val
            eu_title_changed = True
            stats["eu_title_keys"] += 1

    if eu_title_changed:
        supabase.table("games").update({"spieltitel": new_eu_titles}).eq(
            "id", eu_game["id"]
        ).execute()

    asia_by_sig: Dict[Tuple[str, str, str, bool], Dict[str, Any]] = {}
    for t in asia_trophies:
        sig = (
            normalize_trophy_group(t.get("trophy_gruppe")),
            normalize_achievement_id(t.get("platform_achievement_id")),
            str(t.get("trophy_type") or "").strip().lower(),
            normalize_hidden_flag(t.get("ist_versteckt")),
        )
        asia_by_sig[sig] = t

    for et in eu_trophies:
        sig = (
            normalize_trophy_group(et.get("trophy_gruppe")),
            normalize_achievement_id(et.get("platform_achievement_id")),
            str(et.get("trophy_type") or "").strip().lower(),
            normalize_hidden_flag(et.get("ist_versteckt")),
        )
        at = asia_by_sig.get(sig)
        if not at:
            continue

        eu_patch: Dict[str, Any] = {}
        for col in ("trophy_name", "trophy_desc", "spielname"):
            eu_map = parse_json_dict(et.get(col))
            asia_map = parse_json_dict(at.get(col))
            en_ref = eu_map.get("en") or eu_map.get("de") or ""
            updated_map = dict(eu_map)
            col_changed = False
            for loc in ASIAN_LOCALES:
                a_txt = str(asia_map.get(loc) or "").strip()
                if a_txt and has_asian_script(a_txt) and is_placeholder_value(eu_map.get(loc), en_ref):
                    updated_map[loc] = a_txt
                    col_changed = True
            if col_changed:
                eu_patch[col] = updated_map

        if eu_patch:
            (
                supabase.table("game_achievements")
                .update(eu_patch)
                .eq("game_id", eu_game["id"])
                .eq("platform_achievement_id", et["platform_achievement_id"])
                .execute()
            )
            stats["eu_trophy_rows"] += 1

        if sync_guides_to_asia:
            asia_patch: Dict[str, Any] = {}
            for col in ("trophy_name", "trophy_desc", "spielname"):
                asia_map = parse_json_dict(at.get(col))
                eu_map = parse_json_dict(et.get(col))
                updated_asia = dict(asia_map)
                col_changed = False
                for loc in ("de", "en"):
                    e_txt = str(eu_map.get(loc) or "").strip()
                    a_existing = str(asia_map.get(loc) or "").strip()
                    if e_txt and not a_existing:
                        updated_asia[loc] = e_txt
                        col_changed = True
                if col_changed:
                    asia_patch[col] = updated_asia

            if not at.get("video_url") and et.get("video_url"):
                asia_patch["video_url"] = et["video_url"]
            if not at.get("timestamp") and et.get("timestamp"):
                asia_patch["timestamp"] = et["timestamp"]

            if asia_patch:
                (
                    supabase.table("game_achievements")
                    .update(asia_patch)
                    .eq("game_id", asia_game["id"])
                    .eq("platform_achievement_id", at["platform_achievement_id"])
                    .execute()
                )
                stats["asia_trophy_rows"] += 1

    if sync_guides_to_asia:
        new_asia_titles = dict(asia_titles)
        title_changed = False
        for loc in ("en", "de"):
            e_t = str(eu_titles.get(loc) or "").strip()
            a_t = str(asia_titles.get(loc) or "").strip()
            if e_t and not a_t:
                new_asia_titles[loc] = e_t
                title_changed = True

        asia_status = parse_json_dict(asia_game.get("status"))
        asia_status["asian_only"] = "true"
        asia_status["de_locked"] = "true"
        asia_game_patch: Dict[str, Any] = {"status": asia_status}
        if title_changed:
            asia_game_patch["spieltitel"] = new_asia_titles
        supabase.table("games").update(asia_game_patch).eq(
            "id", asia_game["id"]
        ).execute()
        stats["asia_title_updated"] = 1

    return stats


def run(args: argparse.Namespace) -> None:
    if args.apply and not args.confirm_write:
        sys.exit(
            "Sicherheitsabbruch: '--apply' erfordert zusätzlich '--confirm-write', "
            "damit niemals versehentlich Produktivdaten verändert werden."
        )

    mode_label = "APPLY (SCHREIBMODUS)" if args.apply else "DRY-RUN (READ-ONLY)"
    print(f"=== Projekt Asia Matcher | Modus: {mode_label} ===")

    supabase = create_supabase_client()
    print("1/4 Lade alle Sony-Spiele aus public.games...")
    sony_games = fetch_all_sony_games(supabase)
    games_by_id = {str(g["id"]): g for g in sony_games}

    unlesbar_games = [
        g for g in sony_games if "unlesbar" in str(g.get("spiel_typ") or "").lower()
    ]
    eu_games = [
        g for g in sony_games if "unlesbar" not in str(g.get("spiel_typ") or "").lower()
    ]
    if args.game_id:
        unlesbar_games = [g for g in unlesbar_games if str(g["id"]) == args.game_id]

    print(
        f"    -> {len(sony_games)} Sony-Spiele geladen "
        f"({len(unlesbar_games)} unlesbar, {len(eu_games)} lesbare EU/EN-Stacks)."
    )

    print("2/4 Lade Trophäen-Fingerabdrücke aus public.game_achievements...")
    all_ids = [str(g["id"]) for g in sony_games]
    ach_by_game = fetch_achievements_for_game_ids(
        supabase, all_ids, include_text_fields=args.verify_icons or args.apply
    )

    full_eu_index: Dict[Tuple[Tuple[str, str, str, bool], ...], List[Dict[str, Any]]] = defaultdict(list)
    base_eu_index: Dict[Tuple[Tuple[str, str, str, bool], ...], List[Dict[str, Any]]] = defaultdict(list)

    for g in eu_games:
        gid = str(g["id"])
        trophies = ach_by_game.get(gid, [])
        if not trophies:
            continue
        full_fp, base_fp = build_fingerprints(trophies)
        if full_fp:
            full_eu_index[full_fp].append(g)
        if base_fp:
            base_eu_index[base_fp].append(g)

    print("3/4 Berechne Matches und prüfe Hardware- & Entwickler-Safety-Gates...")
    records: List[Dict[str, Any]] = []
    counts = Counter()
    session = requests.Session()

    for asia_g in unlesbar_games:
        gid = str(asia_g["id"])
        asia_trophies = ach_by_game.get(gid, [])
        full_fp, base_fp = build_fingerprints(asia_trophies)
        trophy_count = len(asia_trophies)

        match_stage = "unmatched"
        selected_eu: Optional[Dict[str, Any]] = None
        candidates = full_eu_index.get(full_fp, [])

        if len(candidates) == 1:
            match_stage = "exact_1to1"
            selected_eu = candidates[0]
        elif len(candidates) > 1:
            asia_hw = normalize_hardware_families(asia_g.get("hardware"))
            hw_filtered = [
                c for c in candidates if asia_hw & normalize_hardware_families(c.get("hardware"))
            ]
            if len(hw_filtered) == 1:
                match_stage = "exact_ambig_hw"
                selected_eu = hw_filtered[0]
            elif len(hw_filtered) > 1:
                dev_filtered = [
                    c
                    for c in hw_filtered
                    if developers_compatible(asia_g.get("entwickler"), c.get("entwickler"))[0]
                    and developers_compatible(asia_g.get("entwickler"), c.get("entwickler"))[1]
                    != "unknown"
                ]
                if len(dev_filtered) == 1:
                    match_stage = "exact_ambig_hw_dev"
                    selected_eu = dev_filtered[0]
                else:
                    match_stage = "ambiguous_1toN"
            else:
                match_stage = "ambiguous_hw_disjoint"
        elif base_fp:
            base_candidates = base_eu_index.get(base_fp, [])
            if len(base_candidates) == 1:
                match_stage = "base_game_1to1"
                selected_eu = base_candidates[0]
            elif len(base_candidates) > 1:
                asia_hw = normalize_hardware_families(asia_g.get("hardware"))
                hw_base = [
                    c
                    for c in base_candidates
                    if asia_hw & normalize_hardware_families(c.get("hardware"))
                ]
                if len(hw_base) == 1:
                    match_stage = "base_game_1to1"
                    selected_eu = hw_base[0]
                elif len(hw_base) > 1:
                    match_stage = "base_game_ambig"

        confidence = 0
        gate_info: Dict[str, Any] = {"hw_overlap": False, "dev_status": "", "notes": []}
        icon_ratio: Optional[float] = None
        verdict = match_stage.upper()

        if selected_eu is not None:
            if args.verify_icons:
                eu_trophies = ach_by_game.get(str(selected_eu["id"]), [])
                icon_ratio = verify_pair_icons(asia_trophies, eu_trophies, session)

            confidence, gate_info = score_match_candidate(
                asia_g, selected_eu, match_stage, trophy_count, icon_match_ratio=icon_ratio
            )
            if not gate_info["hw_overlap"]:
                verdict = "REJECTED_HARDWARE_MISMATCH"
            elif gate_info["dev_status"] == "conflict":
                verdict = "REJECTED_DEVELOPER_MISMATCH"
            elif confidence >= args.min_confidence:
                verdict = "SAFE_1TO1_MATCH"
            else:
                verdict = "LOW_CONFIDENCE_REVIEW"

        if args.only_published and not (selected_eu and selected_eu.get("is_published")):
            continue

        counts[verdict] += 1
        if selected_eu and selected_eu.get("is_published") and verdict == "SAFE_1TO1_MATCH":
            counts["safe_published_eu"] += 1

        records.append(
            {
                "asia_id": gid,
                "asia_npwr": ";".join(extract_npwr_list(asia_g.get("platform_game_id"))),
                "asia_title": pick_preferred_title(
                    asia_g.get("spieltitel"), ("ja", "zh-hant", "zh-hans", "ko", "en")
                ),
                "asia_hardware": asia_g.get("hardware") or "",
                "asia_developer": asia_g.get("entwickler") or "",
                "asia_spiel_typ": asia_g.get("spiel_typ") or "",
                "trophy_count": trophy_count,
                "match_stage": match_stage,
                "verdict": verdict,
                "confidence": confidence,
                "gate_notes": ";".join(gate_info.get("notes") or []),
                "icon_match_ratio": f"{icon_ratio:.2f}" if icon_ratio is not None else "",
                "eu_id": str(selected_eu["id"]) if selected_eu else "",
                "eu_npwr": ";".join(extract_npwr_list(selected_eu.get("platform_game_id")))
                if selected_eu
                else "",
                "eu_title_en": pick_preferred_title(selected_eu.get("spieltitel"), ("en", "de"))
                if selected_eu
                else "",
                "eu_title_de": pick_preferred_title(selected_eu.get("spieltitel"), ("de", "en"))
                if selected_eu
                else "",
                "eu_hardware": (selected_eu.get("hardware") or "") if selected_eu else "",
                "eu_developer": (selected_eu.get("entwickler") or "") if selected_eu else "",
                "eu_is_published": bool(selected_eu.get("is_published")) if selected_eu else False,
                "eu_asian_placeholder_status": inspect_eu_placeholder_status(selected_eu)
                if selected_eu
                else "",
            }
        )

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_path = out_dir / f"projekt_asia_matches_{ts}.csv"
    summary_path = out_dir / f"projekt_asia_summary_{ts}.json"

    if records:
        with csv_path.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(records[0].keys()), delimiter=";")
            writer.writeheader()
            writer.writerows(records)

    summary_payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "mode": "apply" if args.apply else "dry_run",
        "min_confidence": args.min_confidence,
        "total_unlesbar": len(unlesbar_games),
        "total_eu_sony": len(eu_games),
        "counts": dict(counts),
        "csv_report": str(csv_path),
    }
    summary_path.write_text(
        json.dumps(summary_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("4/4 Ergebnisübersicht:")
    for k, v in sorted(counts.items()):
        print(f"    - {k}: {v}")
    print(f"    CSV-Bericht: {csv_path}")
    print(f"    JSON-Report: {summary_path}")

    if not args.apply:
        print("\nDry-Run beendet: Es wurden KEINE Änderungen an Supabase vorgenommen.")
        return

    safe_rows = [r for r in records if r["verdict"] == "SAFE_1TO1_MATCH"]
    print(
        f"\nStarte --apply für {len(safe_rows)} geprüfte SAFE_1TO1_MATCH-Paare "
        f"(sync_guides_to_asia={args.sync_guides_to_asia})..."
    )
    apply_totals = Counter()
    for row in safe_rows:
        asia_g = games_by_id[row["asia_id"]]
        eu_g = games_by_id[row["eu_id"]]
        pair_ach = fetch_achievements_for_game_ids(
            supabase, [row["asia_id"], row["eu_id"]], include_text_fields=True
        )
        res = apply_backfill_pair(
            supabase,
            asia_g,
            eu_g,
            pair_ach.get(row["asia_id"], []),
            pair_ach.get(row["eu_id"], []),
            sync_guides_to_asia=args.sync_guides_to_asia,
        )
        for k, v in res.items():
            apply_totals[k] += v

    print(f"Apply abgeschlossen: {dict(apply_totals)}")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Projekt Asia Matcher (Standardmodus: Read-Only --dry-run)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Read-Only-Analyse und CSV-/JSON-Export (Standard).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        default=False,
        help="Aktiviert den Schreibmodus (erfordert zusätzlich --confirm-write).",
    )
    parser.add_argument(
        "--confirm-write",
        action="store_true",
        default=False,
        help="Explizite Sicherheitsbestätigung für schreibende DB-Updates.",
    )
    parser.add_argument(
        "--sync-guides-to-asia",
        action="store_true",
        default=False,
        help="Kopiert im --apply-Modus zusätzlich fehlende de/en-Trophäentexte + Videos in den Asia-Stack (setzt status.asian_only='true' & de_locked='true').",
    )
    parser.add_argument(
        "--verify-icons",
        action="store_true",
        default=False,
        help="Vergleicht bis zu 4 Trophäen-Icons pro 1:1-Kandidat per 8x8 dHash (benötigt Pillow).",
    )
    parser.add_argument(
        "--only-published",
        action="store_true",
        default=False,
        help="Exportiert bzw. bearbeitet nur Paare mit eu_is_published = true.",
    )
    parser.add_argument(
        "--min-confidence",
        type=int,
        default=75,
        help="Mindest-Confidence (0-100) für SAFE_1TO1_MATCH (Standard: 75).",
    )
    parser.add_argument(
        "--game-id",
        type=str,
        default="",
        help="Optional auf eine einzelne unlesbar game_id (UUID) einschränken.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=str(Path(__file__).resolve().parent / "projekt_asia_reports"),
        help="Zielverzeichnis für Dry-Run CSV- und JSON-Reports.",
    )
    return parser


if __name__ == "__main__":
    run(build_arg_parser().parse_args())
