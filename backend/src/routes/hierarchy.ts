import { Router } from "express";
import { z } from "zod";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { audit } from "../services/audit";
import { getAreaScope, getStationScope } from "../services/scope";
import { Request, Response, NextFunction } from "express";

const router = Router();
router.use(authRequired);

// Async-Fehler an Express-Error-Handler weiterleiten
function ar(fn: (req: any, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// ============================================================
// HOUSES
// ============================================================
router.get("/houses", (_req, res) => {
  const { rows } = query(`SELECT *, house_number FROM houses ORDER BY house_number, name`);
  res.json(rows);
});

const houseSchema = z.object({
  name:         z.string().min(1),
  short_code:   z.string().optional(),
  house_number: z.number().int().positive().optional(),
});

router.post("/houses", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const d = houseSchema.parse(req.body);
  const id = newId();

  // Nächste verfügbare Nummer ermitteln falls nicht angegeben
  let hnum = d.house_number;
  if (!hnum) {
    const { rows: [max] } = query<{ m: number }>(`SELECT COALESCE(MAX(house_number), 0) AS m FROM houses`);
    hnum = (max?.m ?? 0) + 1;
  }

  query(`INSERT INTO houses (id, name, short_code, house_number) VALUES ($1,$2,$3,$4)`,
    [id, d.name, d.short_code ?? null, hnum]);
  audit(req.user!.sub, "create", "house", id);
  res.status(201).json({ id, ...d, house_number: hnum });
});

router.patch("/houses/:id", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const d = houseSchema.partial().parse(req.body);
  const fields: string[] = [], values: any[] = [];
  if (d.name         !== undefined) { values.push(d.name);         fields.push(`name = $${values.length}`); }
  if (d.short_code   !== undefined) { values.push(d.short_code);   fields.push(`short_code = $${values.length}`); }
  if (d.house_number !== undefined) { values.push(d.house_number); fields.push(`house_number = $${values.length}`); }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id);
  const r = query(`UPDATE houses SET ${fields.join(", ")} WHERE id = $${values.length}`, values);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "update", "house", req.params.id, d as any);
  res.json({ ok: true });
});

router.delete("/houses/:id", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const force = req.query.force === "true";
  if (!force) {
    const { rows: [dep] } = query<{ areas: number; beds: number; active_tasks: number }>(`
      SELECT
        COUNT(DISTINCT a.id)  AS areas,
        COUNT(DISTINCT b.id)  AS beds,
        COUNT(DISTINCT t.id)  AS active_tasks
      FROM houses h
      LEFT JOIN areas a ON a.house_id = h.id
      LEFT JOIN rooms r ON COALESCE(r.area_id, r.station_id) = a.id
      LEFT JOIN beds  b ON b.room_id = r.id
      LEFT JOIN tasks t ON (t.bed_id = b.id OR t.room_id = r.id)
                        AND t.status NOT IN ('abgeschlossen','abgelehnt')
      WHERE h.id = $1`, [req.params.id]);
    if (dep.areas > 0 || dep.active_tasks > 0)
      return res.status(409).json({ error: "has_dependents", ...dep });
    if (dep.areas > 0 || dep.active_tasks > 0)
      return res.status(409).json({ error: "has_dependents", ...dep });
  }
  const r = query(`DELETE FROM houses WHERE id = $1`, [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "delete", "house", req.params.id);
  res.json({ ok: true });
});

// ============================================================
// AREAS
// ============================================================
router.get("/areas", (req: AuthedRequest, res) => {
  const houseId = typeof req.query.house_id === "string" ? req.query.house_id : null;
  const scope = getAreaScope(req.user!.sub, req.user!.permissions);

  const where: string[] = [];
  const params: any[] = [];
  if (houseId) { params.push(houseId); where.push(`a.house_id = $${params.length}`); }
  if (scope) {
    if (!scope.length) return res.json([]);
    const ph = scope.map((_, i) => `$${params.length + i + 1}`).join(",");
    where.push(`a.id IN (${ph})`);
    params.push(...scope);
  }

  const { rows } = query(
    `SELECT a.*, h.name AS house_name, h.house_number AS house_ki_number,
             b.name AS building_name, b.id AS building_id
       FROM areas a
       LEFT JOIN houses h ON h.id = a.house_id
       LEFT JOIN buildings b ON b.id = a.building_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY h.name, b.name, COALESCE(a.bereichsnummer, a.name), a.name`,
    params
  );
  res.json(rows);
});


// ============================================================
// STATIONS – Hauptroute (mit Prioritätsscore und offenen Aufträgen)
// ============================================================

const areaSchema = z.object({
  house_id:       z.string().uuid(),
  building_id:    z.string().uuid().optional(),
  name:           z.string().min(1),
  bezeichnung:    z.string().optional(),
  bereichsnummer: z.string().max(50).optional(),
  beschreibung:   z.string().max(1000).optional(),
});

