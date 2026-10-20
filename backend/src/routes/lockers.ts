import { Router } from "express";
import { z } from "zod";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { audit } from "../services/audit";

const router = Router();
router.use(authRequired);
// Hinweis: requirePermission("spindverwaltung") wird pro Route gesetzt,
// damit stationspersonal auf /requests/my und POST /requests zugreifen kann.

// ── Spinde ────────────────────────────────────────────────────────────────────

router.get("/", requirePermission("spindverwaltung", "verwaltung"), (_req, res) => {
  const { rows } = query<any>(`
    SELECT l.id, l.room_id, l.number, l.notes, l.created_at,
           r.room_number,
           a.name AS station_name,
           a.name AS area_name,
           h.name AS house_name,
           la.id AS assignment_id,
           la.person_vorname, la.person_name, la.person_berufsgruppe,
           la.starts_at, la.ends_at
      FROM lockers l
      LEFT JOIN rooms    r  ON r.id  = l.room_id
      LEFT JOIN areas    a  ON a.id  = COALESCE(r.area_id, r.station_id)
      LEFT JOIN houses   h  ON h.id  = a.house_id
      LEFT JOIN locker_assignments la ON la.locker_id = l.id AND la.ended_at IS NULL
     ORDER BY h.name, a.name, r.room_number, l.number
  `, []);
  res.json(rows);
});

router.get("/overview", requirePermission("spindverwaltung", "verwaltung"), (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const soon  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const { rows } = query<any>(`
    SELECT
      SUM(CASE WHEN la.id IS NULL THEN 1 ELSE 0 END) AS free,
      SUM(CASE WHEN la.id IS NOT NULL AND (la.ends_at IS NULL OR la.ends_at >= $2) THEN 1 ELSE 0 END) AS permanent,
      SUM(CASE WHEN la.ends_at IS NOT NULL AND la.ends_at >= $1 AND la.ends_at <= $2 AND la.ended_at IS NULL THEN 1 ELSE 0 END) AS expiring_soon,
      SUM(CASE WHEN la.ends_at IS NOT NULL AND la.ends_at < $1 AND la.ended_at IS NULL THEN 1 ELSE 0 END) AS overdue
    FROM lockers l
    LEFT JOIN locker_assignments la ON la.locker_id = l.id AND la.ended_at IS NULL
  `, [today, soon]);
  res.json(rows[0] ?? { free: 0, permanent: 0, expiring_soon: 0, overdue: 0 });
});

const lockerSchema = z.object({
  room_id: z.string().uuid(),
  number:  z.string().min(1).max(50),
  notes:   z.string().max(500).optional(),
});

router.post("/", requirePermission("spindverwaltung", "verwaltung"), (req: AuthedRequest, res) => {
  const d = lockerSchema.parse(req.body);
  const id = newId();
  try {
    query(`INSERT INTO lockers (id,room_id,number,notes) VALUES ($1,$2,$3,$4)`,
      [id, d.room_id, d.number, d.notes ?? null]);
  } catch (e: any) {
    if (e.message?.includes("UNIQUE")) return res.status(409).json({ error: "number_taken" });
    throw e;
  }
  audit(req.user!.sub, "create", "locker", id);
  res.status(201).json({ id });
});

router.patch("/:id", requirePermission("spindverwaltung", "verwaltung"), (req: AuthedRequest, res) => {
  const d = lockerSchema.partial().parse(req.body);
  const fields: string[] = [], vals: any[] = [];
  if (d.room_id !== undefined) { vals.push(d.room_id); fields.push(`room_id=$${vals.length}`); }
  if (d.number  !== undefined) { vals.push(d.number);  fields.push(`number=$${vals.length}`);  }
  if (d.notes   !== undefined) { vals.push(d.notes);   fields.push(`notes=$${vals.length}`);   }
  if (!fields.length) return res.status(400).json({ error: "nothing_to_update" });
  vals.push(req.params.id);
  query(`UPDATE lockers SET ${fields.join(",")} WHERE id=$${vals.length}`, vals);
  res.json({ ok: true });
});

router.delete("/:id", requirePermission("spindverwaltung", "verwaltung"), (req: AuthedRequest, res) => {
  query(`DELETE FROM lockers WHERE id=$1`, [req.params.id]);
  audit(req.user!.sub, "delete", "locker", req.params.id);
  res.json({ ok: true });
});

// ── Zuweisungen ───────────────────────────────────────────────────────────────

const assignSchema = z.object({
  person_vorname:     z.string().min(1).max(100),
  person_name:        z.string().min(1).max(100),
  person_berufsgruppe: z.string().max(100).optional(),
  starts_at:          z.string().optional(),
  ends_at:            z.string().nullable().optional(),
});

