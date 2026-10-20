# 🛏️ OpenClinic

> OpenClinic – Open-Source-Tool zur digitalen Verwaltung von Bettenaufbereitung und Entlassreinigung in Krankenhäusern und Pflegeeinrichtungen.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-24+LTS-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)

---

## 📸 Screenshots

| Stationsübersicht | Bett-Zentral | Dashboard |
|---|---|---|
| Prioritätsscore, farbige Sortierung | Board mit Filterleiste | Schichtleiter-Übersicht |

> Screenshots werden nach dem ersten Produktiveinsatz ergänzt.

---

## ✨ Features

| Feature | Beschreibung |
|---|---|
| 🛏️ **Bett-Dezentral** | Aufträge auf Station – Normal- oder Infektiösmodus mit Erreger-Auswahl |
| 🏥 **Bett-Zentral** | Zentrale Aufbereitung – eigene Aufbereitungsarten, Barcode-Pflicht, ISO-Flag |
| 🧹 **Zimmerreinigung** | Standard- und Schlussdesinfektion mit Erreger-Auswahl |
| ⚡ **Prioritätsscore** | Stationen automatisch nach Dringlichkeit sortiert und farbig hervorgehoben |
| 📋 **Checklisten** | Vorlagen je Reinigungstyp und Bett-Typ |
| 📸 **Foto-Dokumentation** | Fotos direkt per Kamera oder Galerie |
| 🗺️ **Bett-Reisehistorie** | Alle Stationen und Zentralaufenthalte eines Betts per Strichcode |
| 🏷️ **Barcode-Scanner** | ZXing-basierter Kamerascanner für Bett-Identifikation |
| 📊 **Berichte & PDF** | Stationsbericht, Reisehistorie, Zentral-Tagesbericht – alle als PDF |
| 🎨 **Design-Anpassung** | Farben, Schriften, Hintergrundbild, Login-Theme konfigurierbar |
| 🔐 **Rollen & Bereiche** | Flexibles Berechtigungssystem mit 6 Permissions und Bereichs-Scope |
| 🛡️ **Sicherheit** | JWT, bcrypt (Cost 12), Helmet, Rate-Limiting, Magic-Byte-Validierung |

---

## 🚀 Schnellstart (Windows Server)

### Voraussetzung

