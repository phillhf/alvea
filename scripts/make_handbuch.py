#!/usr/bin/env python3
"""Benutzer- und Installationshandbuch Alvea

Erzeugt docs/Alvea_Benutzerhandbuch.pdf.

    pip install reportlab
    python scripts/make_handbuch.py

Unter Windows wird Arial verwendet (Umlaute, Pfeile), sonst Helvetica.
Handbuch-Version = Programmversion aus backend/package.json.
"""

import json
import os
import re
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "backend", "package.json"), encoding="utf-8") as f:
    VERSION = json.load(f)["version"]
STAND = date.today().strftime("%d.%m.%Y")
OUT = os.path.join(ROOT, "docs", "Alvea_Benutzerhandbuch.pdf")

# ── Schriften ────────────────────────────────────────────────────────────────
FONT, FONT_B, FONT_I = "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"
_win = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
if os.path.exists(os.path.join(_win, "arial.ttf")):
    pdfmetrics.registerFont(TTFont("Arial", os.path.join(_win, "arial.ttf")))
    pdfmetrics.registerFont(TTFont("Arial-Bold", os.path.join(_win, "arialbd.ttf")))
    pdfmetrics.registerFont(TTFont("Arial-Italic", os.path.join(_win, "ariali.ttf")))
    FONT, FONT_B, FONT_I = "Arial", "Arial-Bold", "Arial-Italic"

# ── Farben (Fluent-Palette der App) ─────────────────────────────────────────
W, H = A4
BRAND = colors.HexColor("#0078D4")
BRAND_LIGHT = colors.HexColor("#EFF6FC")
SLATE = colors.HexColor("#323130")
MUTED = colors.HexColor("#605E5C")
BORDER = colors.HexColor("#E1DFDD")


def S(name, **kw):
    kw.setdefault("fontName", FONT)
    return ParagraphStyle(name, **kw)


cover_title = S("CoverTitle", fontSize=40, leading=46, textColor=BRAND, fontName=FONT_B, alignment=TA_CENTER)
cover_sub = S("CoverSub", fontSize=15, leading=21, textColor=SLATE, alignment=TA_CENTER)
cover_meta = S("CoverMeta", fontSize=10, leading=14, textColor=MUTED, alignment=TA_CENTER)
h1 = S("H1", fontSize=18, leading=24, textColor=BRAND, fontName=FONT_B, spaceAfter=4)
h2 = S("H2", fontSize=12.5, leading=17, textColor=SLATE, fontName=FONT_B, spaceAfter=3, spaceBefore=9)
body = S("Body", fontSize=9, leading=13, textColor=SLATE)
note = S("Note", fontSize=8.5, leading=12, textColor=SLATE, leftIndent=6, rightIndent=6,
         backColor=BRAND_LIGHT, borderPadding=(5, 6, 5, 6), spaceBefore=4, spaceAfter=4)
toc_item = S("TocItem", fontSize=10.5, leading=16, textColor=SLATE)
cell = S("Cell", fontSize=8, leading=11, textColor=SLATE)
cell_head = S("CellHead", fontSize=8, leading=11, textColor=colors.white, fontName=FONT_B)

P = Paragraph
SP = lambda n: Spacer(1, n * mm)
HR = lambda: HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=5)


def esc(text):
    """Einzelnes & für ReportLab-Markup maskieren (bereits maskierte Entities bleiben)."""
    return re.sub(r"&(?!(amp|lt|gt|nbsp|quot);)", "&amp;", str(text))


