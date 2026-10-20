import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthedRequest, JwtPayload, Permission } from "../types";

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET === "dev-secret") {
  require("../services/logger").logger.warn("[SECURITY] JWT_SECRET ist nicht gesetzt oder unsicher!");
} else if (SECRET.length < 32) {
  require("../services/logger").logger.warn("[SECURITY] JWT_SECRET ist zu kurz – bitte längeren Zufallswert verwenden");
}
const JWT_SECRET = SECRET || "dev-secret";

export function authRequired(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  // Token aus Authorization-Header oder Query-Parameter (?token=...) akzeptieren
  const raw = header?.startsWith("Bearer ") ? header.slice(7) : (req.query.token as string | undefined);
  if (!raw) return res.status(401).json({ error: "missing_token" });
  try {
    const payload = jwt.verify(raw, JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

export function requirePermission(...perms: Permission[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "unauthenticated" });
    const has = perms.some(p => req.user!.permissions.includes(p));
    if (!has) return res.status(403).json({ error: "forbidden" });
    next();
  };
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "12h",
  } as jwt.SignOptions);
}
