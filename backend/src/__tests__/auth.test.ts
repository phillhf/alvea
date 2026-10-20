import request from "supertest";
import { app, ADMIN, api, login } from "./helpers";
import { compareVersions } from "../routes/system";
import { APP_VERSION } from "../config/paths";

describe("Anmeldung", () => {
  it("meldet den Admin mit Standard-Zugang an", async () => {
    const res = await request(app).post("/api/auth/login").send(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.permissions).toContain("verwaltung");
  });

  it("lehnt ein falsches Passwort ab", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: ADMIN.email, password: "falsch" });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it("verlangt für geschützte Routen ein gültiges Token", async () => {
    expect((await request(app).get("/api/tasks")).status).toBe(401);
    expect((await request(app).get("/api/tasks").set("Authorization", "Bearer kaputt")).status).toBe(401);
  });

  it("gibt dem Administrator alle Berechtigungen, aber keine der entfernten Raumbuchung", async () => {
    const token = await login(ADMIN.email, ADMIN.password);
    const me = await api(token).get("/api/users/me");
    expect(me.status).toBe(200);
    const perms: string[] = me.body.permissions ?? me.body.role_permissions ?? [];
    expect(perms).toContain("spindverwaltung");
    expect(perms.some(p => p.startsWith("raumbuchung"))).toBe(false);
  });
});

describe("System", () => {
  it("meldet in /api/health die installierte Version", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, service: "alvea", version: APP_VERSION });
  });

  it("vergleicht Versionsnummern numerisch", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("v1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.0", "1.2.1")).toBe(-1);
    expect(compareVersions("2.0.0-beta", "2.0.0")).toBe(-1);
  });
});
