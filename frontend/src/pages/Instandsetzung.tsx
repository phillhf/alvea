import { useEffect, useState } from "react";
import { SkeletonList } from "../components/Skeleton";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useLastUpdated } from "../hooks/useLastUpdated";
import { LiveIndicator } from "../components/LiveIndicator";

interface Defect {
  id: string;
  title: string;
  severity: string;
  status: string;
  scanned_barcode: string | null;
  bed_number: string | null;
  bed_type_name: string | null;
  room_number: string | null;
  station_name: string | null;
  notes: string | null;
  reported_by_name: string | null;
  assigned_to_name: string | null;
  created_at: string;
  resolved_at: string | null;
}

const SEV_LABEL: Record<string, string> = {
  low: "Niedrig", medium: "Mittel", high: "Hoch", critical: "Kritisch",
  niedrig: "Niedrig", normal: "Mittel", hoch: "Hoch", kritisch: "Kritisch",
};
const SEV_COLOR: Record<string, string> = {
  low:      "bg-slate-100 text-slate-600",
  medium:   "bg-amber-100 text-amber-800",
  high:     "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700 font-semibold",
  niedrig:  "bg-slate-100 text-slate-600",
  normal:   "bg-amber-100 text-amber-800",
  hoch:     "bg-orange-100 text-orange-700",
  kritisch: "bg-red-100 text-red-700 font-semibold",
};
const ST_ICON: Record<string, string> = {
  gemeldet:     "🔔",
  in_reparatur: "🔧",
  behoben:      "✅",
  ausgemustert: "🗑",
};
const ST_LABEL: Record<string, string> = {
  gemeldet:     "Gemeldet",
  in_reparatur: "In Reparatur",
  behoben:      "Behoben",
  ausgemustert: "Ausgemustert",
};
const ST_COLOR: Record<string, string> = {
  gemeldet:     "bg-amber-100 text-amber-800",
  in_reparatur: "bg-blue-100 text-blue-800",
  behoben:      "bg-emerald-100 text-emerald-700",
  ausgemustert: "bg-slate-100 text-slate-500",
};

type Filter = "aktiv" | "behoben" | "alle";

