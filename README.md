# Fino

Finanz-App für das Handy. Einnahmen und Ausgaben erfassen, Fixkosten automatisch buchen, Statistik pro Monat. Alles läuft lokal auf dem Gerät: kein Konto, keine Cloud, keine Verbindung ins Internet.

**Diese Branch (`apple-design`) enthält Version 5 im neuen Apple-Design.** Die ältere Version 4 (Material-Design) liegt unverändert auf der Branch `main`. Beide Versionen speichern ihre Daten im selben Format und verstehen sich gegenseitig, ein Wechsel hin und zurück verliert nichts.

## Auf dem Pixel installieren

Fino ist eine Web-App (PWA). GitHub liefert sie über **GitHub Pages** aus, Chrome installiert sie danach wie eine normale App.

**1. GitHub Pages einschalten (einmalig, am Computer oder im Browser des Handys)**

1. Diese Repo auf github.com öffnen, dann **Settings** > **Pages**.
2. Unter **Build and deployment** bei **Source** den Eintrag **Deploy from a branch** wählen.
3. Bei **Branch** `apple-design` (neues Design) oder `main` (altes Design) und `/ (root)` wählen, dann **Save**.
4. Ein bis zwei Minuten warten. Oben auf der Seite erscheint die Adresse, voraussichtlich `https://jan6869.github.io/Fino/`.

> **Wichtig:** Mit einem kostenlosen GitHub-Konto funktioniert Pages nur bei **öffentlichen** Repos. Ist die Repo privat, fehlt unter Settings > Pages die Auswahl, oder GitHub verlangt einen bezahlten Plan (Pro oder Team). Dann unter **Settings** > **General** ganz unten bei **Danger Zone** auf **Change visibility** gehen und die Repo auf öffentlich stellen.
> Öffentlich ist dann nur der Programmcode. Deine Buchungen liegen nie in der Repo, sondern ausschließlich auf deinem Handy.

**2. Auf dem Pixel öffnen und installieren**

1. In **Chrome** die Adresse aus Schritt 1 öffnen.
2. Menü (drei Punkte) > **App installieren** (oder **Zum Startbildschirm hinzufügen**).
3. Fino erscheint danach als eigene App mit Symbol. Ab jetzt läuft sie auch im Flugmodus.
4. Ein langes Drücken auf das App-Symbol zeigt die Schnellaktionen **Neue Ausgabe** und **Neue Einnahme**.

## Zwischen altem und neuem Design wechseln

Der Wechsel geschieht nur über die Einstellung bei GitHub, ohne Code:

1. **Vorher ein Backup machen:** in Fino unter **Mehr** > **Backup speichern**.
2. Auf github.com: **Settings** > **Pages** > bei **Branch** `apple-design` (neu) oder `main` (alt) wählen > **Save**.
3. Ein bis zwei Minuten warten, dann Fino auf dem Handy öffnen. Oben erscheint **Neue Version ist da**. Auf **Neu laden** tippen.
4. Unter **Mehr** ganz unten steht die Versionsnummer: **5** = Apple-Design, **4** = Material-Design.

Die Buchungen bleiben dabei auf dem Handy erhalten. Das funktioniert in beide Richtungen, weil die App an der Datei `sw.js` erkennt, dass sich etwas geändert hat, und nicht an der Höhe der Versionsnummer.

## Updates

1. Geänderte Dateien in die Repo hochladen. GitHub veröffentlicht sie nach etwa einer Minute.
2. In `sw.js` die Zahl bei `CACHE` (`fino-v5`) und in `app.js` die Zahl bei `VERSION` gemeinsam um 1 erhöhen. Nur dann lädt das Handy alle Dateien frisch.
3. Auf dem Pixel Fino öffnen. Erscheint oben **Neue Version ist da**, auf **Neu laden** tippen.

## Datenschutz und Backup

- Die Buchungen liegen in der Datenbank von Chrome auf dem Gerät. Es gibt keinen Server.
- Eine Sicherheitsregel in `index.html` (`connect-src 'none'`) verbietet der App jede Verbindung ins Internet.
- **Mach regelmäßig ein Backup:** Mehr > Backup speichern. Löschst du die Browserdaten oder deinstallierst die App, sind die Buchungen weg. Mit **Backup einspielen** holst du sie zurück, auch auf einem neuen Handy.

## Das Apple-Design

- Systemfarben, gruppierte Listen, große Titel, die beim Scrollen in die Leiste wandern.
- Schwebende Glas-Leiste mit den vier Bereichen und separatem Plus-Knopf. Glas, Hinweise und Dialoge respektieren die Systemeinstellungen für weniger Transparenz und mehr Kontrast.
- Bewegung per Feder statt fester Dauer. Alles lässt sich jederzeit unterbrechen: Blätter folgen dem Finger, übernehmen beim Loslassen dessen Geschwindigkeit und rasten dort ein, wohin die Geste zeigt.
- Zurück-Geste von Android: schließt zuerst Hinweis oder Blatt, dann die Unterseite.
- Statistik: zwischen den Monaten wischen.
- Hell, Dunkel oder automatisch. Respektiert die Einstellung „Bewegung reduzieren“ und die Schriftgröße des Systems.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Gerüst der App und Datenschutz-Regel |
| `style.css` | Design |
| `app.js` | Logik, Speicher, Ansichten, Bewegung |
| `sw.js` | Offline-Modus |
| `manifest.webmanifest` | App-Name, Symbol, Schnellaktionen |
| `fonts/`, `icons/` | Schrift Inter (lokal eingebettet, SIL Open Font License) und App-Symbole |
| `.nojekyll` | Sagt GitHub Pages, die Dateien unverändert auszuliefern |

## Lokal testen

Im Ordner `python3 -m http.server 8000` starten und `http://localhost:8000` öffnen.
