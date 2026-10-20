// Alvea – Einrichtung nach dem Kopieren der Dateien (wird vom Setup aufgerufen).
//
//   node configure.js --home <Installationsordner> --port <Port>
//                     [--migrate <alter OpenClinic-Ordner>] [--firewall]
//
// 1. Datenordner anlegen
// 2. optional: Datenbank, Uploads und JWT-Secret einer alten Installation übernehmen
// 3. Konfigurationsdatei data\alvea.env anlegen bzw. aktualisieren
// 4. Datenbank migrieren/initialisieren (init-db)
// 5. Windows-Aufgabe "Alvea Update" registrieren (für den Update-Knopf)
// 6. optional: Firewall-Regel für den Port
//
// Exit-Code ≠ 0 → Setup meldet Fehler. Protokoll: data\logs\install.log
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const SERVICE_NAME = "Alvea";
const UPDATE_TASK = "Alvea Update";
const OLD_SERVICES = ["OpenClinic", "Bettenaufbereitung"];

// ── Argumente ────────────────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith("--")) args[a.slice(2)] = true;
  else { args[a.slice(2)] = next; i++; }
}

const home = path.resolve(String(args.home || path.join(__dirname, "..")));
const dataDir = path.join(home, "data");
const logDir = path.join(dataDir, "logs");
const envFile = path.join(dataDir, "alvea.env");
const backendDir = path.join(home, "app", "backend");

fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, "install.log");

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(logFile, line + "\n");
  console.log(line);
}

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf-8", windowsHide: true, ...opts });
  return { code: r.status ?? -1, out: `${r.stdout || ""}${r.stderr || ""}`.trim() };
}

// ── .env lesen/schreiben (Reihenfolge + Kommentare bleiben erhalten) ─────────
function parseEnv(file) {
  const map = {};
  if (!fs.existsSync(file)) return map;
  for (const raw of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) map[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
  }
  return map;
}

function writeEnv(file, values) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf-8").split(/\r?\n/) : [];
  const done = new Set();
  const out = lines.map(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && m[1] in values) { done.add(m[1]); return `${m[1]}=${values[m[1]]}`; }
    return line;
  });
  while (out.length && out[out.length - 1] === "") out.pop();
  for (const [k, v] of Object.entries(values)) if (!done.has(k)) out.push(`${k}=${v}`);
  fs.writeFileSync(file, out.join("\r\n") + "\r\n");
}

// ── Dienste ──────────────────────────────────────────────────────────────────
function serviceExists(name) {
  return run("sc.exe", ["query", name]).code === 0;
}

function stopAndDisableService(name) {
  if (!serviceExists(name)) return;
  log(`Alter Dienst "${name}" gefunden – wird gestoppt und deaktiviert (nicht gelöscht).`);
  run("sc.exe", ["stop", name]);
  for (let i = 0; i < 30; i++) {
    if (/STOPPED/.test(run("sc.exe", ["query", name]).out)) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  run("sc.exe", ["config", name, "start=", "disabled"]);
}

// ── Übernahme einer alten OpenClinic-Installation ────────────────────────────
function copyIfExists(src, dst) {
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, dst);
  return true;
}

function migrateOldInstall(oldRoot, newDbFile, newUploadDir) {
  const oldBackend = path.join(oldRoot, "backend");
  const oldEnv = parseEnv(path.join(oldBackend, ".env"));
  const resolveOld = p => path.resolve(oldBackend, p);

  OLD_SERVICES.forEach(stopAndDisableService);

  // Datenbank finden: laut alter .env, sonst größte *.sqlite in den bekannten Ordnern
  let oldDb = oldEnv.DB_FILE ? resolveOld(oldEnv.DB_FILE) : "";
  if (!oldDb || !fs.existsSync(oldDb)) {
    const candidates = [path.join(oldBackend, "data"), path.join(oldRoot, "data")]
      .filter(d => fs.existsSync(d))
      .flatMap(d => fs.readdirSync(d).filter(f => f.endsWith(".sqlite")).map(f => path.join(d, f)))
      .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
    oldDb = candidates[0] || "";
  }
  if (!oldDb || !fs.existsSync(oldDb)) throw new Error(`Keine Datenbank in ${oldRoot} gefunden.`);

  log(`Übernehme Datenbank: ${oldDb}`);
  fs.copyFileSync(oldDb, newDbFile);
  copyIfExists(oldDb + "-wal", newDbFile + "-wal");
  copyIfExists(oldDb + "-shm", newDbFile + "-shm");

  const uploadCandidates = [
    oldEnv.UPLOAD_DIR ? resolveOld(oldEnv.UPLOAD_DIR) : "",
    path.join(oldBackend, "uploads"),
    path.join(oldRoot, "uploads"),
  ].filter(Boolean);
  for (const dir of [...new Set(uploadCandidates)]) {
    if (fs.existsSync(dir)) {
      log(`Übernehme Uploads: ${dir}`);
      fs.cpSync(dir, newUploadDir, { recursive: true, force: false, errorOnExist: false });
    }
  }

  const secret = oldEnv.JWT_SECRET;
  return secret && secret !== "CHANGE_ME_TO_A_LONG_RANDOM_STRING" ? secret : null;
}

