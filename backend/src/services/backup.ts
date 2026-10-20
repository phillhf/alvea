import crypto from "crypto";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { query } from "../config/db";
import { logger } from "./logger";
import { DB_FILE } from "../config/paths";

const ALGORITHM = "aes-256-gcm";

// ── Crypto ────────────────────────────────────────────────────────────────────

function getKey(): Buffer {
  const secret = process.env.JWT_SECRET || "dev-secret";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptPassword(plaintext: string): string {
  if (!plaintext) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptPassword(stored: string): string {
  if (!stored) return "";
  try {
    const parts = stored.split(":");
    if (parts.length !== 3) return "";
    const [ivHex, tagHex, encHex] = parts;
    const iv      = Buffer.from(ivHex,  "hex");
    const authTag = Buffer.from(tagHex, "hex");
    const enc     = Buffer.from(encHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

// ── Settings helpers ──────────────────────────────────────────────────────────

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

// ── Backup execution ──────────────────────────────────────────────────────────

export function runBackup(): { success: boolean; message: string } {
  const backupPath = getSetting("backup_path");
  const username   = getSetting("backup_username");
  const encPw      = getSetting("backup_password");
  const password   = decryptPassword(encPw);

  if (!backupPath) {
    return { success: false, message: "Kein Backup-Pfad konfiguriert." };
  }

  const resolvedDb = DB_FILE;

  if (!fs.existsSync(resolvedDb)) {
    return { success: false, message: `Datenbankdatei nicht gefunden: ${resolvedDb}` };
  }

  const now = new Date();
  const ts  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}-${String(now.getMinutes()).padStart(2,"0")}`;
  const destFileName = `alvea-${ts}.sqlite`;

  // Network share: mount with net use, copy, unmount
  const isUncPath = backupPath.startsWith("\\\\") || backupPath.startsWith("//");

  try {
    if (isUncPath && username) {
      const cleanPath = backupPath.replace(/\//g, "\\").replace(/\\+$/, "");
      const parts = cleanPath.split("\\").filter(Boolean);
      const shareRoot = `\\\\${parts[0]}\\${parts[1]}`;

      // Mount – wenn das fehlschlägt, wird catch() direkt ausgeführt (mounted bleibt false)
      // Passwort über Umgebungsvariable übergeben statt direkt im Argument
      const env = { ...process.env, NET_USE_PW: password };
      execSync(
        `net use "${shareRoot}" /user:"${username}" "%NET_USE_PW%" /persistent:no`,
        { stdio: "pipe", env, shell: "cmd.exe" }
      );

      // Ab hier ist gemountet – Cleanup in finally garantiert
      try {
        const destPath = backupPath.endsWith("\\") || backupPath.endsWith("/")
          ? `${cleanPath}${destFileName}`
          : `${cleanPath}\\${destFileName}`;
        execSync(`copy /Y "${resolvedDb}" "${destPath}"`, { shell: "cmd.exe", stdio: "pipe" });
      } finally {
        try { execSync(`net use "${shareRoot}" /delete /yes`, { stdio: "pipe" }); } catch { /* ignore */ }
      }
    } else {
      // Lokaler Pfad oder UNC ohne Auth
      const cleanPath = backupPath.replace(/[/\\]+$/, "");
      const destPath  = `${cleanPath}\\${destFileName}`;

      if (!fs.existsSync(cleanPath)) {
        fs.mkdirSync(cleanPath, { recursive: true });
      }
      fs.copyFileSync(resolvedDb, destPath);
    }

    const msg = `Backup erfolgreich: ${destFileName}`;
    logger.info(msg);
    setSetting("backup_last_run", now.toISOString());
    setSetting("backup_last_status", `OK: ${destFileName}`);
    return { success: true, message: msg };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`backup failed: ${msg}`);
    setSetting("backup_last_run", now.toISOString());
    setSetting("backup_last_status", `FEHLER: ${msg.slice(0, 200)}`);
    return { success: false, message: msg };
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

// Lazy-load node-cron so server starts even if package not yet installed
let scheduledTask: { stop: () => void } | null = null;

export function initBackupScheduler() {
  scheduleBackup();
}

export function scheduleBackup() {
  // Stop existing task
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  const enabled = getSetting("backup_enabled") === "true";
  if (!enabled) return;

  const timeStr = getSetting("backup_time") || "02:00";
  const [hh, mm] = timeStr.split(":").map(Number);
  if (isNaN(hh) || isNaN(mm)) return;

  const cronExpr = `${mm} ${hh} * * *`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cron = require("node-cron");
    scheduledTask = cron.schedule(cronExpr, () => {
      logger.info("Automatisches Backup gestartet");
      runBackup();
    });
    logger.info(`Backup-Scheduler aktiv: ${cronExpr}`);
  } catch (e) {
    logger.warn("node-cron nicht verfügbar – Backup-Scheduler deaktiviert");
  }
}
