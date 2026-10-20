import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../services/logger";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "not_found" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    const isProd = process.env.NODE_ENV === "production";
    return res.status(400).json({
      error: "validation",
      details: isProd ? undefined : err.errors,
    });
  }
  // eslint-disable-next-line no-console
  logger.error("Unbehandelter Fehler", { error: err instanceof Error ? err.message : String(err) });
  // In Produktion keine internen Fehlermeldungen an den Client
  const isProd = process.env.NODE_ENV === "production";
  const msg = isProd ? "internal_error" : (err instanceof Error ? err.message : "internal_error");
  res.status(500).json({ error: msg });
}