router.post("/areas", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const d = areaSchema.parse(req.body);
  const id = newId();
  query(`INSERT INTO areas (id,house_id,building_id,name,bezeichnung,bereichsnummer,beschreibung)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, d.house_id, d.building_id ?? null, d.bezeichnung ?? d.name, d.bezeichnung ?? d.name, d.bereichsnummer ?? null, d.beschreibung ?? null]);
  audit(req.user!.sub, "create", "area", id);
  res.status(201).json({ id, ...d });
});

router.patch("/areas/:id", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const d = areaSchema.partial().parse(req.body);
  const fields: string[] = [], values: any[] = [];
  if (d.house_id       !== undefined) { values.push(d.house_id);       fields.push(`house_id=$${values.length}`);       }
  if (d.building_id    !== undefined) { values.push(d.building_id ?? null); fields.push(`building_id=$${values.length}`); }
  if (d.name           !== undefined) { values.push(d.name);           fields.push(`name=$${values.length}`);           }
  if (d.bezeichnung    !== undefined) { values.push(d.bezeichnung); fields.push(`bezeichnung=$${values.length}`); values.push(d.bezeichnung); fields.push(`name=$${values.length}`); }
  if (d.bereichsnummer !== undefined) { values.push(d.bereichsnummer); fields.push(`bereichsnummer=$${values.length}`); }
  if (d.beschreibung   !== undefined) { values.push(d.beschreibung);   fields.push(`beschreibung=$${values.length}`);   }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id);
  const r = query(`UPDATE areas SET ${fields.join(", ")} WHERE id = $${values.length}`, values);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "update", "area", req.params.id, d as any);
  res.json({ ok: true });
});

router.delete("/areas/:id", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const force = req.query.force === "true";
  if (!force) {
    const { rows: [dep] } = query<{ rooms: number; beds: number; active_tasks: number }>(`
      SELECT
        COUNT(DISTINCT r.id) AS rooms,
        COUNT(DISTINCT b.id) AS beds,
        COUNT(DISTINCT t.id) AS active_tasks
      FROM areas a
      LEFT JOIN rooms r ON r.area_id = a.id
      LEFT JOIN beds  b ON b.room_id = r.id
      LEFT JOIN tasks t ON (t.bed_id = b.id OR t.room_id = r.id OR t.station_id = a.id)
                        AND t.status NOT IN ('abgeschlossen','abgelehnt')
      WHERE a.id = $1`, [req.params.id]);
    if (dep.rooms > 0 || dep.active_tasks > 0)
      return res.status(409).json({ error: "has_dependents", ...dep });
  }
  const r = query(`DELETE FROM areas WHERE id = $1`, [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "delete", "area", req.params.id);
  res.json({ ok: true });
});


//   je offenem Auftrag: 1 Punkt
//   Auftrag > 30 Min alt: +1,5 Punkte
//   -> 31min = 2,5 Punkte vs. 2 neue Aufträge = 2 Punkte.
//
// Query param ?category=bed_cleaning|room_cleaning filtert die Task-Subquery
// so dass nur Aufträge dieser Kategorie in open_count und priority_score zählen.
function getPrioSettings(): { minutes: number; base: number; bonus: number } {
  const { rows } = query<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN ('prio_minutes','prio_base','prio_bonus')`
  );
  const m: Record<string, string> = {};
  rows.forEach((r) => { m[r.key] = r.value; });
  return {
    minutes: parseFloat(m["prio_minutes"] ?? "60"),
    base:    parseFloat(m["prio_base"]    ?? "1"),
    bonus:   parseFloat(m["prio_bonus"]   ?? "1.5"),
  };
}

function buildStationsQuery(categoryFilter: string | null) {
  const catCond = categoryFilter
    ? `AND t.category = '${
        categoryFilter === "bed_cleaning" ? "bed_cleaning" :
"room_cleaning"
      }'`
    : "";
  const ps = getPrioSettings();
  return `
    SELECT s.id, s.name, s.house_id,
           s.house_id AS area_id,
           COALESCE(s.bezeichnung, s.name) AS bezeichnung,
           s.bereichsnummer AS short_code,
           h.name AS area_name, h.name AS house_name,
           COALESCE(stats.open_count, 0)    AS open_count,
           COALESCE(stats.running_count, 0) AS running_count,
           stats.oldest_open                AS oldest_open,
           ROUND(COALESCE(stats.priority_score, 0), 2) AS priority_score
      FROM areas s
      LEFT JOIN houses h ON h.id = s.house_id
      LEFT JOIN (
        SELECT COALESCE(r.area_id, r.station_id) AS area_id,
               SUM(CASE WHEN t.status IN ('offen','unterwegs','angekommen','laufend') THEN 1 ELSE 0 END) AS open_count,
               SUM(CASE WHEN t.status IN ('laufend','angekommen') THEN 1 ELSE 0 END) AS running_count,
               MIN(CASE WHEN t.status IN ('offen','unterwegs','angekommen','laufend') THEN t.created_at END) AS oldest_open,
               SUM(
                 CASE WHEN t.status IN ('offen','unterwegs','angekommen','laufend') THEN
                   ${ps.base} + CASE
                     WHEN (julianday('now') - julianday(t.created_at)) * 1440.0 > ${ps.minutes} THEN ${ps.bonus}
                     ELSE 0
                   END
                 ELSE 0 END
               ) AS priority_score
          FROM tasks t LEFT JOIN rooms r ON r.id = t.room_id
         WHERE 1=1 ${catCond}
         GROUP BY COALESCE(r.area_id, r.station_id)
      ) stats ON stats.area_id = s.id
  `;
}

