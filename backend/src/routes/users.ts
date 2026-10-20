import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query, newId, db } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { audit } from "../services/audit";

const router = Router();
router.use(authRequired);

router.get("/", requirePermission("benutzerverwaltung", "verwaltung", "auftraege_erstellen"), (_req, res) => {
  const { rows } = query(
    `SELECT u.id, u.email, u.full_name, u.active, u.team_id, u.can_change_password,
            u.role_id, r.name AS role_name,
            t.name AS team_name,
            (SELECT COUNT(*) FROM user_areas ua WHERE ua.user_id = u.id) AS area_count
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN teams t ON t.id = u.team_id
      ORDER BY u.full_name`
  );
  res.json(rows);
});

router.get("/me", (req: AuthedRequest, res) => {
  const { rows } = query(
    `SELECT u.id, u.email, u.full_name, u.active, u.role_id, u.can_change_password,
            r.name AS role_name
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`, [req.user!.sub]
  );
  const { rows: areas } = query(
    `SELECT a.id, a.name, COALESCE(a.bezeichnung, a.name) AS bezeichnung, a.house_id, h.name AS house_name
       FROM user_areas ua JOIN areas a ON a.id = ua.area_id LEFT JOIN houses h ON h.id = a.house_id
      WHERE ua.user_id = $1 ORDER BY h.name, a.name`, [req.user!.sub]
  );
  // stations ist jetzt ein Alias für areas (nach Migration)
  const stations = areas;
  const { rows: houses } = query(
    `SELECT h.id, h.name, h.house_number AS ki_number FROM user_houses uh LEFT JOIN houses h ON h.id = uh.house_id
      WHERE uh.user_id = $1 ORDER BY h.name`, [req.user!.sub]
  );
  const { rows: permRows } = query(
    `SELECT r.permissions FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [req.user!.sub]
  );
  const permissions: string[] = (() => {
    try { return JSON.parse((permRows[0] as any)?.permissions || "[]"); } catch { return []; }
  })();
  res.json({ ...(rows[0] as any), areas, stations, houses, permissions });
});

// Self-service Passwortänderung
router.patch("/me/password", async (req: AuthedRequest, res) => {
  const result = z.object({
    current_password: z.string().min(1),
    new_password:     z.string().min(8),
  }).safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: "validation_error", details: result.error.issues });
  const d = result.data;

  try {
    const { rows } = query<{ password_hash: string; can_change_password: number }>(
      `SELECT password_hash, can_change_password FROM users WHERE id = $1`, [req.user!.sub]
    );
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    if (!rows[0].can_change_password) return res.status(403).json({ error: "password_change_disabled" });

    const valid = await bcrypt.compare(d.current_password, rows[0].password_hash);
    if (!valid) return res.status(403).json({ error: "current_password_wrong" });

    const hash = await bcrypt.hash(d.new_password, 12);
    query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, req.user!.sub]);
    audit(req.user!.sub, "change_password", "user", req.user!.sub);
    res.json({ ok: true });
  } catch (e) {
    require("../services/logger").logger.error("Passwortänderung fehlgeschlagen", { error: String(e) });
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id/areas", requirePermission("benutzerverwaltung", "verwaltung", "auftraege_erstellen"), (req, res) => {
  const { rows } = query(
    `SELECT a.id, a.name, a.house_id FROM user_areas ua JOIN areas a ON a.id = ua.area_id WHERE ua.user_id = $1 ORDER BY a.name`,
    [req.params.id]
  );
  res.json(rows);
});

const createSchema = z.object({
  email:     z.string().min(3).max(255),
  password:  z.string().min(8),
  full_name: z.string().min(1),
  role_id:   z.string().min(1),
  team_id:   z.string().min(1).nullable().optional(),
  pin:       z.string().min(4).max(8).optional(),
  area_ids:  z.array(z.string()).optional(),
});
router.post("/", requirePermission("benutzerverwaltung", "verwaltung"), async (req: AuthedRequest, res) => {
  const result = createSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: "validation_error", details: result.error.issues });
  const d = result.data;

  // Prüfen ob E-Mail bereits vergeben
  const { rows: existing } = query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [d.email]);
  if (existing.length) return res.status(409).json({ error: "email_taken" });

  // Prüfen ob Rolle existiert
  const { rows: roleCheck } = query(`SELECT id FROM roles WHERE id = $1`, [d.role_id]);
  if (!roleCheck.length) return res.status(400).json({ error: "invalid_role" });

  const password_hash = await bcrypt.hash(d.password, 12);
  const pin_hash = d.pin ? await bcrypt.hash(d.pin, 12) : null;
  const id = newId();
  try {
    query(
      `INSERT INTO users (id, email, password_hash, pin_hash, full_name, role, role_id, team_id) VALUES ($1,$2,$3,$4,$5,'reiniger',$6,$7)`,
      [id, d.email, password_hash, pin_hash, d.full_name, d.role_id, d.team_id ?? null]
    );
  } catch (e: any) {
    if (e.message?.includes("UNIQUE")) return res.status(409).json({ error: "email_taken" });
    throw e;
  }
  (d.area_ids || []).length > 0 && db.transaction(() => {
    const ins = db.prepare(`INSERT OR IGNORE INTO user_areas (user_id,area_id) VALUES (?,?)`);
    (d.area_ids || []).forEach(aid => ins.run(id, aid));
  })();
  audit(req.user!.sub, "create", "user", id);
  res.status(201).json({ id, email: d.email, full_name: d.full_name, role_id: d.role_id });
});

const assignSchema = z.object({ area_ids: z.array(z.string().uuid()) });
router.put("/:id/areas", requirePermission("benutzerverwaltung", "verwaltung"), (req: AuthedRequest, res) => {
  const _ps_d = assignSchema.safeParse(req.body);
  if (!_ps_d.success) return res.status(400).json({ error: "invalid_input" });
  const d = _ps_d.data;
  query(`DELETE FROM user_areas WHERE user_id = $1`, [req.params.id]);
  if (d.area_ids.length > 0) db.transaction(() => {
    const ins = db.prepare(`INSERT OR IGNORE INTO user_areas (user_id,area_id) VALUES (?,?)`);
    d.area_ids.forEach(aid => ins.run(req.params.id, aid));
  })();
  audit(req.user!.sub, "assign_areas", "user", req.params.id, { areas: d.area_ids });
  res.json({ ok: true, area_ids: d.area_ids });
});

router.get("/:id/stations", requirePermission("benutzerverwaltung", "verwaltung", "auftraege_erstellen"), (req, res) => {
  // user_stations → user_areas (nach Migration)
  const { rows } = query(
    `SELECT ua.area_id AS station_id, COALESCE(a.bezeichnung, a.name) AS name, a.bereichsnummer AS short_code, h.name AS area_name
       FROM user_areas ua JOIN areas a ON a.id = ua.area_id LEFT JOIN houses h ON h.id = a.house_id
      WHERE ua.user_id = $1 ORDER BY a.name`, [req.params.id]
  );
  res.json(rows);
});

const assignStationsSchema = z.object({ station_ids: z.array(z.string().uuid()) });
router.put("/:id/stations", requirePermission("benutzerverwaltung", "verwaltung"), (req: AuthedRequest, res) => {
  const _ps_d = assignStationsSchema.safeParse(req.body);
  if (!_ps_d.success) return res.status(400).json({ error: "invalid_input" });
  const d = _ps_d.data;
  // Schreibe ausschließlich in user_areas (station_ids enthält area_ids nach Migration)
  query(`DELETE FROM user_areas WHERE user_id = $1`, [req.params.id]);
  d.station_ids.forEach(sid =>
    query(`INSERT OR IGNORE INTO user_areas (user_id,area_id) VALUES ($1,$2)`, [req.params.id, sid])
  );
  audit(req.user!.sub, "assign_stations", "user", req.params.id, { stations: d.station_ids });
  res.json({ ok: true, station_ids: d.station_ids });
});

router.get("/:id/houses", requirePermission("benutzerverwaltung", "verwaltung", "auftraege_erstellen"), (req, res) => {
  const { rows } = query(
    `SELECT uh.house_id, h.name, h.house_number AS ki_number FROM user_houses uh LEFT JOIN houses h ON h.id = uh.house_id
      WHERE uh.user_id = $1 ORDER BY h.name`, [req.params.id]
  );
  res.json(rows);
});

const assignHousesSchema = z.object({ house_ids: z.array(z.string().uuid()) });
router.put("/:id/houses", requirePermission("benutzerverwaltung", "verwaltung"), (req: AuthedRequest, res) => {
  const _ps_d = assignHousesSchema.safeParse(req.body);
  if (!_ps_d.success) return res.status(400).json({ error: "invalid_input" });
  const d = _ps_d.data;
  query(`DELETE FROM user_houses WHERE user_id = $1`, [req.params.id]);
  if (d.house_ids.length > 0) db.transaction(() => {
    const ins = db.prepare(`INSERT OR IGNORE INTO user_houses (user_id,house_id) VALUES (?,?)`);
    d.house_ids.forEach(hid => ins.run(req.params.id, hid));
  })();
  audit(req.user!.sub, "assign_houses", "user", req.params.id, { houses: d.house_ids });
  res.json({ ok: true, house_ids: d.house_ids });
});

const updateSchema = z.object({
  email:               z.string().min(3).max(255).optional(),
  full_name:           z.string().optional(),
  team_id:             z.string().nullable().optional(),
  role_id:             z.string().min(1).optional(),
  active:              z.coerce.boolean().optional(),
  password:            z.string().min(8).optional(),
  current_password:    z.string().optional(),
  pin:                 z.string().min(4).max(8).optional(),
  can_change_password: z.coerce.boolean().optional(),
});
router.patch("/:id", requirePermission("benutzerverwaltung", "verwaltung"), async (req: AuthedRequest, res) => {
  const result = updateSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: "validation_error", details: result.error.issues });
  const d = result.data;
  const isSelf = req.params.id === req.user!.sub;

  // Selbstschutz: Nur ohne verwaltung-Berechtigung darf man eigene Rolle nicht ändern
  if (isSelf && d.role_id !== undefined && !req.user!.permissions.includes("verwaltung")) {
    return res.status(403).json({ error: "cannot_change_own_role" });
  }

  if (d.password && isSelf) {
    if (!d.current_password) return res.status(400).json({ error: "current_password_required" });
    const { rows: selfRows } = query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1`, [req.params.id]
    );
    const valid = selfRows.length && await bcrypt.compare(d.current_password, selfRows[0].password_hash);
    if (!valid) return res.status(403).json({ error: "current_password_wrong" });
  }
  const fields: string[] = [];
  const values: any[] = [];
  if (d.email !== undefined) {
    // Prüfen ob E-Mail bereits vergeben
    const { rows: taken } = query<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2`, [d.email, req.params.id]
    );
    if (taken.length) return res.status(409).json({ error: "email_taken" });
    values.push(d.email); fields.push(`email = $${values.length}`);
  }
  if (d.full_name !== undefined)           { values.push(d.full_name);   fields.push(`full_name = $${values.length}`); }
  if (d.team_id !== undefined)             { values.push(d.team_id);     fields.push(`team_id = $${values.length}`); }
  if (d.role_id !== undefined)             { values.push(d.role_id);     fields.push(`role_id = $${values.length}`); }
  if (d.active !== undefined)              { values.push(d.active?1:0);  fields.push(`active = $${values.length}`); }
  if (d.can_change_password !== undefined) { values.push(d.can_change_password?1:0); fields.push(`can_change_password = $${values.length}`); }
  if (d.password) { values.push(await bcrypt.hash(d.password, 12)); fields.push(`password_hash = $${values.length}`); }
  if (d.pin)      { values.push(await bcrypt.hash(d.pin, 12));      fields.push(`pin_hash = $${values.length}`); }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id);
  query(`UPDATE users SET ${fields.join(", ")} WHERE id = $${values.length}`, values);
  const { password: _pw, pin: _pin, ...auditSafe } = d;
  audit(req.user!.sub, "update", "user", req.params.id, auditSafe as any);
  res.json({ ok: true });
});

export default router;
