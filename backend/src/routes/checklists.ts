import { Router } from "express";
import { z } from "zod";
import { query } from "../config/db";
import { authRequired } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { audit } from "../services/audit";
import { getAreaScope } from "../services/scope";

const router = Router();
router.use(authRequired);

const schema = z.object({
  is_completed: z.boolean(),
  notes: z.string().optional(),
});

router.post("/:itemId/complete", (req: AuthedRequest, res) => {
  const d = schema.parse(req.body);

  // Bereichs- und Eigentümer-Prüfung über den zugehörigen Task
  const { rows: ctxRows } = query<{ area_id: string; assigned_to: string | null; task_id: string }>(
    `SELECT a_outer.house_id, t.assigned_to, c.task_id
       FROM checklists c
       JOIN tasks t ON t.id = c.task_id
       JOIN rooms r ON r.id = t.room_id
       LEFT JOIN areas s ON s.id = COALESCE(r.area_id, r.station_id)
      WHERE c.id = $1`,
    [req.params.itemId]
  );
  if (!ctxRows.length) return res.status(404).json({ error: "not_found" });
  const ctx = ctxRows[0];

  const scope = getAreaScope(req.user!.sub, req.user!.permissions);
  if (scope !== null && !scope.includes(ctx.area_id)) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (!req.user!.permissions.includes("auftraege_erstellen") && ctx.assigned_to !== req.user!.sub) {
    return res.status(403).json({ error: "not_your_task" });
  }

  const done = d.is_completed ? 1 : 0;
  const r = query(
    `UPDATE checklists
        SET is_completed=$1,
            completed_by = CASE WHEN $1=1 THEN $2 ELSE NULL END,
            completed_at = CASE WHEN $1=1 THEN datetime('now') ELSE NULL END,
            notes        = COALESCE($3, notes)
      WHERE id = $4`,
    [done, req.user!.sub, d.notes ?? null, req.params.itemId]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  const { rows } = query(`SELECT * FROM checklists WHERE id = $1`, [req.params.itemId]);
  audit(req.user!.sub, "check_item", "checklist", req.params.itemId, { done: d.is_completed });
  res.json({ ...(rows[0] as any), is_completed: !!(rows[0] as any).is_completed });
});

export default router;
