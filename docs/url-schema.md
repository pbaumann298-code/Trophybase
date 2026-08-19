# URL-Schema für Spiele

**Stand:** August 2026 · **Katalog:** ca. 42.000 Zeilen, davon einige hundert
fertige deutsche Guides. Pretty-URLs gelten **nur für veröffentlichte Guides**.

## Entscheidung

```
trophybase.app/de/ps5/elden-ring
               │   │    └── Slug, gespeichert in der DB, nicht bei jedem Build neu gerechnet
               │   └── Konsole, kleingeschrieben (PS5 → ps5)
               └── Sprache zuerst
```

Sprache steht vorn, nicht die Konsole. hreflang, Sitemaps und Routing hängen am
Pfad-Anfang; Standardwerkzeuge erwarten das so. `/ps5/de/elden-ring` ist machbar,
aber man kämpft damit gegen jedes Tool.

Ein **gemeinsamer Slug für alle Sprachen**, abgeleitet vom deutschen Titel (zum
Start sowieso der einzige). Eigene Slugs pro Sprache (`/de/…/der-titel` vs.
`/en/…/the-title`) verdoppeln Kollisionen und Pflege, und fehlende Übersetzungen
hätten keine Adresse. Lokalisierten Slug kann man später ergänzen — der gemeinsame
ist der stabile Kern.

## Was gespeichert wird

Neue Spalte auf `public.games`:

```sql
alter table public.games
  add column if not exists slug text;

create unique index if not exists games_hardware_slug_idx
  on public.games (lower(hardware), slug)
  where slug is not null;
```

`slug` ist einmal berechnet und danach unveränderlich. Titelkorrekturen ändern
die URL nicht. Wenn ein Slug wirklich umbenannt werden muss: alten Wert in einer
kleinen Redirect-Tabelle halten und per 301 weiterleiten — nicht den Slug
überschreiben.

Pretty-URL nur setzen, wo ein Guide veröffentlicht wird. Die restlichen Zeilen
behalten `slug = null` und bleiben über die Suche erreichbar, ohne eigene Adresse.

## Wo die URLs herkommen

Kurz: **Niemand legt 42.000 Adressen als Dateien an.** Eine URL ist eine
*Rechenregel* plus Felder aus der Datenbankzeile. Der Website-Code enthält
keine Ordner pro Spiel.

**Heute** kommt ein Besucher z. B. auf `/guide/NPWR12345_00`. Vercel kennt diese
Datei nicht — `vercel.json` schickt jeden unbekannten Pfad an dieselbe
`index.html`. React startet, liest den Pfad (`getViewFromPath` /
`getGameIdFromPath` in `src/lib/routeUtils.js`) und fragt Supabase nach genau
dieser einen Zeile (`fetchGameByRouteRef` in `src/lib/gameQueries.js`). Die
Adresse selbst hat `gameGuidePath()` gebaut: `/guide/` plus
`platform_game_id`, sonst die UUID `id`. Die URL existiert, sobald die Zeile
in `games` existiert — nicht sobald jemand eine HTML-Datei angelegt hat.

**Künftig** (nur fertige Guides) ändert sich die *Regel*, nicht das Prinzip:
`/{sprache}/{konsole}/{slug}`, z. B. `/de/ps5/elden-ring`. Der `slug` wird
**einmal** berechnet und in `games.slug` gespeichert. Danach gehört er zur
Tabellenzeile, nicht zu einer Datei im Repo. Titelkorrekturen ändern die URL
nicht. Die übrigen ~41.500 Stammdaten-Zeilen brauchen zum Start **keine**
Pretty-URL und **keine** Datei; sie bleiben über die Suche erreichbar. Wenn
später eine Adresse gebraucht wird: Slug setzen (Skript), fertig.

Die HTML-Dateien unter `dist/de/ps5/…` aus dem geplanten Prerender
(`docs/seo-rendering.md`) sind ein **SEO-Cache** für Google — eine Kopie des
Inhalts zum Ausliefern, nicht die Quelle der URL. Ohne diese Datei funktioniert
die SPA-Route trotzdem (Catch-All → React → Datenbank). Mit Datei antwortet
Vercel nur schneller und mit sichtbarem Text im Quellcode.

