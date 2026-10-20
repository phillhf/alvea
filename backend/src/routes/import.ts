import { Router } from "express";
import { z } from "zod";
import { authRequired, requirePermission } from "../middleware/auth";
import { query, newId, db } from "../config/db";
import { AuthedRequest } from "../types";
import { audit } from "../services/audit";
import multer from "multer";
import ExcelJS from "exceljs";

const router = Router();
router.use(authRequired);
router.use(requirePermission("raumbuch", "verwaltung"));

// Excel-Datei in Memory parsen (kein Disk-Speicher)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/import/parse-excel
router.post("/parse-excel", upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "no_file" });
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer as any);

    // Blatt mit den meisten Spalten wählen (nicht immer das erste – könnte Pivot/Übersicht sein)
    let ws = wb.worksheets[0];
    let maxCols = 0;
    for (const sheet of wb.worksheets) {
      const firstRow = sheet.getRow(1);
      const colCount = (firstRow.values as ExcelJS.CellValue[]).filter(v => v !== null && v !== undefined && v !== "").length;
      if (colCount > maxCols) {
        maxCols = colCount;
        ws = sheet;
      }
    }
    if (!ws) return res.status(400).json({ error: "no_sheet" });

    const rows: string[][] = [];
    ws.eachRow((row) => {
      const vals = row.values as ExcelJS.CellValue[];
      rows.push(vals.slice(1).map((v) => {
        if (v === null || v === undefined) return "";
        if (typeof v === "object" && v !== null && "text" in v) return String((v as any).text);
        return String(v);
      }));
    });

    if (rows.length < 2) return res.status(400).json({ error: "too_few_rows" });

    const headers = rows[0].map(h => h.trim()).filter(Boolean);
    const data = rows.slice(1)
      .map(row => Object.fromEntries(headers.map((h, i) => [h, (row[i] ?? "").trim()])))
      .filter(r => Object.values(r).some(v => v));

    res.json({ headers, rows: data, total: data.length });
  } catch (e: any) {
    res.status(400).json({ error: "parse_failed", message: e.message });
  }
});

// Kernfelder (immer vorhanden)
const CORE_FIELDS = [
  { key: "haus",            label: "Haus",            entity: "house",    required: true,  custom: false },
  { key: "gebaeude",        label: "Gebäude",         entity: "building", required: false, custom: false },
  { key: "bereich",         label: "Bereich",         entity: "area",     required: true,  custom: false },
  { key: "raum",            label: "Raumnummer",      entity: "room",     required: true,  custom: false },
  { key: "raumbezeichnung", label: "Raumbezeichnung", entity: "room",     required: false, custom: false },
  { key: "etage",           label: "Etage",           entity: "room",     required: false, custom: false },
  { key: "flaeche",         label: "Fläche (m²)",     entity: "room",     required: false, custom: false },
  { key: "stellplatz",        label: "Stellplatz-Nr.",    entity: "bed",      required: false, custom: false },
  { key: "stellplatz_typ",    label: "Stellplatz-Typ",    entity: "bed",      required: false, custom: false },
  { key: "stellplatz_anzahl", label: "Anzahl Stellplätze",entity: "bed",      required: false, custom: false },
];

// GET /api/import/raumbuch/fields
router.get("/raumbuch/fields", (_req, res) => {
  const { rows: attrs } = query<any>(
    `SELECT id, entity_type, name, field_type, options, required
       FROM attribute_definitions
      WHERE active = 1 AND entity_type IN ('room','bed')
      ORDER BY entity_type, sort_order, name`
  );

  const customFields = attrs.map((a: any) => ({
    key:      `attr_${a.id}`,
    label:    `${a.name} (${entityLabel(a.entity_type)})`,
    entity:   a.entity_type,
    required: !!a.required,
    custom:   true,
    field_type: a.field_type,
    options:  a.options ? JSON.parse(a.options) : null,
    attr_id:  a.id,
  }));

  res.json([...CORE_FIELDS, ...customFields]);
});

function entityLabel(e: string) {
  return e === "room" ? "Zimmer" : e === "building" ? "Gebäude" : e === "house" ? "Haus" : e === "area" ? "Bereich" : "Stellplatz";
}

const rowSchema = z.record(z.string(), z.string().optional());
const importSchema = z.object({
  mapping: z.record(z.string(), z.string()),
  rows:    z.array(rowSchema),
});

// POST /api/import/raumbuch/preview
router.post("/raumbuch/preview", (req: AuthedRequest, res) => {
  const { mapping, rows } = importSchema.parse(req.body);
  const preview = rows.slice(0, 10).map(row => applyMapping(row, mapping));
  const errors  = validateRows(preview);
  res.json({ preview, errors, total: rows.length });
});

