#!/usr/bin/env python3
"""
01.1_Scout_Update_Games_.py
Automatischer PSN-NPWR-Scout mit Dichte-Erkennung & sauberem Token-Handling:
- KEIN Handshake-Spam mehr bei Retries/429 (Refresh nur alle 45 Min. oder bei echtem HTTP 401).
- Ignoriert hohe Ausreißer-IDs (wie NPWR57xxx) durch Cluster-Erkennung der echten Katalog-Spitze.
- Optional manuell über CRAWL_START / CRAWL_END in der .env steuerbar.
"""

import os
import re
import sys
import time
import json
from collections import Counter
import requests
from dotenv import load_dotenv
from psnawp_api import PSNAWP
from supabase import create_client, Client

load_dotenv()

# --- CONFIGURATION ---
DELAY = float(os.getenv("CRAWL_DELAY", 0.35))
TOKEN_MAX_AGE_SECONDS = 45 * 60  # Proaktiver Refresh nach 45 Min.

# Wie viele Nummern unterhalb der echten Katalog-Spitze auf geschlossene Lücken geprüft werden:
LOOKBACK_WINDOW = int(os.getenv("CRAWL_LOOKBACK", 800))
# Wie viele Nummern maximal über die echte Spitze hinaus getestet werden:
FORWARD_LIMIT = int(os.getenv("CRAWL_FORWARD_LIMIT", 1000))
# Nach wie vielen 404-Fehlern in Folge an der Spitze automatisch gestoppt wird:
MAX_CONSECUTIVE_MISSES = int(os.getenv("CRAWL_MAX_MISSES", 150))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
NPSSO_TOKEN = os.getenv("PSN_NPSSO")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )
if not NPSSO_TOKEN:
    sys.exit("❌ Fehler: PSN_NPSSO fehlt in der .env!")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
http_session = requests.Session()

psnawp = None
current_token = None
token_timestamp = 0.0


def get_valid_access_token(force_refresh: bool = False) -> str:
    """Erneuert das Token NUR beim Start, nach 45 Min. oder bei explizitem HTTP 401."""
    global psnawp, current_token, token_timestamp
    now = time.time()

    if (
        not force_refresh
        and current_token
        and (now - token_timestamp) < TOKEN_MAX_AGE_SECONDS
    ):
        return current_token

    print("⚡ Erzwinge frischen Sony OAuth-Handshake über PSNAWP...")
    psnawp = PSNAWP(NPSSO_TOKEN)
    client = psnawp.me()
    online_id = client.online_id

    if not psnawp.authenticator.token_response:
        raise RuntimeError("Sony Authenticator hat keine Token-Antwort geliefert.")

    token = psnawp.authenticator.token_response.get("access_token")
    if not token:
        raise RuntimeError("PSN Access Token ist leer.")

    current_token = token
    token_timestamp = time.time()
    print(f"✅ Frisches Token aktiv (authentifiziert als: {online_id}).\n")
    return current_token


