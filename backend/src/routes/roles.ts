import { Router } from "express";
import { z } from "zod";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest, ALL_PERMISSIONS } from "../types";
import { audit } from "../services/audit";

const router = Router();
router.use(authRequired);
router.use(requirePermission("benutzerverwaltung", "verwaltung"));

// GET all roles – liest permissions aus JSON-Spalte
router.get("/", (_req, res) => {
  const { rows } = query<{ id: string; name: string; description: string | null; permissions: string; created_at: string }>(
    `SELECT id, name, description, permissions, created_at FROM roles ORDER BY name`
  );
  res.json(rows.map(r => ({
    ...r,
    permissions: (() => { try { return JSON.parse(r.permissions || "[]"); } catch { return []; } })(),
  })));
});

// GET available permissions
router.get("/permissions", (_req, res) => {
  res.json(ALL_PERMISSIONS);
});

const roleSchema = z.object({
  name:        z.string().min(1).max(80),
  description: z.string().optional(),
  permissions: z.array(z.string()).min(0),
});

// POST create role
router.post("/", (req: AuthedRequest, res) => {
  const d = roleSchema.parse(req.body);
  const id = newId();
  const validPerms = d.permissions.filter(p => (ALL_PERMISSIONS as string[]).includes(p));
  query(`INSERT INTO roles (id, name, description, permissions) VALUES ($1, $2, $3, $4)`,
    [id, d.name, d.description ?? null, JSON.stringify(validPerms)]);
  audit(req.user!.sub, "create", "role", id, { name: d.name });
  res.status(201).json({ id, name: d.name, description: d.description ?? null, permissions: validPerms });
});

// PATCH update role
router.patch("/:id", (req: AuthedRequest, res) => {
  const d = roleSchema.parse(req.body);
  const validPerms = d.permissions.filter(p => (ALL_PERMISSIONS as string[]).includes(p));
  const r = query(`UPDATE roles SET name=$1, description=$2, permissions=$3 WHERE id=$4`,
    [d.name, d.description ?? null, JSON.stringify(validPerms), req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "update", "role", req.params.id, { name: d.name });
  res.json({ ok: true });
});

// DELETE role
router.delete("/:id", (req: AuthedRequest, res) => {
  const { rows: [dep] } = query<{ users: number }>(
    `SELECT COUNT(*) AS users FROM users WHERE role_id = $1`, [req.params.id]);
  if (dep.users > 0)
    return res.status(409).json({ error: "role_in_use", users: dep.users });
  const r = query(`DELETE FROM roles WHERE id = $1`, [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "delete", "role", req.params.id);
  res.json({ ok: true });
});

export default router;
