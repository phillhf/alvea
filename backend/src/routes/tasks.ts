import { Router, Response } from "express";
import { z } from "zod";
import multer from "multer";
import fs from "fs";
import path from "path";
import { query, transaction, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { audit } from "../services/audit";
import { getAreaScope, getStationScope } from "../services/scope";

const router = Router();
router.use(authRequired);

// ---------- Uploads ----------
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Magic-Byte-Signaturen – schützt vor gefälschtem MIME-Type
const MAGIC_BYTES: { mime: string; magic: Buffer }[] = [
  { mime: "image/jpeg", magic: Buffer.from([0xFF, 0xD8, 0xFF]) },
  { mime: "image/png",  magic: Buffer.from([0x89, 0x50, 0x4E, 0x47]) },
  { mime: "image/webp", magic: Buffer.from([0x52, 0x49, 0x46, 0x46]) }, // RIFF
  { mime: "image/gif",  magic: Buffer.from([0x47, 0x49, 0x46]) },       // GIF
];

function checkMagicBytes(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    return MAGIC_BYTES.some(({ magic }) => buf.slice(0, magic.length).equals(magic));
  } catch { return false; }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Nur alphanumerische Zeichen + Erweiterung – kein Path-Traversal möglich
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "");
    cb(null, `${Date.now()}-${newId()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Nur Bilddateien erlaubt (JPEG, PNG, WebP, GIF)"));
  },
});

function safeParseJson(s: unknown): any {
  if (!s || typeof s !== "string") return Array.isArray(s) ? s : [];
  try { return JSON.parse(s); } catch { return []; }
}

// ================= GET tasks (gefiltert nach Bereichsberechtigung) =================
router.get("/", (req: AuthedRequest, res) => {
  const { status, station_id, bed_id, assigned_to, category } =
    req.query as Record<string, string>;

  // Zentral-Aufträge: eigene Query ohne Raum-/Stations-JOIN
  if (category === "bed_cleaning_zentral") {
    const where: string[] = ["t.category = 'bed_cleaning_zentral'"];
    const params: any[] = [];
    if (status)      { params.push(status);      where.push(`t.status = $${params.length}`); }
    if (assigned_to) { params.push(assigned_to); where.push(`t.assigned_to = $${params.length}`); }
    const { rows } = query(
      `SELECT t.*, bt.name AS bed_type_name,
              a2.name AS aufbereitungsart_name, a2.when_to_use, a2.instructions AS aufbereitungsart_instructions,
              u.full_name AS assigned_to_name,
              u2.full_name AS signed_off_by_name
         FROM tasks t
         LEFT JOIN bed_types bt ON bt.id = t.bed_type_id
         LEFT JOIN aufbereitungsarten a2 ON a2.id = t.aufbereitungsart_id
         LEFT JOIN users u  ON u.id  = t.assigned_to
         LEFT JOIN users u2 ON u2.id = t.signed_off_by
         WHERE ${where.join(" AND ")}
         ORDER BY
           CASE t.status WHEN 'offen' THEN 1 WHEN 'laufend' THEN 2
                         WHEN 'abgeschlossen' THEN 3 ELSE 4 END,
           t.priority ASC, t.created_at ASC`,
      params
    );
    return res.json(rows.map((r: any) => ({ ...r, pathogens: safeParseJson(r.pathogens), photos: safeParseJson(r.photos) })));
  }

  const scope        = getAreaScope(req.user!.sub, req.user!.permissions);
  const stationScope = getStationScope(req.user!.sub, req.user!.permissions);

  const where: string[] = [];
  const params: any[] = [];
  if (status)      { params.push(status);      where.push(`t.status = $${params.length}`); }
  if (station_id)  { params.push(station_id);  where.push(`COALESCE(r.area_id, r.station_id) = $${params.length}`); }
  if (bed_id)      { params.push(bed_id);      where.push(`t.bed_id = $${params.length}`); }
  if (assigned_to) { params.push(assigned_to); where.push(`t.assigned_to = $${params.length}`); }
  where.push(`t.category != 'bed_cleaning_zentral'`);
  if (category && category !== "bed_cleaning_zentral") { params.push(category); where.push(`t.category = $${params.length}`); }

  // Scope auf area_id
  const allScope = stationScope ?? scope;
  if (allScope !== null) {
    if (!allScope.length) return res.json([]);
    const ph = allScope.map((_, i) => `$${params.length + i + 1}`).join(",");
    where.push(`COALESCE(r.area_id, r.station_id) IN (${ph})`);
    params.push(...allScope);
  }

  const { rows } = query(
    `SELECT t.*,
            r.room_number,
            COALESCE(r.area_id, r.station_id) AS station_id,
            COALESCE(a.bezeichnung, a.name) AS station_name,
            a.id AS area_id,
            a.name AS area_name,
            b.bed_number,
            u.full_name  AS assigned_to_name,
            u2.full_name AS signed_off_by_name
       FROM tasks t
       LEFT JOIN rooms r ON r.id = t.room_id
       LEFT JOIN areas a ON a.id = COALESCE(r.area_id, r.station_id)
       LEFT JOIN beds b   ON b.id  = t.bed_id
       LEFT JOIN users u  ON u.id  = t.assigned_to
       LEFT JOIN users u2 ON u2.id = t.signed_off_by
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY
         CASE t.status WHEN 'offen' THEN 1 WHEN 'unterwegs' THEN 2
                       WHEN 'angekommen' THEN 3 WHEN 'laufend' THEN 4
                       WHEN 'abgeschlossen' THEN 5 ELSE 6 END,
         t.priority ASC,
         t.created_at ASC`,
    params
  );
  res.json(rows.map((r: any) => ({ ...r, pathogens: safeParseJson(r.pathogens), photos: safeParseJson(r.photos) })));
});

router.get("/:id", (req: AuthedRequest, res) => {
  const { rows } = query(
    `SELECT t.*,
            r.room_number,
            COALESCE(r.area_id, r.station_id) AS station_id,
            COALESCE(a.bezeichnung, a.name) AS station_name,
            a.id AS area_id,
            a.name AS area_name,
            b.bed_number,
            bt.name AS bed_type_name,
            a2.name AS aufbereitungsart_name,
            a2.when_to_use,
            a2.instructions AS aufbereitungsart_instructions,
            u.full_name AS assigned_to_name
       FROM tasks t
       LEFT JOIN rooms r ON r.id = t.room_id
       LEFT JOIN areas a ON a.id = COALESCE(r.area_id, r.station_id)
       LEFT JOIN beds b     ON b.id = t.bed_id
       LEFT JOIN bed_types bt ON bt.id = t.bed_type_id
       LEFT JOIN aufbereitungsarten a2 ON a2.id = t.aufbereitungsart_id
       LEFT JOIN users u    ON u.id = t.assigned_to
      WHERE t.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const task: any = rows[0];

  // Zentral-Aufträge: keine Bereichsprüfung (global sichtbar)
  if (task.category !== "bed_cleaning_zentral") {
    const aScope = getAreaScope(req.user!.sub, req.user!.permissions);
    const sScope = getStationScope(req.user!.sub, req.user!.permissions);
    if (sScope !== null && !sScope.includes(task.station_id)) {
      return res.status(403).json({ error: "forbidden" });
    } else if (aScope !== null && !aScope.includes(task.area_id)) {
      return res.status(403).json({ error: "forbidden" });
    }
  }

  task.pathogens = safeParseJson(task.pathogens);
  task.photos    = safeParseJson(task.photos);

  const { rows: items } = query(
    `SELECT * FROM checklists WHERE task_id = $1 ORDER BY sort_order, item_name`,
    [req.params.id]
  );
  res.json({ ...task, checklist: items.map((i: any) => ({ ...i, is_completed: !!i.is_completed })) });
});

