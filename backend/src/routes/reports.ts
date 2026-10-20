import { Router } from "express";
import { z } from "zod";
import { query } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { streamReportPdf, streamBarcodeReportPdf, streamZentralReportPdf, ReportRow } from "../services/pdf";

const router = Router();
router.use(authRequired);
router.use(requirePermission("berichte", "dashboard", "verwaltung"));

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function buildSummary(stationId: string, dateFrom: string, dateTo: string) {
  const { rows: stationRows } = query<{ name: string }>(
    `SELECT COALESCE(bezeichnung, name) AS name FROM areas WHERE id = $1`, [stationId]
  );
  if (!stationRows.length) return null;

  const { rows } = query<ReportRow & { status: string }>(
    `SELECT r.room_number || COALESCE(' · Bett ' || b.bed_number, '') AS room_number,
            t.category || ':' || t.cleaning_type                AS task_type,
            t.status, t.completed_at,
            u.full_name  AS assigned_to_name,
            u2.full_name AS signed_off_by_name
       FROM tasks t
       JOIN rooms r       ON r.id  = t.room_id
       LEFT JOIN beds b   ON b.id  = t.bed_id
       LEFT JOIN users u  ON u.id  = t.assigned_to
       LEFT JOIN users u2 ON u2.id = t.signed_off_by
      WHERE COALESCE(r.area_id, r.station_id) = $1
        AND t.created_date >= $2
        AND t.created_date <= $3
      ORDER BY t.created_date, r.room_number, b.bed_number`,
    [stationId, dateFrom, dateTo]
  );

  const total = rows.length;
  const completed = rows.filter((r) => r.status === "abgeschlossen").length;
  return {
    station_name: stationRows[0].name,
    date_from: dateFrom,
    date_to: dateTo,
    report_date: dateFrom === dateTo ? dateFrom : `${dateFrom} – ${dateTo}`,
    total,
    completed,
    pending: total - completed,
    rows: rows.map((r) => ({ ...r, completed_at: r.completed_at ? new Date(r.completed_at) : null })),
  };
}

const querySchema = z.object({
  station_id: z.string().uuid(),
  date_from:  z.string().regex(dateRe),
  date_to:    z.string().regex(dateRe),
});

router.get("/summary", (req: AuthedRequest, res) => {
  const q = querySchema.parse(req.query);
  if (q.date_from > q.date_to) return res.status(400).json({ error: "date_from_after_date_to" });
  const data = buildSummary(q.station_id, q.date_from, q.date_to);
  if (!data) return res.status(404).json({ error: "station_not_found" });
  res.json(data);
});

router.get("/pdf", (req, res) => {
  const q = querySchema.parse(req.query);
  if (q.date_from > q.date_to) return res.status(400).json({ error: "date_from_after_date_to" });
  const data = buildSummary(q.station_id, q.date_from, q.date_to);
  if (!data) return res.status(404).json({ error: "station_not_found" });
  streamReportPdf(res, data);
});

export default router;


// PDF for barcode travel history with optional date range
router.get("/barcode-pdf", (req: AuthedRequest, res) => {
  const q = z.object({
    barcode:   z.string().min(1),
    date_from: z.string().regex(dateRe).optional(),
    date_to:   z.string().regex(dateRe).optional(),
  }).parse(req.query);

  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = q.date_from ?? "2000-01-01";
  const dateTo   = q.date_to   ?? today;

  const { rows: tasks } = query<any>(
    `SELECT
        t.id, t.category, t.cleaning_type, t.status,
        t.pathogens, t.scanned_barcode,
        t.created_at, t.started_at, t.completed_at,
        r.room_number,
        s.id AS station_id, COALESCE(s.bezeichnung, s.name) AS station_name,
        COALESCE(s.bezeichnung, s.name) AS area_name,
        h.name AS house_name,
        u.full_name AS assigned_to_name
       FROM tasks t
       JOIN rooms r ON r.id = t.room_id
       LEFT JOIN areas s ON s.id = COALESCE(r.area_id, r.station_id)
       LEFT JOIN houses h ON h.id = s.house_id
       LEFT JOIN users u ON u.id = t.assigned_to
      WHERE LOWER(t.scanned_barcode) = LOWER($1)
        AND t.category != 'bed_cleaning_zentral'
        AND t.created_date >= $2
        AND t.created_date <= $3
     UNION ALL
     SELECT
        t.id, t.category, t.cleaning_type, t.status,
        t.pathogens, t.scanned_barcode,
        t.created_at, t.started_at, t.completed_at,
        NULL AS room_number,
        'zentral' AS station_id, 'Bettenzentrale' AS station_name,
        'Zentrale Aufbereitung' AS area_name,
        'Haus' AS house_name,
        u.full_name AS assigned_to_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
      WHERE LOWER(t.scanned_barcode) = LOWER($1)
        AND t.category = 'bed_cleaning_zentral'
        AND t.created_date >= $2
        AND t.created_date <= $3
      ORDER BY 7 DESC`,
    [q.barcode, dateFrom, dateTo, q.barcode, dateFrom, dateTo]
  );

  if (!tasks.length) return res.status(404).json({ error: "not_found" });

  const stationMap: Record<string, any> = {};
  for (const t of tasks) {
    if (!stationMap[t.station_id]) {
      stationMap[t.station_id] = { station_name: t.station_name, area_name: t.area_name, house_name: t.house_name, count: 0 };
    }
    stationMap[t.station_id].count++;
  }

  streamBarcodeReportPdf(res, {
    barcode: q.barcode,
    date_from: dateFrom,
    date_to: dateTo,
    total_tasks: tasks.length,
    unique_stations: Object.keys(stationMap).length,
    station_stats: Object.values(stationMap).sort((a: any, b: any) => b.count - a.count),
    history: tasks.map((t: any) => ({
      ...t,
      pathogens: (() => { try { return JSON.parse(t.pathogens); } catch { return []; } })()
    })),
  });
});

