import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Logger lazy importieren (wird nach DB-Init geladen)
function log(msg: string) {
  try { require("./logger").migrateLogger.info(msg); } catch { console.log("[migrate]", msg); }
}
function logWarn(msg: string) {
  try { require("./logger").migrateLogger.warn(msg); } catch { console.warn("[migrate]", msg); }
}

const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.resolve(__dirname, "../../../data/openclinic.sqlite");

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

export const db = new Database(DB_FILE);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

// ── Basis-Hilfsfunktionen ────────────────────────────────────────────────────

export function query<T = any>(
  sql: string,
  params: any[] = []
): { rows: T[]; rowCount: number; lastInsertRowid?: number | bigint } {
  const reordered: any[] = [];
  const converted = sql.replace(/\$(\d+)/g, (_m, n) => {
    reordered.push(params[Number(n) - 1]);
    return "?";
  });
  const stmt = db.prepare(converted);
  const isSelect = /^\s*(SELECT|WITH|PRAGMA)/i.test(converted);
  const hasReturning = /RETURNING/i.test(converted);
  if (isSelect || hasReturning) {
    const rows = stmt.all(...reordered) as T[];
    return { rows, rowCount: rows.length };
  }
  const info = stmt.run(...reordered);
  return { rows: [], rowCount: info.changes, lastInsertRowid: info.lastInsertRowid };
}

export function transaction<R>(fn: (q: typeof query) => R): R {
  const run = db.transaction((qfn: typeof query) => fn(qfn));
  return run(query);
}

export function newId(): string { return crypto.randomUUID(); }
export function nowIso(): string { return new Date().toISOString(); }

