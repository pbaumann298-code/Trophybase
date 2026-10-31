#!/usr/bin/env python3
"""
04.1_Twich_vervollständiger.py
Synchronisiert IGDB-Metadaten (Hardware, Release-Jahr, Studio, Publisher, Cover, Summary):
- FIX: Entfernte Spalte 'genre' aus SELECT/UPDATE genommen (nutzt jetzt sub_genres).
- FIX: Überschreibt niemals Cover, die bereits cover_status = 'valid' haben (Krankenstation-Schutz).
- Setzt bei neuem IGDB-Cover cover_status = 'unverified' für den späteren Qwen-VL Check (04.7).
"""

import os
import re
import sys
import json
import time
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from dotenv import load_dotenv
from pydantic import BaseModel, Field
import requests
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TWITCH_CLIENT_ID = os.getenv("TWITCH_CLIENT_ID")
TWITCH_CLIENT_SECRET = os.getenv("TWITCH_CLIENT_SECRET")

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:14b")

if not all([SUPABASE_URL, SUPABASE_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET]):
    sys.exit(
        "❌ Fehler: SUPABASE_* oder TWITCH_* Umgebungsvariablen fehlen in der .env"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

PS_PLATFORMS = {
    9: "PS3",
    48: "PS4",
    167: "PS5",
    46: "PS Vita",
    38: "PSP",
}
ALL_PS_IDS = tuple(PS_PLATFORMS.keys())

IGDB_GAME_FIELDS = (
    "id, name, first_release_date, platforms.id, platforms.name, cover.image_id, "
    "genres.name, involved_companies.developer, involved_companies.publisher, "
    "involved_companies.porting, involved_companies.supporting, "
    "involved_companies.company.name, summary"
)

STUDIO_HINT = re.compile(
    r"\b(games?|studios?|entertainment|interactive|software|digital|"
    r"productions?|inc\.?|ltd\.?|llc|gmbh|corp|corporation|limited|"
    r"company|co\.|fromsoftware|ubisoft|capcom|nintendo|sony|bandai|"
    r"namco|square|enix|sega|konami|activision|bethesda|rockstar|"
    r"naughty|santa monica|electronic arts|\bea\b)\b",
    re.I,
)
NAME_TOKEN = re.compile(r"^[^\W\d_]+(?:['’-][^\W\d_]+)*$", re.UNICODE)


class ValidationResult(BaseModel):
    matched_igdb_id: Optional[int] = Field(default=None)
    is_valid: bool = Field(default=False)
    reason: str = Field(default="")


def get_igdb_token() -> str:
    res = requests.post(
        "https://id.twitch.tv/oauth2/token",
        params={
            "client_id": TWITCH_CLIENT_ID,
            "client_secret": TWITCH_CLIENT_SECRET,
            "grant_type": "client_credentials",
        },
        timeout=10,
    )
    res.raise_for_status()
    return res.json()["access_token"]


def clean_title(title: str) -> str:
    t = re.sub(r"[\®\™\©]", "", title)
    t = re.sub(r"\(.*?\)", "", t)
    if " - " in t:
        t = t.split(" - ")[0]
    blacklist = [
        "Additional Trophies",
        "Trophies",
        "Expansion",
        "Add-on",
        "Addon",
        "Console Edition",
        "Expansion Pack",
        "DLC Suite",
        "DLC",
        "The Game",
        "Game",
    ]
    for word in blacklist:
        t = re.sub(rf"\b{word}\b", "", t, flags=re.IGNORECASE)
    if ":" in t:
        parts = t.split(":")
        if len(parts[1].strip().split()) > 3:
            t = parts[0]
    return " ".join(t.split()).strip()


def normalize_string(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "", text).lower()


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


def looks_like_person_name(name: Optional[str]) -> bool:
    value = (name or "").strip()
    if not value or STUDIO_HINT.search(value) or re.search(r"\d", value):
        return False
    parts = [part for part in re.split(r"\s+", value) if part]
    if not (2 <= len(parts) <= 3):
        return False
    return all(NAME_TOKEN.fullmatch(part) for part in parts)


def pick_primary_studio_name(names: List[str]) -> Optional[str]:
    unique: List[str] = []
    seen = set()
    for name in names or []:
        key = re.sub(r"[^a-z0-9]+", "", (name or "").lower())
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(name)
    companies = [name for name in unique if not looks_like_person_name(name)]
    if companies:
        return companies[0]
    return unique[0] if unique else None


def pick_credits(involved: Any) -> Tuple[Optional[str], Optional[str]]:
    developers: List[str] = []
    publishers: List[str] = []
    for entry in involved or []:
        if not isinstance(entry, dict):
            continue
        company = entry.get("company") if isinstance(entry.get("company"), dict) else {}
        name = str(company.get("name") or "").strip()
        if not name:
            continue
        if entry.get("developer"):
            developers.append(name)
        if entry.get("publisher"):
            publishers.append(name)

    studio = pick_primary_studio_name(developers)
    publisher = pick_primary_studio_name(publishers)
    if looks_like_person_name(studio) and publisher:
        studio = publisher
    if not studio and publisher:
        studio = publisher
    if looks_like_person_name(studio) and not publisher:
        studio = None
    return studio, publisher


def parse_npwr_number(npwr: str) -> int:
    if not isinstance(npwr, str):
        return 0
    match = re.search(r"NPWR(\d+)", npwr, re.IGNORECASE)
    return int(match.group(1)) if match else 0


def resolve_hardware_from_igdb(
    matched_platforms: List[Dict[str, Any]], npwr_str: str, current_hw: str
) -> str:
    available_ps = [p["id"] for p in matched_platforms if p["id"] in PS_PLATFORMS]
    if not available_ps:
        return current_hw
    if len(available_ps) == 1:
        return PS_PLATFORMS[available_ps[0]]

    npwr_num = parse_npwr_number(npwr_str)
    if npwr_num < 6000:
        if 9 in available_ps:
            return "PS3"
        if 46 in available_ps:
            return "PS Vita"
    elif npwr_num < 20000:
        if 48 in available_ps:
            return "PS4"
        if 9 in available_ps:
            return "PS3"
    else:
        if 167 in available_ps:
            return "PS5"
        if 48 in available_ps:
            return "PS4"
    return PS_PLATFORMS[available_ps[0]]


def search_igdb_candidates(title: str, token: str) -> List[Dict[str, Any]]:
    url = "https://api.igdb.com/v4/games"
    headers = {"Client-ID": TWITCH_CLIENT_ID, "Authorization": f"Bearer {token}"}
    cleaned = clean_title(title)
    ps_filter_str = f"({','.join(map(str, ALL_PS_IDS))})"

    time.sleep(0.26)  # IGDB Rate-Limit (4 req/s)
    query = f"""
    search "{cleaned}";
    fields {IGDB_GAME_FIELDS};
    where version_parent = null & platforms = {ps_filter_str};
    limit 6;
    """
    res = requests.post(url, headers=headers, data=query, timeout=10)
    data = res.json() if res.status_code == 200 else []

    if not data and len(cleaned.split()) > 1:
        time.sleep(0.26)
        fallback_term = cleaned.split()[0]
        query_fallback = f"""
        search "{fallback_term}";
        fields {IGDB_GAME_FIELDS};
        where version_parent = null & platforms = {ps_filter_str};
        limit 6;
        """
        res_fb = requests.post(url, headers=headers, data=query_fallback, timeout=10)
        data = res_fb.json() if res_fb.status_code == 200 else []

    return data


def validate_via_ollama(local_game: dict, candidates: list) -> ValidationResult:
    prompt = f"""
    Du bist ein Validierungs-Compiler für Spieledaten.
    Isoliere die exakt passende IGDB-ID für das lokale Spiel aus den Kandidaten.

    LOKALES SPIEL:
    - Titel: {local_game['title']}
    - Bisherige Hardware: {local_game['hardware']}
    - Sony ID: {local_game['platform_game_id']}

    KANDIDATEN:
    {json.dumps(candidates, indent=2)}

    Gib ausschließlich JSON zurück: {{"matched_igdb_id": int/null, "is_valid": bool, "reason": string}}
    """
    try:
        res = requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "format": "json",
                "stream": False,
                "options": {"temperature": 0.0},
            },
            timeout=30,
        )
        if res.status_code == 200:
            return ValidationResult.model_validate_json(
                res.json().get("response", "{}")
            )
        return ValidationResult(
            matched_igdb_id=None,
            is_valid=False,
            reason=f"Ollama HTTP {res.status_code}",
        )
    except Exception as e:
        return ValidationResult(
            matched_igdb_id=None, is_valid=False, reason=f"Ollama-Fehler: {e}"
        )


