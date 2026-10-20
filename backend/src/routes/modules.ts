import { Router } from "express";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { z } from "zod";

const router = Router();
router.use(authRequired);

// GET /api/modules – alle Module (public für alle eingeloggten)
router.get("/", (_req, res) => {
  const { rows } = query(`SELECT * FROM modules WHERE key != 'ki_assistent' ORDER BY sort_order, name`);
  res.json(rows);
});

// GET /api/modules/active – nur aktive (für Navigation)
router.get("/active", (_req, res) => {
  const { rows } = query(`SELECT key, name, icon FROM modules WHERE active=1 ORDER BY sort_order`);
  res.json(rows);
});

const CORE_MODULES = ["auth", "raumbuch", "benutzerverwaltung", "bettenstamm_core"];

// PATCH /api/modules/:key – aktivieren/deaktivieren (nur Admin)
router.patch("/:key", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  if (CORE_MODULES.includes(req.params.key)) {
    return res.status(403).json({ error: "core_module", message: "Kernmodule können nicht deaktiviert werden." });
  }
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  const { rowCount } = query(
    `UPDATE modules SET active=$1 WHERE key=$2`,
    [active ? 1 : 0, req.params.key]
  );
  if (rowCount === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});
export default router;
