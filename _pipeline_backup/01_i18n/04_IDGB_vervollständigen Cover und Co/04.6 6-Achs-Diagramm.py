import os
import json
import time
from pathlib import Path
from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field
from dotenv import load_dotenv, find_dotenv
from supabase import create_client, Client
from google import genai
from google.genai import types

_ROOT_ENV = Path(r"C:\Temp\TrophyBase\.env")
if _ROOT_ENV.exists():
    load_dotenv(_ROOT_ENV, override=True)
else:
    _parent_envs = [p / ".env" for p in Path(__file__).resolve().parents if (p / ".env").exists()]
    load_dotenv(_parent_envs[0] if _parent_envs else find_dotenv(), override=True)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
ai_client = genai.Client(api_key=GEMINI_API_KEY)
MODEL_ID = "gemini-3.5-flash"

# Alle 15 internationalen Zielsprachen (DE ist Master auf Root-Ebene)
TARGET_LOCALES = [
    "en",
    "es",
    "pt",
    "fr",
    "it",
    "nl",
    "pl",
    "ru",
    "sv",
    "fi",
    "ar",
    "ja",
    "ko",
    "zh-hans",
    "zh-hant",
]

# Statische Achsen-Labels pro Sprache (spart KI-Tokens & garantiert 100% Konsistenz)
AXIS_LABELS_I18N: Dict[str, Dict[str, str]] = {
    "de": {
        "motorik": "Motorik & Peak",
        "planung": "Guide-Zwang",
        "grind": "Grind & Sammelwut",
        "rng": "RNG & Willkür",
        "haerte": "Bestrafungs-Härte",
        "mp": "MP-Abhängigkeit",
    },
    "en": {
        "motorik": "Mechanics & Peak",
        "planung": "Guide Reliance",
        "grind": "Grind & Collectibles",
        "rng": "RNG & Luck",
        "haerte": "Punishment Severity",
        "mp": "Co-op / MP Dependency",
    },
    "es": {
        "motorik": "Habilidad y Reflejos",
        "planung": "Dependencia de Guía",
        "grind": "Farmeo y Coleccionables",
        "rng": "RNG y Azar",
        "haerte": "Nivel de Castigo",
        "mp": "Dependencia Multijugador",
    },
    "pt": {
        "motorik": "Mecânica e Reflexos",
        "planung": "Dependência de Guia",
        "grind": "Grind e Colecionáveis",
        "rng": "RNG e Sorte",
        "haerte": "Rigor de Punição",
        "mp": "Dependência Multiplayer",
    },
    "fr": {
        "motorik": "Mécaniques & Réflexes",
        "planung": "Dépendance au Guide",
        "grind": "Grind & Collectibles",
        "rng": "RNG & Hasard",
        "haerte": "Sévérité & Punition",
        "mp": "Dépendance Multijoueur",
    },
    "it": {
        "motorik": "Meccaniche e Riflessi",
        "planung": "Dipendenza da Guida",
        "grind": "Grind e Collezionabili",
        "rng": "RNG e Fortuna",
        "haerte": "Severità di Punizione",
        "mp": "Dipendenza Multiplayer",
    },
    "nl": {
        "motorik": "Motoriek & Vaardigheid",
        "planung": "Gids-afhankelijkheid",
        "grind": "Grind & Verzamelobjecten",
        "rng": "RNG & Geluk",
        "haerte": "Strafmaat",
        "mp": "MP-afhankelijkheid",
    },
    "pl": {
        "motorik": "Mechanika i Zręczność",
        "planung": "Wymóg Poradnika",
        "grind": "Grind i Znajdźki",
        "rng": "RNG i Losowość",
        "haerte": "Surowość Kar",
        "mp": "Zależność od MP",
    },
    "ru": {
        "motorik": "Механика и скилл",
        "planung": "Зависимость от гайда",
        "grind": "Гринд и коллекibles",
        "rng": "Рандом и удача",
        "haerte": "Суровость наказаний",
        "mp": "Зависимость от онлайна",
    },
    "sv": {
        "motorik": "Mekanik & Skicklighet",
        "planung": "Guideberoende",
        "grind": "Grind & Samlarföremål",
        "rng": "RNG & Tur",
        "haerte": "Straffgrad",
        "mp": "MP-beroende",
    },
    "fi": {
        "motorik": "Mekaniikka & Taito",
        "planung": "Opasriippuvuus",
        "grind": "Grindaus & Keräily",
        "rng": "RNG & Tuuri",
        "haerte": "Rangaistavuus",
        "mp": "Moninpeliriippuvuus",
    },
    "ar": {
        "motorik": "المهارة ورد الفعل",
        "planung": "الاعتماد على الدليل",
        "grind": "التكرار والتجميع",
        "rng": "الحظ والعشوائية",
        "haerte": "قسوة العقوبة",
        "mp": "الاعتماد على الأونلاين",
    },
    "ja": {
        "motorik": "操作スキル・反射神経",
        "planung": "攻略ガイド依存度",
        "grind": "周回・収集要素",
        "rng": "運要素 (RNG)",
        "haerte": "デスペナルティ・厳しさ",
        "mp": "マルチプレイ依存度",
    },
    "ko": {
        "motorik": "피지컬 & 조작 난이도",
        "planung": "공략 의존도",
        "grind": "반복 작업 & 수집",
        "rng": "운 & 확률 (RNG)",
        "haerte": "패널티 강도",
        "mp": "멀티플레이 의존도",
    },
    "zh-hans": {
        "motorik": "操作与上限",
        "planung": "攻略依赖度",
        "grind": "刷图与收集",
        "rng": "随机与运气 (RNG)",
        "haerte": "惩罚严厉度",
        "mp": "联机依赖度",
    },
    "zh-hant": {
        "motorik": "操作與上限",
        "planung": "攻略依賴度",
        "grind": "農度與收集",
        "rng": "隨機與運氣 (RNG)",
        "haerte": "懲罰嚴厲度",
        "mp": "連線依賴度",
    },
}


