import { Request, Response, NextFunction } from "express";
import { httpLogger } from "../services/logger";

// Sensitive Pfade die nicht geloggt werden (Passwörter etc.)
const SKIP_BODY_PATHS = ["/api/auth/login", "/api/users/me/password"];

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? "error"
                : res.statusCode >= 400 ? "warn"
                : "debug";

    httpLogger[level](`${req.method} ${req.path}`, {
      method:   req.method,
      path:     req.path,
      status:   res.statusCode,
      duration: `${duration}ms`,
      ip:       req.ip,
    });
  });

  next();
}
