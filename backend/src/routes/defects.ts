import { Router } from "express";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { audit } from "../services/audit";
import { getAreaScope } from "../services/scope";
import { z } from "zod";

const router = Router();
router.use(authRequired);

// GET /api/defects/stations – Bereiche/Stationen für Defektmeldung (scoped)
router.get("/stations", (req: AuthedRequest, res) => {
  // Vollzugriff wenn verwaltung-Permission im Token – scope nicht prüfen
  const hasVerwaltung = req.user!.permissions.includes("verwaltung");
  const scope = hasVerwaltung ? null : getAreaScope(req.user!.sub, req.user!.permissions);

  const where: string[] = [];
  const params: any[] = [];

  if (scope !== null) {
    if (!scope.length) return res.json([]);
    const ph = scope.map((_, i) => `$${params.length + i + 1}`).join(",");
    where.push(`a.id IN (${ph})`);
    params.push(...scope);
  }

  const { rows } = query<any>(`
    SELECT a.id, COALESCE(a.bezeichnung, a.name) AS name,
           a.name AS area_name, h.name AS house_name,
           0 AS open_defects, 0 AS active_defects
    FROM areas a
    LEFT JOIN houses h ON h.id = a.house_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY h.name, a.name
  `, params);

  res.json(rows);
});

// GET /api/defects/stations/:id/beds – Zimmer + Betten einer Station
router.get("/stations/:id/beds", (req: AuthedRequest, res) => {
  const stationId = req.params.id;

  const { rows } = query<any>(`
    SELECT r.id AS room_id, r.room_number,
           b.id AS bed_id, b.bed_number, b.barcode,
           bt.name AS bed_type_name,
           COUNT(CASE WHEN d.status NOT IN ('behoben','ausgemustert') THEN 1 END) AS active_defects
    FROM rooms r
    JOIN beds b ON b.room_id = r.id
    LEFT JOIN bed_types bt ON bt.id = b.bed_type_id
    LEFT JOIN bed_defects d ON d.bed_id = b.id
    WHERE r.area_id = $1 OR r.station_id = $1
    GROUP BY r.id, r.room_number, b.id, b.bed_number, b.barcode, bt.name
    ORDER BY r.room_number, b.bed_number
  `, [stationId]);

  const roomMap = new Map<string, any>();
  for (const row of rows) {
    if (!roomMap.has(row.room_id)) {
      roomMap.set(row.room_id, { id: row.room_id, room_number: row.room_number, beds: [] });
    }
    roomMap.get(row.room_id).beds.push({
      id: row.bed_id,
      bed_number: row.bed_number,
      barcode: row.barcode,
      bed_type_name: row.bed_type_name,
      active_defects: Number(row.active_defects),
    });
  }

  res.json([...roomMap.values()]);
});

const SEV_MAP: Record<string,string> = {
  low: "niedrig", medium: "normal", high: "hoch", critical: "kritisch",
  niedrig: "niedrig", normal: "normal", hoch: "hoch", kritisch: "kritisch",
};

function mapSev(s: string | undefined): string {
  return SEV_MAP[s ?? "medium"] ?? "normal";
}

const createSchema = z.object({
  scanned_barcode: z.string().optional(),
  bed_id:          z.string().optional(),
  title:           z.string().min(1).max(200),
  description:     z.string().optional(),
  severity:        z.enum(["low","medium","high","critical","niedrig","normal","hoch","kritisch"]).default("medium"),
  notes:           z.string().optional(),
});

// GET /api/defects/my – eigene Meldungen (stationspersonal + bettenaufbereitung)
router.get("/my", requirePermission("stationspersonal", "bettenaufbereitung", "verwaltung"), (req: AuthedRequest, res) => {
  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ error: "unauthenticated" });
  const { rows } = query<any>(`
    SELECT d.id, d.status, d.severity, d.description, d.title, d.notes,
           d.scanned_barcode AS barcode, d.created_at,
           b.bed_number, r.room_number,
           s.name AS station_name
    FROM bed_defects d
    LEFT JOIN beds b ON b.id = d.bed_id
    LEFT JOIN rooms r ON r.id = COALESCE(d.room_id, b.room_id)
    LEFT JOIN areas s ON s.id = COALESCE(r.area_id, r.station_id)
    WHERE d.reported_by = $1 AND d.status != 'ausgemustert'
    ORDER BY d.created_at DESC
    LIMIT 30
  `, [userId]);
  res.json(rows);
});

