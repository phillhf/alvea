// Legt einmalig Testdaten über die API an und speichert pro Rolle einen
// angemeldeten Browser-Zustand (localStorage mit Token) – so müssen die Tests
// sich nicht jedes Mal über das (rate-limitierte) Login-Formular anmelden.
import { request, FullConfig } from "@playwright/test";
import fs from "fs";
import path from "path";

export const AUTH_DIR = path.join(__dirname, ".auth");
export const TEST_PASSWORD = "Test-Passwort-1";
export const USERS = {
  admin:     { email: "admin@alvea.local", password: "admin123" },
  pflege:    { email: "pflege@e2e.local", password: TEST_PASSWORD },
  reinigung: { email: "reinigung@e2e.local", password: TEST_PASSWORD },
};

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const ctx = await request.newContext({ baseURL });

  async function login(email: string, password: string) {
    const res = await ctx.post("/api/auth/login", { data: { email, password } });
    if (!res.ok()) throw new Error(`Login ${email}: ${res.status()} ${await res.text()}`);
    return res.json() as Promise<{ token: string; user: unknown }>;
  }
  async function post(token: string, url: string, data: object) {
    const res = await ctx.post(url, { data, headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok()) throw new Error(`POST ${url}: ${res.status()} ${await res.text()}`);
    return res.json();
  }

  const admin = await login(USERS.admin.email, USERS.admin.password);
  const house = await post(admin.token, "/api/houses", { name: "E2E-Haus" });
  // Station 1A: Pflege-Tests, Station 2B: Reinigungsablauf (getrennt, damit sich die Tests nicht beeinflussen)
  async function station(name: string, prefix: string) {
    const st = await post(admin.token, "/api/areas", { house_id: house.id, name, bezeichnung: name });
    for (const nr of ["01", "02", "03", "04"]) {
      const room = await post(admin.token, "/api/rooms", { area_id: st.id, room_number: `${prefix}-${nr}` });
      for (const b of ["A", "B"]) await post(admin.token, "/api/beds", { room_id: room.id, bed_number: b });
    }
    return st;
  }
  const station1A = await station("Station 1A", "1A");
  const station2B = await station("Station 2B", "2B");
  const pflegeRole = await post(admin.token, "/api/roles", { name: "Pflege", permissions: ["stationspersonal"] });
  const reinigungRole = await post(admin.token, "/api/roles", { name: "Reinigung", permissions: ["bettenaufbereitung", "zimmerreinigung"] });
  await post(admin.token, "/api/users", { email: USERS.pflege.email, password: TEST_PASSWORD, full_name: "Petra Pflege", role_id: pflegeRole.id, area_ids: [station1A.id] });
  await post(admin.token, "/api/users", { email: USERS.reinigung.email, password: TEST_PASSWORD, full_name: "Rita Reinigung", role_id: reinigungRole.id, area_ids: [station2B.id] });

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const origin = new URL(baseURL).origin;
  const tokens: Record<string, string> = {};
  for (const [name, u] of Object.entries(USERS)) {
    const s = name === "admin" ? admin : await login(u.email, u.password);
    tokens[name] = s.token;
    fs.writeFileSync(path.join(AUTH_DIR, `${name}.json`), JSON.stringify({
      cookies: [],
      origins: [{ origin, localStorage: [
        { name: "token", value: s.token },
        { name: "user", value: JSON.stringify(s.user) },
      ] }],
    }));
  }
  fs.writeFileSync(path.join(AUTH_DIR, "world.json"), JSON.stringify({ station1A: station1A.id, station2B: station2B.id, tokens }));
  await ctx.dispose();
}