### Woran Pretty-URLs später koppeln (noch nicht umgesetzt)

Im Code gibt es mehrere Signale „hat das Spiel Inhalt?“. Sie sind *nicht*
dieselbe Sache:

| Signal | Feld / Tabelle | Fundstelle |
|---|---|---|
| Redaktionsstatus | `games.status` (z. B. `COMING_SOON`) | `GAME_STRUCT.status` in `src/lib/gameSchema.js`; Banner: `isComingSoonStatus` in `src/lib/trophyStatusMessages.js` |
| Trophäenzahl | `games.anzahl_trophaeen` | `GAME_STRUCT.trophyCount`; wird mit `GAME_SELECT` geladen, in der UI nicht als Filter genutzt |
| Fortschritt | `games.fortschritt` | `GAME_STRUCT.progress`; wird geladen, **nirgends** in der UI ausgewertet |
| Trophäenliste | Zeilen in `game_achievements` | `TABLES.achievements`; `fetchAchievementsForGame` in `src/lib/achievementQueries.js` |
| Guide-Text | Zeilen in `game_guides` (Walkthrough, Sammelobjekte, Bosse) | `TABLES.guides`; `fetchGuidesForGame` / `fetchGameGuideBundle` in `src/lib/guideQueries.js` |
| Status-Erklärung | `games.status_explanation_localized` | `GAME_I18N.statusExplanation`; nach dem Merge als String `status_explanation` |

**Empfehlung für später:** Den Slug setzen, sobald **mindestens eine Zeile in
`game_guides` existiert.** Begründung: `game_achievements` und
`anzahl_trophaeen` gehören zum PSN-Katalog — das trifft auf den Großteil der
42.000 Zeilen zu, nicht nur auf fertige Guides. `status = COMING_SOON` heißt
im Frontend ausdrücklich „Trophäen da, Guide-Abschnitte noch nicht“.
`fortschritt` hat keine ausgewertete Semantik. `game_guides` ist der
redaktionelle Inhalt (Walkthrough / Sammelobjekte / Bosse) und entspricht den
paar hundert fertigen Guides. Katalog-Zeilen ohne Guide-Zeilen behalten
`slug = null`.

## Kollisionen

Gleicher Titel auf derselben Konsole (Standard / Deluxe / Remaster, oder
PS4-Original neben PS4-Remaster, das QA fälschlich beide als `PS4` schreibt):
**Jahr-Suffix**, und nur wenn nötig.

```
/de/ps4/the-last-of-us          — eindeutig, kein Suffix
/de/ps4/the-last-of-us-2013     — Konflikt, Jahr reicht
```

Reicht das Jahr nicht (zwei Einträge, gleiches Jahr, gleiche Konsole):
kurzes `platform_game_id`-Suffix. Nicht als erste Regel — die IDs sind hässlich.

Konsolen-Segment: `PS3`/`PS4`/`PS5` → `ps3`/`ps4`/`ps5`. Unbekannt oder leer:
kein Pretty-URL, bis die Zeile bereinigt ist.

## Prüfskript

Vor der Migration gegen die echte Tabelle laufen lassen:

```powershell
$env:SUPABASE_URL="https://<projekt>.supabase.co"
$env:SUPABASE_ANON_KEY="<anon key>"
node scripts/check-slug-collisions.mjs
```

Das Skript listet, wie viele Konflikte das Schema in den 42.000 Zeilen erzeugen
würde, und ob das Jahr sie löst. Werte stehen in `src/pages/supabaseClient.js`.

Zum Start reicht der Lauf über die **fertigen Guides** — das ist die Menge, die
wirklich eine URL bekommt. Ein Vollscan der 42.000 ist optional und zeigt vor
allem Datenqualität, nicht Launch-Blocker.

## Alte Pfade

Heutige URLs `/guide/{platform_game_id|uuid}` bleiben als 301 auf die Pretty-URL
stehen, sobald ein Slug existiert. Ohne Slug (Stammdaten): Verhalten wie bisher,
kein 404 erzwingen, solange die Suche sie noch ausspielt.

`/profile`, `/admin`, `/admin/qa`, `/beta` bleiben unverändert außerhalb dieses
Schemas.
