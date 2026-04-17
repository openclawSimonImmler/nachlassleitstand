# Nachlassleitstand v1 MVP

Diese Version ist ein lokaler MVP für eine seriöse Plattform zur digitalen Nachlassvorsorge. Die App läuft vollständig mit Next.js App Router und einer SQLite-Datei im Projektverzeichnis.

## Start

1. `npm install`
2. `npm run dev`
3. `http://localhost:3000` öffnen

## Produktumfang

- Leitstand mit Bereitschaftsgrad, Aktivitätsprotokoll und offenen Vorgängen
- Asset-Register mit Zugriffsebenen, verantwortlichen Kontakten und Freigaberegeln
- Dokumententresor mit Sichtbarkeit, Aufbewahrung und Kurzbeschreibung
- Vertrauenspersonen mit Rollenmodell, Verifikation und Erwartungszeiten
- Anfrage-Queue mit Statuswechseln und nächstem Schritt
- Bereitschafts-Checkliste mit serverseitiger Persistenz
- Lokaler Export des gesamten Workspace als JSON

## Technischer Aufbau

- `app/page.tsx`: komplette Produktoberfläche und lokale Demo-Auth
- `app/api/*`: lokale API-Endpunkte für Assets, Kontakte, Tresor, Anfragen und Checkliste
- `lib/db.ts`: SQLite-Initialisierung, Seed-Daten und Datenzugriff
- `lib/types.ts`: zentrale Datentypen
- `data/digitalernachlass.sqlite`: wird beim ersten Start automatisch angelegt

## Demo-Hinweise

- Registrierung und Login werden nur lokal im Browser gespeichert.
- Alle fachlichen Daten liegen in SQLite und werden beim Start mit Beispielinhalten befüllt.
- Änderungen an Anfrage-Status und Checkliste erzeugen neue Aktivitätseinträge.
- Der Export erzeugt eine lokale JSON-Datei, keine externe Übertragung.

## Nächste sinnvolle Ausbaustufen

- serverseitig abgesicherte Auth
- Dateiupload statt reinem Dokument-Metadatensatz
- feinere Rollen- und Rechtemodelle
- PDFs oder Berichte aus dem Export ableiten