router.get("/stations", (req: AuthedRequest, res) => {
  const areaId   = typeof req.query.area_id  === "string" ? req.query.area_id  : null;
  const category = typeof req.query.category === "string" &&
                   (["bed_cleaning","room_cleaning"].includes(req.query.category))
                     ? req.query.category : null;
  const aScope = getAreaScope(req.user!.sub, req.user!.permissions);

  const where: string[] = [];
  const params: any[] = [];
  if (areaId) { params.push(areaId); where.push(`s.id = $${params.length}`); }

  if (aScope !== null) {
    if (!aScope.length) return res.json([]);
    const ph = aScope.map((_, i) => `$${params.length + i + 1}`).join(",");
    where.push(`s.id IN (${ph})`);
    params.push(...aScope);
  }

  const { rows } = query(
    `${buildStationsQuery(category)}
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY priority_score DESC, oldest_open ASC, s.name`,
    params
  );
  const userId = req.user!.sub;
  const enriched = rows.map((s: any) => {
    const { rows: myTasks } = query<{ status: string }>(
      `SELECT t.status FROM tasks t
         LEFT JOIN rooms r ON r.id = t.room_id
        WHERE COALESCE(r.area_id, r.station_id) = $1 AND t.assigned_to = $2
          AND t.status IN ('unterwegs','angekommen','laufend')
        LIMIT 1`,
      [s.id, userId]
    );
    return { ...s, my_status: myTasks[0]?.status ?? null };
  });
  res.json(enriched);
});

// POST /stations/:id/en-route  – alle offenen Tasks auf dieser Station annehmen + auf "unterwegs" setzen
router.post("/stations/:id/en-route", requirePermission("bettenaufbereitung", "zimmerreinigung", "verwaltung"), (req: AuthedRequest, res) => {
  const userId = req.user!.sub;
  const { rowCount } = query(
    `UPDATE tasks SET status='unterwegs', assigned_to=$1,
        en_route_at=COALESCE(en_route_at, datetime('now'))
      WHERE status='offen'
        AND room_id IN (SELECT id FROM rooms WHERE COALESCE(area_id, station_id)=$2)`,
    [userId, req.params.id]
  );
  res.json({ ok: true, updated: rowCount });
});

// POST /stations/:id/arrived  – alle "unterwegs"-Tasks des Users auf "angekommen" setzen
router.post("/stations/:id/arrived", requirePermission("bettenaufbereitung", "zimmerreinigung", "verwaltung"), (req: AuthedRequest, res) => {
  const userId = req.user!.sub;
  const { rowCount } = query(
    `UPDATE tasks SET status='angekommen',
        arrived_at=COALESCE(arrived_at, datetime('now'))
      WHERE status='unterwegs' AND assigned_to=$1
        AND room_id IN (SELECT id FROM rooms WHERE COALESCE(area_id, station_id)=$2)`,
    [userId, req.params.id]
  );
  res.json({ ok: true, updated: rowCount });
});

// POST /stations/:id/leave  – User verlässt die Station, alle nicht gestarteten Tasks freigeben
router.post("/stations/:id/leave", requirePermission("bettenaufbereitung", "zimmerreinigung", "verwaltung"), (req: AuthedRequest, res) => {
  const userId = req.user!.sub;
  const { rowCount } = query(
    `UPDATE tasks SET status='offen', assigned_to=NULL,
        en_route_at=NULL, arrived_at=NULL, started_at=NULL
      WHERE assigned_to=$1
        AND status IN ('unterwegs','angekommen','laufend')
        AND room_id IN (SELECT id FROM rooms WHERE COALESCE(area_id, station_id)=$2)`,
    [userId, req.params.id]
  );
  query(
    `UPDATE beds SET status='angefordert'
      WHERE status='in_bearbeitung'
        AND id IN (
          SELECT t.bed_id FROM tasks t
          LEFT JOIN rooms r ON r.id = t.room_id
          WHERE COALESCE(r.area_id, r.station_id)=$1 AND t.status='offen' AND t.bed_id IS NOT NULL)`,
    [req.params.id]
  );
  res.json({ ok: true, released: rowCount });
});

const stationSchema = z.object({
  area_id: z.string().uuid(),
  name: z.string().min(1),
  short_code: z.string().optional(),
});
// Alias: POST/PATCH/DELETE /stations → auf areas umleiten
router.post("/stations", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const d = areaSchema.parse({ house_id: req.body.house_id ?? req.body.area_id, name: req.body.name, bezeichnung: req.body.name, bereichsnummer: req.body.short_code });
  const id = newId();
  query(`INSERT INTO areas (id,house_id,name,bezeichnung,bereichsnummer) VALUES ($1,$2,$3,$4,$5)`,
    [id, d.house_id, d.name, d.bezeichnung ?? d.name, d.bereichsnummer ?? null]);
  audit(req.user!.sub, "create", "area", id);
  res.status(201).json({ id, ...d });
});

