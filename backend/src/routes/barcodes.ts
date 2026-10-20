import { Router } from "express";
import multer from "multer";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";

const router = Router();
router.use(authRequired);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/barcodes?q=...  – liest aus physical_beds (Bettenstamm)
router.get("/", (req: AuthedRequest, res) => {
  const q = (req.query.q as string)?.trim() ?? "";
  const { rows } = query(
    q
      ? `SELECT barcode AS code,
               TRIM(COALESCE(hersteller,'') || CASE WHEN modell IS NOT NULL THEN ' ' || modell ELSE '' END) AS description
         FROM physical_beds
         WHERE barcode LIKE $1 OR hersteller LIKE $1 OR modell LIKE $1 OR seriennummer LIKE $1
         ORDER BY barcode LIMIT 200`
      : `SELECT barcode AS code,
               TRIM(COALESCE(hersteller,'') || CASE WHEN modell IS NOT NULL THEN ' ' || modell ELSE '' END) AS description
         FROM physical_beds ORDER BY barcode LIMIT 500`,
    q ? [`%${q}%`] : []
  );
  res.json(rows);
});

// POST /api/barcodes  { code, description }
router.post("/", requirePermission("bettenstamm", "verwaltung"), (req: AuthedRequest, res) => {
  if (!req.user!.permissions.includes("verwaltung")) return res.status(403).json({ error: "forbidden" });
  const { code, description } = req.body;
  if (!code?.trim()) return res.status(400).json({ error: "code_required" });
  try {
    query(`INSERT INTO barcodes (code, description) VALUES ($1, $2)`, [code.trim(), description?.trim() ?? null]);
    res.status(201).json({ code: code.trim(), description: description?.trim() ?? null });
  } catch (e: any) {
    if (e.message?.includes("UNIQUE")) return res.status(409).json({ error: "duplicate_code" });
    throw e;
  }
});

// DELETE /api/barcodes/:code
router.delete("/:code", (req: AuthedRequest, res) => {
  if (!req.user!.permissions.includes("verwaltung")) return res.status(403).json({ error: "forbidden" });
  query(`UPDATE beds SET barcode = NULL WHERE barcode = $1`, [req.params.code]);
  query(`DELETE FROM barcodes WHERE code = $1`, [req.params.code]);
  res.json({ ok: true });
});

// POST /api/barcodes/import  — XLS/CSV Upload
router.post("/import", requirePermission("bettenstamm", "verwaltung"), upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.user!.permissions.includes("verwaltung")) return res.status(403).json({ error: "forbidden" });
  if (!req.file) return res.status(400).json({ error: "no_file" });

  let rows: Array<{ code: string; description?: string }> = [];

  try {
    const ext = req.file.originalname.split(".").pop()?.toLowerCase();
    if (ext === "csv") {
      // CSV: erste Zeile = Header (Code, Beschreibung)
      const text = req.file.buffer.toString("utf-8");
      const lines = text.split(/\r?\n/).filter(Boolean);
      const header = lines[0].split(/[;,]/).map((h: string) => h.trim().toLowerCase());
      const codeIdx = header.findIndex((h: string) => h.includes("code") || h.includes("strichcode") || h === "0");
      const descIdx = header.findIndex((h: string) => h.includes("beschreibung") || h.includes("description") || h.includes("name"));
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(/[;,]/);
        const code = cells[codeIdx]?.trim().replace(/^"|"$/g, "");
        if (code) rows.push({ code, description: descIdx >= 0 ? cells[descIdx]?.trim().replace(/^"|"$/g, "") : undefined });
      }
    } else {
      // XLS/XLSX via exceljs (MIT-lizenziert, keine bekannten CVEs)
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ab = req.file.buffer.buffer.slice(
        req.file.buffer.byteOffset,
        req.file.buffer.byteOffset + req.file.buffer.byteLength
      ) as ArrayBuffer;
      await wb.xlsx.load(ab);
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("Keine Tabelle gefunden");

      // Erste Zeile als Header lesen
      const headerRow = ws.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell((cell) => headers.push(String(cell.value ?? "").toLowerCase()));

      const codeIdx  = headers.findIndex(h => h.includes("code") || h.includes("strichcode"));
      const descIdx  = headers.findIndex(h => h.includes("beschreibung") || h.includes("description") || h.includes("name"));

      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Header überspringen
        const code = String(row.getCell(codeIdx >= 0 ? codeIdx + 1 : 1).value ?? "").trim();
        const desc = descIdx >= 0 ? String(row.getCell(descIdx + 1).value ?? "").trim() || undefined : undefined;
        if (code && code !== "undefined") rows.push({ code, description: desc });
      });
    }
  } catch (e: any) {
    return res.status(400).json({ error: "parse_failed", detail: e.message });
  }

  let inserted = 0, skipped = 0;
  for (const { code, description } of rows) {
    try {
      query(`INSERT OR IGNORE INTO barcodes (code, description) VALUES ($1, $2)`, [code, description ?? null]);
      inserted++;
    } catch { skipped++; }
  }
  res.json({ inserted, skipped, total: rows.length });
});

export default router;
