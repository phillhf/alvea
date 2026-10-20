import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../config/db";
import { signToken, authRequired } from "../middleware/auth";
import { authLogger } from "../services/logger";
import { audit } from "../services/audit";
import { AuthedRequest, Permission } from "../types";

const router = Router();

const loginSchema = z.object({
  email: z.string().min(3).max(255),
  password: z.string().min(1),
});

function getUserPermissions(userId: string): Permission[] {
  const { rows } = query<{ permissions: string }>(
    `SELECT r.permissions FROM roles r
     JOIN users u ON u.role_id = r.id
     WHERE u.id = $1`, [userId]
  );
  if (!rows[0]) return [];
  try {
    return JSON.parse(rows[0].permissions) as Permission[];
  } catch { return []; }
}

router.post("/login", async (req: Request, res: Response) => {
  let email: string, password: string;
  try {
    ({ email, password } = loginSchema.parse(req.body));
  } catch {
    return res.status(400).json({ error: "Ungültige E-Mail-Adresse oder Passwort." });
  }
  const { rows } = query<{
    id: string; email: string; password_hash: string;
    full_name: string; active: number; role_id: string | null; role_name: string | null;
    station_name: string | null;
  }>(
    `SELECT u.id, u.email, u.password_hash, u.full_name, u.active,
            u.role_id, r.name AS role_name,
            (SELECT COALESCE(a.bezeichnung, a.name) FROM user_areas ua
             JOIN areas a ON a.id = ua.area_id
             WHERE ua.user_id = u.id LIMIT 1) AS station_name
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.email = $1`,
    [email]
  );
  const user = rows[0];
  // bcrypt.compare immer ausführen – verhindert Timing-Angriffe zur Account-Enumeration
  const DUMMY_HASH = "$2b$12$invalidhashpaddingtomatch.bcryptlengthXXXXXXXXXXXXXXXXXX";
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || user.active !== 1 || !ok) {
    authLogger.warn("Login fehlgeschlagen", { email });
    return res.status(401).json({ error: "invalid_credentials" });
  }
  authLogger.info("Login erfolgreich", { email, userId: user.id });

  const permissions = getUserPermissions(user.id);
  const token = signToken({
    sub: user.id, email: user.email,
    role_name: user.role_name ?? "–",
    permissions,
  });
  audit(user.id, "login", "user", user.id);
  res.json({
    token,
    user: {
      id: user.id, email: user.email, full_name: user.full_name,
      role_name: user.role_name ?? "–", permissions,
      station_name: user.station_name ?? null,
    },
  });
});

// Me endpoint
router.get("/me", authRequired, (req: AuthedRequest, res) => {
  const permissions = getUserPermissions(req.user!.sub);
  res.json({ ...req.user, permissions });
});

export { getUserPermissions };
export default router;
