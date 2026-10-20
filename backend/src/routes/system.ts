import { Router } from "express";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { authRequired, requirePermission } from "../middleware/auth";
import { APP_VERSION, DB_FILE } from "../config/paths";
import { logger } from "../services/logger";
import { audit } from "../services/audit";
import { AuthedRequest } from "../types";

// System-Infos und Update über GitHub-Releases.
// Das eigentliche Update führt update.ps1 aus dem Installationsordner aus –
// gestartet über die Windows-Aufgabe "Alvea Update", die der Installer anlegt
// (läuft als SYSTEM unabhängig vom Dienst, der beim Update gestoppt wird).

const router = Router();
router.use(authRequired);

const UPDATE_REPO = process.env.UPDATE_REPO || "phillhf/alvea";
const INSTALL_DIR = process.env.ALVEA_HOME || "";
const UPDATE_TASK = "Alvea Update";
const STATUS_FILE = path.join(path.dirname(DB_FILE), "update-status.json");
const CACHE_MS    = 60 * 60 * 1000;

type ReleaseInfo = {
  version: string;
  name: string;
  notes: string;
  url: string;
  published_at: string;
};

let cache: { at: number; release: ReleaseInfo } | null = null;

/** Vergleicht "1.2.3" mit "1.10.0" numerisch; Vorabversionen (-beta) zählen als älter */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.replace(/^v/, "").split("-", 2);
    return { nums: core.split(".").map(n => Number(n) || 0), pre: pre ?? "" };
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre > y.pre ? 1 : -1;
}

async function fetchLatestRelease(force: boolean): Promise<ReleaseInfo> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.release;
  const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    headers: { "Accept": "application/vnd.github+json", "User-Agent": `Alvea/${APP_VERSION}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) throw new Error("Noch kein Release veröffentlicht.");
  if (!res.ok) throw new Error(`GitHub antwortet mit Status ${res.status}.`);
  const json: any = await res.json();
  const release: ReleaseInfo = {
    version: String(json.tag_name || "").replace(/^v/, ""),
    name: json.name || json.tag_name,
    notes: json.body || "",
    url: json.html_url,
    published_at: json.published_at,
  };
  cache = { at: Date.now(), release };
  return release;
}

function readStatus(): any {
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, "utf-8").replace(/^﻿/, "")); }
  catch { return null; }
}

/** Kann dieses System sich selbst aktualisieren? (nur bei Installation per Setup) */
function canSelfUpdate(): boolean {
  return process.platform === "win32" && !!INSTALL_DIR && fs.existsSync(path.join(INSTALL_DIR, "update.ps1"));
}

router.get("/version", (_req, res) => {
  res.json({ version: APP_VERSION, repo: UPDATE_REPO });
});

router.get("/update", requirePermission("verwaltung"), async (req, res) => {
  const base = {
    current: APP_VERSION,
    repo: UPDATE_REPO,
    can_self_update: canSelfUpdate(),
    status: readStatus(),
  };
  try {
    const latest = await fetchLatestRelease(req.query.refresh === "1");
    res.json({ ...base, latest, update_available: compareVersions(latest.version, APP_VERSION) > 0 });
  } catch (e: any) {
    res.json({ ...base, latest: null, update_available: false, error: e?.message || String(e) });
  }
});

router.post("/update", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  if (!canSelfUpdate()) {
    return res.status(400).json({ error: "Automatisches Update ist nur bei Installation über das Setup verfügbar." });
  }
  const status = readStatus();
  if (status?.state === "running" && Date.now() - Date.parse(status.updated_at) < 15 * 60 * 1000) {
    return res.status(409).json({ error: "Es läuft bereits ein Update." });
  }
  execFile("schtasks.exe", ["/Run", "/TN", UPDATE_TASK], { windowsHide: true }, (err, _stdout, stderr) => {
    if (err) {
      logger.error("Update konnte nicht gestartet werden", { error: stderr || err.message });
      return res.status(500).json({ error: "Update-Aufgabe konnte nicht gestartet werden.", detail: String(stderr || err.message).trim() });
    }
    audit(req.user?.sub ?? null, "system_update_started", "system", null, { from: APP_VERSION });
    logger.info("Update gestartet", { by: req.user?.email, from: APP_VERSION });
    res.json({ ok: true });
  });
});

export default router;
