import { Router } from "express";
import { query, newId, transaction } from "../config/db";
import { audit } from "../services/audit";
import { authRequired, requirePermission } from "../middleware/auth";
import { AuthedRequest } from "../types";
import { z } from "zod";

const router = Router();
router.use(authRequired);

const perm      = requirePermission("sauerstofftransport", "verwaltung");
const adminPerm = requirePermission("verwaltung");

// ── Lager ─────────────────────────────────────────────────────────────────────

router.get("/lager", perm, (_req, res) => {
  try {
    const { rows } = query<any>(`
      SELECT l.*, h.name AS house_name
      FROM o2_lager l LEFT JOIN houses h ON h.id = l.house_id
      ORDER BY h.name, l.name
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.post("/lager", adminPerm, (req: AuthedRequest, res) => {
  try {
    const s = z.object({ name: z.string().min(1).max(100), house_id: z.string().nullable().optional() }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    const id = newId();
    query(`INSERT INTO o2_lager (id,name,house_id) VALUES ($1,$2,$3)`, [id, s.data.name, s.data.house_id ?? null]);
    res.json({ id });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.patch("/lager/:id", adminPerm, (req, res) => {
  try {
    const s = z.object({ name: z.string().min(1).max(100).optional(), house_id: z.string().nullable().optional() }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    const { id } = req.params;
    const sets: string[] = []; const params: any[] = [];
    if (s.data.name     !== undefined) { sets.push(`name=$${sets.length+1}`);     params.push(s.data.name); }
    if (s.data.house_id !== undefined) { sets.push(`house_id=$${sets.length+1}`); params.push(s.data.house_id); }
    if (sets.length) { params.push(id); query(`UPDATE o2_lager SET ${sets.join(",")} WHERE id=$${params.length}`, params); }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.delete("/lager/:id", adminPerm, (req, res) => {
  try { query(`DELETE FROM o2_lager WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── Flaschentypen ─────────────────────────────────────────────────────────────

router.get("/typen", requirePermission("sauerstofftransport", "stationspersonal", "verwaltung"), (_req, res) => {
  try { res.json(query<any>(`SELECT * FROM o2_flaschentypen ORDER BY name`).rows); }
  catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.post("/typen", adminPerm, (req, res) => {
  try {
    const s = z.object({ name: z.string().min(1).max(100), beschreibung: z.string().optional() }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    const id = newId();
    query(`INSERT INTO o2_flaschentypen (id,name,beschreibung) VALUES ($1,$2,$3)`, [id, s.data.name, s.data.beschreibung ?? null]);
    res.json({ id });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.patch("/typen/:id", adminPerm, (req, res) => {
  try {
    const s = z.object({ name: z.string().min(1).max(100).optional(), beschreibung: z.string().nullable().optional() }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    const { id } = req.params;
    const sets: string[] = []; const params: any[] = [];
    if (s.data.name         !== undefined) { sets.push(`name=$${sets.length+1}`);         params.push(s.data.name); }
    if (s.data.beschreibung !== undefined) { sets.push(`beschreibung=$${sets.length+1}`); params.push(s.data.beschreibung); }
    if (sets.length) { params.push(id); query(`UPDATE o2_flaschentypen SET ${sets.join(",")} WHERE id=$${params.length}`, params); }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.delete("/typen/:id", adminPerm, (req, res) => {
  try { query(`DELETE FROM o2_flaschentypen WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── Flaschen ──────────────────────────────────────────────────────────────────

router.get("/flaschen", perm, (req, res) => {
  try {
    const { lager_id } = req.query as Record<string, string>;
    const params: any[] = [];
    const where = lager_id ? `WHERE f.lager_id=$1` : "";
    if (lager_id) params.push(lager_id);
    const { rows } = query<any>(`
      SELECT f.*, t.name AS typ_name, l.name AS lager_name, h.name AS house_name, s.name AS station_name
      FROM o2_flaschen f
      LEFT JOIN o2_flaschentypen t ON t.id = f.typ_id
      LEFT JOIN o2_lager l         ON l.id = f.lager_id
      LEFT JOIN houses h            ON h.id = l.house_id
      LEFT JOIN areas s             ON s.id = f.station_id
      ${where} ORDER BY f.barcode
    `, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.post("/flaschen", adminPerm, (req, res) => {
  try {
    const s = z.object({ barcode: z.string().min(1).max(100), typ_id: z.string().nullable().optional(), lager_id: z.string().nullable().optional() }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    if (query(`SELECT id FROM o2_flaschen WHERE barcode=$1`, [s.data.barcode]).rows.length)
      return res.status(409).json({ error: "barcode_exists" });
    const id = newId();
    query(`INSERT INTO o2_flaschen (id,barcode,typ_id,lager_id) VALUES ($1,$2,$3,$4)`,
      [id, s.data.barcode, s.data.typ_id ?? null, s.data.lager_id ?? null]);
    res.json({ id });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.patch("/flaschen/:id", adminPerm, (req, res) => {
  try {
    const s = z.object({ barcode: z.string().min(1).max(100).optional(), typ_id: z.string().nullable().optional(), lager_id: z.string().nullable().optional() }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    const { id } = req.params;
    const sets: string[] = []; const params: any[] = [];
    if (s.data.barcode  !== undefined) { sets.push(`barcode=$${sets.length+1}`);  params.push(s.data.barcode); }
    if (s.data.typ_id   !== undefined) { sets.push(`typ_id=$${sets.length+1}`);   params.push(s.data.typ_id); }
    if (s.data.lager_id !== undefined) { sets.push(`lager_id=$${sets.length+1}`); params.push(s.data.lager_id); }
    if (sets.length) { params.push(id); query(`UPDATE o2_flaschen SET ${sets.join(",")} WHERE id=$${params.length}`, params); }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.delete("/flaschen/:id", adminPerm, (req, res) => {
  try { query(`DELETE FROM o2_flaschen WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── Scan ──────────────────────────────────────────────────────────────────────
//
// Modi:
//   wareneingang    – Lieferant bringt Flaschen → volllager (auto-anlegen)
//   tour_starten    – Flasche aus Volllager nehmen → unterwegs
//   leer_einsammeln – Leere Flasche von Station → leer_unterwegs
//   ins_leergutlager– Leere Flasche einlagern → leergutlager
//   warenausgang    – Leere Flasche an Lieferanten → beim_lieferanten

const TRANSITIONEN: Record<string, { von: string[]; nach: string }> = {
  wareneingang:     { von: ["*"],                                           nach: "volllager"        },
  tour_starten:     { von: ["volllager"],                                   nach: "unterwegs"        },
  leer_einsammeln:  { von: ["auf_station"],                                 nach: "leer_unterwegs"   },
  ins_leergutlager: { von: ["leer_unterwegs"],                              nach: "leergutlager"     },
  warenausgang:     { von: ["leergutlager"],                                nach: "beim_lieferanten" },
};

router.post("/scan", perm, (req: AuthedRequest, res) => {
  try {
    const s = z.object({
      barcode:    z.string().min(1),
      modus:      z.enum(["wareneingang","tour_starten","leer_einsammeln","ins_leergutlager","warenausgang"]),
      lager_id:   z.string().optional(),
      typ_id:     z.string().optional(),
      station_id: z.string().optional(), // nur für Dokumentation
      notiz:      z.string().optional(),
    }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });

    const { barcode, modus, lager_id, typ_id, notiz } = s.data;
    const userId = req.user?.sub ?? null;
    let autoCreated = false;

    let flasche = query<any>(`SELECT * FROM o2_flaschen WHERE barcode=$1`, [barcode]).rows[0] as any;

    // Wareneingang: immer anlegen wenn unbekannt, immer → volllager
    if (modus === "wareneingang") {
      if (!flasche) {
        const id2 = newId();
        query(`INSERT INTO o2_flaschen (id,barcode,typ_id,lager_id,status) VALUES ($1,$2,$3,$4,'volllager')`,
          [id2, barcode, typ_id ?? null, lager_id ?? null]);
        flasche = { id: id2, barcode, lager_id: lager_id ?? null, status: "volllager" };
        autoCreated = true;
      }
      const von = flasche.status;
      transaction(() => {
        query(`UPDATE o2_flaschen SET status='volllager', station_id=NULL, lager_id=COALESCE($1,lager_id), updated_at=datetime('now') WHERE id=$2`,
          [lager_id ?? null, flasche.id]);
        query(`INSERT INTO o2_bewegungen (id,flasche_id,aktion,von_status,nach_status,lager_id,user_id,notiz) VALUES ($1,$2,'wareneingang',$3,'volllager',$4,$5,$6)`,
          [newId(), flasche.id, von, flasche.lager_id ?? lager_id ?? null, userId, notiz ?? null]);
      });
      return res.json({ ok: true, barcode, von, nach: "volllager", auto_created: autoCreated });
    }

    // Alle anderen Modi: Flasche muss existieren
    if (!flasche) return res.status(404).json({ error: "flasche_nicht_gefunden", barcode });

    const transition = TRANSITIONEN[modus];
    if (!transition.von.includes("*") && !transition.von.includes(flasche.status)) {
      return res.status(409).json({ error: "ungueltige_aktion", aktueller_status: flasche.status, modus });
    }

    const von = flasche.status;
    const nach = transition.nach;

    transaction(() => {
      query(`UPDATE o2_flaschen SET status=$1, station_id=NULL, updated_at=datetime('now') WHERE id=$2`, [nach, flasche.id]);
      query(`INSERT INTO o2_bewegungen (id,flasche_id,aktion,von_status,nach_status,lager_id,user_id,notiz) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [newId(), flasche.id, modus, von, nach, flasche.lager_id ?? null, userId, notiz ?? null]);
    });
    res.json({ ok: true, barcode, von, nach });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── Barcodes für Autocomplete ─────────────────────────────────────────────────

router.get("/barcodes", perm, (_req, res) => {
  try { res.json(query<any>(`SELECT barcode FROM o2_flaschen ORDER BY barcode`).rows.map((r: any) => r.barcode)); }
  catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── Lagerbestand ──────────────────────────────────────────────────────────────

router.get("/bestand", perm, (_req, res) => {
  try {
    const { rows } = query<any>(`
      SELECT
        f.status,
        t.name AS typ_name,
        l.name AS lager_name,
        h.name AS house_name,
        COUNT(*) AS anzahl
      FROM o2_flaschen f
      LEFT JOIN o2_flaschentypen t ON t.id = f.typ_id
      LEFT JOIN o2_lager l         ON l.id = f.lager_id
      LEFT JOIN houses h            ON h.id = l.house_id
      GROUP BY f.status, f.typ_id, f.lager_id
      ORDER BY h.name, l.name, t.name
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── Anfragen ──────────────────────────────────────────────────────────────────

router.delete("/anfragen/:id/dismiss", requirePermission("stationspersonal", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const userId = req.user?.sub;
    const row = query<any>(`SELECT id, status, created_by FROM o2_anfragen WHERE id=$1`, [req.params.id]).rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    if (row.created_by !== userId) return res.status(403).json({ error: "forbidden" });
    if (row.status !== "geliefert") return res.status(400).json({ error: "not_delivered_yet" });
    query(`DELETE FROM o2_anfragen WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.get("/anfragen/my", requirePermission("stationspersonal", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const userId = req.user?.sub;
    if (!userId) return res.status(401).json({ error: "unauthenticated" });
    const { rows } = query<any>(`
      SELECT a.id, a.anzahl, a.geliefert_anzahl, a.status, a.created_at, t.name AS typ_name
      FROM o2_anfragen a LEFT JOIN o2_flaschentypen t ON t.id = a.typ_id
      WHERE a.created_by=$1 ORDER BY a.created_at DESC LIMIT 50
    `, [userId]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.get("/anfragen", perm, (req, res) => {
  try {
    const nurOffen = req.query.status !== "alle";
    const { rows } = query<any>(`
      SELECT a.*, s.name AS station_name, t.name AS typ_name,
             u.full_name AS erstellt_von, ab.full_name AS angenommen_von
      FROM o2_anfragen a
      LEFT JOIN areas s            ON s.id  = a.station_id
      LEFT JOIN o2_flaschentypen t ON t.id  = a.typ_id
      LEFT JOIN users u            ON u.id  = a.created_by
      LEFT JOIN users ab           ON ab.id = a.angenommen_by
      ${nurOffen ? "WHERE a.status IN ('offen','angenommen')" : ""}
      ORDER BY a.created_at DESC LIMIT 200
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.post("/anfragen", requirePermission("stationspersonal", "verwaltung"), (req: AuthedRequest, res) => {
  try {
    const s = z.object({
      station_id: z.string().min(1),
      typ_id:     z.string().nullable().optional(),
      anzahl:     z.number().int().min(1).max(999),
      notiz:      z.string().max(500).optional(),
    }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input", detail: s.error.issues });
    const id = newId();
    query(`INSERT INTO o2_anfragen (id,station_id,typ_id,anzahl,created_by,notiz) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, s.data.station_id, s.data.typ_id ?? null, s.data.anzahl, req.user?.sub ?? null, s.data.notiz ?? null]);
    res.json({ id });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// Anzahl einer Anfrage anpassen (wenn Lager nicht genug hat)
router.patch("/anfragen/:id/anzahl", perm, (req: AuthedRequest, res) => {
  try {
    const s = z.object({ anzahl: z.number().int().min(1).max(999) }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    query(`UPDATE o2_anfragen SET anzahl=$1, updated_at=datetime('now') WHERE id=$2`, [s.data.anzahl, req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.patch("/anfragen/:id/status", perm, (req: AuthedRequest, res) => {
  try {
    const s = z.object({
      status:   z.enum(["angenommen", "geliefert"]),
      barcodes: z.array(z.string()).optional(),
    }).safeParse(req.body);
    if (!s.success) return res.status(400).json({ error: "invalid_input" });
    const { id } = req.params;
    const userId = req.user?.sub ?? null;

    if (s.data.status === "angenommen") {
      audit(userId, "angenommen", "o2_anfrage", id);
      query(`UPDATE o2_anfragen SET status='angenommen', angenommen_by=$1, updated_at=datetime('now') WHERE id=$2`, [userId, id]);
    } else {
      const anfrage = query<any>(`SELECT station_id FROM o2_anfragen WHERE id=$1`, [id]).rows[0];
      const geliefertAnzahl = s.data.barcodes?.length ?? 0;
      audit(userId, "geliefert", "o2_anfrage", id);
      // Alles atomar: Anfrage + Flaschen-Updates
      transaction(() => {
        query(`UPDATE o2_anfragen SET status='geliefert', geliefert_anzahl=$1, updated_at=datetime('now') WHERE id=$2`,
          [geliefertAnzahl, id]);
        if (anfrage?.station_id && s.data.barcodes?.length) {
          for (const bc of s.data.barcodes!) {
            const fl = query<any>(`SELECT id, lager_id FROM o2_flaschen WHERE barcode=$1 AND status='unterwegs'`, [bc]).rows[0];
            if (fl) {
              query(`UPDATE o2_flaschen SET status='auf_station', station_id=$1, updated_at=datetime('now') WHERE id=$2`,
                [anfrage.station_id, fl.id]);
              query(`INSERT INTO o2_bewegungen (id,flasche_id,aktion,von_status,nach_status,station_id,lager_id,user_id) VALUES ($1,$2,'liefern_station','unterwegs','auf_station',$3,$4,$5)`,
                [newId(), fl.id, anfrage.station_id, fl.lager_id ?? null, userId]);
            }
          }
        }
      });
    }
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── Bewegungshistorie ─────────────────────────────────────────────────────────

router.get("/bewegungen", perm, (req, res) => {
  try {
    const { flasche_id, house_id, von, bis } = req.query as Record<string, string>;
    const params: any[] = []; const wheres: string[] = [];
    if (flasche_id) { wheres.push(`b.flasche_id=$${params.length+1}`);       params.push(flasche_id); }
    if (house_id)   { wheres.push(`fl_lager.house_id=$${params.length+1}`);  params.push(house_id); }
    if (von)        { wheres.push(`date(b.timestamp)>=$${params.length+1}`); params.push(von); }
    if (bis)        { wheres.push(`date(b.timestamp)<=$${params.length+1}`); params.push(bis); }
    const where = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";
    const { rows } = query<any>(`
      SELECT b.*, f.barcode, t.name AS typ_name, s.name AS station_name,
             l.name AS lager_name, h.name AS house_name, u.full_name AS user_name
      FROM o2_bewegungen b
      LEFT JOIN o2_flaschen      f        ON f.id  = b.flasche_id
      LEFT JOIN o2_flaschentypen t        ON t.id  = f.typ_id
      LEFT JOIN areas           s        ON s.id  = b.station_id
      LEFT JOIN o2_lager         l        ON l.id  = b.lager_id
      LEFT JOIN o2_lager         fl_lager ON fl_lager.id = f.lager_id
      LEFT JOIN houses            h        ON h.id  = fl_lager.house_id
      LEFT JOIN users             u        ON u.id  = b.user_id
      ${where} ORDER BY b.timestamp DESC LIMIT 500
    `, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

// ── Berichte ──────────────────────────────────────────────────────────────────

function buildBerichtWhere(aktion: string, req: any) {
  const { house_id, von, bis } = req.query as Record<string, string>;
  const params: any[] = [aktion]; const wheres: string[] = ["b.aktion=$1"];
  if (house_id) { wheres.push(`fl_lager.house_id=$${params.length+1}`); params.push(house_id); }
  if (von)      { wheres.push(`date(b.timestamp)>=$${params.length+1}`); params.push(von); }
  if (bis)      { wheres.push(`date(b.timestamp)<=$${params.length+1}`); params.push(bis); }
  return { wheres, params };
}

router.get("/berichte/lieferungen", perm, (req, res) => {
  try {
    const { wheres, params } = buildBerichtWhere("liefern_station", req);
    const { rows } = query<any>(`
      SELECT s.name AS station_name, t.name AS typ_name, COUNT(*) AS anzahl,
             MIN(date(b.timestamp)) AS erster_tag, MAX(date(b.timestamp)) AS letzter_tag
      FROM o2_bewegungen b
      LEFT JOIN o2_flaschen f        ON f.id = b.flasche_id
      LEFT JOIN o2_flaschentypen t   ON t.id = f.typ_id
      LEFT JOIN areas s              ON s.id = b.station_id
      LEFT JOIN o2_lager fl_lager    ON fl_lager.id = f.lager_id
      WHERE ${wheres.join(" AND ")}
      GROUP BY s.id, t.id ORDER BY s.name, t.name
    `, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.get("/berichte/rueckgaben", perm, (req, res) => {
  try {
    const { wheres, params } = buildBerichtWhere("leer_einsammeln", req);
    const { rows } = query<any>(`
      SELECT s.name AS station_name, t.name AS typ_name, COUNT(*) AS anzahl
      FROM o2_bewegungen b
      LEFT JOIN o2_flaschen f        ON f.id = b.flasche_id
      LEFT JOIN o2_flaschentypen t   ON t.id = f.typ_id
      LEFT JOIN areas s              ON s.id = b.station_id
      LEFT JOIN o2_lager fl_lager    ON fl_lager.id = f.lager_id
      WHERE ${wheres.join(" AND ")}
      GROUP BY s.id, t.id ORDER BY s.name, t.name
    `, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: "db_error" }); }
});

router.get("/berichte/pdf", perm, (req, res) => {
  try {
    const { house_id, von, bis } = req.query as Record<string, string>;
    const vonLabel = von ?? "–";
    const bisLabel = bis ?? "–";

    // Lieferungen holen
    const { wheres: wL, params: pL } = buildBerichtWhere("liefern_station", req);
    const lieferungen = query<any>(`
      SELECT s.name AS station_name, t.name AS typ_name, COUNT(*) AS anzahl,
             MIN(date(b.timestamp)) AS erster_tag, MAX(date(b.timestamp)) AS letzter_tag
      FROM o2_bewegungen b
      LEFT JOIN o2_flaschen f        ON f.id = b.flasche_id
      LEFT JOIN o2_flaschentypen t   ON t.id = f.typ_id
      LEFT JOIN areas s              ON s.id = b.station_id
      LEFT JOIN o2_lager fl_lager    ON fl_lager.id = f.lager_id
      WHERE ${wL.join(" AND ")}
      GROUP BY s.id, t.id ORDER BY s.name, t.name
    `, pL).rows;

    // Rückgaben holen
    const { wheres: wR, params: pR } = buildBerichtWhere("leer_einsammeln", req);
    const rueckgaben = query<any>(`
      SELECT s.name AS station_name, t.name AS typ_name, COUNT(*) AS anzahl
      FROM o2_bewegungen b
      LEFT JOIN o2_flaschen f        ON f.id = b.flasche_id
      LEFT JOIN o2_flaschentypen t   ON t.id = f.typ_id
      LEFT JOIN areas s              ON s.id = b.station_id
      LEFT JOIN o2_lager fl_lager    ON fl_lager.id = f.lager_id
      WHERE ${wR.join(" AND ")}
      GROUP BY s.id, t.id ORDER BY s.name, t.name
    `, pR).rows;

    // PDF generieren
    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="O2-Bericht_${von ?? "alle"}_${bis ?? ""}.pdf"`);
    doc.pipe(res);

    // Titel
    doc.fontSize(18).font("Helvetica-Bold").text("Sauerstofftransport – Bericht");
    doc.fontSize(10).font("Helvetica").fillColor("#555")
      .text(`Zeitraum: ${vonLabel} – ${bisLabel}`)
      .text(`Erstellt: ${new Date().toLocaleDateString("de-DE")}`);
    doc.moveDown(1);

    // Lieferungen
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#000").text("Lieferungen an Stationen");
    doc.moveDown(0.3);
    const colX = [50, 200, 300, 380, 460];
    doc.fontSize(9).font("Helvetica-Bold");
    ["Station", "Flaschentyp", "Anzahl", "Erster Tag", "Letzter Tag"].forEach((h, i) =>
      doc.text(h, colX[i], doc.y, { continued: i < 4 })
    );
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(8);
    if (lieferungen.length === 0) {
      doc.fillColor("#888").text("Keine Lieferungen im Zeitraum.");
    }
    for (const r of lieferungen) {
      const y = doc.y;
      doc.fillColor("#000")
        .text(r.station_name ?? "–", colX[0], y, { width: 140 })
        .text(r.typ_name ?? "–", colX[1], y, { width: 90 })
        .text(String(r.anzahl), colX[2], y, { width: 70 })
        .text(r.erster_tag ?? "–", colX[3], y, { width: 70 })
        .text(r.letzter_tag ?? "–", colX[4], y, { width: 80 });
      doc.moveDown(0.3);
    }

    doc.moveDown(1);

    // Rückgaben
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#000").text("Leere Flaschen von Stationen");
    doc.moveDown(0.3);
    doc.fontSize(9).font("Helvetica-Bold");
    ["Station", "Flaschentyp", "Anzahl"].forEach((h, i) =>
      doc.text(h, colX[i], doc.y, { continued: i < 2 })
    );
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(8);
    if (rueckgaben.length === 0) {
      doc.fillColor("#888").text("Keine Rückgaben im Zeitraum.");
    }
    for (const r of rueckgaben) {
      const y = doc.y;
      doc.fillColor("#000")
        .text(r.station_name ?? "–", colX[0], y, { width: 140 })
        .text(r.typ_name ?? "–", colX[1], y, { width: 90 })
        .text(String(r.anzahl), colX[2], y, { width: 70 });
      doc.moveDown(0.3);
    }

    doc.end();
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: "db_error" });
  }
});

export default router;
