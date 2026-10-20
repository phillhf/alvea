# Docker-Betrieb – Alvea

Diese Anleitung beschreibt den Betrieb als Docker-Container (Alternative zum Windows-Server-Deployment mit NSSM).

## Voraussetzungen

- Docker Engine 24+ und Docker Compose v2 (`docker compose version`)
- Ein Host mit Zugriff auf das Krankenhaus-LAN (Linux, Windows mit Docker Desktop/WSL2, oder ein gehosteter Server)

## Erststart

1. `.env.docker.example` nach `.env` kopieren und `JWT_SECRET` setzen:
   ```bash
   cp .env.docker.example .env
   # JWT_SECRET z. B. erzeugen mit:
   openssl rand -hex 32
   ```
   Den erzeugten Wert in `.env` bei `JWT_SECRET=` eintragen.

2. Container bauen und starten:
   ```bash
   docker compose up -d --build
   ```

3. Aufrufen unter `http://<server-ip>:37843`. Login mit `admin@alvea.local` / `admin123` – Passwort sofort ändern.

## Daten & Persistenz

Drei benannte Volumes überleben Container-Neustarts und -Updates:

| Volume            | Inhalt                                  |
|--------------------|------------------------------------------|
| `betten-data`       | SQLite-Datenbank                         |
| `betten-uploads`     | Hochgeladene Fotos, Anhänge, Hintergrundbilder |
| `betten-logs`        | Tägliche JSON-Logs (30 Tage Aufbewahrung)  |

Volumes ansehen: `docker volume ls | grep betten`
Volume-Pfad auf dem Host finden: `docker volume inspect betten-data`

## Update auf eine neue Version

```bash
# Neuen Code in dieses Verzeichnis kopieren/entpacken, dann:
docker compose up -d --build
```

Die Datenbank-Migrationen laufen automatisch beim Containerstart (`init-db.js` vor `server.js`). Die Volumes bleiben dabei unberührt.

## Logs ansehen

```bash
docker compose logs -f betten
```

## Healthcheck

Der Container meldet sich über `GET /api/health` als gesund. Status prüfen:

```bash
docker compose ps
```

## HTTPS / Reverse Proxy

Für den produktiven Betrieb (PWA-Offline-Modus, Kamera-Zugriff auf iOS) wird ein vorgeschalteter Reverse Proxy mit TLS empfohlen (z. B. Nginx oder Traefik), der auf Port 37843 dieses Containers weiterleitet. `CORS_ORIGIN` in `.env` dann auf die externe HTTPS-Domain setzen.

## Unterschiede zum Windows-Server-Deployment

- Kein NSSM nötig – Docker übernimmt Neustart/Watchdog (`restart: unless-stopped`)
- Kein `update.bat`/Robocopy – Updates laufen über `docker compose up -d --build`
- Backups: das `betten-data`-Volume regelmäßig sichern (z. B. `docker run --rm -v betten-data:/data -v $(pwd):/backup alpine tar czf /backup/betten-data-backup.tar.gz /data`)
