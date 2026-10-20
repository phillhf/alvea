import { Router } from "express";
import { z } from "zod";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { audit } from "../services/audit";

const router = Router();
router.use(authRequired);

// GET /api/aufbereitungsarten  – alle (auch inaktive für Verwaltung)
router.get("/", (req: AuthedRequest, res) => {
  const { all } = req.query as Record<string, string>;
  const { rows } = query(
    `SELECT * FROM aufbereitungsarten
      ${all === "1" ? "" : "WHERE active = 1"}
      ORDER BY sort_order ASC, name ASC`
  );
  res.json(rows);
});

// GET /api/aufbereitungsarten/:id
router.get("/:id", (_req, res) => {
  const { rows } = query(
    `SELECT * FROM aufbereitungsarten WHERE id = $1`,
    [_req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

const schema = z.object({
  name:         z.string().min(1).max(100),
  description:  z.string().optional().default(""),
  when_to_use:  z.string().optional().default(""),
  instructions: z.string().optional().default(""),
  sort_order:   z.number().int().min(0).default(0),
  active:       z.boolean().optional().default(true),
});

// POST /api/aufbereitungsarten
router.post("/", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const _ps_d = schema.safeParse(req.body);
  if (!_ps_d.success) return res.status(400).json({ error: "invalid_input" });
  const d = _ps_d.data;
  const id = newId();
  query(
    `INSERT INTO aufbereitungsarten (id, name, description, when_to_use, instructions, sort_order, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, d.name, d.description, d.when_to_use, d.instructions, d.sort_order, d.active ? 1 : 0]
  );
  audit(req.user!.sub, "create", "aufbereitungsart", id, { name: d.name });
  const { rows } = query(`SELECT * FROM aufbereitungsarten WHERE id = $1`, [id]);
  res.status(201).json(rows[0]);
});

// PATCH /api/aufbereitungsarten/:id
router.patch("/:id", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const _ps_d = schema.partial().safeParse(req.body);
  if (!_ps_d.success) return res.status(400).json({ error: "invalid_input" });
  const d = _ps_d.data;
  const fields: string[] = [];
  const vals: any[] = [];

  if (d.name         !== undefined) { vals.push(d.name);               fields.push(`name = $${vals.length}`); }
  if (d.description  !== undefined) { vals.push(d.description);        fields.push(`description = $${vals.length}`); }
  if (d.when_to_use  !== undefined) { vals.push(d.when_to_use);        fields.push(`when_to_use = $${vals.length}`); }
  if (d.instructions !== undefined) { vals.push(d.instructions);       fields.push(`instructions = $${vals.length}`); }
  if (d.sort_order   !== undefined) { vals.push(d.sort_order);         fields.push(`sort_order = $${vals.length}`); }
  if (d.active       !== undefined) { vals.push(d.active ? 1 : 0);     fields.push(`active = $${vals.length}`); }

  if (!fields.length) return res.json({ ok: true });
  fields.push(`updated_at = datetime('now')`);
  vals.push(req.params.id);

  const r = query(`UPDATE aufbereitungsarten SET ${fields.join(", ")} WHERE id = $${vals.length}`, vals);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "update", "aufbereitungsart", req.params.id, d as any);
  const { rows } = query(`SELECT * FROM aufbereitungsarten WHERE id = $1`, [req.params.id]);
  res.json(rows[0]);
});

// DELETE /api/aufbereitungsarten/:id
router.delete("/:id", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const { rows } = query<{ c: number }>(
    `SELECT COUNT(*) as c FROM tasks WHERE aufbereitungsart_id = $1`,
    [req.params.id]
  );
  if (rows[0].c > 0)
    return res.status(409).json({ error: "in_use", tasks: rows[0].c });
  const r = query(`DELETE FROM aufbereitungsarten WHERE id = $1`, [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "delete", "aufbereitungsart", req.params.id);
  res.json({ ok: true });
});

export default router;
