# Changelog

Alle wichtigen Änderungen an diesem Projekt werden hier dokumentiert.
Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/), Versionen folgen [Semantic Versioning](https://semver.org/lang/de/).

## [1.0.0] - 2026-10-20
Erste öffentliche Version unter dem neuen Namen **Alvea** (vorher *OpenClinic*, davor *Betten & Entlassreinigung*).

### Neu
- **Windows-Installer** (`Alvea-Setup-x.y.z.exe`): Assistent mit Installationsordner, Port, Firewall-Freigabe und Übernahme einer bestehenden OpenClinic-Installation. Node.js-Laufzeit ist enthalten, auf dem Server muss nichts vorinstalliert sein. Alvea läuft als Windows-Dienst „Alvea“.
- **Update über GitHub-Releases**: neuer Tab *Verwaltung → ⬆️ Update* zeigt installierte und neueste Version mit Änderungen und aktualisiert per Knopfdruck. Alternativ Startmenü → *Nach Updates suchen*. Downloads werden per SHA256 geprüft, die Datenbank wird vor jedem Update gesichert.
- `/api/health` liefert die installierte Version.

### Geändert
- Umbenennung in **Alvea** (App-Name, Titel, Manifest, Dienst, Standard-Login `admin@alvea.local`). Bestehende Logins (`admin@openclinic.local`, `admin@bettenaufbereitung.local`) gelten weiter.
- Daten (Datenbank, Uploads, Logs, Backups, Konfiguration) liegen bei Installation per Setup gesammelt in `data\` und werden von Updates nie angefasst.
- Alle Datenpfade werden zentral aus der Konfiguration gelesen. Hintergrundbilder landeten vorher unabhängig von `UPLOAD_DIR` immer im Programmordner.
- Login-Feld ist nicht mehr mit der Admin-Adresse vorbelegt.
- Alte Installations-/Update-Skripte (`install.bat`, `start.bat`, `update.bat`, `Update\`) entfernt – ersetzt durch Setup und Updater.

### Behoben
- `init-db` setzte die Administrator-Rolle auf eine veraltete Berechtigungsliste zurück (Raumbuchungs-Berechtigungen fehlten). Jetzt werden immer alle Berechtigungen vergeben.
- `backend/package-lock.json` passte nicht mehr zu `package.json` (`npm ci` schlug fehl).
- Platzhalter-Schriftdateien ohne Inhalt in `frontend/public/fonts` entfernt (Schriften kommen aus `@fontsource`).

---

## [0.9.2] - 2026-07-09
### Neu
- **Raumbuchung**: Gemeinsam genutzte Räume und Arbeitsplätze buchen, Agenda-Ansicht, Ausstattung je Arbeitsplatz, Favoriten (Migrationen v41–v45)
- **Stellvertretende Buchung**: explizite Zuordnung, wer für wen buchen darf (Berechtigungen `raumbuchung`, `raumbuchung_stellvertretung`, `raumbuchungsadmin`)
- **Gebäude-Ebene im Raumbuch**: Haus → Gebäude → Station/Bereich → Raum → Stellplatz (Migration v39), Excel-Import mit Feld `gebaeude` und `stellplatz_anzahl`
- **Rücksendungen überarbeitet**: direkter Lager-Workflow ohne „Annehmen“, Einkauf-/Lager-Notizen, Abschlussgründe, Anhänge, Begleitschein-PDF, Auswertung unter Berichte
- **Stations-Chat** als eigenes Modul
- **Kissen & Bettdecken** (Wäsche-Anfragen)

### Geändert
- Umbenennung in *OpenClinic*
- UI-Redesign im Stil von Windows 11 Fluent

### Sicherheit
- IDOR-Prüfungen bei Einzelabruf, Begleitschein und Anhängen von Rücksendungen

---

## [0.8.2] - 2026-05-12
### Neu
- **Meldungen als eigene Berechtigung**: Neue Permission `meldungen` (14. Berechtigung) – Nutzer können Meldungen erstellen/bearbeiten/löschen ohne `verwaltung`-Rolle
- **Meldungen als eigene Seite**: `/meldungen` mit Sidebar-Eintrag 📢, nicht mehr nur im Verwaltungs-Tab
- **Archiv-Akkordeon**: Abgelaufene Meldungen werden aufklappbar als Archiv angezeigt (ausgegraut, mit Anzahl im Header)

### Behoben
- `meldungen` Permission zu `AuthContext.tsx` (Frontend) hinzugefügt

---

## [0.8.1] - 2026-05-12
### Behoben
- **Meldungen-Modul**: `announcements` war im Frontend vorhanden, aber nicht in der Datenbank-Initialisierung registriert. Jetzt sichtbar unter Verwaltung → 📢 Meldungen (aktiv, nur für `verwaltung`-Berechtigung)

---

## [0.6.2] - 2026-05-09
### Verbessert
- Tabellen in Instandsetzung, Bettenstamm, Betten P&W, KI-Assistent (Audit-Log) und Verwaltung → Mitarbeiter: Zeilen jetzt als weiße Karten mit abgerundeten Ecken und Shadow (wie alle anderen Listen in der App)

---

## [0.4.0] – 2026-05-03

### Neu
- **Bett-Zentral**: Neues Modul für die zentrale Bettenaufbereitung mit eigenem Board, 5-Schritt-Formular (Barcode → Bett-Typ → ISO → Erreger → Aufbereitungsart), direktem Status-Übergang ohne Transport-Flow
- **Aufbereitungsarten**: Dynamisch konfigurierbare Verfahren mit Anleitung und „Wann anwenden?"-Hinweis
- **Zentral-Tagesbericht**: Statistik der zentralen Aufbereitung mit Gesamt-PDF und Tages-PDF-Export
- **6. Berechtigung**: `bettenaufbereitung_zentral` für den Zugriff auf Bett-Zentral
- **Kamera ohne HTTPS**: Automatischer Fallback auf native Kamera-App – Fotos und Barcode-Scanner funktionieren auf iPhone/iPad ohne HTTPS-Zertifikat
- **Live-Aktualisierungsindikator**: Grüner Punkt mit „Vor X Sek. aktualisiert" auf allen Seiten mit Polling
- **Filterleiste Bett-Zentral**: Alle / Offen / Meine mit Live-Zählern
- **Passwort-Generator**: 🎲 Generieren-Button im Nutzer-Modal erzeugt lesbares Zufallspasswort (z. B. Blau-Tiger-492) mit Anzeigen- und Kopieren-Funktion
- **Service Worker**: Offline-Fähigkeit – App bleibt bei WLAN-Ausfall sichtbar, gecachte Assets, API-Fehler werden sauber behandelt

### Verbessert
- **Zimmerreinigung-Flow**: RoomStationView komplett überarbeitet mit Status-Badges je Zimmer, „In Bearbeitung"-Sektion und direktem Claim-Button
- **Code-Splitting**: `React.lazy()` + `Suspense` für AdminHierarchy, Reports, BedZentral, AdminUsers; `manualChunks` für vendor-Bundles
- **AdminHierarchy gesplittet**: 2796 Zeilen → 96 Zeilen Orchestrierung + 14 Tab-Dateien unter `pages/admin/`
- **Auftrag zurückgeben**: Bestätigungsdialog verhindert versehentliches Zurückgeben
- **Bett-Reisehistorie**: Zentrale Aufbereitungen erscheinen als Station „Bettenzentrale"
- **NewRoomTask**: Korrekter Redirect auf `/rooms/stations/:id`, echter Pathogen-Picker für Schlussdesinfektion

### Sicherheit (4. Audit)
- **Permission-Prüfung beim Claim**: Auftrag annehmen erfordert passende Berechtigung je Kategorie (bed_cleaning → bettenaufbereitung, bed_cleaning_zentral → bettenaufbereitung_zentral, room_cleaning → zimmerreinigung)
- **Zentral-Aufträge anlegen**: erfordert `bettenaufbereitung_zentral` oder `auftraege_erstellen`
- **FK-Reihenfolge in init.sql**: `aufbereitungsarten` jetzt vor `tasks` definiert (verhindert Fehler bei Neuinstallation)

### Behoben
- Barcode-Warnung beim Abschließen von Zentral-Aufträgen unterdrückt (Barcode ist dort bereits beim Anlegen Pflicht)
- `useLastUpdated.tsx` → korrekt aufgeteilt in `useLastUpdated.ts` (Hook) und `LiveIndicator.tsx` (Komponente)
- `ALL_PERMISSIONS` und `PermKey` in `RollenTab.tsx` nach Split ergänzt
- Doppelter `useAuth`-Aufruf in `BedZentral.tsx` bereinigt

---

## [0.3.0] – 2026-04-15

### Neu
- Bett-Reisehistorie mit Barcode-Suche und PDF-Export
- Infektiöse Aufbereitung mit Erreger-Auswahl (20 Keime nach RKI § 7 IfSG)
- Foto-Dokumentation im Auftrag (Kamera + Galerie)
- Kamera-basierter Barcode-Scanner (ZXing)
- Rollensystem vollständig konfigurierbar (keine festen Rollen mehr)
- Bereichs-Scope: Nutzer sehen nur ihre zugewiesenen Stationen
- Prioritätsscore: automatische Sortierung nach Dringlichkeit mit konfigurierbaren Schwellen

### Sicherheit (3. Audit)
- Timing-Attack-Schutz Login
- Rate-Limiting (Login, API, Passwort-Änderung)
- Magic-Byte + MIME-Validierung Uploads
- IDOR-Schutz auf Tasks, Fotos, Checklisten
- Audit-Log (ohne Passwörter)

---

## [0.2.0] – 2026-03-01

### Neu
- Zimmerreinigung (Standard + Schlussdesinfektion)
- Stationsberichte mit PDF-Export
- PWA / Homescreen-Installation
- Design-Konfiguration (Farben, Schriften, Hintergrundbild)

---

## [0.1.0] – 2026-02-01

### Neu
- Grundlegende Bettenaufbereitung auf Station
- Transport-Flow: Unterwegs → Angekommen → In Bearbeitung → Abgeschlossen
- Checklisten je Reinigungstyp
- Nutzerverwaltung mit Rollen
- Häuser / Bereiche / Stationen / Zimmer / Betten Hierarchie
- Windows-Server-Betrieb mit install.bat / start.bat / update.bat