# --- 1. SCHEMA FÜR NEUGENERIERUNG (DEUTSCH) ---
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
                "'internet_no_psplus' = Internetverbindung / Server-Login nötig, aber KEIN kostenpflichtiges PS+ Abo für Platin nötig. "
                "'psplus_required' = Kostenpflichtiges PlayStation Plus Abo zwingend erforderlich."
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
        description="TRUE, wenn DLCs das Anforderungsprofil für 100% signifikant verschärfen. Sonst FALSE."
    )
    dlc_summary: Optional[str] = Field(
        default=None,
        description="Falls has_dlc_shift=True: Kurzer Warnsatz, welcher DLC warum eskaliert. Sonst null.",
    )
    dlc_axes: Optional[List[RadarAxisSchema]] = Field(
        default=None,
        description="Falls has_dlc_shift=True: Die 6 Achsen für die gesamten 100% (inkl. DLC-Spitzen). Sonst null.",
    )


# --- 2. KOMPAKT-SCHEMA FÜR MULTI-SPRACHEN-ÜBERSETZUNG ---
class AxisReasonsTranslationSchema(BaseModel):
    motorik: str
    planung: str
    grind: str
    rng: str
    haerte: str
    mp: str


class SingleLocaleRadarTranslation(BaseModel):
    locale: str = Field(
        description="Sprachcode exakt wie angefragt, z.B. 'en', 'fr', 'zh-hans'"
    )
    playthroughs: str
    summary: str
    axes_reasons: AxisReasonsTranslationSchema
    dlc_summary: Optional[str] = None
    dlc_axes_reasons: Optional[AxisReasonsTranslationSchema] = None


