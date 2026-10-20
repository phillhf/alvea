#!/usr/bin/env python3
"""Benutzerhandbuch Betten & Entlassreinigung v4.0"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

W, H = A4
BRAND = colors.HexColor("#2563eb")
BRAND_LIGHT = colors.HexColor("#eff6ff")
SLATE = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748b")
BORDER = colors.HexColor("#e2e8f0")
GREEN = colors.HexColor("#16a34a")
AMBER = colors.HexColor("#d97706")
RED   = colors.HexColor("#dc2626")

styles = getSampleStyleSheet()

def S(name, **kw):
    return ParagraphStyle(name, **kw)

cover_title  = S("CoverTitle",  fontSize=32, leading=38, textColor=BRAND,    fontName="Helvetica-Bold",  alignment=TA_CENTER)
cover_sub    = S("CoverSub",    fontSize=14, leading=20, textColor=SLATE,     fontName="Helvetica",       alignment=TA_CENTER)
cover_meta   = S("CoverMeta",   fontSize=10, leading=14, textColor=MUTED,     fontName="Helvetica",       alignment=TA_CENTER)
h1           = S("H1",          fontSize=18, leading=24, textColor=BRAND,     fontName="Helvetica-Bold",  spaceAfter=4)
h2           = S("H2",          fontSize=13, leading=18, textColor=SLATE,     fontName="Helvetica-Bold",  spaceAfter=2, spaceBefore=10)
h3           = S("H3",          fontSize=11, leading=15, textColor=SLATE,     fontName="Helvetica-Bold",  spaceAfter=2, spaceBefore=6)
body         = S("Body",        fontSize=9,  leading=13, textColor=SLATE,     fontName="Helvetica")
body_small   = S("BodySmall",   fontSize=8,  leading=11, textColor=MUTED,     fontName="Helvetica")
note         = S("Note",        fontSize=8,  leading=12, textColor=SLATE,     fontName="Helvetica",       leftIndent=8, backColor=BRAND_LIGHT)
toc_item     = S("TocItem",     fontSize=10, leading=14, textColor=SLATE,     fontName="Helvetica",       leftIndent=0)
toc_sub      = S("TocSub",      fontSize=9,  leading=13, textColor=MUTED,     fontName="Helvetica",       leftIndent=12)
footer_s     = S("Footer",      fontSize=7,  leading=10, textColor=MUTED,     fontName="Helvetica",       alignment=TA_CENTER)

def tbl(data, col_widths, row_styles=None):
    t = Table(data, colWidths=col_widths)
    base = [
        ("BACKGROUND", (0,0), (-1,0), BRAND),
        ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
        ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,-1), 8),
        ("LEADING",    (0,0), (-1,-1), 11),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, BRAND_LIGHT]),
        ("GRID",       (0,0), (-1,-1), 0.3, BORDER),
        ("VALIGN",     (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING",(0,0), (-1,-1), 6),
        ("RIGHTPADDING",(0,0),(-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0),(-1,-1), 4),
    ]
    if row_styles:
        base.extend(row_styles)
    t.setStyle(TableStyle(base))
    return t

def page_num(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7)
    canvas.drawCentredString(W/2, 10*mm,
        f"Betten & Entlassreinigung – Internes Tool  ·  Stand 29.05.2026  ·  v4.0     Seite {doc.page}")
    canvas.restoreState()

OUT = "/mnt/user-data/outputs/Benutzerhandbuch_Betten_Entlassreinigung_v4_0.pdf"

doc = SimpleDocTemplate(
    OUT, pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm,
    topMargin=18*mm,  bottomMargin=18*mm,
)

story = []
P = Paragraph
SP = lambda n: Spacer(1, n*mm)
HR = lambda: HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=4)

# ── COVER ──────────────────────────────────────────────────────────────────────
story += [
    SP(20),
    P("Betten &amp;<br/>Entlassreinigung", cover_title),
    SP(6),
    P("Benutzer- und Installationshandbuch", cover_sub),
    SP(4),
    P("Version 4.0  |  Stand 29.05.2026", cover_meta),
    SP(2),
    P("Einsatz: Windows-Server im Krankenhausnetz (intern)", cover_meta),
    SP(1),
    P("Internes Tool – kein externer Zugriff vorgesehen", cover_meta),
    PageBreak(),
]

# ── INHALTSVERZEICHNIS ──────────────────────────────────────────────────────────
story += [P("Inhaltsverzeichnis", h1), SP(3)]
toc_data = [
    ("1.", "Programmübersicht",                   "3"),
    ("2.", "Installation",                        "4"),
    ("3.", "Rollen & Berechtigungen (16)",        "5"),
    ("4.", "Erste Schritte",                      "7"),
    ("5.", "Benutzeroberfläche & Navigation",     "8"),
    ("6.", "Stationsübersicht – Dezentrale Bettenaufbereitung","9"),
    ("7.", "Bett-Zentral",                        "10"),
    ("8.", "Scheuer-Wisch",                       "10"),
    ("9.", "Meine Station (Pflegepersonal)",      "11"),
    ("10.","Dashboard – Schichtleiter",           "13"),
    ("11.","Meldungen",                           "13"),
    ("12.","Instandsetzung – Defektmanagement",   "14"),
    ("13.","Bettenstamm",                         "15"),
    ("14.","Betten P&W – Prüfung & Wartung",     "15"),
    ("15.","Spindverwaltung",                     "16"),
    ("16.","Raumbuch",                            "17"),
    ("17.","Sauerstofftransport",                 "18"),
    ("18.","Rücksendungen",                       "20"),
    ("19.","Verwaltung",                          "21"),
    ("20.","Berichte",                            "22"),
    ("21.","Sicherheit & Datensicherung",         "23"),
    ("22.","Konfiguration",                       "24"),
    ("23.","Häufige Fragen",                      "25"),
]
for nr, title, pg in toc_data:
    story.append(P(f"{nr}&nbsp;&nbsp;{title}", toc_item))
story.append(PageBreak())

# ── 1. PROGRAMMÜBERSICHT ────────────────────────────────────────────────────────
story += [P("1. Programmübersicht", h1), HR()]
story += [P("Betten &amp; Entlassreinigung ist ein webbasiertes Tool für die digitale Verwaltung von Bettenaufbereitung, Zimmerreinigung, Sauerstofflogistik und Lagerrücksendungen in Krankenhäusern. Es läuft vollständig auf einem Windows-Server im internen Netzwerk.", body), SP(3)]

story += [P("1.1 Hauptfunktionen", h2)]
story.append(tbl([
    ["Funktion", "Beschreibung"],
    ["Stationsübersicht",  "Aufträge für normale und infektiöse Bettenaufbereitung"],
    ["Bett-Zentral",       "Zentrale Aufbereitung mit Barcode-Pflicht, ISO-Flag"],
    ["Scheuer-Wisch",      "Entlassreinigung und Schlussdesinfektion"],
    ["Meine Station",      "Pflegepersonal: Reinigung, Defekte, Sauerstoff, Rücksendungen"],
    ["Meldungen",          "Team-Meldungen und Ankündigungen mit Priorität"],
    ["Instandsetzung",     "Defektmanagement: Meldung, Reparatur, Abschluss"],
    ["Bettenstamm",        "Physische Bettenverwaltung mit Barcode"],
    ["Betten P&W",         "Prüfung & Wartung: Übersicht + P&W durchführen"],
    ["Spindverwaltung",    "Spinde verwalten, Anfragen bearbeiten"],
    ["Raumbuch",           "Raumverwaltung mit Excel-Import"],
    ["Sauerstofftransport","Wareneingang, Anfragen, Lieferung, Leergut, Warenausgang"],
    ["Rücksendungen",      "Material-Rücksendungen von Stationen ans Lager"],
    ["Dashboard",          "Schichtleiter-Übersicht aller Stationen"],
    ["Berichte",           "PDF-Export: Stationsberichte, Zentral, Sauerstoff"],
    ["Rollen & Berechtigungen", "16 frei konfigurierbare Berechtigungen"],
    ["PWA / Homescreen",   "Installierbar als App auf iPad, Smartphone"],
], [30*mm, 130*mm]))
story.append(PageBreak())

# ── 2. INSTALLATION ─────────────────────────────────────────────────────────────
story += [P("2. Installation", h1), HR()]
story += [P("2.1 Hardwarevoraussetzungen", h2)]
story.append(tbl([
    ["Komponente", "Minimum", "Empfohlen"],
    ["Betriebssystem",  "Windows 10 (64-Bit)",    "Windows Server 2019/2022/2025"],
    ["Prozessor",       "2 Kerne, 2,0 GHz",       "4 Kerne, 2,5 GHz"],
    ["RAM",             "4 GB",                    "8 GB"],
    ["Festplatte",      "20 GB frei (SSD)",        "50 GB SSD"],
    ["Netzwerk",        "100 Mbit/s",              "Gigabit-LAN"],
], [45*mm, 55*mm, 60*mm]))

story += [SP(4), P("2.2 Softwarevoraussetzung", h2)]
story += [P("Node.js 24 LTS – kostenlos von https://nodejs.org", body)]
story += [P("&#9632; Beim Node.js-Installer den Haken bei <i>Automatically install the necessary tools</i> setzen! Fehlt dieser, schlägt install.bat mit <i>node-gyp rebuild failed</i> fehl.", note), SP(3)]

story += [P("2.3 Installationsschritte", h2)]
story.append(tbl([
    ["Schritt", "Aktion"],
    ["1", "ZIP-Paket entpacken nach z. B. C:\\Apps\\betten-entlassreinigung\\"],
    ["2", "Node.js 24 LTS installieren (mit Build-Tools-Haken)"],
    ["3", "Doppelklick auf install.bat (ca. 2–5 Minuten)"],
    ["4", "Login: admin@bettenaufbereitung.local / admin123"],
    ["5", "Passwort sofort ändern: Klick auf eigenen Namen → Profil"],
], [15*mm, 145*mm]))

story += [SP(4), P("2.4 Starten, Stoppen, Aktualisieren", h2)]
story.append(tbl([
    ["Aktion", "Befehl / Hinweis"],
    ["Starten",              "start.bat"],
    ["Stoppen",              "stop.bat"],
    ["Als Windows-Dienst",   "install-service.bat"],
    ["Update (Standard)",    "ZIP in Ordner Update\\ legen → update.bat → J/N für Serverstart"],
    ["Rollback",             "Automatisch bei Build-Fehler – Datenbank wird wiederhergestellt"],
    ["Backup-Ordner",        "Update\\Archiv\\ – DB-Sicherung + archivierte ZIPs"],
], [45*mm, 115*mm]))

story += [SP(4), P("2.5 Netzwerk & Logs", h2)]
story.append(tbl([
    ["Parameter", "Wert"],
    ["Standard-Port",  "37843 (konfigurierbar in backend/.env)"],
    ["Protokoll intern","HTTP"],
    ["Kamerazugriff",  "Über nativen Datei-Dialog (kein HTTPS erforderlich)"],
    ["Logs",           "logs\\app.log (täglich rotiert, 30 Tage, JSON-Format)"],
], [45*mm, 115*mm]))
story.append(PageBreak())

# ── 3. ROLLEN & BERECHTIGUNGEN ───────────────────────────────────────────────────
story += [P("3. Rollen &amp; Berechtigungen", h1), HR()]
story += [P("Das System verwendet 16 frei konfigurierbare Berechtigungen. Nutzer mit 'verwaltung' sehen immer alle Tabs.", body), SP(3)]

story += [P("3.1 Die 16 Berechtigungen", h2)]
story.append(tbl([
    ["Berechtigung", "Tab / Funktion"],
    ["bettenaufbereitung",       "Stationsübersicht – Aufträge annehmen und bearbeiten"],
    ["bettenaufbereitung_zentral","Bett-Zentral – zentrale Aufbereitung"],
    ["zimmerreinigung",          "Scheuer-Wisch Tab (Reinigungskräfte bearbeiten Aufträge)"],
    ["stationspersonal",         "Meine Station – Pflegepersonal"],
    ["betten_reparatur",         "Instandsetzung – Defekte verwalten, Betten sperren"],
    ["bettenstamm",              "Bettenstamm – physische Betten anlegen und pflegen"],
    ["betten_pw",                "Betten P&W – Prüftermin-Übersicht und P&W durchführen"],
    ["dashboard",                "Schichtleiter-Dashboard"],
    ["berichte",                 "Berichte – Stationsberichte und PDF-Export"],
    ["meldungen",                "Meldungen – erstellen, bearbeiten und löschen"],
    ["spindverwaltung",          "Spindverwaltung – Spinde und Anfragen verwalten"],
    ["raumbuch",                 "Raumbuch – Raumverwaltung und Excel-Import"],
    ["auftraege_erstellen",      "Neue Aufträge anlegen"],
    ["benutzerverwaltung",       "Mitarbeiter, Rollen und Teams verwalten"],
    ["sauerstofftransport",      "Sauerstofftransport-Modul (Scan, Anfragen, Lager)"],
    ["verwaltung",               "Vollzugriff auf alle Tabs und Verwaltungs-Bereiche (Admin)"],
], [50*mm, 110*mm]))

story += [SP(3), P("&#9632; Wichtig: stationspersonal darf Scheuer-Wisch beauftragen OHNE die Berechtigung 'zimmerreinigung'.", note), SP(3)]

story += [P("3.2 Empfohlene Rollen-Konfiguration", h2)]
story.append(tbl([
    ["Rollen-Name", "Berechtigungen", "Für"],
    ["Pflegepersonal",        "stationspersonal",                                                           "Krankenpflege auf Station"],
    ["Reinigungskraft Dez.",  "bettenaufbereitung, zimmerreinigung",                                        "Reinigung auf Station"],
    ["Reinigungskraft Zentral","bettenaufbereitung_zentral",                                                "Personal Aufbereitungsanlage"],
    ["Schichtleiter",         "bettenaufbereitung, zimmerreinigung, berichte, dashboard,\nauftraege_erstellen, meldungen", "Bereichsleitung"],
    ["Techniker",             "betten_reparatur, bettenstamm, betten_pw",                                   "Haustechnik / Instandsetzung"],
    ["Sauerstofftransport",   "sauerstofftransport",                                                        "Sauerstofflieferung im Haus"],
    ["Spindverwalter",        "spindverwaltung",                                                            "Spind-Verwaltung"],
    ["Administrator",         "alle 16 Berechtigungen",                                                     "IT / Leitung"],
], [40*mm, 80*mm, 40*mm]))
story.append(PageBreak())

# ── 4. ERSTE SCHRITTE ───────────────────────────────────────────────────────────
story += [P("4. Erste Schritte nach der Installation", h1), HR()]
story.append(tbl([
    ["Schritt", "Aktion"],
    ["1",  "Admin-Login: admin@bettenaufbereitung.local / admin123"],
    ["2",  "Passwort ändern: Klick auf eigenen Namen → Profil"],
    ["3",  "Verwaltung → Rollen anlegen und Berechtigungen vergeben"],
    ["4",  "Verwaltung → Häuser, Bereiche, Stationen, Zimmer anlegen"],
    ["5",  "Verwaltung → Betten (Platzhalterbetten) anlegen"],
    ["6",  "Verwaltung → Aufbereitungsarten für Bett-Zentral anlegen"],
    ["7",  "Verwaltung → Berufsgruppen für Spind-Anfragen anlegen"],
    ["8",  "Verwaltung → Mitarbeiter anlegen und Rollen zuweisen"],
    ["9",  "Bettenstamm → Physische Betten anlegen (Barcode, Typ, Prüftermin)"],
    ["10", "Verwaltung → O2 → Lager und Flaschentypen anlegen (Sauerstoffmodul)"],
    ["11", "Verwaltung → Rücks.-Gründe → Abschluss-Gründe für Rücksendungen anlegen"],
], [15*mm, 145*mm]))
story.append(PageBreak())

# ── 5. BENUTZEROBERFLÄCHE ───────────────────────────────────────────────────────
story += [P("5. Benutzeroberfläche &amp; Navigation", h1), HR()]
story += [P("5.1 Sidebar-Navigation (Desktop ≥ 1024px)", h2)]
story.append(tbl([
    ["Menüpunkt", "Berechtigung", "Funktion"],
    ["Stationsübersicht",      "bettenaufbereitung",       "Dezentrale Bettenaufbereitung"],
    ["Bett-Zentral",           "bettenaufbereitung_zentral","Zentrale Bettenaufbereitung"],
    ["Scheuer-Wisch",          "zimmerreinigung",           "Aufträge bearbeiten"],
    ["Meine Station",          "stationspersonal",          "Pflegepersonal: Reinigung & Defekte"],
    ["Dashboard",              "dashboard",                 "Schichtleiter-Gesamtübersicht"],
    ["Instandsetzung",         "betten_reparatur",          "Defektmanagement"],
    ["Bettenstamm",            "bettenstamm",               "Physische Betten verwalten"],
    ["Betten P&W",             "betten_pw",                 "Prüftermin-Übersicht"],
    ["Spindverwaltung",        "spindverwaltung",           "Spinde und Anfragen"],
    ["Raumbuch",               "raumbuch",                  "Raumverwaltung"],
    ["Sauerstofftransport",    "sauerstofftransport",       "O2-Logistik: Scan & Anfragen"],
    ["Rücksendungen",          "verwaltung",                "Rücksendungen bearbeiten"],
    ["Meldungen",              "meldungen",                 "Team-Meldungen"],
    ["Berichte",               "berichte",                  "Stationsberichte und PDF-Export"],
    ["Verwaltung",             "verwaltung",                "Systemverwaltung"],
], [45*mm, 55*mm, 60*mm]))

story += [SP(3), P("5.2 Mobile Navigation", h2)]
story += [P("Hamburger-Button oben links öffnet die Sidebar. Schließt automatisch bei Seitenwechsel.", body)]
story += [SP(2), P("5.3 Hochkontrast-Modus", h2)]
story += [P("Button 'Kontrast' in der Sidebar: schwarzer Hintergrund, weißer Text, gelbe Akzente (WCAG AA). Wird nicht gespeichert – bei jedem Login wieder normal.", body)]
story += [SP(2), P("5.4 App als PWA installieren", h2)]
story += [P("iPad/iPhone (Safari): Teilen → Zum Home-Bildschirm | Android (Chrome): Menü → App installieren.", body)]
story.append(PageBreak())

# ── 6–8 KERNMODULE ─────────────────────────────────────────────────────────────
story += [P("6. Stationsübersicht – Dezentrale Bettenaufbereitung", h1), HR()]
story += [P("Zeigt alle Stationen im zugewiesenen Bereich, sortiert nach Prioritätsscore.", body), SP(2)]
story += [P("6.1 Auftrag annehmen (Reinigungskraft)", h2)]
story.append(tbl([
    ["Schritt", "Aktion"],
    ["1","Station antippen → Auftrag antippen"],
    ["2","'Auf dem Weg' drücken"],
    ["3","Auf der Station ankommen → 'Angekommen' drücken"],
    ["4","'Auftrag im Zimmer annehmen' → Reinigung startet"],
    ["5","Checkliste abhaken, Fotos machen"],
    ["6","Barcode des physischen Betts scannen (empfohlen)"],
    ["7","'Auftrag als erledigt melden'"],
], [15*mm, 145*mm]))

story += [SP(4), P("7. Bett-Zentral – Zentrale Aufbereitung", h1), HR()]
story += [P("Empfängt Betten aus dem gesamten Haus. Barcode ist Pflichtfeld.", body), SP(2)]
story.append(tbl([
    ["Schritt", "Inhalt"],
    ["1 – Barcode",         "Pflichtfeld. Eingeben, aus Dropdown wählen oder per Kamera scannen."],
    ["2 – Bett-Typ",        "Welcher Bett-Typ wird aufbereitet?"],
    ["3 – ISO-Bett",        "ISO-Betten werden rot markiert, erfordern erhöhte Schutzmaßnahmen."],
    ["4 – Erreger",         "Falls bekannt: Erreger auswählen (optional)."],
    ["5 – Aufbereitungsart","Das anzuwendende Verfahren mit Anleitung."],
], [35*mm, 125*mm]))

story += [SP(4), P("8. Scheuer-Wisch", h1), HR()]
story += [P("Modul muss in Verwaltung → Module aktiv sein. Aufträge werden von Pflegepersonal über Meine Station oder von Reinigungskräften direkt angelegt.", body), SP(2)]
story.append(tbl([
    ["Reinigungsart", "Wann", "Besonderheit"],
    ["Standardreinigung",  "Routinemäßige Entlassreinigung", "Keine Erreger-Dokumentation nötig"],
    ["Schlussdesinfektion","Nach Isolation, infektiösen Patienten", "Erreger optional auswählbar"],
], [50*mm, 65*mm, 45*mm]))
story.append(PageBreak())

# ── 9. MEINE STATION ────────────────────────────────────────────────────────────
story += [P("9. Meine Station – Pflegepersonal", h1), HR()]
story += [P("Dedizierter Bereich für Pflegepersonal (Berechtigung: stationspersonal). Zeigt nur die eigene Station.", body), SP(2)]

story += [P("9.1 Verfügbare Aktionen", h2)]
story.append(tbl([
    ["Funktion", "Beschreibung"],
    ["+ Bettenreinigung anfordern","Station → Zimmer → Bett → Normal/Infektiös → Absenden"],
    ["+ Scheuer-Wisch",           "Zimmer, Reinigungsart und Aufbereitungsart wählen → Absenden"],
    ["+ Defektes Bett",           "Station + Barcode (optional) + Standort + Beschreibung"],
    ["+ Spind-Anfrage",           "Vorname, Nachname, Berufsgruppe, Von/Bis → Absenden"],
    ["+ Sauerstoff anfordern",    "Anzahl + Flaschentyp (optional) + Notiz → Anfrage an Transport"],
    ["+ Rücksendung melden",      "Artikel-Liste + Menge + Grund → Meldung ans Lager"],
    ["Statusübersicht",           "Aktive Aufträge der eigenen Station (nur lesen)"],
], [55*mm, 105*mm]))

story += [SP(2), P("&#9632; Pflegepersonal kann Scheuer-Wisch beauftragen OHNE 'zimmerreinigung'-Berechtigung.", note)]
story += [SP(2), P("9.2 Duplikatschutz", h2)]
story += [P("Für jedes Bett kann nur ein aktiver Auftrag gleichzeitig existieren. Bei erneutem Absenden: 'Für dieses Bett existiert bereits ein aktiver Auftrag.'", body)]
story += [SP(3), P("9.3 Sauerstoff-Anfragen (Status in Meine Station)", h2)]
story.append(tbl([
    ["Status", "Anzeige", "Bedeutung"],
    ["Offen",      "⏳ Gelb",  "Anfrage gesendet, noch nicht angenommen"],
    ["Unterwegs",  "🚚 Blau",  "Sauerstofftransport hat Anfrage angenommen"],
    ["Geliefert",  "✅ Grün",  "Flaschen wurden geliefert – Löschen möglich"],
], [30*mm, 30*mm, 100*mm]))

story += [SP(3), P("9.4 Rücksendungen (Status in Meine Station)", h2)]
story.append(tbl([
    ["Status", "Bedeutung"],
    ["Offen",        "Rücksendung gemeldet, noch nicht bearbeitet"],
    ["Angenommen",   "Lager hat die Anfrage entgegengenommen"],
    ["Abgeschlossen","Rücksendung abgewickelt (Grund sichtbar)"],
], [35*mm, 125*mm]))
story.append(PageBreak())

# ── 10–16 ──────────────────────────────────────────────────────────────────────
story += [P("10. Dashboard – Schichtleiter-Übersicht", h1), HR()]
story += [P("Zeigt alle Stationen mit Handlungsbedarf. Aktualisierung alle 30 Sekunden. Stationen ohne offene Aufträge werden ausgeblendet.", body), SP(2)]
story.append(tbl([
    ["Markierung", "Bedeutung"],
    ["Roter linker Rand",    "Höchste Priorität – sofort handeln (Score ≥ 6)"],
    ["Oranger linker Rand",  "Erhöhte Priorität (Score 3–6)"],
    ["Kein Rand / nicht sichtbar","Keine offenen Aufträge – Station ausgeblendet"],
], [45*mm, 115*mm]))

story += [SP(4), P("11. Meldungen", h1), HR()]
story += [P("Eigener Tab für Team-Meldungen (Berechtigung: meldungen). Alle eingeloggten Nutzer können aktive Meldungen lesen.", body), SP(2)]
story.append(tbl([
    ["Priorität", "Anzeige", "Verwendung"],
    ["Normal",   "Blauer Badge",  "Allgemeine Informationen"],
    ["Wichtig",  "Oranger Badge", "Zeitkritische Hinweise"],
    ["Dringend", "Roter Badge",   "Sofortmaßnahmen erforderlich"],
], [30*mm, 40*mm, 90*mm]))

story += [SP(4), P("12. Instandsetzung – Defektmanagement", h1), HR()]
story.append(tbl([
    ["Weg", "Wo", "Felder"],
    ["Pflegepersonal",  "Meine Station → '+ Defektes Bett'",        "Station, Barcode (optional), Standort, Beschreibung"],
    ["Reinigungskraft", "Stationsübersicht → '+ Defektes Bett'",    "Station, Barcode (optional), Standort, Beschreibung"],
    ["Zentral",         "Bett-Zentral → Defekt-Button auf Karte",   "Barcode vorausgefüllt, Beschreibung, Schweregrad"],
], [30*mm, 60*mm, 70*mm]))
story += [SP(2)]
story.append(tbl([
    ["Status", "Wer"],
    ["Gemeldet – erscheint in Instandsetzung-Liste",  "Automatisch nach Meldung"],
    ["In Reparatur – 'Reparatur starten' + opt. Notiz","Techniker (betten_reparatur)"],
    ["Behoben – 'Als behoben markieren'",             "Techniker"],
    ["Ausgemustert",                                   "Techniker"],
], [80*mm, 80*mm]))

story += [SP(4), P("13. Bettenstamm – Physische Bettenverwaltung", h1), HR()]
story.append(tbl([
    ["Feld", "Pflicht", "Beschreibung"],
    ["Barcode / Nummer",  "Ja",  "Eindeutiger Identifikator (aufgeklebter Strichcode)"],
    ["Bett-Typ",          "Nein","Art des Betts (Standardbett, Intensivbett …)"],
    ["Hersteller / Modell","Nein","z. B. Stiegelmeyer, Linet"],
    ["Nächster Prüftermin","Nein","Datum der nächsten Prüfung"],
    ["Notizen",           "Nein","Interne Hinweise"],
], [45*mm, 20*mm, 95*mm]))

story += [SP(4), P("14. Betten P&amp;W – Prüfung &amp; Wartung", h1), HR()]
story.append(tbl([
    ["Kachel", "Bedeutung"],
    ["Überfällig",    "Betten deren Prüftermin bereits überschritten ist"],
    ["Bald fällig",   "Betten mit Prüftermin in weniger als 30 Tagen"],
    ["Gesperrt",      "Aktuell gesperrte Betten"],
    ["Kein Termin",   "Betten ohne hinterlegten Prüftermin"],
], [35*mm, 125*mm]))
story.append(PageBreak())

story += [P("15. Spindverwaltung", h1), HR()]
story += [P("Modul muss in Verwaltung → Module aktiv sein.", body), SP(2)]
story += [P("15.1 Spind-Anfrage (Pflegepersonal über Meine Station)", h2)]
story += [P("Pflichtfelder: Vorname, Nachname, Berufsgruppe. Der Bereich/Station wird automatisch aus dem User-Profil übernommen. Zeitraum Von/Bis ist optional.", body)]
story += [SP(2), P("15.2 Anfragen bearbeiten (Spindverwalter)", h2)]
story.append(tbl([
    ["Aktion", "Beschreibung"],
    ["Spind zuweisen","Freien Spind aus Dropdown wählen, Von/Bis bestätigen"],
    ["Ablehnen",      "Status 'abgelehnt', sichtbar in Meine Station"],
], [40*mm, 120*mm]))

story += [SP(4), P("16. Raumbuch", h1), HR()]
story += [P("Raumverwaltung mit Import-Funktion. Hierarchie: Haus → Bereich → Zimmer → Stellplatz.", body), SP(2)]
story += [P("16.1 Excel-Import", h2)]
story.append(tbl([
    ["Schritt", "Aktion"],
    ["1","Excel-Datei auswählen (.xlsx)"],
    ["2","Spalten manuell den Feldern zuordnen (kein Auto-Mapping)"],
    ["3","Importieren – Zeilen mit fehlenden Pflichtfeldern werden übersprungen"],
], [15*mm, 145*mm]))
story += [SP(2), P("Pflichtfelder: Haus, Bereich, Raumnummer. Optional: Raumbezeichnung, Etage, Fläche, Stellplatz.", body)]
story.append(PageBreak())

# ── 17. SAUERSTOFFTRANSPORT ─────────────────────────────────────────────────────
story += [P("17. Sauerstofftransport", h1), HR()]
story += [P("Das Sauerstoffmodul verwaltet den gesamten Lebenszyklus von Sauerstoffflaschen im Haus – von der Lieferantenlieferung bis zur Rückgabe.", body), SP(2)]

story += [P("17.1 Status-Modell der Flaschen", h2)]
story.append(tbl([
    ["Status", "Bedeutung"],
    ["Volllager",        "Volle Flasche im Lager, zur Verteilung bereit"],
    ["Unterwegs",        "Flasche ist beim Transporter / auf dem Weg zur Station"],
    ["Auf Station",      "Flasche wurde an Station übergeben"],
    ["Leer/Unterwegs",   "Leere Flasche, auf dem Rückweg ins Lager"],
    ["Leergutlager",     "Leere Flasche im Leergutlager, wartet auf Abholung"],
    ["Beim Lieferanten", "Flasche wurde an den Lieferanten zurückgegeben"],
], [40*mm, 120*mm]))

story += [SP(3), P("17.2 Scan-Modi", h2)]
story.append(tbl([
    ["Modus", "Wann verwenden", "Resultat", "Auto-Anlage"],
    ["📦 Wareneingang",    "Lieferant bringt volle Flaschen",     "→ Volllager",        "✓"],
    ["🚚 Tour / Anfrage",  "Flaschen aus Volllager für Anfrage",   "→ Unterwegs",        "✗"],
    ["📥 Leere einsammeln","Leere Flaschen von Station holen",     "→ Leer/Unterwegs",   "✗"],
    ["↩️ Ins Leergutlager","Leere Flaschen einlagern",            "→ Leergutlager",     "✗"],
    ["📤 Warenausgang",    "Leere Flaschen an Lieferanten",        "→ Beim Lieferanten", "✗"],
], [35*mm, 50*mm, 40*mm, 25*mm]))

story += [SP(2), P("&#9632; Wareneingang: Unbekannte Barcodes werden automatisch als neue Flaschen angelegt.", note)]

story += [SP(3), P("17.3 Anfragen-Workflow", h2)]
story.append(tbl([
    ["Schritt", "Wer", "Aktion"],
    ["1","Pflegepersonal",       "Meine Station → '+ Sauerstoff anfordern' → Anzahl + Typ → Senden"],
    ["2","Sauerstofftransport",  "Tab 'Anfragen' → 'Annehmen & Scannen'"],
    ["3","Sauerstofftransport",  "Modus 'Tour starten' → Flaschen aus Volllager scannen"],
    ["4","Sauerstofftransport",  "'Auftrag abschließen' → Flaschen werden auf Station gebucht"],
    ["5","System",               "Falls weniger gescannt als bestellt: Rückfrage + Anpassung der Anzahl"],
], [15*mm, 45*mm, 100*mm]))

story += [SP(3), P("17.4 Verwaltung → O2", h2)]
story.append(tbl([
    ["Tab", "Inhalt"],
    ["Lager",         "Lager anlegen und Häusern zuordnen (ein Lager pro Haus empfohlen)"],
    ["Flaschentypen", "Typen anlegen, z. B. '2,5L O2', '10L O2'"],
    ["Flaschen",      "Einzelne Flaschen mit Barcode anlegen (oder beim Wareneingang automatisch)"],
], [30*mm, 130*mm]))

story += [SP(3), P("17.5 Berichte Sauerstoff", h2)]
story.append(tbl([
    ["Bericht", "Inhalt"],
    ["Lieferungen",  "Anzahl gelieferter Flaschen pro Station und Typ"],
    ["Rückgaben",    "Anzahl eingesammelter leerer Flaschen pro Station"],
    ["Alle Bewegungen","Vollständige Bewegungshistorie mit Datum und Mitarbeiter"],
], [35*mm, 125*mm]))
story.append(PageBreak())

# ── 18. RÜCKSENDUNGEN ───────────────────────────────────────────────────────────
story += [P("18. Rücksendungen", h1), HR()]
story += [P("Ermöglicht Stationen, nicht benötigtes oder falsches Material ans Lager zurückzumelden.", body), SP(2)]

story += [P("18.1 Rücksendung melden (Pflegepersonal)", h2)]
story.append(tbl([
    ["Feld", "Pflicht", "Hinweis"],
    ["Artikel",  "Ja", "Mehrere Artikel möglich – '+' für neue Zeile"],
    ["Menge",    "Ja", "Pro Artikel, z. B. '3 Packungen'"],
    ["Grund",    "Ja", "Freitext: Warum wird zurückgesendet?"],
], [35*mm, 20*mm, 105*mm]))

story += [SP(2), P("Station wird automatisch aus dem Benutzerprofil übernommen.", body)]
story += [SP(2), P("18.2 Rücksendungen bearbeiten (Verwaltung/Lager)", h2)]
story.append(tbl([
    ["Status", "Farbe", "Aktion"],
    ["Offen",        "Gelb", "'Annehmen' – Rücksendung entgegennehmen"],
    ["Angenommen",   "Blau", "'Abschließen' + Abschluss-Grund aus Dropdown"],
    ["Abgeschlossen","Grün", "Abgeschlossen – kann gelöscht werden"],
], [35*mm, 20*mm, 105*mm]))

story += [SP(2), P("18.3 Abschluss-Gründe konfigurieren", h2)]
story += [P("Verwaltung → Tab '📦 Rücks.-Gründe': eigene Gründe anlegen, bearbeiten und löschen (z. B. 'Wieder eingelagert', 'Artikel vernichtet', 'An Lieferanten zurückgesendet').", body)]
story.append(PageBreak())

# ── 19. VERWALTUNG ──────────────────────────────────────────────────────────────
story += [P("19. Verwaltung", h1), HR()]
story += [P("Nur für Nutzer mit der Berechtigung 'verwaltung' oder 'benutzerverwaltung'.", body), SP(2)]
story.append(tbl([
    ["Tab", "Inhalt"],
    ["Mitarbeiter",       "Nutzerverwaltung: anlegen, bearbeiten, Passwort generieren"],
    ["Rollen",            "Rollen anlegen und 16 Berechtigungen vergeben"],
    ["Teams",             "Teams anlegen und Bereichen zuordnen"],
    ["Häuser",            "Krankenhäuser / Gebäude anlegen"],
    ["Bereiche",          "Abteilungen einem Haus zuordnen"],
    ["Stationen",         "Stationen einem Bereich zuordnen"],
    ["Zimmer",            "Zimmer einer Station zuordnen"],
    ["Betten",            "Platzhalterbetten anlegen (kein Barcode)"],
    ["Bett-Typen",        "Eigene Betttypen definieren"],
    ["Berufsgruppen",     "Dropdown-Werte für Spind-Anfragen"],
    ["Krankheitserreger", "Keime verwalten: Name, Risiko, Desinfektion"],
    ["Aufbereitungsarten","Verfahren für Bett-Zentral mit Anleitungen"],
    ["Einstellungen",     "Prioritätsscore-Schwellen konfigurieren"],
    ["Design",            "App-Design und Login-Seite anpassen"],
    ["Module",            "Einzelne Funktionsmodule aktivieren/deaktivieren"],
    ["Eigene Attribute",  "Zusatzfelder für Betten und Stationen definieren"],
    ["💨 O2",             "Sauerstofflager, Flaschentypen und Flaschen verwalten"],
    ["💾 Backup",         "Automatisches Backup auf Netzlaufwerk konfigurieren"],
    ["📦 Rücks.-Gründe",  "Dropdown-Gründe für Rücksendungsabschluss verwalten"],
], [45*mm, 115*mm]))
story.append(PageBreak())

# ── 20. BERICHTE ────────────────────────────────────────────────────────────────
story += [P("20. Berichte", h1), HR()]
story.append(tbl([
    ["Bericht", "Weg", "Export"],
    ["Stationsbericht",     "Berichte → Station + Zeitraum → Laden", "PDF"],
    ["Bett-Reisehistorie",  "Berichte → Barcode eingeben/scannen",   "Anzeige"],
    ["Zentral-Tagesbericht","Berichte → Von/Bis → Bericht laden",    "PDF je Tag oder Gesamtzeitraum"],
    ["Bettenstamm-Export",  "Berichte → Filter: Prüfung / Gesperrt", "CSV"],
    ["O2 Lieferungen",      "Berichte → Sauerstoff → Bericht laden", "Anzeige"],
    ["O2 Rückgaben",        "Berichte → Sauerstoff → Bericht laden", "Anzeige"],
    ["O2 Bewegungshistorie","Berichte → Sauerstoff → Bericht laden", "Anzeige"],
], [45*mm, 75*mm, 40*mm]))
story.append(PageBreak())

# ── 21. SICHERHEIT ──────────────────────────────────────────────────────────────
story += [P("21. Sicherheit &amp; Datensicherung", h1), HR()]
story += [P("21.1 Sicherheitsmechanismen", h2)]
story.append(tbl([
    ["Mechanismus", "Beschreibung"],
    ["Authentifizierung",   "JWT-Token (12h) + bcrypt Cost-Factor 12"],
    ["Rate-Limiting Login", "Max. 10 Versuche / 15 Min pro IP"],
    ["Rate-Limiting API",   "Max. 300 Anfragen / Min"],
    ["Rate-Limiting PW",    "Max. 5 Versuche / 15 Min pro IP"],
    ["Security-Header",     "Helmet.js (HSTS, X-Frame-Options)"],
    ["IDOR-Schutz",         "Aufträge und Fotos scope-geprüft"],
    ["Upload-Validierung",  "Nur JPEG, PNG, WebP, GIF; max. 10 MB; MIME + Magic-Byte"],
    ["SQL-Injection",       "Alle Inputs via parametrisierte Queries"],
    ["Settings-Whitelist",  "Nur erlaubte Schlüssel werden gespeichert"],
    ["Backup-Verschlüsselung","Backup-Passwort AES-256-GCM verschlüsselt"],
], [50*mm, 110*mm]))

story += [SP(3), P("21.2 Datensicherung", h2)]
story.append(tbl([
    ["Was", "Wo / Wann"],
    ["Datenbank",             "Eine SQLite-Datei – täglich auf Netzlaufwerk kopieren"],
    ["Automatisches Backup",  "update.bat erstellt vor jedem Update eine Sicherungskopie"],
    ["Automatisches Backup",  "Verwaltung → Backup: Netzwerkpfad + Uhrzeit konfigurieren"],
    ["Uploads-Verzeichnis",   "uploads/ ebenfalls sichern (Fotos)"],
    ["Logs",                  "logs/ sichern (30 Tage automatische Rotation)"],
    ["Archivierung",          "Aufträge nach 90 Tagen automatisch archiviert (RETENTION_DAYS)"],
], [45*mm, 115*mm]))

story += [SP(3), P("21.3 Automatisches Backup einrichten", h2)]
story.append(tbl([
    ["Feld", "Beschreibung"],
    ["Zielpfad",     "UNC-Pfad (\\\\server\\freigabe) oder lokaler Pfad (C:\\Backup)"],
    ["Uhrzeit",      "Täglich zu dieser Uhrzeit (z. B. 02:00)"],
    ["Benutzername", "Netzwerk-Benutzername (DOMAIN\\Benutzer) – leer für lokale Pfade"],
    ["Passwort",     "Wird AES-256-GCM verschlüsselt gespeichert"],
    ["Jetzt sichern","Manueller Test-Button"],
], [35*mm, 125*mm]))
story.append(PageBreak())

# ── 22. KONFIGURATION ───────────────────────────────────────────────────────────
story += [P("22. Konfiguration (backend/.env)", h1), HR()]
story.append(tbl([
    ["Variable", "Bedeutung / Standardwert"],
    ["PORT",           "37843 – Port des Servers"],
    ["HOST",           "0.0.0.0 – alle Netzwerkschnittstellen"],
    ["DB_FILE",        "./data/bettenaufbereitung.sqlite"],
    ["UPLOAD_DIR",     "./uploads – Foto-Uploads"],
    ["JWT_SECRET",     "Zufällig generiert bei Installation (mind. 32 Zeichen)"],
    ["JWT_EXPIRES_IN", "12h – Token-Gültigkeit"],
    ["CORS_ORIGIN",    "Externe Domain bei Zugriff von außerhalb des LANs"],
    ["RETENTION_DAYS", "90 – Aufträge nach X Tagen archivieren"],
    ["LOG_LEVEL",      "info – debug / info / warn / error"],
    ["LOG_DIR",        "../logs – Pfad zum Log-Verzeichnis"],
], [50*mm, 110*mm]))
story.append(PageBreak())

# ── 23. HÄUFIGE FRAGEN ──────────────────────────────────────────────────────────
story += [P("23. Häufige Fragen", h1), HR()]
story.append(tbl([
    ["Problem", "Lösung"],
    ["install.bat: Node.js nicht gefunden",   "Node.js 24 LTS von nodejs.org installieren"],
    ["install.bat: node-gyp rebuild failed",  "Node.js neu installieren, Haken bei Build Tools setzen"],
    ["Seite nicht erreichbar",               "start.bat läuft? IP-Adresse des Servers im Browser eingeben"],
    ["Login schlägt fehl",                   "Rate-Limit aktiv? 15 Min warten. Oder Passwort falsch."],
    ["Tab fehlt nach Berechtigungsvergabe",  "Nutzer abmelden und neu anmelden"],
    ["Tab 'Scheuer-Wisch' fehlt",            "Berechtigung 'zimmerreinigung' zuweisen → neu anmelden"],
    ["Tab 'Sauerstofftransport' fehlt",      "Berechtigung 'sauerstofftransport' zuweisen → neu anmelden"],
    ["Tab 'Rücksendungen' fehlt",            "Berechtigung 'verwaltung' erforderlich"],
    ["Barcode nicht im Autocomplete",        "Barcode im Bettenstamm anlegen oder per Wareneingang scannen"],
    ["O2-Scan: Ungültige Aktion",            "Falscher Modus gewählt – Flasche ist in anderem Status"],
    ["O2-Anfrage: Fehler 500",               "Migration 25/26 prüfen – FK-Constraints wurden entfernt"],
    ["Dashboard zeigt keine Stationen",      "Alle Aufträge erledigt – fertige Stationen werden ausgeblendet"],
    ["update.bat schlägt fehl",              "Log prüfen: Update\\update-log.txt – Fehlermeldung weiterleiten"],
    ["Rücksendung: JSON im Titel sichtbar",  "Update auf v4.0 – getArtikelList() parst alte Einträge korrekt"],
    ["Backup schlägt fehl",                  "Netzwerkpfad und Credentials in Verwaltung → Backup prüfen"],
    ["Log-Datei nicht gefunden",             "../logs/ Verzeichnis – relativ zum Installationsordner"],
], [65*mm, 95*mm]))

doc.build(story, onFirstPage=page_num, onLaterPages=page_num)
print(f"PDF erstellt: {OUT}")
