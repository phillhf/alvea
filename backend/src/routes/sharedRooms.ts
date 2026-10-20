import { Router } from "express";
import { z } from "zod";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import type { AuthedRequest } from "../types";

const router = Router();
router.use(authRequired);

// ── GET Räume (nur teilbare, außer für Verwaltung) ───────────────────────────
router.get("/", requirePermission("raumbuchung", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const isAdmin = req.user!.permissions.includes("verwaltung") || req.user!.permissions.includes("raumbuchungsadmin");
    const where = isAdmin ? "" : "WHERE r.teilbar = 1";
    const { rows } = query<any>(`
      SELECT r.*,
        (SELECT COUNT(*) FROM shared_desks d WHERE d.room_id = r.id) AS desk_count
      FROM shared_rooms r
      ${where}
      ORDER BY r.name
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── GET einzelner Raum inkl. Tische ───────────────────────────────────────────
router.get("/:id", requirePermission("raumbuchung", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const room = query<any>(`SELECT * FROM shared_rooms WHERE id=$1`, [req.params.id]).rows[0];
    if (!room) return res.status(404).json({ error: "not_found" });
    const desks = query<any>(`SELECT * FROM shared_desks WHERE room_id=$1 ORDER BY sort_order, name`, [req.params.id]).rows;
    res.json({ ...room, desks });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── POST Raum anlegen (nur Verwaltung) ────────────────────────────────────────
const roomSchema = z.object({
  name:         z.string().min(1).max(200),
  location:     z.string().max(200).optional(),
  teilbar:      z.boolean().optional(),
  raum_buchbar: z.boolean().optional(),
  notiz:        z.string().max(1000).optional(),
});

router.post("/", requirePermission("verwaltung", "raumbuchungsadmin"), (req: AuthedRequest, res) => {
  try {
    const d = roomSchema.parse(req.body);
    const id = newId();
    query(
      `INSERT INTO shared_rooms (id,name,location,teilbar,raum_buchbar,notiz)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, d.name, d.location ?? null, d.teilbar === false ? 0 : 1, d.raum_buchbar ? 1 : 0, d.notiz ?? null]
    );
    res.json({ id });
  } catch (e: any) { res.status(400).json({ error: "invalid_input" }); }
});

router.patch("/:id", requirePermission("verwaltung", "raumbuchungsadmin"), (req: AuthedRequest, res) => {
  try {
    const d = roomSchema.partial().parse(req.body);
    const fields: string[] = []; const params: any[] = [];
    if (d.name         !== undefined) { fields.push(`name=$${fields.length+1}`);         params.push(d.name); }
    if (d.location      !== undefined) { fields.push(`location=$${fields.length+1}`);      params.push(d.location || null); }
    if (d.teilbar       !== undefined) { fields.push(`teilbar=$${fields.length+1}`);       params.push(d.teilbar ? 1 : 0); }
    if (d.raum_buchbar  !== undefined) { fields.push(`raum_buchbar=$${fields.length+1}`);  params.push(d.raum_buchbar ? 1 : 0); }
    if (d.notiz         !== undefined) { fields.push(`notiz=$${fields.length+1}`);         params.push(d.notiz || null); }
    if (fields.length) { params.push(req.params.id); query(`UPDATE shared_rooms SET ${fields.join(",")} WHERE id=$${params.length}`, params); }
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: "invalid_input" }); }
});

router.delete("/:id", requirePermission("verwaltung", "raumbuchungsadmin"), (req: AuthedRequest, res) => {
  try {
    query(`DELETE FROM shared_rooms WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── Tische ─────────────────────────────────────────────────────────────────
const deskSchema = z.object({
  name:        z.string().min(1).max(100),
  ausstattung: z.string().max(500).optional(),
});

router.post("/:id/desks", requirePermission("verwaltung", "raumbuchungsadmin"), (req: AuthedRequest, res) => {
  try {
    const d = deskSchema.parse(req.body);
    const id = newId();
    const maxOrder = (query<any>(`SELECT COALESCE(MAX(sort_order),0) as m FROM shared_desks WHERE room_id=$1`, [req.params.id]).rows[0] as any)?.m ?? 0;
    query(`INSERT INTO shared_desks (id,room_id,name,sort_order,ausstattung) VALUES ($1,$2,$3,$4,$5)`,
      [id, req.params.id, d.name, maxOrder + 1, d.ausstattung ?? null]);
    res.json({ id });
  } catch (e: any) { res.status(400).json({ error: "invalid_input" }); }
});

router.patch("/:roomId/desks/:deskId", requirePermission("verwaltung", "raumbuchungsadmin"), (req: AuthedRequest, res) => {
  try {
    const d = deskSchema.partial().parse(req.body);
    const fields: string[] = []; const params: any[] = [];
    if (d.name        !== undefined) { fields.push(`name=$${fields.length+1}`);        params.push(d.name); }
    if (d.ausstattung !== undefined) { fields.push(`ausstattung=$${fields.length+1}`);  params.push(d.ausstattung || null); }
    if (fields.length) { params.push(req.params.deskId); query(`UPDATE shared_desks SET ${fields.join(",")} WHERE id=$${params.length}`, params); }
    res.json({ ok: true });
  } catch (e: any) { res.status(400).json({ error: "invalid_input" }); }
});

router.delete("/:roomId/desks/:deskId", requirePermission("verwaltung", "raumbuchungsadmin"), (req: AuthedRequest, res) => {
  try {
    query(`DELETE FROM shared_desks WHERE id=$1`, [req.params.deskId]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

export default router;
