import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../api/client";

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
  | "verwaltung";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role_name: string;
  permissions: Permission[];
  station_name?: string | null;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  can: (perm: Permission) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.permissions)) parsed.permissions = [];
        setUser(parsed);
      } catch { /* noop */ }
    }
    setLoading(false);
  }, []);

  // Permissions alle 5 Minuten im Hintergrund aktualisieren
  useEffect(() => {
    if (!user) return;
    async function refreshPermissions() {
      try {
        const { data } = await api.get("/users/me");
        if (data?.permissions) {
          setUser(prev => {
            if (!prev) return prev;
            const updated = { ...prev, permissions: data.permissions };
            localStorage.setItem("user", JSON.stringify(updated));
            return updated;
          });
        }
      } catch { /* Token abgelaufen o.ä. – ignorieren */ }
    }
    const t = setInterval(refreshPermissions, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [!!user]);

  function can(perm: Permission): boolean {
    if (!user?.permissions) return false;
    return user.permissions.includes(perm);
  }

  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }

  return <Ctx.Provider value={{ user, loading, can, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
