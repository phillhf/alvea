import { Router } from "express";
import { query, newId } from "../config/db";
import { audit } from "../services/audit";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import { UPLOAD_DIR } from "../config/paths";

const router = Router();
router.use(authRequired);

// ── Upload ────────────────────────────────────────────────────────────────────
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = ["image/jpeg","image/png","image/webp","image/heic","application/pdf"];

// Magic-Byte-Signaturen – schützt vor gefälschtem MIME-Type
const MAGIC_SIGS: Buffer[] = [
  Buffer.from([0xFF, 0xD8, 0xFF]),             // JPEG
  Buffer.from([0x89, 0x50, 0x4E, 0x47]),       // PNG
  Buffer.from([0x52, 0x49, 0x46, 0x46]),       // RIFF (WebP)
  Buffer.from([0x25, 0x50, 0x44, 0x46]),       // %PDF
];
function checkMagicBytes(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (MAGIC_SIGS.some(m => buf.slice(0, m.length).equals(m))) return true;
    // HEIC/HEIF: "ftyp" bei Offset 4
    return buf.slice(4, 8).toString("ascii") === "ftyp";
  } catch { return false; }
}
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename:    (_req, file, cb) => cb(null, `rs_${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Nicht erlaubter Dateityp"));
  },
});

// ── Helper ────────────────────────────────────────────────────────────────────
function parseAnhaenge(raw: string | null): string[] {
  try { return JSON.parse(raw || "[]"); } catch { return []; }
}

// ── GET alle ──────────────────────────────────────────────────────────────────
router.get("/", requirePermission("verwaltung", "lager", "stationspersonal"), (req: AuthedRequest, res) => {
  try {
    const isAdmin  = req.user!.permissions.includes("verwaltung") || req.user!.permissions.includes("lager");
    const userId   = req.user?.sub ?? null;
    const { status } = req.query as Record<string, string>;

    const wheres: string[] = [];
    const params: any[] = [];

    if (!isAdmin) {
      wheres.push(`r.created_by=$${params.length + 1}`);
      params.push(userId);
    }
    if (status && status !== "alle") {
      if (status === "lager") {
        wheres.push(`r.status IN ('offen','in_bearbeitung','zurueck_ans_lager')`);
      } else {
        wheres.push(`r.status=$${params.length + 1}`);
        params.push(status);
      }
    }

    const where = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";
    const { rows } = query<any>(`
      SELECT r.*, u.full_name AS erstellt_von, b.full_name AS bearbeitet_von,
             s.name AS station_name_ref
      FROM ruecksendungen r
      LEFT JOIN users u  ON u.id = r.created_by
      LEFT JOIN users b  ON b.id = r.bearbeitet_by
      LEFT JOIN areas s  ON s.id = r.station_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT 200
    `, params);
    res.json(rows.map((r: any) => ({ ...r, anhaenge: parseAnhaenge(r.anhaenge) })));
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── GET single ────────────────────────────────────────────────────────────────
router.get("/:id", requirePermission("verwaltung", "lager", "stationspersonal"), (req: AuthedRequest, res) => {
  try {
    const { rows } = query<any>(`
      SELECT r.*, u.full_name AS erstellt_von, b.full_name AS bearbeitet_von,
             s.name AS station_name_ref
      FROM ruecksendungen r
      LEFT JOIN users u  ON u.id = r.created_by
      LEFT JOIN users b  ON b.id = r.bearbeitet_by
      LEFT JOIN areas s  ON s.id = r.station_id
      WHERE r.id=$1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    const isAdmin = req.user!.permissions.includes("verwaltung") || req.user!.permissions.includes("lager");
    if (!isAdmin && rows[0].created_by !== req.user?.sub) {
      return res.status(403).json({ error: "forbidden" });
    }
    res.json({ ...rows[0], anhaenge: parseAnhaenge(rows[0].anhaenge) });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── POST neue Rücksendung ─────────────────────────────────────────────────────
router.post("/", requirePermission("stationspersonal", "verwaltung", "lager"), (req: AuthedRequest, res) => {
  try {
    const s = z.object({
      station_id:   z.string().min(1),
      station_name: z.string().optional(),
      artikel:      z.string().min(1).max(2000),
      menge:        z.string().min(1).max(200),
      grund:        z.string().min(1).max(500),
    }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input", detail: s.error.issues });

    const id = newId();
    query(
      `INSERT INTO ruecksendungen (id, station_id, station_name, artikel, menge, grund, created_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'in_bearbeitung')`,
      [id, s.data.station_id, s.data.station_name ?? null, s.data.artikel,
       s.data.menge, s.data.grund, req.user?.sub ?? null]
    );

    audit(req.user?.sub ?? null, "create", "ruecksendung", id, { station: s.data.station_name });
    res.json({ id });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── PATCH Status: Lager nimmt an ─────────────────────────────────────────────
router.patch("/:id/annehmen", requirePermission("verwaltung", "lager"), (req: AuthedRequest, res) => {
  try {
    query(
      `UPDATE ruecksendungen SET status='in_bearbeitung', bearbeitet_by=$1, updated_at=datetime('now') WHERE id=$2`,
      [req.user!.sub, req.params.id]
    );
    audit(req.user!.sub, "in_bearbeitung", "ruecksendung", req.params.id);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── PATCH Status: Weiterleiten an Einkauf ────────────────────────────────────
router.patch("/:id/weiterleiten", requirePermission("verwaltung", "lager"), (req: AuthedRequest, res) => {
  try {
    const s = z.object({ notiz: z.string().max(1000).optional() }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    query(
      `UPDATE ruecksendungen SET status='beim_einkauf', bearbeitet_by=$1,
       notiz=COALESCE($2,notiz), weitergeleitet_at=datetime('now'), updated_at=datetime('now') WHERE id=$3`,
      [req.user!.sub, s.data.notiz ?? null, req.params.id]
    );
    audit(req.user!.sub, "beim_einkauf", "ruecksendung", req.params.id);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── PATCH Status: Einkauf → zurück ans Lager ─────────────────────────────────
router.patch("/:id/zurueck", requirePermission("verwaltung", "lager"), (req: AuthedRequest, res) => {
  try {
    const s = z.object({ einkauf_notiz: z.string().max(1000).optional() }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    query(
      `UPDATE ruecksendungen SET status='zurueck_ans_lager', bearbeitet_by=$1,
       einkauf_notiz=COALESCE($2,einkauf_notiz), zurueck_at=datetime('now'), updated_at=datetime('now') WHERE id=$3`,
      [req.user!.sub, s.data.einkauf_notiz ?? null, req.params.id]
    );
    audit(req.user!.sub, "zurueck_ans_lager", "ruecksendung", req.params.id);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── PATCH Lager-Notiz (editierbar bei in_bearbeitung + zurueck_ans_lager) ────
router.patch("/:id/lager-notiz", requirePermission("verwaltung", "lager"), (req: AuthedRequest, res) => {
  try {
    const s = z.object({ lager_notiz: z.string().max(2000) }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    const row = query<any>(`SELECT status FROM ruecksendungen WHERE id=$1`, [req.params.id]).rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    if (!["in_bearbeitung", "zurueck_ans_lager"].includes(row.status))
      return res.status(400).json({ error: "wrong_status" });
    query(`UPDATE ruecksendungen SET lager_notiz=$1, updated_at=datetime('now') WHERE id=$2`,
      [s.data.lager_notiz || null, req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "internal_error" }); }
});

// ── PATCH Einkauf-Notiz (editierbar solange beim_einkauf) ────────────────────
router.patch("/:id/einkauf-notiz", requirePermission("verwaltung", "lager"), (req: AuthedRequest, res) => {
  try {
    const s = z.object({ einkauf_notiz: z.string().max(2000) }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    const row = query<any>(`SELECT status FROM ruecksendungen WHERE id=$1`, [req.params.id]).rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    if (row.status !== "beim_einkauf")
      return res.status(400).json({ error: "wrong_status" });
    query(`UPDATE ruecksendungen SET einkauf_notiz=$1, updated_at=datetime('now') WHERE id=$2`,
      [s.data.einkauf_notiz || null, req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "internal_error" }); }
});
router.patch("/:id/abschliessen", requirePermission("verwaltung", "lager"), (req: AuthedRequest, res) => {
  try {
    const s = z.object({ notiz: z.string().max(500).optional() }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    query(
      `UPDATE ruecksendungen SET status='abgeschlossen', bearbeitet_by=$1,
       notiz=COALESCE($2,notiz), updated_at=datetime('now') WHERE id=$3`,
      [req.user!.sub, s.data.notiz ?? null, req.params.id]
    );
    audit(req.user!.sub, "abgeschlossen", "ruecksendung", req.params.id);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── POST Anhang hochladen ─────────────────────────────────────────────────────
router.post("/:id/anhang", requirePermission("stationspersonal", "verwaltung", "lager"), upload.single("file"), (req: AuthedRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no_file" });
    if (!checkMagicBytes(req.file.path)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "invalid_file_content" });
    }
    const row = query<any>(`SELECT anhaenge, created_by FROM ruecksendungen WHERE id=$1`, [req.params.id]).rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    const isAdmin = req.user!.permissions.includes("verwaltung") || req.user!.permissions.includes("lager");
    if (!isAdmin && row.created_by !== req.user?.sub) {
      return res.status(403).json({ error: "forbidden" });
    }
    const anhaenge = parseAnhaenge(row.anhaenge);
    const url = `/api/uploads/${req.file.filename}`;
    anhaenge.push(url);
    query(`UPDATE ruecksendungen SET anhaenge=$1, updated_at=datetime('now') WHERE id=$2`,
      [JSON.stringify(anhaenge), req.params.id]);
    audit(req.user!.sub, "anhang", "ruecksendung", req.params.id, { file: req.file.filename });
    res.json({ url, anhaenge });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── DELETE Anhang ─────────────────────────────────────────────────────────────
router.delete("/:id/anhang", requirePermission("verwaltung", "lager"), (req: AuthedRequest, res) => {
  try {
    const { url } = req.body as { url: string };
    const row = query<any>(`SELECT anhaenge FROM ruecksendungen WHERE id=$1`, [req.params.id]).rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    const anhaenge = parseAnhaenge(row.anhaenge).filter((u: string) => u !== url);
    query(`UPDATE ruecksendungen SET anhaenge=$1, updated_at=datetime('now') WHERE id=$2`,
      [JSON.stringify(anhaenge), req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── GET Begleitschein PDF ─────────────────────────────────────────────────────
router.get("/:id/begleitschein", requirePermission("stationspersonal", "verwaltung", "lager"), (req: AuthedRequest, res) => {
  try {
    const { rows } = query<any>(`
      SELECT r.*, s.name AS station_name_ref, u.full_name AS erstellt_von
      FROM ruecksendungen r
      LEFT JOIN areas s ON s.id = r.station_id
      LEFT JOIN users u ON u.id = r.created_by
      WHERE r.id=$1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    const r = rows[0];

    // Datenisolation: Stationspersonal darf nur eigene Rücksendungen abrufen
    const isAdmin = req.user!.permissions.includes("verwaltung") || req.user!.permissions.includes("lager");
    if (!isAdmin && r.created_by !== req.user?.sub) {
      return res.status(403).json({ error: "forbidden" });
    }

    let artikelList: { artikel: string; menge: string }[] = [];
    try { artikelList = JSON.parse(r.artikel); } catch {
      artikelList = [{ artikel: r.artikel, menge: r.menge }];
    }

    const stationName = r.station_name_ref ?? r.station_name ?? "–";
    const datum = new Date(r.created_at).toLocaleString("de-DE");

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Begleitschein_${r.id.slice(0,8)}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font("Helvetica-Bold").text("Rücksendungs-Begleitschein", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").fillColor("#555").text(`Erstellt: ${datum}`, { align: "center" });
    doc.fillColor("#000");
    doc.moveDown(1);

    // Trennlinie
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ccc").stroke();
    doc.moveDown(0.8);

    // Station & Auftrags-ID
    doc.fontSize(11).font("Helvetica-Bold").text("Station:");
    doc.fontSize(11).font("Helvetica").text(stationName);
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica-Bold").text("Auftrags-ID:");
    doc.fontSize(10).font("Helvetica").fillColor("#555").text(r.id);
    doc.fillColor("#000");
    doc.moveDown(0.8);

    // Artikel-Tabelle
    doc.fontSize(11).font("Helvetica-Bold").text("Artikel:");
    doc.moveDown(0.3);
    const colMenge = 50, colArtikel = 130;
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#555");
    doc.text("Menge", colMenge, doc.y, { continued: true, width: 80 });
    doc.text("Artikel / Material", colArtikel);
    doc.fillColor("#000");
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ddd").stroke();
    doc.moveDown(0.2);

    // Check if artikel have per-item grund
    const hasPerGrund = artikelList.some((a: any) => a.grund);

    artikelList.forEach((a: any) => {
      doc.fontSize(10).font("Helvetica");
      const y = doc.y;
      doc.text(a.menge, colMenge, y, { width: 80 });
      if (hasPerGrund && a.grund) {
        doc.text(`${a.artikel}`, colArtikel, y);
        doc.fontSize(9).fillColor("#666").text(`→ ${a.grund}`, colArtikel, doc.y, { width: 415 });
        doc.fillColor("#000");
      } else {
        doc.text(a.artikel, colArtikel, y);
      }
      doc.moveDown(0.4);
    });

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ccc").stroke();
    doc.moveDown(0.8);

    // Gesamtgrund (falls kein per-item Grund)
    if (!hasPerGrund && r.grund) {
      doc.fontSize(11).font("Helvetica-Bold").text("Rücksendegrund:");
      doc.moveDown(0.3);
      doc.fontSize(10).font("Helvetica").text(r.grund, { width: 495 });
    }
    doc.moveDown(1.5);

    // Unterschrift
    doc.moveTo(50, doc.y).lineTo(250, doc.y).strokeColor("#999").stroke();
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#555").text("Unterschrift Station", 50);
    doc.fillColor("#000");

    doc.moveTo(320, doc.y - 15).lineTo(545, doc.y - 15).strokeColor("#999").stroke();
    doc.fontSize(9).fillColor("#555").text("Unterschrift Lager", 320, doc.y - 10);

    doc.end();
  } catch (e: any) { res.status(500).json({ error: "pdf_error" }); }
});

// ── DELETE dismiss (Station blendet abgeschlossene aus) ───────────────────────
router.delete("/:id/dismiss", requirePermission("stationspersonal", "lager", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const userId = req.user?.sub;
    const row = query<any>(`SELECT id, status, created_by FROM ruecksendungen WHERE id=$1`, [req.params.id]).rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    if (row.created_by !== userId && !req.user?.permissions.includes("verwaltung"))
      return res.status(403).json({ error: "forbidden" });
    if (row.status !== "abgeschlossen") return res.status(400).json({ error: "not_finished_yet" });
    query(`DELETE FROM ruecksendungen WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── DELETE (verwaltung) ───────────────────────────────────────────────────────
router.delete("/:id", requirePermission("verwaltung", "lager"), (req, res) => {
  try { query(`DELETE FROM ruecksendungen WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── GET Berichte: Statistik pro Station mit Durchlaufzeiten ─────────────────
router.get("/berichte/statistik", requirePermission("verwaltung", "lager", "berichte"), (req: AuthedRequest, res) => {
  try {
    const { von, bis } = req.query as Record<string, string>;
    const wheres: string[] = [];
    const params: any[] = [];
    if (von) { wheres.push(`date(r.created_at) >= $${params.length + 1}`); params.push(von); }
    if (bis) { wheres.push(`date(r.created_at) <= $${params.length + 1}`); params.push(bis); }
    const where = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

    const { rows } = query<any>(`
      SELECT
        r.id, r.station_id, COALESCE(s.name, r.station_name) AS station_name,
        r.status, r.notiz AS abschlussgrund,
        r.created_at, r.weitergeleitet_at, r.zurueck_at, r.updated_at,
        -- Lager-Phase 1: Anlage bis Weiterleitung an Einkauf (falls weitergeleitet)
        CASE WHEN r.weitergeleitet_at IS NOT NULL
          THEN ROUND((julianday(r.weitergeleitet_at) - julianday(r.created_at)) * 24, 1)
          ELSE NULL END AS lager_phase1_stunden,
        -- Lager-Phase 2: Rückkehr vom Einkauf bis Abschluss (falls zurueck_at gesetzt und abgeschlossen)
        CASE WHEN r.zurueck_at IS NOT NULL AND r.status = 'abgeschlossen'
          THEN ROUND((julianday(r.updated_at) - julianday(r.zurueck_at)) * 24, 1)
          ELSE NULL END AS lager_phase2_stunden,
        -- Lager direkt ohne Einkauf-Durchlauf: Anlage bis Abschluss
        CASE WHEN r.weitergeleitet_at IS NULL AND r.status = 'abgeschlossen'
          THEN ROUND((julianday(r.updated_at) - julianday(r.created_at)) * 24, 1)
          ELSE NULL END AS lager_direkt_stunden,
        -- Einkauf: Weiterleitung bis Rücksendung ans Lager
        CASE WHEN r.weitergeleitet_at IS NOT NULL AND r.zurueck_at IS NOT NULL
          THEN ROUND((julianday(r.zurueck_at) - julianday(r.weitergeleitet_at)) * 24, 1)
          ELSE NULL END AS einkauf_stunden,
        -- Gesamtdauer bis Abschluss
        CASE WHEN r.status = 'abgeschlossen'
          THEN ROUND((julianday(r.updated_at) - julianday(r.created_at)) * 24, 1)
          ELSE NULL END AS gesamt_stunden
      FROM ruecksendungen r
      LEFT JOIN areas s ON s.id = r.station_id
      ${where}
      ORDER BY r.created_at DESC
    `, params);

    // Lager-Gesamtzeit pro Vorgang berechnen (Summe aller Lager-Phasen)
    for (const r of rows) {
      const phases = [r.lager_phase1_stunden, r.lager_phase2_stunden, r.lager_direkt_stunden].filter((v: number | null) => v !== null);
      r.lager_stunden_gesamt = phases.length ? Math.round(phases.reduce((a: number, b: number) => a + b, 0) * 10) / 10 : null;
    }

    // Aggregation pro Station
    const byStation = new Map<string, any>();
    for (const r of rows) {
      const key = r.station_name ?? "–";
      if (!byStation.has(key)) {
        byStation.set(key, { station_name: key, anzahl: 0, abgeschlossen: 0, lager_stunden: [], einkauf_stunden: [] });
      }
      const agg = byStation.get(key);
      agg.anzahl++;
      if (r.status === "abgeschlossen") agg.abgeschlossen++;
      if (r.lager_stunden_gesamt !== null) agg.lager_stunden.push(r.lager_stunden_gesamt);
      if (r.einkauf_stunden !== null) agg.einkauf_stunden.push(r.einkauf_stunden);
    }
    const avg = (arr: number[]) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
    const stationStats = Array.from(byStation.values()).map(s => ({
      station_name: s.station_name,
      anzahl: s.anzahl,
      abgeschlossen: s.abgeschlossen,
      avg_lager_stunden: avg(s.lager_stunden),
      avg_einkauf_stunden: avg(s.einkauf_stunden),
    })).sort((a, b) => b.anzahl - a.anzahl);

    // Abschlussgründe-Verteilung
    const grundCounts = new Map<string, number>();
    for (const r of rows) {
      if (r.status === "abgeschlossen" && r.abschlussgrund) {
        grundCounts.set(r.abschlussgrund, (grundCounts.get(r.abschlussgrund) ?? 0) + 1);
      }
    }
    const abschlussgruende = Array.from(grundCounts.entries())
      .map(([grund, anzahl]) => ({ grund, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl);

    res.json({ details: rows, stationStats, abschlussgruende });
  } catch (e: any) { res.status(500).json({ error: "internal_error" }); }
});

// ── GET Berichte: PDF-Export ──────────────────────────────────────────────
router.get("/berichte/pdf", requirePermission("verwaltung", "lager", "berichte"), (req: AuthedRequest, res) => {
  try {
    const { von, bis } = req.query as Record<string, string>;
    const wheres: string[] = [];
    const params: any[] = [];
    if (von) { wheres.push(`date(r.created_at) >= $${params.length + 1}`); params.push(von); }
    if (bis) { wheres.push(`date(r.created_at) <= $${params.length + 1}`); params.push(bis); }
    const where = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

    const { rows } = query<any>(`
      SELECT
        r.id, COALESCE(s.name, r.station_name) AS station_name, r.status, r.notiz AS abschlussgrund,
        r.created_at, r.weitergeleitet_at, r.zurueck_at, r.updated_at,
        CASE WHEN r.weitergeleitet_at IS NOT NULL
          THEN ROUND((julianday(r.weitergeleitet_at) - julianday(r.created_at)) * 24, 1)
          ELSE NULL END AS lager_phase1_stunden,
        CASE WHEN r.zurueck_at IS NOT NULL AND r.status = 'abgeschlossen'
          THEN ROUND((julianday(r.updated_at) - julianday(r.zurueck_at)) * 24, 1)
          ELSE NULL END AS lager_phase2_stunden,
        CASE WHEN r.weitergeleitet_at IS NULL AND r.status = 'abgeschlossen'
          THEN ROUND((julianday(r.updated_at) - julianday(r.created_at)) * 24, 1)
          ELSE NULL END AS lager_direkt_stunden,
        CASE WHEN r.weitergeleitet_at IS NOT NULL AND r.zurueck_at IS NOT NULL
          THEN ROUND((julianday(r.zurueck_at) - julianday(r.weitergeleitet_at)) * 24, 1)
          ELSE NULL END AS einkauf_stunden
      FROM ruecksendungen r
      LEFT JOIN areas s ON s.id = r.station_id
      ${where}
      ORDER BY COALESCE(s.name, r.station_name), r.created_at DESC
    `, params);

    for (const r of rows) {
      const phases = [r.lager_phase1_stunden, r.lager_phase2_stunden, r.lager_direkt_stunden].filter((v: number | null) => v !== null);
      r.lager_stunden = phases.length ? Math.round(phases.reduce((a: number, b: number) => a + b, 0) * 10) / 10 : null;
    }

    const byStation = new Map<string, any[]>();
    for (const r of rows) {
      const key = r.station_name ?? "–";
      if (!byStation.has(key)) byStation.set(key, []);
      byStation.get(key)!.push(r);
    }

    const STATUS_LABEL: Record<string, string> = {
      offen: "Beim Lager", in_bearbeitung: "Beim Lager", beim_einkauf: "Beim Einkauf",
      zurueck_ans_lager: "Zurück ans Lager", abgeschlossen: "Abgeschlossen",
    };

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Ruecksendungsbericht_${von ?? "alle"}_${bis ?? ""}.pdf"`);
    doc.pipe(res);

    doc.fontSize(18).font("Helvetica-Bold").text("Rücksendungen – Bericht");
    doc.fontSize(10).font("Helvetica").fillColor("#555")
      .text(`Zeitraum: ${von ?? "Anfang"} – ${bis ?? "heute"}`)
      .text(`Erstellt: ${new Date().toLocaleDateString("de-DE")} · Gesamt: ${rows.length} Rücksendungen`);
    doc.fillColor("#000");
    doc.moveDown(1);

    for (const [station, items] of byStation) {
      doc.fontSize(13).font("Helvetica-Bold").text(`📍 ${station}`);
      doc.moveDown(0.2);
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#555");
      const colX = [50, 130, 260, 340, 420];
      ["Datum", "Status", "Lager (Std)", "Einkauf (Std)", "Abschluss"].forEach((h, i) =>
        doc.text(h, colX[i], doc.y, { continued: i < 4, width: i === 4 ? 130 : 80 })
      );
      doc.moveDown(0.3);
      doc.fillColor("#000");
      for (const r of items) {
        const y = doc.y;
        doc.fontSize(8).font("Helvetica")
          .text(new Date(r.created_at).toLocaleDateString("de-DE"), colX[0], y, { width: 75 })
          .text(STATUS_LABEL[r.status] ?? r.status, colX[1], y, { width: 125 })
          .text(r.lager_stunden != null ? String(r.lager_stunden) : "–", colX[2], y, { width: 75 })
          .text(r.einkauf_stunden != null ? String(r.einkauf_stunden) : "–", colX[3], y, { width: 75 })
          .text(r.abschlussgrund ?? "–", colX[4], y, { width: 125 });
        doc.moveDown(0.35);
        if (doc.y > 730) doc.addPage();
      }
      doc.moveDown(0.6);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ddd").stroke();
      doc.moveDown(0.6);
    }

    doc.end();
  } catch (e: any) { res.status(500).json({ error: "internal_error" }); }
});

export default router;

// ── Abschluss-Gründe ─────────────────────────────────────────────────────────
export const abschlussRouter = Router();
abschlussRouter.use(authRequired);

abschlussRouter.get("/", requirePermission("verwaltung", "stationspersonal", "sauerstofftransport", "lager"), (_req, res) => {
  try { res.json(query<any>(`SELECT * FROM ruecksendung_abschluesse ORDER BY sort_order, name`).rows); }
  catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

abschlussRouter.post("/", requirePermission("verwaltung", "lager"), (req, res) => {
  try {
    const s = z.object({ name: z.string().min(1).max(200), sort_order: z.number().int().optional() }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    const id = newId();
    const maxOrder = (query<any>(`SELECT COALESCE(MAX(sort_order),0) as m FROM ruecksendung_abschluesse`).rows[0] as any)?.m ?? 0;
    query(`INSERT INTO ruecksendung_abschluesse (id,name,sort_order) VALUES ($1,$2,$3)`,
      [id, s.data.name, s.data.sort_order ?? maxOrder + 1]);
    res.json({ id });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

abschlussRouter.patch("/:id", requirePermission("verwaltung", "lager"), (req, res) => {
  try {
    const s = z.object({ name: z.string().min(1).max(200).optional(), sort_order: z.number().int().optional() }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    const sets: string[] = []; const params: any[] = [];
    if (s.data.name       !== undefined) { sets.push(`name=$${sets.length+1}`);       params.push(s.data.name); }
    if (s.data.sort_order !== undefined) { sets.push(`sort_order=$${sets.length+1}`); params.push(s.data.sort_order); }
    if (sets.length) { params.push(req.params.id); query(`UPDATE ruecksendung_abschluesse SET ${sets.join(",")} WHERE id=$${params.length}`, params); }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

abschlussRouter.delete("/:id", requirePermission("verwaltung", "lager"), (req, res) => {
  try { query(`DELETE FROM ruecksendung_abschluesse WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: "db_error" }); }
});