// ================= CREATE task =================
const createSchema = z.object({
  category: z.enum(["bed_cleaning", "room_cleaning", "bed_cleaning_zentral"]),
  bed_id: z.string().uuid().optional(),
  room_id: z.string().uuid().optional(),
  bed_type_id: z.string().uuid().optional(),
  aufbereitungsart_id: z.string().optional(),
  scanned_barcode: z.string().optional(),
  is_iso: z.boolean().optional().default(false),
  cleaning_type: z.enum(["normal", "infektioes", "standard", "schlussdesinfektion", "aufbereitung_zentral", "voll", "schnell", "isoliert"]),
  pathogens: z.array(z.string()).optional(),
  priority: z.number().int().min(1).max(3).default(2),
  notes: z.string().optional(),
  wunschtermin: z.string().optional(),
}).refine(
  (d) => {
    if (d.category === "bed_cleaning_zentral") return true;
    return d.category === "bed_cleaning" ? !!d.bed_id : !!d.room_id;
  },
  { message: "bed_id required for bed_cleaning, room_id for room_cleaning" }
);

router.post("/", requirePermission("auftraege_erstellen", "bettenaufbereitung_zentral", "stationspersonal"), (req: AuthedRequest, res: Response) => {
  const d = createSchema.parse(req.body);

  // Zentral-Aufträge: brauchen bettenaufbereitung_zentral oder auftraege_erstellen
  if (d.category === "bed_cleaning_zentral" &&
      !req.user!.permissions.includes("bettenaufbereitung_zentral") &&
      !req.user!.permissions.includes("auftraege_erstellen")) {
    return res.status(403).json({ error: "forbidden" });
  }
  const isInfectious = d.cleaning_type === "infektioes" || d.cleaning_type === "schlussdesinfektion";
  if (isInfectious && (!d.pathogens || d.pathogens.length === 0)) {
    // Erreger optional – kein Fehler, leeres Array ist ok
  }

  const task = transaction((q) => {
    let roomId = d.room_id ?? null;
    let bedTypeId: string | null = d.bed_type_id ?? null;

    if (d.category === "bed_cleaning") {
      const { rows } = q<{ room_id: string; bed_type_id: string | null }>(
        `SELECT room_id, bed_type_id FROM beds WHERE id = $1`, [d.bed_id!]
      );
      if (!rows.length) throw new HttpError(404, "bed_not_found");
      roomId = rows[0].room_id;
      bedTypeId = rows[0].bed_type_id;

      // Duplikat-Schutz: kein neuer Auftrag wenn bereits ein aktiver existiert
      const { rows: active } = q<{ id: string }>(
        `SELECT id FROM tasks WHERE bed_id = $1 AND status != 'abgeschlossen' AND category = 'bed_cleaning' LIMIT 1`,
        [d.bed_id!]
      );
      if (active.length) throw new HttpError(409, "active_task_exists");
    }

    const id = newId();
    q(
      `INSERT INTO tasks (id,category,bed_id,room_id,bed_type_id,aufbereitungsart_id,is_iso,cleaning_type,pathogens,priority,notes,scanned_barcode,created_by,wunschtermin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, d.category, d.bed_id ?? null, roomId, bedTypeId,
       d.aufbereitungsart_id ?? null,
       d.is_iso ? 1 : 0,
       d.cleaning_type, JSON.stringify(d.pathogens ?? []),
       d.priority, d.notes ?? null, d.scanned_barcode ?? null, req.user!.sub,
       d.wunschtermin ?? null]
    );

    if (d.category === "bed_cleaning") {
      q(`UPDATE beds SET status = 'angefordert' WHERE id = $1`, [d.bed_id!]);
    }

    const { rows: taskRows } = q(`SELECT * FROM tasks WHERE id = $1`, [id]);
    return taskRows[0];
  });

  audit(req.user!.sub, "create", "task", (task as any).id,
    { category: d.category, cleaning_type: d.cleaning_type });
  res.status(201).json({
    ...(task as any),
    pathogens: safeParseJson((task as any).pathogens),
    photos: safeParseJson((task as any).photos),
  });
});

// ================= CLAIM: Mitarbeiter nimmt Auftrag an sich =================
router.post("/:id/claim", requirePermission("bettenaufbereitung", "bettenaufbereitung_zentral", "zimmerreinigung", "verwaltung"), (req: AuthedRequest, res) => {
  const r = transaction((q) => {
    const { rows } = q<{ status: string; assigned_to: string | null; bed_id: string | null; category: string }>(
      `SELECT status, assigned_to, bed_id, category FROM tasks WHERE id = $1`, [req.params.id]
    );
    if (!rows.length) throw new HttpError(404, "task_not_found");
    const t = rows[0];

    // Berechtigungsprüfung: richtiger Tab für die Auftrags-Kategorie
    const perms = req.user!.permissions;
    if (t.category === "bed_cleaning_zentral" && !perms.includes("bettenaufbereitung_zentral")) {
      throw new HttpError(403, "forbidden");
    }
    if (t.category === "bed_cleaning" && !perms.includes("bettenaufbereitung")) {
      throw new HttpError(403, "forbidden");
    }
    if (t.category === "room_cleaning" && !perms.includes("zimmerreinigung")) {
      throw new HttpError(403, "forbidden");
    }

    if (!["offen"].includes(t.status) && t.assigned_to && t.assigned_to !== req.user!.sub) {
      throw new HttpError(409, "already_claimed");
    }
    // Zentral: kein Transport → direkt in laufend
    const isZentral = t.category === "bed_cleaning_zentral";
    const newStatus = isZentral ? "laufend" : "unterwegs";
    q(
      `UPDATE tasks
          SET assigned_to = $1, status = $2,
              en_route_at = COALESCE(en_route_at, datetime('now')),
              started_at  = ${isZentral ? "COALESCE(started_at, datetime('now'))" : "started_at"}
        WHERE id = $3`,
      [req.user!.sub, newStatus, req.params.id]
    );
    const { rows: updated } = q(`SELECT * FROM tasks WHERE id = $1`, [req.params.id]);
    return updated[0];
  });
  audit(req.user!.sub, "claim", "task", req.params.id);
  res.json({ ...(r as any), pathogens: safeParseJson((r as any).pathogens), photos: safeParseJson((r as any).photos) });
});

// ================= RELEASE: Auftrag wieder freigeben =================
router.post("/:id/release", (req: AuthedRequest, res) => {
  const { rows } = query<{ assigned_to: string | null; bed_id: string | null }>(
    `SELECT assigned_to, bed_id FROM tasks WHERE id = $1`, [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  if (rows[0].assigned_to !== req.user!.sub && !req.user!.permissions.includes("auftraege_erstellen")) {
    return res.status(403).json({ error: "not_your_task" });
  }
  query(
    `UPDATE tasks SET assigned_to = NULL, status = 'offen', started_at = NULL, en_route_at = NULL, arrived_at = NULL WHERE id = $1`,
    [req.params.id]
  );
  if (rows[0].bed_id) {
    query(`UPDATE beds SET status = 'angefordert' WHERE id = $1`, [rows[0].bed_id]);
  }
  audit(req.user!.sub, "release", "task", req.params.id);
  res.json({ ok: true });
});

// ================= DELETE: Admin löscht Auftrag =================
// DELETE /:id/dismiss – abgeschlossenen Auftrag für Ersteller ausblenden
router.delete("/:id/dismiss", requirePermission("stationspersonal", "bettenaufbereitung", "zimmerreinigung", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const userId = req.user?.sub;
    const row = query<any>(`SELECT id, status, created_by FROM tasks WHERE id=$1`, [req.params.id]).rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    if (row.status !== "abgeschlossen") return res.status(400).json({ error: "not_done_yet" });
    if (row.created_by !== userId && !req.user?.permissions.includes("verwaltung"))
      return res.status(403).json({ error: "forbidden" });
    query(`DELETE FROM tasks WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.delete("/:id", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const { rows } = query<{ bed_id: string | null; photos: string; status: string }>(
    `SELECT bed_id, photos, status FROM tasks WHERE id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const task = rows[0];

  // Foto-Dateien im Upload-Verzeichnis aufräumen
  try {
    const photos: string[] = safeParseJson(task.photos);
    for (const url of photos) {
      const filename = path.basename(url.split("/").pop() ?? "");
      if (!filename || filename.includes("..")) continue;
      const filePath = path.join(UPLOAD_DIR, filename);
      // Sicherstellen, dass der Pfad wirklich im UPLOAD_DIR liegt
      if (!filePath.startsWith(path.resolve(UPLOAD_DIR))) continue;
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  } catch (e: any) {
    require("../services/logger").logger.warn("Foto-Aufräumen fehlgeschlagen", { error: e.message });
  }

  // Bett-Status zurücksetzen, falls Task noch aktiv war
  if (task.bed_id && (task.status === "offen" || task.status === "laufend" || task.status === "abgeschlossen")) {
    query(`UPDATE beds SET status = 'frei' WHERE id = $1`, [task.bed_id]);
  }

  // Task löschen (Checklisten kaskadieren via FK)
  query(`DELETE FROM tasks WHERE id = $1`, [req.params.id]);
  audit(req.user!.sub, "delete", "task", req.params.id);
  res.json({ ok: true });
});

// ================= UPDATE =================
const patchSchema = z.object({
  status: z.enum(["offen","unterwegs","angekommen","laufend","abgeschlossen"]).optional(),
  notes: z.string().optional(),
  scanned_barcode: z.string().nullable().optional(),
  bestaetigt_termin: z.string().nullable().optional(),
});
router.patch("/:id", requirePermission("bettenaufbereitung", "bettenaufbereitung_zentral", "zimmerreinigung", "verwaltung"), (req: AuthedRequest, res) => {
  const d = patchSchema.parse(req.body);

  // Bereichs- und Eigentümer-Prüfung (Zentral: nur Eigentümer oder auftraege_erstellen)
  const { rows: taskRows } = query<{ area_id: string | null; station_id: string | null; assigned_to: string | null; status: string; category: string }>(
    `SELECT COALESCE(r.area_id, r.station_id) AS area_id,
            COALESCE(r.area_id, r.station_id) AS station_id,
            t.assigned_to, t.status, t.category
       FROM tasks t
       LEFT JOIN rooms r ON r.id = t.room_id
      WHERE t.id = $1`,
    [req.params.id]
  );
  if (!taskRows.length) return res.status(404).json({ error: "not_found" });
  const taskCtx = taskRows[0];

  if (taskCtx.category !== "bed_cleaning_zentral") {
    const scope        = getAreaScope(req.user!.sub, req.user!.permissions);
    const stationScope = getStationScope(req.user!.sub, req.user!.permissions);
    const forbidden = stationScope !== null
      ? !stationScope.includes(taskCtx.station_id!)
      : scope !== null && !scope.includes(taskCtx.area_id!);
    if (forbidden) return res.status(403).json({ error: "forbidden" });
  }
  // Reiniger darf nur seinen eigenen Auftrag ändern
  if (!req.user!.permissions.includes("auftraege_erstellen") && taskCtx.assigned_to !== req.user!.sub) {
    return res.status(403).json({ error: "not_your_task" });
  }
  const fields: string[] = [];
  const values: any[] = [];

  if (d.status !== undefined)              { values.push(d.status);              fields.push(`status = $${values.length}`); }
  if (d.notes !== undefined)               { values.push(d.notes);               fields.push(`notes = $${values.length}`); }
  if (d.scanned_barcode !== undefined)     { values.push(d.scanned_barcode);     fields.push(`scanned_barcode = $${values.length}`); }
  if (d.bestaetigt_termin !== undefined)   { values.push(d.bestaetigt_termin);   fields.push(`bestaetigt_termin = $${values.length}`); }
  if (d.status === "unterwegs")      fields.push(`en_route_at = COALESCE(en_route_at, datetime('now'))`);
  if (d.status === "angekommen")     fields.push(`arrived_at = COALESCE(arrived_at, datetime('now'))`);
  if (d.status === "laufend")        fields.push(`started_at = COALESCE(started_at, datetime('now'))`);
  if (d.status === "abgeschlossen")  fields.push(`completed_at = COALESCE(completed_at, datetime('now'))`);

  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id);

  transaction((q) => {
    q(`UPDATE tasks SET ${fields.join(", ")} WHERE id = $${values.length}`, values);
    // Bettstatus spiegelt Task-Status 1:1
    if (d.status === "unterwegs") {
      q(`UPDATE beds SET status = 'unterwegs' WHERE id = (SELECT bed_id FROM tasks WHERE id = $1 AND bed_id IS NOT NULL)`, [req.params.id]);
    }
    if (d.status === "angekommen") {
      q(`UPDATE beds SET status = 'angekommen' WHERE id = (SELECT bed_id FROM tasks WHERE id = $1 AND bed_id IS NOT NULL)`, [req.params.id]);
    }
    if (d.status === "laufend") {
      q(`UPDATE beds SET status = 'in_bearbeitung' WHERE id = (SELECT bed_id FROM tasks WHERE id = $1 AND bed_id IS NOT NULL)`, [req.params.id]);
    }
    if (d.status === "abgeschlossen") {
      q(`UPDATE beds SET status = 'frei' WHERE id = (SELECT bed_id FROM tasks WHERE id = $1 AND bed_id IS NOT NULL)`, [req.params.id]);
    }
  });

  const { rows } = query(`SELECT * FROM tasks WHERE id = $1`, [req.params.id]);
  audit(req.user!.sub, "update", "task", req.params.id, d as any);
  res.json({ ...(rows[0] as any), pathogens: safeParseJson((rows[0] as any).pathogens), photos: safeParseJson((rows[0] as any).photos) });
});

// ================= PHOTO =================
router.post("/:id/photos", upload.single("photo"), (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "no_file" });

  // Magic-Byte-Prüfung – schützt vor gefälschtem MIME-Type
  if (!checkMagicBytes(req.file.path)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "invalid_file_content" });
  }

  // Bereichs- und Eigentümer-Prüfung
  const { rows: taskRows } = query<{ area_id: string | null; station_id: string | null; assigned_to: string | null; category: string }>(
    `SELECT COALESCE(r.area_id, r.station_id) AS area_id,
            COALESCE(r.area_id, r.station_id) AS station_id,
            t.assigned_to, t.category
       FROM tasks t
       LEFT JOIN rooms r ON r.id = t.room_id
      WHERE t.id = $1`,
    [req.params.id]
  );
  if (!taskRows.length) return res.status(404).json({ error: "not_found" });
  if (taskRows[0].category !== "bed_cleaning_zentral") {
    const aScope2 = getAreaScope(req.user!.sub, req.user!.permissions);
    const sScope2 = getStationScope(req.user!.sub, req.user!.permissions);
    const forbiddenPhoto = sScope2 !== null
      ? !sScope2.includes(taskRows[0].station_id!)
      : aScope2 !== null && !aScope2.includes(taskRows[0].area_id!);
    if (forbiddenPhoto) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: "forbidden" });
    }
  }
  if (!req.user!.permissions.includes("auftraege_erstellen") && taskRows[0].assigned_to !== req.user!.sub) {
    fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: "not_your_task" });
  }
  const url = `/api/uploads/${req.file.filename}`;
  query(
    `UPDATE tasks SET photos = json_insert(photos, '$[#]', $1) WHERE id = $2`,
    [url, req.params.id]
  );
  const { rows } = query<{ photos: string }>(`SELECT photos FROM tasks WHERE id = $1`, [req.params.id]);
  audit(req.user!.sub, "upload_photo", "task", req.params.id, { file: req.file.filename });
  res.status(201).json({ url, photos: safeParseJson(rows[0]?.photos) });
});

// ---------- helpers ----------
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
router.use((err: any, _req: any, res: any, next: any) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  next(err);
});

export default router;
