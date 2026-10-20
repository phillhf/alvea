import { Router } from "express";
import { query } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();
router.use(authRequired);

// Upload-Storage für Hintergrundbilder
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const bgStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, "../../uploads/bg");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, _file, cb) => {
    // Kein Originalname – verhindert Path-Traversal
    cb(null, `bg-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  },
});
const bgUpload = multer({
  storage: bgStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Nur Bilddateien erlaubt (JPEG, PNG, WebP, GIF)"));
  },
});

// Sensitive Keys die nie im Klartext ans Frontend gehen
const MASKED_KEYS = new Set<string>();

router.get("/", (_req, res) => {
  const { rows } = query(`SELECT key, value, description, updated_at FROM settings ORDER BY key`);
  const safe = (rows as any[]).map((r: any) => ({
    ...r,
    value: MASKED_KEYS.has(r.key) ? (r.value ? "••••••••" : "") : r.value,
  }));
  res.json(safe);
});

router.get("/prio", (_req, res) => {
  const keys = ["prio_base", "prio_minutes", "prio_bonus", "prio_color_yellow", "prio_color_red"];
  const { rows } = query(`SELECT key, value FROM settings WHERE key IN (${keys.map((_, i) => `$${i+1}`).join(",")})`, keys);
  const m: Record<string, string> = {};
  rows.forEach((r: any) => { m[r.key] = r.value; });
  res.json(m);
});

const ALLOWED_SETTING_KEYS = new Set([
  "prio_minutes", "prio_base", "prio_bonus",
  "prio_color_yellow", "prio_color_red",
  "theme_config", "login_theme_config",
  "backup_enabled", "backup_path", "backup_time",
  "backup_username", "backup_password",
  "backup_last_run", "backup_last_status",
  "sw_freitext",
]);

// PUT alias für PATCH (Frontend nutzt PUT im SettingsTab)
router.put("/:key", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const { key } = req.params;
  if (!ALLOWED_SETTING_KEYS.has(key)) return res.status(400).json({ error: "unknown_setting_key" });
  const { value } = req.body;
  if (value === undefined || value === null) return res.status(400).json({ error: "value_required" });
  query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=$2, updated_at=datetime('now')`,
    [key, String(value)]
  );
  res.json({ ok: true });
});

router.patch("/:key", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const { key } = req.params;
  if (!ALLOWED_SETTING_KEYS.has(key)) {
    return res.status(400).json({ error: "unknown_setting_key" });
  }
  const { value } = req.body;
  if (value === undefined || value === null) return res.status(400).json({ error: "value_required" });
  query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=$2, updated_at=datetime('now')`,
    [key, String(value)]
  );
  res.json({ ok: true });
});

router.post("/upload-bg", requirePermission("verwaltung"), bgUpload.single("file"), (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "no_file" });
  const url = `/uploads/bg/${req.file.filename}`;
  res.json({ url });
});

export default router;