class MultiLocaleRadarBatchSchema(BaseModel):
    translations: List[SingleLocaleRadarTranslation]


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
- Prüfe, ob das Spiel Trophäen-DLCs ([DLC: ...]) hat, die das Profil für 100%-Komplettisten deutlich härter machen (Mindestens +2 Punkte Unterschied auf einer Achse).
- Wenn die DLCs harmlos sind oder keine DLCs existieren: Setze 'has_dlc_shift' auf false und lasse 'dlc_axes' leer!
- Wenn ein DLC eskaliert: Setze 'has_dlc_shift' auf true und gib in 'dlc_axes' die Werte für die 100%-Komplettierung an.
"""

TRANSLATION_SYSTEM_INSTRUCTION = """
Du bist ein präziser Gaming-Lokalisierer für PlayStation-Trophäen-Guides (TrophyBase).
Übersetze die deutschen Kurztexte des 6-Achsen-Platin-Radars natürlich, knapp und im authentischen Gaming-/Trophy-Hunter-Jargon der jeweiligen Zielsprache (z.B. NG+, Cloud-Save, Permadeath, RNG, Collectibles, Co-op).
Halte die 'axes_reasons' extrem kompakt (max. 10-12 Wörter pro Achse).
Wenn 'dlc_summary' und 'dlc_axes_reasons' im Input null/leer sind, lasse sie auch im Output null.
"""


def fetch_published_games_for_radar(limit: int = 500):
    """Lädt veröffentlichte Premium/Evergreen-Spiele (sowohl ohne Radar als auch mit Radar)."""
    response = (
        supabase.table("games")
        .select(
            "id, hardware, total_online_trophies, total_missable_trophies, "
            "title_de:spieltitel->>de, title_en:spieltitel->>en, radar_profile"
        )
        .eq("is_published", True)
        .in_("spiel_typ", ["Premium", "Evergreen", "Standard"])
        .limit(limit)
        .execute()
    )
    return response.data or []


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
    return response.data or []


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


def get_missing_locales(radar_json: dict) -> List[str]:
    """Prüft, welche der 15 Zielsprachen im radar_profile noch fehlen."""
    if not isinstance(radar_json, dict) or not radar_json.get("axes"):
        return TARGET_LOCALES
    missing = []
    for loc in TARGET_LOCALES:
        loc_block = radar_json.get(loc)
        if not isinstance(loc_block, dict) or not loc_block.get("axes"):
            missing.append(loc)
    return missing


def translate_radar_profile(
    radar_json: dict, game_title: str, missing_locales: List[str]
) -> dict:
    """Übersetzt nur die Textfelder des bestehenden deutschen Radars in alle fehlenden Sprachen
    und baut daraus direkt die fertigen Sprach-Blöcke (radar_json[loc]) für das Frontend.
    """
    base_axes = radar_json.get("axes") or []
    dlc_axes = radar_json.get("dlc_axes") or []
    has_dlc = bool(radar_json.get("has_dlc_shift") and dlc_axes)

    source_payload = {
        "game": game_title,
        "target_locales": missing_locales,
        "de_source": {
            "playthroughs": radar_json.get("playthroughs", ""),
            "summary": radar_json.get("summary", ""),
            "axes_reasons": {
                ax["key"]: ax.get("reason", "") for ax in base_axes if "key" in ax
            },
            "dlc_summary": radar_json.get("dlc_summary") if has_dlc else None,
            "dlc_axes_reasons": (
                {ax["key"]: ax.get("reason", "") for ax in dlc_axes if "key" in ax}
                if has_dlc
                else None
            ),
        },
    }

    response = ai_client.models.generate_content(
        model=MODEL_ID,
        contents=json.dumps(source_payload, ensure_ascii=False),
        config=types.GenerateContentConfig(
            system_instruction=TRANSLATION_SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=MultiLocaleRadarBatchSchema,
            temperature=0.15,
        ),
    )

    parsed = json.loads(response.text)
    updated_radar = dict(radar_json)

    # Sicherstellen, dass auch 'de' als expliziter Block für direkten Lookup bereitsteht
    updated_radar["de"] = {
        "playthroughs": radar_json.get("playthroughs"),
        "cloud_save_shortcut": radar_json.get("cloud_save_shortcut", False),
        "online_requirement": radar_json.get("online_requirement", "offline"),
        "summary": radar_json.get("summary"),
        "axes": base_axes,
        "has_dlc_shift": has_dlc,
        "dlc_summary": radar_json.get("dlc_summary") if has_dlc else None,
        "dlc_axes": dlc_axes if has_dlc else None,
    }

    for item in parsed.get("translations", []):
        loc = item.get("locale", "").strip().lower()
        if loc not in TARGET_LOCALES:
            continue

        labels_map = AXIS_LABELS_I18N.get(loc, AXIS_LABELS_I18N["en"])
        reasons_map = item.get("axes_reasons") or {}
        dlc_reasons_map = item.get("dlc_axes_reasons") or {}

        localized_axes = []
        for ax in base_axes:
            k = ax.get("key")
            localized_axes.append(
                {
                    "key": k,
                    "label": labels_map.get(k, ax.get("label", k)),
                    "score": ax.get("score", 0),
                    "reason": reasons_map.get(k) or ax.get("reason", ""),
                }
            )

        localized_dlc_axes = None
        if has_dlc:
            localized_dlc_axes = []
            for ax in dlc_axes:
                k = ax.get("key")
                localized_dlc_axes.append(
                    {
                        "key": k,
                        "label": labels_map.get(k, ax.get("label", k)),
                        "score": ax.get("score", 0),
                        "reason": dlc_reasons_map.get(k) or ax.get("reason", ""),
                    }
                )

        updated_radar[loc] = {
            "playthroughs": item.get("playthroughs") or radar_json.get("playthroughs"),
            "cloud_save_shortcut": radar_json.get("cloud_save_shortcut", False),
            "online_requirement": radar_json.get("online_requirement", "offline"),
            "summary": item.get("summary") or radar_json.get("summary"),
            "axes": localized_axes,
            "has_dlc_shift": has_dlc,
            "dlc_summary": item.get("dlc_summary") if has_dlc else None,
            "dlc_axes": localized_dlc_axes,
        }

    return updated_radar


def main():
    games = fetch_published_games_for_radar(limit=1000)

    new_games = [g for g in games if not g.get("radar_profile")]
    existing_to_translate = [
        g
        for g in games
        if g.get("radar_profile") and len(get_missing_locales(g["radar_profile"])) > 0
    ]

    print(
        f"Gefunden: {len(new_games)} Spiele OHNE Radar | "
        f"{len(existing_to_translate)} bestehende Radar-Profile mit fehlenden Übersetzungen."
    )

    # --- SCHRITT 1: Neue Spiele analysieren + direkt in alle 15 Zielsprachen übersetzen ---
    for index, game in enumerate(new_games, start=1):
        game_id = game["id"]
        title = game.get("title_de") or game.get("title_en") or "Unbekanntes Spiel"
        print(f"[NEU {index}/{len(new_games)}] {title}...")

        try:
            trophies = fetch_trophies_for_game(game_id)
            radar_de = generate_radar_for_game(game, title, trophies)
            radar_multilang = translate_radar_profile(radar_de, title, TARGET_LOCALES)

            supabase.table("games").update({"radar_profile": radar_multilang}).eq(
                "id", game_id
            ).execute()

            dlc_flag = (
                "⚠️ DLC-ESKALATION"
                if radar_de.get("has_dlc_shift")
                else "Nur Base-Game"
            )
            print(
                f"  -> NEU + 16 SPRACHEN OK ({dlc_flag} | {radar_de.get('online_requirement')}): "
                f"{radar_de.get('summary')}"
            )
            time.sleep(0.4)

        except Exception as e:
            print(f"  -> FEHLER bei Neu-Analyse {title}: {e}")

    # --- SCHRITT 2: Bestehende deutsche Radar-Profile nachübersetzen (ohne Trophäen-Reload!) ---
    for index, game in enumerate(existing_to_translate, start=1):
        game_id = game["id"]
        title = game.get("title_en") or game.get("title_de") or "Unbekanntes Spiel"
        radar_current = game["radar_profile"]
        missing = get_missing_locales(radar_current)

        print(
            f"[ÜBERSETZUNG {index}/{len(existing_to_translate)}] {title} (Fehlt: {len(missing)} Sprachen)..."
        )

        try:
            radar_multilang = translate_radar_profile(radar_current, title, missing)

            supabase.table("games").update({"radar_profile": radar_multilang}).eq(
                "id", game_id
            ).execute()

            print(
                f"  -> ÜBERSETZT ({', '.join(missing[:4])}...): {radar_multilang.get('en', {}).get('summary', '')}"
            )
            time.sleep(0.3)

        except Exception as e:
            print(f"  -> FEHLER bei Übersetzung {title}: {e}")


if __name__ == "__main__":
    main()
