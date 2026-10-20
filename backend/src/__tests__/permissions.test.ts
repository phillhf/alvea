import { api, buildWorld, login, World } from "./helpers";

let w: World;
let pflegeA: string, pflegeB: string;

beforeAll(async () => {
  w = await buildWorld();
  pflegeA = await login(w.users.pflegeA);
  pflegeB = await login(w.users.pflegeB);
});

describe("Einstellungen", () => {
  it("gibt Backup-Einstellungen nicht an normale Nutzer heraus", async () => {
    // Backup als Admin konfigurieren (Passwort wird verschlüsselt gespeichert)
    const cfg = await api(w.admin).patch("/api/backup/settings", {
      backup_path: "\\\\server\\freigabe", backup_username: "DOMAIN\\backup", backup_password: "geheim",
    });
    expect(cfg.status).toBe(200);

    const res = await api(pflegeA).get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body.some((s: any) => s.key.startsWith("backup_"))).toBe(false);
  });

  it("lässt Backup-Werte nicht über die allgemeine Einstellungs-Route ändern", async () => {
    const res = await api(w.admin).put("/api/settings/backup_password", { value: "klartext" });
    expect(res.status).toBe(400);
  });

  it("nur die Verwaltung darf Einstellungen ändern", async () => {
    const res = await api(pflegeA).put("/api/settings/sw_freitext", { value: "x" });
    expect(res.status).toBe(403);
  });
});

describe("Defektmeldungen", () => {
  it("speichern Station und Zimmer als echte Felder", async () => {
    const room = w.stationA.rooms[0];
    const res = await api(pflegeA).post("/api/defects", {
      title: "Bremse blockiert", station_id: w.stationA.id, room_id: room.id, notes: "Standort: Flur",
    });
    expect(res.status).toBe(201);

    const mine = await api(pflegeA).get("/api/defects/my");
    expect(mine.status).toBe(200);
    expect(mine.body[0]).toMatchObject({ title: "Bremse blockiert", station_name: "A", room_number: "A-01" });
  });

  it("die Gesamtliste der Instandsetzung ist für Pflege gesperrt", async () => {
    expect((await api(pflegeA).get("/api/defects")).status).toBe(403);
    expect((await api(w.admin).get("/api/defects")).status).toBe(200);
  });
});

describe("Rücksendungen – Datenisolation", () => {
  let id: string;

  beforeAll(async () => {
    const res = await api(pflegeA).post("/api/ruecksendungen", {
      station_id: w.stationA.id, station_name: "A", artikel: "Handschuhe", menge: "2 Kartons", grund: "Falsche Größe",
    });
    expect(res.status).toBe(200);
    id = res.body.id;
  });

  it("Ersteller und Lager/Verwaltung sehen die Rücksendung", async () => {
    expect((await api(pflegeA).get(`/api/ruecksendungen/${id}`)).status).toBe(200);
    expect((await api(w.admin).get(`/api/ruecksendungen/${id}`)).status).toBe(200);
  });

  it("andere Stationen sehen weder Rücksendung noch Begleitschein", async () => {
    expect((await api(pflegeB).get(`/api/ruecksendungen/${id}`)).status).toBe(403);
    expect((await api(pflegeB).get(`/api/ruecksendungen/${id}/begleitschein`)).status).toBe(403);
  });

  it("Pflege darf Rücksendungen nicht abschließen", async () => {
    expect((await api(pflegeA).patch(`/api/ruecksendungen/${id}/abschliessen`, { abschluss_grund: "x" })).status).toBe(403);
  });
});

describe("Verwaltungsrechte", () => {
  it("Pflege darf keine Benutzer anlegen", async () => {
    const res = await api(pflegeA).post("/api/users", {
      email: "boese@test.local", password: "Passwort-123", full_name: "Böse", role_id: "x",
    });
    expect(res.status).toBe(403);
  });

  it("Pflege darf keine Module umschalten", async () => {
    expect((await api(pflegeA).patch("/api/modules/chat", { active: true })).status).toBe(403);
  });

  it("Update auslösen ist der Verwaltung vorbehalten", async () => {
    expect((await api(pflegeA).post("/api/system/update")).status).toBe(403);
  });
});
