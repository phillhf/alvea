import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useModules } from "../../contexts/ModulesContext";

interface Module {
  key: string; name: string; icon: string;
  description: string; active: boolean; sort_order: number;
}

const CORE_MODULES = ["auth", "raumbuch", "benutzerverwaltung", "bettenstamm_core"];

function ModulesTab() {
  const [modules, setModules] = useState<Module[]>([]);
  const [busy, setBusy]       = useState<string | null>(null);
  const { reload }            = useModules();

  useEffect(() => {
    api.get<Module[]>("/modules").then((r) => setModules(r.data));
  }, []);

  async function toggle(key: string, current: boolean) {
    setBusy(key);
    try {
      await api.patch(`/modules/${key}`, { active: !current });
      setModules((ms) => ms.map((m) => m.key === key ? { ...m, active: !current } : m));
      reload();
    } finally { setBusy(null); }
  }

  const core     = modules.filter((m) => CORE_MODULES.includes(m.key));
  const active   = modules.filter((m) => !CORE_MODULES.includes(m.key) && m.active);
  const inactive = modules.filter((m) => !CORE_MODULES.includes(m.key) && !m.active);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold">Module verwalten</h2>
        <p className="text-sm text-slate-500 mt-1">
          Aktiviere oder deaktiviere Module für diese Installation. Die Navigation passt sich automatisch an.
        </p>
      </div>

      {/* Kernmodule */}
      {core.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-500 mb-2">🔒 Kernmodule – immer aktiv</h3>
          <div className="space-y-2">
            {core.map((m) => (
              <div key={m.key} className="card !p-4 flex items-center gap-4 border-l-4 border-slate-300 bg-slate-50 opacity-80">
                <span className="text-2xl">{m.icon}</span>
                <div className="flex-1">
                  <div className="font-semibold text-slate-700">{m.name}</div>
                  <div className="text-sm text-slate-400">{m.description}</div>
                </div>
                <span className="text-xs text-slate-400 bg-slate-200 px-2 py-1 rounded-full font-medium">
                  🔒 Kernmodul
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Aktive optionale Module */}
      {active.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-emerald-700 mb-2">✅ Aktive Module ({active.length})</h3>
          <div className="space-y-2">
            {active.map((m) => (
              <div key={m.key} className="card !p-4 flex items-center gap-4 border-l-4 border-emerald-400">
                <span className="text-2xl">{m.icon}</span>
                <div className="flex-1">
                  <div className="font-semibold">{m.name}</div>
                  <div className="text-sm text-slate-500">{m.description}</div>
                </div>
                <button
                  className="btn-ghost !px-3 !py-1.5 text-sm text-red-600 hover:bg-red-50"
                  disabled={busy === m.key}
                  onClick={() => toggle(m.key, m.active)}
                >
                  Deaktivieren
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Inaktive optionale Module */}
      {inactive.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-500 mb-2">⭕ Inaktive Module ({inactive.length})</h3>
          <div className="space-y-2">
            {inactive.map((m) => (
              <div key={m.key} className="card !p-4 flex items-center gap-4 opacity-70">
                <span className="text-2xl grayscale">{m.icon}</span>
                <div className="flex-1">
                  <div className="font-semibold text-slate-600">{m.name}</div>
                  <div className="text-sm text-slate-400">{m.description}</div>
                </div>
                <button
                  className="btn-primary !px-3 !py-1.5 text-sm"
                  disabled={busy === m.key}
                  onClick={() => toggle(m.key, m.active)}
                >
                  Aktivieren
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default ModulesTab;
