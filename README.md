# Website Projekt

Lokaler Next.js-MVP für eine deutschsprachige Plattform zur digitalen Nachlassvorsorge.

## Voraussetzungen

- Node.js 22 oder neuer

## Entwicklung

```bash
npm install
npm run dev
```

Danach die App unter `http://localhost:3000` öffnen.

## Produktion lokal testen

```bash
cp .env.example .env.local
npm run build
npm run start
```

## Stack

- Next.js App Router
- React
- SQLite über `node:sqlite`
- rein lokale Demo-Authentifizierung im Browser

## Kernfunktionen

- Dashboard mit Bereitschaftsgrad und Aktivitätsfeed
- Register für digitale Assets
- Dokumententresor
- Vertrauenspersonen und Rollen
- Anfrage-Queue mit Triage
- serverseitig persistierte Bereitschafts-Checkliste
- lokaler JSON-Export

## Veröffentlichung

Für die Veröffentlichung ist wichtig:

- `NEXT_PUBLIC_APP_URL` in `.env.local` setzen
- produktiven Build mit `npm run build` prüfen
- persistentes Dateisystem für `data/digitalernachlass.sqlite` bereitstellen
- HTTPS und Reverse Proxy vor die App setzen

Mehr dazu in `DEPLOYMENT.md`.

## Aktuelle Einschränkungen

Der aktuelle Stand ist veröffentlichbar als Demo, internes Tool oder kontrollierte Staging-Version. Für eine echte öffentliche Produktivnutzung fehlen noch:

- serverseitige Authentifizierung
- echte Rollen- und Rechtesteuerung
- Upload- und Verschlüsselungsstrategie für Dokumente
- Backup- und Restore-Konzept
