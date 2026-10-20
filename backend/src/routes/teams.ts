import { Router } from "express";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { z } from "zod";

const router = Router();
router.use(authRequired);

// GET /api/teams  – inkl. Bereiche + Mitglieder
router.get("/", (_req, res) => {
  const { rows: teams } = query(`SELECT id, name FROM teams ORDER BY name`);
  const enriched = teams.map((t: any) => {
    const { rows: areas } = query<{ id: string; name: string }>(
      `SELECT a.id, a.name FROM team_areas ta JOIN areas a ON a.id = ta.area_id WHERE ta.team_id = $1`,
      [t.id]
    );
    const { rows: members } = query<{ id: string; full_name: string; role: string }>(
      `SELECT id, full_name, role FROM users WHERE team_id = $1 ORDER BY full_name`,
      [t.id]
    );
    return { ...t, areas, members, area_count: areas.length, member_count: members.length };
  });
  res.json(enriched);
});

// POST /api/teams
router.post("/", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const d = z.object({ name: z.string().min(1) }).parse(req.body);
  const id = newId();
  query(`INSERT INTO teams (id, name) VALUES ($1, $2)`, [id, d.name.trim()]);
  res.status(201).json({ id, name: d.name.trim(), areas: [], members: [] });
});

// PATCH /api/teams/:id
router.patch("/:id", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const d = z.object({ name: z.string().min(1).optional() }).parse(req.body);
  if (d.name) query(`UPDATE teams SET name=$1 WHERE id=$2`, [d.name.trim(), req.params.id]);
  res.json({ ok: true });
});

// PUT /api/teams/:id/areas  – Bereiche setzen (ersetzt alte)
router.put("/:id/areas", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const { area_ids } = z.object({ area_ids: z.array(z.string()) }).parse(req.body);
  query(`DELETE FROM team_areas WHERE team_id = $1`, [req.params.id]);
  for (const aid of area_ids) {
    query(`INSERT OR IGNORE INTO team_areas (team_id, area_id) VALUES ($1, $2)`, [req.params.id, aid]);
  }
  res.json({ ok: true });
});

// PUT /api/teams/:id/members  – Mitglieder setzen
router.put("/:id/members", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const { user_ids } = z.object({ user_ids: z.array(z.string()) }).parse(req.body);
  // Erst alle die zu diesem Team gehören rauswerfen
  query(`UPDATE users SET team_id = NULL WHERE team_id = $1`, [req.params.id]);
  // Dann die neuen zuweisen
  for (const uid of user_ids) {
    query(`UPDATE users SET team_id = $1 WHERE id = $2`, [req.params.id, uid]);
  }
  res.json({ ok: true });
});

// DELETE /api/teams/:id
router.delete("/:id", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  query(`UPDATE users SET team_id = NULL WHERE team_id = $1`, [req.params.id]);
  query(`DELETE FROM teams WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

export default router;
