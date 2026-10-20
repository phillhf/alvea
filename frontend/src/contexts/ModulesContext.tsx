import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../api/client";
import { useAuth } from "./AuthContext";

export interface Module {
  key:         string;
  name:        string;
  icon:        string;
  active:      boolean;
  sort_order:  number;
  description: string;
}

interface ModulesCtx {
  modules:    Module[];
  isActive:   (key: string) => boolean;
  loading:    boolean;
  reload:     () => void;
}

const Ctx = createContext<ModulesCtx>({
  modules: [], isActive: () => false, loading: true, reload: () => {},
});

export function ModulesProvider({ children }: { children: ReactNode }) {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();

  function load() {
    setLoading(true);
    api.get<Module[]>("/modules").then((r) => {
      setModules(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  // Bei jedem An-/Abmelden neu laden – vor dem Login liefert die API nichts,
  // sonst gälten nach dem Login bis zum Neuladen der Seite alle Module als aus.
  useEffect(() => {
    if (user) load();
    else { setModules([]); setLoading(false); }
  }, [user?.id]);

  // SQLite liefert 0/1 – immer echten boolean zurückgeben (sonst rendert React "0")
  const isActive = (key: string) =>
    !!modules.find((m) => m.key === key)?.active;

  return (
    <Ctx.Provider value={{ modules, isActive, loading, reload: load }}>
      {children}
    </Ctx.Provider>
  );
}

export function useModules() { return useContext(Ctx); }

// Hilfsfunktion: gibt true zurück wenn Modul aktiv ODER noch lädt (fail-open)
export function useIsActive(key: string): boolean {
  const { modules, loading } = useContext(Ctx);
  if (loading) return true; // während des Ladens alle Module anzeigen
  return !!modules.find((m) => m.key === key)?.active;
}