// ── Ablauf ───────────────────────────────────────────────────────────────────
function main() {
  log(`Einrichtung gestartet (home=${home})`);

  const port = Number(args.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Ungültiger Port: ${args.port}`);

  const existing = parseEnv(envFile);
  const dbFile = existing.DB_FILE || path.join(dataDir, "alvea.sqlite");
  const uploadDir = existing.UPLOAD_DIR || path.join(dataDir, "uploads");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, "backups"), { recursive: true });

  let jwtSecret = existing.JWT_SECRET;
  if (args.migrate && typeof args.migrate === "string") {
    if (fs.existsSync(dbFile)) {
      log("Übernahme übersprungen – es existiert bereits eine Alvea-Datenbank.");
    } else {
      jwtSecret = migrateOldInstall(path.resolve(args.migrate), dbFile, uploadDir) || jwtSecret;
    }
  }
  if (!jwtSecret) jwtSecret = crypto.randomBytes(48).toString("hex");

  if (!fs.existsSync(envFile)) {
    fs.writeFileSync(envFile, [
      "# Alvea – Konfiguration (vom Setup angelegt).",
      "# Änderungen werden nach einem Neustart des Dienstes \"Alvea\" wirksam.",
      "",
    ].join("\r\n"));
  }
  writeEnv(envFile, {
    HOST: existing.HOST || "0.0.0.0",
    PORT: String(port),
    NODE_ENV: "production",
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: existing.JWT_EXPIRES_IN || "12h",
    RETENTION_DAYS: existing.RETENTION_DAYS || "90",
    DB_FILE: dbFile,
    UPLOAD_DIR: uploadDir,
    LOG_DIR: existing.LOG_DIR || logDir,
    LOG_LEVEL: existing.LOG_LEVEL || "info",
    ALVEA_HOME: home,
    UPDATE_REPO: existing.UPDATE_REPO || "phillhf/alvea",
  });
  log(`Konfiguration geschrieben: ${envFile} (Port ${port})`);

  // Datenbank migrieren + Grunddaten (nur bei leerer DB)
  const initDb = run(process.execPath, [path.join(backendDir, "dist", "scripts", "init-db.js")], {
    cwd: backendDir,
    env: { ...process.env, DOTENV_CONFIG_PATH: envFile, NODE_ENV: "production" },
    timeout: 5 * 60 * 1000,
  });
  log(`init-db (Exit ${initDb.code}):\n${initDb.out}`);
  if (initDb.code !== 0) throw new Error("Datenbank-Initialisierung fehlgeschlagen.");

  // Windows-Aufgabe für Updates aus der Weboberfläche (läuft als SYSTEM, ohne Trigger)
  const updateScript = path.join(home, "update.ps1").replace(/'/g, "''");
  const ps = [
    `$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "${updateScript}" -Unattended'`,
    `$p = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest`,
    `$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -AllowStartIfOnBatteries`,
    `Register-ScheduledTask -TaskName '${UPDATE_TASK}' -Action $a -Principal $p -Settings $s -Description 'Aktualisiert Alvea ueber GitHub-Releases (gestartet aus der Verwaltung).' -Force | Out-Null`,
  ].join("; ");
  const task = run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps]);
  if (task.code !== 0) log(`WARNUNG: Update-Aufgabe konnte nicht angelegt werden: ${task.out}`);
  else log(`Windows-Aufgabe "${UPDATE_TASK}" registriert.`);

  if (args.firewall) {
    run("netsh.exe", ["advfirewall", "firewall", "delete", "rule", `name=${SERVICE_NAME}`]);
    const fw = run("netsh.exe", ["advfirewall", "firewall", "add", "rule", `name=${SERVICE_NAME}`,
      "dir=in", "action=allow", "protocol=TCP", `localport=${port}`]);
    log(fw.code === 0 ? `Firewall-Regel für Port ${port} angelegt.` : `WARNUNG: Firewall-Regel fehlgeschlagen: ${fw.out}`);
  }

  log("Einrichtung abgeschlossen.");
}

try {
  main();
  process.exit(0);
} catch (e) {
  log(`FEHLER: ${e && e.stack || e}`);
  process.exit(1);
}
