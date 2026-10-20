# Entwicklung

Technische Doku für alle, die an Alvea arbeiten. Für Installation und Bedienung siehe [README](../README.md).

## Stack

| Bereich | Technik |
|---|---|
| Backend | Node.js 24, Express 4, TypeScript, Zod |
| Datenbank | SQLite über better-sqlite3 (WAL-Modus) |
| Frontend | React 18, Vite 6, Tailwind CSS 3, i18next |
| PDF / Excel | PDFKit / ExcelJS |
| Logging | Pino mit täglicher Rotation (pino-roll), 30 Dateien |
| Barcode | @zxing/browser |
| Installer | Inno Setup 6/7, WinSW (Windows-Dienst), mitgelieferte node.exe |

## Projektstruktur

```
backend/
  src/server.ts          Express-App: Middleware, Routen, SPA-Auslieferung
  src/config/db.ts       DB-Verbindung, ALLE Migrationen (v1 … v46), ensureWaesche()
  src/config/paths.ts    Zentrale Pfade (DB, Uploads, Logs, Frontend) + Programmversion
  src/routes/*.ts        Eine Datei pro API-Bereich (export default router)
  src/routes/system.ts   Version + Update über GitHub-Releases
  src/scripts/init-db.ts Migrationen + Grunddaten + Admin-Nutzer (Erstinstallation)
  src/types/index.ts     Permission-Typ und ALL_PERMISSIONS
frontend/
  src/pages/             Seiten; Verwaltungs-Tabs unter pages/admin/
  src/contexts/          Auth, Module, Raumbuch, Theme, Toast, Offline
installer/
  alvea.iss              Inno-Setup-Skript (Assistent, Dienst, Deinstallation)
  build.ps1              Baut Frontend + Backend und erzeugt das Setup
  files/configure.js     Einrichtung nach dem Kopieren (Konfiguration, Migration, init-db, Update-Aufgabe, Firewall)
  files/update.ps1       Updater (GitHub-Releases → Setup still ausführen)
  files/alvea-service.xml  Dienst-Definition (WinSW)
.github/workflows/
  ci.yml                 Build-Check bei Push/PR
  release.yml            Tag vX.Y.Z → Setup bauen → GitHub-Release
```

## Lokal entwickeln

```bash
cd backend
npm install
cp .env.example .env      # JWT_SECRET setzen
npm run init-db           # Migrationen + Grunddaten + admin@alvea.local / admin123
npm run dev               # http://localhost:37843

cd ../frontend
npm install
npm run dev               # http://localhost:5173, /api → Backend
```

## Tests

```bash
cd backend
npm test
```

Die Backend-Tests (`backend/src/__tests__/`, Jest + Supertest) starten die App ohne Port gegen eine frische SQLite-Datenbank im Temp-Ordner (`setup.ts`) und legen ihre Testdaten selbst über die API an (`helpers.ts`: Haus, Station A und B, Pflege- und Reinigungskräfte je Station). Abgedeckt sind u. a.:

- Anmeldung, Token-Prüfung, Versionsvergleich
- kompletter Ablauf einer Bettenaufbereitung inkl. Bettstatus und Barcode beim Abschluss
- Datenisolation zwischen Stationen (Aufträge sehen, anlegen, annehmen, ändern; Rücksendungen, Begleitschein)
- Rechte für Verwaltungsfunktionen, Einstellungen ohne Backup-Daten
- Migrationen: neue Datenbank, Wiederholbarkeit, Update einer 1.0.0-Datenbank

Die Tests laufen in GitHub Actions bei jedem Push (`ci.yml`) und vor jedem Release (`release.yml`) – ein Release mit roten Tests wird nicht gebaut. Neue Funktionen bitte mit Tests ergänzen; neue Migrationen erhöhen `LATEST` in `migrations.test.ts`.

## Datenbank-Regeln

Diese Regeln stammen aus realen Fehlern – bitte einhalten:

- `db/init.sql` ist leer. Das Schema entsteht **ausschließlich** durch die Migrationen in `backend/src/config/db.ts`.
- Neue Migrationen bekommen die nächste Versionsnummer und sind **idempotent** (`CREATE TABLE IF NOT EXISTS`, Spalten über `col()` ergänzen, Indizes über `safeIndex()`).
- `audit_log.id` ist `INTEGER PRIMARY KEY AUTOINCREMENT`, keine UUID.
- `announcements.created_by` speichert `user.sub` (UUID), nicht die E-Mail.
- Joins auf `houses`, `buildings`, `areas`, `rooms` immer als `LEFT JOIN`. Eine Tabelle `stations` gibt es nicht – Stationen sind `areas`.
- Die `tasks`-Tabelle aus v4 muss alle später benötigten Spalten von Anfang an haben; Rebuild-Migrationen (v15 `beds`, v17 `tasks`) haben Guards für fehlende Spalten.
- `init-db` führt `migrate()` in try/catch aus – der Admin-Nutzer wird immer angelegt.