def audit_or_match_game(
    local_game: dict, token: str
) -> tuple[Optional[Dict[str, Any]], str]:
    candidates = search_igdb_candidates(local_game["title"], token)
    if not candidates:
        return None, "Keine Treffer auf PlayStation-Plattformen."

    norm_local = normalize_string(local_game["title"])
    exact_matches = [
        c for c in candidates if normalize_string(c.get("name", "")) == norm_local
    ]
    if len(exact_matches) == 1:
        return exact_matches[0], "Deterministischer Normalisierungs-Match."

    val = validate_via_ollama(local_game, candidates)
    if val.matched_igdb_id:
        matched = next((c for c in candidates if c["id"] == val.matched_igdb_id), None)
        if matched:
            return matched, f"Ollama-Entscheid: {val.reason}"

    return None, f"Ollama-Veto: {val.reason}"


def extract_primary_title(spieltitel_json: Any) -> Optional[str]:
    if isinstance(spieltitel_json, dict):
        return (
            spieltitel_json.get("en")
            or spieltitel_json.get("de")
            or (next(iter(spieltitel_json.values())) if spieltitel_json else None)
        )
    if isinstance(spieltitel_json, str):
        return spieltitel_json
    return None


def run_database_audit_and_fill():
    token = get_igdb_token()
    total_processed = 0
    total_synced = 0
    last_id = None
    batch_size = 500

    print("⚡ Starte IGDB Metadata-Sync (Keyset-Pagination, Schema 10/2026)...\n")

    while True:
        # WICHTIG: Spalte 'genre' existiert nicht mehr -> entfernt!
        query = (
            supabase.table("games")
            .select(
                "id, platform_game_id, hardware, igdb_id, release_jahr, entwickler, publisher, "
                "status, spieltitel, cover_url, cover_status, beschreibung, slug, sub_genres"
            )
            .or_("status->>igdb.is.null,status->>igdb.neq.COMPLETED")
            .order("id")
            .limit(batch_size)
        )

        if last_id:
            query = query.gt("id", last_id)

        res = query.execute()
        records = res.data or []

        if not records:
            print(
                f"\n🏁 Abgeschlossen! {total_processed} geprüft, {total_synced} synchronisiert."
            )
            break

        print(
            f"🔍 Neuer Batch: {len(records)} Datensätze ab ID {last_id or 'START'}..."
        )

        for record in records:
            game_id = record["id"]
            last_id = game_id
            total_processed += 1

            npwrs = extract_npwr_list(record.get("platform_game_id"))
            primary_npwr = npwrs[0] if npwrs else "UNKNOWN_NPWR"
            display_tag = (
                primary_npwr if len(npwrs) <= 1 else f"{primary_npwr} (+{len(npwrs)-1})"
            )

            hw_old = record.get("hardware") or "PS4"
            title = extract_primary_title(record.get("spieltitel"))
            status_obj = (
                dict(record.get("status"))
                if isinstance(record.get("status"), dict)
                else {}
            )

            if not title:
                continue

            local_game = {
                "title": title,
                "hardware": hw_old,
                "platform_game_id": primary_npwr,
                "igdb_id": record.get("igdb_id"),
            }

            matched_data, audit_log = audit_or_match_game(local_game, token)

            if not matched_data:
                status_obj["igdb"] = "UNSURE"
                status_obj["igdb_reason"] = audit_log
                supabase.table("games").update({"status": status_obj}).eq(
                    "id", game_id
                ).execute()
                print(f"[❌] {display_tag} ({title}): {audit_log}")
                continue

            platforms_igdb = matched_data.get("platforms", [])
            hw_corrected = resolve_hardware_from_igdb(
                platforms_igdb, primary_npwr, hw_old
            )

            rel_ts = matched_data.get("first_release_date")
            rel_year = (
                datetime.fromtimestamp(rel_ts, tz=timezone.utc).year
                if rel_ts
                else record.get("release_jahr")
            )

            igdb_genres = [
                g["name"]
                for g in matched_data.get("genres", [])
                if isinstance(g, dict) and g.get("name")
            ]
            studio, publisher = pick_credits(matched_data.get("involved_companies"))

            cover_id = (matched_data.get("cover") or {}).get("image_id")
            cover_url_str = (
                f"https://images.igdb.com/igdb/image/upload/t_1080p/{cover_id}.jpg"
                if cover_id
                else None
            )

            cover_obj = (
                dict(record.get("cover_url"))
                if isinstance(record.get("cover_url"), dict)
                else {}
            )
            cover_status = record.get("cover_status")

            # Krankenstation-Schutz: Wenn Cover bereits als 'valid' verifiziert ist, NIEMALS überschreiben!
            if cover_url_str and cover_status != "valid":
                cover_obj["de"] = cover_url_str
                cover_obj["en"] = cover_url_str
                if not cover_status:
                    cover_status = "unverified"

            desc_obj = (
                dict(record.get("beschreibung"))
                if isinstance(record.get("beschreibung"), dict)
                else {}
            )
            summary = matched_data.get("summary")
            if summary and not desc_obj.get("en"):
                desc_obj["en"] = summary

            status_obj["igdb"] = "COMPLETED"
            status_obj.pop("igdb_reason", None)

            update_payload: Dict[str, Any] = {
                "hardware": hw_corrected,
                "igdb_id": str(matched_data["id"]),
                "release_jahr": rel_year,
                "entwickler": studio or record.get("entwickler"),
                "publisher": publisher or record.get("publisher"),
                "status": status_obj,
                "cover_url": cover_obj,
                "beschreibung": desc_obj,
            }
            if cover_status:
                update_payload["cover_status"] = cover_status
            if igdb_genres and not record.get("sub_genres"):
                update_payload["sub_genres"] = igdb_genres

            try:
                supabase.table("games").update(update_payload).eq(
                    "id", game_id
                ).execute()
            except Exception as e:
                err_str = str(e)
                if "23505" in err_str or "games_hardware_slug_idx" in err_str:
                    # Hardware-Wechsel würde bestehenden Slug auf gleicher Konsole duplizieren -> alte Hardware behalten
                    update_payload["hardware"] = hw_old
                    supabase.table("games").update(update_payload).eq(
                        "id", game_id
                    ).execute()
                else:
                    print(f"[❌] {display_tag} ({title}): DB-Fehler: {e}")
                    continue

            total_synced += 1
            print(
                f"[✅] {display_tag} ({title}) -> IGDB={matched_data['id']} | Studio={studio or '—'} | Pub={publisher or '—'}"
            )


if __name__ == "__main__":
    run_database_audit_and_fill()