router.patch("/stations/:id", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const d = z.object({
    name:       z.string().min(1).max(200).optional(),
    short_code: z.string().max(20).optional(),
  }).parse(req.body);
  const fields: string[] = [], values: any[] = [];
  if (d.name)       { values.push(d.name);       fields.push(`name=$${values.length}`); values.push(d.name); fields.push(`bezeichnung=$${values.length}`); }
  if (d.short_code) { values.push(d.short_code); fields.push(`bereichsnummer=$${values.length}`); }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id);
  query(`UPDATE areas SET ${fields.join(",")} WHERE id=$${values.length}`, values);
  res.json({ ok: true });
});

router.delete("/stations/:id", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  query(`DELETE FROM areas WHERE id=$1`, [req.params.id]);
  audit(req.user!.sub, "delete", "area", req.params.id);
  res.json({ ok: true });
});

// ============================================================
// ROOMS
// ============================================================
router.get("/rooms", (req, res) => {
  const stationId = typeof req.query.station_id === "string" ? req.query.station_id : null;
  const areaId    = typeof req.query.area_id    === "string" ? req.query.area_id    : null;
  const params: any[] = [];
  const conditions: string[] = [];
  if (stationId) { params.push(stationId); conditions.push(`COALESCE(r.area_id, r.station_id) = $${params.length}`); }
  if (areaId)    { params.push(areaId);    conditions.push(`COALESCE(r.area_id, r.station_id) = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = query(
    `SELECT r.*,
            a.name AS station_name, a.id AS station_id,
            a.name AS area_name,
            h.name AS house_name,
            rt.name AS room_type_name, rt.icon AS room_type_icon
       FROM rooms r
       LEFT JOIN areas     a  ON a.id  = r.area_id
       LEFT JOIN houses    h  ON h.id  = a.house_id
       LEFT JOIN room_types rt ON rt.id = r.room_type_id
       ${where}
       ORDER BY h.name, a.name, r.room_number`,
    params
  );
  res.json(rows);
});

const roomSchema = z.object({
  area_id:         z.string().min(1),
  room_number:     z.string().min(1),
  raumbezeichnung: z.string().max(200).optional(),
  beschreibung:    z.string().max(2000).optional(),
  flaeche:         z.number().positive().optional(),
  etage:           z.string().max(50).optional(),
  room_type_id:    z.string().nullable().optional(),
});
router.post("/rooms", requirePermission("raumbuch", "auftraege_erstellen", "verwaltung"), (req: AuthedRequest, res) => {
  const d = roomSchema.parse(req.body);
  const id = newId();
  query(`INSERT INTO rooms (id,area_id,room_number,raumbezeichnung,beschreibung,flaeche,room_type_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, d.area_id, d.room_number, d.raumbezeichnung ?? null, d.beschreibung ?? null, d.flaeche ?? null, d.room_type_id ?? null]);
  audit(req.user!.sub, "create", "room", id);
  res.status(201).json({ id, ...d });
});

router.patch("/rooms/:id", requirePermission("raumbuch", "auftraege_erstellen", "verwaltung"), (req: AuthedRequest, res) => {
  const d = roomSchema.partial().parse(req.body);
  const fields: string[] = [], values: any[] = [];
  if (d.area_id         !== undefined) { values.push(d.area_id);         fields.push(`area_id=$${values.length}`);         values.push(d.area_id); fields.push(`station_id=$${values.length}`); }
  if (d.room_number     !== undefined) { values.push(d.room_number);     fields.push(`room_number=$${values.length}`);     }
  if (d.raumbezeichnung !== undefined) { values.push(d.raumbezeichnung); fields.push(`raumbezeichnung=$${values.length}`); }
  if (d.beschreibung    !== undefined) { values.push(d.beschreibung);    fields.push(`beschreibung=$${values.length}`);    }
  if (d.flaeche         !== undefined) { values.push(d.flaeche);         fields.push(`flaeche=$${values.length}`);         }
  if (d.etage           !== undefined) { values.push(d.etage);           fields.push(`etage=$${values.length}`);           }
  if (d.room_type_id    !== undefined) { values.push(d.room_type_id);    fields.push(`room_type_id=$${values.length}`);    }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id);
  query(`UPDATE rooms SET ${fields.join(",")} WHERE id=$${values.length}`, values);
  audit(req.user!.sub, "update", "room", req.params.id, d as any);
  res.json({ ok: true });
});

