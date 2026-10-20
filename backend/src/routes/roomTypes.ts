import { Router } from "express";
import { z } from "zod";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";

const router = Router();
router.use(authRequired);

const schema = z.object({
  name:       z.string().min(1).max(100),
  icon:       z.string().min(1).max(10).default("🚪"),
  sort_order: z.number().int().optional().default(0),
});

router.get("/", (_req, res) => {
  const { rows } = query(`SELECT * FROM room_types ORDER BY sort_order, name`);
  res.json(rows);
});

router.post("/", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const d = schema.parse(req.body);
  const id = newId();
  try {
    query(`INSERT INTO room_types (id,name,icon,sort_order) VALUES ($1,$2,$3,$4)`,
      [id, d.name, d.icon, d.sort_order]);
  } catch (e: any) {
    if (e.message?.includes("UNIQUE")) return res.status(409).json({ error: "name_taken" });
    throw e;
  }
  res.status(201).json({ id, ...d });
});

router.patch("/:id", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const d = schema.partial().parse(req.body);
  const fields: string[] = [], vals: any[] = [];
  if (d.name       !== undefined) { vals.push(d.name);       fields.push(`name=$${vals.length}`);       }
  if (d.icon       !== undefined) { vals.push(d.icon);       fields.push(`icon=$${vals.length}`);       }
  if (d.sort_order !== undefined) { vals.push(d.sort_order); fields.push(`sort_order=$${vals.length}`); }
  if (!fields.length) return res.json({ ok: true });
  vals.push(req.params.id);
  query(`UPDATE room_types SET ${fields.join(",")} WHERE id=$${vals.length}`, vals);
  res.json({ ok: true });
});

router.delete("/:id", requirePermission("raumbuch", "verwaltung"), (req, res) => {
  // Räume die diesen Typ haben → auf NULL setzen
  query(`UPDATE rooms SET room_type_id=NULL WHERE room_type_id=$1`, [req.params.id]);
  query(`DELETE FROM room_types WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

export default router;
