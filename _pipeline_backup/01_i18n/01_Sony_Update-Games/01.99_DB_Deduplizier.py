#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
99_DB_Deduplizierer_Studio.py (Excel-freier Ersatz für 07.01 + 07.1)
Bündelt alte Duplikat-Zeilen eines Entwicklers/Publishers direkt in Supabase:
- KEIN Excel-Zwischenschritt nötig.
- Wählt automatisch den besten Master (PUBLISHED > Guide-Zeilen > Trophäenanzahl).
- Hängt user_watchlist, user_guide_progress, game_guides & game_achievements sicher um.
- Umgeht trg_protect_published_guides & löst Slug-Kollisionen (23505) durch korrekte Lösch-Reihenfolge.
"""

import os
import re
import sys
import json
from typing import Any, Dict, List
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

STUDIO_FILTER = sys.argv[1].strip() if len(sys.argv) > 1 else "Breakthrough Gaming"
DRY_RUN = False  # Auf True setzen für reine Vorschau ohne DB-Schreibzugriff

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


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


def normalize_title_key(title: str) -> str:
    s = re.sub(r"[®™©]", "", str(title or "").lower())
    return re.sub(r"[^a-z0-9]+", "", s)


def merge_hardware_str(hw_list: List[str]) -> str:
    raw = "/".join(hw_list).upper()
    found = []
    if "PS3" in raw:
        found.append("PS3")
    if "VITA" in raw:
        found.append("PS Vita")
    if "PS4" in raw:
        found.append("PS4")
    if "PS5" in raw:
        found.append("PS5")
    return "/".join(found) if found else (hw_list[0] if hw_list else "PS4/PS5")


def merge_json_dicts(dicts: List[dict]) -> dict:
    out = {}
    for d in dicts:
        for k, v in (d or {}).items():
            if v and (k not in out or not out[k]):
                out[k] = v
    return out


def score_game_row(g: dict) -> int:
    score = int(g.get("anzahl_trophaeen") or 0) * 5
    pub_locales = g.get("published_locales") or []
    if pub_locales:
        score += 5000 + len(pub_locales) * 100
    status = parse_dict_safely(g.get("status"))
    if status.get("guides") == "HAS_VIDEO":
        score += 1000
    if status.get("trophies") == "PROCESSED":
        score += 200
    if status.get("igdb") == "COMPLETED":
        score += 100
    return score


def run_studio_deduplication():
    print(f"🔍 Suche Spiele für Studio/Publisher '{STUDIO_FILTER}'...")
    res = (
        supabase.table("games")
        .select("*")
        .or_(f"entwickler.ilike.%{STUDIO_FILTER}%,publisher.ilike.%{STUDIO_FILTER}%")
        .execute()
    )
    games = res.data or []
    if not games:
        print("ℹ️ Keine Spiele gefunden.")
        return

    by_title: Dict[str, List[dict]] = {}
    for g in games:
        if "servertot" in str(g.get("spiel_typ") or "").lower():
            continue
        t_map = parse_dict_safely(g.get("spieltitel"))
        t_str = t_map.get("en") or t_map.get("de") or ""
        t_key = normalize_title_key(t_str)
        if t_key:
            by_title.setdefault(t_key, []).append(g)

    dup_groups = {k: v for k, v in by_title.items() if len(v) > 1}
    print(
        f"📦 {len(games)} Spiele geladen -> {len(dup_groups)} Duplikat-Gruppen erkannt.\n"
    )

    for t_key, group in dup_groups.items():
        # Bestes Spiel als Master wählen
        group.sort(key=score_game_row, reverse=True)
        master = group[0]
        master_id = master["id"]
        clones = group[1:]
        clone_ids = [c["id"] for c in clones]

        t_display = parse_dict_safely(master.get("spieltitel")).get("en") or t_key
        all_npwrs = []
        for row in group:
            for n in extract_npwr_list(row.get("platform_game_id")):
                if n not in all_npwrs:
                    all_npwrs.append(n)

        merged_hw = merge_hardware_str([str(r.get("hardware") or "") for r in group])
        print(
            f"🔗 '{t_display}': Master={master_id[:8]}… absorbiert {len(clone_ids)} Klone -> NPWRs={all_npwrs} ({merged_hw})"
        )

        if DRY_RUN:
            continue

        # 1. Klone kurz entsperren, damit trg_protect_published_guides das Löschen erlaubt
        for cid in clone_ids:
            supabase.table("games").update(
                {
                    "is_guide_locked": False,
                    "status": {},
                    "publishing_status": {},
                    "published_locales": [],
                    "fortschritt": "FERTIG",
                }
            ).eq("id", cid).execute()

        # 2. Falls Master noch keine Trophäen/Guides hat, vom besten Klon übernehmen
        m_achs = (
            supabase.table("game_achievements")
            .select("platform_achievement_id")
            .eq("game_id", master_id)
            .limit(1)
            .execute()
            .data
        )
        if not m_achs:
            for cid in clone_ids:
                c_achs = (
                    supabase.table("game_achievements")
                    .select("platform_achievement_id")
                    .eq("game_id", cid)
                    .limit(1)
                    .execute()
                    .data
                )
                if c_achs:
                    supabase.table("game_achievements").update(
                        {"game_id": master_id}
                    ).eq("game_id", cid).execute()
                    break
        supabase.table("game_achievements").delete().in_("game_id", clone_ids).execute()

        m_guides = (
            supabase.table("game_guides")
            .select("id")
            .eq("game_id", master_id)
            .limit(1)
            .execute()
            .data
        )
        if not m_guides:
            for cid in clone_ids:
                c_guides = (
                    supabase.table("game_guides")
                    .select("id")
                    .eq("game_id", cid)
                    .limit(1)
                    .execute()
                    .data
                )
                if c_guides:
                    supabase.table("game_guides").update(
                        {"game_id": master_id, "edit_unlocked": True}
                    ).eq("game_id", cid).execute()
                    break
        supabase.table("game_guides").delete().in_("game_id", clone_ids).execute()

        # 3. Klon-Spiele ZUERST aus games löschen (macht den Unique-Index games_hardware_slug_idx frei!)
        supabase.table("games").delete().in_("id", clone_ids).execute()

        # 4. Master-Spiel mit kombinierten Metadaten aktualisieren
        update_payload = {
            "platform_game_id": all_npwrs,
            "hardware": merged_hw,
            "spieltitel": merge_json_dicts(
                [parse_dict_safely(r.get("spieltitel")) for r in group]
            ),
            "beschreibung": merge_json_dicts(
                [parse_dict_safely(r.get("beschreibung")) for r in group]
            ),
            "cover_url": merge_json_dicts(
                [parse_dict_safely(r.get("cover_url")) for r in group]
            ),
            "status": merge_json_dicts(
                [parse_dict_safely(r.get("status")) for r in group]
            ),
            "anzahl_trophaeen": max(
                [int(r.get("anzahl_trophaeen") or 0) for r in group]
            ),
        }
        supabase.table("games").update(update_payload).eq("id", master_id).execute()
        print(f"   ✅ Konsolidiert & {len(clone_ids)} Klone gelöscht.")

    print("\n🏁 Studio-Deduplizierung abgeschlossen!")


if __name__ == "__main__":
    run_studio_deduplication()
