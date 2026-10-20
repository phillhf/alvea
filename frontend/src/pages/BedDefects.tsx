import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useLastUpdated } from "../hooks/useLastUpdated";
import { LiveIndicator } from "../components/LiveIndicator";

interface Station {
  id: string;
  name: string;
  area_name: string;
  house_name: string;
  open_defects: number;
  active_defects: number;
}

export default function BedDefects() {
  const { can } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const { touch, label: updatedLabel } = useLastUpdated();

  async function load() {
    const r = await api.get<Station[]>("/defects/stations");
    setStations(r.data);
    setLoading(false);
    touch();
  }

  useEffect(() => {
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  if (loading) return <div className="text-slate-400">Wird geladen…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold">🔧 Defektes Bett melden</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-sm text-slate-500">Station wählen → Bett antippen → Defekt melden</span>
            <LiveIndicator label={updatedLabel} />
          </div>
        </div>
        {(can("betten_reparatur") || can("verwaltung")) && (
          <Link to="/bed-defects/board" className="btn-ghost text-sm">
            📋 Alle Defekte verwalten
          </Link>
        )}
      </div>

      {stations.length === 0 ? (
        <div className="card text-center py-10 text-slate-400">
          <div className="text-4xl mb-3">🏥</div>
          <div>Keine Stationen zugewiesen.</div>
          <div className="text-sm mt-1">Bitte den Administrator kontaktieren.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {stations.map((s) => {
            const hasIssues = s.open_defects > 0 || s.active_defects > 0;
            return (
              <Link
                key={s.id}
                to={`/bed-defects/station/${s.id}`}
                state={{ stationName: s.name }}
                className={`card hover:shadow-md transition-shadow block ${
                  s.open_defects > 0 ? "border-l-4 border-amber-400" :
                  s.active_defects > 0 ? "border-l-4 border-blue-400" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-sm text-slate-500">{s.area_name} · {s.house_name}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s.open_defects > 0 && (
                      <span className="badge bg-amber-100 text-amber-800">
                        🔔 {s.open_defects} offen
                      </span>
                    )}
                    {s.active_defects > 0 && (
                      <span className="badge bg-blue-100 text-blue-800">
                        🔧 {s.active_defects} in Reparatur
                      </span>
                    )}
                    {!hasIssues && (
                      <span className="badge bg-slate-100 text-slate-500">✓ Kein Defekt</span>
                    )}
                    <span className="text-slate-300 text-lg">›</span>
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
