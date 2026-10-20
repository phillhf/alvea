import { Router } from "express";
import { z } from "zod";
import { query, transaction, newId } from "../config/db";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { audit } from "../services/audit";

const router = Router();
router.use(authRequired);

// ============================================================
// GET /templates  – Übersicht mit Item-Zähler + Bett-Typ-Info
// ============================================================
router.get("/", (_req, res) => {
  const { rows } = query(
    `SELECT t.*, bt.name AS bed_type_name,
            (SELECT COUNT(*) FROM checklist_template_items i WHERE i.template_id = t.id) AS item_count
       FROM checklist_templates t
       LEFT JOIN bed_types bt ON bt.id = t.bed_type_id
       ORDER BY t.category, t.cleaning_type, bt.name NULLS FIRST`
  );
  res.json(rows);
});

// ============================================================
// GET /templates/:id  – Detail inkl. Items
// ============================================================
router.get("/:id", (req, res) => {
  const { rows } = query(
    `SELECT t.*, bt.name AS bed_type_name
       FROM checklist_templates t
       LEFT JOIN bed_types bt ON bt.id = t.bed_type_id
      WHERE t.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "not_found" });

  const { rows: items } = query(
    `SELECT id, item_name, sort_order FROM checklist_template_items
       WHERE template_id = $1
       ORDER BY sort_order, item_name`,
    [req.params.id]
  );
  res.json({ ...(rows[0] as any), items });
});

// ============================================================
// POST /templates  – Neue Vorlage anlegen (optional bett-typ-spezifisch)
// ============================================================
const createSchema = z.object({
  category: z.enum(["bed_cleaning", "room_cleaning"]),
  cleaning_type: z.enum(["normal", "infektioes", "standard", "schlussdesinfektion"]),
  bed_type_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  copy_from_id: z.string().uuid().optional(),  // Items aus anderer Vorlage kopieren
});

router.post("/", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const _ps_d = createSchema.safeParse(req.body);
  if (!_ps_d.success) return res.status(400).json({ error: "invalid_input" });
  const d = _ps_d.data;
  const id = newId();

  try {
    transaction((q) => {
      q(
        `INSERT INTO checklist_templates (id,category,cleaning_type,bed_type_id,name)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, d.category, d.cleaning_type, d.bed_type_id ?? null, d.name]
      );
      if (d.copy_from_id) {
        const { rows } = q<{ item_name: string; sort_order: number }>(
          `SELECT item_name, sort_order FROM checklist_template_items
             WHERE template_id = $1 ORDER BY sort_order`,
          [d.copy_from_id]
        );
        rows.forEach((it) => {
          q(
            `INSERT INTO checklist_template_items (id,template_id,item_name,sort_order) VALUES ($1,$2,$3,$4)`,
            [newId(), id, it.item_name, it.sort_order]
          );
        });
      }
    });
  } catch (e: any) {
    if (String(e?.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "duplicate_template" });
    }
    throw e;
  }

  audit(req.user!.sub, "create", "checklist_template", id, d as any);
  res.status(201).json({ id });
});

// ============================================================
// PATCH /templates/:id  – Name/bed_type ändern
// ============================================================
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  bed_type_id: z.string().uuid().nullable().optional(),
});
router.patch("/:id", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const _ps_d = updateSchema.safeParse(req.body);
  if (!_ps_d.success) return res.status(400).json({ error: "invalid_input" });
  const d = _ps_d.data;
  const fields: string[] = [], values: any[] = [];
  if (d.name !== undefined)        { values.push(d.name);        fields.push(`name = $${values.length}`); }
  if (d.bed_type_id !== undefined) { values.push(d.bed_type_id); fields.push(`bed_type_id = $${values.length}`); }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id);
  try {
    const r = query(`UPDATE checklist_templates SET ${fields.join(", ")} WHERE id = $${values.length}`, values);
    if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  } catch (e: any) {
    if (String(e?.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "duplicate_template" });
    }
    throw e;
  }
  audit(req.user!.sub, "update", "checklist_template", req.params.id, d as any);
  res.json({ ok: true });
});

// ============================================================
// DELETE /templates/:id
// ============================================================
router.delete("/:id", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const r = query(`DELETE FROM checklist_templates WHERE id = $1`, [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: "not_found" });
  audit(req.user!.sub, "delete", "checklist_template", req.params.id);
  res.json({ ok: true });
});

// ============================================================
// PUT /templates/:id/items  – komplette Item-Liste ersetzen
// ============================================================
const itemsSchema = z.object({
  items: z.array(z.object({
    item_name: z.string().min(1).max(200),
  })),
});

router.put("/:id/items", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  const _ps_d = itemsSchema.safeParse(req.body);
  if (!_ps_d.success) return res.status(400).json({ error: "invalid_input" });
  const d = _ps_d.data;

  const { rows } = query(`SELECT id FROM checklist_templates WHERE id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });

  transaction((q) => {
    q(`DELETE FROM checklist_template_items WHERE template_id = $1`, [req.params.id]);
    d.items.forEach((it, idx) => {
      q(
        `INSERT INTO checklist_template_items (id,template_id,item_name,sort_order) VALUES ($1,$2,$3,$4)`,
        [newId(), req.params.id, it.item_name.trim(), idx]
      );
    });
  });

  audit(req.user!.sub, "update", "checklist_template", req.params.id, { count: d.items.length });
  res.json({ ok: true, count: d.items.length });
});

export default router;
