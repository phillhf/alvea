import { Router } from "express";
import { z } from "zod";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { audit } from "../services/audit";

const router = Router();
router.use(authRequired);

const schema = z.object({
  barcode:       z.string().min(1),
  bed_type_id:   z.string().nullable().optional(),
  hersteller:    z.string().nullable().optional(),
  modell:        z.string().nullable().optional(),
  seriennummer:  z.string().nullable().optional(),
  baujahr:       z.number().int().min(1900).max(2100).nullable().optional(),
  prueftermin:   z.string().nullable().optional(),
  notizen:       z.string().nullable().optional(),
});

// GET /api/physical-beds
router.get("/", requirePermission("bettenstamm", "betten_reparatur", "betten_pw", "verwaltung"), (req: AuthedRequest, res) => {
  const q = (req as any).query?.q as string | undefined;
  const overdue = (req as any).query?.overdue;
  const gesperrt = (req as any).query?.gesperrt;

  let where = "1=1";
  const params: any[] = [];

  if (q) {
    params.push(`%${q}%`);
    where += ` AND (pb.barcode LIKE $${params.length} OR pb.hersteller LIKE $${params.length} OR pb.modell LIKE $${params.length} OR pb.seriennummer LIKE $${params.length})`;
  }
  if (overdue === "1") {
    where += ` AND pb.prueftermin IS NOT NULL AND pb.prueftermin < date('now')`;
  }
  if (gesperrt === "1") {
    where += ` AND pb.gesperrt = 1`;
  }

  const { rows } = query<any>(`
    SELECT pb.*,
           bt.name AS bed_type_name,
           CAST(ROUND(JULIANDAY('now') - JULIANDAY(pb.prueftermin)) AS INTEGER) AS tage_ueberfaellig,
           last_loc.station_name AS last_station_name,
           last_loc.area_name    AS last_area_name,
           last_loc.house_id     AS last_house_id,
           last_loc.house_name   AS last_house_name,
           last_loc.room_number  AS last_room_number,
           last_loc.last_seen    AS last_seen
    FROM physical_beds pb
    LEFT JOIN bed_types bt ON bt.id = pb.bed_type_id
    LEFT JOIN (
      SELECT t.scanned_barcode,
             COALESCE(s.bezeichnung, s.name) AS station_name,
             COALESCE(s.bezeichnung, s.name) AS area_name,
             s.house_id                       AS house_id,
             h.name                           AS house_name,
             r.room_number,
             MAX(t.updated_at) AS last_seen
      FROM tasks t
      JOIN rooms r ON r.id = t.room_id
      LEFT JOIN areas s ON s.id = COALESCE(r.area_id, r.station_id)
      LEFT JOIN houses h ON h.id = s.house_id
      WHERE t.scanned_barcode IS NOT NULL
        AND t.status = 'abgeschlossen'
      GROUP BY t.scanned_barcode
    ) last_loc ON last_loc.scanned_barcode = pb.barcode
    WHERE ${where}
    ORDER BY
      pb.gesperrt DESC,
      CASE WHEN pb.prueftermin < date('now') THEN 0 ELSE 1 END,
      pb.prueftermin ASC,
      pb.barcode ASC
  `, params);

  res.json(rows);
});

// GET /api/physical-beds/:id
router.get("/:id", requirePermission("bettenstamm", "betten_reparatur", "verwaltung"), (req: AuthedRequest, res) => {
  const { rows } = query<any>(`
    SELECT pb.*, bt.name AS bed_type_name
    FROM physical_beds pb
    LEFT JOIN bed_types bt ON bt.id = pb.bed_type_id
    WHERE pb.id = $1
  `, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

// POST /api/physical-beds
router.post("/", requirePermission("bettenstamm", "verwaltung"), (req: AuthedRequest, res) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: "validation_error", details: result.error.issues });
  const d = result.data;

  const { rows: existing } = query(`SELECT id FROM physical_beds WHERE barcode = $1`, [d.barcode]);
  if (existing.length) return res.status(409).json({ error: "barcode_exists" });

  const id = newId();
  query(`
    INSERT INTO physical_beds (id, barcode, bed_type_id, hersteller, modell, seriennummer, baujahr, prueftermin, notizen)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  `, [id, d.barcode, d.bed_type_id ?? null, d.hersteller ?? null, d.modell ?? null,
      d.seriennummer ?? null, d.baujahr ?? null, d.prueftermin ?? null, d.notizen ?? null]);

  audit(req.user!.sub, "create", "physical_bed", id, { barcode: d.barcode });
  res.status(201).json({ id });
});