router.delete("/rooms/:id", requirePermission("raumbuch", "auftraege_erstellen", "verwaltung"), (req: AuthedRequest, res) => {
  const force = req.query.force === "true";
  if (!force) {
    const { rows: [dep] } = query<{ beds: number; active_tasks: number }>(`
      SELECT
        COUNT(DISTINCT b.id) AS beds,
        COUNT(DISTINCT t.id) AS active_tasks
      FROM rooms r
      LEFT JOIN beds  b ON b.room_id = r.id
      LEFT JOIN tasks t ON (t.bed_id = b.id OR t.room_id = r.id)
                        AND t.status NOT IN ('abgeschlossen','abgelehnt')
      WHERE r.id = $1`, [req.params.id]);
    if (dep.beds > 0 || dep.active_tasks > 0)
      return res.status(409).json({ error: "has_dependents", ...dep });
  }
  const r = query(`DELETE FROM rooms WHERE id = $1`, [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "delete", "room", req.params.id);
  res.json({ ok: true });
});

// ============================================================
// BEDS
// ============================================================
router.get("/beds", (req: AuthedRequest, res) => {
  const stationId = typeof req.query.station_id === "string" ? req.query.station_id : null;
  const params: any[] = [];
  let where = "";
  if (stationId) { params.push(stationId); where = `WHERE COALESCE(r.area_id, r.station_id) = $1`; }

  // Auto-Korrektur: Betten ohne offenen Auftrag → zurück auf frei
  query(`
    UPDATE beds SET status = 'frei'
    WHERE status IN ('angefordert','unterwegs','angekommen','in_bearbeitung','bereit')
      AND id NOT IN (
        SELECT DISTINCT bed_id FROM tasks
        WHERE bed_id IS NOT NULL AND status NOT IN ('abgeschlossen','abgelehnt')
      )`, []);

  const { rows } = query(
    `SELECT b.*, r.room_number,
            COALESCE(r.area_id, r.station_id) AS station_id,
            COALESCE(a.bezeichnung, a.name) AS station_name,
            a.name AS area_name,
            bt.name AS bed_type_name,
            (SELECT t.id     FROM tasks t WHERE t.bed_id = b.id AND t.status IN ('offen','unterwegs','angekommen','laufend')
              ORDER BY t.created_at LIMIT 1) AS open_task_id,
            (SELECT t.status FROM tasks t WHERE t.bed_id = b.id AND t.status IN ('offen','unterwegs','angekommen','laufend')
              ORDER BY t.created_at LIMIT 1) AS open_task_status,
            (SELECT t.cleaning_type FROM tasks t WHERE t.bed_id = b.id AND t.status IN ('offen','unterwegs','angekommen','laufend')
              ORDER BY t.created_at LIMIT 1) AS open_task_cleaning_type,
            (SELECT t.pathogens FROM tasks t WHERE t.bed_id = b.id AND t.status IN ('offen','unterwegs','angekommen','laufend')
              ORDER BY t.created_at LIMIT 1) AS open_task_pathogens
       FROM beds b
       LEFT JOIN rooms r ON r.id = b.room_id
       LEFT JOIN areas a ON a.id = COALESCE(r.area_id, r.station_id)
       LEFT JOIN bed_types bt ON bt.id = b.bed_type_id
       ${where}
       ORDER BY r.room_number, b.bed_number`,
    params
  );
  res.json(rows);
});

const bedSchema = z.object({
  room_id: z.string().uuid(),
  bed_number: z.string().min(1),
  bed_type_id: z.string().uuid().nullable().optional(),
  barcode: z.string().nullable().optional(),
});
router.post("/beds", requirePermission("raumbuch", "auftraege_erstellen", "verwaltung"), (req: AuthedRequest, res) => {
  const d = bedSchema.parse(req.body);
  if (!d.room_id) return res.status(400).json({ error: "room_required" });
  const id = newId();
  try {
    query(`INSERT INTO beds (id,room_id,bed_number,bed_type_id,barcode) VALUES ($1,$2,$3,$4,$5)`,
      [id, d.room_id, d.bed_number, d.bed_type_id ?? null, d.barcode ?? null]);
  } catch (e: any) {
    if (e.message?.includes("FOREIGN KEY"))
      return res.status(400).json({ error: "invalid_room", message: "Raum nicht gefunden." });
    if (e.message?.includes("UNIQUE"))
      return res.status(409).json({ error: "duplicate_bed", message: "Stellplatz-Nummer bereits vergeben." });
    throw e;
  }
  audit(req.user!.sub, "create", "bed", id);
  res.status(201).json({ id, ...d, status: "frei" });
});

router.patch("/beds/:id", requirePermission("raumbuch", "auftraege_erstellen", "verwaltung"), (req: AuthedRequest, res) => {
  const d = bedSchema.partial().parse(req.body);
  const fields: string[] = [], values: any[] = [];
  if (d.room_id !== undefined)     { values.push(d.room_id);     fields.push(`room_id = $${values.length}`); }
  if (d.bed_number !== undefined)  { values.push(d.bed_number);  fields.push(`bed_number = $${values.length}`); }
  if (d.bed_type_id !== undefined) { values.push(d.bed_type_id); fields.push(`bed_type_id = \$${values.length}`); }
  if (d.barcode !== undefined)     { values.push(d.barcode);     fields.push(`barcode = \$${values.length}`); }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id);
  const r = query(`UPDATE beds SET ${fields.join(", ")} WHERE id = $${values.length}`, values);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "update", "bed", req.params.id, d as any);
  res.json({ ok: true });
});

