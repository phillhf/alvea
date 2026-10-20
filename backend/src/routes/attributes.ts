import { Router } from "express";
import { query, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { z } from "zod";

const router = Router();
router.use(authRequired);

const ENTITY_TYPES = ["bed", "room", "station"] as const;
const FIELD_TYPES  = ["text","number","date","select","multiselect","boolean"] as const;

const defSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  name:        z.string().min(1).max(100),
  field_type:  z.enum(FIELD_TYPES),
  options:     z.array(z.string()).optional(),
  required:    z.boolean().optional().default(false),
  sort_order:  z.number().optional().default(0),
  active:      z.boolean().optional().default(true),
});

// ── Definitionen ──────────────────────────────────────────────

router.get("/definitions", (_req, res) => {
  const { rows } = query(
    `SELECT * FROM attribute_definitions ORDER BY entity_type, sort_order, name`
  );
  res.json(rows.map((r: any) => ({
    ...r,
    options:  r.options  ? JSON.parse(r.options)  : null,
    required: !!r.required,
    active:   !!r.active,
  })));
});

router.post("/definitions", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const d = defSchema.parse(req.body);
  const id = newId();
  query(
    `INSERT INTO attribute_definitions (id,entity_type,name,field_type,options,required,sort_order,active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, d.entity_type, d.name, d.field_type,
     d.options ? JSON.stringify(d.options) : null,
     d.required ? 1 : 0, d.sort_order, d.active ? 1 : 0]
  );
  res.status(201).json({ id });
});

router.patch("/definitions/:id", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const d = defSchema.partial().parse(req.body);
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (d.name        !== undefined) { sets.push(`name=$${i++}`);        params.push(d.name); }
  if (d.field_type  !== undefined) { sets.push(`field_type=$${i++}`);  params.push(d.field_type); }
  if (d.options     !== undefined) { sets.push(`options=$${i++}`);     params.push(d.options ? JSON.stringify(d.options) : null); }
  if (d.required    !== undefined) { sets.push(`required=$${i++}`);    params.push(d.required ? 1 : 0); }
  if (d.sort_order  !== undefined) { sets.push(`sort_order=$${i++}`);  params.push(d.sort_order); }
  if (d.active      !== undefined) { sets.push(`active=$${i++}`);      params.push(d.active ? 1 : 0); }
  if (!sets.length) return res.status(400).json({ error: "nothing_to_update" });
  params.push(req.params.id);
  const { rowCount } = query(`UPDATE attribute_definitions SET ${sets.join(",")} WHERE id=$${i}`, params);
  if (rowCount === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});

router.delete("/definitions/:id", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  query(`DELETE FROM attribute_values WHERE attribute_definition_id=$1`, [req.params.id]);
  const { rowCount } = query(`DELETE FROM attribute_definitions WHERE id=$1`, [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});

// ── Werte ─────────────────────────────────────────────────────

// GET /api/attributes/values/:entityType/:entityId
router.get("/values/:entityType/:entityId", (req, res) => {
  const { entityType, entityId } = req.params;
  const { rows: defs } = query(
    `SELECT * FROM attribute_definitions WHERE entity_type=$1 AND active=1 ORDER BY sort_order, name`,
    [entityType]
  );
  const { rows: vals } = query(
    `SELECT attribute_definition_id, value FROM attribute_values WHERE entity_type=$1 AND entity_id=$2`,
    [entityType, entityId]
  );
  const valMap: Record<string, string> = {};
  vals.forEach((v: any) => { valMap[v.attribute_definition_id] = v.value; });

  res.json(defs.map((d: any) => ({
    definition: {
      ...d,
      options:  d.options ? JSON.parse(d.options) : null,
      required: !!d.required,
    },
    value: valMap[d.id] ?? null,
  })));
});

// PUT /api/attributes/values/:entityType/:entityId
router.put("/values/:entityType/:entityId", requirePermission("auftraege_erstellen", "verwaltung"), (req: AuthedRequest, res) => {
  const { entityType, entityId } = req.params;
  const values: Record<string, string | null> = z.record(z.string().nullable()).parse(req.body);

  for (const [defId, value] of Object.entries(values)) {
    if (value === null || value === "") {
      query(
        `DELETE FROM attribute_values WHERE entity_type=$1 AND entity_id=$2 AND attribute_definition_id=$3`,
        [entityType, entityId, defId]
      );
    } else {
      query(
        `INSERT INTO attribute_values (id,entity_type,entity_id,attribute_definition_id,value)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT(entity_type,entity_id,attribute_definition_id) DO UPDATE SET value=$5`,
        [newId(), entityType, entityId, defId, value]
      );
    }
  }
  res.json({ ok: true });
});
export default router;