// PATCH /api/physical-beds/:id  – allgemeine Felder
router.patch("/:id", requirePermission("bettenstamm", "verwaltung"), (req: AuthedRequest, res) => {
  const result = schema.partial().safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: "validation_error", details: result.error.issues });
  const d = result.data;

  const fields: string[] = [];
  const params: any[] = [];
  const set = (col: string, val: any) => { params.push(val); fields.push(`${col} = $${params.length}`); };

  if (d.barcode      !== undefined) set("barcode",      d.barcode);
  if (d.bed_type_id  !== undefined) set("bed_type_id",  d.bed_type_id);
  if (d.hersteller   !== undefined) set("hersteller",   d.hersteller);
  if (d.modell       !== undefined) set("modell",       d.modell);
  if (d.seriennummer !== undefined) set("seriennummer", d.seriennummer);
  if (d.baujahr      !== undefined) set("baujahr",      d.baujahr);
  if (d.prueftermin  !== undefined) set("prueftermin",  d.prueftermin);
  if (d.notizen      !== undefined) set("notizen",      d.notizen);

  if (!fields.length) return res.json({ ok: true });
  params.push(`updated_at = datetime('now')`);
  params.push(req.params.id);
  query(`UPDATE physical_beds SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = $${params.length}`, params);

  audit(req.user!.sub, "update", "physical_bed", req.params.id);
  res.json({ ok: true });
});

// PATCH /api/physical-beds/:id/sperren  – nur Techniker darf sperren/entsperren
router.patch("/:id/sperren", requirePermission("betten_reparatur", "verwaltung"), (req: AuthedRequest, res) => {
  const { gesperrt, grund } = req.body as { gesperrt: boolean; grund?: string };
  query(`
    UPDATE physical_beds SET
      gesperrt = $1,
      gesperrt_grund = $2,
      gesperrt_seit = CASE WHEN $1 = 1 THEN datetime('now') ELSE NULL END,
      updated_at = datetime('now')
    WHERE id = $3
  `, [gesperrt ? 1 : 0, gesperrt ? (grund ?? null) : null, req.params.id]);

  audit(req.user!.sub, gesperrt ? "sperren" : "entsperren", "physical_bed", req.params.id, { grund });
  res.json({ ok: true });
});

// DELETE /api/physical-beds/:id
router.delete("/:id", requirePermission("bettenstamm", "verwaltung"), (req: AuthedRequest, res) => {
  query(`DELETE FROM physical_beds WHERE id = $1`, [req.params.id]);
  audit(req.user!.sub, "delete", "physical_bed", req.params.id);
  res.json({ ok: true });
});

// GET /api/physical-beds/by-barcode/:barcode – für Defekt-Detail und TaskDetail-Warnung
router.get("/by-barcode/:barcode", authRequired, (req: AuthedRequest, res) => {
  const { rows } = query<any>(`
    SELECT pb.*, bt.name AS bed_type_name,
           CAST(ROUND(JULIANDAY('now') - JULIANDAY(pb.prueftermin)) AS INTEGER) AS tage_ueberfaellig,
           last_loc.station_name AS last_station_name,
           last_loc.area_name    AS last_area_name,
           last_loc.room_number  AS last_room_number,
           last_loc.last_seen    AS last_seen
    FROM physical_beds pb
    LEFT JOIN bed_types bt ON bt.id = pb.bed_type_id
    LEFT JOIN (
      SELECT t.scanned_barcode,
             COALESCE(s.bezeichnung, s.name) AS station_name,
             COALESCE(s.bezeichnung, s.name) AS area_name,
             r.room_number,
             MAX(t.updated_at) AS last_seen
      FROM tasks t
      JOIN rooms r ON r.id = t.room_id
      LEFT JOIN areas s ON s.id = COALESCE(r.area_id, r.station_id)
      WHERE t.scanned_barcode IS NOT NULL AND t.status = 'abgeschlossen'
      GROUP BY t.scanned_barcode
    ) last_loc ON last_loc.scanned_barcode = pb.barcode
    WHERE pb.barcode = $1
  `, [req.params.barcode]);
  if (!rows.length) return res.json(null);
  res.json(rows[0]);
});

export default router;