router.delete("/beds/:id", requirePermission("raumbuch", "auftraege_erstellen", "verwaltung"), (req: AuthedRequest, res) => {
  const force = req.query.force === "true";
  if (!force) {
    const { rows: [dep] } = query<{ active_tasks: number }>(`
      SELECT COUNT(*) AS active_tasks FROM tasks
      WHERE bed_id = $1 AND status NOT IN ('abgeschlossen','abgelehnt')`, [req.params.id]);
    if (dep.active_tasks > 0)
      return res.status(409).json({ error: "has_dependents", active_tasks: dep.active_tasks });
  }
  const r = query(`DELETE FROM beds WHERE id = $1`, [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "delete", "bed", req.params.id);
  res.json({ ok: true });
});

// ── Bett-Reisehistorie: alle abgeschlossenen Aufträge zu einem Bett ──────────
// ── Bett suchen per Strichcode ───────────────────────────────────────────────
// Reisehistorie: physisches Bett per gescanntem Strichcode aus Aufträgen
router.get("/travel-history/barcode/:code", (req: AuthedRequest, res) => {
  const code = req.params.code.trim();

  const { rows: tasks } = query<any>(
    `SELECT
        t.id, t.category, t.cleaning_type, t.status,
        t.pathogens, t.priority, t.notes, t.scanned_barcode,
        t.created_at, t.started_at, t.completed_at,
        r.room_number,
        s.id AS station_id, COALESCE(s.bezeichnung, s.name) AS station_name, s.bereichsnummer AS station_code,
        s.id AS area_id, COALESCE(s.bezeichnung, s.name) AS area_name,
        h.name AS house_name,
        u.full_name  AS assigned_to_name,
        u2.full_name AS created_by_name
       FROM tasks t
       LEFT JOIN rooms r ON r.id = t.room_id
       LEFT JOIN areas s ON s.id = COALESCE(r.area_id, r.station_id)
       LEFT JOIN houses h ON h.id = s.house_id
       LEFT JOIN users u  ON u.id  = t.assigned_to
       LEFT JOIN users u2 ON u2.id = t.created_by
      WHERE LOWER(t.scanned_barcode) = LOWER($1)
        AND t.category != 'bed_cleaning_zentral'
     UNION ALL
     SELECT
        t.id, t.category, t.cleaning_type, t.status,
        t.pathogens, t.priority, t.notes, t.scanned_barcode,
        t.created_at, t.started_at, t.completed_at,
        NULL AS room_number,
        'zentral' AS station_id, 'Bettenzentrale' AS station_name, 'ZEN' AS station_code,
        'zentral' AS area_id, 'Zentrale Aufbereitung' AS area_name,
        'Haus' AS house_name,
        u.full_name  AS assigned_to_name,
        u2.full_name AS created_by_name
       FROM tasks t
       LEFT JOIN users u  ON u.id  = t.assigned_to
       LEFT JOIN users u2 ON u2.id = t.created_by
      WHERE LOWER(t.scanned_barcode) = LOWER($1)
        AND t.category = 'bed_cleaning_zentral'
      ORDER BY 9 DESC`,
    [code, code]
  );

  if (!tasks.length) return res.status(404).json({ error: "not_found" });

  const stationStats: Record<string, { station_name: string; area_name: string; house_name: string; count: number; last_visit: string }> = {};
  for (const t of tasks) {
    if (!stationStats[t.station_id]) {
      stationStats[t.station_id] = { station_name: t.station_name, area_name: t.area_name, house_name: t.house_name, count: 0, last_visit: t.created_at };
    }
    stationStats[t.station_id].count++;
    if (t.created_at > stationStats[t.station_id].last_visit) stationStats[t.station_id].last_visit = t.created_at;
  }

  res.json({
    barcode: code,
    total_tasks: tasks.length,
    unique_stations: Object.keys(stationStats).length,
    station_stats: Object.values(stationStats).sort((a, b) => b.count - a.count),
    history: tasks.map(t => ({ ...t, pathogens: (() => { try { return JSON.parse(t.pathogens); } catch { return []; } })() })),
  });
});

// Barcode-Lookup (Legacy – Platzhalterbetten haben keinen Barcode mehr)
router.get("/beds/by-barcode/:code", (req: AuthedRequest, res) => {
  return res.status(410).json({ error: "deprecated", message: "Barcodes werden jetzt über Aufträge (scanned_barcode) getrackt." });
});

router.get("/beds/:id/travel-history", (req: AuthedRequest, res) => {
  // Bett-Info
  const { rows: bedRows } = query<any>(
    `SELECT b.id, b.bed_number, b.barcode, bt.name AS bed_type_name
       FROM beds b
       LEFT JOIN bed_types bt ON bt.id = b.bed_type_id
      WHERE b.id = $1`,
    [req.params.id]
  );
  if (!bedRows.length) return res.status(404).json({ error: "not_found" });
  const bed = bedRows[0];

  // Alle Aufträge zu diesem Bett (auch laufende/offene für vollständiges Bild)
  const { rows: tasks } = query<any>(
    `SELECT
        t.id, t.category, t.cleaning_type, t.status,
        t.pathogens, t.priority, t.notes,
        t.created_at, t.started_at, t.completed_at,
        r.room_number,
        s.id AS station_id, COALESCE(s.bezeichnung, s.name) AS station_name, s.bereichsnummer AS station_code,
        s.id AS area_id, COALESCE(s.bezeichnung, s.name) AS area_name,
        h.name AS house_name,
        u.full_name  AS assigned_to_name,
        u2.full_name AS created_by_name
       FROM tasks t
       LEFT JOIN rooms r ON r.id = t.room_id
       LEFT JOIN areas s ON s.id = COALESCE(r.area_id, r.station_id)
       LEFT JOIN houses h ON h.id = s.house_id
       LEFT JOIN users u  ON u.id  = t.assigned_to
       LEFT JOIN users u2 ON u2.id = t.created_by
      WHERE t.bed_id = $1
      ORDER BY t.created_at DESC`,
    [req.params.id]
  );

  // Stationsstatistik aggregieren
  const stationStats: Record<string, { station_name: string; area_name: string; house_name: string; count: number; last_visit: string }> = {};
  for (const t of tasks) {
    if (!stationStats[t.station_id]) {
      stationStats[t.station_id] = {
        station_name: t.station_name,
        area_name:    t.area_name,
        house_name:   t.house_name,
        count:        0,
        last_visit:   t.created_at,
      };
    }
    stationStats[t.station_id].count++;
    if (t.created_at > stationStats[t.station_id].last_visit) {
      stationStats[t.station_id].last_visit = t.created_at;
    }
  }

  res.json({
    bed,
    total_tasks: tasks.length,
    unique_stations: Object.keys(stationStats).length,
    station_stats: Object.values(stationStats).sort((a, b) => b.count - a.count),
    history: tasks.map(t => ({
      ...t,
      pathogens: (() => { try { return JSON.parse(t.pathogens); } catch { return []; } })(),
    })),
  });
});

// ============================================================
// BED TYPES
// ============================================================
router.get("/bed-types", (_req, res) => {
  const { rows } = query(
    `SELECT bt.*, (SELECT COUNT(*) FROM beds b WHERE b.bed_type_id = bt.id) AS bed_count
       FROM bed_types bt ORDER BY bt.name`
  );
  res.json(rows);
});

const bedTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
router.post("/bed-types", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const d = bedTypeSchema.parse(req.body);
  const id = newId();
  try {
    query(`INSERT INTO bed_types (id,name,description) VALUES ($1,$2,$3)`,
      [id, d.name, d.description ?? null]);
  } catch (e: any) {
    if (String(e?.message).includes("UNIQUE")) return res.status(409).json({ error: "duplicate_name" });
    throw e;
  }
  audit(req.user!.sub, "create", "bed_type", id);
  res.status(201).json({ id, ...d });
});

