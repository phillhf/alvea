<p align="center">
  <img src="frontend/public/icons/icon-192.png" width="96" alt="Alvea">
</p>

<h1 align="center">Alvea</h1>

<p align="center">
  Digitale Krankenhaus-Logistik: Bettenaufbereitung, Zimmerreinigung, Sauerstoff, Rücksendungen, Wäsche und Spinde – in einer Web-App für PC, iPad und Smartphone.
</p>

<p align="center">
  <a href="https://github.com/phillhf/alvea/releases/latest"><img src="https://img.shields.io/github/v/release/phillhf/alvea?label=Version" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Lizenz-MIT-green.svg" alt="MIT"></a>
  <img src="https://img.shields.io/badge/Windows%20Server-2019%2B-blue" alt="Windows Server">
</p>

---

## Inhalt

- [Funktionen](#funktionen)
- [Installation](#installation)
- [Update](#update)
- [Umstieg von OpenClinic](#umstieg-von-openclinic)
- [Erste Schritte](#erste-schritte)
- [Rollen & Berechtigungen](#rollen--berechtigungen)
- [Konfiguration](#konfiguration)
- [Datensicherung](#datensicherung)
- [Sicherheit](#sicherheit)
- [Häufige Fragen](#häufige-fragen)
- [Entwicklung](#entwicklung)
- [Lizenz](#lizenz)

---

## Funktionen

Alle Module lassen sich unter **Verwaltung → 🧩 Module** einzeln ein- und ausschalten. Die Navigation passt sich automatisch an.

| Modul | Beschreibung |
|---|---|
| 🛏️ **Bettenaufbereitung (dezentral)** | Aufträge auf Station, Transport-Flow (unterwegs → angekommen → in Bearbeitung), Normal- oder Infektiösmodus mit Erreger-Auswahl, Checklisten, Fotos, Prioritätsscore |
| 🏥 **Bett-Zentral** | Zentrale Aufbereitung mit Barcode-Pflicht, ISO-Kennzeichnung und frei konfigurierbaren Desinfektionsmaßnahmen |
| 🧹 **Scheuer-Wisch (Zimmerreinigung)** | Standardreinigung und Schlussdesinfektion mit Erreger-Auswahl |
| 🔧 **Instandsetzung** | Defektmeldungen für Betten, Board-Ansicht, Bettenstamm mit Prüfterminen (P&W) |
| 💨 **Sauerstofftransport** | Flaschenlogistik, Lagerbestand, Flaschentypen |
| 📦 **Rücksendungen** | Station meldet → Lager → Einkauf → Abschluss, Begleitschein als PDF, Anhänge, Auswertung |
| 🛏 **Kissen & Bettdecken** | Wäsche-Anfragen der Stationen |
| 🔐 **Spindverwaltung** | Spinde, Anfragen, Vergabe und Historie |
| 📢 **Meldungen** | Ankündigungen mit Gültigkeitszeitraum und Archiv |
| 💬 **Stations-Chat** | Gemeinsamer Chat für alle Stationen |
| 📊 **Berichte** | Stationsbericht, Bett-Reisehistorie, Zentral-Tagesbericht, Rücksendungen – jeweils als PDF |
| 🗺️ **Raumbuch** | Haus → Gebäude → Station/Bereich → Raum → Stellplatz, inkl. Excel-Import |

Außerdem: Rollen mit 19 Einzelberechtigungen und Bereichs-Scope, Barcode-Scanner per Kamera, Design-Anpassung (Farben, Schriften, Hintergrund), automatische Backups auf Netzlaufwerk, Audit-Log, Offline-Anzeige (PWA).

Ausführliche Anleitung für Anwender und Administratoren: **[Benutzer- und Installationshandbuch (PDF)](docs/Alvea_Benutzerhandbuch.pdf)**.

Ausführliche Anleitung für Anwender und Administratoren: **[Benutzer- und Installationshandbuch (PDF)](docs/Alvea_Benutzerhandbuch.pdf)**.

---

## Installation

**Voraussetzungen:** Windows Server 2019 oder neuer (bzw. Windows 10/11, 64 Bit), Administratorrechte. Node.js oder andere Software wird **nicht** benötigt – alles ist im Setup enthalten.

1. Neuestes **`Alvea-Setup-x.y.z.exe`** von der [Release-Seite](https://github.com/phillhf/alvea/releases/latest) herunterladen.
2. Als Administrator ausführen. Der Assistent fragt:
   - **Installationsordner** (Standard: `C:\Program Files\Alvea`)
   - **Port** (Standard: `37843`)
   - optional: Daten einer **bestehenden OpenClinic-Installation** übernehmen
   - optional: Port in der **Windows-Firewall** freigeben
3. Fertig. Alvea läuft als Windows-Dienst **„Alvea“** (startet automatisch mit dem Server) und ist erreichbar unter:

```
http://<Servername oder IP>:<Port>
```

**Erster Login:** `admin@alvea.local` / `admin123` – Passwort danach sofort unter *Profil* ändern.

Im Startmenü unter **Alvea** gibt es Verknüpfungen zum Öffnen, zur Update-Suche, zur Konfiguration und zu den Protokollen.

### Ordnerstruktur

```
C:\Program Files\Alvea\
├── app\          Programmdateien (werden bei jedem Update ersetzt)
├── node\         mitgelieferte Node.js-Laufzeit
├── service\      Windows-Dienst (WinSW)
├── data\         ← ALLE Daten: Datenbank, Uploads, Logs, Backups, Konfiguration
│   ├── alvea.env
│   ├── alvea.sqlite
│   ├── uploads\
│   ├── logs\
│   └── backups\
└── update.ps1
```

`data\` wird von Updates und auch von der Deinstallation **nie** gelöscht.

### Unbeaufsichtigte Installation

```cmd
Alvea-Setup-1.0.0.exe /VERYSILENT /DIR="D:\Alvea" /PORT=8080
```

---

## Update

Alvea aktualisiert sich direkt aus den [GitHub-Releases](https://github.com/phillhf/alvea/releases).

**In der Weboberfläche:** *Verwaltung → ⬆️ Update* zeigt installierte und neueste Version samt Änderungen. **„Jetzt aktualisieren“** startet das Update; die Seite lädt sich nach 1–3 Minuten automatisch mit der neuen Version neu.

**Auf dem Server:** Startmenü → *Alvea → Nach Updates suchen*.

Ablauf eines Updates:

1. Neuestes Release abfragen, Setup + SHA256-Prüfsumme herunterladen und prüfen
2. Dienst stoppen, Datenbank nach `data\backups\vor-update-<Version>_<Zeit>\` sichern
3. Setup unbeaufsichtigt ausführen (Port und Einstellungen bleiben erhalten)
4. Dienst starten, Datenbank-Migrationen laufen automatisch
5. Prüfen, ob die neue Version antwortet

Protokoll: `data\logs\update.log`. Der Server braucht dafür Internetzugriff auf `api.github.com` und `github.com`. Ohne Internet: neues Setup manuell herunterladen und ausführen – das ist gleichwertig.

---

## Umstieg von OpenClinic

Alvea ist der Nachfolger von *OpenClinic* (davor *Betten & Entlassreinigung*). Beim ersten Setup erkennt der Assistent eine laufende OpenClinic-Installation automatisch und schlägt deren Ordner vor. Übernommen werden:

- die Datenbank (alle Aufträge, Nutzer, Einstellungen)
- hochgeladene Fotos, Anhänge und Hintergrundbilder
- der Anmeldeschlüssel (`JWT_SECRET`) – angemeldete Nutzer bleiben angemeldet

Der alte Dienst wird gestoppt und **deaktiviert, aber nicht gelöscht**. Der alte Ordner bleibt unverändert. Wenn alles läuft, kann er später entfernt werden (`nssm remove OpenClinic confirm`, Ordner löschen).

Hinweis: Ein unter *Verwaltung → 🎨 Design* gespeicherter App-Name „OpenClinic“ bleibt erhalten und muss dort ggf. angepasst werden. Der bisherige Admin-Login (`admin@openclinic.local`) gilt weiter.

---

## Erste Schritte

Unter **Verwaltung** in dieser Reihenfolge:

1. **Haus** und ggf. **Gebäude** anlegen
2. **Stationen/Bereiche** anlegen
3. **Räume** und **Stellplätze/Betten** anlegen – oder alles per **Excel-Import**
4. **Rollen** prüfen bzw. anlegen
5. **Mitarbeiter** anlegen und Stationen/Bereiche zuweisen
6. Nicht benötigte **Module** deaktivieren

---

## Rollen & Berechtigungen

Rollen werden frei unter *Benutzer & Rollen* konfiguriert. Jede Rolle erhält eine Auswahl dieser Berechtigungen:

| Berechtigung | Zugriff |
|---|---|
| `bettenaufbereitung` | Bettenaufbereitung dezentral |
| `bettenaufbereitung_zentral` | Bett-Zentral |
| `zimmerreinigung` | Scheuer-Wisch |
| `stationspersonal` | Meine Station (Aufträge, Rücksendungen, Anfragen der eigenen Station) |
| `auftraege_erstellen` | Aufträge anlegen |
| `dashboard` | Schichtleiter-Dashboard |
| `berichte` | Berichte |
| `betten_reparatur` | Instandsetzung |
| `bettenstamm` | Bettenstamm |
| `betten_pw` | Prüfung & Wartung |
| `sauerstofftransport` | Sauerstofftransport |
| `lager` | Lager (Rücksendungen, O₂-Lager) |
| `waesche` | Kissen & Bettdecken |
| `spindverwaltung` | Spindverwaltung |
| `meldungen` | Meldungen erstellen und bearbeiten |
| `chat` | Stations-Chat |
| `raumbuch` | Raumbuch bearbeiten |
| `benutzerverwaltung` | Mitarbeiter, Rollen, Teams |
| `verwaltung` | Vollzugriff Verwaltung (inkl. Update, Backup, Design) |

**Sichtbarkeit (Scope):** Stationszuweisung → Bereichszuweisung → Team-Bereiche. Nutzer mit `verwaltung` sehen alles. Zentral-Aufträge sind für alle mit `bettenaufbereitung_zentral` sichtbar.

---

## Konfiguration

Die Konfiguration steht in `data\alvea.env` (Startmenü → *Alvea → Konfiguration bearbeiten*). Nach Änderungen den Dienst **Alvea** neu starten (`services.msc` oder `net stop Alvea && net start Alvea`).

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `PORT` | `37843` | Port der Weboberfläche |
| `HOST` | `0.0.0.0` | Netzwerk-Interface (`127.0.0.1` = nur lokal, z. B. hinter Reverse-Proxy) |
| `JWT_SECRET` | zufällig | Signaturschlüssel für Logins – geheim halten |
| `JWT_EXPIRES_IN` | `12h` | Gültigkeit einer Anmeldung |
| `RETENTION_DAYS` | `90` | Abgeschlossene Aufträge, Audit-Log und Chat älter als N Tage werden gelöscht |
| `CORS_ORIGIN` | – | Zusätzlich erlaubter Origin (nur bei Zugriff über andere Domain nötig) |
| `DB_FILE`, `UPLOAD_DIR`, `LOG_DIR` | `data\…` | Datenpfade |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `UPDATE_REPO` | `phillhf/alvea` | GitHub-Repository für Updates |

Der Port lässt sich auch ändern, indem das Setup erneut ausgeführt wird.

---

## Datensicherung

Alle Daten liegen in `data\`. Die Datenbank ist **eine** Datei (`alvea.sqlite`).

- **Automatisch:** *Verwaltung → 💾 Backup* – tägliche Kopie auf ein lokales Verzeichnis oder eine Netzwerkfreigabe (UNC, optional mit Anmeldedaten).
- **Vor jedem Update:** automatisch nach `data\backups\`.
- **Manuell:** Dienst stoppen, `data\` kopieren.

---

## Sicherheit

| Maßnahme | Details |
|---|---|
| Passwörter | bcrypt, Cost-Factor 12 |
| Anmeldung | JWT mit zufälligem 384-Bit-Secret |
| Rate-Limiting | Login 10/15 min · API 300/min · Passwortänderung 5/15 min |
| HTTP-Header | Helmet (CSP, X-Frame-Options, …) |
| Uploads | MIME-Typ + Magic-Bytes, serverseitige Dateinamen, Pfad-Prüfung |
| Zugriffsschutz | Bereichs-Scope und Besitzer-Prüfung auf Einzelabrufen (IDOR-Schutz) |
| Audit-Log | Änderungen werden protokolliert (ohne Passwörter) |
| Updates | SHA256-geprüfte Setups aus GitHub-Releases |

Alvea ist für den Betrieb im internen Klinik-Netz gedacht und spricht standardmäßig HTTP. Für Kamera/Barcode-Scanner auf iOS ist HTTPS nötig – dafür einen Reverse-Proxy (z. B. IIS mit ARR, nginx oder Caddy) mit Zertifikat vorschalten und `HOST=127.0.0.1` setzen.

Sicherheitslücken bitte nicht öffentlich als Issue melden, sondern über [GitHub Security Advisories](https://github.com/phillhf/alvea/security/advisories/new).

---

## Häufige Fragen

**Alvea ist nach der Installation nicht erreichbar.**
Dienst „Alvea“ in `services.msc` prüfen, Protokolle unter `data\logs\` ansehen. Von anderen Geräten aus: Firewall-Freigabe für den Port prüfen.

**Kamera/Scanner funktioniert auf dem iPad nicht.**
iOS erlaubt Kamerazugriff nur über HTTPS – siehe [Sicherheit](#sicherheit). Ohne HTTPS fällt Alvea auf die native Kamera-App zurück.

**Ein Mitarbeiter sieht keine Aufträge.**
Rolle (Berechtigungen) und Zuweisung zu Station, Bereich oder Team prüfen. Danach ab- und wieder anmelden.

**Wie importiere ich das Raumbuch?**
*Verwaltung → Import* – Excel-Datei hochladen. Spalten u. a. Haus, Gebäude, Station, Raum, Stellplatz bzw. Stellplatz-Anzahl.

**Update in der Verwaltung meldet „Update-Prüfung nicht möglich“.**
Der Server erreicht GitHub nicht (Proxy/Firewall). Setup manuell herunterladen und ausführen.

---

## Entwicklung

Voraussetzung: Node.js 24.

```bash
cd backend && npm install && cp .env.example .env && npm run init-db && npm run dev
cd frontend && npm install && npm run dev
```

Das Frontend läuft dann unter `http://localhost:5173` und leitet `/api` an das Backend (Port 37843) weiter.

Architektur, Datenbank-Regeln und Release-Ablauf: [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md).

Beiträge sind willkommen – bitte vorher ein Issue eröffnen, damit wir die Umsetzung abstimmen können.

---

## Lizenz

[MIT](LICENSE). Verwendete Drittanbieter-Komponenten (u. a. Node.js und WinSW im Installer) sind in [NOTICE](NOTICE) aufgeführt.