/** Spalte hinzufügen falls nicht vorhanden – nur innerhalb von Migrationen verwenden */
function col(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.length && !cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** Index nur anlegen wenn Tabelle und Spalte existieren */
function safeIndex(name: string, table: string, column: string) {
  try {
    const cols = db.prepare(`PRAGMA table_info("${table}")`).all() as any[];
    if (cols.length === 0) return; // Tabelle existiert nicht
    if (!cols.some(c => c.name === column)) return; // Spalte existiert nicht
    db.exec(`CREATE INDEX IF NOT EXISTS ${name} ON "${table}"("${column}")`);
  } catch { /* Index konnte nicht erstellt werden – ignorieren */ }
}

// ── Migration-Runner ─────────────────────────────────────────────────────────

interface Migration {
  version: number;
  name: string;
  up: () => void;
}

const MIGRATIONS: Migration[] = [

  // ── v1: Kerntabellen ───────────────────────────────────────────────────────
  { version: 1, name: "core_tables", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS houses (
        id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
        short_code TEXT,
        house_number INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS areas (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, house_id TEXT REFERENCES houses(id) ON DELETE CASCADE,
        bereichsnummer TEXT, bezeichnung TEXT, beschreibung TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
        description TEXT,
        permissions TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission TEXT NOT NULL,
        PRIMARY KEY (role_id, permission)
      );
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, area_id TEXT REFERENCES areas(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL, pin_hash TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        role TEXT NOT NULL DEFAULT 'reiniger',
        role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
        team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
        station_name TEXT, can_change_password INTEGER NOT NULL DEFAULT 1,
        ki_ausschluss INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS user_areas (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, area_id)
      );
      CREATE TABLE IF NOT EXISTS user_houses (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        house_id TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, house_id)
      );
      CREATE TABLE IF NOT EXISTS user_stations (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        station_id TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, station_id)
      );
      CREATE TABLE IF NOT EXISTS team_areas (
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
        PRIMARY KEY (team_id, area_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_areas_user  ON user_areas(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_areas_area  ON user_areas(area_id);
      CREATE INDEX IF NOT EXISTS idx_user_houses_user ON user_houses(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_houses_house ON user_houses(house_id);
    `);
  }},

  // ── v2: Zimmer, Betten, Pathogens, Aufbereitungsarten ─────────────────────
  { version: 2, name: "rooms_beds_pathogens", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS room_types (
        id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
        icon TEXT NOT NULL DEFAULT '🚪',
        description TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        room_number TEXT NOT NULL,
        area_id TEXT REFERENCES areas(id) ON DELETE CASCADE,
        station_id TEXT REFERENCES areas(id) ON DELETE SET NULL,
        room_type_id TEXT REFERENCES room_types(id) ON DELETE SET NULL,
        raumbezeichnung TEXT, beschreibung TEXT, flaeche REAL, etage TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS bed_types (
        id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
        description TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS beds (
        id                     TEXT PRIMARY KEY,
        room_id                TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        bed_number             TEXT NOT NULL,
        bed_type_id            TEXT REFERENCES bed_types(id) ON DELETE SET NULL,
        barcode                TEXT UNIQUE REFERENCES barcodes(code) ON DELETE SET NULL,
        status                 TEXT NOT NULL DEFAULT 'frei'
                               CHECK(status IN ('frei','belegt','angefordert','unterwegs','angekommen','in_bearbeitung','bereit','gesperrt')),
        last_patient_discharge TEXT,
        created_at             TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS pathogens (
        code TEXT PRIMARY KEY, name TEXT NOT NULL,
        description TEXT,
        severity INTEGER NOT NULL DEFAULT 2,
        risk_level TEXT,
        disinfectant TEXT, cleaning_agent TEXT, hygiene_notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS aufbereitungsarten (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
        when_to_use TEXT, instructions TEXT, sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }},

  // ── v3: Barcodes ───────────────────────────────────────────────────────────
  { version: 3, name: "barcodes", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS barcodes (
        code TEXT PRIMARY KEY,
        physical_bed_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }},

  // ── v4: Aufträge (Tasks) ───────────────────────────────────────────────────
  { version: 4, name: "tasks", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id                  TEXT PRIMARY KEY,
        category            TEXT NOT NULL DEFAULT 'bed_cleaning'
                            CHECK(category IN ('bed_cleaning','room_cleaning','bed_cleaning_zentral','room_preparation')),
        status              TEXT NOT NULL DEFAULT 'offen'
                            CHECK(status IN ('offen','unterwegs','angekommen','laufend','abgeschlossen','abgenommen','abgelehnt')),
        cleaning_type       TEXT NOT NULL DEFAULT 'normal',
        pathogens           TEXT NOT NULL DEFAULT '[]',
        photos              TEXT NOT NULL DEFAULT '[]',
        priority            INTEGER NOT NULL DEFAULT 2,
        is_iso              INTEGER NOT NULL DEFAULT 0,
        bed_id              TEXT REFERENCES beds(id) ON DELETE SET NULL,
        room_id             TEXT REFERENCES rooms(id) ON DELETE SET NULL,
        station_id          TEXT,
        bed_type_id         TEXT REFERENCES bed_types(id) ON DELETE SET NULL,
        aufbereitungsart_id TEXT REFERENCES aufbereitungsarten(id) ON DELETE SET NULL,
        assigned_to         TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
        signed_off_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
        signed_off_at       TEXT,
        scanned_barcode     TEXT,
        notes               TEXT,
        created_date        TEXT NOT NULL DEFAULT (date('now')),
        started_at          TEXT,
        arrived_at          TEXT,
        en_route_at         TEXT,
        completed_at        TEXT,
        wunschtermin        TEXT,
        bestaetigt_termin   TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
    `);
  }},

  // ── v5: Module & Einstellungen ─────────────────────────────────────────────
  { version: 5, name: "modules_settings", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS modules (
        key TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
        icon TEXT, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL,
        description TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
        action     TEXT NOT NULL,
        entity     TEXT,
        entity_id  TEXT,
        meta       TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_user   ON audit_log(user_id);
    `);
    // Standard-Module
    db.exec(`
      INSERT OR IGNORE INTO modules (key,name,description,icon,active,sort_order) VALUES
        ('auth',              'Anmeldung & Sicherheit','Login, JWT-Authentifizierung und Benutzersitzungen – Kernmodul','🔒', 1, 0),
        ('benutzerverwaltung','Benutzer & Rollen',     'Mitarbeiter, Rollen und Teams verwalten – Kernmodul',          '👥', 1, 0),
        ('bettenstamm_core',  'Bettenstamm',           'Physische Betten mit Barcode und Prüfterminen – Kernmodul',    '🛏', 1, 0),
        ('raumbuch',          'Raumbuch',               'Häuser, Bereiche, Stationen, Zimmer und Platzhalterbetten – Kernmodul','🗺️', 1, 0),
        ('bed_cleaning',      'Bettenaufbereitung',     'Dezentrale Bettenaufbereitung',           '🛏️', 1, 1),
        ('bed_cleaning_zentral','Bett-Zentral',         'Zentrale Bettenaufbereitung',             '🏥', 1, 2),
        ('room_cleaning',     'Scheuer-Wisch',          'Entlassreinigung und Schlussdesinfektion', '🧹', 1, 3),
        ('oxygen_transport',  'Sauerstofftransport',    'Sauerstoffflaschen-Logistik',             '💨', 0, 4),
        ('bed_defects',       'Instandsetzung',         'Defektmanagement für Betten',             '🔧', 1, 5),
        ('meldungen',         'Meldungen',              'Meldungen und Ankündigungen für das Team', '📢', 1, 6),
        ('spindverwaltung',   'Spindverwaltung',        'Spinde und Anfragen verwalten',           '🔐', 0, 7),
        ('waesche',            'Kissen & Bettdecken',     'Waesche-Anfragen von Stationen',           '🛏', 0, 9),
        ('chat',               'Stations-Chat',           'Gemeinsamer Chat für alle Stationen',      '💬', 0, 10);
    `);
  }},

  // ── v6: Anleitungen & Attribute ────────────────────────────────────────────
  { version: 6, name: "instructions_attributes", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS instructions (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
        category TEXT, sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS checklists (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        item_name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_completed INTEGER NOT NULL DEFAULT 0,
        completed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        completed_at TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS attribute_definitions (
        id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, name TEXT NOT NULL,
        field_type TEXT NOT NULL DEFAULT 'text', options TEXT,
        required INTEGER DEFAULT 0, active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS attribute_values (
        id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
        attribute_definition_id TEXT NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
        value TEXT,
        UNIQUE(entity_type, entity_id, attribute_definition_id)
      );
      CREATE INDEX IF NOT EXISTS idx_attr_values_entity ON attribute_values(entity_type, entity_id);
    `);
  }},

  // ── v7: Physische Betten & Defekte ─────────────────────────────────────────
  { version: 7, name: "physical_beds_defects", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS physical_beds (
        id TEXT PRIMARY KEY,
        barcode TEXT UNIQUE NOT NULL,
        bed_type_id TEXT REFERENCES bed_types(id) ON DELETE SET NULL,
        hersteller TEXT, modell TEXT, seriennummer TEXT, baujahr INTEGER,
        gesperrt INTEGER NOT NULL DEFAULT 0, gesperrt_grund TEXT, gesperrt_seit TEXT,
        naechste_pruefung TEXT, prueftermin TEXT,
        notizen TEXT, updated_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_physical_beds_barcode ON physical_beds(barcode);

      CREATE TABLE IF NOT EXISTS bed_defects (
        id              TEXT PRIMARY KEY,
        title           TEXT NOT NULL,
        description     TEXT,
        notes           TEXT,
        severity        TEXT NOT NULL DEFAULT 'normal'
                        CHECK(severity IN ('niedrig','normal','hoch','kritisch')),
        status          TEXT NOT NULL DEFAULT 'gemeldet'
                        CHECK(status IN ('gemeldet','in_reparatur','behoben','ausgemustert')),
        bed_id          TEXT REFERENCES beds(id) ON DELETE SET NULL,
        room_id         TEXT REFERENCES rooms(id) ON DELETE SET NULL,
        scanned_barcode TEXT,
        barcode         TEXT,
        station_id      TEXT REFERENCES areas(id) ON DELETE SET NULL,
        reported_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
        assigned_to     TEXT REFERENCES users(id) ON DELETE SET NULL,
        photos          TEXT,
        resolved_at     TEXT,
        updated_at      TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_bed_defects_status ON bed_defects(status);
    `);
  }},

  // ── v8: Meldungen (Announcements) ──────────────────────────────────────────
  { version: 8, name: "announcements", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','wichtig','dringend')),
        expires_at TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }},

  // ── v9: Spindverwaltung ────────────────────────────────────────────────────
  { version: 9, name: "spindverwaltung", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS lockers (
        id TEXT PRIMARY KEY, number TEXT NOT NULL,
        room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
        notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS locker_assignments (
        id TEXT PRIMARY KEY,
        locker_id TEXT NOT NULL REFERENCES lockers(id) ON DELETE CASCADE,
        person_vorname TEXT NOT NULL DEFAULT '',
        person_name TEXT NOT NULL DEFAULT '',
        person_berufsgruppe TEXT,
        starts_at TEXT, ends_at TEXT, ended_at TEXT, ended_by TEXT,
        assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS locker_requests (
        id TEXT PRIMARY KEY,
        vorname TEXT, nachname TEXT,
        berufsgruppe TEXT NOT NULL,
        station_id TEXT REFERENCES areas(id) ON DELETE SET NULL,
        station_name TEXT,
        status TEXT NOT NULL DEFAULT 'offen' CHECK(status IN ('offen','zugewiesen','abgelehnt')),
        locker_id TEXT REFERENCES lockers(id) ON DELETE SET NULL,
        locker_number TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        starts_at TEXT, ends_at TEXT,
        resolved_at TEXT, resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        personalnummer TEXT, employee_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_locker_requests_status ON locker_requests(status);
    `);
  }},

  // ── v10: Berufsgruppen ─────────────────────────────────────────────────────
  { version: 10, name: "berufsgruppen", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS berufsgruppen (
        id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        aktiv INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const defaults = [
      "Pflegefachkraft","Gesundheits- und Krankenpfleger/in","Altenpfleger/in",
      "Arzt / Ärztin","Facharzt / Fachärztin","Chefarzt / Chefärztin",
      "Medizinische Fachangestellte (MFA)","Physiotherapeut/in","Ergotherapeut/in",
      "Logopäde / Logopädin","Hebamme / Entbindungspfleger",
      "Reinigungskraft / Hauswirtschaft","Techniker/in / Haustechnik",
    ];
    const ins = db.prepare(`INSERT OR IGNORE INTO berufsgruppen (id,name) VALUES (?,?)`);
    defaults.forEach(n => ins.run(crypto.randomUUID(), n));
  }},

  // ── v11: Seed-Daten (Pathogens, Bed-Types, Admin-User) ────────────────────
  { version: 11, name: "seed_data", up: () => {
    // Krankheitserreger (RKI §7 IfSG)
    const pathogens = [
      ["MRSA","MRSA (Methicillin-resistenter S. aureus)","hoch"],
      ["MRGN3","3MRGN (3 Multiresistente gram-neg. Erreger)","hoch"],
      ["MRGN4","4MRGN (4 Multiresistente gram-neg. Erreger)","kritisch"],
      ["VRE","VRE (Vancomycin-resistente Enterokokken)","hoch"],
      ["CDIFF","C. difficile (Clostridioides difficile)","hoch"],
      ["NOROVIRUS","Norovirus","normal"],
      ["SALMONELLA","Salmonella spp.","normal"],
      ["TB","Tuberkulose (Mycobacterium tuberculosis)","hoch"],
      ["HIV","HIV","normal"],
      ["HBV","Hepatitis B","normal"],
      ["HCV","Hepatitis C","normal"],
      ["COVID19","COVID-19 (SARS-CoV-2)","normal"],
      ["INFLUENZA","Influenza (Grippe)","normal"],
      ["RSV","RSV (Respiratorisches Synzytial-Virus)","niedrig"],
      ["ESBL","ESBL-bildende Enterobacteriaceae","hoch"],
      ["SCABIES","Skabies (Krätze)","normal"],
      ["LYME","Borreliose","niedrig"],
      ["LEGIONELLA","Legionellen","hoch"],
      ["ROTAVIRUS","Rotavirus","normal"],
      ["SARS","SARS (Schweres akutes Atemwegssyndrom)","kritisch"],
    ];
    const ins = db.prepare(`INSERT OR IGNORE INTO pathogens (code,name,risk_level) VALUES (?,?,?)`);
    pathogens.forEach(([code, name, risk]) => ins.run(code, name, risk));

    // Bett-Typen
    const bedTypes = ["Standardbett","Intensivbett","Kinderbett","Pflegebett","Elektrisch verstellbar","Bariatrisch"];
    const insB = db.prepare(`INSERT OR IGNORE INTO bed_types (id,name) VALUES (?,?)`);
    bedTypes.forEach(n => insB.run(crypto.randomUUID(), n));

    // Admin-User (nur wenn noch keiner da)
    const existing = db.prepare(`SELECT id FROM users LIMIT 1`).get();
    if (!existing) {
      const bcryptjs = require("bcryptjs");
      const hash = bcryptjs.hashSync("admin123", 12);
      const allPerms = [
        "bettenaufbereitung","bettenaufbereitung_zentral","zimmerreinigung","berichte",
        "auftraege_erstellen","dashboard","sauerstofftransport","lager","betten_reparatur",
        "stationspersonal","bettenstamm","betten_pw","meldungen","raumbuch",
        "benutzerverwaltung","spindverwaltung","waesche","chat","raumbuchung","raumbuchung_stellvertretung","raumbuchungsadmin","verwaltung"
      ];
      const roleId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      db.prepare(`INSERT INTO roles (id,name,permissions) VALUES (?,?,?)`).run(
        roleId, "Administrator", JSON.stringify(allPerms)
      );
      db.prepare(`INSERT INTO users (id,email,full_name,password_hash,pin_hash,active,role_id) VALUES (?,?,?,?,?,1,?)`).run(
        userId, "admin@openclinic.local", "Administrator", hash,
        bcryptjs.hashSync("1234", 10), roleId
      );
    } else {
      // Bestehende Administrator-Rolle auf alle Permissions aktualisieren
      const allPerms = [
        "bettenaufbereitung","bettenaufbereitung_zentral","zimmerreinigung","berichte",
        "auftraege_erstellen","dashboard","sauerstofftransport","lager","betten_reparatur",
        "stationspersonal","bettenstamm","betten_pw","meldungen","raumbuch",
        "benutzerverwaltung","spindverwaltung","waesche","chat","raumbuchung","raumbuchung_stellvertretung","raumbuchungsadmin","verwaltung"
      ];
      db.prepare(`UPDATE roles SET permissions=? WHERE name='Administrator'`).run(JSON.stringify(allPerms));
    }
  }},

  // ── v12: Häuser automatisch nummerieren ───────────────────────────────────
  { version: 12, name: "house_numbering", up: () => {
    const unnumbered = db.prepare(`SELECT id FROM houses WHERE house_number IS NULL ORDER BY rowid`).all() as { id: string }[];
    const maxRow = db.prepare(`SELECT COALESCE(MAX(house_number),0) AS m FROM houses`).get() as { m: number };
    let next = (maxRow?.m ?? 0) + 1;
    const upd = db.prepare(`UPDATE houses SET house_number=? WHERE id=?`);
    unnumbered.forEach(h => upd.run(next++, h.id));
  }},

  // ── v13: Raumbuch – Rooms station_id nullable ──────────────────────────────
  { version: 13, name: "rooms_nullable_station", up: () => {
    const cols = db.prepare(`PRAGMA table_info(rooms)`).all() as any[];
    const stationCol = cols.find(c => c.name === "station_id");
    if (stationCol && stationCol.notnull === 1) {
      db.exec(`PRAGMA foreign_keys = OFF`);
      db.exec(`
        CREATE TABLE rooms_v2 (
          id TEXT PRIMARY KEY, room_number TEXT NOT NULL,
          area_id TEXT REFERENCES areas(id) ON DELETE CASCADE,
          station_id TEXT REFERENCES areas(id) ON DELETE SET NULL,
          room_type_id TEXT REFERENCES room_types(id) ON DELETE SET NULL,
          raumbezeichnung TEXT, beschreibung TEXT, flaeche REAL, etage TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO rooms_v2 SELECT id,room_number,area_id,station_id,room_type_id,
          raumbezeichnung,beschreibung,flaeche,etage,created_at FROM rooms;
        DROP TABLE rooms;
        ALTER TABLE rooms_v2 RENAME TO rooms;
      `);
      db.exec(`PRAGMA foreign_keys = ON`);
    }
    // Etage-Spalte sicherstellen
    col("rooms", "etage", "TEXT");
  }},

  // ── v14: Stationen → Bereiche Migration ───────────────────────────────────
  { version: 14, name: "stations_to_areas", up: () => {
    col("areas", "bereichsnummer", "TEXT");
    col("areas", "bezeichnung",    "TEXT");
    col("areas", "beschreibung",   "TEXT");
    db.exec(`UPDATE areas SET bezeichnung=name WHERE bezeichnung IS NULL`);
    db.exec(`UPDATE areas SET bereichsnummer=(SELECT CAST(rowid AS TEXT) FROM areas a2 WHERE a2.id=areas.id) WHERE bereichsnummer IS NULL`);
    // stations → areas migrieren (falls noch alte stations-Tabelle vorhanden)
    try {
      const stTbl = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='stations'`).get();
      if (stTbl) {
        db.exec(`PRAGMA foreign_keys = OFF`);
        db.exec(`INSERT OR IGNORE INTO areas (id,name,house_id,bezeichnung,bereichsnummer) SELECT id,name,house_id,name,kuerzel FROM stations`);
        db.exec(`PRAGMA foreign_keys = ON`);
      }
    } catch { /* skip */ }
  }},

  // ── v15: Beds Status-Constraint erweitern ──────────────────────────────────
  { version: 15, name: "beds_status_constraint", up: () => {
    const cols = db.prepare(`PRAGMA table_info(beds)`).all() as any[];
    if (!cols.find(c => c.name === "status")) {
      db.exec(`ALTER TABLE beds ADD COLUMN status TEXT NOT NULL DEFAULT 'frei'`);
      return;
    }
    // Prüfe ob Constraint bereits erweitert ist (neues Schema hat 'angefordert')
    const hasBedRebuild = cols.some((c: any) => c.name === "last_patient_discharge");
    if (hasBedRebuild) return; // Neues Schema – überspringen
    // Constraint über Tabellenneuanlage aktualisieren
    db.exec(`PRAGMA foreign_keys = OFF`);
    db.exec(`
      CREATE TABLE IF NOT EXISTS beds_v2 (
        id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        bed_number TEXT NOT NULL,
        bed_type_id TEXT REFERENCES bed_types(id) ON DELETE SET NULL,
        barcode TEXT UNIQUE REFERENCES barcodes(code) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'frei' CHECK(status IN ('frei','belegt','angefordert','unterwegs','angekommen','in_bearbeitung','bereit','gesperrt')),
        last_patient_discharge TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO beds_v2 SELECT id,room_id,bed_number,bed_type_id,barcode,
        CASE WHEN status IN ('frei','belegt','in_reinigung','gesperrt') THEN
          CASE status WHEN 'in_reinigung' THEN 'in_bearbeitung' ELSE status END
        ELSE 'frei' END,
        NULL, created_at FROM beds;
      DROP TABLE beds;
      ALTER TABLE beds_v2 RENAME TO beds;
    `);
    db.exec(`PRAGMA foreign_keys = ON`);
  }},

  // ── v16: Tasks-Erweiterungen ───────────────────────────────────────────────
  { version: 16, name: "tasks_extensions", up: () => {
    col("tasks", "arrived_at",        "TEXT");
    col("tasks", "en_route_at",       "TEXT");
    col("tasks", "scanned_barcode",   "TEXT");
    col("tasks", "aufbereitungsart_id","TEXT REFERENCES aufbereitungsarten(id) ON DELETE SET NULL");
    col("tasks", "is_iso",            "INTEGER NOT NULL DEFAULT 0");
    col("tasks", "bed_type_id",       "TEXT REFERENCES bed_types(id) ON DELETE SET NULL");
    col("tasks", "photos",            "TEXT");
    col("tasks", "notes",             "TEXT");
  }},

  // ── v17: Bett-Zentral Kategorie & Tasks v9 ─────────────────────────────────
  { version: 17, name: "tasks_zentral_category", up: () => {
    // category-Constraint erweitern via Tabellenneuanlage
    const cols = db.prepare(`PRAGMA table_info(tasks)`).all() as any[];
    if (!cols.length) return;
    // Wenn pathogen_code nicht existiert, ist tasks schon im neuen Schema – überspringen
    if (!cols.some((c: any) => c.name === "pathogen_code")) return;
    db.exec(`PRAGMA foreign_keys = OFF`);
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks_v9 (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL DEFAULT 'bed_cleaning'
          CHECK(category IN ('bed_cleaning','room_cleaning','bed_cleaning_zentral','oxygen_transport')),
        status TEXT NOT NULL DEFAULT 'offen'
          CHECK(status IN ('offen','unterwegs','angekommen','laufend','abgeschlossen','archiviert')),
        bed_id TEXT REFERENCES beds(id) ON DELETE SET NULL,
        room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
        pathogen_code TEXT REFERENCES pathogens(code) ON DELETE SET NULL,
        aufbereitungsart_id TEXT REFERENCES aufbereitungsarten(id) ON DELETE SET NULL,
        assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        scanned_barcode TEXT, is_iso INTEGER NOT NULL DEFAULT 0,
        bed_type_id TEXT REFERENCES bed_types(id) ON DELETE SET NULL,
        arrived_at TEXT, en_route_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT, archived_at TEXT, notes TEXT, photos TEXT
      );
      INSERT OR IGNORE INTO tasks_v9
        SELECT id,
          CASE category WHEN 'room_preparation' THEN 'room_cleaning' ELSE category END,
          CASE status WHEN 'archiviert' THEN 'archiviert' ELSE status END,
          bed_id,room_id,pathogen_code,aufbereitungsart_id,assigned_to,created_by,
          scanned_barcode,COALESCE(is_iso,0),bed_type_id,arrived_at,en_route_at,
          created_at,COALESCE(updated_at,created_at),completed_at,archived_at,notes,photos
        FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_v9 RENAME TO tasks;
    `);
    db.exec(`PRAGMA foreign_keys = ON`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to)`);
  }},

  // ── v18: Locker-Requests nullable vorname/nachname ─────────────────────────
  { version: 18, name: "locker_requests_nullable_names", up: () => {
    const cols = db.prepare(`PRAGMA table_info(locker_requests)`).all() as any[];
    const vornameDef = cols.find(c => c.name === "vorname");
    if (!vornameDef || vornameDef.notnull === 0) return; // schon nullable
    db.exec(`PRAGMA foreign_keys = OFF`);
    db.exec(`
      CREATE TABLE locker_requests_v3 (
        id TEXT PRIMARY KEY, vorname TEXT, nachname TEXT,
        berufsgruppe TEXT NOT NULL,
        station_id TEXT REFERENCES areas(id) ON DELETE SET NULL, station_name TEXT,
        status TEXT NOT NULL DEFAULT 'offen' CHECK(status IN ('offen','zugewiesen','abgelehnt')),
        locker_id TEXT REFERENCES lockers(id) ON DELETE SET NULL, locker_number TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        starts_at TEXT, ends_at TEXT,
        resolved_at TEXT, resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        personalnummer TEXT, employee_id TEXT
      );
      INSERT INTO locker_requests_v3
        SELECT id,vorname,nachname,berufsgruppe,station_id,station_name,status,
               locker_id,locker_number,created_by,created_at,starts_at,ends_at,
               resolved_at,resolved_by,NULL,NULL FROM locker_requests;
      DROP TABLE locker_requests;
      ALTER TABLE locker_requests_v3 RENAME TO locker_requests;
    `);
    db.exec(`PRAGMA foreign_keys = ON`);
  }},

  // ── v19: Modul-Updates & Daten-Korrekturen ─────────────────────────────────
  { version: 19, name: "module_updates", up: () => {
    db.exec(`UPDATE modules SET name='Scheuer-Wisch' WHERE key='room_cleaning'`);
    db.exec(`DELETE FROM modules WHERE key='room_preparation'`);
    db.exec(`UPDATE modules SET active=1 WHERE key='bed_defects'`);
    db.exec(`INSERT OR IGNORE INTO modules (key,name,description,icon,active,sort_order)
             VALUES ('spindverwaltung','Spindverwaltung','Spinde und Anfragen verwalten','🔐',0,7)`);
    db.exec(`INSERT OR IGNORE INTO modules (key,name,description,icon,active,sort_order)
             VALUES ('raumbuch','Raumbuch','Raumverwaltung','🗺️',0,8)`);
  }},


  // ── v20: Fehlende Indizes für häufige Queries ─────────────────────────────
  { version: 20, name: "missing_indexes", up: () => {
    safeIndex("idx_tasks_bed_id",       "tasks",         "bed_id");
    safeIndex("idx_tasks_room_id",      "tasks",         "room_id");
    safeIndex("idx_tasks_created_at",   "tasks",         "created_at");
    safeIndex("idx_tasks_completed",    "tasks",         "completed_at");
    safeIndex("idx_rooms_area_id",      "rooms",         "area_id");
    safeIndex("idx_beds_room_id",       "beds",          "room_id");
    safeIndex("idx_defects_station",    "bed_defects",   "station_id");
    safeIndex("idx_physical_beds_pruef","physical_beds", "prueftermin");
  }},

  { version: 21, name: "backup_settings", up: () => {
    const ins = db.prepare(
      `INSERT OR IGNORE INTO settings (key, value, updated_at)
       VALUES (?, ?, datetime('now'))`
    );
    const defaults: [string, string][] = [
      ["backup_enabled",     "false"],
      ["backup_path",        ""],
      ["backup_time",        "02:00"],
      ["backup_username",    ""],
      ["backup_password",    ""],
      ["backup_last_run",    ""],
      ["backup_last_status", ""],
    ];
    for (const [k, v] of defaults) ins.run(k, v);
  }},

  { version: 22, name: "o2_module", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS o2_lager (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        house_id   TEXT REFERENCES houses(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS o2_flaschentypen (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        beschreibung TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS o2_flaschen (
        id         TEXT PRIMARY KEY,
        barcode    TEXT NOT NULL UNIQUE,
        typ_id     TEXT REFERENCES o2_flaschentypen(id) ON DELETE SET NULL,
        lager_id   TEXT REFERENCES o2_lager(id) ON DELETE SET NULL,
        status     TEXT NOT NULL DEFAULT 'lager'
                   CHECK(status IN ('lager','unterwegs','auf_station','leer_unterwegs','leer_lager')),
        station_id TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS o2_bewegungen (
        id          TEXT PRIMARY KEY,
        flasche_id  TEXT NOT NULL REFERENCES o2_flaschen(id) ON DELETE CASCADE,
        aktion      TEXT NOT NULL,
        von_status  TEXT NOT NULL,
        nach_status TEXT NOT NULL,
        station_id  TEXT,
        lager_id    TEXT REFERENCES o2_lager(id) ON DELETE SET NULL,
        user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
        timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
        notiz       TEXT
      );
    `);
    safeIndex("idx_o2_flaschen_barcode",   "o2_flaschen",   "barcode");
    safeIndex("idx_o2_flaschen_status",    "o2_flaschen",   "status");
    safeIndex("idx_o2_bewegungen_flasche", "o2_bewegungen", "flasche_id");
    safeIndex("idx_o2_bewegungen_ts",      "o2_bewegungen", "timestamp");
    db.exec(`INSERT OR IGNORE INTO modules (key,name,description,icon,active,sort_order)
             VALUES ('oxygen_transport','Sauerstofftransport','Sauerstoffflaschen-Logistik','💨',0,4)`);
  }},

  { version: 23, name: "o2_anfragen", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS o2_anfragen (
        id             TEXT PRIMARY KEY,
        station_id     TEXT,
        typ_id         TEXT REFERENCES o2_flaschentypen(id) ON DELETE SET NULL,
        anzahl         INTEGER NOT NULL DEFAULT 1,
        status         TEXT NOT NULL DEFAULT 'offen'
                       CHECK(status IN ('offen','angenommen','geliefert')),
        created_by     TEXT,
        angenommen_by  TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
        notiz          TEXT
      );
    `);
    safeIndex("idx_o2_anfragen_station", "o2_anfragen", "station_id");
    safeIndex("idx_o2_anfragen_status",  "o2_anfragen", "status");
  }},

  { version: 24, name: "o2_anfragen_fix_fk", up: () => {
    // Entferne FK-Constraints auf users(id) – waren zu restriktiv
    db.exec(`
      CREATE TABLE IF NOT EXISTS o2_anfragen_new (
        id             TEXT PRIMARY KEY,
        station_id     TEXT,
        typ_id         TEXT REFERENCES o2_flaschentypen(id) ON DELETE SET NULL,
        anzahl         INTEGER NOT NULL DEFAULT 1,
        status         TEXT NOT NULL DEFAULT 'offen'
                       CHECK(status IN ('offen','angenommen','geliefert')),
        created_by     TEXT,
        angenommen_by  TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
        notiz          TEXT
      );
      INSERT OR IGNORE INTO o2_anfragen_new SELECT * FROM o2_anfragen;
      DROP TABLE o2_anfragen;
      ALTER TABLE o2_anfragen_new RENAME TO o2_anfragen;
    `);
    safeIndex("idx_o2_anfragen_station", "o2_anfragen", "station_id");
    safeIndex("idx_o2_anfragen_status",  "o2_anfragen", "status");
  }},

  { version: 25, name: "o2_anfragen_no_fk", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS o2_anfragen_v2 (
        id             TEXT PRIMARY KEY,
        station_id     TEXT,
        typ_id         TEXT,
        anzahl         INTEGER NOT NULL DEFAULT 1,
        status         TEXT NOT NULL DEFAULT 'offen'
                       CHECK(status IN ('offen','angenommen','geliefert')),
        created_by     TEXT,
        angenommen_by  TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
        notiz          TEXT
      );
      INSERT OR IGNORE INTO o2_anfragen_v2 SELECT * FROM o2_anfragen;
      DROP TABLE o2_anfragen;
      ALTER TABLE o2_anfragen_v2 RENAME TO o2_anfragen;
    `);
    safeIndex("idx_o2_anfragen_station2", "o2_anfragen", "station_id");
    safeIndex("idx_o2_anfragen_status2",  "o2_anfragen", "status");
  }},

  { version: 26, name: "o2_status_redesign", up: () => {
    // Neue Tabelle mit aktualisierten Status-Namen
    db.exec(`
      CREATE TABLE IF NOT EXISTS o2_flaschen_v3 (
        id         TEXT PRIMARY KEY,
        barcode    TEXT NOT NULL UNIQUE,
        typ_id     TEXT,
        lager_id   TEXT,
        status     TEXT NOT NULL DEFAULT 'volllager'
                   CHECK(status IN ('volllager','unterwegs','auf_station','leer_unterwegs','leergutlager','beim_lieferanten')),
        station_id TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO o2_flaschen_v3
        SELECT id, barcode, typ_id, lager_id,
          CASE status
            WHEN 'lager'      THEN 'volllager'
            WHEN 'leer_lager' THEN 'leergutlager'
            ELSE status
          END,
          station_id, updated_at, created_at
        FROM o2_flaschen;
      DROP TABLE o2_flaschen;
      ALTER TABLE o2_flaschen_v3 RENAME TO o2_flaschen;
    `);
    safeIndex("idx_o2_flaschen_barcode2", "o2_flaschen", "barcode");
    safeIndex("idx_o2_flaschen_status2",  "o2_flaschen", "status");
  }},

  { version: 27, name: "ruecksendungen", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ruecksendungen (
        id            TEXT PRIMARY KEY,
        station_id    TEXT,
        station_name  TEXT,
        artikel       TEXT NOT NULL,
        menge         TEXT NOT NULL,
        grund         TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'offen'
                      CHECK(status IN ('offen','angenommen','abgeschlossen')),
        created_by    TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
        bearbeitet_by TEXT,
        notiz         TEXT
      );
    `);
    safeIndex("idx_ruecksendungen_station", "ruecksendungen", "station_id");
    safeIndex("idx_ruecksendungen_status",  "ruecksendungen", "status");
  }},

  { version: 28, name: "ruecksendung_abschluesse", up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ruecksendung_abschluesse (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO ruecksendung_abschluesse (id, name, sort_order) VALUES
        ('ra1', 'Wieder eingelagert', 1),
        ('ra2', 'Artikel vernichtet', 2),
        ('ra3', 'An Lieferanten zurückgesendet', 3),
        ('ra4', 'Anderer Station zugewiesen', 4);
    `);
  }},

  { version: 29, name: "audit_log_columns", up: () => {
    // Sicherstellen dass entity und meta Spalten vorhanden sind (ältere DBs)
    col("audit_log", "entity", "TEXT");
    col("audit_log", "meta",   "TEXT");
  }},

  { version: 30, name: "o2_anfragen_geliefert_anzahl", up: () => {
    col("o2_anfragen", "geliefert_anzahl", "INTEGER NOT NULL DEFAULT 0");
  }},

  { version: 31, name: "waesche_module", up: () => {
    db.exec(`CREATE TABLE IF NOT EXISTS waesche_typen (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      aktiv      INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`INSERT OR IGNORE INTO waesche_typen (id, name, sort_order) VALUES ('wt_kissen', 'Kissen', 1)`);
    db.exec(`INSERT OR IGNORE INTO waesche_typen (id, name, sort_order) VALUES ('wt_bettdecke', 'Bettdecke', 2)`);
    db.exec(`CREATE TABLE IF NOT EXISTS waesche_anfragen (
      id            TEXT PRIMARY KEY,
      station_id    TEXT,
      station_name  TEXT,
      status        TEXT NOT NULL DEFAULT 'offen'
                    CHECK(status IN ('offen','angenommen','erledigt')),
      notiz         TEXT,
      created_by    TEXT,
      bearbeitet_by TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS waesche_anfrage_artikel (
      id               TEXT PRIMARY KEY,
      anfrage_id       TEXT NOT NULL REFERENCES waesche_anfragen(id) ON DELETE CASCADE,
      typ_id           TEXT NOT NULL,
      anzahl           INTEGER NOT NULL DEFAULT 1,
      geliefert_anzahl INTEGER NOT NULL DEFAULT 0
    )`);
    safeIndex("idx_waesche_anfragen_station", "waesche_anfragen", "station_id");
    safeIndex("idx_waesche_anfragen_status",  "waesche_anfragen", "status");
    safeIndex("idx_waesche_artikel_anfrage",  "waesche_anfrage_artikel", "anfrage_id");
    db.exec(`INSERT OR IGNORE INTO modules (key,name,description,icon,active,sort_order)
             VALUES ('waesche','Kissen & Bettdecken','Waesche-Anfragen von Stationen','\u{1F6CF}',0,9)`);
  }},

  { version: 32, name: "waesche_ensure", up: () => {
    // Idempotenter Nachhol-Fix: läuft auch auf DBs wo Migration 31 übersprungen wurde
    db.exec(`CREATE TABLE IF NOT EXISTS waesche_typen (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      aktiv      INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`INSERT OR IGNORE INTO waesche_typen (id, name, sort_order) VALUES ('wt_kissen', 'Kissen', 1)`);
    db.exec(`INSERT OR IGNORE INTO waesche_typen (id, name, sort_order) VALUES ('wt_bettdecke', 'Bettdecke', 2)`);
    db.exec(`CREATE TABLE IF NOT EXISTS waesche_anfragen (
      id            TEXT PRIMARY KEY,
      station_id    TEXT,
      station_name  TEXT,
      status        TEXT NOT NULL DEFAULT 'offen'
                    CHECK(status IN ('offen','angenommen','erledigt')),
      notiz         TEXT,
      created_by    TEXT,
      bearbeitet_by TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS waesche_anfrage_artikel (
      id               TEXT PRIMARY KEY,
      anfrage_id       TEXT NOT NULL REFERENCES waesche_anfragen(id) ON DELETE CASCADE,
      typ_id           TEXT NOT NULL,
      anzahl           INTEGER NOT NULL DEFAULT 1,
      geliefert_anzahl INTEGER NOT NULL DEFAULT 0
    )`);
    safeIndex("idx_waesche_anfragen_station", "waesche_anfragen", "station_id");
    safeIndex("idx_waesche_anfragen_status",  "waesche_anfragen", "status");
    safeIndex("idx_waesche_artikel_anfrage",  "waesche_anfrage_artikel", "anfrage_id");
    db.exec(`INSERT OR IGNORE INTO modules (key,name,description,icon,active,sort_order)
             VALUES ('waesche','Kissen & Bettdecken','Waesche-Anfragen von Stationen','\u{1F6CF}',0,9)`);
  }},

  { version: 33, name: "roles_description", up: () => {
    col("roles", "description", "TEXT");
  }},

  { version: 34, name: "sw_termin", up: () => {
    col("tasks", "wunschtermin",      "TEXT");
    col("tasks", "bestaetigt_termin", "TEXT");
    db.exec(`INSERT OR IGNORE INTO settings (key, value) VALUES
      ('sw_freitext', 'Das Zimmer ist frei von allen persönlichen Gegenständen des Patienten.')`);
  }},

  { version: 35, name: "missing_columns", up: () => {
    col("houses",     "short_code",            "TEXT");
    col("room_types", "icon",                  "TEXT NOT NULL DEFAULT '🚪'");
    col("room_types", "sort_order",            "INTEGER NOT NULL DEFAULT 0");
    col("beds",       "last_patient_discharge","TEXT");
    col("settings",   "description",           "TEXT");
    col("announcements", "expires_at",          "TEXT");
    col("bed_defects", "scanned_barcode",       "TEXT");
    col("bed_defects", "notes",                 "TEXT");
    col("bed_defects", "bed_id",                "TEXT");
    col("bed_defects", "room_id",               "TEXT");
    col("aufbereitungsarten","when_to_use",      "TEXT");
    col("aufbereitungsarten","updated_at",       "TEXT NOT NULL DEFAULT (datetime('now'))");
    col("berufsgruppen",     "sort_order",   "INTEGER NOT NULL DEFAULT 0");
    col("berufsgruppen",     "active",       "INTEGER NOT NULL DEFAULT 1");
    col("pathogens",         "severity",     "INTEGER NOT NULL DEFAULT 2");
    col("pathogens",         "description",  "TEXT");
    // checklists Tabelle sicherstellen
    db.exec(`CREATE TABLE IF NOT EXISTS checklists (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL,
      item_name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
      is_completed INTEGER NOT NULL DEFAULT 0,
      completed_by TEXT, completed_at TEXT, notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    col("tasks",      "cleaning_type",         "TEXT NOT NULL DEFAULT 'normal'");
    col("tasks",      "pathogens",             "TEXT NOT NULL DEFAULT '[]'");
    col("tasks",      "photos",                "TEXT NOT NULL DEFAULT '[]'");
    col("tasks",      "priority",              "INTEGER NOT NULL DEFAULT 2");
    col("tasks",      "station_id",            "TEXT");
    col("tasks",      "started_at",            "TEXT");
    col("tasks",      "en_route_at",           "TEXT");
    col("tasks",      "signed_off_by",         "TEXT");
    col("tasks",      "signed_off_at",         "TEXT");
    col("tasks",      "created_date",          "TEXT");
    col("tasks",      "wunschtermin",          "TEXT");
    col("tasks",      "bestaetigt_termin",     "TEXT");
    db.exec(`INSERT OR IGNORE INTO settings (key, value) VALUES ('sw_freitext', 'Das Zimmer ist frei von allen persönlichen Gegenständen des Patienten.')`);
  }},

  { version: 36, name: "cleaning_instructions", up: () => {
    db.exec(`CREATE TABLE IF NOT EXISTS cleaning_instructions (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      cleaning_type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(category, cleaning_type)
    )`);
    col("tasks", "wunschtermin",        "TEXT");
    col("tasks", "bestaetigt_termin",   "TEXT");
    col("announcements", "expires_at",  "TEXT");
    col("tasks", "signed_off_by",       "TEXT");
    col("tasks", "signed_off_at",       "TEXT");
  }},

  { version: 37, name: "chat_messages", up: () => {
    db.exec(`CREATE TABLE IF NOT EXISTS chat_messages (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      user_name   TEXT NOT NULL,
      message     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`INSERT OR IGNORE INTO modules (key,name,description,icon,active,sort_order)
             VALUES ('chat','Stations-Chat','Gemeinsamer Chat für alle Stationen','💬',0,10)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages (created_at DESC)`);
  }},

  { version: 38, name: "ruecksendungen_v2", up: () => {
    // Neue Spalten für erweitertes Retourenmodul
    col("ruecksendungen", "anhaenge",         "TEXT NOT NULL DEFAULT '[]'");
    col("ruecksendungen", "einkauf_notiz",    "TEXT");
    col("ruecksendungen", "weitergeleitet_at","TEXT");
    col("ruecksendungen", "zurueck_at",       "TEXT");
    // Status-CHECK erweitern: bestehende Constraint droppen geht in SQLite nicht direkt.
    // Wir erlauben neue Status-Werte durch Trigger-Entfernung – SQLite ignoriert CHECK bei ALTER.
    // Neue Zeilen haben den erweiterten Status, alte bleiben kompatibel.
    // Für neue Installationen: v27 CHECK wird durch Migration überschrieben
    db.exec(`CREATE TABLE IF NOT EXISTS ruecksendungen_new (
      id              TEXT PRIMARY KEY,
      station_id      TEXT,
      station_name    TEXT,
      artikel         TEXT NOT NULL,
      menge           TEXT NOT NULL,
      grund           TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'offen'
                      CHECK(status IN ('offen','in_bearbeitung','beim_einkauf','zurueck_ans_lager','abgeschlossen')),
      created_by      TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      bearbeitet_by   TEXT,
      notiz           TEXT,
      anhaenge        TEXT NOT NULL DEFAULT '[]',
      einkauf_notiz   TEXT,
      weitergeleitet_at TEXT,
      zurueck_at      TEXT
    )`);
    // Daten migrieren (status 'angenommen' → 'in_bearbeitung')
    db.exec(`INSERT OR IGNORE INTO ruecksendungen_new
      (id,station_id,station_name,artikel,menge,grund,status,created_by,created_at,updated_at,bearbeitet_by,notiz,anhaenge)
      SELECT id,station_id,station_name,artikel,menge,grund,
        CASE status WHEN 'angenommen' THEN 'in_bearbeitung' ELSE status END,
        created_by,created_at,updated_at,bearbeitet_by,notiz,
        COALESCE(anhaenge,'[]')
      FROM ruecksendungen`);
    db.exec(`DROP TABLE ruecksendungen`);
    db.exec(`ALTER TABLE ruecksendungen_new RENAME TO ruecksendungen`);
    safeIndex("idx_ruecksendungen_station", "ruecksendungen", "station_id");
    safeIndex("idx_ruecksendungen_status",  "ruecksendungen", "status");
  }},


  { version: 39, name: "buildings", up: () => {
    db.exec(`CREATE TABLE IF NOT EXISTS buildings (
      id          TEXT PRIMARY KEY,
      house_id    TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      short_code  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    safeIndex("idx_buildings_house", "buildings", "house_id");
    col("areas", "building_id", "TEXT");
  }},


  { version: 40, name: "ruecksendungen_lager_notiz", up: () => {
    col("ruecksendungen", "lager_notiz", "TEXT");
  }},


  { version: 41, name: "shared_rooms_bookings", up: () => {
    db.exec(`CREATE TABLE IF NOT EXISTS shared_rooms (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      location      TEXT,
      teilbar       INTEGER NOT NULL DEFAULT 1,
      raum_buchbar  INTEGER NOT NULL DEFAULT 0,
      notiz         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS shared_desks (
      id            TEXT PRIMARY KEY,
      room_id       TEXT NOT NULL REFERENCES shared_rooms(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS shared_bookings (
      id            TEXT PRIMARY KEY,
      room_id       TEXT NOT NULL REFERENCES shared_rooms(id) ON DELETE CASCADE,
      desk_id       TEXT REFERENCES shared_desks(id) ON DELETE CASCADE,
      whole_room    INTEGER NOT NULL DEFAULT 0,
      user_id       TEXT NOT NULL,
      user_name     TEXT,
      start_at      TEXT NOT NULL,
      end_at        TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    safeIndex("idx_shared_desks_room",     "shared_desks",    "room_id");
    safeIndex("idx_shared_bookings_room",  "shared_bookings", "room_id");
    safeIndex("idx_shared_bookings_desk",  "shared_bookings", "desk_id");
    safeIndex("idx_shared_bookings_user",  "shared_bookings", "user_id");
    safeIndex("idx_shared_bookings_start", "shared_bookings", "start_at");
    db.exec(`INSERT OR IGNORE INTO modules (key,name,description,icon,active,sort_order)
             VALUES ('raumbuchung','Raumbuchung','Gemeinsam genutzte Räume und Tische buchen','🪑',0,11)`);
  }},


  { version: 42, name: "shared_bookings_stellvertretung", up: () => {
    // Erfasst wer die Buchung tatsächlich angelegt hat, falls stellvertretend
    // für eine andere Person gebucht wurde (z. B. Sekretariat für Chefarzt).
    col("shared_bookings", "booked_by_id",   "TEXT");
    col("shared_bookings", "booked_by_name", "TEXT");
  }},


  { version: 43, name: "shared_booking_delegates", up: () => {
    // Explizite Stellvertretungs-Zuordnung: wer (delegate) darf fuer wen
    // (represented) buchen. Ersetzt die pauschale "fuer jeden buchen"-Logik.
    db.exec(`CREATE TABLE IF NOT EXISTS shared_booking_delegates (
      id               TEXT PRIMARY KEY,
      delegate_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      represented_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(delegate_id, represented_id)
    )`);
    safeIndex("idx_shared_delegates_delegate",    "shared_booking_delegates", "delegate_id");
    safeIndex("idx_shared_delegates_represented", "shared_booking_delegates", "represented_id");
  }},


  { version: 44, name: "shared_desks_ausstattung", up: () => {
    col("shared_desks", "ausstattung", "TEXT");
  }},


  { version: 45, name: "shared_desk_favorites", up: () => {
    db.exec(`CREATE TABLE IF NOT EXISTS shared_desk_favorites (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      desk_id    TEXT NOT NULL REFERENCES shared_desks(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, desk_id)
    )`);
    safeIndex("idx_shared_favorites_user", "shared_desk_favorites", "user_id");
  }},


];

// ── Runner ───────────────────────────────────────────────────────────────────

export function migrate() {
  // Migrations-Tabelle anlegen
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Bereits angewendete Versionen laden
  const applied = new Set(
    (db.prepare(`SELECT version FROM schema_migrations`).all() as { version: number }[])
      .map(r => r.version)
  );

  // Bootstrap: Wenn schema_migrations neu ist, aber DB schon existiert →
  // prüfe ob Kerntabellen MIT DATEN da sind und stemple alle bisherigen als angewendet
  if (applied.size === 0) {
    const hasUsers = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`).get() &&
                     (db.prepare(`SELECT count(*) as c FROM users`).get() as any)?.c > 0;
    if (hasUsers) {
      log("Bestehende Datenbank erkannt – Bootstrap: stempele alle Migrationen als angewendet");
      const ins = db.prepare(`INSERT OR IGNORE INTO schema_migrations (version,name,applied_at) VALUES (?,?,datetime('now'))`);
      MIGRATIONS.forEach(m => ins.run(m.version, m.name));
      log(`${MIGRATIONS.length} Migrationen gestempelt`);
      // applied neu einlesen damit pending korrekt berechnet wird
      applied.clear();
      (db.prepare(`SELECT version FROM schema_migrations`).all() as { version: number }[])
        .forEach(r => applied.add(r.version));
    }
  }

  // Ausstehende Migrationen ausführen
  const pending = MIGRATIONS.filter(m => !applied.has(m.version));

  if (pending.length === 0) {
    log("Alle Migrationen aktuell ✓");
    return;
  }

  const ins = db.prepare(`INSERT INTO schema_migrations (version,name) VALUES (?,?)`);
  for (const m of pending) {
    const runMigration = db.transaction(() => {
      log(`v${m.version} ${m.name} …`);
      m.up();
      ins.run(m.version, m.name);
    });
    try {
      runMigration();
      log(`v${m.version} ${m.name} ✓`);
    } catch (e: any) {
      logWarn(`v${m.version} ${m.name} FEHLER: ${e.message}`);
      throw e;
    }
  }
}
// ── Wäsche-Modul Setup ───────────────────────────────────────────────────────
// Explizit exportiert, wird direkt nach migrate() in server.ts aufgerufen.
// Alle Statements sind idempotent – sicher bei jedem Serverstart.
export function ensureWaesche(): void {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS waesche_typen (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
      aktiv INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`INSERT OR IGNORE INTO waesche_typen (id,name,sort_order) VALUES ('wt_kissen','Kissen',1)`);
    db.exec(`INSERT OR IGNORE INTO waesche_typen (id,name,sort_order) VALUES ('wt_bettdecke','Bettdecke',2)`);
    db.exec(`CREATE TABLE IF NOT EXISTS waesche_anfragen (
      id TEXT PRIMARY KEY, station_id TEXT, station_name TEXT,
      status TEXT NOT NULL DEFAULT 'offen' CHECK(status IN ('offen','angenommen','erledigt')),
      notiz TEXT, created_by TEXT, bearbeitet_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS waesche_anfrage_artikel (
      id TEXT PRIMARY KEY, anfrage_id TEXT NOT NULL,
      typ_id TEXT NOT NULL, anzahl INTEGER NOT NULL DEFAULT 1,
      geliefert_anzahl INTEGER NOT NULL DEFAULT 0
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT, meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    // Alle Spalten sicherstellen
    col("houses",     "short_code",            "TEXT");
    col("room_types", "icon",                  "TEXT NOT NULL DEFAULT '🚪'");
    col("room_types", "sort_order",            "INTEGER NOT NULL DEFAULT 0");
    col("beds",       "last_patient_discharge","TEXT");
    col("settings",   "description",           "TEXT");
    col("announcements", "expires_at",          "TEXT");
    col("bed_defects", "scanned_barcode",       "TEXT");
    col("bed_defects", "notes",                 "TEXT");
    col("bed_defects", "bed_id",                "TEXT");
    col("bed_defects", "room_id",               "TEXT");
    col("aufbereitungsarten","when_to_use",      "TEXT");
    col("aufbereitungsarten","updated_at",       "TEXT NOT NULL DEFAULT (datetime('now'))");
    col("berufsgruppen",     "sort_order",   "INTEGER NOT NULL DEFAULT 0");
    col("berufsgruppen",     "active",       "INTEGER NOT NULL DEFAULT 1");
    col("pathogens",         "severity",     "INTEGER NOT NULL DEFAULT 2");
    col("pathogens",         "description",  "TEXT");
    // checklists Tabelle sicherstellen
    db.exec(`CREATE TABLE IF NOT EXISTS checklists (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL,
      item_name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
      is_completed INTEGER NOT NULL DEFAULT 0,
      completed_by TEXT, completed_at TEXT, notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    col("tasks",      "cleaning_type",         "TEXT NOT NULL DEFAULT 'normal'");
    col("tasks",      "pathogens",             "TEXT NOT NULL DEFAULT '[]'");
    col("tasks",      "photos",                "TEXT NOT NULL DEFAULT '[]'");
    col("tasks",      "priority",              "INTEGER NOT NULL DEFAULT 2");
    col("tasks",      "station_id",            "TEXT");
    col("tasks",      "started_at",            "TEXT");
    col("tasks",      "en_route_at",           "TEXT");
    col("tasks",      "signed_off_by",         "TEXT");
    col("tasks",      "signed_off_at",         "TEXT");
    col("tasks",      "created_date",          "TEXT");
    col("tasks",      "wunschtermin",          "TEXT");
    col("tasks",      "bestaetigt_termin",     "TEXT");
    col("audit_log",  "entity",                "TEXT");
    col("audit_log",  "meta",                  "TEXT");
    col("roles",      "description",           "TEXT");
    // Module sicherstellen
    db.exec(`INSERT OR IGNORE INTO modules (key,name,description,icon,active,sort_order) VALUES
      ('auth',               'Anmeldung & Sicherheit', 'Login und Benutzersitzungen - Kernmodul',     '🔒',1,0),
      ('benutzerverwaltung', 'Benutzer & Rollen',       'Mitarbeiter, Rollen und Teams - Kernmodul',  '👥',1,0),
      ('bettenstamm_core',   'Bettenstamm',             'Physische Betten mit Barcode - Kernmodul',   '🛏',1,0),
      ('raumbuch',           'Raumbuch',                'Haeuser, Bereiche, Stationen - Kernmodul',   '🗺️',1,0),
      ('bed_cleaning',       'Bettenaufbereitung',      'Dezentrale Bettenaufbereitung',               '🛏️',1,1),
      ('bed_cleaning_zentral','Bett-Zentral',            'Zentrale Bettenaufbereitung',                '🏥',1,2),
      ('room_cleaning',      'Scheuer-Wisch',            'Entlassreinigung und Schlussdesinfektion',   '🧹',1,3),
      ('oxygen_transport',   'Sauerstofftransport',      'Sauerstoffflaschen-Logistik',               '💨',0,4),
      ('bed_defects',        'Instandsetzung',           'Defektmanagement fuer Betten',               '🔧',1,5),
      ('meldungen',          'Meldungen',                'Meldungen und Ankuendigungen',               '📢',1,6),
      ('spindverwaltung',    'Spindverwaltung',           'Spinde und Anfragen verwalten',             '🔐',0,7),
      ('waesche',            'Kissen & Bettdecken',       'Waesche-Anfragen von Stationen',            '🛏',0,9)`);
    db.exec(`DELETE FROM modules WHERE key='ki_assistent'`);
    db.exec(`INSERT OR IGNORE INTO settings (key, value) VALUES ('sw_freitext', 'Das Zimmer ist frei von allen persönlichen Gegenständen des Patienten.')`);
    // Admin-Rolle Permissions sicherstellen (alle bekannten Permissions)
    const allPerms = JSON.stringify([
      "bettenaufbereitung","bettenaufbereitung_zentral","zimmerreinigung","berichte",
      "auftraege_erstellen","dashboard","sauerstofftransport","lager","betten_reparatur",
      "stationspersonal","bettenstamm","betten_pw","meldungen","raumbuch",
      "benutzerverwaltung","spindverwaltung","waesche","chat","raumbuchung","raumbuchung_stellvertretung","raumbuchungsadmin","verwaltung"
    ]);
    const adminRole = db.prepare(`SELECT id FROM roles WHERE name='Administrator' LIMIT 1`).get() as any;
    if (adminRole) {
      db.prepare(`UPDATE roles SET permissions=? WHERE id=?`).run(allPerms, adminRole.id);
      db.prepare(`UPDATE users SET active=1 WHERE role_id=?`).run(adminRole.id);
    }
    db.exec(`CREATE TABLE IF NOT EXISTS cleaning_instructions (
      id TEXT PRIMARY KEY, category TEXT NOT NULL, cleaning_type TEXT NOT NULL,
      title TEXT NOT NULL, content TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(category, cleaning_type)
    )`);
    col("announcements", "expires_at",  "TEXT");
    col("tasks", "signed_off_by",       "TEXT");
    col("tasks", "signed_off_at",       "TEXT");
    log("ensureWaesche OK");
  } catch (e) {
    logWarn("ensureWaesche FEHLER: " + (e as any).message);
  }
}
