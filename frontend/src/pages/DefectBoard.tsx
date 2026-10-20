import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useLastUpdated } from "../hooks/useLastUpdated";
import { LiveIndicator } from "../components/LiveIndicator";

interface Defect {
  id: string; title: string; severity: string; status: string;
  bed_number: string | null; room_number: string | null; station_name: string | null;
  scanned_barcode: string | null; reported_by_name: string | null;
  assigned_to_name: string | null; created_at: string;
}

const SEVERITY: Record<string, { label: string; color: string }> = {
  low:      { label: "Niedrig",  color: "bg-slate-100 text-slate-600" },
  medium:   { label: "Mittel",   color: "bg-amber-100 text-amber-700" },
  high:     { label: "Hoch",     color: "bg-orange-100 text-orange-700" },
  critical: { label: "Kritisch", color: "bg-red-100 text-red-700" },
};

const STATUS: Record<string, { label: string; color: string; icon: string }> = {
  gemeldet:     { label: "Gemeldet",     color: "bg-amber-100 text-amber-800",    icon: "🔔" },
  in_reparatur: { label: "In Reparatur", color: "bg-blue-100 text-blue-800",      icon: "🔧" },
  behoben:      { label: "Behoben",      color: "bg-emerald-100 text-emerald-700", icon: "✅" },
  ausgemustert: { label: "Ausgemustert", color: "bg-slate-100 text-slate-500",    icon: "🗑" },
};

export default function DefectBoard() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [filter, setFilter]   = useState<"alle" | "offen" | "reparatur" | "abgeschlossen">("offen");
  const [loading, setLoading] = useState(true);
  const { touch, label: updatedLabel } = useLastUpdated();

  async function load() {
    const r = await api.get<Defect[]>("/defects");
    setDefects(r.data);
    setLoading(false);
    touch();
  }

  useEffect(() => {
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  const filtered = defects.filter((d) => {
    if (filter === "offen")         return d.status === "gemeldet";
    if (filter === "reparatur")     return d.status === "in_reparatur";
    if (filter === "abgeschlossen") return ["behoben", "ausgemustert"].includes(d.status);
    return true;
  });

  const counts = {
    offen:         defects.filter(d => d.status === "gemeldet").length,
    reparatur:     defects.filter(d => d.status === "in_reparatur").length,
    abgeschlossen: defects.filter(d => ["behoben", "ausgemustert"].includes(d.status)).length,
  };

  if (loading) return <div className="text-slate-400">Wird geladen…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link to="/bed-defects" className="text-sm text-slate-500 hover:underline">
            ← Betten-Reparatur
          </Link>
          <h1 className="font-display text-2xl font-bold mt-1">📋 Alle Defekte</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-sm text-slate-500">Gesamtübersicht aller Defektmeldungen</span>
            <LiveIndicator label={updatedLabel} />
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit flex-wrap">
        {([
          { key: "offen",         label: `🔔 Gemeldet (${counts.offen})` },
          { key: "reparatur",     label: `🔧 In Reparatur (${counts.reparatur})` },
          { key: "abgeschlossen", label: `✅ Erledigt (${counts.abgeschlossen})` },
          { key: "alle",          label: `Alle (${defects.length})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === key ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <div className="text-4xl mb-3">🔧</div>
          <div>
            {filter === "offen" ? "Keine offenen Defektmeldungen." :
             filter === "reparatur" ? "Keine Reparaturen aktiv." :
             "Keine abgeschlossenen Meldungen."}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const sev = SEVERITY[d.severity] ?? { label: d.severity, color: "bg-slate-100 text-slate-600" };
            const st  = STATUS[d.status]    ?? { label: d.status,    color: "bg-slate-100 text-slate-600", icon: "?" };
            return (
              <Link
                key={d.id}
                to={`/bed-defects/${d.id}`}
                className={`card hover:shadow-md transition-shadow block ${
                  d.severity === "critical" ? "border-l-4 border-red-400" :
                  d.severity === "high"     ? "border-l-4 border-orange-400" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`badge text-xs ${st.color}`}>{st.icon} {st.label}</span>
                      <span className={`badge text-xs ${sev.color}`}>{sev.label}</span>
                      {d.scanned_barcode && (
                        <span className="font-mono text-xs text-slate-400">{d.scanned_barcode}</span>
                      )}
                    </div>
                    <div className="font-semibold">{d.title}</div>
                    <div className="text-sm text-slate-500 mt-0.5">
                      {d.station_name && d.station_name}
                      {d.room_number  && ` · Zi. ${d.room_number}`}
                      {d.bed_number   && ` · Bett ${d.bed_number}`}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {d.reported_by_name && `Gemeldet von: ${d.reported_by_name}`}
                      {d.assigned_to_name && ` · Bearbeiter: ${d.assigned_to_name}`}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 shrink-0">
                    {new Date(d.created_at.replace(" ", "T") + "Z")
                      .toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
