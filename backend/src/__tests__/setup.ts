// Läuft vor jeder Testdatei, bevor App und Datenbank geladen werden:
// jede Testdatei bekommt eine eigene, frische SQLite-Datenbank im Temp-Ordner.
import fs from "fs";
import os from "os";
import path from "path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alvea-test-"));
process.env.NODE_ENV   = "test";
process.env.DB_FILE    = path.join(dir, "test.sqlite");
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.LOG_DIR    = path.join(dir, "logs");
process.env.JWT_SECRET = "test-secret-".padEnd(48, "x");
process.env.DOTENV_CONFIG_PATH = path.join(dir, "keine.env"); // backend/.env nicht laden