[Node.js 24 LTS](https://nodejs.org/) installieren → Next → Next → Finish.

### Erstinstallation

```cmd
REM ZIP entpacken, z.B. nach C:\Apps\openclinic\
cd C:\Apps\openclinic
install.bat
```

### Starten / Stoppen

```cmd
start.bat    ← Server starten
stop.bat     ← Server stoppen
```

Das Terminal zeigt alle erreichbaren URLs:

```
Lokal:  http://localhost:37843
LAN:    http://192.168.x.x:37843
```

📱 **iPad/Smartphone**: Gerät im gleichen WLAN → Browser → `http://<server-ip>:37843`

> ⚠️ **Kamera & Barcode-Scanner** funktionieren auf iOS nur über HTTPS. Für den Produktiveinsatz wird ein Nginx-Reverse-Proxy mit selbstsigniertem Zertifikat empfohlen.

### Als Windows-Dienst (Autostart)

```cmd
install-service.bat
```

### Update einspielen

```cmd
REM 1. Neues ZIP in den Ordner entpacken (Windows: Ja zu allen)
REM 2. Dann:
update.bat
```

Sichert automatisch Datenbank und Konfiguration, baut neu und migriert. **Daten bleiben immer erhalten.**

---

## 🔑 Standard-Login (Erstinstallation)

> ⚠️ **Passwort nach dem ersten Login sofort unter Profil ändern!**

| E-Mail | Passwort | PIN |
|---|---|---|
| admin@openclinic.local | admin123 | 1234 |

---

## 📱 Navigation

Die App hat fünf Haupt-Reiter – welche sichtbar sind, hängt von den Berechtigungen ab:

| Reiter | Berechtigung | Zweck |
|---|---|---|
| **Bett-Dezentral** | `bettenaufbereitung` | Bettenaufbereitung auf den Stationen |
| **Bett-Zentral** | `bettenaufbereitung_zentral` | Zentrale Aufbereitung im Aufbereitungsraum |
| **Zimmerreinigung** | `zimmerreinigung` | Entlassreinigung und Schlussdesinfektion |
| **Berichte** | `berichte` | Tagesberichte und Reisehistorie |
| **Verwaltung** | `verwaltung` | Vollständige Administration |

---

## 🛏️ Bett-Dezentral

### Workflow

```
Schichtleiter legt Auftrag an (Bett + Reinigungsart)
    ↓
Auftrag erscheint auf der Stationsübersicht
    ↓
Mitarbeiter: "Auf dem Weg" → unterwegs
    ↓
Mitarbeiter: "Angekommen" → Barcode scannen (optional)
    ↓
Reinigung + Checkliste + Fotos → abschließen
```

### Auftrag anlegen

1. **Bett-Dezentral** → Station wählen → **+ Auftrag anlegen**
2. Bett auswählen
3. Reinigungsart: **Normal** oder **Infektiös** (Erreger-Auswahl bei Infektiös Pflicht)
4. Speichern

### Prioritätsscore

- Jeder offene Auftrag = **1 Punkt**
- Aufträge > 30 Min alt = **+1,5 Punkte** (konfigurierbar)
- Farbschwellen: grün / gelb / rot (konfigurierbar unter Verwaltung → Einstellungen)
- Höchster Score je Bereich: **rote Umrandung**

---

## 🏥 Bett-Zentral

Die zentrale Bettenaufbereitung empfängt Betten aus dem ganzen Haus und bereitet diese in einem Zentralraum auf.

### Unterschied zur dezentralen Aufbereitung

| | Dezentral | Zentral |
|---|---|---|
| Auftrag erstellt von | Schichtleiter | Mitarbeiter der Aufbereitung |
| Transport-Flow | Ja (unterwegs → angekommen) | Nein (direkt laufend) |
| Barcode | Optional beim Reinigen | **Pflicht beim Anlegen** |
| Verfahren | Normal / Infektiös | Frei konfigurierbare Aufbereitungsarten |
| ISO-Kennzeichnung | Nein | Ja |

### Auftrag anlegen (5 Schritte)

1. **Barcode** – eingeben, aus Liste wählen oder mit Kamera scannen *(Pflicht)*
2. **Bett-Typ** – welcher Bett-Typ wird aufbereitet?
3. **ISO-Bett** – Isolations-Bett ja/nein
4. **Erreger** – bekannte Erreger optional angeben
5. **Aufbereitungsart** – Verfahren wählen (konfigurierbar unter Verwaltung)

### Aufbereitungsarten verwalten

**Verwaltung → Aufbereitungsarten**:

| Feld | Bedeutung |
|---|---|
| **Name** | Bezeichnung (z. B. „RKI-Klasse B") |
| **Wann anwenden?** | Hilfetext beim Anlegen (z. B. „Bei MRSA-Betten") |
| **Anleitung** | Vollständige Schritt-für-Schritt-Anweisung – wird beim Auftrag angezeigt |
| **Reihenfolge** | Sortierung in der Auswahl |
| **Aktiv** | Inaktive Arten erscheinen nicht beim Anlegen |

---

## 🧹 Zimmerreinigung

### Reinigungsarten

- 🧹 **Standardreinigung** – reguläre Zimmerreinigung
- 🔴 **Schlussdesinfektion** – nach Entlassung/Isolationsende; Erreger können angegeben werden

### Auftrag anlegen

1. **Zimmerreinigung** → Station wählen → **+ Zimmerreinigung anlegen**
2. Zimmer auswählen
3. Reinigungsart wählen (bei Schlussdesinfektion optional Erreger angeben)
4. Speichern

---

## 📊 Berichte

### Stationsbericht

Tages- oder Zeitraumbericht für eine Station.
→ **PDF-Export** verfügbar

### Bett-Reisehistorie

Alle Stationen und Zentralaufenthalte eines Betts über seinen Barcode.
- Zentralaufenthalte erscheinen als Station **„Bettenzentrale"**
- Statistik: Wie oft war das Bett auf welcher Station?
→ **PDF-Export** verfügbar

### Bett-Zentral Tagesbericht

- Gesamtkennzahlen: Gesamt / Abgeschlossen / Offen / ISO-Betten
- Verteilung nach Bett-Typ und Aufbereitungsart
- Tagesansicht aufklappbar
→ **Gesamt-PDF** und **📄 Tages-PDF** je Tag verfügbar

---

## 🔐 Rollen & Berechtigungen

Unter **Verwaltung → 🔐 Rollen** Rollen anlegen und Permissions zuweisen.

### 6 Berechtigungen

| Permission | Funktion |
|---|---|
| `bettenaufbereitung` | Reiter Bett-Dezentral |
| `bettenaufbereitung_zentral` | Reiter Bett-Zentral |
| `zimmerreinigung` | Reiter Zimmerreinigung |
| `berichte` | Reiter Berichte |
| `auftraege_erstellen` | Aufträge anlegen, Zimmer/Betten verwalten |
| `verwaltung` | Vollzugriff Verwaltung |

### Scope – wer sieht was?

1. **Stationszuweisung** (höchste Priorität) – nur diese Stationen
2. **Bereichszuweisung** – nur diese Bereiche
3. **Team-Bereiche** – Bereiche des Teams
4. Verwaltung-Permission → alles sichtbar

Zentral-Aufträge haben **keinen Bereichs-Scope** – für alle mit `bettenaufbereitung_zentral` sichtbar.

### Typische Rollenkonfiguration

| Rolle | Permissions |
|---|---|
| Reiniger Dezentral | `bettenaufbereitung` |
| Reiniger Zentral | `bettenaufbereitung_zentral` |
| Zimmerreinigung | `zimmerreinigung` |
| Schichtleiter | alle außer `verwaltung` |
| Admin | alle 6 |

---

## ⚙️ Verwaltung – 13 Tabs

| Tab | Inhalt |
|---|---|
| 🔐 **Rollen** | Rollen + Permissions zuweisen |
| **Teams** | Teams + Bereichszuweisung |
| **Häuser** | Standorte |
| **Bereiche** | Abteilungen / Gebäudebereiche |
| **Stationen** | Pflegestationen |
| **Zimmer** | Zimmer je Station |
| **Betten** | Betten + 🗺️ Reisehistorie-Modal |
| **Bett-Typen** | Bett-Typen (Standard, Intensiv …) |
| **Krankheitserreger** | Erreger mit Desinfektionsmittel-Info |
| **Strichcodes** | Barcode-Pool + CSV/XLS-Import |
| **Aufbereitungsarten** | Verfahren für Bett-Zentral |
| **Anleitungen** | Allgemeine Reinigungsanleitungen |
| ⚙️ **Einstellungen** | Prioritätsscore, Farbschwellen, Datenhaltung |
| 🎨 **Design** | App-Theme, Login-Theme, Hintergrundbild |

---

## 💾 Datensicherung

Die gesamte Datenbank ist eine einzige Datei:

```
data/openclinic.sqlite
```

**Manuell**: Datei kopieren – fertig.

**Automatisch**: `update.bat` sichert vor jedem Update:

```
..\betten-backup-YYYYMMDD_HHMMSS\
    openclinic.sqlite
    .env
```

Alte Daten werden nach `RETENTION_DAYS` (Standard: 90 Tage) automatisch gelöscht.

---

## ⚙️ Konfiguration (.env)

Wird bei `install.bat` automatisch angelegt:

```env
NODE_ENV=production
PORT=37843
HOST=0.0.0.0
DB_FILE=./data/openclinic.sqlite
UPLOAD_DIR=./uploads
JWT_SECRET=<zufällig generiert, ≥32 Zeichen>
JWT_EXPIRES_IN=12h
CORS_ORIGIN=          # Leer = nur Localhost
RETENTION_DAYS=90
```

---

## 🔒 Sicherheitsmaßnahmen

| Maßnahme | Details |
|---|---|
| Passwort-Hashing | bcrypt, Cost-Factor 12 |
| Tokens | JWT mit zufälligem Secret |
| Rate-Limiting | Login 10/15min · API 300/min · PW-Änderung 5/15min |
| Security-Header | Helmet (CSP, HSTS, X-Frame-Options …) |
| Upload-Validierung | MIME-Typ + Magic-Bytes (JPEG/PNG/WebP/GIF) |
| Path-Traversal-Schutz | path.resolve-Prüfung |
| IDOR-Schutz | Bereichs-Scope-Check auf Tasks, Fotos, Checklisten |
| Audit-Log | Alle Änderungen protokolliert |

---

## ❓ Häufige Fragen

**Kamera/Scanner funktioniert nicht auf dem iPad?**
Kamera und Scanner benötigen HTTPS. Im lokalen Netzwerk einen Nginx-Reverse-Proxy mit selbstsigniertem Zertifikat einrichten.

**Ein Mitarbeiter sieht keine Aufträge?**
Unter Verwaltung → Benutzer prüfen ob der Nutzer einem Bereich, einer Station oder einem Team zugewiesen ist und ob die Rolle die nötigen Permissions hat.

**Wie importiere ich Barcodes?**
Verwaltung → Strichcodes → CSV oder XLS hochladen. Format: Spalte `code`, optionale Spalte `description`.

**Wie ändere ich das Logo oder Hintergrundbild?**
Verwaltung → 🎨 Design → Hintergrundbild hochladen. Farben und Schriften ebenfalls dort konfigurierbar.

**Wie lege ich eine neue Aufbereitungsart an?**
Verwaltung → Aufbereitungsarten → Name, „Wann anwenden?" und Anleitung eingeben. Die Anleitung erscheint dem Mitarbeiter direkt beim Auftrag.

**Wie oft werden alte Daten gelöscht?**
Nach `RETENTION_DAYS` (Standard: 90 Tage) – einstellbar in `backend/.env`.

**Neuer Mitarbeiter sieht den Tab Bett-Zentral nicht?**
Unter Verwaltung → Rollen → Rolle des Mitarbeiters bearbeiten → Permission `bettenaufbereitung_zentral` aktivieren. Dann abmelden und neu anmelden.

---

## 🏗️ Tech-Stack

| Bereich | Technologie |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, i18next |
| Backend | Node.js 24 LTS, Express, TypeScript, Zod |
| Datenbank | SQLite (better-sqlite3, WAL-Mode) |
| Auth | JWT + bcrypt (Cost 12) |
| PDF | PDFKit |
| Excel-Import | ExcelJS (MIT) |
| Barcode | @zxing/browser + @zxing/library |

---

## 🤝 Beitragen

Pull Requests sind willkommen!

1. Fork erstellen
2. Feature-Branch anlegen (`git checkout -b feature/mein-feature`)
3. Änderungen committen
4. Branch pushen
5. Pull Request öffnen

---

## 📄 Lizenz

Dieses Projekt steht unter der **MIT-Lizenz** – siehe [LICENSE](LICENSE).

Verwendete Drittanbieter-Komponenten sind in [NOTICE](NOTICE) aufgeführt.