router.get("/:id/history", requirePermission("spindverwaltung", "verwaltung"), (req, res) => {
  const { rows } = query<any>(`
    SELECT id, person_vorname, person_name, person_berufsgruppe,
           starts_at, ends_at, assigned_by, created_at, ended_at, ended_by
      FROM locker_assignments
     WHERE locker_id=$1
     ORDER BY created_at DESC
  `, [req.params.id]);
  res.json(rows);
});

router.post("/:id/assign", requirePermission("spindverwaltung", "verwaltung"), (req: AuthedRequest, res) => {
  const d = assignSchema.parse(req.body);
  const today = new Date().toISOString().slice(0, 10);
  // Bestehende aktive Zuweisung beenden
  query(`UPDATE locker_assignments SET ended_at=$1, ended_by=$2
         WHERE locker_id=$3 AND ended_at IS NULL`,
    [today, req.user!.sub, req.params.id]);
  const id = newId();
  query(`INSERT INTO locker_assignments
           (id,locker_id,person_vorname,person_name,person_berufsgruppe,starts_at,ends_at,assigned_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, req.params.id, d.person_vorname, d.person_name,
     d.person_berufsgruppe ?? null, d.starts_at ?? today, d.ends_at ?? null, req.user!.sub]);
  audit(req.user!.sub, "assign", "locker", req.params.id, { person: `${d.person_vorname} ${d.person_name}` });
  res.status(201).json({ id });
});

router.delete("/:id/assign", requirePermission("spindverwaltung", "verwaltung"), (req: AuthedRequest, res) => {
  const today = new Date().toISOString().slice(0, 10);
  query(`UPDATE locker_assignments SET ended_at=$1, ended_by=$2
         WHERE locker_id=$3 AND ended_at IS NULL`,
    [today, req.user!.sub, req.params.id]);
  audit(req.user!.sub, "unassign", "locker", req.params.id);
  res.json({ ok: true });
});

export default router;

// ── Spind-Anfragen ──────────────────────────────────────────────────────

const requestCreateSchema = z.object({
  vorname:        z.string().min(1).max(100),
  nachname:       z.string().min(1).max(100),
  berufsgruppe:   z.string().min(1).max(100),
  station_id:     z.string().optional(),
  station_name:   z.string().optional(),
  starts_at:      z.string().optional(),
  ends_at:        z.string().optional(),
});router.get("/requests", requirePermission("spindverwaltung", "verwaltung"), (_req, res) => {
  const { rows } = query<any>(`
    SELECT r.id, r.vorname, r.nachname, r.berufsgruppe, r.station_name, r.status, r.starts_at, r.ends_at, r.created_at, l.number AS locker_number
      FROM locker_requests r
      LEFT JOIN lockers l ON l.id = r.locker_id
     WHERE r.status = 'offen'
     ORDER BY r.created_at ASC
  `, []);
  res.json(rows);
});

// Eigene Anfragen für Pflegepersonal (nach station oder created_by)
router.get("/requests/my", authRequired, (req: AuthedRequest, res) => {
  const { rows } = query<any>(`
    SELECT r.id, r.vorname, r.nachname, r.berufsgruppe, r.station_name, r.status,
           r.starts_at, r.ends_at, r.created_at, r.resolved_at,
           l.number AS locker_number
      FROM locker_requests r
      LEFT JOIN lockers l ON l.id = r.locker_id
     WHERE r.created_by = $1
     ORDER BY r.created_at DESC
     LIMIT 20
  `, [req.user!.sub]);
  res.json(rows);
});

router.post("/requests", authRequired, (req: AuthedRequest, res) => {
  const d = requestCreateSchema.parse(req.body);
  const id = newId();
  query(`INSERT INTO locker_requests (id,vorname,nachname,berufsgruppe,station_id,station_name,starts_at,ends_at,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, d.vorname, d.nachname, d.berufsgruppe, d.station_id ?? null, d.station_name ?? null,
     d.starts_at ?? null, d.ends_at ?? null, req.user!.sub]);
  res.status(201).json({ id });
});

router.patch("/requests/:id", requirePermission("spindverwaltung", "verwaltung"), (req: AuthedRequest, res) => {
  const patchSchema = z.object({
    vorname:      z.string().min(1).max(100).optional(),
    nachname:     z.string().min(1).max(100).optional(),
    berufsgruppe: z.string().min(1).max(100).optional(),
    starts_at:    z.string().nullable().optional(),
    ends_at:      z.string().nullable().optional(),
    status:       z.enum(["offen","zugewiesen","abgelehnt"]).optional(),
  });
  const d = patchSchema.parse(req.body);
  const sets: string[] = [];
  const vals: any[] = [];
  if (d.vorname      !== undefined) { vals.push(d.vorname);      sets.push(`vorname=$${vals.length}`); }
  if (d.nachname     !== undefined) { vals.push(d.nachname);     sets.push(`nachname=$${vals.length}`); }
  if (d.berufsgruppe !== undefined) { vals.push(d.berufsgruppe); sets.push(`berufsgruppe=$${vals.length}`); }
  if (d.starts_at    !== undefined) { vals.push(d.starts_at);    sets.push(`starts_at=$${vals.length}`); }
  if (d.ends_at      !== undefined) { vals.push(d.ends_at);      sets.push(`ends_at=$${vals.length}`); }
  if (d.status       !== undefined) { vals.push(d.status);       sets.push(`status=$${vals.length}`); }
  if (sets.length === 0) { res.json({ ok: true }); return; }
  vals.push(req.params.id);
  query(`UPDATE locker_requests SET ${sets.join(",")} WHERE id=$${vals.length}`, vals);
  res.json({ ok: true });
});

