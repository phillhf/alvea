import { Router } from "express";
import { z } from "zod";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import type { AuthedRequest } from "../types";

const router = Router();
router.use(authRequired);
router.use(requirePermission("chat", "verwaltung"));

const schema = z.object({
  message: z.string().min(1).max(1000),
});

// GET – letzte 100 Nachrichten
router.get("/", (req: AuthedRequest, res) => {
  try {
    const { rows } = query<any>(
      `SELECT id, user_id, user_name, message, created_at
       FROM chat_messages
       ORDER BY created_at DESC
       LIMIT 100`,
      []
    );
    res.json(rows.reverse());
  } catch (e: any) {
    res.status(500).json({ error: "Fehler beim Laden der Nachrichten" });
  }
});

// POST – neue Nachricht
router.post("/", (req: AuthedRequest, res) => {
  try {
    const d = schema.parse(req.body);
    const id = newId();
    const userId   = req.user!.sub;
    const userRow  = query<any>(`SELECT full_name, email FROM users WHERE id = $1`, [userId]).rows[0] as any;
    const userName = userRow?.full_name || userRow?.email || "Unbekannt";
    query(
      `INSERT INTO chat_messages (id, user_id, user_name, message)
       VALUES ($1, $2, $3, $4)`,
      [id, userId, userName, d.message]
    );
    res.status(201).json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Fehler beim Senden der Nachricht" });
  }
});

export default router;