/* ── Zentral-Tagesbericht ── */
const zentralSchema = z.object({
  date_from: z.string().regex(dateRe),
  date_to:   z.string().regex(dateRe),
});

router.get("/zentral-summary", (req: AuthedRequest, res) => {
  const q = zentralSchema.parse(req.query);
  if (q.date_from > q.date_to) return res.status(400).json({ error: "date_from_after_date_to" });

  const { rows } = query<any>(
    `SELECT
        t.created_date                        AS date,
        bt.name                               AS bed_type_name,
        t.is_iso,
        a2.name                               AS aufbereitungsart_name,
        t.scanned_barcode,
        t.status,
        t.pathogens,
        t.completed_at,
        u.full_name                           AS assigned_to_name,
        t.created_at
       FROM tasks t
       LEFT JOIN bed_types        bt ON bt.id = t.bed_type_id
       LEFT JOIN aufbereitungsarten a2 ON a2.id = t.aufbereitungsart_id
       LEFT JOIN users            u  ON u.id  = t.assigned_to
      WHERE t.category = 'bed_cleaning_zentral'
        AND t.created_date >= $1
        AND t.created_date <= $2
      ORDER BY t.created_date DESC, t.created_at DESC`,
    [q.date_from, q.date_to]
  );

  const tasks = rows.map((r: any) => ({
    ...r,
    is_iso: !!r.is_iso,
    pathogens: (() => { try { return JSON.parse(r.pathogens); } catch { return []; } })(),
  }));

  const byDay: Record<string, any[]> = {};
  for (const t of tasks) {
    (byDay[t.date] ||= []).push(t);
  }

  const days = Object.entries(byDay).map(([date, items]) => ({
    date,
    total:         items.length,
    abgeschlossen: items.filter((t: any) => t.status === "abgeschlossen").length,
    iso_count:     items.filter((t: any) => t.is_iso).length,
    by_type:       groupCount(items, "bed_type_name"),
    by_art:        groupCount(items, "aufbereitungsart_name"),
    tasks:         items,
  }));

  res.json({
    date_from:     q.date_from,
    date_to:       q.date_to,
    total:         tasks.length,
    abgeschlossen: tasks.filter((t: any) => t.status === "abgeschlossen").length,
    iso_count:     tasks.filter((t: any) => t.is_iso).length,
    by_type:       groupCount(tasks, "bed_type_name"),
    by_art:        groupCount(tasks, "aufbereitungsart_name"),
    days,
  });
});

function groupCount(items: any[], key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = item[key] ?? "Unbekannt";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

router.get("/zentral-pdf", (req: AuthedRequest, res) => {
  const q = zentralSchema.parse(req.query);
  if (q.date_from > q.date_to) return res.status(400).json({ error: "date_from_after_date_to" });

  const { rows } = query<any>(
    `SELECT
        t.created_date AS date,
        bt.name        AS bed_type_name,
        t.is_iso,
        a2.name        AS aufbereitungsart_name,
        t.scanned_barcode,
        t.status,
        t.pathogens,
        u.full_name    AS assigned_to_name,
        t.created_at
       FROM tasks t
       LEFT JOIN bed_types        bt ON bt.id = t.bed_type_id
       LEFT JOIN aufbereitungsarten a2 ON a2.id = t.aufbereitungsart_id
       LEFT JOIN users            u  ON u.id  = t.assigned_to
      WHERE t.category = 'bed_cleaning_zentral'
        AND t.created_date >= $1
        AND t.created_date <= $2
      ORDER BY t.created_date DESC, t.created_at DESC`,
    [q.date_from, q.date_to]
  );

  const tasks = rows.map((r: any) => ({
    ...r,
    is_iso: !!r.is_iso,
    pathogens: (() => { try { return JSON.parse(r.pathogens); } catch { return []; } })(),
  }));

  const byDay: Record<string, any[]> = {};
  for (const t of tasks) { (byDay[t.date] ||= []).push(t); }

  const days = Object.entries(byDay).map(([date, items]) => ({
    date,
    total:         items.length,
    abgeschlossen: items.filter((t: any) => t.status === "abgeschlossen").length,
    iso_count:     items.filter((t: any) => t.is_iso).length,
    tasks:         items,
  }));

  streamZentralReportPdf(res, {
    date_from:     q.date_from,
    date_to:       q.date_to,
    total:         tasks.length,
    abgeschlossen: tasks.filter((t: any) => t.status === "abgeschlossen").length,
    iso_count:     tasks.filter((t: any) => t.is_iso).length,
    by_type:       groupCount(tasks, "bed_type_name"),
    by_art:        groupCount(tasks, "aufbereitungsart_name"),
    days,
  });
});