def normalize_title_key(title: str) -> str:
    s = str(title or "").lower()
    s = re.sub(r"[®™©]", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def merge_hardware_str(hw1: str, hw2: str) -> str:
    """Kombiniert z. B. 'PS4' und 'PS5' sauber zu 'PS4/PS5'."""
    order = ["PS3", "PS Vita", "PS4", "PS5"]
    raw = f"{hw1 or ''}/{hw2 or ''}".upper()
    found = []
    if "PS3" in raw:
        found.append("PS3")
    if "VITA" in raw:
        found.append("PS Vita")
    if "PS4" in raw:
        found.append("PS4")
    if "PS5" in raw:
        found.append("PS5")
    return "/".join(found) if found else (hw1 or hw2 or "PS4/PS5")


def load_all_known_ids() -> tuple[set[str], int, dict[str, dict]]:
    """
    Lädt alle bekannten NPWRs, berechnet die Dichte-Spitze UND baut einen
    Titel-Index (title_index) für sofortiges Stack-Merging auf.
    """
    print("🔄 Lade bekannten Gesamtbestand & Titel-Index aus der DB...")
    known_ids = set()
    all_nums = []
    title_index: dict[str, dict] = {}
    offset = 0
    limit = 1000
    npwr_regex = re.compile(r"^NPWR(\d+)_", re.IGNORECASE)

    while True:
        res = (
            supabase.table("games")
            .select(
                "id, platform_game_id, spieltitel, hardware, anzahl_trophaeen, spiel_typ"
            )
            .range(offset, offset + limit - 1)
            .execute()
        )
        data = res.data or []
        for row in data:
            val = row.get("platform_game_id")
            if not val:
                continue

            items = []
            if isinstance(val, list):
                items = [str(x).strip().upper() for x in val if x]
            elif isinstance(val, str):
                cleaned = val.strip()
                if cleaned.startswith("[") and cleaned.endswith("]"):
                    try:
                        parsed = json.loads(cleaned)
                        items = [str(x).strip().upper() for x in parsed if x]
                    except Exception:
                        items = [cleaned.upper()]
                else:
                    items = [cleaned.upper()]

            row_nums = []
            for item in items:
                known_ids.add(item)
                m = npwr_regex.match(item)
                if m:
                    num = int(m.group(1))
                    all_nums.append(num)
                    row_nums.append(num)

            # Servertote Spiele niemals automatisch mit neuen Stacks mergen!
            spiel_typ = str(row.get("spiel_typ") or "")
            if "servertot" in spiel_typ.lower():
                continue

            titel_obj = (
                row.get("spieltitel") if isinstance(row.get("spieltitel"), dict) else {}
            )
            en_title = titel_obj.get("en") or titel_obj.get("de") or ""
            t_key = normalize_title_key(en_title)
            if t_key and items:
                title_index[t_key] = {
                    "id": row["id"],
                    "npwrs": items,
                    "max_num": max(row_nums) if row_nums else 0,
                    "hardware": str(row.get("hardware") or "PS4"),
                    "trophy_count": row.get("anzahl_trophaeen"),
                }

        if len(data) < limit:
            break
        offset += limit

    bucket_counts = Counter(n // 100 for n in all_nums)
    dense_buckets = [b for b, count in bucket_counts.items() if count >= 5]
    if dense_buckets:
        top_bucket = max(dense_buckets)
        plausible_nums = [n for n in all_nums if n <= (top_bucket + 2) * 100]
        dense_frontier = max(plausible_nums) if plausible_nums else max(all_nums)
    else:
        dense_frontier = max(all_nums) if all_nums else 38800

    abs_max = max(all_nums) if all_nums else 0
    print(
        f"📦 {len(known_ids)} bekannte NPWRs geladen ({len(title_index)} stackbare Titel im Index).\n"
        f"   -> Echte Katalog-Spitze: NPWR{dense_frontier:05d}_00 (Höchste Einzel-ID: NPWR{abs_max:05d}_00)\n"
    )
    return known_ids, dense_frontier, title_index


def probe_npwr_meta(npwr_id: str) -> dict | None:
    """Prüft eine NPWR bei Sony (trophy2 -> trophy) ohne unnötige Token-Handshakes."""
    url = f"https://m.np.playstation.com/api/trophy/v1/npCommunicationIds/{npwr_id}/trophyGroups"

    for service in ("trophy2", "trophy"):
        for attempt in range(3):
            # WICHTIG: Kein force_refresh bei normalem Retry!
            token = get_valid_access_token(force_refresh=False)
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept-Language": "en-US",
                "User-Agent": "Mozilla/5.0",
            }
            try:
                res = http_session.get(
                    url, headers=headers, params={"npServiceName": service}, timeout=6
                )
                if res.status_code == 200:
                    return res.json()
                if res.status_code == 401:
                    print("  🔄 HTTP 401 – erneuere abgelaufenes Sony-Token...")
                    get_valid_access_token(force_refresh=True)
                    continue
                if res.status_code in (400, 404):
                    break  # Nicht auf diesem Service -> probiere nächsten Service
                if res.status_code == 429:
                    wait = 3.0 * (attempt + 1)
                    print(f"  ⏳ Rate-Limit (429) bei {npwr_id}, warte {wait:.1f}s...")
                    time.sleep(wait)
                    continue
            except requests.RequestException as exc:
                print(
                    f"  ⚠️ Netzwerkfehler bei {npwr_id} (Versuch {attempt + 1}/3): {exc}"
                )
                time.sleep(1.5 * (attempt + 1))

    return None


def build_scan_queue(known_ids: set[str], frontier_num: int) -> tuple[list[int], int]:
    env_start = os.getenv("CRAWL_START")
    env_end = os.getenv("CRAWL_END")

    if env_start and env_end:
        start_n, end_n = int(env_start), int(env_end)
        candidates = [
            n for n in range(start_n, end_n + 1) if f"NPWR{n:05d}_00" not in known_ids
        ]
        print(
            f"🧭 Manueller Modus (.env): Prüfe {len(candidates)} offene IDs zwischen {start_n} und {end_n}.\n"
        )
        return candidates, end_n + 1

    frontier_start = frontier_num + 1
    gap_start = max(1, frontier_num - LOOKBACK_WINDOW)

    gaps = [
        n
        for n in range(gap_start, frontier_start)
        if f"NPWR{n:05d}_00" not in known_ids
    ]
    forward = list(range(frontier_start, frontier_start + FORWARD_LIMIT))

    print(
        f"🧭 Auto-Scout Modus:\n"
        f"   1) Lücken-Check im Fenster {gap_start}..{frontier_num}: {len(gaps)} offene Nummern\n"
        f"   2) Neue Spitze ab NPWR{frontier_start:05d}_00 (Stopp nach {MAX_CONSECUTIVE_MISSES} Fehlversuchen am Stück)\n"
    )
    return gaps + forward, frontier_start


def main():
    try:
        known_ids, frontier_num, title_index = load_all_known_ids()
    except Exception as db_err:
        sys.exit(f"❌ Kritischer DB-Fehler beim Laden des Bestands: {db_err}")

    get_valid_access_token(force_refresh=True)

    candidates, frontier_start = build_scan_queue(known_ids, frontier_num)
    consecutive_frontier_misses = 0
    new_hits = 0
    merged_stacks = 0

    for num in candidates:
        npwr_id = f"NPWR{num:05d}_00"
        if npwr_id in known_ids:
            continue

        is_frontier = num >= frontier_start
        time.sleep(DELAY)

        base_meta = probe_npwr_meta(npwr_id)

        if not base_meta:
            if is_frontier:
                consecutive_frontier_misses += 1
                print(
                    f"  .. [{npwr_id}] Kein Treffer (Spitzen-Miss {consecutive_frontier_misses}/{MAX_CONSECUTIVE_MISSES})"
                )
                if consecutive_frontier_misses >= MAX_CONSECUTIVE_MISSES:
                    print(
                        f"\n🛑 {MAX_CONSECUTIVE_MISSES} leere IDs in Folge an der Spitze erreicht. Scout ist fertig!"
                    )
                    break
            else:
                print(f"  .. [{npwr_id}] Lücke noch unbelegt.")
            continue

        if is_frontier:
            consecutive_frontier_misses = 0

        title_en = str(base_meta.get("trophyTitleName") or "Unbenannt").strip()
        platform = str(base_meta.get("trophyTitlePlatform") or "PS4/PS5").strip()
        defined = base_meta.get("definedTrophies") or {}
        trophy_count = sum(defined.values()) if isinstance(defined, dict) else None

        t_key = normalize_title_key(title_en)
        existing = title_index.get(t_key)

        # Prüfen, ob dieser Treffer ein Regional-/Plattform-Stack eines bestehenden Spiels ist:
        # Entweder exakt gleiche Trophäenanzahl ODER unmittelbarer Nachbar-NPWR-Block (Delta <= 30)
        is_same_stack = False
        if existing and t_key and title_en != "Unbenannt":
            same_count = (
                trophy_count is not None
                and existing.get("trophy_count") is not None
                and trophy_count == existing.get("trophy_count")
            )
            close_npwr = abs(num - existing.get("max_num", 0)) <= 30
            if same_count or close_npwr:
                is_same_stack = True

        if is_same_stack:
            updated_npwrs = (
                existing["npwrs"] + [npwr_id]
                if npwr_id not in existing["npwrs"]
                else existing["npwrs"]
            )
            merged_hw = merge_hardware_str(existing["hardware"], platform)
            try:
                supabase.table("games").update(
                    {"platform_game_id": updated_npwrs, "hardware": merged_hw}
                ).eq("id", existing["id"]).execute()

                existing["npwrs"] = updated_npwrs
                existing["max_num"] = max(existing["max_num"], num)
                existing["hardware"] = merged_hw
                known_ids.add(npwr_id)
                merged_stacks += 1
                print(
                    f"  🔗 STACK-MERGE! {npwr_id} -> an '{title_en}' ({merged_hw}) angehängt (jetzt {len(updated_npwrs)} NPWRs)."
                )
                continue
            except Exception as e:
                print(f"  ❌ Fehler beim Stack-Merge für {npwr_id}: {e}")

        # Reguläre Neuanlage (Erster Stack dieses Spiels)
        insert_payload = {
            "platform_game_id": [npwr_id],
            "hardware": platform,
            "ecosystem": "sony",
            "status": {"discovery": "DISCOVERED"},
            "spieltitel": {"en": title_en},
            "anzahl_trophaeen": trophy_count,
        }

        try:
            res_ins = supabase.table("games").insert(insert_payload).execute()
            new_hits += 1
            known_ids.add(npwr_id)
            new_uuid = res_ins.data[0]["id"] if res_ins.data else None
            if new_uuid and t_key:
                title_index[t_key] = {
                    "id": new_uuid,
                    "npwrs": [npwr_id],
                    "max_num": num,
                    "hardware": platform,
                    "trophy_count": trophy_count,
                }
            print(
                f"  🎯 TREFFER #{new_hits}! {npwr_id} -> '{title_en}' ({platform}) als DISCOVERED angelegt."
            )
        except Exception as e:
            print(f"  ❌ DB-Fehler bei {npwr_id}: {e}")

    print(
        f"\n🏁 Scout-Lauf beendet: {new_hits} neue Spiele angelegt, {merged_stacks} regionale Stacks direkt zusammengeführt!"
    )
