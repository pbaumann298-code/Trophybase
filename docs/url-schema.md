# URL-Schema für Spiele

**Stand:** August 2026 · **Katalog:** ca. 42.000 Zeilen, davon einige hundert
fertige deutsche Guides. Pretty-URLs gelten **nur für veröffentlichte Guides**.

## Entscheidung

```
trophybase.app/de/ps5/elden-ring
               │   │    └── Slug, gespeichert in games.slug, nicht bei jedem Request neu gerechnet
               │   └── Konsole, kleingeschrieben (PS5 → ps5; PS4/PS5 → ps5)
               └── Sprache zuerst
```

Sprache steht vorn, nicht die Konsole. hreflang, Sitemaps und Routing hängen am
Pfad-Anfang; Standardwerkzeuge erwarten das so.

Ein **gemeinsamer Slug für alle Sprachen**, abgeleitet vom englischen Titel
(`spieltitel->>'en'`, Fallback `de` / `es`). Eigene Slugs pro Sprache verdoppeln
Kollisionen und Pflege. Der gemeinsame Slug ist der stabile Kern.

**Stand der Umsetzung:** SPA-Routing, Slug-Trigger (SQL) und Laufzeit-Tags
(canonical + hreflang) sind im Frontend verdrahtet. `/guide/{id}` bleibt als
Fallback und wird clientseitig auf die Pretty-URL umgeschrieben, sobald `slug`
gesetzt ist. Statisches HTML für Google (Prerender) bleibt `docs/seo-rendering.md`.

## Was gespeichert wird

Neue Spalte auf `public.games` — Skript: `supabase/games_slug.sql`.

```sql
alter table public.games
  add column if not exists slug text;

create unique index if not exists games_hardware_slug_idx
  on public.games (tb_hardware_slug(hardware), slug)
  where slug is not null and tb_hardware_slug(hardware) is not null;
```

`slug` ist **nicht** global UNIQUE: dieselbe Basis (`god-of-war`) darf auf PS4
und PS5 existieren, weil die URLs `/de/ps4/god-of-war` und `/de/ps5/god-of-war`
verschieden sind. Unique ist `(Konsole, Slug)`.

Ein Trigger (`games_assign_slug`) setzt den Slug beim Insert aus
`slugify(spieltitel->>'en')`. Danach bleibt er unveränderlich. Titelkorrekturen
ändern die URL nicht. Reicht ein Jahr-Suffix nicht: kurzes `platform_game_id`-Suffix.

## Wo die URLs herkommen

Kurz: **Niemand legt 42.000 Adressen als Dateien an.** Eine URL ist eine
*Rechenregel* plus Felder aus der Datenbankzeile. Der Website-Code enthält
keine Ordner pro Spiel.

**Heute** kommt ein Besucher z. B. auf `/de/ps5/elden-ring` oder noch auf
`/guide/NPWR12345_00`. Vercel kennt diese Datei nicht — `vercel.json` schickt
jeden unbekannten Pfad an dieselbe `index.html`. React startet, liest den Pfad
(`parsePrettyGamePath` / `getGameIdFromPath` in `src/lib/routeUtils.js`) und
fragt Supabase (`fetchGameBySlug` bzw. `fetchGameByRouteRef`).
`gameGuidePath()` baut `/{locale}/{hardware}/{slug}`, sobald `games.slug` und
eine erkannte Konsole da sind, sonst `/guide/{platform_game_id|id}`.

Altpfade `/guide/…` werden nach dem Laden per `replaceState` auf die Pretty-URL
gehoben. `/profile`, `/admin`, `/admin/qa`, `/beta` liegen außerhalb dieses
Schemas.

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

Konsolen-Segment: `PS3`/`PS4`/`PS5` → `ps3`/`ps4`/`ps5`. `PS4/PS5` wird zu
`ps5` (höchste Generation). Unbekannt oder leer: kein Pretty-URL.

## SEO-Tags (Laufzeit)

`src/lib/seoHead.js` setzt im `<head>`:

- `<link rel="canonical" href="https://trophybase.app/de/ps5/…">` — immer die
  **aufgerufene** Sprache, nie eine andere Variante.
- `<link rel="alternate" hreflang="de|en|es">` auf dieselben Pfade mit
  getauschtem Locale-Segment.
- `hreflang="x-default"` zeigt auf Englisch (`en`).

Das ist die SPA-Umsetzung. Damit Google die Tags ohne JavaScript sieht, bleibt
der Prerender aus `docs/seo-rendering.md` der nächste Schritt.

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

`/guide/{platform_game_id|uuid}` bleibt gültig. Sobald `slug` existiert, schreibt
die SPA die Adresse per `history.replaceState` auf `/{locale}/{hardware}/{slug}`
um. Ein echter HTTP-301 kommt mit dem Prerender/Edge-Schritt.

`/profile`, `/admin`, `/admin/qa`, `/beta` bleiben unverändert außerhalb dieses
Schemas.
