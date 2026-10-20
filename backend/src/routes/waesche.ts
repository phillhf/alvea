import { Router } from "express";
import { query, newId } from "../config/db";
import { audit } from "../services/audit";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { z } from "zod";

const router = Router();
router.use(authRequired);

// ── Wäschetypen ──────────────────────────────────────────────────────────────

router.get("/typen", requirePermission("waesche", "verwaltung", "stationspersonal", "bettenaufbereitung_zentral"), (_req, res) => {
  try {
    const { rows } = query<any>(`SELECT * FROM waesche_typen WHERE aktiv=1 ORDER BY sort_order, name`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.get("/typen/alle", requirePermission("verwaltung"), (_req, res) => {
  try {
    const { rows } = query<any>(`SELECT * FROM waesche_typen ORDER BY sort_order, name`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.post("/typen", requirePermission("verwaltung"), (req: AuthedRequest, res) => {
  try {
    const s = z.object({ name: z.string().min(1).max(200), sort_order: z.number().int().optional() }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    const id = newId();
    const maxOrder = (query<any>(`SELECT COALESCE(MAX(sort_order),0) as m FROM waesche_typen`).rows[0] as any)?.m ?? 0;
    query(`INSERT INTO waesche_typen (id, name, sort_order) VALUES ($1,$2,$3)`,
      [id, s.data.name, s.data.sort_order ?? maxOrder + 1]);
    res.json({ id });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.patch("/typen/:id", requirePermission("verwaltung"), (req, res) => {
  try {
    const s = z.object({
      name:       z.string().min(1).max(200).optional(),
      aktiv:      z.boolean().optional(),
      sort_order: z.number().int().optional(),
    }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    const sets: string[] = []; const params: any[] = [];
    if (s.data.name       !== undefined) { sets.push(`name=$${sets.length+1}`);       params.push(s.data.name); }
    if (s.data.aktiv      !== undefined) { sets.push(`aktiv=$${sets.length+1}`);      params.push(s.data.aktiv ? 1 : 0); }
    if (s.data.sort_order !== undefined) { sets.push(`sort_order=$${sets.length+1}`); params.push(s.data.sort_order); }
    if (sets.length) { params.push(req.params.id); query(`UPDATE waesche_typen SET ${sets.join(",")} WHERE id=$${params.length}`, params); }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.delete("/typen/:id", requirePermission("verwaltung"), (req, res) => {
  try {
    query(`UPDATE waesche_typen SET aktiv=0 WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── Anfragen ─────────────────────────────────────────────────────────────────

// GET alle – Bettenzentrale/Verwaltung sieht alle, stationspersonal nur eigene
router.get("/anfragen", requirePermission("waesche", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const isZentral = req.user!.permissions.some(p => p === "bettenaufbereitung_zentral" || p === "verwaltung");
    const userId = req.user?.sub ?? null;
    const { status } = req.query as Record<string, string>;

    const wheres: string[] = [];
    const params: any[] = [];

    if (!isZentral) {
      wheres.push(`a.created_by=$${params.length + 1}`);
      params.push(userId);
    }
    if (status && status !== "alle") {
      wheres.push(`a.status=$${params.length + 1}`);
      params.push(status);
    }

    const where = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";
    const { rows } = query<any>(`
      SELECT a.*, u.full_name AS erstellt_von_name, b.full_name AS bearbeitet_von_name
      FROM waesche_anfragen a
      LEFT JOIN users u ON u.id = a.created_by
      LEFT JOIN users b ON b.id = a.bearbeitet_by
      ${where}
      ORDER BY a.created_at DESC
      LIMIT 200
    `, params);

    // Artikel pro Anfrage laden
    const ids = rows.map((r: any) => r.id);
    if (ids.length === 0) return res.json([]);

    const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(",");
    const { rows: artikel } = query<any>(`
      SELECT aa.*, wt.name AS typ_name
      FROM waesche_anfrage_artikel aa
      LEFT JOIN waesche_typen wt ON wt.id = aa.typ_id
      WHERE aa.anfrage_id IN (${placeholders})
      ORDER BY aa.anfrage_id, wt.sort_order
    `, ids);

    const artikelByAnfrage = artikel.reduce((acc: any, ar: any) => {
      if (!acc[ar.anfrage_id]) acc[ar.anfrage_id] = [];
      acc[ar.anfrage_id].push(ar);
      return acc;
    }, {} as Record<string, any[]>);

    const result = rows.map((r: any) => ({ ...r, artikel: artikelByAnfrage[r.id] ?? [] }));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// POST – neue Anfrage (stationspersonal + waesche)
router.post("/anfragen", requirePermission("waesche", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const s = z.object({
      station_id:   z.string().optional(),
      station_name: z.string().optional(),
      notiz:        z.string().max(500).optional(),
      artikel: z.array(z.object({
        typ_id: z.string().min(1),
        anzahl: z.number().int().min(1),
      })).min(1),
    }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input", detail: s.error.issues });

    const id = newId();
    query(
      `INSERT INTO waesche_anfragen (id, station_id, station_name, notiz, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, s.data.station_id, s.data.station_name ?? null, s.data.notiz ?? null, req.user?.sub ?? null]
    );

    for (const art of s.data.artikel) {
      query(
        `INSERT INTO waesche_anfrage_artikel (id, anfrage_id, typ_id, anzahl) VALUES ($1,$2,$3,$4)`,
        [newId(), id, art.typ_id, art.anzahl]
      );
    }

    audit(req.user?.sub ?? null, "create", "waesche_anfrage", id, { station: s.data.station_name, artikel: s.data.artikel.length });
    res.json({ id });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// PATCH /:id/status – Status ändern + optionale Mengenanpassung pro Artikel
router.patch("/anfragen/:id/status", requirePermission("bettenaufbereitung_zentral", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const s = z.object({
      status: z.enum(["angenommen", "erledigt"]),
      artikel: z.array(z.object({
        id: z.string(),
        geliefert_anzahl: z.number().int().min(0),
      })).optional(),
    }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });

    const userId = req.user?.sub ?? null;
    query(
      `UPDATE waesche_anfragen SET status=$1, bearbeitet_by=$2, updated_at=datetime('now') WHERE id=$3`,
      [s.data.status, userId, req.params.id]
    );

    if (s.data.artikel) {
      for (const art of s.data.artikel) {
        query(`UPDATE waesche_anfrage_artikel SET geliefert_anzahl=$1 WHERE id=$2`, [art.geliefert_anzahl, art.id]);
      }
    }

    audit(req.user?.sub ?? null, s.data.status, "waesche_anfrage", req.params.id, {});
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// DELETE /dismiss – erledigte Anfrage für Ersteller ausblenden
router.delete("/anfragen/:id/dismiss", requirePermission("waesche", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const userId = req.user?.sub;
    const row = query<any>(`SELECT id, status, created_by FROM waesche_anfragen WHERE id=$1`, [req.params.id]).rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    if (row.created_by !== userId && !req.user?.permissions.includes("verwaltung"))
      return res.status(403).json({ error: "forbidden" });
    if (row.status !== "erledigt") return res.status(400).json({ error: "not_finished_yet" });
    query(`DELETE FROM waesche_anfragen WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// DELETE – löschen (verwaltung only)
router.delete("/anfragen/:id", requirePermission("verwaltung"), (req, res) => {
  try { query(`DELETE FROM waesche_anfragen WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

export default router;
