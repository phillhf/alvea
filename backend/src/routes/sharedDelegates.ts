import { Router } from "express";
import { z } from "zod";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import type { AuthedRequest } from "../types";

const router = Router();
router.use(authRequired);

// ── GET alle Stellvertretungen (nur Modul-Admin) ─────────────────────────────
router.get("/", requirePermission("raumbuchungsadmin", "verwaltung"), (_req, res) => {
  try {
    const { rows } = query<any>(`
      SELECT sd.*, d.full_name AS delegate_name, r.full_name AS represented_name
      FROM shared_booking_delegates sd
      LEFT JOIN users d ON d.id = sd.delegate_id
      LEFT JOIN users r ON r.id = sd.represented_id
      ORDER BY d.full_name, r.full_name
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── GET eigene Stellvertretungen (für wen darf ICH buchen) ───────────────────
router.get("/mine", (req: AuthedRequest, res) => {
  try {
    const { rows } = query<any>(`
      SELECT sd.*, r.full_name AS represented_name
      FROM shared_booking_delegates sd
      LEFT JOIN users r ON r.id = sd.represented_id
      WHERE sd.delegate_id = $1
      ORDER BY r.full_name
    `, [req.user!.sub]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── POST Stellvertretung anlegen (nur Modul-Admin) ────────────────────────────
const delegateSchema = z.object({
  delegate_id:    z.string().min(1),
  represented_id: z.string().min(1),
}).refine(d => d.delegate_id !== d.represented_id, { message: "cannot_delegate_to_self" });

router.post("/", requirePermission("raumbuchungsadmin", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const d = delegateSchema.parse(req.body);
    const delegate    = query<any>(`SELECT id FROM users WHERE id=$1 AND active=1`, [d.delegate_id]).rows[0];
    const represented = query<any>(`SELECT id FROM users WHERE id=$1 AND active=1`, [d.represented_id]).rows[0];
    if (!delegate || !represented) return res.status(404).json({ error: "user_not_found" });

    const existing = query<any>(
      `SELECT id FROM shared_booking_delegates WHERE delegate_id=$1 AND represented_id=$2`,
      [d.delegate_id, d.represented_id]
    ).rows[0];
    if (existing) return res.status(409).json({ error: "already_exists" });

    const id = newId();
    query(`INSERT INTO shared_booking_delegates (id,delegate_id,represented_id) VALUES ($1,$2,$3)`,
      [id, d.delegate_id, d.represented_id]);
    res.json({ id });
  } catch (e: any) {
    if (e?.issues) return res.status(400).json({ error: "invalid_input" });
    res.status(500).json({ error: "db_error" });
  }
});

// ── DELETE Stellvertretung entfernen (nur Modul-Admin) ────────────────────────
router.delete("/:id", requirePermission("raumbuchungsadmin", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    query(`DELETE FROM shared_booking_delegates WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

export default router;
