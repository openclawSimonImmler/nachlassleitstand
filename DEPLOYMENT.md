# Deployment

## Zielbild

Die App ist eine lokale Next.js-Anwendung mit SQLite. Für eine Veröffentlichung eignet sie sich am besten für:

- kleines VPS Deployment mit Node.js 22
- Docker auf eigenem Server
- interne Demo- oder Staging-Umgebung

Für klassisches serverloses Hosting ist der aktuelle SQLite-Ansatz nicht ideal, weil die Anwendung eine beschreibbare persistente Datei benötigt.

## Voraussetzungen

- Node.js 22+
- npm 10+
- Linux Server oder vergleichbare Laufzeit
- persistentes Verzeichnis für `data/digitalernachlass.sqlite`

## Empfohlene Environment Variables

Eine `.env.local` auf dem Server anlegen:

```bash
NEXT_PUBLIC_APP_URL=https://deine-domain.de
```

## Lokaler Produktionscheck

```bash
npm install
npm run build
npm run start
```

Dann unter `http://localhost:3000` testen.

## Deployment auf einem VPS

### 1. Projekt ausrollen

```bash
git clone <repo-url>
cd "Website Projekt"
npm install
cp .env.example .env.local
npm run build
```

### 2. App starten

```bash
npm run start
```

Standardmäßig läuft Next.js auf Port 3000.

### 3. Reverse Proxy davor setzen

Empfohlen ist Nginx oder Caddy mit HTTPS-Termination.

Wichtig:

- `/` an Next.js weiterleiten
- WebSocket Support aktiv lassen
- HTTPS erzwingen

## Systemd Beispiel

```ini
[Unit]
Description=Nachlassleitstand
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/nachlassleitstand
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Vor Livegang prüfen

- `NEXT_PUBLIC_APP_URL` korrekt gesetzt
- `npm run build` erfolgreich
- Schreibrechte für `data/`
- Reverse Proxy mit HTTPS aktiv
- Backup für SQLite-Datei vorhanden
- Demo-Inhalte vor echtem Einsatz prüfen oder bereinigen
- Hinweis ergänzen, dass Login aktuell nur browserlokal gespeichert wird

## Aktuelle Produktgrenzen

Für eine echte öffentliche Produktion sollten als Nächstes ergänzt werden:

- serverseitige Authentifizierung statt Browser-only Login
- Rollen- und Rechtemodell mit echter Zugriffskontrolle
- Verschlüsselung und Upload-Handling für Dokumente
- Backup- und Restore-Strategie
- Audit- und Security-Review
