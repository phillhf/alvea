import { Router } from "express";
import { z } from "zod";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import type { AuthedRequest } from "../types";

const router = Router();
router.use(authRequired);

const schema = z.object({
  house_id:   z.string().uuid(),
  name:       z.string().min(1).max(200),
  short_code: z.string().max(20).optional(),
});

// GET alle Gebäude
router.get("/", (req: AuthedRequest, res) => {
  try {
    const { house_id } = req.query as Record<string, string>;
    const params: any[] = [];
    let where = "";
    if (house_id) { params.push(house_id); where = `WHERE b.house_id = $1`; }
    const { rows } = query<any>(`
      SELECT b.*, h.name AS house_name,
        (SELECT COUNT(*) FROM areas a WHERE a.building_id = b.id) AS area_count
      FROM buildings b
      LEFT JOIN houses h ON h.id = b.house_id
      ${where}
      ORDER BY h.name, b.name
    `, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "internal_error" }); }
});

// POST neues Gebäude
router.post("/", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const d = schema.parse(req.body);
    const id = newId();
    query(`INSERT INTO buildings (id, house_id, name, short_code) VALUES ($1,$2,$3,$4)`,
      [id, d.house_id, d.name, d.short_code ?? null]);
    res.json({ id });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// PATCH Gebäude bearbeiten
router.patch("/:id", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const d = schema.partial().parse(req.body);
    const fields: string[] = []; const params: any[] = [];
    if (d.house_id   !== undefined) { fields.push(`house_id=$${fields.length+1}`);   params.push(d.house_id); }
    if (d.name       !== undefined) { fields.push(`name=$${fields.length+1}`);        params.push(d.name); }
    if (d.short_code !== undefined) { fields.push(`short_code=$${fields.length+1}`);  params.push(d.short_code || null); }
    if (fields.length) { params.push(req.params.id); query(`UPDATE buildings SET ${fields.join(",")} WHERE id=$${params.length}`, params); }
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// DELETE Gebäude
router.delete("/:id", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const { rows } = query<any>(`SELECT COUNT(*) as c FROM areas WHERE building_id=$1`, [req.params.id]);
    const count = (rows[0] as any)?.c ?? 0;
    if (count > 0 && req.query.force !== "true") {
      return res.status(409).json({ error: "has_areas", areas: count });
    }
    query(`UPDATE areas SET building_id=NULL WHERE building_id=$1`, [req.params.id]);
    query(`DELETE FROM buildings WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "internal_error" }); }
});

export default router;
