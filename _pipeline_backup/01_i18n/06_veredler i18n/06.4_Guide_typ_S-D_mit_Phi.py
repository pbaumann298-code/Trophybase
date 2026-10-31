from operator import eq
import os
import sys
import re
import json
import requests
from typing import Any, List, Dict
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

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = os.getenv("LOCAL_CLASSIFIER_MODEL", "qwen2.5:14b")  # Oder "phi4:latest"
USE_LLM_FOR_UNCLEAR = True  # Auf False setzen, wenn heute NUR die schnellen Regeln ohne LLM laufen sollen!

COLLECTIBLE_RE = re.compile(
    r"(sammelguide|sammelobjekt|sammelgegenst|alle fundorte|collectible|all locations|"
    r"find all|collect all|sammle alle|finde alle|audio\s*log|datenpunkt|truhen|statuen|artefakte|federn)",
    re.I,
)
MISSABLE_RE = re.compile(
    r"(verpassbar|missable|keine kapitelauswahl|point of no return|alle enden|all endings)",
    re.I,
)


def evaluate_rules_fast(spiel_typ: str, ach_rows: List[Dict[str, Any]]) -> str:
    st_low = spiel_typ.lower()
    if "quickwin" in st_low or "easy_platin" in st_low:
        return "C"
    if not ach_rows:
        return "D"

    collectible_hits = 0
    missable_hits = 0
    has_enriched_tips = False

    for row in ach_rows:
        # Nutzt direkt die Boolean-Flags aus 06.1 + Regex-Fallback!
        blob = json.dumps(row, ensure_ascii=False)
        if row.get("is_collectible") is True or COLLECTIBLE_RE.search(blob):
            collectible_hits += 1
        if row.get("is_missable") is True or MISSABLE_RE.search(blob):
            missable_hits += 1

        tip = str(row.get("guide_tip") or "")
        if len(tip) > 80:
            has_enriched_tips = True

    is_premium = ("evergreen" in st_low) or ("premium" in st_low)

    if is_premium and (collectible_hits > 0 or missable_hits > 0):
        return "S"
    if (missable_hits > 0 and collectible_hits > 0) or missable_hits >= 3:
        return "A"
    if collectible_hits > 0 and missable_hits == 0:
        return "B"
    if 1 <= missable_hits <= 2:
        return "C"
    if has_enriched_tips and collectible_hits == 0 and missable_hits == 0:
        return "D"

    return "?"


def extract_compact_trophy_summary(ach_rows: List[Dict[str, Any]]) -> str:
    lines = []
    for row in ach_rows[:55]:
        title = row.get("title") or row.get("name") or row.get("trophy_name") or ""
        desc = (
            row.get("description") or row.get("detail") or row.get("trophy_desc") or ""
        )
        tip = row.get("guide_tip") or row.get("tip") or ""
        if isinstance(title, dict):
            title = title.get("de") or title.get("en") or ""
        if isinstance(desc, dict):
            desc = desc.get("de") or desc.get("en") or ""
        if isinstance(tip, dict):
            tip = tip.get("de") or tip.get("en") or ""
        line = f"- {str(title).strip()}: {str(desc).strip()}"
        if tip:
            line += f" [Tipp: {str(tip).strip()[:100]}]"
        lines.append(line)
    return "\n".join(lines)


def classify_with_ollama(game_title: str, spiel_typ: str, trophy_blob: str) -> str:
    prompt = f"""Klassifiziere das PlayStation-Spiel für unsere Guide-Datenbank exakt in S, A, B, C oder D:
- "S": Evergreen/Premium-Spiel mit vielen Collectibles/Bossen/Verpassbarem (Playlist nötig).
- "A": Verpassbare Trophäen UND Collectibles (100% Guide nötig).
- "B": Hat Sammelobjekte (Collectibles/Fundorte), aber nichts Verpassbares (1 Sammelguide-Video reicht).
- "C": Kurzes Easy-Platin/Indie-Spiel, wo 1 kurzes Walkthrough-Video hilft.
- "D": Selbstläufer ohne Video-Bedarf! Keine versteckten Sammelobjekte, nichts verpassbar (reine Story/Arcade/Sport).

Spiel: {game_title} ({spiel_typ})
Trophäen:
{trophy_blob}

Antworte NUR mit JSON: {{"guide_typ": "D"}}"""

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.0},
    }
    try:
        r = requests.post(OLLAMA_URL, json=payload, timeout=45)
        r.raise_for_status()
        val = (
            str(json.loads(r.json().get("response", "{}")).get("guide_typ", ""))
            .strip()
            .upper()
        )
        if val in {"S", "A", "B", "C", "D"}:
            return val
    except Exception as e:
        print(f"   ⚠️ Ollama-Fehler: {e}")
    return "C"


def main():
    total_processed = 0
    batch_size = 100
    eq("status->>trophies", "PROCESSED")

    print(
        "🚀 Starte automatische Hybrid-Klassifizierung (Regel-Engine + LLM-Fallback)...\n"
    )

    while True:
        res = (
            supabase.table("games")
            .select("id, spieltitel, spiel_typ")
            .is_("guide_typ", "null")
            .or_("spiel_typ.is.null,spiel_typ.neq.Unlesbar")
            .limit(batch_size)
            .execute()
        )
        games = res.data or []
        if not games:
            print("\n🏁 ALLE Spiele in der Datenbank sind vollständig klassifiziert!")
            break

        game_ids = [g["id"] for g in games]

        # Alle Achievements für diese 100 Spiele in wenigen schnellen Calls holen
        ach_by_game: Dict[Any, List[Dict[str, Any]]] = {gid: [] for gid in game_ids}
        offset = 0
        while True:
            ach_res = (
                supabase.table("game_achievements")
                .select("*")
                .in_("game_id", game_ids)
                .range(offset, offset + 999)
                .execute()
            )
            ach_data = ach_res.data or []
            for a in ach_data:
                ach_by_game.setdefault(a.get("game_id"), []).append(a)
            if len(ach_data) < 1000:
                break
            offset += 1000

        for g in games:
            gid = g["id"]
            raw_title = g.get("spieltitel")
            if isinstance(raw_title, str) and raw_title.startswith("{"):
                try:
                    raw_title = json.loads(raw_title)
                except Exception:
                    pass
            title = (
                (raw_title.get("en") or raw_title.get("de"))
                if isinstance(raw_title, dict)
                else str(raw_title or "Unbekannt")
            )
            spiel_typ = str(g.get("spiel_typ") or "Standard")
            ach_rows = ach_by_game.get(gid, [])

            # 1. Schnelle Regel-Prüfung
            g_typ = evaluate_rules_fast(spiel_typ, ach_rows)
            source_tag = "REGEL"

            # 2. Falls '?' (unklar) -> Lokales LLM fragen (oder '?' speichern, falls LLM deaktiviert)
            if g_typ == "?":
                if USE_LLM_FOR_UNCLEAR and ach_rows:
                    trophy_blob = extract_compact_trophy_summary(ach_rows)
                    g_typ = classify_with_ollama(title, spiel_typ, trophy_blob)
                    source_tag = OLLAMA_MODEL
                else:
                    g_typ = "?"

            supabase.table("games").update({"guide_typ": g_typ}).eq("id", gid).execute()
            total_processed += 1
            print(
                f"[{total_processed:05d}] [{source_tag}] '{title[:45]}' ({spiel_typ}) -> {g_typ}"
            )


if __name__ == "__main__":
    main()
