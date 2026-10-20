import { Router } from "express";
import { z } from "zod";
import { query } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import type { AuthedRequest } from "../types";

const router = Router();
router.use(authRequired);

const schema = z.object({
  title:      z.string().min(1).max(200),
  body:       z.string().min(1).max(2000),
  priority:   z.enum(["normal", "wichtig", "dringend"]).default("normal"),
  expires_at: z.string().nullable().optional(),
});

// GET – alle aktiven Meldungen (alle eingeloggten Nutzer)
router.get("/", (_req, res) => {
  try {
    const { rows } = query<any>(`
      SELECT a.id, a.title, a.body, a.priority, a.expires_at, a.created_by,
             COALESCE(u.full_name, a.created_by) AS created_by_name, a.created_at
      FROM announcements a LEFT JOIN users u ON u.id = a.created_by
      WHERE a.expires_at IS NULL OR a.expires_at >= date('now')
      ORDER BY
        CASE a.priority WHEN 'dringend' THEN 0 WHEN 'wichtig' THEN 1 ELSE 2 END,
        a.created_at DESC
    `, []);
    res.json(rows);
  } catch {
    try {
      const { rows } = query<any>(`SELECT a.id, a.title, a.body, a.priority, NULL AS expires_at, a.created_by, COALESCE(u.full_name, a.created_by) AS created_by_name, a.created_at FROM announcements a LEFT JOIN users u ON u.id = a.created_by ORDER BY a.created_at DESC`, []);
      res.json(rows);
    } catch {
      res.json([]);
    }
  }
});

// GET /all – inkl. abgelaufener (meldungen oder verwaltung)
router.get("/all", requirePermission("meldungen", "verwaltung"), (_req, res) => {
  try {
    const { rows } = query<any>(`
      SELECT a.id, a.title, a.body, a.priority, a.expires_at, a.created_by,
             COALESCE(u.full_name, a.created_by) AS created_by_name, a.created_at
      FROM announcements a LEFT JOIN users u ON u.id = a.created_by ORDER BY a.created_at DESC
    `, []);
    res.json(rows);
  } catch {
    try {
      const { rows } = query<any>(`SELECT a.id, a.title, a.body, a.priority, NULL AS expires_at, a.created_by, COALESCE(u.full_name, a.created_by) AS created_by_name, a.created_at FROM announcements a LEFT JOIN users u ON u.id = a.created_by ORDER BY a.created_at DESC`, []);
      res.json(rows);
    } catch {
      res.json([]);
    }
  }
});

// POST – neue Meldung (meldungen oder verwaltung)
router.post("/", requirePermission("meldungen", "verwaltung"), (req: AuthedRequest, res) => {
  const d = schema.parse(req.body);
  const { randomUUID } = require("crypto");
  const createdBy = req.user!.sub;
  query(
    `INSERT INTO announcements (id, title, body, priority, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), d.title, d.body, d.priority, d.expires_at ?? null, createdBy]
  );
  res.status(201).json({ ok: true });
});

// PATCH – bearbeiten (meldungen oder verwaltung)
router.patch("/:id", requirePermission("meldungen", "verwaltung"), (req: AuthedRequest, res) => {
  const d = schema.partial().parse(req.body);
  const fields: string[] = [];
  const values: any[] = [];
  if (d.title      !== undefined) { values.push(d.title);      fields.push(`title = $${values.length}`); }
  if (d.body       !== undefined) { values.push(d.body);       fields.push(`body = $${values.length}`); }
  if (d.priority   !== undefined) { values.push(d.priority);   fields.push(`priority = $${values.length}`); }
  if (d.expires_at !== undefined) { values.push(d.expires_at); fields.push(`expires_at = $${values.length}`); }
  if (!fields.length) return res.status(400).json({ error: "nothing_to_update" });
  values.push(req.params.id);
  query(`UPDATE announcements SET ${fields.join(", ")} WHERE id = $${values.length}`, values);
  res.json({ ok: true });
});

// DELETE (meldungen oder verwaltung)
router.delete("/:id", requirePermission("meldungen", "verwaltung"), (req, res) => {
  query(`DELETE FROM announcements WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

export default router;
