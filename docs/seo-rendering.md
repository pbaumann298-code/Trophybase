# SEO-Rendering: Entscheidungsdokument

**Stand:** August 2026 · **Status:** Entscheidung getroffen, Umsetzung offen
**Kontext:** TrophyBase.app ist noch nicht öffentlich und nicht indexiert.
**Katalog (Stand 18.08.2026):** ca. 42.000 Zeilen in `public.games`. Davon einige
hundert Guides redaktionell fertig, alles auf Deutsch. Der Rest ist Stammdaten,
kein veröffentlichungsreifer Inhalt.

**Korrektur gegenüber einer früheren Fassung:** Alle 42.000 Spiele × 3 Sprachen
beim Deploy vorzurechnen (rund 126.000 HTML-Dateien) ist **nicht** der Plan.
Vorab gebaut und indexiert werden nur Guides mit Inhalt. Der Rest bleibt in
Supabase und ist über die Suche erreichbar, ohne eine eigene URL zu bekommen.

---

## 1. Wie die Daten auf die Seite kommen — und wann

### Das Verständnis stimmt

Die Beschreibung „Daten bleiben in Supabase, laufen zu Vercel und von dort eine Stufe
weiter. Dort wird die ganze Seite geladen und die User oder Google sehen dann das
komplette Teil" ist im Kern richtig. Genau das ist der Unterschied zu heute.

**Heute (SPA):** Vercel liefert an jeden Besucher dieselbe, praktisch leere `index.html`
aus. Erst im Browser startet React, fragt Supabase ab und baut die Seite zusammen.
Google bekommt also zuerst eine leere Hülle. Google kann JavaScript zwar ausführen, tut
das aber verzögert, unzuverlässig und nur bei Seiten, die es für wichtig hält. Für ein
Projekt, das von Suchtraffic lebt, ist das ein vermeidbares Risiko.

**Ziel:** Vercel liefert bereits fertiges HTML aus — mit Titel, Beschreibung, Überschrift,
Beschreibungstext und Trophäenliste im Quelltext. Google sieht den Inhalt sofort,
Nutzer sehen die Seite schneller. React übernimmt danach die Interaktion
(Abhaken, Filtern, Login). Das ist die „eine Stufe weiter", die im Zitat gemeint ist.

### Build-Zeit oder Anfrage-Zeit — der eigentliche Unterschied

| | **Build-Zeit** (Prerender / SSG) | **Anfrage-Zeit** (SSR / ISR) |
|---|---|---|
| Wann entsteht das HTML? | Einmal beim Deployment | Bei jedem Seitenaufruf (bzw. periodisch neu) |
| Wie kommt neuer Inhalt live? | Erst nach einem neuen Build | Sofort bzw. nach Ablauf einer Frist |
| Geschwindigkeit für den Nutzer | Maximal (fertige Datei vom CDN) | Sehr gut, aber Server muss arbeiten |
| Laufende Kosten | Praktisch null | Rechenzeit pro Aufruf |
| Aufwand | Ein Build-Skript | Framework mit Server-Rendering (Next.js) |

Bildlich: Build-Zeit ist ein gedrucktes Buch — schnell zu lesen, aber für eine Korrektur
muss neu gedruckt werden. Anfrage-Zeit ist ein Ausdruck auf Zuruf — immer aktuell, aber
jedes Mal ein bisschen Arbeit.

### Entscheidung: Nur fertige Guides vorab bauen — Deutsch zuerst

Für die **fertigen Guides** ist Build-Zeit die richtige Wahl:

- **Guides ändern sich selten.** Ein fertiger Trophäen-Guide zu Elden Ring ist in zwei
  Jahren noch derselbe. Den einmal als HTML zu erzeugen und vom CDN auszuliefern, ist
  günstiger, als ihn bei jedem Google-Besuch neu zusammenzubauen.
- **Trophäenlisten sind lang.** Genau solche Seiten will man einmal erzeugen und cachen.
- **Nutzerabhängige Teile sind nicht SEO-relevant.** Abgehakte Trophäen gehören nicht
  ins statische HTML. Die lädt React wie bisher im Browser nach.

Für die **42.000 Stammdaten-Zeilen** gilt das Gegenteil: Sie haben oft keinen
Beschreibungstext, keinen Guide, und sollen zum Start nicht indexiert werden. Sie
vorab zu bauen wäre Verschwendung und würde den Deploy sprengen.

Zum Livegang additionally: **nur Deutsch**. Englisch und Spanisch kommen später über
dieselben JSONB-Felder — das URL-Segment `/{sprache}/` kann schon reserviert sein,
aber es müssen keine leeren Übersetzungen gebaut werden.

