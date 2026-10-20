import { Request } from "express";

export type Permission =
  | "bettenaufbereitung"
  | "bettenaufbereitung_zentral"
  | "zimmerreinigung"
  | "berichte"
  | "auftraege_erstellen"
  | "dashboard"
  | "sauerstofftransport"
  | "lager"
  | "betten_reparatur"
  | "stationspersonal"
  | "bettenstamm"
  | "betten_pw"
  | "meldungen"
  | "raumbuch"
  | "benutzerverwaltung"
  | "spindverwaltung"
  | "waesche"
  | "chat"
  | "raumbuchung"
  | "raumbuchung_stellvertretung"
  | "raumbuchungsadmin"
  | "verwaltung";

export const ALL_PERMISSIONS: Permission[] = [
  "bettenaufbereitung",
  "bettenaufbereitung_zentral",
  "zimmerreinigung",
  "berichte",
  "dashboard",
  "sauerstofftransport",
  "lager",
  "betten_reparatur",
  "bettenstamm",
  "betten_pw",
  "meldungen",
  "raumbuch",
  "benutzerverwaltung",
  "spindverwaltung",
  "waesche",
  "chat",
  "raumbuchung",
  "raumbuchung_stellvertretung",
  "raumbuchungsadmin",
  "stationspersonal",
  "auftraege_erstellen",
  "verwaltung",
];

export interface JwtPayload {
  sub: string;
  email: string;
  role_name: string;
  permissions: Permission[];
}

export interface AuthedRequest extends Request {
  user?: JwtPayload;
}
