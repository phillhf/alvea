import { APIRequestContext } from "@playwright/test";
import fs from "fs";
import path from "path";

const AUTH_DIR = path.join(__dirname, "..", ".auth");

/** Gespeicherter, angemeldeter Browser-Zustand je Rolle */
export const asRole = (role: "admin" | "pflege" | "reinigung") => path.join(AUTH_DIR, `${role}.json`);

export function world(): { station1A: string; station2B: string; tokens: Record<"admin" | "pflege" | "reinigung", string> } {
  return JSON.parse(fs.readFileSync(path.join(AUTH_DIR, "world.json"), "utf-8"));
}

export function auth(role: "admin" | "pflege" | "reinigung") {
  return { Authorization: `Bearer ${world().tokens[role]}` };
}

/** Nächstes freies Bett einer Teststation (Tests legen Aufträge an und belegen Betten) */
export async function freeBed(request: APIRequestContext, stationId: string) {
  const res = await request.get(`/api/beds?station_id=${stationId}`, { headers: auth("admin") });
  const beds: any[] = await res.json();
  const bed = beds.find(b => b.status === "frei");
  if (!bed) throw new Error("Kein freies Bett mehr in der Teststation");
  return bed as { id: string; bed_number: string; room_number: string };
}