### So wird eine Aktualisierung ausgelöst

Damit „braucht einen Rebuild" kein manueller Vorgang wird, wird das automatisiert:

1. In Supabase wird ein **Database Webhook** auf `public.games` (und die Trophäen-/
   Guide-Tabellen) für INSERT/UPDATE eingerichtet.
2. Dieser Webhook ruft einen **Vercel Deploy Hook** auf — eine feste URL, die ein neues
   Deployment startet.
3. Dazwischen gehört eine **Entprellung** (Debounce): nicht jeder einzelne Datenbank-Schreibvorgang
   soll einen Build auslösen. Praktisch: eine kleine Serverless-Funktion, die den Deploy
   Hook höchstens alle x Minuten weiterreicht, oder ein geplanter Build (z. B. stündlich/
   nächtlich), der nur läuft, wenn sich etwas geändert hat.
4. Vercel baut, prerendert alle Seiten neu und schaltet das Ergebnis live. Bis dahin
   bleibt die alte Version online — es gibt keine Downtime.

Realistische Verzögerung zwischen Redaktions-Änderung und Livegang: wenige Minuten.
Für Trophäen-Guides ist das völlig unkritisch.

*Falls später doch Sekunden-Aktualität nötig wird, ist das On-Demand-Revalidierung —
die gibt es sinnvoll aber erst mit Next.js (Abschnitt 3).*

---

## 2. Umsetzung im Bestand — ohne Next.js

**Ja, das geht.** Und zwar ohne den bestehenden Code umzubauen.

### Der Weg konkret

Nach `vite build` läuft ein zusätzliches Node-Skript (z. B. `scripts/prerender.mjs`),
das folgendes tut:

1. **Supabase abfragen — gefiltert auf veröffentlichungsreife Guides.**
   Kriterium (vor dem ersten Lauf festlegen und im Skript hart kodieren), z. B.
   `status` ungleich leer / ungleich `COMING_SOON`, oder „es existiert mindestens eine
   Zeile in `game_guides` bzw. `game_achievements`". Die 42.000 Stammdaten-Zeilen
   ohne Inhalt werden **nicht** angefasst. `src/lib/gameQueries.js`, `gameModel.js`
   und `gameSchema.js` laufen unverändert in Node.
2. **Pro fertigem Guide eine HTML-Datei schreiben**, zum Start nur `de`:
   `dist/de/ps5/elden-ring/index.html`. Weitere Sprachen erst, wenn Übersetzungen
   tatsächlich existieren.
3. **Basis ist die gebaute `dist/index.html`** — dieselben Script- und CSS-Referenzen,
   nur mit ersetztem `<head>` und befülltem `<div id="root">`.
4. **Echte Metadaten einsetzen:** `<title>`, `<meta name="description">`, Open-Graph-Tags
   (inkl. `og:image` = Cover), `<link rel="canonical">` auf die eigene Sprachvariante und
   `<link rel="alternate" hreflang="de|en|es|x-default">` auf die jeweils anderen.
5. **Sichtbaren Inhalt einsetzen:** H1 mit Spieltitel, der Beschreibungstext, die
   Kerndaten (Plattform, Entwickler, Trophäenzahl) und die Trophäenliste als reiner Text.
   Das ist der Inhalt, mit dem die Seite ranken soll.
6. **`sitemap.xml` und `robots.txt`** im selben Durchlauf mitschreiben — die
   URL-Liste liegt ja gerade vor.

### Werkzeuge

- **Empfohlen:** Eigenes Post-Build-Skript mit `react-dom/server` (`renderToStaticMarkup`).
  Dafür wird eine schlanke „SEO-Ansicht" der Guide-Seite gerendert — nicht die volle
  interaktive Komponente. Beim Start im Browser ersetzt React diesen Inhalt über das
  normale `createRoot`. Vorteil: keine Hydration-Konflikte, kein Umbau am bestehenden
  Code, volle Kontrolle. Zusätzlich werden die Spieldaten als JSON ins HTML eingebettet,
  damit die App beim Start nicht sofort erneut bei Supabase nachfragen muss.