function formatDate(iso: string) {
  return new Date(iso.replace(" ", "T") + "Z").toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

function standort(d: Defect): string {
  // Standort aus notes extrahieren falls vorhanden (Format: "Station: X | Standort: Y")
  if (d.notes) {
    const match = d.notes.match(/Standort:\s*(.+)/);
    if (match) return match[1].trim();
  }
  const parts = [
    d.station_name,
    d.room_number && `Zi. ${d.room_number}`,
    d.bed_number  && `Bett ${d.bed_number}`,
  ].filter(Boolean);
  return parts.join(" · ") || "–";
}

export default function Instandsetzung() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [filter, setFilter]   = useState<Filter>("aktiv");
  const [loading, setLoading] = useState(true);
  const { touch, label: updatedLabel } = useLastUpdated();

  async function load() {
    try {
      const r = await api.get<Defect[]>("/defects");
      setDefects(r.data);
    } catch { setDefects([]); }
    setLoading(false);
    touch();
  }

  useEffect(() => {
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  const filtered = defects.filter(d => {
    if (filter === "aktiv")  return ["gemeldet", "in_reparatur"].includes(d.status);
    if (filter === "behoben") return ["behoben", "ausgemustert"].includes(d.status);
    return true;
  });

  const counts = {
    aktiv:   defects.filter(d => ["gemeldet", "in_reparatur"].includes(d.status)).length,
    behoben: defects.filter(d => ["behoben", "ausgemustert"].includes(d.status)).length,
    alle:    defects.length,
  };

  if (loading) return <div className="p-4 space-y-3"><SkeletonList count={3} /></div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold">🔩 Instandsetzung</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-sm text-slate-500">Gemeldete Defekte – Reparaturübersicht</span>
            <LiveIndicator label={updatedLabel} />
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {([
          { key: "aktiv",   label: `Aktiv (${counts.aktiv})` },
          { key: "behoben", label: `Erledigt (${counts.behoben})` },
          { key: "alle",    label: `Alle (${counts.alle})` },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === key
                ? "bg-white shadow-sm text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tabelle */}
      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">
          <div className="text-4xl mb-3">✅</div>
          <div>{filter === "aktiv" ? "Keine offenen Defekte – alles in Ordnung." : "Keine Einträge."}</div>
        </div>
      ) : (
        <>
          {/* Desktop-Tabelle */}
          <div className="hidden md:block">
            <table className="w-full text-sm border-separate border-spacing-y-1.5">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="pb-1 pl-4 pr-4">Status</th>
                  <th className="pb-1 pr-4">Schwere</th>
                  <th className="pb-1 pr-4">Barcode / Bett</th>
                  <th className="pb-1 pr-4">Standort</th>
                  <th className="pb-1 pr-4">Defekt</th>
                  <th className="pb-1 pr-4">Bearbeiter</th>
                  <th className="pb-1 pr-4">Gemeldet</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id}
                    className={`bg-white shadow-sm hover:shadow-md cursor-pointer transition-shadow rounded-xl ${
                      d.severity === "critical" || d.severity === "kritisch" ? "border-l-4 border-red-400" :
                      d.severity === "high" || d.severity === "hoch" ? "border-l-4 border-orange-400" : ""
                    }`}
                    onClick={() => window.location.href = `/bed-defects/${d.id}`}>
                    <td className="py-3 pl-4 pr-4 rounded-l-xl">
                      <span className={`badge text-xs whitespace-nowrap ${ST_COLOR[d.status]}`}>
                        {ST_ICON[d.status]} {ST_LABEL[d.status]}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`badge text-xs ${SEV_COLOR[d.severity]}`}>
                        {SEV_LABEL[d.severity]}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {d.scanned_barcode
                        ? <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{d.scanned_barcode}</span>
                        : <span className="text-slate-300">–</span>
                      }
                      {d.bed_type_name && (
                        <div className="text-xs text-slate-400 mt-0.5">{d.bed_type_name}</div>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-600 text-xs max-w-[180px]">
                      {standort(d)}
                    </td>
                    <td className="py-3 pr-4 font-medium max-w-[200px]">
                      <span className="line-clamp-2">{d.title}</span>
                    </td>
                    <td className="py-3 pr-4 text-slate-500 text-xs">
                      {d.assigned_to_name ?? <span className="text-slate-300">–</span>}
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-400 whitespace-nowrap rounded-r-xl">
                      <div>{formatDate(d.created_at)}</div>
                      {d.reported_by_name && (
                        <div className="text-slate-300">{d.reported_by_name}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile-Karten */}
          <div className="md:hidden space-y-3">
            {filtered.map(d => (
              <Link key={d.id} to={`/bed-defects/${d.id}`}
                className={`card block hover:shadow-md transition-shadow ${
                  d.severity === "critical" || d.severity === "kritisch" ? "border-l-4 border-red-400" :
                  d.severity === "high" || d.severity === "hoch" ? "border-l-4 border-orange-400" : ""
                }`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex gap-2 flex-wrap">
                    <span className={`badge text-xs ${ST_COLOR[d.status]}`}>
                      {ST_ICON[d.status]} {ST_LABEL[d.status]}
                    </span>
                    <span className={`badge text-xs ${SEV_COLOR[d.severity]}`}>
                      {SEV_LABEL[d.severity]}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{formatDate(d.created_at)}</span>
                </div>
                <div className="font-semibold text-sm">{d.title}</div>
                <div className="text-xs text-slate-500 mt-1">{standort(d)}</div>
                {d.scanned_barcode && (
                  <div className="font-mono text-xs text-slate-400 mt-0.5">🏷 {d.scanned_barcode}</div>
                )}
                {d.assigned_to_name && (
                  <div className="text-xs text-slate-400 mt-1">👤 {d.assigned_to_name}</div>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
