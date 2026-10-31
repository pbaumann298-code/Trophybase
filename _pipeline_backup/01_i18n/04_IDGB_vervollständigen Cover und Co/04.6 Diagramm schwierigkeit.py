import os
import json
import time
from typing import List, Literal, Optional
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from supabase import create_client, Client
from google import genai
from google.genai import types

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
ai_client = genai.Client(api_key=GEMINI_API_KEY)
MODEL_ID = "gemini-3.5-flash"


# --- SCHEMA MIT PLATIN-ECKDATEN & OPTIONALEM DLC-LAYER ---
class RadarAxisSchema(BaseModel):
    key: str = Field(
        description="Exakt: 'motorik', 'planung', 'grind', 'rng', 'haerte' oder 'mp'"
    )
    label: str = Field(description="Anzeigename der Achse")
    score: int = Field(ge=0, le=10, description="Wert von 0 bis 10")
    reason: str = Field(
        description="Konkrete Begründung am Spiel (max. 12 Wörter) auf Deutsch."
    )


class RadarProfileSchema(BaseModel):
    playthroughs: str = Field(
        description="Kompakte Angabe der nötigen Spieldurchgänge für Platin auf Deutsch, z.B. '1 Durchgang (mit Kapitelauswahl)', '1 (mit Cloud-Save) / 3 regulär' oder 'Mindestens 2 Durchgänge (NG+)'."
    )
    cloud_save_shortcut: bool = Field(
        description="TRUE, wenn sich zusätzliche Durchgänge (z.B. für mehrere Enden oder verpassbare Entscheidungen) durch ein PS+ Cloud-Save-Backup / USB-Savegame abkürzen lassen. Sonst FALSE."
    )
    online_requirement: Literal["offline", "internet_no_psplus", "psplus_required"] = (
        Field(
            description=(
                "'offline' = Platin komplett offline ohne Internet erspielbar. "
                "'internet_no_psplus' = Internetverbindung / Server-Login nötig (z.B. Free-to-Play wie The First Descendant/Warframe oder Always-On Singleplayer wie Hitman/GT7), aber KEIN kostenpflichtiges PS+ Abo für Platin nötig. "
                "'psplus_required' = Kostenpflichtiges PlayStation Plus Abo zwingend erforderlich (klassischer Online-Koop / PvP-Multiplayer bei Vollpreisspielen)."
            )
        )
    )
    summary: str = Field(
        description="Prägnanter Satz zum Platin-Charakter auf Deutsch."
    )
    axes: List[RadarAxisSchema] = Field(
        description="Die 6 Achsen NUR für das Hauptspiel (Platin)."
    )
    has_dlc_shift: bool = Field(
        description="TRUE, wenn DLCs das Anforderungsprofil für 100% signifikant verschärfen (z.B. neuer MP-Grind, Permadeath, extremer Schwierigkeitsgrad). Sonst FALSE."
    )
    dlc_summary: Optional[str] = Field(
        default=None,
        description="Falls has_dlc_shift=True: Kurzer Warnsatz, welcher DLC warum eskaliert. Sonst null.",
    )
    dlc_axes: Optional[List[RadarAxisSchema]] = Field(
        default=None,
        description="Falls has_dlc_shift=True: Die 6 Achsen für die gesamten 100% (inkl. DLC-Spitzen). Sonst null.",
    )


SYSTEM_INSTRUCTION = """
Du bist ein gnadenloser Daten-Analyst für PlayStation-Trophäen (Platin vs. 100% Komplettierung).
Skalen-Regel: 0 = existiert nicht/trivial, 10 = extremes Maximum an Schmerz/Aufwand.

PLATIN-ECKDATEN (FÜR DAS HAUPTSPIEL):
- 'playthroughs': Wie viele Durchgänge sind für die Platin-Trophäe nötig? Wenn ein Savegame-Backup (Cloud-Save) Durchgänge spart (z.B. Elden Ring / Bloodborne: 1 statt 3 Durchgänge), nenne beides kurz: '1 (mit Cloud-Save) / 3 regulär'.
- 'cloud_save_shortcut': Setze auf true, wenn mehrere Enden oder ausschließende Fraktions-/Quest-Entscheidungen durch PS+ Cloud-Backup in einem Run erledigt werden können.
- 'online_requirement': Unterscheide strikt zwischen:
  1. 'offline' (keinerlei Online-Trophäen im Hauptspiel),
  2. 'internet_no_psplus' (Free-to-Play-Spiele, die laut Sony nie PS+ brauchen, ODER Spiele mit Always-On-Serverzwang / Bestenlisten ohne echtes Multiplayer-Matchmaking wie Hitman),
  3. 'psplus_required' (echte Koop-/PvP-Trophäen in einem Kaufspiel, für die auf PS4/PS5 ein PS+ Abo Pflicht ist).

Reihenfolge der 6 Achsen (zwingend einhalten):
1. key: "motorik", label: "Motorik & Peak" (Härteste Stelle / Flaschenhals!)
2. key: "planung", label: "Guide-Zwang" (Verpassbares, Quest-Ketten)
3. key: "grind", label: "Grind & Sammelwut" (Stumpfes Farmen, Collectibles)
4. key: "rng", label: "RNG & Willkür" (Drop-Glück, World-Roll, Map-Voting)
5. key: "haerte", label: "Bestrafungs-Härte" (Permadeath, Checkpoints, Frust)
6. key: "mp", label: "MP-Abhängigkeit" (0 bei Solo, hoch bei Koop/PvP/toten Lobbys)

DLC-LOGIK (WICHTIG):
- Bewerte in 'axes' IMMER NUR das Hauptspiel ([MAIN] / Weg zur Platin).
- Prüfe, ob das Spiel Trophäen-DLCs ([DLC: ...]) hat, die das Profil für 100%-Komplettisten deutlich härter machen (Mindestens +2 Punkte Unterschied auf einer Achse, z.B. The Division Untergrund/Überleben/Last Stand, Uncharted 'Gnadenlos', Remnant 'Überlebensmodus', TLoU ' Erbarmungslos').
- Wenn die DLCs harmlos sind (nur normale Story-Erweiterung auf gleichem Niveau) oder keine DLCs existieren: Setze 'has_dlc_shift' auf false und lasse 'dlc_axes' leer!
- Wenn ein DLC eskaliert: Setze 'has_dlc_shift' auf true und gib in 'dlc_axes' die Werte für die 100%-Komplettierung an (wobei jeder Achsenwert mindestens so hoch sein muss wie im Hauptspiel, plus den DLC-Ausschlag). Erkläre im 'reason' der betroffenen Achsen konkret den schuldigen DLC!
"""