- **Alternative:** [vite-plugin-ssr / Vike](https://vike.dev) oder `vite-react-ssg` — echte
  SSG-Frameworks für Vite. Mächtiger, aber sie erzwingen eine Routing-Struktur, die die
  App heute nicht hat. Das wäre ein halber Framework-Wechsel für den halben Nutzen.
  Deshalb nicht empfohlen.
- **Verworfen:** Metadaten pro Anfrage über eine Serverless-Funktion einsetzen. Das ist
  SSR light, schlechter cachebar und liefert trotzdem keinen Textinhalt im HTML.

An `vercel.json` ändert sich wenig: Vercel liefert vorhandene statische Dateien aus,
bevor Rewrites greifen. Die prerenderten Seiten werden also automatisch bevorzugt, der
bestehende Catch-All auf `/index.html` bleibt für alles andere (Profil, Suche, Login)
zuständig.

### Die Grenzen — ehrlich benannt

- **Buildzeit hängt an den *fertigen* Guides, nicht am Katalog.** Ein paar hundert
  deutsche Guide-Seiten sind unkritisch (unter einer Minute). 42.000 × 3 Sprachen
  wären ~126.000 Dateien und würden den Deploy sprengen — deshalb der Filter in
  Schritt 1. Sobald wirklich Tausende *fertige* Guides in mehreren Sprachen existieren,
  wird der Build zäh; das ist der Zeitpunkt für ISR/Next.js, nicht der Start.
- **Aktualität hängt am Build.** Zwischen Datenänderung und Livegang liegen immer ein paar
  Minuten. Solange Guides redaktionell gepflegt werden: kein Problem. Sobald Nutzer selbst
  Inhalte beitragen könnten, wäre es eins.
- **Zwei Rendering-Pfade.** Die SEO-Ansicht und die echte React-Ansicht müssen inhaltlich
  zusammenpassen. Ändert sich das Seitenlayout, muss die SEO-Ansicht mitgezogen werden.
  Das ist überschaubar, aber es ist dauerhafter Pflegeaufwand — und die häufigste Stelle,
  an der solche Lösungen über die Zeit verrotten.
- **Nur Guide-Seiten profitieren zunächst.** Suche, Profil und interaktive Bereiche bleiben
  reine SPA. Das ist richtig so — die sollen ohnehin nicht indexiert werden.

**Fazit:** Für den Start ist das der klar richtige Weg. Aufwand: wenige Tage, kein Risiko
für den bestehenden Code, sofort messbarer SEO-Nutzen.

---

## 3. Wann sich Next.js lohnt — und was es kostet

### Was mitzieht

`src/lib/` ist framework-unabhängig: `gameSchema.js` (Tabellen- und Feldnamen),
`gameQueries.js` (Supabase-Abfragen), `gameModel.js` (Sprachauflösung),
`translationUtils.js`. Diese Module kennen weder React noch das Routing und laufen unter
Next.js praktisch unverändert weiter. Auch die Seiten-Komponenten (`GameDetailPage`,
`HomePage`, …) und das Tailwind-Setup ziehen weitgehend mit. Das ist die gute Nachricht
und ein Verdienst der aktuellen Struktur.

### Was neu gebaut werden müsste

**1. `src/app.jsx` (518 Zeilen) — der größte Brocken.**
Die Datei ist heute Router, Datenlader und Zustandsspeicher in einem: Sie liest die URL,
schaltet über `currentView` zwischen zehn Ansichten um, lädt Spiel, Trophäen und
Guide-Inhalte selbst und reicht rund 20 Props an `GameDetailPage` weiter. Unter Next.js
wird daraus eine Ordnerstruktur mit je einer Seite pro Route, und jede Seite lädt ihre
eigenen Daten — serverseitig. Das ist keine Portierung, sondern ein Umbau des Datenflusses.
Realistisch: **1,5 bis 3 Wochen**, inklusive Wartungsmodus-Logik, Beta-Route und QA-Admin.

**2. `src/lib/routeUtils.js` — klein und unkritisch.**
`writeAppPath`, `navigateToHome`, `navigateToGame`, `getViewFromPath` und der
`popstate`-Listener entfallen ersatzlos; Next.js macht das selbst. `gameGuidePath()` bleibt
als URL-Erzeuger. Die Aufrufer müssen auf `<Link>` und `useRouter()` umgestellt werden —
mechanisch, aber an vielen Stellen. Realistisch: **2 bis 3 Tage**.

**3. Supabase-Session auf Cookie-Basis (`@supabase/ssr`) — der heikelste Teil.**
Heute liegt die Session im Browser-Speicher. Damit der Server weiß, wer eingeloggt ist,
muss sie in Cookies wandern: getrennte Clients für Browser und Server, eine Middleware,
die Tokens erneuert, und angepasste OAuth-Rückläufe. Betroffen sind `trophyBaseAuth.js`,
`handleSocialLinkRedirect`, der Wartungs-Bypass und jede Stelle mit `supabase.auth`.
Auth-Fehler fallen erst spät auf und treffen echte Nutzer. Realistisch: **1 bis 2 Wochen
inklusive Tests**.

**Dazu kommt:** der zweite Entrypoint `admin.html` muss zu einer eigenen Route werden,
`/api/geo-locale` und die Vite-Dev-Middleware zu Route Handlern, `vercel.json` entfällt
weitgehend.

**Gesamtschätzung: 4 bis 8 Wochen** für eine Migration mit voller Funktionsgleichheit.
Erschwerend: Das Projekt ist reines JavaScript ohne TypeScript — bei einem Umbau dieser
Größe fehlt das Sicherheitsnetz, das sonst die Hälfte der Fehler vor dem Deployment
abfängt. Der Aufwand steckt weniger im Schreiben als im Nachtesten.

### Empfehlung: jetzt nicht wechseln

Next.js löst Probleme, die TrophyBase heute nicht hat. Der Nutzen für SEO ist bei
selten wechselnden Guides fast identisch mit dem der Prerender-Lösung — Google sieht in
beiden Fällen fertiges HTML. Vier bis acht Wochen vor dem Livegang in einen
Framework-Wechsel zu stecken, verzögert den Start ohne SEO-Gewinn.

### Woran man den richtigen Zeitpunkt erkennt

Gewechselt wird, wenn **eines** dieser Signale eintritt:

- Der Build dauert länger als **10 Minuten**. Das hängt an der Zahl *prerenderter
  Guide-Seiten*, nicht an den 42.000 Stammdaten-Zeilen. Grober Richtwert: mehrere
  Tausend fertige Guides in mehreren Sprachen.
- Inhalte müssen **innerhalb von Sekunden** live sein — etwa weil Nutzer oder Community
  Guides bearbeiten.
- Es entstehen **viele Seiten mit wenig Traffic** (Long Tail), für die sich ein
  Vorab-Build nicht mehr lohnt. Genau dafür ist ISR gebaut: erste Anfrage rendert,
  danach wird gecacht.
- **Personalisierte Inhalte werden SEO-relevant** oder es wird echtes serverseitiges
  Rendern für eingeloggte Nutzer gebraucht.

Bis dahin gilt: Die Prerender-Lösung ist kein Wegwerf-Code. Sie zwingt dazu, das
URL-Schema, die Sprachvarianten und die Metadaten sauber zu definieren — und genau diese
Arbeit zieht bei einer späteren Migration vollständig mit um.

---

## 4. Reihenfolge

### Zwingend vor dem Livegang

1. **Launch-Schnitt:** Deutsch, ohne Pflicht-Login, nur Guides mit Inhalt. Wartungsmodus
   aus. Trophäen-Häkchen lokal speichern (heute überleben sie einen Reload nicht —
   Walkthrough-Häkchen schon). Login, Profil, PSN, Übersetzungen danach.
2. **URL-Schema:** SPA-Routing `/{sprache}/{konsole}/{spiel-slug}` plus
   `games.slug` (Trigger in `supabase/games_slug.sql`) und Laufzeit-Tags
   (canonical + hreflang) sind umgesetzt. HTTP-301 und fertiges HTML im
   Quelltext folgen mit dem Prerender.
3. **Prerender-Skript** nur für diese Guides, zum Start nur `de`: Metadaten plus
   sichtbarer Inhalt (H1, Beschreibung, Trophäenliste).
4. **`robots.txt` und `sitemap.xml`** — nur die prerenderten URLs. Admin, Profil,
   Suche und leere Stammdaten-Spiele bleiben draußen.
5. **404 sauber behandeln:** Unbekannte URLs dürfen nicht mit Status 200 und leerer
   SPA-Hülle antworten (Soft-404). Eine echte 404-Seite konfigurieren.
6. **Supabase-Webhook → Vercel Deploy Hook** inklusive Entprellung, damit Inhaltspflege
   ohne manuelles Deployment live geht.
7. **Verifizieren:** In der Google Search Console per URL-Prüfung kontrollieren, dass das
   ausgelieferte HTML tatsächlich Titel, Beschreibung und Trophäentexte enthält.

### Kann nach dem Livegang folgen

8. Strukturierte Daten (JSON-LD: `VideoGame`, `BreadcrumbList`, ggf. `FAQPage`).
9. Interne Verlinkung und Übersichtsseiten pro Konsole, Genre und Jahr.
10. Bildoptimierung für Cover (Format, Größen, Lazy Loading).
11. Core-Web-Vitals-Feinschliff.
12. Prerender auch für Übersichts- und Kategorieseiten.
13. Next.js-Migration — erst wenn eines der Signale aus Abschnitt 3 eintritt.
