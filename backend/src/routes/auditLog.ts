import { Router } from "express";
import { query } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";

export const adminRouter = Router();
adminRouter.use(authRequired);

adminRouter.get("/", requirePermission("verwaltung"), (req, res) => {
  try {
    const { entity, user_id, action, limit: lim } = req.query as Record<string, string>;
    const params: any[] = [];
    const wheres: string[] = [];

    if (entity)  { wheres.push(`a.entity=$${params.length+1}`);  params.push(entity); }
    if (user_id) { wheres.push(`a.user_id=$${params.length+1}`); params.push(user_id); }
    if (action)  { wheres.push(`a.action=$${params.length+1}`);  params.push(action); }

    const where = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";
    const pageSize = Math.min(Math.max(1, parseInt(lim ?? "100") || 100), 500);

    const { rows } = query<any>(`
      SELECT a.id, a.action, a.entity, a.entity_id, a.meta, a.created_at,
             u.full_name AS user_name, u.email AS user_email
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT $${params.length + 1}
    `, [...params, pageSize]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});