def fetch_published_games_without_radar():
    response = (
        supabase.table("games")
        .select(
            "id, hardware, total_online_trophies, total_missable_trophies, "
            "title_de:spieltitel->>de, title_en:spieltitel->>en"
        )
        .eq("status->>guide_de", "PUBLISHED")
        .in_("spiel_typ", ["Premium", "Evergreen"])
        .is_("radar_profile", "null")
        .limit(500)
        .execute()
    )
    return response.data


def fetch_trophies_for_game(game_id: str):
    response = (
        supabase.table("game_achievements")
        .select(
            "name_de:trophy_name->>de, name_en:trophy_name->>en, "
            "desc_de:trophy_desc->>de, desc_en:trophy_desc->>en, "
            "tip_de:guide_tip->>de, "
            "pack_de:spielname->>de, pack_en:spielname->>en, "
            "trophy_type, trophy_gruppe, is_online, is_missable"
        )
        .eq("game_id", game_id)
        .execute()
    )
    return response.data


def generate_radar_for_game(game: dict, game_title: str, trophies: list) -> dict:
    trophy_lines = []
    for t in trophies:
        t_type = t.get("trophy_type") or "Trophy"
        gruppe = (t.get("trophy_gruppe") or "default").strip().lower()
        pack_name = t.get("pack_de") or t.get("pack_en") or gruppe
        scope = "MAIN" if gruppe in ("default", "all", "") else f"DLC: {pack_name}"

        flags = []
        if t.get("is_missable"):
            flags.append("VERPASSBAR")
        if t.get("is_online"):
            flags.append("ONLINE")
        flag_str = f" ({', '.join(flags)})" if flags else ""

        t_name = t.get("name_de") or t.get("name_en") or "Unbekannt"
        t_desc = t.get("desc_de") or t.get("desc_en") or ""
        t_tip = t.get("tip_de") or ""
        tip_str = f" [Guide-Tipp: {t_tip}]" if t_tip else ""

        trophy_lines.append(
            f"- [{scope}] [{t_type}]{flag_str} {t_name}: {t_desc}{tip_str}"
        )

    trophy_text = "\n".join(trophy_lines)
    hw = game.get("hardware") or "PlayStation"
    online_cnt = game.get("total_online_trophies")
    missable_cnt = game.get("total_missable_trophies")

    prompt = f"""
Spiel: {game_title} ({hw})
Bekannte DB-Flags: Online-Trophäen={online_cnt}, Verpassbare Trophäen={missable_cnt}
Trophäenliste ({len(trophies)} Einträge):
{trophy_text if trophy_text else "Nutze dein Wissen über Hauptspiel und DLC-Trophäen dieses Titels."}
"""

    response = ai_client.models.generate_content(
        model=MODEL_ID,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=RadarProfileSchema,
            temperature=0.2,
        ),
    )
    return json.loads(response.text)


def main():
    games = fetch_published_games_without_radar()
    print(f"Starte Analyse für {len(games)} Published-Spiele...")

    for index, game in enumerate(games, start=1):
        game_id = game["id"]
        title = game.get("title_de") or game.get("title_en") or "Unbekanntes Spiel"
        print(f"[{index}/{len(games)}] {title}...")

        try:
            trophies = fetch_trophies_for_game(game_id)
            radar_json = generate_radar_for_game(game, title, trophies)

            supabase.table("games").update({"radar_profile": radar_json}).eq(
                "id", game_id
            ).execute()

            dlc_flag = (
                "⚠️ DLC-ESKALATION"
                if radar_json.get("has_dlc_shift")
                else "Nur Base-Game"
            )
            online_req = radar_json.get("online_requirement")
            runs = radar_json.get("playthroughs")
            print(
                f"  -> OK ({dlc_flag} | {online_req} | {runs}): {radar_json.get('summary')}"
            )
            time.sleep(0.5)

        except Exception as e:
            print(f"  -> FEHLER bei {title}: {e}")


if __name__ == "__main__":
    main()
