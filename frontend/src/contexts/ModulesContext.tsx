import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../api/client";

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

  function load() {
    api.get<Module[]>("/modules").then((r) => {
      setModules(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const isActive = (key: string) =>
    modules.find((m) => m.key === key)?.active ?? false;

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
  return modules.find((m) => m.key === key)?.active ?? false;
}
