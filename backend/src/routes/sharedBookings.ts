import { Router } from "express";
import { z } from "zod";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import type { AuthedRequest } from "../types";

const router = Router();
router.use(authRequired);
router.use(requirePermission("raumbuchung", "raumbuchungsadmin", "verwaltung"));

// ── GET Nutzerliste für Stellvertretungs-Buchung ─────────────────────────────
// Bewusst eigener, schlanker Endpunkt (nur id + Name) statt /api/users,
// damit z. B. ein Sekretariat mit raumbuchung_stellvertretung KEINEN Zugriff
// auf die vollständige Benutzerverwaltung braucht.
// ── GET Nutzerliste für Stellvertretungs-Buchung ─────────────────────────────
// Modul-Admins duerfen fuer jeden buchen (operative Notwendigkeit).
// Alle anderen mit raumbuchung_stellvertretung sehen NUR die Personen,
// fuer die ein Admin explizit eine Stellvertretung freigegeben hat
// (z. B. Sekretariat -> nur den eigenen Chefarzt, nicht die ganze Belegschaft).
router.get("/bookable-users", requirePermission("raumbuchung_stellvertretung", "raumbuchungsadmin", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const isModuleAdmin = req.user!.permissions.includes("raumbuchungsadmin") || req.user!.permissions.includes("verwaltung");
    if (isModuleAdmin) {
      const { rows } = query<any>(`SELECT id, full_name, email FROM users WHERE active = 1 ORDER BY full_name`);
      return res.json(rows);
    }
    const { rows } = query<any>(`
      SELECT u.id, u.full_name, u.email
      FROM shared_booking_delegates sd
      JOIN users u ON u.id = sd.represented_id
      WHERE sd.delegate_id = $1 AND u.active = 1
      ORDER BY u.full_name
    `, [req.user!.sub]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── GET Buchungen für einen Raum (für die visuelle Belegungsanzeige) ─────────
// Liefert alle Buchungen die sich mit dem angefragten Zeitfenster überschneiden
router.get("/", (req: AuthedRequest, res) => {
  try {
    const { room_id, from, to } = req.query as Record<string, string>;
    if (!room_id) return res.status(400).json({ error: "room_id_required" });

    const params: any[] = [room_id];
    let timeFilter = "";
    if (from && to) {
      // Überschneidung: Buchung beginnt vor Ende des Fensters UND endet nach Beginn des Fensters
      timeFilter = ` AND start_at < $${params.length + 2} AND end_at > $${params.length + 1}`;
      params.push(from, to);
    }

    const { rows } = query<any>(`
      SELECT * FROM shared_bookings
      WHERE room_id = $1 ${timeFilter}
      ORDER BY start_at
    `, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── GET alle Buchungen im System (nur für Raumbuchungs-Admin) ────────────────
router.get("/all", requirePermission("raumbuchungsadmin", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const includePast = req.query.include_past === "true";
    const timeFilter = includePast ? "" : "AND b.end_at >= datetime('now')";
    const { rows } = query<any>(`
      SELECT b.*, r.name AS room_name, d.name AS desk_name
      FROM shared_bookings b
      LEFT JOIN shared_rooms r ON r.id = b.room_id
      LEFT JOIN shared_desks d ON d.id = b.desk_id
      WHERE 1=1 ${timeFilter}
      ORDER BY b.start_at ${includePast ? "DESC" : "ASC"}
      LIMIT 300
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── GET eigene Buchungen ──────────────────────────────────────────────────────
router.get("/my", (req: AuthedRequest, res) => {
  try {
    const includePast = req.query.include_past === "true";
    const timeFilter = includePast ? "" : "AND b.end_at >= datetime('now')";
    const { rows } = query<any>(`
      SELECT b.*, r.name AS room_name, d.name AS desk_name
      FROM shared_bookings b
      LEFT JOIN shared_rooms r ON r.id = b.room_id
      LEFT JOIN shared_desks d ON d.id = b.desk_id
      WHERE (b.user_id = $1 OR b.booked_by_id = $1) ${timeFilter}
      ORDER BY b.start_at ${includePast ? "DESC" : "ASC"}
      LIMIT 200
    `, [req.user!.sub]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── Kernlogik: eine einzelne Buchung anlegen (inkl. Kollisionsprüfung) ───────
// Wird sowohl vom normalen POST / als auch vom Serien-Endpunkt POST /recurring
// genutzt, damit die Pruef-Logik nur an einer Stelle existiert.
function createSingleBooking(
  reqUser: NonNullable<AuthedRequest["user"]>,
  d: { room_id: string; desk_id?: string; whole_room?: boolean; start_at: string; end_at: string; for_user_id?: string }
): { ok: true; id: string } | { ok: false; status: number; error: string; conflict?: any } {
  const wholeRoom = !!d.whole_room;

  const room = query<any>(`SELECT * FROM shared_rooms WHERE id=$1`, [d.room_id]).rows[0];
  if (!room) return { ok: false, status: 404, error: "room_not_found" };
  if (!room.teilbar) return { ok: false, status: 400, error: "room_not_shareable" };
  if (wholeRoom && !room.raum_buchbar) return { ok: false, status: 400, error: "whole_room_not_bookable" };

  if (!wholeRoom) {
    const desk = query<any>(`SELECT * FROM shared_desks WHERE id=$1 AND room_id=$2`, [d.desk_id, d.room_id]).rows[0];
    if (!desk) return { ok: false, status: 404, error: "desk_not_found" };
  }

  const isModuleAdmin = reqUser.permissions.includes("raumbuchungsadmin") || reqUser.permissions.includes("verwaltung");
  let targetUserId = reqUser.sub;
  let bookedById: string | null = null;
  let bookedByName: string | null = null;

  if (d.for_user_id && d.for_user_id !== reqUser.sub) {
    if (!isModuleAdmin) {
      const delegation = query<any>(
        `SELECT id FROM shared_booking_delegates WHERE delegate_id=$1 AND represented_id=$2`,
        [reqUser.sub, d.for_user_id]
      ).rows[0];
      if (!delegation) return { ok: false, status: 403, error: "not_authorized_for_this_person" };
    }
    const targetUser = query<any>(`SELECT id, full_name FROM users WHERE id=$1 AND active=1`, [d.for_user_id]).rows[0];
    if (!targetUser) return { ok: false, status: 404, error: "target_user_not_found" };
    targetUserId = targetUser.id;
    const selfUser = query<any>(`SELECT full_name FROM users WHERE id=$1`, [reqUser.sub]).rows[0];
    bookedById = reqUser.sub;
    bookedByName = selfUser?.full_name ?? reqUser.email;
  }

  const overlapParams: any[] = [d.room_id, d.end_at, d.start_at];
  let overlapWhere: string;
  if (wholeRoom) {
    overlapWhere = `room_id = $1 AND start_at < $2 AND end_at > $3`;
  } else {
    overlapWhere = `room_id = $1 AND start_at < $2 AND end_at > $3 AND (whole_room = 1 OR desk_id = $4)`;
    overlapParams.push(d.desk_id);
  }
  const conflict = query<any>(
    `SELECT id, user_name, start_at, end_at FROM shared_bookings WHERE ${overlapWhere} LIMIT 1`,
    overlapParams
  ).rows[0];
  if (conflict) return { ok: false, status: 409, error: "conflict", conflict };

  const id = newId();
  const targetUserRow = query<any>(`SELECT full_name FROM users WHERE id=$1`, [targetUserId]).rows[0];
  query(
    `INSERT INTO shared_bookings (id,room_id,desk_id,whole_room,user_id,user_name,start_at,end_at,booked_by_id,booked_by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, d.room_id, wholeRoom ? null : d.desk_id, wholeRoom ? 1 : 0,
     targetUserId, targetUserRow?.full_name ?? null, d.start_at, d.end_at,
     bookedById, bookedByName]
  );
  return { ok: true, id };
}

// ── POST Buchung anlegen ──────────────────────────────────────────────────────
const bookingSchema = z.object({
  room_id:    z.string().min(1),
  desk_id:    z.string().min(1).optional(),
  whole_room: z.boolean().optional(),
  start_at:   z.string().min(1), // ISO datetime
  end_at:     z.string().min(1),
  for_user_id: z.string().min(1).optional(), // Stellvertretend für andere Person buchen
}).refine(d => new Date(d.end_at) > new Date(d.start_at), { message: "end_before_start" })
  .refine(d => d.whole_room || d.desk_id, { message: "desk_or_whole_room_required" });

router.post("/", (req: AuthedRequest, res) => {
  try {
    const d = bookingSchema.parse(req.body);
    const result = createSingleBooking(req.user!, d);
    if (!result.ok) return res.status(result.status).json({ error: result.error, conflict: result.conflict });
    res.json({ id: result.id });
  } catch (e: any) {
    if (e?.issues) return res.status(400).json({ error: "invalid_input", detail: e.issues });
    res.status(500).json({ error: "db_error" });
  }
});

// ── POST wöchentlich wiederkehrende Buchung ──────────────────────────────────
// Legt bis zu 12 wöchentliche Termine an, jeder einzeln kollisionsgeprueft.
// Ein belegter Termin blockiert nicht die anderen - die Antwort listet auf,
// welche Termine geklappt haben und welche wegen Ueberschneidung ausgelassen wurden.
const recurringSchema = z.object({
  room_id:    z.string().min(1),
  desk_id:    z.string().min(1).optional(),
  whole_room: z.boolean().optional(),
  start_at:   z.string().min(1),
  end_at:     z.string().min(1),
  for_user_id: z.string().min(1).optional(),
  weeks: z.number().int().min(2).max(12),
}).refine(d => new Date(d.end_at) > new Date(d.start_at), { message: "end_before_start" })
  .refine(d => d.whole_room || d.desk_id, { message: "desk_or_whole_room_required" });

router.post("/recurring", (req: AuthedRequest, res) => {
  try {
    const d = recurringSchema.parse(req.body);
    const created: { date: string; id: string }[] = [];
    const skipped: { date: string; reason: string }[] = [];

    for (let i = 0; i < d.weeks; i++) {
      const offsetMs = i * 7 * 24 * 60 * 60 * 1000;
      const occStart = new Date(new Date(d.start_at).getTime() + offsetMs).toISOString();
      const occEnd   = new Date(new Date(d.end_at).getTime() + offsetMs).toISOString();

      const result = createSingleBooking(req.user!, {
        room_id: d.room_id, desk_id: d.desk_id, whole_room: d.whole_room,
        start_at: occStart, end_at: occEnd, for_user_id: d.for_user_id,
      });
      if (result.ok) created.push({ date: occStart, id: result.id });
      else skipped.push({ date: occStart, reason: result.error });
    }

    res.json({ created, skipped });
  } catch (e: any) {
    if (e?.issues) return res.status(400).json({ error: "invalid_input", detail: e.issues });
    res.status(500).json({ error: "db_error" });
  }
});

// ── DELETE Buchung stornieren (nur eigene, oder Verwaltung) ──────────────────
router.delete("/:id", (req: AuthedRequest, res) => {
  try {
    const booking = query<any>(`SELECT user_id, booked_by_id FROM shared_bookings WHERE id=$1`, [req.params.id]).rows[0];
    if (!booking) return res.status(404).json({ error: "not_found" });
    const isAdmin = req.user!.permissions.includes("verwaltung") || req.user!.permissions.includes("raumbuchungsadmin");
    const isOwner = booking.user_id === req.user!.sub;
    const isProxyBooker = booking.booked_by_id === req.user!.sub;
    if (!isAdmin && !isOwner && !isProxyBooker) {
      return res.status(403).json({ error: "forbidden" });
    }
    query(`DELETE FROM shared_bookings WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── GET eigene Favoriten-Tische ───────────────────────────────────────────────
router.get("/favorites", (req: AuthedRequest, res) => {
  try {
    const { rows } = query<any>(`
      SELECT f.desk_id, d.name AS desk_name, d.room_id, r.name AS room_name
      FROM shared_desk_favorites f
      JOIN shared_desks d ON d.id = f.desk_id
      JOIN shared_rooms r ON r.id = d.room_id
      WHERE f.user_id = $1
      ORDER BY r.name, d.name
    `, [req.user!.sub]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── POST Favorit umschalten (an/aus) ──────────────────────────────────────────
router.post("/favorites/:deskId", (req: AuthedRequest, res) => {
  try {
    const existing = query<any>(
      `SELECT id FROM shared_desk_favorites WHERE user_id=$1 AND desk_id=$2`,
      [req.user!.sub, req.params.deskId]
    ).rows[0];
    if (existing) {
      query(`DELETE FROM shared_desk_favorites WHERE id=$1`, [existing.id]);
      return res.json({ favorite: false });
    }
    query(`INSERT INTO shared_desk_favorites (id,user_id,desk_id) VALUES ($1,$2,$3)`,
      [newId(), req.user!.sub, req.params.deskId]);
    res.json({ favorite: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

export default router;
