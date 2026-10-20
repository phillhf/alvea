import "dotenv/config";
import express from "express";
import backupRouter from "./routes/backup";
import { initBackupScheduler } from "./services/backup";
import announcementsRouter from "./routes/announcements";
import importRouter        from "./routes/import";
import o2Router            from "./routes/o2";
import ruecksendungenRouter, { abschlussRouter } from "./routes/ruecksendungen";
import waescheRouter from "./routes/waesche";
import chatRouter from "./routes/chat";
import buildingsRouter from "./routes/buildings";
import { adminRouter as auditLogRouter } from "./routes/auditLog";
import aufbereitungsartenRoutes from "./routes/aufbereitungsarten";
import lockerRouter        from "./routes/lockers";
import roomTypesRouter     from "./routes/roomTypes";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import os from "os";
import { notFound, errorHandler } from "./middleware/error";
import { query, migrate, ensureWaesche } from "./config/db";
import { logger } from "./services/logger";
import { requestLogger } from "./middleware/requestLogger";
import { authRequired } from "./middleware/auth";
import { UPLOAD_DIR, FRONTEND_DIST, LOG_DIR, APP_VERSION } from "./config/paths";
import systemRouter from "./routes/system";

// Migrationen + Modul-Setup vor allen Routes
migrate();
ensureWaesche();
initBackupScheduler();

import authRoutes      from "./routes/auth";
import userRoutes      from "./routes/users";
import rolesRoutes     from "./routes/roles";
import hierarchyRoutes from "./routes/hierarchy";
import taskRoutes      from "./routes/tasks";
import checklistRoutes from "./routes/checklists";
import templateRoutes  from "./routes/templates";
import reportRoutes    from "./routes/reports";
import barcodeRoutes   from "./routes/barcodes";
import teamRoutes      from "./routes/teams";
import settingsRoutes  from "./routes/settings";
import instructionRoutes from "./routes/instructions";
import berufsGruppenRoutes from "./routes/berufsgruppen";
import modulesRoutes    from "./routes/modules";
import attributesRoutes from "./routes/attributes";
import defectsRoutes    from "./routes/defects";
import physicalBedsRoutes from "./routes/physicalBeds";

const app = express();
app.set("trust proxy", 1); // Reverse Proxy / Load Balancer

// ── Security Headers (Helmet) ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"], // Tailwind/Vite inline styles
      imgSrc:     ["'self'", "data:", "blob:"],
      fontSrc:    ["'self'", "data:"],
      connectSrc: ["'self'"],
      mediaSrc:   ["'self'", "blob:"],           // Kamera/Barcode-Scanner
      objectSrc:  ["'none'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS: localhost auf allen Ports + konfigurierter Origin ─────────────────
const allowedOrigin = process.env.CORS_ORIGIN || "";
const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(cors({
  origin: (origin, cb) => {
    // Kein Origin = same-origin request (Browser-Navigation, curl) → erlaubt
    if (!origin) return cb(null, true);
    // Localhost immer erlaubt (lokales Netzwerk-Tool)
    if (localhostPattern.test(origin)) return cb(null, true);
    // Explizit konfigurierter Origin
    if (allowedOrigin && origin === allowedOrigin) return cb(null, true);
    cb(new Error(`CORS: Origin ${origin} nicht erlaubt`));
  },
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(requestLogger);

// ── Rate Limiting ────────────────────────────────────────────────────────────
// Login: max 10 Versuche / 15 Min pro IP → Brute-Force-Schutz
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests" },
});

// API allgemein: max 300 Anfragen / Minute pro IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests" },
});

// Passwortänderung: max 5 Versuche / 15 Min pro IP
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests" },
});

app.use("/api/auth/login",       loginLimiter);
app.use("/api/users/me/password", passwordLimiter);
app.use("/api",                   apiLimiter);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// Uploads: Fotos (Patientendaten) nur mit Auth
app.use("/api/uploads", authRequired, express.static(UPLOAD_DIR));
// Hintergrundbilder: öffentlich (werden per CSS url() geladen, kein Auth-Header möglich)
const bgDir = path.join(UPLOAD_DIR, "bg");
app.use("/uploads/bg", express.static(bgDir));
// Alle anderen /uploads: mit Auth
app.use("/uploads", authRequired, express.static(UPLOAD_DIR));