// DELETE /api/defects/:id/dismiss – behobenen Defekt aus eigener Ansicht löschen
router.delete("/:id/dismiss", requirePermission("stationspersonal", "bettenaufbereitung", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const userId = req.user?.sub;
    const row = query<any>(`SELECT id, status, reported_by FROM bed_defects WHERE id=$1`, [req.params.id]).rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    if (row.reported_by !== userId && !req.user?.permissions.includes("verwaltung"))
      return res.status(403).json({ error: "forbidden" });
    if (row.status !== "behoben")
      return res.status(400).json({ error: "not_resolved_yet" });
    query(`DELETE FROM bed_defects WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// GET /api/defects – Gesamtübersicht (nur betten_reparatur)
router.get("/", requirePermission("betten_reparatur", "verwaltung"), (req: AuthedRequest, res) => {
  const status = (req.query.status as string) || "";
  let where = "";
  const params: any[] = [];
  if (status) { where = `WHERE d.status = $1`; params.push(status); }

  const { rows } = query<any>(`
    SELECT d.*, b.bed_number, bt.name AS bed_type_name,
           r.room_number, s.name AS station_name,
           u.full_name AS reported_by_name,
           a.full_name AS assigned_to_name
    FROM bed_defects d
    LEFT JOIN beds b ON b.id = d.bed_id
    LEFT JOIN bed_types bt ON bt.id = b.bed_type_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN areas s ON s.id = COALESCE(r.area_id, r.station_id)
    LEFT JOIN users u ON u.id = d.reported_by
    LEFT JOIN users a ON a.id = d.assigned_to
    ${where}
    ORDER BY
      CASE d.severity WHEN 'kritisch' THEN 0 WHEN 'hoch' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      CASE d.status WHEN 'gemeldet' THEN 0 WHEN 'in_reparatur' THEN 1 ELSE 2 END,
      d.created_at DESC
  `, params);

  res.json(rows.map((r: any) => ({
    ...r,
    photos: r.photos ? JSON.parse(r.photos) : [],
  })));
});

// GET /api/defects/:id
router.get("/:id", (req, res) => {
  const { rows } = query<any>(`
    SELECT d.*, b.bed_number, bt.name AS bed_type_name,
           r.room_number, s.name AS station_name,
           u.full_name AS reported_by_name, a.full_name AS assigned_to_name
    FROM bed_defects d
    LEFT JOIN beds b ON b.id = d.bed_id
    LEFT JOIN bed_types bt ON bt.id = b.bed_type_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN areas s ON s.id = COALESCE(r.area_id, r.station_id)
    LEFT JOIN users u ON u.id = d.reported_by
    LEFT JOIN users a ON a.id = d.assigned_to
    WHERE d.id = $1
  `, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const row = rows[0];
  res.json({ ...row, photos: row.photos ? JSON.parse(row.photos) : [] });
});

// POST /api/defects – melden
router.post("/", (req: AuthedRequest, res) => {
  const d = createSchema.parse(req.body);
  const id = newId();
  query(
    `INSERT INTO bed_defects (id,bed_id,scanned_barcode,title,description,severity,notes,reported_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, d.bed_id ?? null, d.scanned_barcode ?? null, d.title, d.description ?? null,
     mapSev(d.severity), d.notes ?? null, req.user!.sub]
  );
  audit(req.user!.sub, "create", "defect", id);
  const { rows } = query(`SELECT * FROM bed_defects WHERE id=$1`, [id]);
  res.status(201).json(rows[0]);
});

// PATCH /api/defects/:id/status – Status + Notiz
router.patch("/:id/status", requirePermission("betten_reparatur", "verwaltung"), (req: AuthedRequest, res) => {
  const { status, notes } = z.object({
    status: z.enum(["in_reparatur","behoben","ausgemustert"]),
    notes:  z.string().optional(),
  }).parse(req.body);

  const resolved = ["behoben","ausgemustert"].includes(status)
    ? `datetime('now')` : "resolved_at";

  query(
    `UPDATE bed_defects SET status=$1, updated_at=datetime('now'),
     resolved_at=${resolved},
     assigned_to=$2
     ${notes ? ", notes=$3" : ""}
     WHERE id=${notes ? "$4" : "$3"}`,
    notes
      ? [status, req.user!.sub, notes, req.params.id]
      : [status, req.user!.sub, req.params.id]
  );
  audit(req.user!.sub, "status", "defect", req.params.id, { status });
  const { rows } = query<any>(`SELECT * FROM bed_defects WHERE id=$1`, [req.params.id]);
  res.json({ ...rows[0], photos: rows[0].photos ? JSON.parse(rows[0].photos) : [] });
});

// PATCH /api/defects/:id – allgemein bearbeiten (Admin)
router.patch("/:id", requirePermission("betten_reparatur", "verwaltung"), (req: AuthedRequest, res) => {
  const d = createSchema.partial().parse(req.body);
  const sets: string[] = ["updated_at=datetime('now')"];
  const params: any[] = [];
  let i = 1;
  if (d.title       !== undefined) { sets.push(`title=$${i++}`);       params.push(d.title); }
  if (d.description !== undefined) { sets.push(`description=$${i++}`); params.push(d.description); }
  if (d.severity    !== undefined) { sets.push(`severity=$${i++}`);    params.push(mapSev(d.severity)); }
  if (d.notes       !== undefined) { sets.push(`notes=$${i++}`);       params.push(d.notes); }
  params.push(req.params.id);
  query(`UPDATE bed_defects SET ${sets.join(",")} WHERE id=$${i}`, params);
  const { rows } = query<any>(`SELECT * FROM bed_defects WHERE id=$1`, [req.params.id]);
  res.json({ ...rows[0], photos: rows[0].photos ? JSON.parse(rows[0].photos) : [] });
});
export default router;
