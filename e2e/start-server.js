// Startet den gebauten Alvea-Server (backend/dist) mit einer frischen, leeren
// Testdatenbank. Wird von Playwright (webServer) gestartet und beendet.
// Voraussetzung: `npm run build` in backend/ und frontend/.
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const server = path.join(root, "backend", "dist", "server.js");
const frontend = path.join(root, "frontend", "dist", "index.html");
for (const f of [server, frontend]) {
  if (!fs.existsSync(f)) {
    console.error(`Fehlt: ${f} – bitte zuerst backend und frontend bauen (npm run build).`);
    process.exit(1);
  }
}

const tmp = path.join(__dirname, ".tmp");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const child = spawn(process.execPath, [server], {
  cwd: path.join(root, "backend"),
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: process.env.E2E_PORT || "38790",
    HOST: "127.0.0.1",
    JWT_SECRET: "e2e-secret-".padEnd(48, "x"),
    DB_FILE: path.join(tmp, "e2e.sqlite"),
    UPLOAD_DIR: path.join(tmp, "uploads"),
    LOG_DIR: path.join(tmp, "logs"),
    DOTENV_CONFIG_PATH: path.join(tmp, "keine.env"),
  },
});

const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", stop);
child.on("exit", code => process.exit(code ?? 0));