// POST /api/import/raumbuch
router.post("/raumbuch", (req: AuthedRequest, res) => {
  try {
    const { mapping, rows } = importSchema.parse(req.body);
    const mapped  = rows.map(r => applyMapping(r, mapping));

    // Custom-Attribut-Definitionen vorab laden
    const attrKeys = Object.values(mapping).filter(v => v.startsWith("attr_"));
    const attrDefs = new Map<string, any>();
    for (const key of attrKeys) {
      const attrId = key.replace("attr_", "");
      const { rows: defs } = query<any>(`SELECT * FROM attribute_definitions WHERE id=$1`, [attrId]);
      if (defs[0]) attrDefs.set(key, defs[0]);
    }

    const stats = { houses: 0, areas: 0, rooms: 0, beds: 0, attributes: 0, skipped: 0 };

    // Alles in einer SQLite-Transaktion – massiv schneller bei vielen Zeilen
    const runImport = db.transaction(() => {
      for (const row of mapped) {
        // Pflichtfelder fehlen → Zeile überspringen
        if (!row.haus || !row.bereich || !row.raum) { stats.skipped++; continue; }
        try {
          const house    = findOrCreate("houses",    { name: row.haus }, stats, "houses");
          const building = row.gebaeude
            ? findOrCreate("buildings", { name: row.gebaeude, house_id: house.id }, stats, "buildings")
            : null;
          const area = findOrCreate("areas", {
            name: row.bereich,
            house_id: house.id,
            ...(building ? { building_id: building.id } : {}),
          }, stats, "areas");

          const roomExtra: any = {};
          if (row.raumbezeichnung) roomExtra.raumbezeichnung = row.raumbezeichnung;
          if (row.etage)           roomExtra.etage           = row.etage;
          if (row.flaeche)         roomExtra.flaeche         = parseFloat(row.flaeche) || undefined;
          const room = findOrCreate("rooms",
            { room_number: row.raum, area_id: area.id },
            stats, "rooms",
            roomExtra
          );

          saveAttrs(attrDefs, row, "room", room.id, stats);

          if (row.stellplatz) {
            let bed_type_id: string | null = null;
            if (row.stellplatz_typ) {
              const { rows: bt } = query<{ id: string }>(
                `SELECT id FROM bed_types WHERE LOWER(name)=LOWER($1) LIMIT 1`, [row.stellplatz_typ]
              );
              bed_type_id = bt[0]?.id ?? null;
            }
            const bed = findOrCreate("beds",
              { bed_number: row.stellplatz, room_id: room.id },
              stats, "beds",
              bed_type_id ? { bed_type_id } : {}
            );
            saveAttrs(attrDefs, row, "bed", bed.id, stats);
          } else if (row.stellplatz_anzahl) {
            // Anzahl Stellplätze: automatisch N Betten anlegen (1, 2, 3, …)
            const count = parseInt(row.stellplatz_anzahl) || 0;
            let bed_type_id: string | null = null;
            if (row.stellplatz_typ) {
              const { rows: bt } = query<{ id: string }>(
                `SELECT id FROM bed_types WHERE LOWER(name)=LOWER($1) LIMIT 1`, [row.stellplatz_typ]
              );
              bed_type_id = bt[0]?.id ?? null;
            }
            for (let i = 1; i <= count; i++) {
              const bed = findOrCreate("beds",
                { bed_number: String(i), room_id: room.id },
                stats, "beds",
                bed_type_id ? { bed_type_id } : {}
              );
              saveAttrs(attrDefs, row, "bed", bed.id, stats);
            }
          }
        } catch (e: any) {
          stats.skipped++;
          console.warn("[import] Zeile übersprungen:", e.message);
        }
      }
    });

    runImport();
    audit(req.user!.sub, "import", "raumbuch", "bulk", stats);
    res.json({ ok: true, stats });
  } catch (e: any) {
    console.error("[import] Fehler:", e.message);
    res.status(500).json({ error: "import_failed", message: e.message });
  }
});

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function applyMapping(row: Record<string, string | undefined>, mapping: Record<string, string>) {
  const result: Record<string, string> = {};
  for (const [excelCol, dbField] of Object.entries(mapping)) {
    const val = (row[excelCol] ?? "").trim();
    if (val) result[dbField] = val;
  }
  return result;
}

function validateRows(rows: Record<string, string>[]) {
  const errors: any[] = [];
  const required = CORE_FIELDS.filter(f => f.required).map(f => f.key);
  rows.forEach((row, i) => {
    for (const field of required) {
      if (!row[field])
        errors.push({ row: i + 1, field, message: `Pflichtfeld fehlt: ${field}`, severity: "error" });
    }
  });
  return errors;
}

function saveAttrs(
  attrDefs: Map<string, any>,
  row: Record<string, string>,
  entityType: string,
  entityId: string,
  stats: any
) {
  for (const [key, def] of attrDefs.entries()) {
    if (def.entity_type !== entityType) continue;
    const val = row[key];
    if (!val) continue;
    const id = newId();
    query(
      `INSERT INTO attribute_values (id, entity_type, entity_id, attribute_definition_id, value)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT(entity_type,entity_id,attribute_definition_id) DO UPDATE SET value=$5`,
      [id, entityType, entityId, def.id, val]
    );
    stats.attributes++;
  }
}

type TableName = "houses" | "buildings" | "areas" | "rooms" | "beds";

function findOrCreate(
  table: TableName,
  uniqueFields: Record<string, string>,
  stats: Record<string, number>,
  statKey: string,
  extraFields: Record<string, any> = {}
): { id: string } {
  const entries = Object.entries(uniqueFields);
  const where   = entries.map(([k], i) => `${k} = $${i + 1}`).join(" AND ");
  const values  = entries.map(e => e[1]);
  const { rows } = query<{ id: string }>(`SELECT id FROM ${table} WHERE ${where}`, values);
  if (rows.length > 0) return rows[0];
  const id = newId();
  const all = { id, ...uniqueFields, ...extraFields };
  const cols = Object.keys(all).join(", ");
  const phs  = Object.keys(all).map((_, i) => `$${i + 1}`).join(", ");
  query(`INSERT INTO ${table} (${cols}) VALUES (${phs})`, Object.values(all));
  stats[statKey]++;
  return { id };
}

export default router;