def tbl(data, col_widths):
    """Tabelle mit Kopfzeile; Zellen werden umbrochen."""
    rows = [[P(esc(c), cell_head) for c in data[0]]]
    rows += [[P(esc(c), cell) for c in r] for r in data[1:]]
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BRAND_LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def page_deco(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(MUTED)
    canvas.setFont(FONT, 7)
    if doc.page > 1:
        canvas.drawCentredString(W / 2, 10 * mm, f"Alvea {VERSION}  ·  Benutzer- und Installationshandbuch  ·  Stand {STAND}  ·  Seite {doc.page}")
    canvas.restoreState()


story = []
FULL = 170 * mm

# ── Deckblatt ────────────────────────────────────────────────────────────────
story += [
    SP(55),
    P("Alvea", cover_title),
    SP(6),
    P("Benutzer- und Installationshandbuch", cover_sub),
    SP(3),
    P("Bettenaufbereitung · Zimmerreinigung · Sauerstoff · Rücksendungen · Wäsche · Spinde", cover_meta),
    SP(14),
    P(f"Programmversion {VERSION}  ·  Stand {STAND}", cover_meta),
    SP(2),
    P("github.com/phillhf/alvea", cover_meta),
    PageBreak(),
]

# ── Inhaltsverzeichnis ───────────────────────────────────────────────────────
CHAPTERS = [
    "Programmübersicht", "Installation", "Updates", "Umstieg von OpenClinic",
    "Rollen & Berechtigungen", "Erste Schritte", "Benutzeroberfläche & Navigation",
    "Bettenaufbereitung (dezentral)", "Bett-Zentral", "Scheuer-Wisch",
    "Meine Station (Pflegepersonal)", "Dashboard", "Meldungen", "Instandsetzung",
    "Bettenstamm und Betten P&W", "Spindverwaltung", "Raumbuch",
    "Sauerstofftransport", "Rücksendungen", "Kissen & Bettdecken", "Stations-Chat",
    "Verwaltung", "Berichte", "Sicherheit & Datensicherung", "Konfiguration", "Häufige Fragen",
]
story += [P("Inhaltsverzeichnis", h1), HR()]
for i, title in enumerate(CHAPTERS, 1):
    story.append(P(f"{i}.&nbsp;&nbsp;{title.replace('&', '&amp;')}", toc_item))
story.append(PageBreak())

chapter_no = 0


def chapter(title, new_page=False):
    global chapter_no
    chapter_no += 1
    assert CHAPTERS[chapter_no - 1] == title, (chapter_no, title)
    items = [P(f"{chapter_no}. {title.replace('&', '&amp;')}", h1), HR()]
    story.append(PageBreak() if new_page else SP(5))
    story.extend(items)


# ── 1. Programmübersicht ─────────────────────────────────────────────────────
chapter("Programmübersicht")
story += [P("Alvea ist eine Web-Anwendung für die Logistik im Krankenhaus. Sie läuft als Windows-Dienst auf einem Server im internen "
            "Netz und wird per Browser genutzt – am PC ebenso wie auf iPad oder Smartphone. Alle Module lassen sich unter "
            "<b>Verwaltung → Module</b> einzeln ein- und ausschalten.", body), SP(3)]
story.append(tbl([
    ["Modul", "Beschreibung"],
    ["Bettenaufbereitung", "Dezentrale Aufträge auf Station, Normal- und Infektiösmodus, Checklisten, Fotos, Prioritätsscore"],
    ["Bett-Zentral", "Zentrale Aufbereitung mit Barcode-Pflicht, ISO-Kennzeichnung und Desinfektionsmaßnahmen"],
    ["Scheuer-Wisch", "Entlassreinigung und Schlussdesinfektion von Zimmern"],
    ["Meine Station", "Startseite für Pflegepersonal: Aufträge, Defekte, Sauerstoff, Rücksendungen, Wäsche, Spinde anfordern"],
    ["Dashboard", "Schichtleiter-Übersicht aller Stationen mit Handlungsbedarf"],
    ["Meldungen", "Ankündigungen mit Priorität, Gültigkeitszeitraum und Archiv"],
    ["Instandsetzung", "Defektmeldungen für Betten mit Reparatur-Workflow"],
    ["Bettenstamm / Betten P&W", "Physische Betten mit Barcode, Prüftermine und Wartung"],
    ["Spindverwaltung", "Spinde, Spind-Anfragen, Vergabe und Historie"],
    ["Raumbuch", "Haus → Gebäude → Station/Bereich → Raum → Stellplatz, inklusive Excel-Import"],
    ["Sauerstofftransport", "Flaschenlogistik vom Wareneingang bis zur Rückgabe an den Lieferanten"],
    ["Rücksendungen", "Material-Rücksendungen von Station über Lager und Einkauf bis zum Abschluss"],
    ["Kissen & Bettdecken", "Wäsche-Anfragen der Stationen"],
    ["Stations-Chat", "Gemeinsamer Chat für alle Stationen"],
    ["Berichte", "Auswertungen und PDF-Export"],
], [42 * mm, 128 * mm]))
story += [SP(3), P("Alvea kann auf iPad und Smartphone wie eine App auf den Home-Bildschirm gelegt werden (PWA). "
                   "Bei WLAN-Ausfall bleibt die zuletzt geladene Ansicht sichtbar; Änderungen sind dann gesperrt.", body)]

# ── 2. Installation ──────────────────────────────────────────────────────────
chapter("Installation", new_page=True)
story += [P("2.1 Voraussetzungen", h2)]
story.append(tbl([
    ["Komponente", "Minimum", "Empfohlen"],
    ["Betriebssystem", "Windows 10/11 (64 Bit)", "Windows Server 2019, 2022 oder 2025"],
    ["Prozessor", "2 Kerne", "4 Kerne"],
    ["Arbeitsspeicher", "4 GB", "8 GB"],
    ["Festplatte", "2 GB frei", "20 GB frei (SSD) für Fotos und Sicherungen"],
    ["Rechte", "Administrator für Installation", "–"],
    ["Internet", "nicht erforderlich", "Zugriff auf github.com für automatische Updates"],
], [38 * mm, 52 * mm, 80 * mm]))
story += [P("Node.js oder andere Software muss <b>nicht</b> installiert werden – die Laufzeit ist im Setup enthalten.", note)]

story += [P("2.2 Installationsschritte", h2)]
story.append(tbl([
    ["Schritt", "Aktion"],
    ["1", "Alvea-Setup-x.y.z.exe von github.com/phillhf/alvea/releases herunterladen"],
    ["2", "Setup per Rechtsklick → <i>Als Administrator ausführen</i> starten"],
    ["3", "Lizenz bestätigen und <b>Installationsordner</b> wählen (Standard: C:\\Program Files\\Alvea)"],
    ["4", "<b>Port</b> festlegen (Standard: 37843). Der Port darf nicht von einem anderen Programm belegt sein."],
    ["5", "Optional: Ordner einer bisherigen OpenClinic-Installation angeben, um deren Daten zu übernehmen (siehe Kapitel 4)"],
    ["6", "Optional: <i>Port in der Windows-Firewall freigeben</i> – nötig für Zugriff von iPads und anderen PCs"],
    ["7", "Installieren. Datenbank, Windows-Dienst „Alvea“ und Update-Aufgabe werden automatisch eingerichtet."],
    ["8", "Am Ende Alvea im Browser öffnen und mit admin@alvea.local / admin123 anmelden"],
    ["9", "Passwort sofort ändern: Klick auf den eigenen Namen → Profil"],
], [16 * mm, 154 * mm]))

story += [P("2.3 Aufruf", h2)]
story += [P("Alvea ist danach im Netzwerk unter <b>http://&lt;Servername oder IP&gt;:&lt;Port&gt;</b> erreichbar, auf dem Server selbst "
            "unter http://localhost:&lt;Port&gt;. Der Dienst startet automatisch mit Windows und wird bei Absturz neu gestartet.", body)]

story += [P("2.4 Ordnerstruktur", h2)]
story.append(tbl([
    ["Ordner", "Inhalt", "Bei Update"],
    ["app\\", "Programmdateien (Server und Weboberfläche)", "wird ersetzt"],
    ["node\\", "Node.js-Laufzeit", "wird ersetzt"],
    ["service\\", "Windows-Dienst (WinSW)", "wird ersetzt"],
    ["data\\alvea.env", "Konfiguration (Port, Pfade, Schlüssel)", "bleibt erhalten"],
    ["data\\alvea.sqlite", "Datenbank – alle Aufträge, Nutzer, Einstellungen", "bleibt erhalten"],
    ["data\\uploads\\", "Fotos, Anhänge, Hintergrundbilder", "bleibt erhalten"],
    ["data\\logs\\", "Protokolle (Programm, Dienst, Installation, Update)", "bleibt erhalten"],
    ["data\\backups\\", "Datenbank-Sicherungen vor jedem Update", "bleibt erhalten"],
], [38 * mm, 92 * mm, 40 * mm]))
story += [P("Der Ordner <b>data\\</b> wird auch bei der Deinstallation nicht gelöscht.", note)]

story += [P("2.5 Startmenü", h2)]
story.append(tbl([
    ["Eintrag", "Funktion"],
    ["Alvea öffnen", "Öffnet die Weboberfläche im Browser"],
    ["Nach Updates suchen", "Prüft GitHub auf eine neue Version und installiert sie (siehe Kapitel 3)"],
    ["Konfiguration bearbeiten", "Öffnet data\\alvea.env im Editor"],
    ["Protokolle", "Öffnet den Ordner data\\logs"],
    ["Alvea deinstallieren", "Entfernt Programm, Dienst, Update-Aufgabe und Firewall-Regel – Daten bleiben"],
], [50 * mm, 120 * mm]))

story += [P("2.6 Dienst steuern", h2)]
story += [P("Dienst <b>Alvea</b> in services.msc oder in einer Administrator-Eingabeaufforderung: "
            "<i>net stop Alvea</i> / <i>net start Alvea</i>.", body)]
story += [P("2.7 Unbeaufsichtigte Installation", h2)]
story += [P("Alvea-Setup-x.y.z.exe /VERYSILENT /DIR=\"D:\\Alvea\" /PORT=8080 [/MIGRATE=\"C:\\Apps\\openclinic\"]", body)]

# ── 3. Updates ───────────────────────────────────────────────────────────────
chapter("Updates", new_page=True)
story += [P("Neue Versionen werden als Release auf GitHub veröffentlicht. Alvea prüft dort selbst, ob eine neuere Version vorliegt.", body)]
story += [P("3.1 Update aus der Weboberfläche", h2)]
story.append(tbl([
    ["Schritt", "Aktion"],
    ["1", "Verwaltung → Tab <b>Update</b> öffnen (Berechtigung <i>verwaltung</i>)"],
    ["2", "Installierte und neueste Version sowie die Änderungen der neuen Version werden angezeigt"],
    ["3", "<b>Jetzt aktualisieren</b> → Sicherheitsabfrage mit <b>Ja, Update starten</b> bestätigen"],
    ["4", "Alvea ist ca. 1–3 Minuten nicht erreichbar. Die Seite lädt danach automatisch mit der neuen Version neu."],
], [16 * mm, 154 * mm]))
story += [P("3.2 Update auf dem Server", h2)]
story += [P("Startmenü → Alvea → <b>Nach Updates suchen</b>. Das Fenster zeigt die gefundene Version und fragt vor der Installation nach.", body)]
story += [P("3.3 Was beim Update passiert", h2)]
story.append(tbl([
    ["Schritt", "Beschreibung"],
    ["Download", "Setup und Prüfsumme der neuesten Version werden von GitHub geladen"],
    ["Prüfung", "Die SHA256-Prüfsumme wird kontrolliert – bei Abweichung wird abgebrochen"],
    ["Sicherung", "Dienst wird gestoppt, Datenbank und Konfiguration nach data\\backups\\vor-update-… kopiert"],
    ["Installation", "Setup läuft unsichtbar; Port und Einstellungen bleiben erhalten"],
    ["Start", "Dienst startet, Datenbank-Migrationen laufen automatisch"],
    ["Kontrolle", "Es wird geprüft, ob die neue Version antwortet. Fehler werden in Verwaltung → Update angezeigt."],
], [30 * mm, 140 * mm]))
story += [P("Protokoll: data\\logs\\update.log. Ohne Internetzugriff des Servers: neues Setup an einem anderen PC herunterladen, "
            "auf den Server kopieren und ausführen – das ist gleichwertig.", note)]

# ── 4. Umstieg von OpenClinic ────────────────────────────────────────────────
chapter("Umstieg von OpenClinic")
story += [P("Alvea ist der Nachfolger von <i>OpenClinic</i> (davor <i>Betten &amp; Entlassreinigung</i>). Bei der Erstinstallation "
            "erkennt das Setup einen laufenden OpenClinic-Dienst automatisch und schlägt dessen Ordner vor.", body), SP(2)]
story.append(tbl([
    ["Wird übernommen", "Hinweis"],
    ["Datenbank", "Alle Aufträge, Nutzer, Rollen, Raumbuch, Einstellungen"],
    ["Uploads", "Fotos, Anhänge, Hintergrundbilder"],
    ["Anmeldeschlüssel", "Angemeldete Nutzer bleiben angemeldet"],
    ["Admin-Login", "Bisherige Adresse (z. B. admin@openclinic.local) gilt weiter"],
], [45 * mm, 125 * mm]))
story += [P("Der alte Dienst wird gestoppt und deaktiviert, aber nicht gelöscht; der alte Ordner bleibt unverändert. "
            "Läuft Alvea stabil, kann der alte Dienst entfernt (<i>nssm remove OpenClinic confirm</i>) und der Ordner gelöscht werden. "
            "Ein unter Verwaltung → Design gespeicherter App-Name „OpenClinic“ muss dort ggf. angepasst werden.", note)]

# ── 5. Rollen & Berechtigungen ───────────────────────────────────────────────
chapter("Rollen & Berechtigungen", new_page=True)
story += [P("Rollen werden unter <b>Benutzer &amp; Rollen → Rollen</b> frei angelegt. Jede Rolle erhält eine Auswahl aus 19 Berechtigungen. "
            "Nach einer Änderung muss sich der Nutzer neu anmelden.", body)]
story += [P("5.1 Die 19 Berechtigungen", h2)]
story.append(tbl([
    ["Berechtigung", "Zugriff"],
    ["bettenaufbereitung", "Stationsübersicht – dezentrale Aufträge annehmen und bearbeiten"],
    ["bettenaufbereitung_zentral", "Bett-Zentral"],
    ["zimmerreinigung", "Scheuer-Wisch – Reinigungsaufträge bearbeiten"],
    ["stationspersonal", "Meine Station – Anforderungen der eigenen Station"],
    ["auftraege_erstellen", "Aufträge anlegen"],
    ["dashboard", "Schichtleiter-Dashboard"],
    ["berichte", "Berichte und PDF-Export"],
    ["betten_reparatur", "Instandsetzung"],
    ["bettenstamm", "Bettenstamm"],
    ["betten_pw", "Betten P&amp;W (Prüfung und Wartung)"],
    ["sauerstofftransport", "Sauerstofftransport"],
    ["lager", "Rücksendungen bearbeiten (Lager/Einkauf)"],
    ["waesche", "Kissen &amp; Bettdecken – Anfragen bearbeiten"],
    ["spindverwaltung", "Spindverwaltung"],
    ["meldungen", "Meldungen erstellen, bearbeiten, löschen"],
    ["chat", "Stations-Chat"],
    ["raumbuch", "Raumbuch bearbeiten und importieren"],
    ["benutzerverwaltung", "Mitarbeiter, Rollen und Teams"],
    ["verwaltung", "Vollzugriff: alle Bereiche inklusive Verwaltung, Backup, Design und Update"],
], [52 * mm, 118 * mm]))
story += [P("5.2 Sichtbarkeit (Scope)", h2)]
story += [P("Was ein Nutzer sieht, richtet sich nach seiner Zuweisung: Stationszuweisung (höchste Priorität) → Bereichszuweisung → "
            "Bereiche seines Teams. Nutzer mit <i>verwaltung</i> sehen alles. Zentral-Aufträge sind für alle mit "
            "<i>bettenaufbereitung_zentral</i> sichtbar.", body)]
story += [P("5.3 Beispiel-Rollen", h2)]
story.append(tbl([
    ["Rolle", "Berechtigungen"],
    ["Pflegepersonal", "stationspersonal"],
    ["Reinigungskraft dezentral", "bettenaufbereitung, zimmerreinigung"],
    ["Reinigungskraft zentral", "bettenaufbereitung_zentral, waesche"],
    ["Schichtleitung", "bettenaufbereitung, zimmerreinigung, auftraege_erstellen, dashboard, berichte, meldungen"],
    ["Haustechnik", "betten_reparatur, bettenstamm, betten_pw"],
    ["Sauerstofftransport", "sauerstofftransport"],
    ["Lager / Einkauf", "lager"],
    ["Administrator", "alle 19 Berechtigungen"],
], [48 * mm, 122 * mm]))
story += [P("Pflegepersonal kann über Meine Station Scheuer-Wisch beauftragen, ohne selbst <i>zimmerreinigung</i> zu besitzen.", note)]

# ── 6. Erste Schritte ────────────────────────────────────────────────────────
chapter("Erste Schritte", new_page=True)
story.append(tbl([
    ["Schritt", "Aktion"],
    ["1", "Als admin@alvea.local anmelden und Passwort unter Profil ändern"],
    ["2", "Verwaltung → <b>Module</b>: nicht benötigte Module deaktivieren"],
    ["3", "Raumbuch: Häuser, Gebäude, Bereiche/Stationen, Räume und Stellplätze anlegen – oder per Excel-<b>Import</b>"],
    ["4", "Benutzer &amp; Rollen: Rollen prüfen bzw. anlegen, Teams anlegen"],
    ["5", "Benutzer &amp; Rollen → Mitarbeiter anlegen, Rolle und Station/Bereich zuweisen"],
    ["6", "Verwaltung → Desinfektionsmaßnahmen und Bett-Typen für Bett-Zentral pflegen"],
    ["7", "Bettenstamm: physische Betten mit Barcode und Prüftermin anlegen"],
    ["8", "Je nach Modul: O2-Lager und Flaschentypen, Rücksendungs-Gründe, Wäschetypen, Berufsgruppen (Spinde)"],
    ["9", "Verwaltung → <b>Backup</b>: tägliche Sicherung auf ein Netzlaufwerk einrichten"],
    ["10", "Verwaltung → <b>Design</b>: Farben, Logo-Text und Login-Seite anpassen"],
], [16 * mm, 154 * mm]))

# ── 7. Oberfläche ────────────────────────────────────────────────────────────
chapter("Benutzeroberfläche & Navigation")
story += [P("Die Seitenleiste zeigt nur Bereiche, für die der Nutzer berechtigt ist und deren Modul aktiv ist.", body), SP(2)]
story.append(tbl([
    ["Menüpunkt", "Berechtigung"],
    ["Stationsübersicht (Betten)", "bettenaufbereitung"],
    ["Bett-Zentral", "bettenaufbereitung_zentral"],
    ["Scheuer-Wisch", "zimmerreinigung"],
    ["Sauerstoff", "sauerstofftransport"],
    ["Meine Station (Name der Station)", "stationspersonal"],
    ["Instandsetzung", "betten_reparatur oder verwaltung"],
    ["Bettenstamm / Betten P&amp;W", "bettenstamm bzw. betten_pw oder verwaltung"],
    ["Dashboard", "dashboard oder verwaltung"],
    ["Berichte", "berichte"],
    ["Meldungen", "meldungen oder verwaltung"],
    ["Spindverwaltung", "spindverwaltung oder verwaltung"],
    ["Raumbuch", "raumbuch oder verwaltung"],
    ["Rücksendungen", "lager oder verwaltung"],
    ["Benutzer &amp; Rollen", "benutzerverwaltung oder verwaltung"],
    ["Verwaltung", "verwaltung"],
], [70 * mm, 100 * mm]))
story += [P("Auf Tablets und Smartphones öffnet der Menü-Knopf oben links die Navigation. Der Hochkontrast-Modus "
            "(schwarzer Hintergrund, gelbe Akzente) ist über die Seitenleiste umschaltbar. "
            "Als App installieren: Safari → Teilen → Zum Home-Bildschirm, bzw. Chrome → Menü → App installieren.", body)]

# ── 8. Bettenaufbereitung ────────────────────────────────────────────────────
chapter("Bettenaufbereitung (dezentral)", new_page=True)
story += [P("Die Stationsübersicht zeigt alle Stationen im eigenen Bereich, sortiert nach Prioritätsscore. Jeder offene Auftrag zählt "
            "einen Punkt, länger wartende Aufträge zusätzlich; die Schwellen für Gelb und Rot werden unter Verwaltung → Einstellungen festgelegt.", body)]
story += [P("8.1 Auftrag bearbeiten", h2)]
story.append(tbl([
    ["Schritt", "Aktion"],
    ["1", "Station antippen → Auftrag antippen"],
    ["2", "<b>Auf dem Weg</b> – Kollegen sehen, dass der Auftrag übernommen ist"],
    ["3", "<b>Angekommen</b> – Auftrag im Zimmer annehmen, Reinigung beginnt"],
    ["4", "Checkliste abhaken, bei Bedarf Fotos aufnehmen"],
    ["5", "Barcode des Betts scannen (empfohlen, erzeugt die Reisehistorie des Betts)"],
    ["6", "<b>Als erledigt melden</b>"],
], [16 * mm, 154 * mm]))
story += [P("8.2 Infektiöse Aufbereitung", h2)]
story += [P("Bei <i>Infektiös</i> wird der Erreger ausgewählt. Zu jedem Erreger zeigt Alvea Desinfektionsmittel, Material und "
            "Schutzmaßnahmen an (pflegbar unter Verwaltung → Krankheitserreger). Für jedes Bett kann nur ein aktiver Auftrag existieren.", body)]

# ── 9. Bett-Zentral ──────────────────────────────────────────────────────────
chapter("Bett-Zentral")
story += [P("Für die zentrale Aufbereitung im Aufbereitungsraum. Es gibt keinen Transport-Schritt; der Barcode ist Pflicht.", body), SP(2)]
story.append(tbl([
    ["Schritt", "Inhalt"],
    ["1 – Barcode", "Eingeben, aus der Liste wählen oder per Kamera scannen"],
    ["2 – Bett-Typ", "Welcher Bett-Typ wird aufbereitet?"],
    ["3 – ISO-Bett", "Isolationsbetten werden rot markiert"],
    ["4 – Erreger", "Falls bekannt (optional)"],
    ["5 – Desinfektionsmaßnahme", "Verfahren mit Anleitung und Hinweis „Wann anwenden?“"],
], [42 * mm, 128 * mm]))
story += [P("Die Filterleiste zeigt Alle / Offen / Meine mit Zählern. Ein Defekt-Knopf auf der Karte meldet das Bett direkt an die Instandsetzung. "
            "Wäsche-Anfragen der Stationen erscheinen hier, sofern die Berechtigung <i>waesche</i> vorhanden ist.", body)]

# ── 10. Scheuer-Wisch ────────────────────────────────────────────────────────
chapter("Scheuer-Wisch")
story.append(tbl([
    ["Reinigungsart", "Wann", "Besonderheit"],
    ["Standardreinigung", "Routinemäßige Entlassreinigung", "Keine Erreger-Angabe nötig"],
    ["Schlussdesinfektion", "Nach Isolation bzw. infektiösen Patienten", "Erreger auswählbar"],
], [42 * mm, 68 * mm, 60 * mm]))
story += [SP(2), P("Aufträge entstehen über Meine Station (Pflegepersonal) oder direkt in Scheuer-Wisch. Die Zimmerübersicht zeigt je Zimmer "
                   "den Status; laufende Aufträge stehen im Abschnitt „In Bearbeitung“.", body)]

# ── 11. Meine Station ────────────────────────────────────────────────────────
chapter("Meine Station (Pflegepersonal)", new_page=True)
story += [P("Startseite für Pflegepersonal (Berechtigung <i>stationspersonal</i>). Zeigt nur die eigene Station, die in der Seitenleiste mit "
            "ihrem Namen erscheint.", body), SP(2)]
story.append(tbl([
    ["Funktion", "Beschreibung"],
    ["Bettenreinigung anfordern", "Zimmer → Bett → Normal oder Infektiös → Absenden"],
    ["Scheuer-Wisch anfordern", "Zimmer und Reinigungsart wählen"],
    ["Defektes Bett melden", "Barcode (optional), Standort, Beschreibung"],
    ["Sauerstoff anfordern", "Anzahl, Flaschentyp, Notiz – Status: Offen → Unterwegs → Geliefert"],
    ["Rücksendung melden", "Artikel mit Menge und Grund je Artikel; Begleitschein-PDF öffnet automatisch"],
    ["Kissen &amp; Bettdecken anfordern", "Wäschetyp und Menge"],
    ["Spind-Anfrage", "Vorname, Nachname, Berufsgruppe, Zeitraum"],
    ["Statusübersicht", "Alle aktiven Aufträge und Anfragen der Station"],
], [52 * mm, 118 * mm]))

# ── 12. Dashboard ────────────────────────────────────────────────────────────
chapter("Dashboard")
story += [P("Schichtleiter-Übersicht über alle Stationen mit offenen Aufträgen, automatisch aktualisiert. Stationen ohne offene Aufträge "
            "werden ausgeblendet; hohe Priorität ist rot, erhöhte orange markiert.", body)]

# ── 13. Meldungen ────────────────────────────────────────────────────────────
chapter("Meldungen")
story += [P("Alle angemeldeten Nutzer lesen aktive Meldungen; erstellen und bearbeiten dürfen Nutzer mit <i>meldungen</i>. "
            "Prioritäten: Normal (blau), Wichtig (orange), Dringend (rot). Abgelaufene Meldungen stehen im aufklappbaren Archiv.", body)]

# ── 14. Instandsetzung ───────────────────────────────────────────────────────
chapter("Instandsetzung", new_page=True)
story += [P("Defekte Betten werden über Meine Station, die Stationsübersicht oder Bett-Zentral gemeldet und erscheinen in der Instandsetzung "
            "(Liste und Board-Ansicht).", body), SP(2)]
story.append(tbl([
    ["Status", "Bedeutung"],
    ["Gemeldet", "Neue Meldung, noch nicht bearbeitet"],
    ["In Reparatur", "Techniker hat die Reparatur begonnen (optional mit Notiz)"],
    ["Behoben", "Bett ist wieder einsatzbereit"],
    ["Ausgemustert", "Bett wird nicht mehr verwendet"],
], [40 * mm, 130 * mm]))

# ── 15. Bettenstamm / P&W ────────────────────────────────────────────────────
chapter("Bettenstamm und Betten P&W")
story += [P("Im <b>Bettenstamm</b> werden physische Betten mit Barcode, Bett-Typ, Hersteller/Modell, nächstem Prüftermin und Notizen gepflegt. "
            "<b>Betten P&amp;W</b> zeigt Kacheln für überfällige, bald fällige (unter 30 Tagen), gesperrte Betten und Betten ohne Termin "
            "und dokumentiert durchgeführte Prüfungen.", body)]

# ── 16. Spindverwaltung ──────────────────────────────────────────────────────
chapter("Spindverwaltung")
story += [P("Modul unter Verwaltung → Module aktivieren. Bereiche:", body), SP(2)]
story.append(tbl([
    ["Tab", "Inhalt"],
    ["Anfragen", "Spind-Anfragen der Stationen: Spind zuweisen oder ablehnen"],
    ["Übersicht", "Belegung auf einen Blick"],
    ["Spinde", "Spinde anlegen und pflegen"],
    ["Historie", "Vergaben und Rückgaben"],
], [35 * mm, 135 * mm]))
story += [P("Die Auswahlwerte für die Berufsgruppe werden unter Verwaltung → Berufsgruppen gepflegt.", body)]

# ── 17. Raumbuch ─────────────────────────────────────────────────────────────
chapter("Raumbuch", new_page=True)
story += [P("Abbild der Gebäudestruktur: <b>Haus → Gebäude → Bereich/Station → Raum → Stellplatz</b>. Gebäude sind optional.", body), SP(2)]
story.append(tbl([
    ["Tab", "Inhalt"],
    ["Häuser", "Standorte bzw. Häuser"],
    ["Gebäude", "Gebäude innerhalb eines Hauses (optional)"],
    ["Bereiche/Stationen", "Stationen und sonstige Bereiche"],
    ["Räume", "Räume mit Raumart"],
    ["Stellplätze", "Bettenstellplätze je Raum"],
    ["Raumarten", "Kategorien für Räume"],
    ["Import", "Excel-Import des gesamten Raumbuchs"],
    ["Eigene Attribute", "Zusatzfelder für Räume, Stationen und Betten"],
], [42 * mm, 128 * mm]))
story += [P("17.1 Excel-Import", h2)]
story += [P("Excel-Datei (.xlsx) auswählen; verwendet wird das Tabellenblatt mit den meisten Spalten. Spalten den Feldern zuordnen und importieren. "
            "Felder u. a.: Haus, Gebäude (legt Gebäude automatisch an), Bereich/Station, Raumnummer, Raumbezeichnung, Etage, Stellplatz "
            "oder <i>Stellplatz-Anzahl</i> (legt N nummerierte Stellplätze an). Zeilen ohne Pflichtfelder werden übersprungen.", body)]

# ── 18. Sauerstofftransport ──────────────────────────────────────────────────
chapter("Sauerstofftransport", new_page=True)
story += [P("Verwaltet Sauerstoffflaschen von der Lieferung bis zur Rückgabe an den Lieferanten.", body)]
story += [P("18.1 Status der Flaschen", h2)]
story.append(tbl([
    ["Status", "Bedeutung"],
    ["Volllager", "Volle Flasche im Lager"],
    ["Unterwegs", "Auf dem Weg zur Station"],
    ["Auf Station", "An die Station übergeben"],
    ["Leer/Unterwegs", "Leere Flasche auf dem Rückweg"],
    ["Leergutlager", "Wartet auf Abholung durch den Lieferanten"],
    ["Beim Lieferanten", "Zurückgegeben"],
], [40 * mm, 130 * mm]))
story += [P("18.2 Scan-Modi", h2)]
story.append(tbl([
    ["Modus", "Verwendung", "Ergebnis"],
    ["Wareneingang", "Lieferant bringt volle Flaschen (unbekannte Barcodes werden angelegt)", "→ Volllager"],
    ["Tour / Anfrage", "Flaschen für eine Anfrage aus dem Volllager", "→ Unterwegs"],
    ["Leere einsammeln", "Leere Flaschen von der Station holen", "→ Leer/Unterwegs"],
    ["Ins Leergutlager", "Leere Flaschen einlagern", "→ Leergutlager"],
    ["Warenausgang", "Leere Flaschen an den Lieferanten", "→ Beim Lieferanten"],
], [36 * mm, 94 * mm, 40 * mm]))
story += [P("18.3 Ablauf einer Anfrage", h2)]
story.append(tbl([
    ["Schritt", "Wer", "Aktion"],
    ["1", "Pflegepersonal", "Meine Station → Sauerstoff anfordern"],
    ["2", "Transport", "Anfragen → Annehmen &amp; Scannen"],
    ["3", "Transport", "Flaschen aus dem Volllager scannen"],
    ["4", "Transport", "Auftrag abschließen – Flaschen werden auf die Station gebucht"],
], [16 * mm, 36 * mm, 118 * mm]))
story += [P("Lager, Flaschentypen und Flaschen werden unter Verwaltung → O2 gepflegt.", body)]

# ── 19. Rücksendungen ────────────────────────────────────────────────────────
chapter("Rücksendungen", new_page=True)
story += [P("Stationen melden nicht benötigtes oder falsches Material zurück. Jeder Artikel hat Menge und eigenen Grund. "
            "Nach dem Speichern öffnet sich der Begleitschein als PDF; er kann jederzeit erneut gedruckt werden.", body)]
story += [P("19.1 Ablauf", h2)]
story.append(tbl([
    ["Status", "Wer", "Aktion"],
    ["In Bearbeitung", "Lager", "Neue Rücksendung liegt sofort im Lager. Lager-Notiz und Anhänge (Bilder, PDF) möglich."],
    ["Beim Einkauf", "Lager → Einkauf", "Weiterleiten an den Einkauf (optional mit Notiz); Einkauf trägt eigene Notiz ein"],
    ["Zurück ans Lager", "Einkauf → Lager", "Einkauf gibt den Vorgang an das Lager zurück"],
    ["Abgeschlossen", "Lager", "Abschluss mit Grund aus der Auswahlliste"],
], [32 * mm, 32 * mm, 106 * mm]))
story += [P("Die Tabs <b>Lager</b>, <b>Einkauf</b>, <b>Abgeschlossen</b> und <b>Alle</b> zeigen Zähler. Abschlussgründe werden unter "
            "Verwaltung → Rücks.-Gründe gepflegt. Stationspersonal sieht nur die eigenen Rücksendungen.", body)]

# ── 20. Wäsche ───────────────────────────────────────────────────────────────
chapter("Kissen & Bettdecken")
story += [P("Stationen fordern über Meine Station Kissen, Bettdecken und andere Wäscheteile an. Die Anfragen erscheinen bei Nutzern mit "
            "<i>waesche</i> in Bett-Zentral. Die verfügbaren Typen werden unter Verwaltung → Wäschetypen gepflegt.", body)]

# ── 21. Chat ─────────────────────────────────────────────────────────────────
chapter("Stations-Chat")
story += [P("Gemeinsamer Chat aller Stationen (Modul <i>Stations-Chat</i>, Berechtigung <i>chat</i>). Das Chatfenster ist auf jeder Seite "
            "unten rechts erreichbar. Nachrichten werden nach der eingestellten Aufbewahrungsdauer gelöscht.", body)]

# ── 22. Verwaltung ───────────────────────────────────────────────────────────
chapter("Verwaltung", new_page=True)
story += [P("Bereich <b>Verwaltung</b> (Berechtigung <i>verwaltung</i>):", body), SP(2)]
story.append(tbl([
    ["Tab", "Inhalt"],
    ["Bett-Typen", "Eigene Bett-Typen"],
    ["Krankheitserreger", "Erreger mit Risiko, Desinfektionsmittel, Material, Schutzmaßnahmen"],
    ["Desinfektionsmaßnahmen", "Verfahren für Bett-Zentral mit Anleitung"],
    ["Berufsgruppen", "Auswahlwerte für Spind-Anfragen"],
    ["Anleitungen", "Allgemeine Reinigungsanleitungen"],
    ["Einstellungen", "Prioritätsscore, Farbschwellen, Datenhaltung"],
    ["Design", "Farben, Schriften, App-Name, Hintergrundbild, Login-Seite"],
    ["Module", "Module ein- und ausschalten"],
    ["Backup", "Tägliche Sicherung auf lokalen Pfad oder Netzlaufwerk"],
    ["O2", "Sauerstofflager, Flaschentypen, Flaschen"],
    ["Rücks.-Gründe", "Abschlussgründe für Rücksendungen"],
    ["Audit-Log", "Protokoll aller Änderungen"],
    ["Wäschetypen", "Typen für Kissen &amp; Bettdecken"],
    ["Update", "Versionsprüfung und Update über GitHub (Kapitel 3)"],
], [45 * mm, 125 * mm]))
story += [P("Mitarbeiter, Rollen und Teams stehen unter <b>Benutzer &amp; Rollen</b>, die Gebäudestruktur unter <b>Raumbuch</b>. "
            "Beim Anlegen eines Mitarbeiters erzeugt der Würfel-Knopf ein gut lesbares Zufallspasswort.", body)]

# ── 23. Berichte ─────────────────────────────────────────────────────────────
chapter("Berichte")
story.append(tbl([
    ["Bericht", "Inhalt", "Export"],
    ["Stationsbericht", "Aufträge einer Station im Zeitraum", "PDF"],
    ["Bett-Reisehistorie", "Alle Stationen und Zentralaufenthalte eines Betts (Barcode)", "PDF"],
    ["Zentral-Tagesbericht", "Kennzahlen, Verteilung nach Bett-Typ und Verfahren", "PDF je Tag oder gesamt"],
    ["Sauerstoff", "Lieferungen, Rückgaben, Bewegungshistorie", "Anzeige"],
    ["Rücksendungen", "Nach Station (inkl. Ø Bearbeitungszeit Lager/Einkauf), Abschlussgründe, alle Vorgänge", "PDF"],
    ["Bettenstamm", "Betten nach Prüfstatus bzw. gesperrt", "CSV"],
], [38 * mm, 98 * mm, 34 * mm]))

# ── 24. Sicherheit ───────────────────────────────────────────────────────────
chapter("Sicherheit & Datensicherung", new_page=True)
story += [P("24.1 Schutzmaßnahmen", h2)]
story.append(tbl([
    ["Maßnahme", "Beschreibung"],
    ["Passwörter", "bcrypt mit Cost-Factor 12"],
    ["Anmeldung", "Signierte Tokens (JWT), Gültigkeit 12 Stunden, zufälliger Schlüssel je Installation"],
    ["Rate-Limiting", "Login 10 Versuche / 15 Min · API 300 / Min · Passwortänderung 5 / 15 Min"],
    ["HTTP-Header", "Helmet (Content-Security-Policy, X-Frame-Options u. a.)"],
    ["Uploads", "Nur erlaubte Dateitypen, Prüfung von MIME-Typ und Dateisignatur, max. 10 MB"],
    ["Zugriffsschutz", "Scope- und Besitzer-Prüfung auch bei Einzelabrufen, PDFs und Anhängen"],
    ["Datenbank", "Ausschließlich parametrisierte Abfragen"],
    ["Backup-Passwort", "Verschlüsselt gespeichert (AES-256-GCM)"],
    ["Updates", "Nur von GitHub, mit SHA256-Prüfung"],
    ["Audit-Log", "Änderungen werden protokolliert (ohne Passwörter)"],
], [36 * mm, 134 * mm]))
story += [P("24.2 Datensicherung", h2)]
story.append(tbl([
    ["Was", "Wie"],
    ["Täglich automatisch", "Verwaltung → Backup: Zielpfad (lokal oder \\\\server\\freigabe), Uhrzeit, ggf. Anmeldedaten; „Jetzt sichern“ zum Testen"],
    ["Vor jedem Update", "Automatisch nach data\\backups\\"],
    ["Manuell", "Dienst stoppen und den Ordner data\\ kopieren"],
    ["Aufbewahrung", "Abgeschlossene Aufträge, Audit-Log und Chat werden nach RETENTION_DAYS (Standard 90) gelöscht"],
], [36 * mm, 134 * mm]))
story += [P("Alvea spricht im internen Netz HTTP. Für die Kamera auf iPad/iPhone (Barcode-Scanner) ist HTTPS nötig – dafür einen "
            "Reverse-Proxy mit Zertifikat vorschalten. Ohne HTTPS weicht Alvea auf die Kamera-App des Geräts aus.", note)]

# ── 25. Konfiguration ────────────────────────────────────────────────────────
chapter("Konfiguration")
story += [P("Datei <b>data\\alvea.env</b> (Startmenü → Konfiguration bearbeiten). Änderungen werden nach einem Neustart des Dienstes wirksam.", body), SP(2)]
story.append(tbl([
    ["Schlüssel", "Standard", "Bedeutung"],
    ["PORT", "37843", "Port der Weboberfläche (auch per erneutem Setup änderbar)"],
    ["HOST", "0.0.0.0", "127.0.0.1 = nur lokal erreichbar, z. B. hinter Reverse-Proxy"],
    ["JWT_SECRET", "zufällig", "Signaturschlüssel – geheim halten, Änderung meldet alle ab"],
    ["JWT_EXPIRES_IN", "12h", "Gültigkeit einer Anmeldung"],
    ["RETENTION_DAYS", "90", "Aufbewahrungsdauer in Tagen"],
    ["CORS_ORIGIN", "–", "Zusätzlich erlaubte Adresse bei Zugriff über eine andere Domain"],
    ["DB_FILE / UPLOAD_DIR / LOG_DIR", "data\\…", "Datenpfade"],
    ["LOG_LEVEL", "info", "debug, info, warn oder error"],
    ["UPDATE_REPO", "phillhf/alvea", "GitHub-Repository für Updates"],
], [44 * mm, 30 * mm, 96 * mm]))

# ── 26. FAQ ──────────────────────────────────────────────────────────────────
chapter("Häufige Fragen", new_page=True)
story.append(tbl([
    ["Problem", "Lösung"],
    ["Alvea ist nicht erreichbar", "Dienst „Alvea“ in services.msc prüfen; Protokolle in data\\logs (alvea-service.*.log, app.log)"],
    ["Nur auf dem Server erreichbar", "Firewall-Freigabe für den Port fehlt – Setup erneut ausführen und Option wählen"],
    ["Dienst startet nicht nach Port-Änderung", "Port belegt? Anderen Port in data\\alvea.env eintragen und Dienst neu starten"],
    ["Login schlägt fehl", "Nach 10 Fehlversuchen 15 Minuten warten; Passwort prüfen"],
    ["Menüpunkt fehlt", "Berechtigung der Rolle und Modul prüfen, danach ab- und wieder anmelden"],
    ["Mitarbeiter sieht keine Aufträge", "Zuweisung zu Station, Bereich oder Team prüfen"],
    ["Update: „Update-Prüfung nicht möglich“", "Server erreicht github.com nicht – Setup manuell herunterladen und ausführen"],
    ["Update fehlgeschlagen", "Meldung in Verwaltung → Update und data\\logs\\update.log; Datenbank-Sicherung liegt in data\\backups"],
    ["Barcode nicht in der Auswahl", "Bett im Bettenstamm anlegen bzw. Flasche per Wareneingang scannen"],
    ["O2-Scan: ungültige Aktion", "Falscher Scan-Modus – die Flasche hat einen anderen Status"],
    ["Backup schlägt fehl", "Zielpfad und Anmeldedaten unter Verwaltung → Backup prüfen"],
    ["Kamera auf dem iPad geht nicht", "HTTPS fehlt – siehe Kapitel 24"],
], [58 * mm, 112 * mm]))

assert chapter_no == len(CHAPTERS), "Inhaltsverzeichnis und Kapitel stimmen nicht überein"

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                        title=f"Alvea {VERSION} – Benutzer- und Installationshandbuch", author="Alvea Contributors")
doc.build(story, onFirstPage=page_deco, onLaterPages=page_deco)
print(f"PDF erstellt: {OUT}")
