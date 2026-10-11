# Fino

Finanz-App für das Handy. Einnahmen und Ausgaben erfassen, Fixkosten automatisch buchen, Statistik pro Monat. Alles läuft lokal auf dem Gerät: kein Konto, keine Cloud, keine Verbindung ins Internet.

## Auf dem Pixel installieren

Fino ist eine Web-App (PWA). GitHub liefert sie über **GitHub Pages** aus, Chrome installiert sie danach wie eine normale App.

**1. GitHub Pages einschalten (einmalig, am Computer oder im Browser des Handys)**

1. Diese Repo auf github.com öffnen, dann **Settings** > **Pages**.
2. Unter **Build and deployment** bei **Source** den Eintrag **Deploy from a branch** wählen.
3. Bei **Branch** `main` und `/ (root)` wählen, dann **Save**.
4. Ein bis zwei Minuten warten. Oben auf der Seite erscheint die Adresse, voraussichtlich `https://jan6869.github.io/Fino/`.

> **Wichtig:** Mit einem kostenlosen GitHub-Konto funktioniert Pages nur bei **öffentlichen** Repos. Ist die Repo privat, fehlt unter Settings > Pages die Auswahl, oder GitHub verlangt einen bezahlten Plan (Pro oder Team). Dann unter **Settings** > **General** ganz unten bei **Danger Zone** auf **Change visibility** gehen und die Repo auf öffentlich stellen.
> Öffentlich ist dann nur der Programmcode. Deine Buchungen liegen nie in der Repo, sondern ausschließlich auf deinem Handy.

**2. Auf dem Pixel öffnen und installieren**

1. In **Chrome** die Adresse aus Schritt 1 öffnen.
2. Menü (drei Punkte) > **App installieren** (oder **Zum Startbildschirm hinzufügen**).
3. Fino erscheint danach als eigene App mit Symbol. Ab jetzt läuft sie auch im Flugmodus.
4. Ein langes Drücken auf das App-Symbol zeigt die Schnellaktionen **Neue Ausgabe** und **Neue Einnahme**.

## Updates

1. Geänderte Dateien in die Repo hochladen (auf `main`). GitHub veröffentlicht sie nach etwa einer Minute.
2. In `sw.js` die Zahl bei `CACHE` (`fino-v4`) und in `app.js` die Zahl bei `VERSION` gemeinsam um 1 erhöhen. Nur dann merkt das Handy, dass es eine neue Version gibt.
3. Auf dem Pixel Fino öffnen. Erscheint oben **Neue Version ist da**, auf **Neu laden** tippen. Die aktuelle Nummer steht unter **Mehr** ganz unten.

Deine Buchungen bleiben bei Updates erhalten.

## Datenschutz und Backup

- Die Buchungen liegen in der Datenbank von Chrome auf dem Gerät. Es gibt keinen Server.
- Eine Sicherheitsregel in `index.html` (`connect-src 'none'`) verbietet der App jede Verbindung ins Internet.
- **Mach regelmäßig ein Backup:** Mehr > Backup speichern. Löschst du die Browserdaten oder deinstallierst die App, sind die Buchungen weg. Mit **Backup einspielen** holst du sie zurück, auch auf einem neuen Handy.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Gerüst der App und Datenschutz-Regel |
| `style.css` | Design |
| `app.js` | Logik, Speicher, Ansichten |
| `sw.js` | Offline-Modus |
| `manifest.webmanifest` | App-Name, Symbol, Schnellaktionen |
| `fonts/`, `icons/` | Schrift Outfit (lokal eingebettet) und App-Symbole |
| `.nojekyll` | Sagt GitHub Pages, die Dateien unverändert auszuliefern |

## Lokal testen

Im Ordner `python3 -m http.server 8000` starten und `http://localhost:8000` öffnen.