router.patch("/bed-types/:id", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const d = bedTypeSchema.partial().parse(req.body);
  const fields: string[] = [], values: any[] = [];
  if (d.name !== undefined)        { values.push(d.name);        fields.push(`name = $${values.length}`); }
  if (d.description !== undefined) { values.push(d.description); fields.push(`description = $${values.length}`); }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id);
  const r = query(`UPDATE bed_types SET ${fields.join(", ")} WHERE id = $${values.length}`, values);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "update", "bed_type", req.params.id, d as any);
  res.json({ ok: true });
});

router.delete("/bed-types/:id", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  // beds.bed_type_id → NULL (FK ON DELETE SET NULL)
  const r = query(`DELETE FROM bed_types WHERE id = $1`, [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "delete", "bed_type", req.params.id);
  res.json({ ok: true });
});

// ============================================================
// PATHOGENS  -  Keime / Krankheiten
// ============================================================
router.get("/pathogens", (_req, res) => {
  const { rows } = query(`SELECT * FROM pathogens ORDER BY severity, name`);
  res.json(rows);
});

const pathogenSchema = z.object({
  code: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/, "nur A-Z, 0-9, -, _"),
  name: z.string().min(1),
  description: z.string().optional(),
  severity: z.number().int().min(1).max(3).default(2),
  disinfectant: z.string().optional(),
  cleaning_agent: z.string().optional(),
  hygiene_notes: z.string().optional(),
});

