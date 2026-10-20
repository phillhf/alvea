// Datenbank-Migrationen: frische Installation und Update einer Datenbank aus Version 1.0.0
import { db, migrate, ensureWaesche } from "../config/db";

const LATEST = 46;

function tables(): string[] {
  return (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map(r => r.name);
}

describe("Migrationen", () => {
  beforeAll(() => { migrate(); ensureWaesche(); });

  it("bringt eine neue Datenbank auf den aktuellen Stand", () => {
    const max = (db.prepare(`SELECT MAX(version) AS v FROM schema_migrations`).get() as { v: number }).v;
    expect(max).toBe(LATEST);
    expect(tables()).toEqual(expect.arrayContaining(["users", "tasks", "beds", "rooms", "areas", "bed_defects", "ruecksendungen"]));
  });

  it("legt Admin, Erreger und Bett-Typen an", () => {
    const admin = db.prepare(`SELECT email FROM users WHERE email='admin@alvea.local'`).get();
    expect(admin).toBeTruthy();
    expect((db.prepare(`SELECT COUNT(*) AS c FROM pathogens`).get() as { c: number }).c).toBeGreaterThanOrEqual(20);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM bed_types`).get() as { c: number }).c).toBeGreaterThan(0);
  });

  it("ist wiederholbar (zweiter Lauf ändert nichts)", () => {
    expect(() => { migrate(); ensureWaesche(); }).not.toThrow();
  });

  it("räumt beim Update von 1.0.0 die Raumbuchung ab (v46)", () => {
    // Zustand einer 1.0.0-Datenbank nachstellen
    db.exec(`CREATE TABLE shared_rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
    db.exec(`CREATE TABLE shared_desks (id TEXT PRIMARY KEY, room_id TEXT REFERENCES shared_rooms(id))`);
    db.exec(`CREATE TABLE shared_bookings (id TEXT PRIMARY KEY, room_id TEXT, desk_id TEXT)`);
    db.exec(`CREATE TABLE shared_booking_delegates (id TEXT PRIMARY KEY)`);
    db.exec(`CREATE TABLE shared_desk_favorites (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO shared_rooms VALUES ('r1','Besprechung')`);
    db.exec(`INSERT OR IGNORE INTO modules (key,name,description,icon,active,sort_order)
             VALUES ('raumbuchung','Raumbuchung','','',1,11)`);
    db.prepare(`INSERT INTO roles (id,name,permissions) VALUES ('rolle-sek','Sekretariat',?)`)
      .run(JSON.stringify(["raumbuchung", "raumbuchung_stellvertretung", "meldungen"]));
    db.exec(`DELETE FROM schema_migrations WHERE version = 46`);

    migrate();

    expect(tables().filter(t => t.startsWith("shared_"))).toEqual([]);
    expect(db.prepare(`SELECT key FROM modules WHERE key='raumbuchung'`).get()).toBeUndefined();
    const perms = JSON.parse((db.prepare(`SELECT permissions FROM roles WHERE id='rolle-sek'`).get() as any).permissions);
    expect(perms).toEqual(["meldungen"]);
  });
});
