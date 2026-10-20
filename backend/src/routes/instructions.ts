import { Router } from "express";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";

const router = Router();
router.use(authRequired);

// GET /api/instructions
router.get("/", (_req, res) => {
  const { rows } = query(`SELECT * FROM cleaning_instructions ORDER BY category, cleaning_type`);
  res.json(rows);
});

// GET /api/instructions/:category/:cleaning_type
router.get("/:category/:cleaning_type", (req, res) => {
  const { rows } = query(
    `SELECT * FROM cleaning_instructions WHERE category = $1 AND cleaning_type = $2`,
    [req.params.category, req.params.cleaning_type]
  );
  res.json(rows[0] ?? null);
});

// PUT /api/instructions/:id  { title, content }
router.put("/:id", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const { title, content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "content_required" });
  const finalTitle = title?.trim() || null;
  if (finalTitle !== null) {
    query(
      `UPDATE cleaning_instructions SET title=$1, content=$2, updated_at=datetime('now') WHERE id=$3`,
      [finalTitle, content.trim(), req.params.id]
    );
  } else {
    query(
      `UPDATE cleaning_instructions SET content=$1, updated_at=datetime('now') WHERE id=$2`,
      [content.trim(), req.params.id]
    );
  }
  const { rows } = query(`SELECT * FROM cleaning_instructions WHERE id=$1`, [req.params.id]);
  res.json(rows[0]);
});

export default router;
