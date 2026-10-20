import { query } from "../config/db";

// Spalten laut init.sql: id INTEGER AUTOINCREMENT, user_id, action, entity, entity_id, meta, created_at
export function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  meta: Record<string, unknown> = {}
) {
  try {
    query(
      `INSERT INTO audit_log (user_id, action, entity, entity_id, meta)
       VALUES ($1,$2,$3,$4,$5)`,
      [userId, action, entity, entityId, JSON.stringify(meta)]
    );
  } catch (e) {
    console.warn("[audit] insert failed:", e);
  }
}
