import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface AuditEntry {
  id: string; action: string; entity: string; entity_id: string|null;
  meta: string|null; created_at: string;
  user_name: string|null; user_email: string|null;
}

const ENTITY_ICONS: Record<string, string> = {
  user:          "👤",
  task:          "🛏",
  ruecksendung:  "📦",
  o2_anfrage:    "💨",
  o2_flasche:    "🫙",
  checklist_template: "📋",
  aufbereitungsart:   "🔬",
};

const ACTION_COLOR: Record<string, string> = {
  create:          "bg-green-100 text-green-800",
  update:          "bg-blue-100 text-blue-800",
  delete:          "bg-red-100 text-red-800",
  login:           "bg-slate-100 text-slate-600",
  claim:           "bg-violet-100 text-violet-800",
  release:         "bg-amber-100 text-amber-800",
  angenommen:      "bg-blue-100 text-blue-800",
  geliefert:       "bg-green-100 text-green-800",
  abgeschlossen:   "bg-green-100 text-green-800",
  wareneingang:    "bg-green-100 text-green-800",
  wareneingang_neu:"bg-emerald-100 text-emerald-800",
  change_password: "bg-amber-100 text-amber-800",
};

export default function AuditLogTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState("");
  const [action, setAction]         = useState("");

  const ENTITY_TYPES = ["user","task","ruecksendung","o2_anfrage","o2_flasche","checklist_template","aufbereitungsart"];
  const ACTIONS      = ["create","update","delete","login","claim","release","angenommen","geliefert","abgeschlossen","wareneingang","change_password"];

  useEffect(() => { load(); }, [entityType, action]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (entityType) params.set("entity", entityType);
      if (action)     params.set("action", action);
      const r = await api.get<AuditEntry[]>(`/audit-log?${params}`);
      setEntries(r.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  function parseDetails(raw: string|null): string {
    if (!raw) return "";
    try {
      const obj = JSON.parse(raw);
      return Object.entries(obj)
        .filter(([,v]) => v !== null && v !== undefined && v !== "")
        .map(([k,v]) => `${k}: ${v}`)
        .join(" · ");
    } catch { return raw; }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Audit-Log</h2>
      <p className="text-sm text-slate-500">Protokoll aller relevanten Aktionen im System (letzte 200).</p>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        <select value={entityType} onChange={e => setEntityType(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
          <option value="">Alle Bereiche</option>
          {ENTITY_TYPES.map(t => <option key={t} value={t}>{ENTITY_ICONS[t] ?? "·"} {t}</option>)}
        </select>
        <select value={action} onChange={e => setAction(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
          <option value="">Alle Aktionen</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={load} className="px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-200 text-slate-500 hover:bg-slate-50">
          🔄 Aktualisieren
        </button>
        <span className="ml-auto text-xs text-slate-400 self-center">{entries.length} Einträge</span>
      </div>

      {loading && <p className="text-sm text-slate-400 py-4 text-center">Lädt…</p>}

      <div className="space-y-1">
        {entries.map(e => (
          <div key={e.id} className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 flex items-start gap-3">
            <span className="text-lg shrink-0 mt-0.5">{ENTITY_ICONS[e.entity] ?? "📝"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLOR[e.action] ?? "bg-slate-100 text-slate-600"}`}>
                  {e.action}
                </span>
                <span className="text-xs text-slate-500">{e.entity}</span>
                {e.entity_id && <span className="text-xs text-slate-400 font-mono truncate max-w-[120px]">{e.entity_id}</span>}
              </div>
              {parseDetails(e.meta) && (
                <p className="text-xs text-slate-500 mt-0.5 truncate">{parseDetails(e.meta)}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-medium text-slate-700">{e.user_name ?? "System"}</p>
              <p className="text-xs text-slate-400">{new Date(e.created_at).toLocaleString("de-DE")}</p>
            </div>
          </div>
        ))}
        {!loading && entries.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">Keine Einträge.</p>
        )}
      </div>
    </div>
  );
}
