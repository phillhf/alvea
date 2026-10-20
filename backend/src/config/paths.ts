import path from "path";
import fs from "fs";

// Zentrale Pfad-Konfiguration. Alle Datenpfade (DB, Uploads, Logs) kommen aus
// der .env bzw. vom Installer und werden hier EINMAL aufgelöst – relative
// Angaben beziehen sich auf das Arbeitsverzeichnis (backend/).
// Standardwerte gelten für die Entwicklung aus dem Quellcode-Ordner.

/** backend/ – Ordner mit package.json (dist/config → dist → backend) */
export const BACKEND_DIR = path.resolve(__dirname, "../..");

function resolveEnv(value: string | undefined, fallback: string): string {
  return value ? path.resolve(value) : fallback;
}

export const DB_FILE    = resolveEnv(process.env.DB_FILE,    path.join(BACKEND_DIR, "data", "alvea.sqlite"));
export const UPLOAD_DIR = resolveEnv(process.env.UPLOAD_DIR, path.join(BACKEND_DIR, "uploads"));
export const LOG_DIR    = resolveEnv(process.env.LOG_DIR,    path.resolve(BACKEND_DIR, "../logs"));

/** Gebautes Frontend (SPA) */
export const FRONTEND_DIST = path.resolve(BACKEND_DIR, "../frontend/dist");

/** Installierte Programmversion aus backend/package.json */
export const APP_VERSION: string = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(BACKEND_DIR, "package.json"), "utf-8")).version;
  } catch {
    return "0.0.0";
  }
})();
