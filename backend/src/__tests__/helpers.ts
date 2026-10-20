// Gemeinsame Test-Hilfen: App laden, anmelden, Testdaten über die API anlegen.
import request from "supertest";
import type { Express } from "express";

// Erst nach setup.ts laden (DB_FILE usw. sind dann gesetzt)
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const app: Express = require("../server").default;

export const ADMIN = { email: "admin@alvea.local", password: "admin123" };
export const TEST_PASSWORD = "Test-Passwort-1";

const tokenCache = new Map<string, string>();

/** Anmelden (Token wird je Nutzer zwischengespeichert – Login ist rate-limitiert) */
export async function login(email: string, password = TEST_PASSWORD): Promise<string> {
  const cached = tokenCache.get(email);
  if (cached) return cached;
  const res = await request(app).post("/api/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`Login ${email} fehlgeschlagen: ${res.status} ${JSON.stringify(res.body)}`);
  tokenCache.set(email, res.body.token);
  return res.body.token;
}

/** Authentifizierte Anfrage */
export function api(token: string) {
  const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
  return {
    get:    (url: string) => auth(request(app).get(url)),
    post:   (url: string, body?: object) => auth(request(app).post(url)).send(body ?? {}),
    patch:  (url: string, body?: object) => auth(request(app).patch(url)).send(body ?? {}),
    put:    (url: string, body?: object) => auth(request(app).put(url)).send(body ?? {}),
    delete: (url: string) => auth(request(app).delete(url)),
  };
}

export interface World {
  admin: string;
  stationA: { id: string; rooms: { id: string; beds: string[] }[] };
  stationB: { id: string; rooms: { id: string; beds: string[] }[] };
  users: { pflegeA: string; pflegeB: string; reinigungA: string; reinigungB: string };
}

async function createStation(admin: string, houseId: string, name: string) {
  const a = await api(admin).post("/api/areas", { house_id: houseId, name, bezeichnung: name });
  expect(a.status).toBeLessThan(300);
  const rooms: { id: string; beds: string[] }[] = [];
  for (const nr of ["01", "02"]) {
    const room = await api(admin).post("/api/rooms", { area_id: a.body.id, room_number: `${name}-${nr}` });
    expect(room.status).toBeLessThan(300);
    const beds: string[] = [];
    for (const b of ["A", "B"]) {
      const bed = await api(admin).post("/api/beds", { room_id: room.body.id, bed_number: b });
      expect(bed.status).toBeLessThan(300);
      beds.push(bed.body.id);
    }
    rooms.push({ id: room.body.id, beds });
  }
  return { id: a.body.id as string, rooms };
}

async function createUser(admin: string, email: string, roleId: string, areaIds: string[]) {
  const res = await api(admin).post("/api/users", {
    email, password: TEST_PASSWORD, full_name: email.split("@")[0], role_id: roleId, area_ids: areaIds,
  });
  expect(res.status).toBeLessThan(300);
  return email;
}

/**
 * Testwelt: 1 Haus, Station A und B mit je 2 Zimmern à 2 Betten,
 * Pflege- und Reinigungskräfte jeweils nur für ihre Station.
 */
export async function buildWorld(): Promise<World> {
  const admin = await login(ADMIN.email, ADMIN.password);
  const house = await api(admin).post("/api/houses", { name: "Testhaus" });
  expect(house.status).toBeLessThan(300);
  const stationA = await createStation(admin, house.body.id, "A");
  const stationB = await createStation(admin, house.body.id, "B");

  const pflegeRole = await api(admin).post("/api/roles", { name: "Pflege", permissions: ["stationspersonal"] });
  const reinigungRole = await api(admin).post("/api/roles", { name: "Reinigung", permissions: ["bettenaufbereitung", "zimmerreinigung"] });
  expect(pflegeRole.status).toBeLessThan(300);
  expect(reinigungRole.status).toBeLessThan(300);

  return {
    admin,
    stationA,
    stationB,
    users: {
      pflegeA:    await createUser(admin, "pflege-a@test.local", pflegeRole.body.id, [stationA.id]),
      pflegeB:    await createUser(admin, "pflege-b@test.local", pflegeRole.body.id, [stationB.id]),
      reinigungA: await createUser(admin, "reinigung-a@test.local", reinigungRole.body.id, [stationA.id]),
      reinigungB: await createUser(admin, "reinigung-b@test.local", reinigungRole.body.id, [stationB.id]),
    },
  };
}
