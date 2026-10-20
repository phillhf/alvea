import { Router } from "express";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { query } from "../config/db";
import {
  encryptPassword,
  decryptPassword,
  runBackup,
  scheduleBackup,
} from "../services/backup";

const router = Router();
router.use(authRequired);

const BACKUP_KEYS = [
  "backup_enabled",
  "backup_path",
  "backup_time",
  "backup_username",
  "backup_password",
  "backup_last_run",
  "backup_last_status",
];

function getSetting(key: string): string {
  const row = query(`SELECT value FROM settings WHERE key = $1`, [key]).rows[0] as
    { value: string } | undefined;
  return row?.value ?? "";
}

function setSetting(key: string, value: string) {
  query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=$2, updated_at=datetime('now')`,
    [key, value]
  );
}

// GET /api/backup/settings
router.get("/settings", requirePermission("verwaltung"), (_req: AuthedRequest, res) => {
  try {
    const settings: Record<string, string> = {};
    for (const key of BACKUP_KEYS) {
      settings[key] = getSetting(key);
    }
    // Never expose encrypted password to frontend – send empty string as marker
    settings["backup_password"] = settings["backup_password"] ? "••••••••" : "";
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

// PATCH /api/backup/settings
router.patch("/settings", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  try {
    const { backup_enabled, backup_path, backup_time, backup_username, backup_password } =
      req.body as Record<string, string>;

    if (backup_enabled !== undefined) setSetting("backup_enabled", backup_enabled);
    if (backup_path    !== undefined) setSetting("backup_path",    backup_path);
    if (backup_time    !== undefined) setSetting("backup_time",    backup_time);
    if (backup_username !== undefined) setSetting("backup_username", backup_username);

    // Only update password if a real value is sent (not the placeholder)
    if (backup_password !== undefined && backup_password !== "••••••••") {
      setSetting("backup_password", encryptPassword(backup_password));
    }

    // Reschedule with new settings
    scheduleBackup();

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/backup/run  – manuelles Backup
router.post("/run", requirePermission("verwaltung"), (_req: AuthedRequest, res) => {
  try {
    const result = runBackup();
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message: msg });
  }
});

export default router;
