import os
import sys
import json
import base64
from io import BytesIO
import requests
from PIL import Image
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(
        "❌ Fehler: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in der .env!"
    )

VISION_API_URL = os.getenv(
    "VISION_API_URL", "http://localhost:11434/v1/chat/completions"
)
VISION_API_KEY = "ollama"
VISION_MODEL = os.getenv("VISION_MODEL", "qwen2.5-vl:7b")

BATCH_SIZE = 50
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

SYSTEM_PROMPT = """Du bist ein strenger Datenbank-Auditor für Videospiel-Cover.
Prüfe, ob das übergebene Bild ein gültiges Cover/Key-Art für den genannten Spieltitel ist.

WICHTIGE REGELN GEGEN FALSE POSITIVES:
1. Key-Art OHNE Text ist GÜLTIG (valid = true), solange es nicht eindeutig zu einem völlig anderen Franchise gehört.
2. Asiatische Schriftzeichen auf dem Cover sind GÜLTIG (valid = true).
3. UNGÜLTIG (valid = false) ist das Bild NUR bei harten Fehlern:
   - Ein eindeutig anderer Spieltitel ist auf dem Cover lesbar.
   - Es ist ein reiner In-Game-Screenshot (mit HUD/Menüs) oder ein kleines Trophy-Icon.
   - Es ist ein Platzhalter ("Image not found", "No Cover", graues Dummy-Bild).
   - Das Bild ist extrem verzerrt, komplett einfarbig oder defekt.

Antworte AUSSCHLIESSLICH im folgenden JSON-Format:
{"valid": true/false, "reason": "Kurze Begründung auf Deutsch (max 10 Wörter)"}"""


def fetch_and_compress_image(url: str) -> str | None:
    try:
        resp = requests.get(url, timeout=8)
        if resp.status_code != 200:
            return None
        img = Image.open(BytesIO(resp.content)).convert("RGB")
        img.thumbnail((512, 512), Image.Resampling.LANCZOS)
        buffered = BytesIO()
        img.save(buffered, format="JPEG", quality=80)
        return base64.b64encode(buffered.getvalue()).decode("utf-8")
    except Exception:
        return None


def evaluate_cover_with_qwen(title_info: str, base64_img: str) -> dict:
    payload = {
        "model": VISION_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"Datenbank-Spieltitel: {title_info}"},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{base64_img}"},
                    },
                ],
            },
        ],
        "temperature": 0.0,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {VISION_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        r = requests.post(VISION_API_URL, headers=headers, json=payload, timeout=30)
        r.raise_for_status()
        return json.loads(r.json()["choices"][0]["message"]["content"])
    except Exception as e:
        return {"error": str(e)}


def run_audit_batch():
    while True:
        # Zieht nur unverified Spiele, die nicht null oder {} in cover_url sind
        res = (
            supabase.table("games")
            .select("id, spieltitel, hardware, cover_url, cover_status")
            .or_("cover_status.is.null,cover_status.eq.unverified")
            .not_.is_("cover_url", "null")
            .neq("cover_url", "{}")
            .limit(BATCH_SIZE)
            .execute()
        )

        games = res.data
        if not games:
            print("Alle vorhandenen Cover wurden geprüft.")
            break

        for game in games:
            game_id = game["id"]
            titel_obj = game.get("spieltitel") or {}
            cover_obj = game.get("cover_url") or {}
            hardware = game.get("hardware") or ""

            # Extrahiere Titel (DE/EN/JA für maximale Treffsicherheit)
            title_de = titel_obj.get("de") or titel_obj.get("en") or "Unbekannt"
            title_ja = titel_obj.get("ja")
            title_context = f"'{title_de}' ({hardware})" + (
                f" / JP: '{title_ja}'" if title_ja and title_ja != title_de else ""
            )

            # Extrahiere Cover-URL (DE vor EN)
            url = cover_obj.get("de") or cover_obj.get("en")
            if not url:
                supabase.table("games").update(
                    {
                        "cover_status": "invalid",
                        "cover_notes": "Keine de/en URL im cover_url JSONB",
                    }
                ).eq("id", game_id).execute()
                continue

            # 1. Bild laden (Fängt tote IGDB/PSN-Links direkt ab)
            b64_img = fetch_and_compress_image(url)
            if not b64_img:
                supabase.table("games").update(
                    {
                        "cover_status": "invalid",
                        "cover_notes": "HTTP 404 / Bild-URL tot oder nicht lesbar",
                    }
                ).eq("id", game_id).execute()
                print(f"[INVALID - DEAD LINK] {title_de} ({game_id})")
                continue

            # 2. Qwen-VL Analyse
            result = evaluate_cover_with_qwen(title_context, b64_img)
            if "error" in result:
                print(f"[API ERROR] Überspringe {title_de}: {result['error']}")
                continue

            is_valid = result.get("valid", True)
            reason = result.get("reason", "")

            supabase.table("games").update(
                {
                    "cover_status": "valid" if is_valid else "invalid",
                    "cover_notes": None if is_valid else reason,
                }
            ).eq("id", game_id).execute()

            print(f"[{'OK' if is_valid else 'INVALID: ' + reason}] {title_de}")


if __name__ == "__main__":
    run_audit_batch()
