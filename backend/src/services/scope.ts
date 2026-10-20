import { query } from "../config/db";

/** Holt area_ids und house_ids des Users effizient */
function getUserScope(userId: string): { areaIds: string[]; houseIds: string[] } {
  // Direkte Bereiche + Team-Bereiche in einer Query
  const { rows: areaRows } = query<{ area_id: string }>(`
    SELECT area_id FROM user_areas WHERE user_id = $1
    UNION
    SELECT ta.area_id FROM team_areas ta
      JOIN users u ON u.team_id = ta.team_id
    WHERE u.id = $1
  `, [userId, userId]);

  const { rows: houseRows } = query<{ house_id: string }>(
    `SELECT house_id FROM user_houses WHERE user_id = $1`, [userId]
  );

  let areaIds = areaRows.map(r => r.area_id);

  // Fallback: user_stations (Altdaten vor Migration)
  if (areaIds.length === 0) {
    const { rows: stRows } = query<{ station_id: string }>(
      `SELECT station_id FROM user_stations WHERE user_id = $1`, [userId]
    );
    if (stRows.length > 0) {
      const ids = stRows.map(r => r.station_id);
      const ph = ids.map((_, i) => `$${i + 1}`).join(",");
      const { rows: aRows } = query<{ id: string }>(
        `SELECT id FROM areas WHERE id IN (${ph})`, ids
      );
      areaIds = aRows.map(r => r.id);
    }
  }

  return { areaIds, houseIds: houseRows.map(r => r.house_id) };
}

/**
 * Gibt area_ids zurück oder null (= Vollzugriff).
 * []  = kein Bereich zugewiesen → sieht nichts.
 * null = Vollzugriff (verwaltung oder reine Zentral-User).
 */
export function getAreaScope(userId: string, permissions: string[]): string[] | null {
  // Vollzugriff: Verwaltung und Techniker-Rollen arbeiten häuserweit
  const fullAccessPerms = ["verwaltung", "betten_reparatur", "bettenstamm", "betten_pw", "dashboard", "berichte"];
  if (permissions.some(p => fullAccessPerms.includes(p))) return null;

  const { areaIds, houseIds } = getUserScope(userId);
  if (areaIds.length > 0) return areaIds;

  if (houseIds.length > 0) {
    const ph = houseIds.map((_, i) => `$${i + 1}`).join(",");
    const { rows } = query<{ id: string }>(
      `SELECT id FROM areas WHERE house_id IN (${ph})`, houseIds
    );
    return rows.map(r => r.id);
  }

  // Reine Zentral-User brauchen keinen Bereichsscope
  const hasZentralOnly = permissions.includes("bettenaufbereitung_zentral") &&
    !permissions.some(p => ["bettenaufbereitung","zimmerreinigung","stationspersonal","dashboard","berichte"].includes(p));
  if (hasZentralOnly) return null;

  return [];
}

/** Alias für Rückwärtskompatibilität */
export function getStationScope(userId: string, permissions: string[]): string[] | null {
  return getAreaScope(userId, permissions);
}

export function getHouseScope(userId: string, permissions: string[]): string[] | null {
  const fullAccessPerms = ["verwaltung", "betten_reparatur", "bettenstamm", "betten_pw", "dashboard", "berichte"];
  if (permissions.some(p => fullAccessPerms.includes(p))) return null;
  const { areaIds, houseIds } = getUserScope(userId);
  if (areaIds.length > 0) return null;
  return houseIds.length > 0 ? houseIds : null;
}
