import { Router } from "express";
import { z } from "zod";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";

const router = Router();
router.use(authRequired);

router.get("/", (_req, res) => {
  const { rows } = query(`SELECT * FROM berufsgruppen ORDER BY sort_order, name`);
  res.json(rows);
});

const schema = z.object({
  name:       z.string().min(1).max(100),
  sort_order: z.number().optional(),
  active:     z.boolean().optional(),
});

router.post("/", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const _ps_d = schema.safeParse(req.body);
  if (!_ps_d.success) return res.status(400).json({ error: "invalid_input" });
  const d = _ps_d.data;
  const id = newId();
  query(`INSERT INTO berufsgruppen (id,name,sort_order,active) VALUES ($1,$2,$3,1)`,
    [id, d.name, d.sort_order ?? 0]);
  res.status(201).json({ id });
});

router.patch("/:id", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const _ps_d = schema.partial().safeParse(req.body);
  if (!_ps_d.success) return res.status(400).json({ error: "invalid_input" });
  const d = _ps_d.data;
  const sets: string[] = []; const vals: any[] = [];
  if (d.name       !== undefined) { vals.push(d.name);              sets.push(`name=$${vals.length}`); }
  if (d.sort_order !== undefined) { vals.push(d.sort_order);        sets.push(`sort_order=$${vals.length}`); }
  if (d.active     !== undefined) { vals.push(d.active ? 1 : 0);   sets.push(`active=$${vals.length}`); }
  if (!sets.length) { res.json({ ok: true }); return; }
  vals.push(req.params.id);
  query(`UPDATE berufsgruppen SET ${sets.join(",")} WHERE id=$${vals.length}`, vals);
  res.json({ ok: true });
});

router.delete("/:id", requirePermission("verwaltung"), (req, res) => {
  query(`DELETE FROM berufsgruppen WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

export default router;