// ── Öffentlicher Theme-Endpoint (kein Login nötig) ──────────────────────────
app.get("/api/theme", (_req, res) => {
  const { query } = require("./config/db");
  const { rows } = query(
    `SELECT key, value FROM settings WHERE key IN ('theme_config','login_theme_config')`
  );
  const out: Record<string, any> = {};
  for (const r of rows as any[]) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  res.json(out);
});

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "alvea", version: APP_VERSION, ts: new Date().toISOString() })
);
app.use("/api/auth",       authRoutes);
app.use("/api/users",      userRoutes);
app.use("/api/roles",      rolesRoutes);
app.use("/api",            hierarchyRoutes);     // /houses /areas /stations /rooms /beds /pathogens
app.use("/api/tasks",      taskRoutes);
app.use("/api/checklists", checklistRoutes);
app.use("/api/templates",  templateRoutes);
app.use("/api/reports",      reportRoutes);
app.use("/api/barcodes",     barcodeRoutes);
app.use("/api/teams",        teamRoutes);
app.use("/api/settings",     settingsRoutes);
app.use("/api/instructions",        instructionRoutes);
app.use("/api/aufbereitungsarten",  aufbereitungsartenRoutes);
app.use("/api/berufsgruppen",       berufsGruppenRoutes);
app.use("/api/modules",             modulesRoutes);
app.use("/api/attributes",          attributesRoutes);
app.use("/api/defects",             defectsRoutes);
app.use("/api/physical-beds",       physicalBedsRoutes);
app.use("/api/backup",           backupRouter);
app.use("/api/o2",               o2Router);
app.use("/api/ruecksendungen",          ruecksendungenRouter);
app.use("/api/ruecksendung-abschluesse", abschlussRouter);
app.use("/api/waesche",                waescheRouter);
app.use("/api/chat",                   chatRouter);
app.use("/api/buildings",              buildingsRouter);
app.use("/api/audit-log",              auditLogRouter);
app.use("/api/announcements",    announcementsRouter);
app.use("/api/import",             importRouter);
app.use("/api/lockers",            lockerRouter);
app.use("/api/room-types",         roomTypesRouter);
app.use("/api/system",             systemRouter);

// ---------- SPA ----------
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
  logger.info("Frontend bereit", { path: FRONTEND_DIST });
} else {
  logger.warn(`Frontend-Build nicht gefunden: ${FRONTEND_DIST}`);
}

app.use("/api", notFound);
app.use(errorHandler);

// Retention
function pruneOld() {
  const days = Number(process.env.RETENTION_DAYS || 90);
  try {
    query(`DELETE FROM audit_log WHERE created_at < datetime('now', $1)`, [`-${days} days`]);
    query(
      `DELETE FROM tasks WHERE created_at < datetime('now', $1)
         AND status = 'abgeschlossen'`,
      [`-${days} days`]
    );
    query(`DELETE FROM chat_messages WHERE created_at < datetime('now', $1)`, [`-${days} days`]);
  } catch (e: any) { logger.warn("Retention-Job fehlgeschlagen", { error: e.message }); }
}

const PORT = Number(process.env.PORT || 37843);
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  const addrs = getLanAddresses();

  // Lesbarer Startbanner in der Konsole (Breite dynamisch berechnet)
  const bannerText = `Alvea ${APP_VERSION}  ·  läuft`;
  const innerWidth = bannerText.length + 4; // 2 Leerzeichen Rand links + rechts
  const pad = Math.floor((innerWidth - bannerText.length) / 2);
  const bannerLine = " ".repeat(pad) + bannerText + " ".repeat(innerWidth - bannerText.length - pad);
  console.log("");
  console.log("  ╔" + "═".repeat(innerWidth) + "╗");
  console.log("  ║" + bannerLine + "║");
  console.log("  ╚" + "═".repeat(innerWidth) + "╝");
  console.log("");
  console.log(`   Lokal:  http://localhost:${PORT}`);
  addrs.forEach(ip => console.log(`   LAN:    http://${ip}:${PORT}`));
  console.log("");
  console.log(`   Logs:   ${path.join(LOG_DIR, "app.log")}`);
  console.log("");

  // In die Log-Datei schreiben (JSON, nur Datei)
  logger.info("Server gestartet", { port: PORT, addresses: addrs });

  pruneOld();
  setInterval(pruneOld, 24 * 60 * 60 * 1000);
});

function getLanAddresses(): string[] {
  const out: string[] = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === "IPv4" && !n.internal) out.push(n.address);
    }
  }
  return out;
}

export default app;