## Architektur-Regeln

- `express-async-errors` ist nicht installiert: Fehler in async-Handlern mit try/catch abfangen.
- `@types/express` bleibt auf v4 (v5 ändert die Typen von `req.params`).
- Erlaubte Settings-Schlüssel werden in `routes/settings.ts` gepflegt (Whitelist).
- **Neue Berechtigung** an drei Stellen ergänzen: `backend/src/types/index.ts` (`Permission` + `ALL_PERMISSIONS`), `frontend/src/contexts/AuthContext.tsx` und die Admin-Liste in `ensureWaesche()` (`db.ts`), die bei jedem Start die Administrator-Rolle aktualisiert.
- **IDOR:** Einzelabrufe (`GET /:id`) und davon abgeleitete Endpunkte (PDF, Anhänge) prüfen Besitzer bzw. Scope des anfragenden Nutzers – nicht nur die Listenansicht.
- Datei-/Ordnerpfade nie selbst zusammensetzen, sondern aus `config/paths.ts` nehmen.
- Excel-Import: Sheet mit den meisten Spalten in Zeile 1 verwenden; neue Zieltabellen im Typ `TableName` (`routes/import.ts`) ergänzen.

## Frontend-Regeln

- Dynamische Tailwind-Klassen funktionieren nicht – Farben über CSS-Variablen: `style={{ backgroundColor: "var(--brand-600)" }}`.
- Alle CSS-Variablen stehen in einem `:root`-Block in `index.css`.
- Dateien mit JSX → `.tsx`, reine Hooks/Logik → `.ts`.
- Keine `window.confirm()`/`alert()`: stattdessen `confirmDialog()`/`alertDialog()` aus `components/Dialog.tsx` (`await` nötig; `{ danger: true }` für Löschen u. ä.).
- Schriften nur lokal über `@fontsource` einbinden (`FONT_PAIRS` in `ThemeContext.tsx`), keine externen Font-Dienste.
- Formulare: Ist der Nutzer nur einer Station zugeordnet, wird sie vorausgewählt und die Auswahl ausgeblendet; Knöpfe für abgeschaltete Module ausblenden (`useModules().isActive`).
- UI-Texte und Code-Kommentare auf Deutsch.

## Konfiguration zur Laufzeit

Das Backend lädt die Konfiguration über `dotenv`. Bei Installation per Setup setzt der Dienst `DOTENV_CONFIG_PATH=<Installationsordner>\data\alvea.env`; in der Entwicklung wird `backend/.env` verwendet. Relevante Schlüssel: siehe README → Konfiguration. Zusätzlich setzt das Setup `ALVEA_HOME` (Installationsordner), woran das Backend erkennt, dass Selbst-Updates möglich sind.

## Release erstellen

1. Version in `backend/package.json` **und** `frontend/package.json` erhöhen (beide gleich), `npm install --package-lock-only` in beiden Ordnern.
2. Abschnitt `## [X.Y.Z] - JJJJ-MM-TT` im `CHANGELOG.md` anlegen – er wird zum Release-Text.
3. Handbuch neu erzeugen, falls sich Funktionen geändert haben: `pip install reportlab`, dann `python scripts/make_handbuch.py` (Version wird aus `backend/package.json` übernommen).
4. Committen, taggen, pushen:
   ```bash
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```
5. GitHub Actions (`release.yml`) baut `Alvea-Setup-X.Y.Z.exe` + `.sha256` und veröffentlicht das Release. Installierte Server sehen das Update danach unter *Verwaltung → ⬆️ Update*.

Setup lokal bauen (z. B. zum Testen):

```powershell
powershell -ExecutionPolicy Bypass -File installer\build.ps1
```

Voraussetzung ist Inno Setup (`winget install JRSoftware.InnoSetup` oder portabel nach `installer\build\tools\innosetup\`).

## Update-Ablauf im Detail

1. *Verwaltung → Update* fragt `GET /api/system/update` → GitHub-API `releases/latest` (1 h Cache).
2. „Jetzt aktualisieren“ → `POST /api/system/update` → startet die Windows-Aufgabe **„Alvea Update“** (vom Setup angelegt, läuft als SYSTEM). Der Dienst selbst kann sich nicht aktualisieren, weil er dabei gestoppt wird.
3. `update.ps1 -Unattended`: Download + SHA256-Prüfung → Dienst stoppen → DB-Sicherung → `Alvea-Setup.exe /VERYSILENT` → warten bis `/api/health` die neue Version meldet. Fortschritt in `data\update-status.json`, Protokoll in `data\logs\update.log`.
4. Das Frontend fragt währenddessen `/api/health` ab und lädt neu, sobald die neue Version antwortet.

## Docker

Es gibt einen optionalen Docker-Pfad (`Dockerfile`, `docker-compose.yml`, [DOCKER.md](../DOCKER.md)). Er ist unabhängig vom Windows-Installer und wird nicht automatisch getestet.
