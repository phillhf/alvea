import path from "path";
import fs from "fs";

const LOG_DIR  = process.env.LOG_DIR  || path.resolve(__dirname, "../../../logs");
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");

fs.mkdirSync(LOG_DIR, { recursive: true });

// Pino lazy-laden damit der Import nicht bricht falls Paket noch nicht installiert
let _pino: any = null;

function getPino() {
  if (_pino) return _pino;
  try {
    const pino = require("pino");
    const targets: any[] = [];

    // Konsole (NSSM-Fenster) – in Produktion nur info+, in Dev mit Farben
    const isProd = process.env.NODE_ENV === "production";
    if (!isProd) {
      targets.push({
        target: "pino-pretty",
        level: LOG_LEVEL,
        options: { colorize: true, translateTime: "SYS:dd.mm.yyyy HH:MM:ss", ignore: "pid,hostname" },
      });
    } else {
      targets.push({ target: "pino/file", level: LOG_LEVEL, options: { destination: 1 } });
    }

    // Datei mit täglicher Rotation (pino-roll)
    const logFile = path.join(LOG_DIR, "app.log");
    targets.push({
      target: "pino-roll",
      level: LOG_LEVEL,
      options: {
        file: logFile,
        frequency: "daily",
        limit: { count: 30 },          // max 30 Dateien behalten
        dateFormat: "yyyy-MM-dd",
        mkdir: true,
      },
    });

    _pino = pino.pino(
      { level: LOG_LEVEL, timestamp: pino.stdTimeFunctions.isoTime },
      isProd
        // Produktion: nur in Datei, nicht in Konsole
        ? pino.transport({
            target: "pino-roll",
            options: {
              file: logFile,
              frequency: "daily",
              limit: { count: 30 },
              dateFormat: "yyyy-MM-dd",
              mkdir: true,
            },
          })
        // Entwicklung: Konsole mit Farben
        : pino.transport({
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:dd.mm.yyyy HH:MM:ss", ignore: "pid,hostname" },
          })
    );
  } catch {
    // Fallback: normales console.log bis pino installiert ist
    _pino = {
      info:  (...a: any[]) => console.log("[INFO]",  ...a),
      warn:  (...a: any[]) => console.warn("[WARN]",  ...a),
      error: (...a: any[]) => console.error("[ERROR]", ...a),
      debug: (...a: any[]) => console.debug("[DEBUG]", ...a),
      child: () => _pino,
    };
  }
  return _pino;
}

// ── Export: named child-logger für einzelne Module ───────────────────────────

export const logger = {
  info:  (msg: string, data?: object) => getPino().info(data ?? {}, msg),
  warn:  (msg: string, data?: object) => getPino().warn(data ?? {}, msg),
  error: (msg: string, data?: object) => getPino().error(data ?? {}, msg),
  debug: (msg: string, data?: object) => getPino().debug(data ?? {}, msg),
  child: (bindings: object) => {
    const child = getPino().child(bindings);
    return {
      info:  (msg: string, data?: object) => child.info(data ?? {}, msg),
      warn:  (msg: string, data?: object) => child.warn(data ?? {}, msg),
      error: (msg: string, data?: object) => child.error(data ?? {}, msg),
      debug: (msg: string, data?: object) => child.debug(data ?? {}, msg),
    };
  },
};

// Modul-spezifische Logger
export const dbLogger      = logger.child({ module: "db" });
export const authLogger    = logger.child({ module: "auth" });
export const httpLogger    = logger.child({ module: "http" });
export const migrateLogger = logger.child({ module: "migrate" });