router.post("/requests/:id/assign", requirePermission("spindverwaltung", "verwaltung"), (req: AuthedRequest, res) => {
  const assignSchema = z.object({ locker_id: z.string().uuid(), starts_at: z.string().optional(), ends_at: z.string().optional() });
  const { locker_id, starts_at, ends_at } = assignSchema.parse(req.body);
  // Prüfen ob Spind frei
  const busy = query<any>(`SELECT id FROM locker_assignments WHERE locker_id=$1 AND ended_at IS NULL`, [locker_id]);
  if (busy.rows.length > 0) { res.status(409).json({ error: "Spind bereits belegt" }); return; }
  // Anfrage laden
  const { rows } = query<any>(`SELECT * FROM locker_requests WHERE id=$1`, [req.params.id]);
  if (!rows[0]) { res.status(404).json({ error: "Anfrage nicht gefunden" }); return; }
  const r = rows[0];
  // Zuweisung anlegen
  const assignId = newId();
  const sa = starts_at ?? r.starts_at ?? null;
  const ea = ends_at   ?? r.ends_at   ?? null;
  query(`INSERT INTO locker_assignments (id,locker_id,person_vorname,person_name,person_berufsgruppe,starts_at,ends_at,assigned_by)
         VALUES ($1,$2,$3,$4,$5,COALESCE($6,datetime('now')),$7,$8)`,
    [assignId, locker_id, r.vorname, r.nachname, r.berufsgruppe, sa, ea, req.user!.sub]);
  // Anfrage als erledigt markieren
  const lockerInfo = query<any>(`SELECT number FROM lockers WHERE id=$1`, [locker_id]).rows[0];
  query(`UPDATE locker_requests SET status='zugewiesen', locker_id=$1, locker_number=$2, resolved_at=datetime('now'), resolved_by=$3 WHERE id=$4`,
    [locker_id, lockerInfo?.number ?? null, req.user!.sub, req.params.id]);
  res.json({ ok: true });
});

router.delete("/requests/:id", requirePermission("spindverwaltung", "verwaltung"), (req: AuthedRequest, res) => {
  query(`UPDATE locker_requests SET status='abgelehnt', resolved_at=datetime('now'), resolved_by=$1 WHERE id=$2`,
    [req.user!.sub, req.params.id]);
  res.json({ ok: true });
});

// Erledigte Anfrage aus Nutzersicht löschen (nur eigene, nur wenn nicht offen)
router.delete("/requests/:id/dismiss", authRequired, (req: AuthedRequest, res) => {
  query(`DELETE FROM locker_requests WHERE id=$1 AND created_by=$2 AND status != 'offen'`,
    [req.params.id, req.user!.sub]);
  res.json({ ok: true });
});

// ── Zuweisung bearbeiten ────────────────────────────────────────────────
router.patch("/:id/assignment", requirePermission("spindverwaltung", "verwaltung"), (req: AuthedRequest, res) => {
  const s = z.object({
    person_vorname:     z.string().min(1).optional(),
    person_name:        z.string().min(1).optional(),
    person_berufsgruppe: z.string().min(1).optional(),
    starts_at:          z.string().nullable().optional(),
    ends_at:            z.string().nullable().optional(),
  });
  const d = s.parse(req.body);
  const sets: string[] = [];
  const vals: any[] = [];
  if (d.person_vorname      !== undefined) { vals.push(d.person_vorname);      sets.push(`person_vorname=$${vals.length}`); }
  if (d.person_name         !== undefined) { vals.push(d.person_name);         sets.push(`person_name=$${vals.length}`); }
  if (d.person_berufsgruppe !== undefined) { vals.push(d.person_berufsgruppe); sets.push(`person_berufsgruppe=$${vals.length}`); }
  if (d.starts_at           !== undefined) { vals.push(d.starts_at);           sets.push(`starts_at=$${vals.length}`); }
  if (d.ends_at             !== undefined) { vals.push(d.ends_at);             sets.push(`ends_at=$${vals.length}`); }
  if (sets.length === 0) { res.json({ ok: true }); return; }
  vals.push(req.params.id);
  query(`UPDATE locker_assignments SET ${sets.join(",")} WHERE locker_id=$${vals.length} AND ended_at IS NULL`, vals);
  res.json({ ok: true });
});