router.post("/pathogens", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const d = pathogenSchema.parse(req.body);
  try {
    query(
      `INSERT INTO pathogens (code,name,description,severity,disinfectant,cleaning_agent,hygiene_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [d.code.toUpperCase(), d.name, d.description ?? null, d.severity,
       d.disinfectant ?? null, d.cleaning_agent ?? null, d.hygiene_notes ?? null]
    );
  } catch (e: any) {
    if (String(e?.message).includes("UNIQUE") || String(e?.message).includes("PRIMARY KEY")) {
      return res.status(409).json({ error: "duplicate_code" });
    }
    throw e;
  }
  audit(req.user!.sub, "create", "pathogen", d.code);
  res.status(201).json({ ...d, code: d.code.toUpperCase() });
});

const pathogenUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  severity: z.number().int().min(1).max(3).optional(),
  disinfectant: z.string().optional(),
  cleaning_agent: z.string().optional(),
  hygiene_notes: z.string().optional(),
});

router.patch("/pathogens/:code", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const d = pathogenUpdateSchema.parse(req.body);
  const fields: string[] = [], values: any[] = [];
  if (d.name !== undefined)          { values.push(d.name);          fields.push(`name = $${values.length}`); }
  if (d.description !== undefined)   { values.push(d.description);   fields.push(`description = $${values.length}`); }
  if (d.severity !== undefined)      { values.push(d.severity);      fields.push(`severity = $${values.length}`); }
  if (d.disinfectant !== undefined)  { values.push(d.disinfectant);  fields.push(`disinfectant = $${values.length}`); }
  if (d.cleaning_agent !== undefined){ values.push(d.cleaning_agent);fields.push(`cleaning_agent = $${values.length}`); }
  if (d.hygiene_notes !== undefined) { values.push(d.hygiene_notes); fields.push(`hygiene_notes = $${values.length}`); }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.code.toUpperCase());
  const r = query(`UPDATE pathogens SET ${fields.join(", ")} WHERE code = $${values.length}`, values);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "update", "pathogen", req.params.code, d as any);
  res.json({ ok: true });
});

router.delete("/pathogens/:code", requirePermission("raumbuch", "verwaltung"), (req: AuthedRequest, res) => {
  const r = query(`DELETE FROM pathogens WHERE code = $1`, [req.params.code.toUpperCase()]);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "delete", "pathogen", req.params.code);
  res.json({ ok: true });
});

export default router;

// ── DASHBOARD SUMMARY ──────────────────────────────────────────
router.get("/dashboard/summary", (req: AuthedRequest, res) => {
  const scope = getAreaScope(req.user!.sub, req.user!.permissions);

  let stationFilter = "";
  const params: any[] = [];
  if (scope !== null) {
    if (!scope.length) return res.json({ stations: [], prueftermin: { ueberfaellig: 0, bald_faellig: 0, gesperrt: 0 } });
    stationFilter = `WHERE s.id IN (${scope.map((_, i) => `$${i + 1}`).join(",")})`;
    params.push(...scope);
  }

  const { rows } = query<any>(`
    SELECT
      s.id,
      COALESCE(s.bezeichnung, s.name) AS name,
      COALESCE(s.bezeichnung, s.name) AS area_name,
      COALESCE(SUM(CASE WHEN t.category = 'bed_cleaning' AND t.status = 'offen' THEN 1 ELSE 0 END), 0) AS open_beds,
      COALESCE(SUM(CASE WHEN t.category = 'bed_cleaning' AND t.status IN ('unterwegs','angekommen','laufend') THEN 1 ELSE 0 END), 0) AS active_beds,
      COALESCE(SUM(CASE WHEN t.category = 'room_cleaning' AND t.status = 'offen' THEN 1 ELSE 0 END), 0) AS open_rooms,
      COALESCE(SUM(CASE WHEN t.category = 'room_cleaning' AND t.status IN ('unterwegs','angekommen','laufend') THEN 1 ELSE 0 END), 0) AS active_rooms,
      COALESCE(SUM(CASE WHEN t.category = 'bed_cleaning_zentral' AND t.status = 'offen' THEN 1 ELSE 0 END), 0) AS open_zentral,
      COALESCE(SUM(CASE WHEN t.status NOT IN ('abgeschlossen','abgenommen') THEN 1 ELSE 0 END), 0) AS score
    FROM areas s
    LEFT JOIN houses h ON h.id = s.house_id
    LEFT JOIN rooms r ON COALESCE(r.area_id, r.station_id) = s.id
    LEFT JOIN tasks t ON (t.room_id = r.id OR t.bed_id IN (SELECT id FROM beds WHERE room_id = r.id))
      AND t.status NOT IN ('abgeschlossen', 'abgenommen', 'abgelehnt')
    ${stationFilter}
    GROUP BY s.id, s.name, h.name
    ORDER BY score DESC, s.name
  `, params);

  // Prüftermin-Statistik aus Bettenstamm
  const { rows: pruef } = query<any>(`
    SELECT
      SUM(CASE WHEN prueftermin < date('now') THEN 1 ELSE 0 END) AS ueberfaellig,
      SUM(CASE WHEN prueftermin >= date('now') AND prueftermin <= date('now','+30 days') THEN 1 ELSE 0 END) AS bald_faellig,
      SUM(CASE WHEN gesperrt = 1 THEN 1 ELSE 0 END) AS gesperrt
    FROM physical_beds
    WHERE prueftermin IS NOT NULL OR gesperrt = 1
  `, []);

  res.json({ stations: rows, prueftermin: pruef[0] ?? { ueberfaellig: 0, bald_faellig: 0, gesperrt: 0 } });
});
